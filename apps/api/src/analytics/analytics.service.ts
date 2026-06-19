import { Injectable, NotFoundException } from '@nestjs/common';
import { MsgStatus, SessionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface DailyBucket {
  date: string;
  count: number;
}

export interface RecentMessage {
  id: string;
  phone: string;
  contactName: string | null;
  campaignName: string;
  campaignId: string;
  status: string;
  sentAt: string | null;
  mode: string;
}

export interface OverviewResponse {
  activeSessions: number;
  messagesToday: number;
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  replyRate: number;
  hotReplies: number;
  sessionPool: Array<{
    id: string;
    label: string;
    phoneNumber: string | null;
    status: string;
    mode: string;
    warmupDay: number;
    dailySent: number;
    proxyId: string | null;
    fingerprint: unknown;
  }>;
  dailyMessages: DailyBucket[];
  recentActivity: RecentMessage[];
}

export interface CampaignOverviewResponse {
  stats: {
    queued: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
  };
  dailyBreakdown: DailyBucket[];
  variants: Array<{
    text: string;
    sent: number;
    replied: number;
    rate: number;
    weight: number;
  }>;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<OverviewResponse> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      sessions,
      messagesTodayAgg,
      replyStats,
      hotRepliesCount,
      recentMessages,
      totalSent,
      totalDelivered,
      totalRead,
    ] = await Promise.all([
      this.prisma.session.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.campaignMessage.aggregate({
        _count: { id: true },
        where: {
          status: { in: [MsgStatus.SENT, MsgStatus.DELIVERED, MsgStatus.READ, MsgStatus.REPLIED] },
          sentAt: { gte: todayStart },
        },
      }),
      this.prisma.reply.aggregate({
        _count: { id: true },
        where: { campaignId: { not: null } },
      }),
      this.prisma.reply.count({ where: { sentiment: 'HOT' } }),
      this.prisma.campaignMessage.findMany({
        take: 30,
        orderBy: { sentAt: 'desc' },
        where: { sentAt: { not: null } },
        include: {
          campaign: { select: { name: true, mode: true } },
        },
      }),
      this.prisma.campaignMessage.count({
        where: {
          status: { in: [MsgStatus.SENT, MsgStatus.DELIVERED, MsgStatus.READ, MsgStatus.REPLIED] },
        },
      }),
      this.prisma.campaignMessage.count({
        where: { status: { in: [MsgStatus.DELIVERED, MsgStatus.READ, MsgStatus.REPLIED] } },
      }),
      this.prisma.campaignMessage.count({
        where: { status: { in: [MsgStatus.READ, MsgStatus.REPLIED] } },
      }),
    ]);

    const activeSessions = sessions.filter((s) => s.status === SessionStatus.ONLINE).length;
    const messagesToday = messagesTodayAgg._count.id;

    // reply rate: campaign-linked replies only / total successfully sent (excludes FAILED and QUEUED)
    const totalReplied = replyStats._count.id;
    const replyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0;

    // daily messages for last 14 days
    const daily = await this.buildDailyBuckets(14);

    // enrich with contact phone/name
    const contactIds = [...new Set(recentMessages.map((m) => m.contactId))];
    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true, phone: true, name: true },
    });
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const enriched: RecentMessage[] = recentMessages.slice(0, 30).map((m) => {
      const contact = contactMap.get(m.contactId);
      return {
        id: m.id,
        phone: contact?.phone ?? m.contactId,
        contactName: contact?.name ?? null,
        campaignName: (m as { campaign?: { name?: string } }).campaign?.name ?? '',
        campaignId: m.campaignId,
        status: m.status,
        sentAt: m.sentAt?.toISOString() ?? null,
        mode: (m as { campaign?: { mode?: string } }).campaign?.mode ?? 'BAILEYS',
      };
    });

    return {
      activeSessions,
      messagesToday,
      totalSent,
      totalDelivered,
      totalRead,
      replyRate: Math.round(replyRate * 10) / 10,
      hotReplies: hotRepliesCount,
      sessionPool: sessions.map((s) => ({
        id: s.id,
        label: s.label,
        phoneNumber: s.phoneNumber,
        status: s.status,
        mode: s.mode,
        warmupDay: s.warmupDay,
        dailySent: s.dailySent,
        proxyId: s.proxyId,
        fingerprint: s.fingerprint,
      })),
      dailyMessages: daily,
      recentActivity: enriched,
    };
  }

  async getCampaignOverview(campaignId: string): Promise<CampaignOverviewResponse> {
    const exists = await this.prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Campaign ${campaignId} not found`);

    const rows = await this.prisma.campaignMessage.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { status: true },
    });

    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = row._count.status;

    const daily = await this.buildCampaignDailyBuckets(campaignId, 14);

    // variants: group by renderedText, count sent and replied
    const allMessages = await this.prisma.campaignMessage.findMany({
      where: { campaignId },
      select: { renderedText: true, status: true },
    });

    const variantMap = new Map<string, { sent: number; replied: number }>();
    for (const m of allMessages) {
      const key = m.renderedText;
      const entry = variantMap.get(key) ?? { sent: 0, replied: 0 };
      if (m.status !== MsgStatus.QUEUED && m.status !== MsgStatus.FAILED) entry.sent++;
      if (m.status === MsgStatus.REPLIED) entry.replied++;
      variantMap.set(key, entry);
    }

    const totalSentAll = [...variantMap.values()].reduce((a, v) => a + v.sent, 0);
    const variants = [...variantMap.entries()]
      .map(([text, v]) => ({
        text,
        sent: v.sent,
        replied: v.replied,
        rate: v.sent > 0 ? Math.round((v.replied / v.sent) * 1000) / 10 : 0,
        weight:
          totalSentAll > 0 ? Math.round((v.sent / totalSentAll) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 10);

    return {
      stats: {
        queued: counts[MsgStatus.QUEUED] ?? 0,
        sent: counts[MsgStatus.SENT] ?? 0,
        delivered: counts[MsgStatus.DELIVERED] ?? 0,
        read: counts[MsgStatus.READ] ?? 0,
        replied: counts[MsgStatus.REPLIED] ?? 0,
        failed: counts[MsgStatus.FAILED] ?? 0,
      },
      dailyBreakdown: daily,
      variants,
    };
  }

  private async buildDailyBuckets(days: number): Promise<DailyBucket[]> {
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT TO_CHAR(DATE_TRUNC('day', "sentAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
             COUNT(*) AS count
      FROM   "CampaignMessage"
      WHERE  "sentAt" >= ${cutoff}
        AND  "status" NOT IN ('QUEUED', 'FAILED')
      GROUP  BY 1
      ORDER  BY 1
    `;
    const map = new Map(rows.map((r) => [r.date, Number(r.count)]));
    const now = new Date();
    const buckets: DailyBucket[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const dateStr = d.toISOString().slice(0, 10);
      buckets.push({ date: dateStr, count: map.get(dateStr) ?? 0 });
    }
    return buckets;
  }

  private async buildCampaignDailyBuckets(
    campaignId: string,
    days: number,
  ): Promise<DailyBucket[]> {
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT TO_CHAR(DATE_TRUNC('day', "sentAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
             COUNT(*) AS count
      FROM   "CampaignMessage"
      WHERE  "campaignId" = ${campaignId}
        AND  "sentAt"    >= ${cutoff}
        AND  "status"    NOT IN ('QUEUED', 'FAILED')
      GROUP  BY 1
      ORDER  BY 1
    `;
    const map = new Map(rows.map((r) => [r.date, Number(r.count)]));
    const now = new Date();
    const buckets: DailyBucket[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const dateStr = d.toISOString().slice(0, 10);
      buckets.push({ date: dateStr, count: map.get(dateStr) ?? 0 });
    }
    return buckets;
  }
}
