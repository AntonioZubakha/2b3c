import { _processInventoryFileInBackground } from '../controllers/inventoryController';
import { ICompanyDocument } from '../models/Company';
import * as amqplib from 'amqplib';
import type { RedisClientType } from 'redis';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';
import { initializeRedisClient } from '../config/redis';
import type { WhatsAppIncomingMessagePayload } from '../whatsapp/whatsapp.types';
import { WHATSAPP_CHANNEL_CLOUD } from '../whatsapp/whatsapp.types';

// Message payload interfaces
interface ApiSyncTaskPayload {
    configId: string;
    companyId: string;
    companyName: string;
}

interface FileUploadTaskPayload {
    filePath: string;
    userId: string;
    companyDoc: ICompanyDocument;
    companyName: string;
    originalFileName: string;
    uploadMode: 'replace' | 'add';
}

// Configuration
const ARE_MICROSERVICES_LIVE = process.env.ARE_MICROSERVICES_LIVE === 'true';

// RabbitMQ configuration
const getRabbitMQUrl = () => {
  const isProd = process.env.NODE_ENV === 'production';
  // If RABBITMQ_URL_FILE is provided, read from file
  if (process.env.RABBITMQ_URL_FILE) {
    try {
      const url = require('fs').readFileSync(process.env.RABBITMQ_URL_FILE, 'utf8').trim();
      logger.info('[MessageBroker] Using RabbitMQ URL from file');
      return url;
    } catch (e) {
      logger.error('[MessageBroker] Failed to read RABBITMQ_URL_FILE:', { error: e });
    }
  }
  
  // If RABBITMQ_URL is provided, use it
  if (process.env.RABBITMQ_URL) {
    return process.env.RABBITMQ_URL;
  }

  if (isProd) {
    throw new Error('[Security] RABBITMQ_URL (or RABBITMQ_URL_FILE) is required in production');
  }
  
  // Otherwise, construct from individual variables
  const user = process.env.RABBITMQ_USER || 'lgdx';
  const pass = process.env.RABBITMQ_PASS || 'test123';
  const host = process.env.RABBITMQ_HOST || 'rabbitmq';
  const port = process.env.RABBITMQ_PORT || '5672';
  
  return `amqp://${user}:${pass}@${host}:${port}`;
};

const RABBITMQ_URL = getRabbitMQUrl();
const API_SYNC_QUEUE = 'api_sync_tasks';
// Dead-letter configuration (must match worker configuration)
const DLX = 'api_sync_dlx';
const DLQ = 'api_sync_dlq';
const FILE_UPLOAD_QUEUE = 'file_upload_tasks';
const WHATSAPP_INCOMING_QUEUE = 'whatsapp_incoming_tasks';

// Dedupe for enqueuing API sync tasks:
// We set a Redis NX lock per companyId so repeated "Sync All Active APIs"
// doesn't enqueue many duplicate tasks for the same company, which later
// accumulates in DLQ.
const API_SYNC_ENQUEUE_LOCK_PREFIX = process.env.API_SYNC_ENQUEUE_LOCK_PREFIX || 'sync:enqueue:';
const API_SYNC_ENQUEUE_LOCK_TTL_SECONDS = (() => {
  const raw = process.env.API_SYNC_ENQUEUE_LOCK_TTL_SECONDS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  // 4h safety window covers long suppliers while staying bounded.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4 * 60 * 60;
})();

let enqueueRedisClient: RedisClientType | null = null;
let enqueueRedisInitPromise: Promise<RedisClientType | null> | null = null;

async function getEnqueueRedisClient(): Promise<RedisClientType | null> {
  if (enqueueRedisClient) return enqueueRedisClient;
  if (enqueueRedisInitPromise) return enqueueRedisInitPromise;

  enqueueRedisInitPromise = initializeRedisClient()
    .then((client) => {
      enqueueRedisClient = client;
      return enqueueRedisClient;
    })
    .catch((err) => {
      logger.error('[MessageBroker] Redis init failed for enqueue dedupe', { error: getErrorMessage(err) });
      enqueueRedisClient = null;
      return null;
    });

  return enqueueRedisInitPromise;
}

const getMongoUri = () => {
  if (process.env.MONGODB_URI_FILE) {
    try {
      return require('fs').readFileSync(process.env.MONGODB_URI_FILE, 'utf8').trim();
    } catch (e) {
      logger.error('[Config] Failed to read MONGODB_URI_FILE:', { error: e });
    }
  }
  return process.env.MONGODB_URI;
};

// Global connection and channel
let connection: any = null;
let channel: any = null;

/**
 * Initialize RabbitMQ connection and channel
 */
export async function initializeMessageBroker(): Promise<void> {
    if (!ARE_MICROSERVICES_LIVE) {
        logger.info('[MessageBroker] Microservices are disabled. Running in local mode.');
        return;
    }

    try {
        logger.info('[MessageBroker] Connecting to RabbitMQ...');
        connection = await amqplib.connect(RABBITMQ_URL);
        if (connection) {
            channel = await connection.createChannel();
            // Handle channel-level errors to avoid unhandled exceptions
            channel.on('error', (err: Error) => {
                logger.error('[MessageBroker] Channel error:', { error: err });
                handleConnectionError();
            });
            channel.on('return', (msg: any) => {
                logger.warn('[MessageBroker] Message returned', { headers: msg?.properties?.headers || {} });
            });
        }

        // Ensure DLX and DLQ exist (must be consistent with worker to avoid 406 PRECONDITION_FAILED)
        await channel.assertExchange(DLX, 'direct', { durable: true });
        await channel.assertQueue(DLQ, { durable: true });
        await channel.bindQueue(DLQ, DLX, DLQ);

        // Create main API sync queue with DLX configured
        await channel.assertQueue(API_SYNC_QUEUE, { 
            durable: true,
            arguments: {
                'x-message-ttl': 7200000, // 2 hours — sequential api-sync can exceed 1h queue wait
                'x-dead-letter-exchange': DLX,
                'x-dead-letter-routing-key': DLQ
            }
        });
        
        await channel.assertQueue(FILE_UPLOAD_QUEUE, { 
            durable: true,
            arguments: {
                'x-message-ttl': 7200000, // 2 hours TTL (files take longer)
                // Consider adding DLX for file upload queue in the future for consistency
            }
        });

        await channel.assertQueue(WHATSAPP_INCOMING_QUEUE, {
            durable: true,
            arguments: {
                'x-message-ttl': 900000 // 15 minutes — Meta expects timely replies
            }
        });

        // Handle connection events
        connection.on('error', (err: Error) => {
            logger.error('[MessageBroker] Connection error:', { error: err });
            handleConnectionError();
        });

        connection.on('close', () => {
            logger.warn('[MessageBroker] Connection closed');
            setTimeout(initializeMessageBroker, 5000); // Reconnect after 5s
        });

        logger.info('[MessageBroker] Successfully connected to RabbitMQ');
    } catch (error) {
        logger.error('[MessageBroker] Failed to initialize:', { error });
        setTimeout(initializeMessageBroker, 10000); // Retry after 10s
    }
}

/**
 * Handle connection errors with graceful degradation
 */
function handleConnectionError(): void {
    connection = null;
    channel = null;
    logger.info('[MessageBroker] Attempting to reconnect...');
    setTimeout(initializeMessageBroker, 5000);
}

/**
 * Publish API sync task to queue
 */
export const publishApiSyncTask = async (payload: ApiSyncTaskPayload): Promise<void> => {
    logger.info(`[MessageBroker] Publishing API sync task for: ${payload.companyName}`);

    if (!ARE_MICROSERVICES_LIVE) {
        // Fallback to direct execution in main process
        logger.info('[MessageBroker] Microservices disabled, API sync should be handled by scheduler');
        return;
    }

    if (!channel) {
        logger.error('[MessageBroker] RabbitMQ channel not available for API sync');
        throw new Error('Message broker not available. Task cannot be queued.');
    }

    try {
        // ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: Проверяем, не выполняется ли уже синхронизация
        const CompanyApiConfig = require('../models/CompanyApiConfig').default;
        const config = await CompanyApiConfig.findById(payload.configId);
        
        if (config && config.syncStatus === 'in_progress') {
            const lastSyncTime = config.lastSync;
            const timeSinceLastSync = lastSyncTime ? Date.now() - new Date(lastSyncTime).getTime() : 0;
            
            // Если последняя синхронизация была менее 5 минут назад, пропускаем
            if (timeSinceLastSync < 5 * 60 * 1000) {
                logger.info(`[MessageBroker] Skipping sync for ${payload.companyName} - already in progress (last sync: ${Math.round(timeSinceLastSync / 1000)}s ago)`);
                return;
            }
            
            // Если прошло больше 5 минут, но статус все еще in_progress, сбрасываем
            logger.warn(`[MessageBroker] Previous sync for ${payload.companyName} appears to have hung. Resetting status.`);
            config.syncStatus = 'idle';
            config.lastSyncError = 'Previous sync hung, resetting status';
            await config.save();
        }

        // Dedupe on enqueue level: prevent multiple queued tasks per companyId.
        const redis = await getEnqueueRedisClient();
        if (redis) {
            const lockKey = `${API_SYNC_ENQUEUE_LOCK_PREFIX}${payload.companyId}`;
            const lockValue = `api-sync-enqueue-${payload.companyId}-${Date.now()}`;

            const ok = await redis.set(lockKey, lockValue, {
                NX: true,
                EX: API_SYNC_ENQUEUE_LOCK_TTL_SECONDS,
            });

            if (!ok) {
                logger.info(`[MessageBroker] Skipping enqueue for ${payload.companyName} (already enqueued recently)`, {
                    companyId: payload.companyId,
                });
                return;
            }
        }

        const message = Buffer.from(JSON.stringify(payload));
        await channel.sendToQueue(API_SYNC_QUEUE, message, { 
            persistent: true,
            headers: {
                'task-type': 'api-sync',
                'company-id': payload.companyId,
                'x-api-sync-retry': 0,
                'retry-count': 0
            }
        });
        
        logger.info(`[MessageBroker] API sync task published for ${payload.companyName}`);
    } catch (error: unknown) {
        logger.error(`[MessageBroker] Error publishing API sync task:`, { error });
        throw new Error(`Failed to queue API sync task: ${getErrorMessage(error)}`);
    }
};

/**
 * Publish file upload task to queue
 */
export const publishFileUploadTask = async (payload: FileUploadTaskPayload): Promise<void> => {
    logger.info(`[MessageBroker] Publishing file upload task: ${payload.originalFileName}`);

    if (!ARE_MICROSERVICES_LIVE) {
        // Fallback to direct execution in main process
        logger.info('[MessageBroker] Executing file upload directly (microservices disabled)');
        await _processInventoryFileInBackground(
            payload.filePath,
            payload.userId,
            payload.companyDoc,
            payload.companyName,
            payload.originalFileName,
            payload.uploadMode
        );
        return;
    }

    if (!channel) {
        logger.error('[MessageBroker] RabbitMQ channel not available for file upload');
        throw new Error('Message broker not available. Task cannot be queued.');
    }

    try {
        // Serialize company doc to avoid circular references
        const serializedPayload = {
            ...payload,
            companyDoc: {
                _id: payload.companyDoc._id,
                name: payload.companyDoc.name,
                // Add any other necessary fields, but avoid sending the whole document
            }
        };

        const message = Buffer.from(JSON.stringify(serializedPayload));
        await channel.sendToQueue(FILE_UPLOAD_QUEUE, message, { 
            persistent: true,
            headers: {
                'task-type': 'file-upload',
                'company-id': payload.companyDoc._id.toString(),
                'file-name': payload.originalFileName,
                'retry-count': 0
            }
        });
        
        logger.info(`[MessageBroker] File upload task published: ${payload.originalFileName}`);
    } catch (error: unknown) {
        logger.error(`[MessageBroker] Error publishing file upload task:`, { error });
        throw new Error(`Failed to queue file upload task: ${getErrorMessage(error)}`);
    }
};

/**
 * Publish inbound WhatsApp message for async processing.
 */
export const publishWhatsAppIncomingTask = async (payload: WhatsAppIncomingMessagePayload): Promise<void> => {
    if (!ARE_MICROSERVICES_LIVE) {
        logger.warn('[MessageBroker] publishWhatsAppIncomingTask called while microservices disabled — use inline worker');
        return;
    }

    if (!channel) {
        logger.error('[MessageBroker] RabbitMQ channel not available for WhatsApp');
        throw new Error('Message broker not available. WhatsApp task cannot be queued.');
    }

    try {
        const normalized: WhatsAppIncomingMessagePayload = {
            ...payload,
            channel: payload.channel ?? WHATSAPP_CHANNEL_CLOUD,
            enqueuedAtMs: Date.now()
        };
        const message = Buffer.from(JSON.stringify(normalized));
        await channel.sendToQueue(WHATSAPP_INCOMING_QUEUE, message, {
            persistent: true,
            headers: {
                'task-type': 'whatsapp-incoming',
                'message-id': payload.messageId
            }
        });
        logger.debug('[MessageBroker] WhatsApp incoming task published', { messageId: payload.messageId });
    } catch (error: unknown) {
        logger.error('[MessageBroker] Error publishing WhatsApp task:', { error });
        throw new Error(`Failed to queue WhatsApp task: ${getErrorMessage(error)}`);
    }
};

/**
 * Simple health check for RabbitMQ - no circular references
 */
export const isMessageBrokerHealthy = (): boolean => {
    return !!(connection && channel);
};

/**
 * Get message broker status for health checks
 */
export const getMessageBrokerStatus = async (): Promise<{
    connected: boolean;
    connectionState: string;
    channelState: string;
    queues: {
        apiSyncQueue: { messageCount: number };
        fileUploadQueue: { messageCount: number };
    };
}> => {
    const isConnected = connection && channel;
    const connectionState = connection ? 'connected' : 'disconnected';
    const channelState = channel ? 'open' : 'closed';
    
    let queues = {
        apiSyncQueue: { messageCount: 0 },
        fileUploadQueue: { messageCount: 0 },
        whatsappIncomingQueue: { messageCount: 0 }
    };

    if (isConnected) {
        try {
            const apiQueue = await channel.checkQueue(API_SYNC_QUEUE);
            const fileQueue = await channel.checkQueue(FILE_UPLOAD_QUEUE);
            const waQueue = await channel.checkQueue(WHATSAPP_INCOMING_QUEUE);

            queues = {
                apiSyncQueue: { messageCount: apiQueue.messageCount },
                fileUploadQueue: { messageCount: fileQueue.messageCount },
                whatsappIncomingQueue: { messageCount: waQueue.messageCount }
            };
        } catch (error) {
            logger.error('[MessageBroker] Error getting queue stats:', { error });
        }
    }

    return {
        connected: isConnected,
        connectionState,
        channelState,
        queues
    };
};

/**
 * Get queue statistics
 */
export const getQueueStats = async (): Promise<{
    apiSyncQueue: { messageCount: number };
    fileUploadQueue: { messageCount: number };
    whatsappIncomingQueue: { messageCount: number };
}> => {
    if (!channel) {
        return {
            apiSyncQueue: { messageCount: 0 },
            fileUploadQueue: { messageCount: 0 },
            whatsappIncomingQueue: { messageCount: 0 }
        };
    }

    try {
        const apiQueue = await channel.checkQueue(API_SYNC_QUEUE);
        const fileQueue = await channel.checkQueue(FILE_UPLOAD_QUEUE);
        const waQueue = await channel.checkQueue(WHATSAPP_INCOMING_QUEUE);

        return {
            apiSyncQueue: { messageCount: apiQueue.messageCount },
            fileUploadQueue: { messageCount: fileQueue.messageCount },
            whatsappIncomingQueue: { messageCount: waQueue.messageCount }
        };
    } catch (error) {
        logger.error('[MessageBroker] Error getting queue stats:', { error });
        return {
            apiSyncQueue: { messageCount: 0 },
            fileUploadQueue: { messageCount: 0 },
            whatsappIncomingQueue: { messageCount: 0 }
        };
    }
};

/**
 * Graceful shutdown
 */
export const closeMessageBroker = async (): Promise<void> => {
    if (channel) {
        await channel.close();
        channel = null;
    }
    if (connection) {
        await connection.close();
        connection = null;
    }
    logger.info('[MessageBroker] Connections closed');
};

// Initialize on module load
initializeMessageBroker().catch((err) => logger.error('[MessageBroker] Initialization error:', { error: err }));