import { OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

// cors.origin is set in afterInit() so it reads the env var at runtime (after ConfigModule loads),
// not at class-decoration time (before .env is parsed).
@WebSocketGateway({ cors: { origin: true } })
export class SessionsGateway implements OnGatewayInit {
  @WebSocketServer()
  private server: Server | undefined;

  afterInit(server: Server): void {
    const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    server.engine.opts.cors = { origin, credentials: true };
  }

  emitQr(sessionId: string, qr: string): void {
    this.server?.emit('session:qr', { sessionId, qr });
  }

  emitStatus(sessionId: string, status: string): void {
    this.server?.emit('session:status', { sessionId, status });
  }

  emitCampaignStats(campaignId: string, stats: Record<string, unknown>): void {
    this.server?.emit('campaign:stats', { campaignId, ...stats });
  }

  emitReply(contactId: string, phone: string, text: string, campaignId: string | null): void {
    this.server?.emit('reply:new', { contactId, phone, text, campaignId, at: new Date().toISOString() });
  }
}
