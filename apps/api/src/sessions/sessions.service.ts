import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Prisma, type Session, MediaType, MsgStatus, SessionMode, SessionStatus } from '@prisma/client';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { PrismaService } from '../common/prisma/prisma.service';
import { FingerprintService } from '../antiban/fingerprint.service';
import { ProxyService } from '../antiban/proxy.service';
import { ContactsService } from '../contacts/contacts.service';
import { MediaService } from '../media/media.service';
import { makeDbAuthState } from './baileys/db-auth-state';
import { deriveKey } from './baileys/auth-cipher';
import { buildFetchAgent } from './baileys/build-fetch-agent';
import { type ConnectSessionDto } from './dto/connect-session.dto';
import { type CreateSessionDto } from './dto/create-session.dto';
import { SessionsGateway } from './sessions.gateway';

@Injectable()
export class SessionsService implements OnModuleInit, OnModuleDestroy {
  private readonly sockets = new Map<string, ReturnType<typeof makeWASocket>>();
  private readonly intentionalDisconnects = new Set<string>();
  private readonly startingSocket = new Set<string>(); // guard against concurrent startSocket calls
  private readonly reconnectDelays = new Map<string, number>(); // tracks per-session backoff delay (ms)
  private readonly log = new Logger(SessionsService.name);
  private readonly encKey: Buffer;
  private readonly dryRun: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: SessionsGateway,
    private readonly fingerprint: FingerprintService,
    private readonly proxy: ProxyService,
    private readonly contactsService: ContactsService,
    private readonly media: MediaService,
    config: ConfigService,
  ) {
    this.encKey = deriveKey(config.getOrThrow<string>('SESSION_ENCRYPTION_KEY'));
    this.dryRun = config.get<string>('DRY_RUN') === 'true';
  }

  async onModuleInit(): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: {
        mode: SessionMode.BAILEYS,
        status: { in: [SessionStatus.ONLINE, SessionStatus.CONNECTING] },
      },
    });
    for (const session of sessions) {
      // Only restore sessions that have a phone number — meaning they previously
      // completed the QR scan and connected. Sessions without a phone number were
      // never authenticated; restoring them would cause an infinite reconnect loop.
      if (!session.phoneNumber) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: { status: SessionStatus.OFFLINE },
        });
        this.log.log(`Session ${session.id} reset to OFFLINE (never authenticated)`);
        continue;
      }
      await this.prisma.session.update({
        where: { id: session.id },
        data: { status: SessionStatus.CONNECTING },
      });
      void this.startSocket(session.id).catch((err: unknown) =>
        this.log.error(`Failed to restore session ${session.id}: ${String(err)}`),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const [id, sock] of this.sockets.entries()) {
      this.intentionalDisconnects.add(id);
      try { sock.end(undefined); } catch { /* ignore */ }
    }
    this.sockets.clear();
  }

  async createSession(dto: CreateSessionDto): Promise<Omit<Session, 'authState'>> {
    const session = await this.prisma.session.create({
      data: {
        label: dto.label,
        mode: dto.mode,
        phoneNumber: dto.phoneNumber,
        ...(dto.cloudApi !== undefined
          ? { cloudApi: dto.cloudApi as Prisma.InputJsonValue }
          : {}),
        // Cloud API sessions need no WebSocket handshake — credentials are in env vars.
        // Set ONLINE immediately so campaigns can be launched against them right away.
        ...(dto.mode === SessionMode.CLOUD_API && { status: SessionStatus.ONLINE }),
      },
    });
    const { authState: _auth, ...safe } = session;
    return safe;
  }

  async listSessions(): Promise<Omit<Session, 'authState'>[]> {
    const sessions = await this.prisma.session.findMany({ orderBy: { createdAt: 'desc' } });
    return sessions.map(({ authState: _auth, ...safe }) => safe);
  }

  async deleteSession(id: string): Promise<void> {
    const exists = await this.prisma.session.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`Session ${id} not found`);
    const sock = this.sockets.get(id);
    if (sock) {
      this.intentionalDisconnects.add(id);
      this.sockets.delete(id);
      this.reconnectDelays.delete(id);
      this.startingSocket.delete(id);
      void sock.logout().catch(() => undefined);
    } else {
      // Socket may never have been started; still clear any pending reconnect state
      this.reconnectDelays.delete(id);
      this.startingSocket.delete(id);
    }
    // Layer 4: release proxy before removing the session record
    await this.proxy.releaseProxy(id);
    try {
      await this.prisma.session.delete({ where: { id } });
    } catch (e: unknown) {
      // P2025 = record not found; concurrent delete is idempotent
      if ((e as { code?: string }).code === 'P2025') return;
      throw e;
    }
  }

  async disconnectSession(id: string): Promise<void> {
    const sock = this.sockets.get(id);
    if (sock) {
      this.intentionalDisconnects.add(id);
      this.sockets.delete(id);
      try { sock.end(undefined); } catch { /* ignore */ }
    }
    await this.setStatus(id, SessionStatus.OFFLINE);
  }

  async getHealth(id: string): Promise<{ status: string; phoneNumber: string | null }> {
    const session = await this.prisma.session.findUniqueOrThrow({ where: { id } });
    return { status: session.status, phoneNumber: session.phoneNumber };
  }

  async connect(
    id: string,
    dto: ConnectSessionDto,
  ): Promise<{ method: string; code?: string }> {
    const session = await this.prisma.session.findUniqueOrThrow({ where: { id } });
    if (session.mode !== SessionMode.BAILEYS) {
      throw new BadRequestException('Only BAILEYS sessions support this endpoint');
    }

    if (!this.sockets.has(id) && !this.startingSocket.has(id)) {
      this.startingSocket.add(id);
      void this.startSocket(id)
        .catch((err: unknown) =>
          this.log.error(`startSocket error [${id}]: ${String(err)}`),
        )
        .finally(() => this.startingSocket.delete(id));
      // Give the socket time to establish before requesting pairing code
      await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
    }

    if (dto.method === 'pairing') {
      if (!dto.phone) {
        throw new BadRequestException('phone is required for pairing code method');
      }
      const sock = this.sockets.get(id);
      if (!sock) throw new BadRequestException('Socket not yet initialized; retry in a moment');
      const phone = dto.phone.replace(/\D/g, '');
      const code = await sock.requestPairingCode(phone);
      return { method: 'pairing', code };
    }

    return { method: 'qr' };
  }

  private async startSocket(sessionId: string): Promise<void> {
    const { state, saveCreds } = await makeDbAuthState(this.prisma, sessionId, this.encKey);
    const pinoLogger = pino({ level: 'silent' });

    await this.setStatus(sessionId, SessionStatus.CONNECTING);

    // Fetch current WA Web version — avoids 405 rejection from stale hardcoded version
    // 5-second timeout + fallback guards against network blips on server restart
    const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1018547872];
    let version: [number, number, number];
    try {
      const fetched = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5_000),
        ),
      ]);
      version = fetched.version;
    } catch (err) {
      this.log.warn(
        `[${sessionId}] fetchLatestBaileysVersion failed (${String(err)}) — using fallback ${FALLBACK_VERSION.join('.')}`,
      );
      version = FALLBACK_VERSION;
    }
    this.log.log(`[${sessionId}] WA version: ${version.join('.')}`);

    // Layer 3: assign (or re-use existing) device fingerprint
    const fp = await this.fingerprint.assignFingerprint(sessionId);

    // Layer 4: assign proxy from pool (null → connect without proxy)
    const proxyConfig = await this.proxy.assignProxy(sessionId);
    if (proxyConfig) {
      this.log.debug(`[${sessionId}] proxy: ${proxyConfig.host}:${proxyConfig.port}`);
    }

    const rawAgent = buildFetchAgent(proxyConfig);
    // Cast is safe: HttpsProxyAgent / SocksProxyAgent extend http.Agent at runtime;
    // Baileys declares the option as https.Agent which is a strict TypeScript supertype.
    const proxyAgent = rawAgent as unknown as import('https').Agent | undefined;

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      // browser tuple: [platform, browserName, browserVersion]
      // iOS devices must use Safari — iOS prohibits non-WebKit browsers, so Chrome would be a detection signal.
      browser: [fp.deviceModel, fp.osVersion.startsWith('iOS') ? 'Safari' : 'Chrome', fp.osVersion.startsWith('iOS') ? '17.4.1' : '136.0.0'] as [string, string, string],
      logger: pinoLogger,
      getMessage: async () => undefined,
      // Suppress automatic "online" broadcast on connect — real phones only show online
      // when the user actively opens the app, not on every background reconnect.
      markOnlineOnConnect: false,
      // Route all Baileys WebSocket + HTTP traffic through the assigned proxy (Layer 4)
      ...(proxyAgent ? { agent: proxyAgent, fetchAgent: proxyAgent } : {}),
    });

    this.sockets.set(sessionId, sock);

    sock.ev.on('creds.update', () => {
      void saveCreds().catch((err: unknown) =>
        this.log.error(`creds save failed [${sessionId}]: ${String(err)}`),
      );
    });

    sock.ev.on('connection.update', (update) => {
      void this.handleConnectionUpdate(sessionId, sock, update).catch((err: unknown) =>
        this.log.error(`connection.update error [${sessionId}]: ${String(err)}`),
      );
    });

    sock.ev.on('contacts.upsert', (baileysContacts) => {
      const toSync = baileysContacts
        .filter((c) => c.id && c.id.endsWith('@s.whatsapp.net'))
        .map((c) => ({
          // Strip device suffix (:15) before stripping non-digits — same as messages.upsert handler
          phone: '+' + c.id.replace('@s.whatsapp.net', '').split(':')[0]!.replace(/\D/g, ''),
          name: c.name ?? c.notify ?? undefined,
        }));
      if (toSync.length > 0) {
        void this.contactsService.upsertFromWhatsApp(toSync).then(({ imported }) => {
          this.log.log(`[${sessionId}] synced ${imported} WA contacts`);
        }).catch((err: unknown) =>
          this.log.error(`contacts sync error [${sessionId}]: ${String(err)}`),
        );
      }
    });

    sock.ev.on('messages.upsert', ({ messages: inbound, type }) => {
      if (type !== 'notify') return;
      for (const msg of inbound) {
        // Skip messages we sent ourselves
        if (msg.key.fromMe) continue;
        const jid = msg.key.remoteJid;
        if (!jid || !jid.endsWith('@s.whatsapp.net')) continue;
        // Strip device suffix (:15) that appears in multi-device JIDs
        const rawPhone = jid.replace('@s.whatsapp.net', '').split(':')[0]!;
        const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;
        const text =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text ??
          null;
        if (!text) continue;
        void this.handleInboundMessage(sessionId, phone, text).catch((err: unknown) =>
          this.log.error(`inbound message error [${sessionId}]: ${String(err)}`),
        );
      }
    });

    // Track delivery and read receipts for our outbound messages
    sock.ev.on('messages.update', (updates) => {
      for (const { key, update } of updates) {
        if (!key.fromMe) continue;
        const status = (update as { status?: number }).status;
        if (status !== 3 && status !== 4) continue; // 3=DELIVERED, 4=READ
        const jid = key.remoteJid;
        if (!jid?.endsWith('@s.whatsapp.net')) continue;
        const rawPhone = jid.replace('@s.whatsapp.net', '').split(':')[0]!;
        const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;
        if (status === 3) {
          void this.handleMessageDelivered(sessionId, phone).catch((err: unknown) =>
            this.log.error(`delivered-receipt error [${sessionId}]: ${String(err)}`),
          );
        } else {
          void this.handleMessageRead(sessionId, phone).catch((err: unknown) =>
            this.log.error(`read-receipt error [${sessionId}]: ${String(err)}`),
          );
        }
      }
    });
  }

  private async handleInboundMessage(
    sessionId: string,
    phone: string,
    text: string,
  ): Promise<void> {
    const contact = await this.prisma.contact.findUnique({ where: { phone } });
    if (!contact) {
      this.log.warn(`[${sessionId}] inbound from unknown phone=${phone} — skipping`);
      return;
    }

    const lastMsg = await this.prisma.campaignMessage.findFirst({
      where: {
        contactId: contact.id,
        sessionId,
        status: { in: [MsgStatus.SENT, MsgStatus.DELIVERED, MsgStatus.READ] },
      },
      orderBy: { sentAt: 'desc' },
    });

    await this.prisma.reply.create({
      data: {
        contactId: contact.id,
        campaignId: lastMsg?.campaignId ?? null,
        text,
      },
    });

    if (lastMsg) {
      await this.prisma.campaignMessage.update({
        where: { id: lastMsg.id },
        data: { status: MsgStatus.REPLIED },
      });
    }

    // Auto-invalidate contacts who signal opt-out — prevents continued sending after STOP
    const lowerText = text.toLowerCase();
    // Short keywords must match the WHOLE message — tokenising on word boundaries still
    // false-positives on "non-stop" (hyphen) and "bus stop" / "won't stop" (legit standalone word)
    const OPT_OUT_KEYWORDS = new Set(['stop', 'unsubscribe', 'optout']);
    // Multi-word phrases are unambiguous enough to match anywhere in the message
    const OPT_OUT_PHRASES = ['remove me', 'opt out', "don't message", 'dont message', 'stop messaging', 'no more messages'];
    const cleanedText = lowerText.trim().replace(/^[.,!?;:]+/, '').replace(/[.,!?;:]+$/, '');
    const isOptOut =
      OPT_OUT_KEYWORDS.has(cleanedText) ||
      OPT_OUT_PHRASES.some((p) => lowerText.includes(p));
    if (isOptOut) {
      await this.prisma.contact.update({ where: { id: contact.id }, data: { valid: false } });
      this.log.log(`[${sessionId}] OPT_OUT from ${phone} — contact marked invalid`);
    }

    this.gateway.emitReply(contact.id, phone, text, lastMsg?.campaignId ?? null);
    this.log.log(`[${sessionId}] reply from ${phone}: "${text.slice(0, 60)}"`);
  }

  private async handleMessageDelivered(sessionId: string, phone: string): Promise<void> {
    const contact = await this.prisma.contact.findUnique({ where: { phone } });
    if (!contact) return;
    const lastSent = await this.prisma.campaignMessage.findFirst({
      where: { contactId: contact.id, sessionId, status: MsgStatus.SENT },
      orderBy: { sentAt: 'desc' },
    });
    if (!lastSent) return;
    await this.prisma.campaignMessage.update({
      where: { id: lastSent.id },
      data: { status: MsgStatus.DELIVERED },
    });
    this.log.log(`[${sessionId}] delivered receipt from ${phone}`);
  }

  private async handleMessageRead(sessionId: string, phone: string): Promise<void> {
    const contact = await this.prisma.contact.findUnique({ where: { phone } });
    if (!contact) return;

    const lastSent = await this.prisma.campaignMessage.findFirst({
      where: { contactId: contact.id, sessionId, status: { in: [MsgStatus.SENT, MsgStatus.DELIVERED] } },
      orderBy: { sentAt: 'desc' },
    });
    if (!lastSent) return;

    await this.prisma.campaignMessage.update({
      where: { id: lastSent.id },
      data: { status: MsgStatus.READ },
    });
    this.log.log(`[${sessionId}] read receipt from ${phone}`);
  }

  private async handleConnectionUpdate(
    sessionId: string,
    sock: ReturnType<typeof makeWASocket>,
    update: Partial<ConnectionState>,
  ): Promise<void> {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.log.log(`[${sessionId}] QR received — emitting session:qr (length=${qr.length})`);
      this.gateway.emitQr(sessionId, qr);
    }

    if (connection === 'open') {
      this.reconnectDelays.delete(sessionId); // reset backoff on successful connect
      await this.setStatus(sessionId, SessionStatus.ONLINE);
      const rawId = sock.user?.id;
      if (rawId) {
        const digits = rawId.split(':')[0] ?? '';
        const phone = digits.startsWith('+') ? digits : `+${digits}`;
        await this.prisma.session.update({
          where: { id: sessionId },
          data: { phoneNumber: phone },
        });
      }
    }

    if (connection === 'close') {
      const err = lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
      const statusCode = err?.output?.statusCode;
      this.log.warn(`[${sessionId}] connection closed — statusCode=${statusCode ?? 'none'} err=${String(lastDisconnect?.error ?? 'none')}`);

      if (statusCode === DisconnectReason.loggedOut) {
        // loggedOut fires for both manual phone-side logout AND WhatsApp bans.
        // The two are indistinguishable from the disconnect code alone.
        // Mark OFFLINE so the operator can inspect; re-connecting reveals if actually banned
        // (WA will reject the QR with a ban error only if the number is genuinely banned).
        this.log.warn(
          `[${sessionId}] loggedOut — could be manual logout or a ban. Marking OFFLINE. ` +
          `Re-connect to verify; WA rejects the QR with a ban notice if the number is banned.`,
        );
        await this.setStatus(sessionId, SessionStatus.OFFLINE);
        await this.proxy.releaseProxy(sessionId);
        this.sockets.delete(sessionId);
        return;
      }

      if (this.intentionalDisconnects.has(sessionId)) {
        this.intentionalDisconnects.delete(sessionId);
        await this.setStatus(sessionId, SessionStatus.OFFLINE);
        this.sockets.delete(sessionId);
        return;
      }

      // Unintentional disconnect — reconnect with exponential backoff.
      // Accumulate delay across repeated flaps so a flapping session doesn't hammer
      // WA servers at 3s intervals indefinitely.
      await this.setStatus(sessionId, SessionStatus.CONNECTING);
      this.sockets.delete(sessionId);
      const currentDelay = this.reconnectDelays.get(sessionId) ?? 3_000;
      const nextDelay = Math.min(currentDelay * 2, 60_000);
      this.reconnectDelays.set(sessionId, nextDelay);
      this.scheduleReconnect(sessionId, currentDelay);
    }
  }

  private scheduleReconnect(sessionId: string, delayMs: number): void {
    this.log.log(`[${sessionId}] reconnect in ${delayMs}ms`);
    setTimeout(() => {
      // Abort if the session was deleted while we were waiting
      void this.prisma.session
        .findUnique({ where: { id: sessionId }, select: { id: true } })
        .then((exists) => {
          if (!exists) {
            this.log.log(`[${sessionId}] session deleted — aborting reconnect`);
            this.reconnectDelays.delete(sessionId);
            return;
          }
          return this.startSocket(sessionId);
        })
        .catch((err: unknown) => {
          this.log.error(`Reconnect failed [${sessionId}]: ${String(err)}`);
          // startSocket threw — apply backoff and retry
          const lastDelay = this.reconnectDelays.get(sessionId) ?? delayMs;
          const nextDelay = Math.min(lastDelay * 2, 60_000);
          this.reconnectDelays.set(sessionId, nextDelay);
          this.scheduleReconnect(sessionId, nextDelay);
        });
    }, delayMs);
  }

  private async setStatus(sessionId: string, status: SessionStatus): Promise<void> {
    try {
      await this.prisma.session.update({ where: { id: sessionId }, data: { status } });
      this.gateway.emitStatus(sessionId, status);
    } catch {
      // Session may have been deleted; skip silently
    }
  }

  /**
   * Sends a text or media message via Baileys, preceded by a typing-presence signal.
   * Called exclusively by BaileysWorker — never call from a controller.
   */
  async sendBaileyMessage(
    sessionId: string,
    phone: string,
    text: string,
    typingMs: number,
    media?: { url: string; type: MediaType; mimeType?: string; filename?: string },
  ): Promise<void> {
    if (this.dryRun) {
      this.log.log(
        `[DRY_RUN] skipping Baileys send to ${phone}: "${text.slice(0, 80)}"${media ? ` [+${media.type}]` : ''}`,
      );
      return;
    }
    const sock = this.sockets.get(sessionId);
    if (!sock) {
      throw new Error(`Session ${sessionId} socket is not active`);
    }
    const jid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
    // WhatsApp hard limits — silently truncate rather than throw and lose the message.
    // Media captions are capped tighter (1024) than standalone text messages (4096).
    const MAX_WA_CHARS = media ? 1024 : 4096;
    const safeText = text.length > MAX_WA_CHARS ? text.slice(0, MAX_WA_CHARS) : text;
    if (text.length > MAX_WA_CHARS) {
      this.log.warn(`[${sessionId}] message truncated ${text.length}→${MAX_WA_CHARS} chars for ${phone}`);
    }
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise<void>((resolve) => setTimeout(resolve, typingMs));
    await sock.sendPresenceUpdate('paused', jid);

    if (!media) {
      await sock.sendMessage(jid, { text: safeText });
      return;
    }

    const storedName = this.media.storedNameFromUrl(media.url);
    if (!storedName) {
      throw new Error(`Cannot resolve local path for media URL ${media.url}`);
    }
    const buffer = await this.media.readFile(storedName);

    if (media.type === MediaType.IMAGE) {
      await sock.sendMessage(jid, { image: buffer, caption: safeText });
    } else if (media.type === MediaType.VIDEO) {
      await sock.sendMessage(jid, { video: buffer, caption: safeText });
    } else {
      await sock.sendMessage(jid, {
        document: buffer,
        mimetype: media.mimeType ?? 'application/octet-stream',
        fileName: media.filename ?? 'file',
        caption: safeText,
      });
    }
  }

  /** Exposed for testing purposes only. */
  getSocketCount(): number {
    return this.sockets.size;
  }
}
