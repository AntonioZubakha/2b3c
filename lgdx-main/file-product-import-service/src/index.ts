// file-product-import-service/src/index.ts
import dotenv from "dotenv";
import { logger } from "./shared/logger";
import * as amqplib from "amqplib";
import mongoose from "mongoose";
import { processFileUploadTask, type FileUploadTaskPayload } from "./worker";
import { startMetricsServer } from "./metrics";
import {
  initGracefulShutdown,
  registerCleanup,
} from "./utils/gracefulShutdown";
import { initializeRedisLock, closeRedisLock } from "./shared/redisLock";
import {
  initializeMarketPriceCache,
  shutdownMarketPriceCache,
} from "./shared/marketPriceCacheClient";
import {
  getMongoUriFileImport,
  getRabbitUrlFileImport,
} from "./shared/configSources";
import { parseFileUploadTaskPayload } from "./shared/fileUploadPayload";

dotenv.config();

// Log Telegram configuration for debugging
logger.info(
  "[Config] STOCK_TELEGRAM_BOT_TOKEN: " +
    (process.env.STOCK_TELEGRAM_BOT_TOKEN ? "SET" : "NOT SET"),
);
logger.info(
  "[Config] STOCK_TELEGRAM_CHAT_ID: " +
    (process.env.STOCK_TELEGRAM_CHAT_ID ? "SET" : "NOT SET"),
);

logger.info(
  "[Config] RABBITMQ_URL_FILE: " +
    (process.env.RABBITMQ_URL_FILE || "(not set)"),
);
logger.info(
  "[Config] MONGODB_URI_FILE: " + (process.env.MONGODB_URI_FILE || "(not set)"),
);

const RABBITMQ_URL = getRabbitUrlFileImport();
const MONGODB_URI = getMongoUriFileImport();
const FILE_UPLOAD_QUEUE = "file_upload_tasks";
const PREFETCH_COUNT = parseInt(
  process.env.FILE_IMPORT_PREFETCH_COUNT || process.env.PREFETCH_COUNT || "1",
);
const RETRY_DELAY = parseInt(
  process.env.FILE_IMPORT_RETRY_DELAY || process.env.RETRY_DELAY || "15000",
); // 15 seconds

// Note: Using 'any' for amqplib types due to library type limitations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let connection: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let channel: any = null;

/**
 * Connect to MongoDB
 */
async function connectMongoDB(): Promise<void> {
  try {
    logger.info("[FileImportService] Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    logger.info("[FileImportService] MongoDB connected successfully");
  } catch (error) {
    logger.error(
      "[FileImportService] MongoDB connection failed: " +
        (error as Error)?.message,
    );
    throw error;
  }
}

/**
 * Connect to RabbitMQ and setup queue consumer
 */
async function connectRabbitMQ(): Promise<void> {
  try {
    logger.info(
      `[FileImportService] Connecting to RabbitMQ at ${RABBITMQ_URL}...`,
    );
    connection = await amqplib.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Set prefetch count (files are heavy, process one at a time)
    await channel.prefetch(PREFETCH_COUNT);

    // Assert queue exists
    const consumerTimeoutMs = Number(
      process.env.FILE_IMPORT_CONSUMER_TIMEOUT_MS || 2400000,
    ); // 40 min (RabbitMQ consumer ack timeout)
    await channel.assertQueue(FILE_UPLOAD_QUEUE, {
      durable: true,
      arguments: {
        "x-message-ttl": 7200000, // 2 hours TTL (files take longer)
        "x-max-retries": 3,
        "x-consumer-timeout": consumerTimeoutMs,
      },
    });

    logger.info(
      `[FileImportService] Connected to RabbitMQ. Waiting for tasks in queue: ${FILE_UPLOAD_QUEUE}`,
    );

    // Handle connection events
    connection.on("error", (err: Error) => {
      logger.error(
        "[FileImportService] RabbitMQ connection error: " +
          (err as Error)?.message,
      );
      handleConnectionError();
    });

    connection.on("close", () => {
      logger.warn("[FileImportService] RabbitMQ connection closed");
      handleConnectionError();
    });

    // Start consuming messages
    await startConsuming();
  } catch (error) {
    logger.error(
      "[FileImportService] RabbitMQ connection failed: " +
        (error as Error)?.message,
    );
    throw error;
  }
}

/**
 * Start consuming messages from the queue
 */
async function startConsuming(): Promise<void> {
  if (!channel) {
    throw new Error("Channel not available");
  }

  await channel.consume(
    FILE_UPLOAD_QUEUE,
    async (msg: amqplib.ConsumeMessage | null) => {
      if (msg === null) {
        logger.warn("[FileImportService] Received null message");
        return;
      }

      let payload: FileUploadTaskPayload | null = null;
      const startTime = Date.now();

      try {
        let parsed: unknown;
        try {
          parsed = JSON.parse(msg.content.toString());
        } catch (parseErr) {
          logger.error(
            "[FileImportService] Invalid JSON in queue message; discarding",
            { error: parseErr },
          );
          channel?.nack(msg, false, false);
          return;
        }

        const validated = parseFileUploadTaskPayload(parsed);
        if (!validated) {
          logger.error(
            "[FileImportService] Invalid file upload payload shape; discarding",
          );
          channel?.nack(msg, false, false);
          return;
        }

        const { _id: _dropPlainId, ...companyRest } = validated.companyDocPlain;
        void _dropPlainId;
        const taskPayload: FileUploadTaskPayload = {
          filePath: validated.filePath,
          userId: validated.userId,
          companyDoc: {
            ...companyRest,
            _id: new (mongoose.Types.ObjectId as unknown as new (
              hex: string,
            ) => mongoose.Types.ObjectId)(validated.companyId),
          },
          companyName: validated.companyName,
          originalFileName: validated.originalFileName,
          uploadMode: validated.uploadMode,
        };
        if (validated.source) taskPayload.source = validated.source;
        if (validated.ftpSessionId)
          taskPayload.ftpSessionId = validated.ftpSessionId;
        if (validated.uploadedAt) taskPayload.uploadedAt = validated.uploadedAt;
        if (validated.fileSize !== undefined)
          taskPayload.fileSize = validated.fileSize;

        payload = taskPayload;

        logger.info(
          `[FileImportService] Processing file: ${taskPayload.originalFileName} for company: ${taskPayload.companyName}`,
        );

        // Get retry count from headers
        const retryCount =
          (msg.properties.headers?.["retry-count"] as number) || 0;

        // Process the file upload task
        await processFileUploadTask(taskPayload);

        // Acknowledge successful processing
        channel?.ack(msg);

        const duration = Date.now() - startTime;
        if (payload) {
          logger.info(
            `[FileImportService] ✅ File processed successfully: ${payload.originalFileName} in ${duration}ms`,
          );
        }
      } catch (error: unknown) {
        const fileName = payload ? payload.originalFileName : "unknown file";
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorName = error instanceof Error ? error.name : "UnknownError";

        // Resource contention (global/job lock): do NOT burn retry-count, just delay and retry
        if (errorName === "ResourceBusyError") {
          const busyRetryCount =
            (msg.properties.headers?.["busy-retry-count"] as number) || 0;
          const maxBusyRetries = 120; // ~1h if delay=30s
          const delayMs = 30000;

          if (busyRetryCount < maxBusyRetries) {
            logger.warn(
              `[FileImportService] ⏳ Resources busy, will retry later (${busyRetryCount + 1}/${maxBusyRetries})`,
              {
                file: fileName,
                delayMs,
                reason: errorMessage,
              },
            );

            setTimeout(() => {
              if (channel) {
                const headers = {
                  ...msg.properties.headers,
                  "busy-retry-count": busyRetryCount + 1,
                  "busy-retry-reason": errorMessage,
                  "busy-retry-timestamp": new Date().toISOString(),
                };
                channel.sendToQueue(FILE_UPLOAD_QUEUE, msg.content, {
                  persistent: true,
                  headers,
                });
              }
            }, delayMs);

            channel?.ack(msg);
            return;
          }

          logger.error(
            `[FileImportService] 💀 Busy retries exceeded for file: ${fileName}. Giving up.`,
            {
              maxBusyRetries,
              reason: errorMessage,
            },
          );
          channel?.ack(msg);
          return;
        }

        logger.error(
          `[FileImportService] ❌ Error processing file ${fileName}: ${errorMessage}`,
        );

        const retryCount =
          (msg.properties.headers?.["retry-count"] as number) || 0;
        const maxRetries = 3;

        if (retryCount < maxRetries) {
          // Retry the message with exponential backoff
          const backoffDelay = RETRY_DELAY * Math.pow(2, retryCount);
          logger.info(
            `[FileImportService] Retrying file processing (attempt ${retryCount + 1}/${maxRetries}) in ${backoffDelay}ms...`,
          );

          setTimeout(() => {
            if (channel) {
              const retryHeaders = {
                ...msg.properties.headers,
                "retry-count": retryCount + 1,
                "retry-reason": errorMessage,
                "retry-timestamp": new Date().toISOString(),
              };

              channel.sendToQueue(FILE_UPLOAD_QUEUE, msg.content, {
                persistent: true,
                headers: retryHeaders,
              });
            }
          }, backoffDelay);

          channel?.ack(msg); // Remove original message
        } else {
          // Max retries exceeded - file processing failed permanently
          const fileName = payload ? payload.originalFileName : "unknown file";
          logger.error(
            `[FileImportService] 💀 Max retries exceeded for file: ${fileName}. Moving to failed state.`,
          );

          // TODO: Implement failure handling:
          // - Send notification to user
          // - Move file to failed directory
          // - Log to failure audit table
          // - Send to dead letter queue

          channel?.ack(msg); // Remove message from queue
        }
      }
    },
    {
      noAck: false, // Manual acknowledgment for reliability
    },
  );
}

/**
 * Handle connection errors with exponential backoff
 */
function handleConnectionError(): void {
  connection = null;
  channel = null;

  logger.info("[FileImportService] Attempting to reconnect in 5 seconds...");
  setTimeout(() => {
    startService().catch((e) =>
      logger.error(
        "[FileImportService] Reconnect failed: " + (e as Error)?.message,
      ),
    );
  }, 5000);
}

/**
 * Cleanup function for graceful shutdown
 */
async function cleanupService(): Promise<void> {
  logger.info("[FileImportService] Cleaning up service resources...");

  // Give time for current processing to complete
  logger.info("[FileImportService] Waiting for current tasks to complete...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // 🔒 Close Redis lock connection
  await closeRedisLock();
  await shutdownMarketPriceCache();

  if (channel) {
    await channel.close();
  }
  if (connection) {
    await connection.close();
  }
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
}

/**
 * Health check endpoint for monitoring
 */
function setupHealthCheck(): void {
  // Basic health status tracking
  const healthStatus = {
    service: "file-import-service",
    status: "healthy",
    uptime: process.uptime(),
    mongodb:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    rabbitmq: connection ? "connected" : "disconnected",
    memory: process.memoryUsage(),
    lastActivity: new Date().toISOString(),
  };

  logger.info("[FileImportService] Health status", healthStatus);

  // Log health status every 5 minutes
  setInterval(() => {
    healthStatus.uptime = process.uptime();
    healthStatus.mongodb =
      mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    healthStatus.rabbitmq = connection ? "connected" : "disconnected";
    healthStatus.memory = process.memoryUsage();
    healthStatus.lastActivity = new Date().toISOString();

    logger.info("[FileImportService] Health check", healthStatus);
  }, 300000); // 5 minutes
}

/**
 * Main service startup
 */
async function startService(): Promise<void> {
  try {
    logger.info("[FileImportService] Starting File Product Import Service...");

    // Connect to dependencies
    await connectMongoDB();
    // Market price cache is refreshed on-demand during file processing.
    // Default behavior: skip warmup on startup to make boot softer and reduce startup memory/CPU spikes.
    // Set FILE_IMPORT_PREWARM_CACHE=true (or legacy SKIP_MARKET_PRICE_CACHE_INIT=false) to force warmup on boot.
    const shouldPrewarmCache =
      process.env.FILE_IMPORT_PREWARM_CACHE === "true" ||
      process.env.SKIP_MARKET_PRICE_CACHE_INIT === "false";

    if (shouldPrewarmCache) {
      logger.info(
        "[FileImportService] Prewarming market price cache on startup",
      );
      await initializeMarketPriceCache();
    } else {
      logger.info(
        "[FileImportService] Skipping startup market price cache warmup (on-demand mode)",
      );
    }
    await connectRabbitMQ();

    // Запускаем Prometheus-метрики (CPU/память/кэш)
    startMetricsServer();

    // 🔒 Initialize Redis for distributed locking
    await initializeRedisLock();
    logger.info("[FileImportService] ✅ Redis distributed lock initialized");

    // Setup health monitoring
    setupHealthCheck();

    logger.info(
      "[FileImportService] 🚀 Service is ready and listening for file upload tasks",
    );

    // Register cleanup for graceful shutdown
    registerCleanup(cleanupService, "File Import Service (RabbitMQ + MongoDB)");

    // Initialize graceful shutdown
    initGracefulShutdown();
    logger.info("[FileImportService] Graceful shutdown initialized");
  } catch (error) {
    logger.error(
      "[FileImportService] Failed to start service: " +
        (error as Error)?.message,
    );
    process.exit(1);
  }
}

// Keep these handlers for logging purposes only
process.on("uncaughtException", (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error("[FileImportService] Uncaught Exception: " + message);
});
process.on(
  "unhandledRejection",
  (reason: unknown, promise: Promise<unknown>) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    logger.error("[FileImportService] Unhandled Rejection: " + message, {
      promise,
    });
  },
);

// Start the service
startService().catch((error) => {
  logger.error(
    "[FileImportService] Service startup failed: " + (error as Error)?.message,
  );
  process.exit(1);
});
