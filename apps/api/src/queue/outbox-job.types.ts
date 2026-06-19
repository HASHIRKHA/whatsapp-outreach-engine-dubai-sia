import { MediaType, SessionMode } from '@prisma/client';

export interface OutboxJob {
  campaignMessageId: string;
  campaignId: string;
  contactId: string;
  sessionId: string;
  phone: string;
  renderedText: string;
  /** Present for CLOUD_API mode: the approved Meta template name. */
  templateName?: string;
  activeFrom: number;
  activeTo: number;
  mode: SessionMode;
  /** Campaign media attachment — public URL served by GET /media/:filename. */
  mediaUrl?: string;
  mediaType?: MediaType;
  /** Required for Baileys document sends; unused by Cloud API (link-based header). */
  mediaMimeType?: string;
  mediaFilename?: string;
}

export interface DlqJob {
  originalJob: OutboxJob;
  error: string;
  failedAt: string;
}
