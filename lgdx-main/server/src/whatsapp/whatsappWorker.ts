/**
 * Standalone process: consume whatsapp_incoming_tasks and run LLM + Graph API.
 * Run: node dist/whatsapp/whatsappWorker.js (same image as API, different CMD).
 */
import fs from 'fs';
import dotenv from 'dotenv';
import * as amqplib from 'amqplib';
import { logger } from '../utils/logger';
import { connectWorkerMongo } from '../config/mongo';
import { processWhatsAppIncomingJob } from './whatsappJob.processor';
import type { WhatsAppIncomingMessagePayload } from './whatsapp.types';
import { WHATSAPP_CHANNEL_CLOUD } from './whatsapp.types';
import { warmWhatsAppMarketingPromptAtStartup } from './whatsappConfig';
import { isWhatsAppTimingEnabled, waIdPrefixForLog } from './whatsappPipelineTiming';

dotenv.config();

const QUEUE = 'whatsapp_incoming_tasks';

function getRabbitUrl(): string {
  const isProd = process.env.NODE_ENV === 'production';
  if (process.env.RABBITMQ_URL_FILE) {
    try {
      return fs.readFileSync(process.env.RABBITMQ_URL_FILE, 'utf8').trim();
    } catch (e) {
      logger.error('[WhatsAppWorker] RABBITMQ_URL_FILE read failed', e);
    }
  }
  if (process.env.RABBITMQ_URL) return process.env.RABBITMQ_URL;
  if (isProd) {
    throw new Error('[Security] RABBITMQ_URL (or RABBITMQ_URL_FILE) is required in production');
  }
  const user = process.env.RABBITMQ_USER || 'lgdx';
  const pass = process.env.RABBITMQ_PASS || 'test123';
  const host = process.env.RABBITMQ_HOST || 'rabbitmq';
  const port = process.env.RABBITMQ_PORT || '5672';
  return `amqp://${user}:${pass}@${host}:${port}`;
}

async function run(): Promise<void> {
  if (process.env.WHATSAPP_ENABLED !== 'true') {
    logger.error('[WhatsAppWorker] Set WHATSAPP_ENABLED=true to run worker');
    process.exit(1);
  }

  // Connect Mongo so DB-backed prompts + role lookups work and we don't pay a 10s
  // Mongoose buffer timeout on the first inbound message. Non-fatal on failure.
  await connectWorkerMongo('WhatsAppWorker');

  warmWhatsAppMarketingPromptAtStartup();

  const url = getRabbitUrl();
  logger.debug('[WhatsAppWorker] Connecting to RabbitMQ');

  const conn = await amqplib.connect(url);
  const ch = await conn.createChannel();
  await ch.assertQueue(QUEUE, {
    durable: true,
    arguments: { 'x-message-ttl': 900000 }
  });
  await ch.prefetch(3);

  logger.debug('[WhatsAppWorker] Listening', { queue: QUEUE });

  await ch.consume(
    QUEUE,
    (msg) => {
      if (!msg) return;
      void (async () => {
        let payload: WhatsAppIncomingMessagePayload;
        try {
          payload = JSON.parse(msg.content.toString('utf8')) as WhatsAppIncomingMessagePayload;
        } catch (err) {
          logger.error('[WhatsAppWorker] Bad message JSON — dropping', { err });
          ch.nack(msg, false, false);
          return;
        }
        const channel = payload.channel ?? WHATSAPP_CHANNEL_CLOUD;
        if (channel !== WHATSAPP_CHANNEL_CLOUD) {
          logger.error('[WhatsAppWorker] Rejecting non-cloud job on Cloud worker', { channel });
          ch.nack(msg, false, false);
          return;
        }
        const dequeueAt = Date.now();
        if (
          isWhatsAppTimingEnabled() &&
          typeof payload.enqueuedAtMs === 'number' &&
          payload.enqueuedAtMs > 0
        ) {
          logger.info('[WhatsAppTiming]', {
            phase: 'rabbit_dequeue',
            messageId: payload.messageId,
            channel,
            waIdPrefix: waIdPrefixForLog(payload.waId),
            queueWaitMs: dequeueAt - payload.enqueuedAtMs
          });
        }
        try {
          await processWhatsAppIncomingJob({ ...payload, channel });
          ch.ack(msg);
        } catch (err) {
          logger.error('[WhatsAppWorker] Job failed', { err });
          ch.nack(msg, false, true);
        }
      })();
    },
    { noAck: false }
  );

  conn.on('error', (err) => {
    logger.error('[WhatsAppWorker] Connection error', { err });
  });

  conn.on('close', () => {
    logger.warn('[WhatsAppWorker] Connection closed, exiting');
    process.exit(1);
  });
}

run().catch((err) => {
  logger.error('[WhatsAppWorker] Fatal', { err });
  process.exit(1);
});
