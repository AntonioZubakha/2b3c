/**
 * legacy-ftp-poller-service
 *
 * Runs on a cron schedule (default: every 12 hours).
 * Also exposes an internal HTTP trigger API on port 3001
 * so the admin panel can force an immediate poll.
 */

import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import cron from 'node-cron';
import { logger } from './shared/logger';
import { config } from './shared/config';
import { connectDatabase, disconnectDatabase } from './shared/database';
import { connectRabbitMQ, closeRabbitMQ } from './shared/rabbitmq';
import { runPollCycle, pollByCompanyId } from './services/ftpPoller';
import { closeRedisLock, initializeRedisLock, getRedisLockManager } from './shared/redisLock';

let isRunning = false;
const GLOBAL_SYNC_LOCK_KEY = process.env.GLOBAL_SYNC_LOCK_KEY || 'sync:lock:global';

async function scheduledPoll(): Promise<void> {
  if (isRunning) {
    logger.warn('[Main] Previous poll cycle still running, skipping this tick');
    return;
  }

  const redis = getRedisLockManager();
  const lockValue = `legacy-ftp-poller-${Date.now()}`;
  const acquired = await redis.acquireLock(GLOBAL_SYNC_LOCK_KEY, lockValue, 300);
  if (!acquired) {
    logger.info('[Main] Global sync lock busy, deferring poll cycle');
    return;
  }

  isRunning = true;
  const heartbeat = setInterval(() => {
    void redis.extendLock(GLOBAL_SYNC_LOCK_KEY, lockValue, 5 * 60);
  }, 2 * 60 * 1000);
  try {
    await runPollCycle();
  } catch (err) {
    logger.error({ err }, '[Main] Unhandled error in poll cycle');
  } finally {
    clearInterval(heartbeat);
    await redis.releaseLock(GLOBAL_SYNC_LOCK_KEY, lockValue);
    isRunning = false;
  }
}

/** Minimal HTTP server for internal admin triggers */
function startTriggerServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, running: isRunning }));
      return;
    }

    if (req.method === 'POST' && req.url === '/trigger-all') {
      logger.info('[Main] HTTP trigger-all received');
      scheduledPoll(); // fire and forget
      res.writeHead(202);
      res.end(JSON.stringify({ ok: true, message: 'Poll cycle triggered for all companies' }));
      return;
    }

    const triggerMatch = req.method === 'POST' && req.url?.match(/^\/trigger\/([0-9a-f]{24})$/i);
    if (triggerMatch) {
      const companyId = triggerMatch[1];
      logger.info({ companyId }, '[Main] HTTP trigger for single company received');
      // Fire and forget
      (async () => {
        const redis = getRedisLockManager();
        const lockValue = `legacy-ftp-poller-single-${companyId}-${Date.now()}`;
        const acquired = await redis.acquireLock(GLOBAL_SYNC_LOCK_KEY, lockValue, 300);
        if (!acquired) {
          logger.info({ companyId }, '[Main] Global sync lock busy, deferring single-company poll');
          return;
        }
        const heartbeat = setInterval(() => {
          void redis.extendLock(GLOBAL_SYNC_LOCK_KEY, lockValue, 5 * 60);
        }, 2 * 60 * 1000);
        try { await pollByCompanyId(companyId); }
        catch (err) { logger.error({ err, companyId }, '[Main] Error in triggered poll'); }
        finally {
          clearInterval(heartbeat);
          await redis.releaseLock(GLOBAL_SYNC_LOCK_KEY, lockValue);
        }
      })();
      res.writeHead(202);
      res.end(JSON.stringify({ ok: true, companyId }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(3001, () => {
    logger.info('[Main] HTTP trigger server listening on :3001');
  });

  return server;
}

async function main(): Promise<void> {
  logger.info('[Main] legacy-ftp-poller-service starting');
  logger.info({ schedule: config.cronSchedule, concurrency: config.concurrency }, '[Main] Config');

  await connectDatabase();
  await initializeRedisLock();
  await connectRabbitMQ();

  const triggerServer = startTriggerServer();

  // Run immediately on startup
  logger.info('[Main] Running initial poll on startup');
  await scheduledPoll();

  // Schedule recurring polls
  cron.schedule(config.cronSchedule, () => {
    logger.info('[Main] Cron triggered — starting poll cycle');
    scheduledPoll();
  });

  logger.info('[Main] Cron scheduler active');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, '[Main] Shutting down');
    triggerServer.close();
    await closeRabbitMQ();
    await closeRedisLock();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
  logger.error({ err }, '[Main] Fatal error during startup');
  process.exit(1);
});
