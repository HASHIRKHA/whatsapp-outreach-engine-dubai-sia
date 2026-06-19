export enum SessionMode {
  CLOUD_API = 'CLOUD_API',
  BAILEYS = 'BAILEYS',
}

export enum SessionStatus {
  OFFLINE = 'OFFLINE',
  CONNECTING = 'CONNECTING',
  ONLINE = 'ONLINE',
  BANNED = 'BANNED',
}

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  DONE = 'DONE',
}

export enum MsgStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  REPLIED = 'REPLIED',
  FAILED = 'FAILED',
}

export enum LeadTemp {
  HOT = 'HOT',
  WARM = 'WARM',
  COLD = 'COLD',
}
