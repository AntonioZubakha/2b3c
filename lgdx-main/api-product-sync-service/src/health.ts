import http from 'http';
import mongoose from 'mongoose';
import { logger } from './shared/logger';
import { getWorkerHealthState } from './worker';

const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '8080', 10);

// Return 503 (unhealthy) when the JS heap is this full.
// Docker Swarm will then restart the container cleanly instead of waiting for
// an OOM SIGKILL.
//
// IMPORTANT: We also guard the ratio-check by requiring a minimum heapTotal.
// In this workload heapTotal can briefly sit around ~200-230MB with a high
// heapUsed/heapTotal ratio during normal GC cycles. If we mark that as
// unhealthy, the container gets SIGTERM in the middle of a sync.
//
// Tune via env vars if you need different thresholds.
const HEAP_CRITICAL_RATIO = Number(process.env.MEMORY_HEAP_CRITICAL_RATIO || '0.95');
const HEAP_TOTAL_RATIO_CHECK_MIN_MB = Number(
  process.env.MEMORY_HEAP_TOTAL_RATIO_CHECK_MIN_MB || '256',
);
const WORKER_HEALTH_ENFORCED = (process.env.WORKER_HEALTH_ENFORCED || 'true').toLowerCase() === 'true';

export const startHealthServer = (): void => {
  const server = http.createServer((_req, res) => {
    const mem = process.memoryUsage();
    const heapRatio = mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0;

    // Only apply the ratio check once the heap has grown beyond a meaningful size.
    // On startup V8 allocates a tiny heap (~47 MB) and fills it quickly before GC
    // expands it — ratio hits 95%+ immediately even though the process is healthy.
    //
    // Additionally, under this sync workload heapTotal can briefly be around
    // 200-230MB with a high ratio during normal GC cycles. We skip the ratio check
    // until heapTotal crosses HEAP_TOTAL_RATIO_CHECK_MIN_MB to avoid killing
    // the container mid-sync.
    const heapTotalMB = mem.heapTotal / 1024 / 1024;
    const memOk = heapTotalMB < HEAP_TOTAL_RATIO_CHECK_MIN_MB || heapRatio < HEAP_CRITICAL_RATIO;

    // MongoDB readyState: 1 = connected.  We report it but don't fail health on
    // a transient disconnect — Mongoose reconnects automatically.
    const mongoState = mongoose.connection.readyState;
    const workerState = getWorkerHealthState();
    const workerOk = !WORKER_HEALTH_ENFORCED
      || workerState.shuttingDown
      || workerState.consumerReady
      || workerState.reconnecting;

    const isHealthy = memOk && workerOk;
    const statusCode = isHealthy ? 200 : 503;

    const body = {
      status: isHealthy ? 'ok' : 'unhealthy',
      checks: {
        memory: {
          status: memOk ? 'ok' : 'critical',
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
          heapRatio: heapRatio.toFixed(3),
          rssMB: Math.round(mem.rss / 1024 / 1024),
        },
        mongodb: {
          // 0=disconnected 1=connected 2=connecting 3=disconnecting
          status: mongoState === 1 ? 'ok' : 'disconnected',
          readyState: mongoState,
        },
        worker: {
          status: workerOk ? 'ok' : 'degraded',
          consumerReady: workerState.consumerReady,
          reconnecting: workerState.reconnecting,
          shuttingDown: workerState.shuttingDown,
          enforced: WORKER_HEALTH_ENFORCED,
        },
      },
    };

    if (!isHealthy) {
      logger.warn('[Health] Returning 503 — health checks failed', {
        heapUsedMB: body.checks.memory.heapUsedMB,
        heapTotalMB: body.checks.memory.heapTotalMB,
        heapRatio: body.checks.memory.heapRatio,
        worker: body.checks.worker,
      });
    }

    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  });

  server.listen(HEALTH_PORT, '0.0.0.0', () => {
    logger.info(`[Health] Health server listening on port ${HEALTH_PORT}`);
  });

  server.on('error', (error) => {
    logger.error('[Health] Failed to start health server', { error });
    process.exit(1);
  });
};
