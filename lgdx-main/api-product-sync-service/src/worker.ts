import mongoose from 'mongoose';
import * as amqp from 'amqplib';
import CompanyApiConfig from './models/CompanyApiConfig';
import Company from './models/Company';
import { ProductProcessingStats } from './shared/productUtils';
import { jobsProcessedCounter, jobDurationHistogram } from './metrics';
import { runSpecificApiSync } from './syncLogic';
import { getRedisLockManager, initializeRedisLock, closeRedisLock } from './shared/redisLock';
import { logger } from './shared/logger';
import { getMongoUriWorker, getRabbitUrlFromEnv } from './shared/configSources';
import {
    type ApiSyncTaskPayload,
    parseApiSyncTaskPayload,
} from './shared/apiSyncPayload';

export type { ApiSyncTaskPayload };
export { parseApiSyncTaskPayload };

// Global variables for connection management
// Note: Using 'any' for amqplib types due to library type limitations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let connection: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let channel: any = null;
let isProcessing = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 5000; // 5 seconds

// Guards against multiple concurrent reconnect attempts firing simultaneously
// (connection 'error' and 'close' events often fire together on the same drop).
let isReconnecting = false;
let isShuttingDown = false;
let isWorkerConsumerReady = false;

// Task locking mechanism to prevent duplicate processing
const activeTasks = new Set<string>();
const taskLocks = new Map<string, Promise<void>>();
const taskStartTimes = new Map<string, number>(); // Track when tasks started

const QUEUE_NAME = 'api_sync_tasks';

/** Must match server `messageBroker.ts` — key blocks re-enqueue until worker clears it */
const API_SYNC_ENQUEUE_LOCK_PREFIX = process.env.API_SYNC_ENQUEUE_LOCK_PREFIX || 'sync:enqueue:';
/** Global lock to serialize all heavy jobs across services (api/file/analytics/market-price). */
const GLOBAL_SYNC_LOCK_KEY = process.env.GLOBAL_SYNC_LOCK_KEY || 'sync:lock:global';
/** Application-level retries before DLQ (header x-api-sync-retry / retry-count). */
const RETRY_HEADER = 'x-api-sync-retry';
const LEGACY_RETRY_HEADER = 'retry-count';
const DEFAULT_MAX_API_SYNC_RETRIES = 15;
// Must exceed the longest possible sync (Pure Light Diamond ≈ 90 min with retries).
// The Redis lock heartbeat (every 2 min) is the real safety valve for truly stuck tasks.
const TASK_TIMEOUT = 3 * 60 * 60 * 1000; // 3 hours

// Prevent duplicate setInterval registrations on reconnect
let stuckTaskCleanerStarted = false;

function getMaxApiSyncRetries(): number {
    const raw = process.env.API_SYNC_MAX_RETRIES;
    if (!raw) return DEFAULT_MAX_API_SYNC_RETRIES;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : DEFAULT_MAX_API_SYNC_RETRIES;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getApiSyncRetryCount(msg: any): number {
    const h = msg.properties?.headers || {};
    const raw = h[RETRY_HEADER] ?? h[LEGACY_RETRY_HEADER];
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.floor(raw));
    if (typeof raw === 'string') {
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? Math.max(0, n) : 0;
    }
    if (raw && typeof raw === 'object' && 'low' in raw) {
        const n = Number((raw as { low?: number }).low);
        return Number.isFinite(n) ? Math.max(0, n) : 0;
    }
    return 0;
}

/**
 * After a real processing failure: republish with incremented retry header, then ack.
 * Exceeding API_SYNC_MAX_RETRIES → nack without requeue (DLQ).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requeueFailedApiSyncTask(ch: any, msg: any, payload: ApiSyncTaskPayload, error: unknown): void {
    const retry = getApiSyncRetryCount(msg);
    const maxRetries = getMaxApiSyncRetries();
    if (retry >= maxRetries) {
        logger.error('[Worker] API sync exceeded max retries; message to DLQ', {
            companyId: payload.companyId,
            companyName: payload.companyName,
            retry,
            maxRetries,
            error,
        });
        try {
            ch.nack(msg, false, false);
        } catch (nackError) {
            logger.error('[Worker] Error nacking exhausted message', { error: nackError });
            if (isChannelStateError(nackError)) {
                forceRestartForBrokenChannel('nack-exhausted', nackError);
            }
        }
        return;
    }
    const next = retry + 1;
    const headers: Record<string, string | number | boolean> = {
        'task-type': 'api-sync',
        'company-id': payload.companyId,
        [RETRY_HEADER]: next,
        [LEGACY_RETRY_HEADER]: next,
    };
    try {
        ch.sendToQueue(QUEUE_NAME, msg.content, { persistent: true, headers });
        ch.ack(msg);
        logger.warn('[Worker] API sync task scheduled for retry after failure', {
            companyId: payload.companyId,
            companyName: payload.companyName,
            attempt: next,
            maxRetries,
        });
    } catch (pubErr) {
        logger.error('[Worker] Failed to republish failed task; falling back to basic requeue', { error: pubErr });
        try {
            ch.nack(msg, false, true);
        } catch (nackError) {
            logger.error('[Worker] Error on fallback nack', { error: nackError });
            if (isChannelStateError(nackError)) {
                forceRestartForBrokenChannel('nack-fallback', nackError);
            }
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nackRequeueBrokerMessage(ch: any, msg: any, reason: string): void {
    try {
        ch.nack(msg, false, true);
        logger.info(`[Worker] ${reason} — message requeued for later delivery`);
    } catch (e) {
        logger.error('[Worker] nack(requeue) failed', { error: e, reason });
        if (isChannelStateError(e)) {
            forceRestartForBrokenChannel('nack-requeue', e);
        }
    }
}

function isChannelStateError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('Channel closed')
        || message.includes('Connection closed')
        || message.includes('IllegalOperationError')
        || message.includes('CHANNEL-ERROR');
}

function forceRestartForBrokenChannel(context: string, error: unknown): void {
    if (isShuttingDown) {
        logger.warn('[Worker] Channel error during shutdown, skipping forced restart', { context, error });
        return;
    }

    logger.error('[Worker] Fatal RabbitMQ channel state detected, forcing process restart', { context, error });
    // Allow log flush before exit.
    setTimeout(() => process.exit(1), 500);
}

/**
 * Check if a task is already running for a company
 */
function isTaskRunning(companyId: string): boolean {
    if (!activeTasks.has(companyId)) {
        return false;
    }
    
    // Check if task has timed out
    const startTime = taskStartTimes.get(companyId);
    if (startTime && Date.now() - startTime > TASK_TIMEOUT) {
        logger.warn(`[Worker] Task for company ${companyId} has timed out (${TASK_TIMEOUT}ms), clearing stuck task`);
        activeTasks.delete(companyId);
        taskStartTimes.delete(companyId);
        taskLocks.delete(companyId);
        return false;
    }
    
    return true;
}

/**
 * Acquire task lock for a company
 */
function acquireTaskLock(companyId: string): boolean {
    if (activeTasks.has(companyId)) {
        return false;
    }
    activeTasks.add(companyId);
    taskStartTimes.set(companyId, Date.now());
    return true;
}

/**
 * Release task lock for a company
 */
function releaseTaskLock(companyId: string): void {
    activeTasks.delete(companyId);
    taskLocks.delete(companyId);
    taskStartTimes.delete(companyId);
}

/**
 * Force clear stuck tasks (for debugging and recovery)
 */
function clearStuckTasks(): void {
    const now = Date.now();
    let clearedCount = 0;
    
    for (const [companyId, startTime] of taskStartTimes.entries()) {
        if (now - startTime > TASK_TIMEOUT) {
            logger.warn(`[Worker] Force clearing stuck task for company ${companyId}`, { startedSecondsAgo: Math.round((now - startTime) / 1000) });
            activeTasks.delete(companyId);
            taskStartTimes.delete(companyId);
            taskLocks.delete(companyId);
            clearedCount++;
        }
    }
    
    if (clearedCount > 0) {
        logger.info(`[Worker] Cleared ${clearedCount} stuck tasks`);
    }
}

/**
 * Handle RabbitMQ connection errors and attempt reconnection.
 *
 * Critical invariant: we NEVER start a new consumer while tasks from the
 * previous consumer are still running.  Violation leads to two workers
 * consuming from the same queue simultaneously, doubling memory usage and
 * risking an OOM-kill (exit 137) of the container.
 */
async function handleConnectionError(): Promise<void> {
    // Both connection.on('error') and connection.on('close') fire on a single
    // drop — deduplicate with a simple flag.
    if (isReconnecting) {
        logger.debug('[Worker] Reconnect already in progress — ignoring duplicate error event');
        return;
    }
    isReconnecting = true;
    isWorkerConsumerReady = false;

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        logger.error(`[Worker] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Exiting...`);
        process.exit(1);
    }

    reconnectAttempts++;
    logger.info(`[Worker] Attempting to reconnect to RabbitMQ`, { attempt: reconnectAttempts, maxAttempts: MAX_RECONNECT_ATTEMPTS });

    try {
        // Close stale connections first
        if (channel) {
            try { await channel.close(); } catch (_e) { /* ignore */ }
            channel = null;
        }
        if (connection) {
            try { await connection.close(); } catch (_e) { /* ignore */ }
            connection = null;
        }

        // *** KEY SAFETY GATE ***
        // Wait for any tasks that are still running on the OLD consumer before
        // we register a new one.  Without this gate, the new consumer picks up
        // the next queue message while the old task is still processing, causing
        // concurrent heavy syncs that spike RAM to 1.7 GB+ and trigger OOM kill.
        if (taskLocks.size > 0) {
            logger.info(
                `[Worker] Waiting up to 20s for ${taskLocks.size} active task(s) to finish before reconnecting...`,
            );
            await Promise.race([
                Promise.allSettled(Array.from(taskLocks.values())),
                new Promise(resolve => setTimeout(resolve, 20_000)),
            ]);
            logger.info('[Worker] Active-task wait completed — proceeding with reconnect');
        }

        // Back-off before reconnect
        await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));

        await startWorker();
        // reconnectAttempts is reset inside initializeConnections on success

    } catch (error) {
        logger.error(`[Worker] Reconnection attempt ${reconnectAttempts} failed`, { error });
        isReconnecting = false;
        setTimeout(handleConnectionError, RECONNECT_DELAY);
        return;
    }

    isReconnecting = false;
}

/**
 * Initialize connections to MongoDB and RabbitMQ
 */
async function initializeConnections(): Promise<void> {
    try {
        logger.info('[Worker] Starting to initialize connections...');
        
        // Connect to MongoDB
        const mongoURI = getMongoUriWorker();
        if (process.env.MONGODB_URI_FILE) {
          logger.info('[Worker] Mongo URI resolved via MONGODB_URI_FILE');
        } else {
          logger.info('[Worker] Mongo URI from MONGODB_URI or default');
        }
        await mongoose.connect(mongoURI);
        logger.info('[Worker] Connected to MongoDB');

        // Connect to RabbitMQ with enhanced connection options
        logger.debug('[Worker] About to get RabbitMQ URL...');
        const rabbitMQUrl = getRabbitUrlFromEnv();
        connection = await amqp.connect(rabbitMQUrl, {
            heartbeat: 60,
            connection_timeout: 60000,
            channel_max: 0,
            frame_max: 0
        });
        
        // Add connection event handlers
        connection.on('error', (err: unknown) => {
            logger.error('[Worker] RabbitMQ connection error', { error: err });
            handleConnectionError();
        });
        
        connection.on('close', () => {
            logger.warn('[Worker] RabbitMQ connection closed');
            handleConnectionError();
        });
        
        channel = await connection.createChannel();
        
        // Add channel event handlers
        channel.on('error', (err: unknown) => {
            logger.error('[Worker] RabbitMQ channel error', { error: err });
            handleConnectionError();
        });
        
        channel.on('return', (msg: unknown) => {
            logger.warn('[Worker] RabbitMQ message returned', { message: msg });
        });
        
        // Declare DLX and DLQ for failed messages
        const DLX = 'api_sync_dlx';
        const DLQ = 'api_sync_dlq';
        await channel.assertExchange(DLX, 'direct', { durable: true });
        await channel.assertQueue(DLQ, { durable: true });
        await channel.bindQueue(DLQ, DLX, DLQ);

        // Ensure main queue exists with DLX
        await channel.assertQueue(QUEUE_NAME, { 
            durable: true,
            arguments: {
                'x-message-ttl': 7200000, // 2 hours — align with scheduler/messageBroker
                'x-dead-letter-exchange': DLX,
                'x-dead-letter-routing-key': DLQ
            }
        });
        
        // Set prefetch to process one message at a time
        await channel.prefetch(1);
        
        // Reset reconnect attempts on successful connection
        reconnectAttempts = 0;
        
        logger.info('[Worker] Connected to RabbitMQ and ready to process API sync tasks');

    } catch (error) {
        logger.error('[Worker] Failed to initialize connections', { error });
        throw error;
    }
}

/**
 * Start the worker to process API sync tasks
 */
export async function startWorker(): Promise<void> {
    try {
        isShuttingDown = false;
        await initializeConnections();
        
        // 🔒 Initialize Redis for distributed locking
        await initializeRedisLock();
        logger.info('[Worker] ✅ Redis distributed lock initialized');

        if (!channel) {
            throw new Error('RabbitMQ channel not initialized');
        }

        logger.info('[Worker] Starting API sync worker...');

        // Start consuming messages with enhanced error handling
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await channel.consume(QUEUE_NAME, async (msg: any) => {
            if (!msg) return;

            let payload: ApiSyncTaskPayload;
            try {
                const parsed = JSON.parse(msg.content.toString()) as unknown;
                const validated = parseApiSyncTaskPayload(parsed);
                if (!validated) {
                    logger.error('[Worker] Invalid api sync payload (missing fields or invalid ObjectId ids)');
                    try {
                        channel!.nack(msg, false, false);
                    } catch (nackError) {
                        logger.error('[Worker] Error nacking invalid payload', { error: nackError });
                    }
                    return;
                }
                payload = validated;
            } catch (parseErr) {
                logger.error('[Worker] Invalid JSON in api_sync_tasks message; rejecting to DLQ', { error: parseErr });
                try {
                    channel!.nack(msg, false, false);
                } catch (nackError) {
                    logger.error('[Worker] Error nacking poison message', { error: nackError });
                    if (isChannelStateError(nackError)) {
                        forceRestartForBrokenChannel('nack-poison', nackError);
                    }
                }
                return;
            }

            logger.info(`[Worker] Received API sync task`, { companyId: payload.companyId, companyName: payload.companyName });

            // Same company may be queued twice (Sync All + cron, or multiple workers). Requeue — do not ack away.
            if (isTaskRunning(payload.companyId)) {
                logger.warn(`[Worker] Task for company ${payload.companyName} (${payload.companyId}) already running in this worker — requeueing`);
                nackRequeueBrokerMessage(channel!, msg, 'Duplicate in-flight task');
                return;
            }

            const redisLockManager = getRedisLockManager();

            // 🔒 GLOBAL DISTRIBUTED LOCK: serialize *all* heavy jobs system-wide
            const globalLockValue = `api-sync-global-${payload.companyId}-${Date.now()}`;
            const globalLockAcquired = await redisLockManager.acquireLock(GLOBAL_SYNC_LOCK_KEY, globalLockValue, 300);
            if (!globalLockAcquired) {
                const lockInfo = await redisLockManager.getLockInfo(GLOBAL_SYNC_LOCK_KEY);
                logger.info('[Worker] 🔒 Global sync lock is held — requeueing', { lockInfo });
                nackRequeueBrokerMessage(channel!, msg, 'Global sync lock held');
                return;
            }

            // Heartbeat for the global lock (avoid expiry mid-run)
            const GLOBAL_LOCK_HEARTBEAT_INTERVAL = 2 * 60 * 1000; // 2 minutes
            const GLOBAL_LOCK_HEARTBEAT_TTL = 5 * 60; // 5 minutes
            const globalLockHeartbeat = setInterval(async () => {
                const extended = await redisLockManager.extendLock(GLOBAL_SYNC_LOCK_KEY, globalLockValue, GLOBAL_LOCK_HEARTBEAT_TTL);
                if (!extended) {
                    logger.warn('[Worker] ⚠️ Global lock heartbeat failed — lock may have been lost', { key: GLOBAL_SYNC_LOCK_KEY });
                }
            }, GLOBAL_LOCK_HEARTBEAT_INTERVAL);

            // 🔒 COMPANY DISTRIBUTED LOCK: prevents concurrent sync for the same company
            const lockKey = `sync:lock:${payload.companyId}`;
            const lockValue = `api-sync-${payload.companyId}-${Date.now()}`;
            
            // Initial TTL = 5 min; the heartbeat below extends it every 2 min for the
            // full duration of the task, so the lock never expires while work is in progress.
            const lockAcquired = await redisLockManager.acquireLock(lockKey, lockValue, 300);
            
            if (!lockAcquired) {
                // Check lock info
                const lockInfo = await redisLockManager.getLockInfo(lockKey);
                logger.info(`[Worker] 🔒 Company sync already in progress for ${payload.companyName} (${payload.companyId})`, { lockInfo });
                nackRequeueBrokerMessage(channel!, msg, 'Redis lock held by another sync');
                clearInterval(globalLockHeartbeat);
                await redisLockManager.releaseLock(GLOBAL_SYNC_LOCK_KEY, globalLockValue);
                return;
            }
            
            // Also acquire in-memory lock for backward compatibility
            if (!acquireTaskLock(payload.companyId)) {
                logger.warn(`[Worker] Could not acquire in-memory lock (should not happen after Redis lock)`);
                await redisLockManager.releaseLock(lockKey, lockValue);
                nackRequeueBrokerMessage(channel!, msg, 'In-memory task lock busy');
                return;
            }

            // Server sets sync:enqueue:{companyId} (NX, long TTL) so repeated "Sync" clicks do not flood the queue.
            // Once we own the message, clear it so the user can enqueue another run after this job finishes.
            const enqueueKey = `${API_SYNC_ENQUEUE_LOCK_PREFIX}${payload.companyId}`;
            const delEnqueue = await redisLockManager.deleteKey(enqueueKey);
            if (delEnqueue > 0) {
                logger.info('[Worker] Cleared enqueue dedupe key (server can queue another sync for this company)', {
                    companyId: payload.companyId,
                    key: enqueueKey,
                });
            }

            // Запускаем таймер для гистограммы
            const endTimer = jobDurationHistogram.startTimer({ supplier: payload.companyName });

            // Heartbeat: extend the Redis lock every 2 minutes so it never expires while
            // the task is legitimately running (Pure Light Diamond sync takes 60–90 min).
            const LOCK_HEARTBEAT_INTERVAL = 2 * 60 * 1000; // 2 minutes
            const LOCK_HEARTBEAT_TTL = 5 * 60; // extend by 5 more minutes each tick
            const lockHeartbeat = setInterval(async () => {
                const extended = await redisLockManager.extendLock(lockKey, lockValue, LOCK_HEARTBEAT_TTL);
                if (extended) {
                    logger.debug('[Worker] Redis lock heartbeat extended', { key: lockKey, ttlSeconds: LOCK_HEARTBEAT_TTL });
                } else {
                    logger.warn('[Worker] ⚠️ Redis lock heartbeat failed — lock may have been stolen or expired', { key: lockKey, companyId: payload.companyId });
                }
            }, LOCK_HEARTBEAT_INTERVAL);
            
            try {
                // Check if connection is still valid before processing
                if (!connection || !channel) {
                    throw new Error('RabbitMQ connection lost during processing');
                }
                
                // Create a promise for this task to track completion
                const taskPromise = processApiSyncTask(payload);
                taskLocks.set(payload.companyId, taskPromise);
                
                await taskPromise;

                // Увеличиваем счетчик успешных заданий
                jobsProcessedCounter.inc({ supplier: payload.companyName, status: 'success' });

                // Acknowledge the message with error handling
                try {
                    channel!.ack(msg);
                    logger.info(`[Worker] API sync task completed for company: ${payload.companyName}`);
                } catch (ackError) {
                    logger.error('[Worker] Error acknowledging message', { error: ackError });
                    if (isChannelStateError(ackError)) {
                        forceRestartForBrokenChannel('ack', ackError);
                    }
                }

                // ОСВОБОЖДЕНИЕ ПАМЯТИ ПОСЛЕ ОБРАБОТКИ ЗАДАЧИ
                if (global.gc) {
                  try {
                    global.gc();
                    logger.debug(`[Worker] Forced garbage collection after processing task for ${payload.companyName}`);
                  } catch (gcError) {
                    logger.warn(`[Worker] GC error after processing task for ${payload.companyName}`, { error: gcError });
                  }
                }

            } catch (error) {
                // Увеличиваем счетчик проваленных заданий
                jobsProcessedCounter.inc({ supplier: payload.companyName, status: 'failed' });

                logger.error('[Worker] Error processing API sync task', { error, companyId: payload.companyId, companyName: payload.companyName });
                
                try {
                    requeueFailedApiSyncTask(channel!, msg, payload, error);
                } catch (requeueErr) {
                    logger.error('[Worker] Error while scheduling retry / DLQ', { error: requeueErr });
                    if (isChannelStateError(requeueErr)) {
                        forceRestartForBrokenChannel('requeue-failed', requeueErr);
                    }
                }
            } finally {
                // Stop the heartbeat before releasing the lock
                clearInterval(lockHeartbeat);
                clearInterval(globalLockHeartbeat);

                // 🔓 Release distributed lock (reuse the already-obtained manager instance)
                await redisLockManager.releaseLock(lockKey, lockValue);
                await redisLockManager.releaseLock(GLOBAL_SYNC_LOCK_KEY, globalLockValue);
                
                // Release task lock
                releaseTaskLock(payload.companyId);
                
                // Останавливаем таймер и записываем результат в любом случае
                endTimer();
            }
        });

        logger.info('[Worker] API sync worker is running. Waiting for tasks...');
        isWorkerConsumerReady = true;

        // Register the stuck-task cleaner only once — not on every reconnect
        if (!stuckTaskCleanerStarted) {
            setInterval(clearStuckTasks, 5 * 60 * 1000);
            stuckTaskCleanerStarted = true;
        }

    } catch (error) {
        logger.error('[Worker] Failed to start worker', { error });
        process.exit(1);
    }
}

/**
 * Process a single API sync task - simplified and aligned with refactored sync logic.
 */
export async function processApiSyncTask(payload: ApiSyncTaskPayload): Promise<void> {
    const { configId } = payload;

    // The sync logic, including stat initialization and error handling,
    // is now fully contained within runSpecificApiSync.
    await runSpecificApiSync(
        configId,
        {
            preDeleteStale: true // FIXED: Enable deletion of products that disappeared from API
        }
    );
}

/**
 * Cleanup function for graceful shutdown
 * Exported to be used by gracefulShutdown utility
 */
export async function cleanupWorker(): Promise<void> {
    logger.info('[Worker] Cleaning up worker resources...');
    isShuttingDown = true;
    isWorkerConsumerReady = false;
    
    // Stop processing new messages
    isProcessing = false;
    
    // Wait briefly for active tasks to finish.
    // Docker's default stop_grace_period is 10s — we budget 8s here so there
    // is still time to close connections cleanly before SIGKILL arrives.
    if (taskLocks.size > 0) {
        logger.info(`[Worker] Waiting up to 8s for ${taskLocks.size} active task(s) to complete...`);
        await Promise.race([
            Promise.allSettled(Array.from(taskLocks.values())),
            new Promise(resolve => setTimeout(resolve, 8_000)),
        ]);
        logger.info('[Worker] Active-task shutdown wait completed');
    }
    
    // 🔒 Close Redis lock connection
    await closeRedisLock();
    
    // Close RabbitMQ connections with timeout
    if (channel) {
        try {
            await Promise.race([
                channel.close(),
                new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
            ]);
        } catch (error) {
            logger.warn('[Worker] Error closing channel', { error });
        }
    }
    
    if (connection) {
        try {
            await Promise.race([
                connection.close(),
                new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
            ]);
        } catch (error) {
            logger.warn('[Worker] Error closing connection', { error });
        }
    }
    
    // Close MongoDB connection
    try {
        await mongoose.disconnect();
    } catch (error) {
        logger.warn('[Worker] Error disconnecting from MongoDB', { error });
    }
}

export function getWorkerHealthState(): {
    consumerReady: boolean;
    reconnecting: boolean;
    shuttingDown: boolean;
} {
    return {
        consumerReady: isWorkerConsumerReady,
        reconnecting: isReconnecting,
        shuttingDown: isShuttingDown,
    };
}

// Start the worker if this file is run directly
if (require.main === module) {
    startWorker().catch((error) => {
        logger.error('[Worker] Failed to start', { error });
        process.exit(1);
    });
} 