import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { BaseAdapter } from '@bull-board/api/dist/src/queueAdapters/base';
import { FastifyAdapter as BullBoardFastifyAdapter } from '@bull-board/fastify';
import fastifyMultipart from '@fastify/multipart';
import type { FastifyPluginCallback } from 'fastify';
import { getQueueToken } from '@nestjs/bullmq';
import { type Queue } from 'bullmq';
import { PassThrough } from 'stream';
import { AppModule } from './app.module';
import { BAILEYS_QUEUE, CLOUD_API_QUEUE, DLQ_QUEUE } from './queue/queue.constants';
import { MediaService } from './media/media.service';

class CorsIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // bodyLimit must clear MediaService.maxFileBytes (16MB) plus multipart framing overhead
    new FastifyAdapter({ logger: process.env.NODE_ENV !== 'test', bodyLimit: 20 * 1024 * 1024 }),
  );

  app.setGlobalPrefix('api', { exclude: ['health'] });

  app.useWebSocketAdapter(new CorsIoAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  // ── Bull Board ─────────────────────────────────────────────────────────────
  const fastify = app.getHttpAdapter().getInstance() as unknown as import('fastify').FastifyInstance;

  // @fastify/multipart's FastifyInstance/FastifyRequest augmentation (multipartErrors, request.file())
  // doesn't structurally match the @bull-board/fastify plugin signature below — both are real
  // runtime-compatible Fastify v4 plugins, this is a TS-only cross-plugin typing friction.
  await fastify.register(
    fastifyMultipart as unknown as FastifyPluginCallback<{ limits?: { fileSize?: number } }>,
    { limits: { fileSize: MediaService.maxFileBytes } },
  );

  const cloudApiQueue = app.get<Queue>(getQueueToken(CLOUD_API_QUEUE));
  const baileysQueue = app.get<Queue>(getQueueToken(BAILEYS_QUEUE));
  const dlqQueue = app.get<Queue>(getQueueToken(DLQ_QUEUE));

  const boardAdapter = new BullBoardFastifyAdapter();
  const toAdapter = (q: Queue) => new BullMQAdapter(q) as unknown as BaseAdapter;
  createBullBoard({
    queues: [toAdapter(cloudApiQueue), toAdapter(baileysQueue), toAdapter(dlqQueue)],
    serverAdapter: boardAdapter,
  });
  boardAdapter.setBasePath('/admin/queues');

  // Same cross-plugin typing friction as the multipart registration above.
  await fastify.register(
    boardAdapter.registerPlugin() as unknown as FastifyPluginCallback<{ basePath: string }>,
    { prefix: '/admin/queues', basePath: '/admin/queues' },
  );

  // Fix FST_ERR_CTP_EMPTY_JSON_BODY: strip Content-Type for GET/HEAD only.
  // DELETE requests may legitimately carry a JSON body (e.g. DELETE /smart-lists/:id/contacts),
  // so we never strip Content-Type on DELETE — Fastify handles empty-body DELETEs correctly.
  fastify.addHook('preParsing', (request, _reply, payload, done) => {
    const method = (request.method ?? '').toUpperCase();
    if (method === 'GET' || method === 'HEAD') {
      delete (request.raw as import('http').IncomingMessage & { headers: Record<string, string | undefined> }).headers['content-type'];
    }
    done(null, payload);
  });

  // Capture raw JSON bytes for X-Hub-Signature-256 HMAC validation — webhooks route only.
  // Scoped to /api/webhooks/ to avoid buffering large multipart file uploads in memory.
  // Uses preParsing (stream tee) instead of addContentTypeParser to avoid conflicting
  // with NestJS Fastify adapter's own JSON parser registration (FST_ERR_CTP_ALREADY_PRESENT).
  fastify.addHook('preParsing', (request, _reply, payload, done) => {
    if (!request.url.startsWith('/api/webhooks/')) {
      done(null, payload);
      return;
    }
    const req = request as import('fastify').FastifyRequest & { rawBody?: string };
    const chunks: Buffer[] = [];
    const pt = new PassThrough();
    payload.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      pt.push(buf);
    });
    payload.on('end', () => {
      req.rawBody = Buffer.concat(chunks).toString('utf8');
      pt.push(null);
    });
    payload.on('error', (err: Error) => pt.destroy(err));
    done(null, pt);
  });
  // ──────────────────────────────────────────────────────────────────────────

  const port = +(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 API running on http://0.0.0.0:${port}/api`);
  console.log(`📊 Bull Board at http://0.0.0.0:${port}/admin/queues`);
}

void bootstrap();
