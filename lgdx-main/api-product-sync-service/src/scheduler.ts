/**
 * API Sync Scheduler
 * Automatically creates sync tasks based on SYNC_SCHEDULE environment variable
 */

import schedule from 'node-schedule';
import * as amqp from 'amqplib';
import mongoose from 'mongoose';
import CompanyApiConfig from './models/CompanyApiConfig';
import { getServiceCoordinator } from './utils/serviceCoordinator';
import { logger } from './shared/logger';
import { getRabbitUrlFromEnv, getRedisUrlFromEnv } from './shared/configSources';

const QUEUE_NAME = 'api_sync_tasks';

const DLX = 'api_sync_dlx';
const DLQ = 'api_sync_dlq';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertApiSyncQueueTopology(channel: any): Promise<void> {
  await channel.assertExchange(DLX, 'direct', { durable: true });
  await channel.assertQueue(DLQ, { durable: true });
  await channel.bindQueue(DLQ, DLX, DLQ);
  await channel.assertQueue(QUEUE_NAME, {
    durable: true,
    arguments: {
      'x-message-ttl': 7200000, // 2 hours — must cover long sequential nightly syncs
      'x-dead-letter-exchange': DLX,
      'x-dead-letter-routing-key': DLQ,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sendSyncTaskToQueue(
  channel: any,
  configId: string,
  companyId: string,
  companyName: string,
): void {
  const payload = { configId, companyId, companyName };
  channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
    headers: {
      'task-type': 'api-sync',
      'company-id': companyId,
      'x-api-sync-retry': 0,
      'retry-count': 0,
    },
  });
}

/**
 * Run scheduled sync for all active companies.
 * Uses a single RabbitMQ connection for all enqueue operations (avoids N connections per cron run).
 */
async function runScheduledSync(): Promise<void> {
  logger.info('[Scheduler] 🚀 Starting scheduled API sync...');

  const coordinator = getServiceCoordinator();
  const redisUrl = getRedisUrlFromEnv();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let connection: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let channel: any = null;

  try {
    await coordinator.initialize(redisUrl);

    await coordinator.setStatus('api-sync', {
      status: 'running',
      startedAt: new Date(),
      metadata: { triggeredBy: 'scheduler' },
    });

    const configs = await CompanyApiConfig.find({ isActive: true }).populate('company');

    logger.info(`[Scheduler] Found ${configs.length} active API configurations`);

    const rabbitmqUrl = getRabbitUrlFromEnv();
    connection = await amqp.connect(rabbitmqUrl);
    channel = await connection.createChannel();
    await assertApiSyncQueueTopology(channel);

    let sentCount = 0;
    for (const config of configs) {
      const company = config.company;
      if (!company || typeof company === 'string') {
        logger.warn(
          `[Scheduler] ⚠️ Config ${config._id} has no company or company is not populated, skipping`,
        );
        continue;
      }

      const companyDoc = company as { _id: mongoose.Types.ObjectId; name?: string };

      sendSyncTaskToQueue(channel, config._id.toString(), companyDoc._id.toString(), companyDoc.name || 'Unknown');

      sentCount++;

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.info(`[Scheduler] ✅ Scheduled sync completed. Sent ${sentCount} tasks to queue.`);

    await coordinator.setStatus('api-sync', {
      status: 'completed',
      completedAt: new Date(),
      metadata: {
        tasksSent: sentCount,
        companiesProcessed: sentCount,
      },
    });
  } catch (error) {
    logger.error('[Scheduler] ❌ Error in scheduled sync', { error });

    await coordinator.setStatus('api-sync', {
      status: 'failed',
      completedAt: new Date(),
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    try {
      if (channel) await channel.close();
    } catch {
      /* ignore */
    }
    try {
      if (connection) await connection.close();
    } catch {
      /* ignore */
    }
    await coordinator.close();
  }
}

/**
 * Initialize scheduler with cron pattern from environment
 */
export function initializeScheduler(): void {
  const cronPattern = process.env.SYNC_SCHEDULE || '0 2 * * *';

  logger.info(`[Scheduler] 📅 Initializing scheduler with pattern: ${cronPattern}`);

  try {
    const job = schedule.scheduleJob(cronPattern, async () => {
      logger.info(`[Scheduler] ⏰ Triggered at ${new Date().toISOString()}`);
      await runScheduledSync();
    });

    if (job) {
      logger.info('[Scheduler] ✅ Scheduler initialized successfully');
      logger.info(`[Scheduler] Next run: ${job.nextInvocation()?.toISOString()}`);
    } else {
      logger.error('[Scheduler] ❌ Failed to create schedule job - invalid cron pattern?');
    }
  } catch (error) {
    logger.error('[Scheduler] ❌ Error initializing scheduler', { error });
  }
}

/**
 * Stop scheduler (for graceful shutdown)
 */
export function stopScheduler(): void {
  logger.info('[Scheduler] 🛑 Stopping scheduler...');
  schedule.gracefulShutdown();
}
