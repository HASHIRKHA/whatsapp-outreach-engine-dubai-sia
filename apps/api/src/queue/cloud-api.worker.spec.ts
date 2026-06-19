import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MediaType, MsgStatus, SessionStatus } from '@prisma/client';
import { CloudApiWorker } from './cloud-api.worker';
import { PrismaService } from '../common/prisma/prisma.service';
import { CloudApiService } from '../cloud-api/cloud-api.service';
import { DelayService } from '../antiban/delay.service';
import { WarmupService } from '../antiban/warmup.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { DLQ_QUEUE, REDIS_CLIENT } from './queue.constants';
import type { OutboxJob } from './outbox-job.types';

const mockPrisma = {
  campaignMessage: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  campaign: {
    findUnique: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  session: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  analyticsEvent: {
    create: jest.fn().mockResolvedValue({}),
  },
};

const mockCloudApi = {
  sendTemplate: jest.fn().mockResolvedValue({ wamid: 'wamid.test' }),
};

const mockDelay = {
  isWithinActiveHours: jest.fn().mockReturnValue(true),
  msUntilNextWindow: jest.fn().mockReturnValue(3_600_000),
  msUntilMidnight: jest.fn().mockReturnValue(3_600_000),
  floorMs: 60_000,
  typingMs: 3_000,
};

const mockWarmup = {
  getEffectiveDailyLimit: jest.fn().mockReturnValue(200),
};

const mockGateway = {
  emitCampaignStats: jest.fn(),
};

const mockDlqQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
};

function makeJobData(overrides: Partial<OutboxJob> = {}): OutboxJob {
  return {
    campaignMessageId: 'msg-1',
    campaignId: 'camp-1',
    contactId: 'contact-1',
    sessionId: 'session-1',
    phone: '+15551234567',
    renderedText: 'Hello there',
    templateName: 'welcome_template',
    activeFrom: 0,
    activeTo: 24,
    mode: 'CLOUD_API' as OutboxJob['mode'],
    ...overrides,
  };
}

function makeJob(data: OutboxJob): Job<OutboxJob> {
  return {
    id: 'job-1',
    data,
    opts: { attempts: 1 },
    attemptsMade: 1,
    moveToDelayed: jest.fn(),
  } as unknown as Job<OutboxJob>;
}

describe('CloudApiWorker', () => {
  let worker: CloudApiWorker;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.campaignMessage.findUnique.mockResolvedValue({ status: MsgStatus.QUEUED });
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'RUNNING' });
    mockPrisma.session.findUnique.mockResolvedValue({
      dailySent: 0,
      warmupDay: 21,
      status: SessionStatus.ONLINE,
    });
    mockCloudApi.sendTemplate.mockResolvedValue({ wamid: 'wamid.test' });
    mockRedis.get.mockResolvedValue(null);

    const module = await Test.createTestingModule({
      providers: [
        CloudApiWorker,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CloudApiService, useValue: mockCloudApi },
        { provide: DelayService, useValue: mockDelay },
        { provide: WarmupService, useValue: mockWarmup },
        { provide: SessionsGateway, useValue: mockGateway },
        { provide: getQueueToken(DLQ_QUEUE), useValue: mockDlqQueue },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    worker = module.get(CloudApiWorker);
  });

  describe('idempotency gate', () => {
    it.each([MsgStatus.SENT, MsgStatus.DELIVERED, MsgStatus.READ, MsgStatus.REPLIED, MsgStatus.FAILED])(
      'skips the send when the message is already in terminal status %s',
      async (status) => {
        mockPrisma.campaignMessage.findUnique.mockResolvedValue({ status });
        await worker.process(makeJob(makeJobData()));
        expect(mockCloudApi.sendTemplate).not.toHaveBeenCalled();
      },
    );
  });

  describe('missing templateName guard', () => {
    it('fails the job without calling Cloud API when templateName is absent', async () => {
      await worker.process(makeJob(makeJobData({ templateName: undefined })));

      expect(mockCloudApi.sendTemplate).not.toHaveBeenCalled();
      expect(mockPrisma.campaignMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { status: MsgStatus.FAILED },
      });
    });
  });

  describe('media attachment send path', () => {
    it('omits headerMedia when the job has no attachment', async () => {
      await worker.process(makeJob(makeJobData()));

      expect(mockCloudApi.sendTemplate).toHaveBeenCalledWith({
        to: '+15551234567',
        templateName: 'welcome_template',
        headerMedia: undefined,
      });
    });

    it('builds headerMedia (type/url/filename, no mimeType) when the job has an attachment', async () => {
      const jobData = makeJobData({
        mediaUrl: 'http://localhost:3001/api/media/a.jpg',
        mediaType: MediaType.IMAGE,
        mediaMimeType: 'image/jpeg',
        mediaFilename: 'a.jpg',
      });

      await worker.process(makeJob(jobData));

      expect(mockCloudApi.sendTemplate).toHaveBeenCalledWith({
        to: '+15551234567',
        templateName: 'welcome_template',
        headerMedia: { type: MediaType.IMAGE, url: 'http://localhost:3001/api/media/a.jpg', filename: 'a.jpg' },
      });
    });

    it('persists the returned wamid on success', async () => {
      mockCloudApi.sendTemplate.mockResolvedValue({ wamid: 'wamid.abc123' });

      await worker.process(makeJob(makeJobData()));

      expect(mockPrisma.campaignMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: expect.objectContaining({ status: MsgStatus.SENT, wamid: 'wamid.abc123' }),
      });
    });

    it('marks the message FAILED and rethrows when the send itself throws', async () => {
      mockCloudApi.sendTemplate.mockRejectedValueOnce(new Error('Meta API error'));

      await expect(worker.process(makeJob(makeJobData()))).rejects.toThrow('Meta API error');

      expect(mockPrisma.campaignMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { status: MsgStatus.FAILED },
      });
    });
  });

  describe('session not ONLINE', () => {
    it('marks the job FAILED without attempting to send', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        dailySent: 0,
        warmupDay: 21,
        status: SessionStatus.OFFLINE,
      });

      await worker.process(makeJob(makeJobData()));

      expect(mockCloudApi.sendTemplate).not.toHaveBeenCalled();
      expect(mockPrisma.campaignMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { status: MsgStatus.FAILED },
      });
    });
  });
});
