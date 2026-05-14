import dotenv from 'dotenv';
import mongoose from 'mongoose';
import schedule from 'node-schedule';
import winston from 'winston';
import { calculateAndSaveCategoryStats } from './calculator';
import express from 'express';
import { config } from './config';
import { ProductCategoryStats } from './db/models';
import { sendCalculatorStartNotification, sendCalculatorCompleteNotification, sendCalculatorErrorNotification } from './shared/telegramBot';
import { initGracefulShutdown, registerCleanup } from './utils/gracefulShutdown';
import { initMarketPriceCachePublisher, getLatestSnapshot, getLatestDiff, shutdownMarketPriceCachePublisher } from './cache/marketPriceCachePublisher';
import { metricsMiddleware, metricsRouter, recordCalculationMetrics } from './metrics';
import { getServiceCoordinator } from './utils/serviceCoordinator';
import { createClient, type RedisClientType } from 'redis';


// Load environment variables
dotenv.config();

// Configure Mongoose globally - use default buffering

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'market-price-calculator' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

const GLOBAL_SYNC_LOCK_KEY = process.env['GLOBAL_SYNC_LOCK_KEY'] || 'sync:lock:global';
let globalLockClient: RedisClientType | null = null;

async function getGlobalLockClient(): Promise<RedisClientType | null> {
  const redisUrl = process.env['REDIS_URL_FILE']
    ? require('fs').readFileSync(process.env['REDIS_URL_FILE'], 'utf8').trim()
    : process.env['REDIS_URL'];
  if (!redisUrl) return null;
  if (globalLockClient) return globalLockClient;
  globalLockClient = createClient({ url: redisUrl });
  globalLockClient.on('error', (err: Error) => logger.error('[GlobalLock] Redis error', { error: err.message }));
  await globalLockClient.connect();
  return globalLockClient;
}

async function acquireGlobalLock(lockValue: string, ttlSeconds: number): Promise<boolean> {
  const client = await getGlobalLockClient();
  if (!client) return true;
  const result = await client.set(GLOBAL_SYNC_LOCK_KEY, lockValue, { EX: ttlSeconds, NX: true });
  return result === 'OK';
}

async function extendGlobalLock(lockValue: string, ttlSeconds: number): Promise<void> {
  const client = await getGlobalLockClient();
  if (!client) return;
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("expire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;
  await client.eval(script, { keys: [GLOBAL_SYNC_LOCK_KEY], arguments: [lockValue, ttlSeconds.toString()] });
}

async function releaseGlobalLock(lockValue: string): Promise<void> {
  const client = await getGlobalLockClient();
  if (!client) return;
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await client.eval(script, { keys: [GLOBAL_SYNC_LOCK_KEY], arguments: [lockValue] });
}

async function waitForGlobalTurn(jobLabel: string): Promise<{ release: () => Promise<void> }> {
  const lockValue = `market-price-${jobLabel}-${Date.now()}`;
  const ttl = 300;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ok = await acquireGlobalLock(lockValue, ttl);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 30_000));
  }
  const heartbeat = setInterval(() => {
    void extendGlobalLock(lockValue, 5 * 60);
  }, 2 * 60 * 1000);
  return {
    release: async () => {
      clearInterval(heartbeat);
      await releaseGlobalLock(lockValue);
    },
  };
}

// Connect to MongoDB
const connectToDatabase = async (): Promise<void> => {
  try {
    const mongoUri = config.mongoUri;
    if (!mongoUri) {
      throw new Error('MongoDB URI is not configured');
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: config.dbConnectionTimeout,
      socketTimeoutMS: config.dbSocketTimeout,
      connectTimeoutMS: config.dbConnectionTimeout,
      maxPoolSize: 10,
      minPoolSize: 1
    });
    logger.info('✅ Connected to MongoDB successfully');
  } catch (error) {
    logger.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};

// Schedule the market price calculation job
const scheduleMarketPriceCalculation = (): void => {
  // Use interval from config or default to every 3 hours
  const scheduleRule = config.calculationInterval;
  
  logger.info(`📅 Scheduling market price calculation (cron: ${scheduleRule})`);
  
  schedule.scheduleJob(scheduleRule, async () => {
    const startTime = new Date();
    logger.info(`🚀 Starting scheduled market price calculation at ${startTime.toISOString()}`);

    const globalTurn = await waitForGlobalTurn('scheduled');
    
    // Get coordinator instance
    const coordinator = getServiceCoordinator(logger);
    
    try {
      // Set status to 'running'
      await coordinator.setStatus('market-price-calculator', {
        status: 'running',
        startedAt: startTime,
        metadata: { trigger: 'scheduled' }
      });
      
      // Send start notification
      await sendCalculatorStartNotification('Market Price Calculator (Scheduled)');
      
      await calculateAndSaveCategoryStats(ProductCategoryStats);
      const snapshot = getLatestSnapshot();
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      // Set status to 'completed'
      await coordinator.setStatus('market-price-calculator', {
        status: 'completed',
        startedAt: startTime,
        completedAt: endTime,
        metadata: { 
          trigger: 'scheduled',
          duration,
          categoriesProcessed: snapshot?.entryCount || 0
        }
      });
      
      logger.info(`✅ Market price calculation completed successfully in ${duration}ms`);
      recordCalculationMetrics('scheduled', duration, 'success', snapshot ?? undefined);
      
      // Send completion notification
      await sendCalculatorCompleteNotification('Market Price Calculator (Scheduled)', duration, true, 'Scheduled calculation completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const duration = new Date().getTime() - startTime.getTime();
      
      // Set status to 'failed'
      await coordinator.setStatus('market-price-calculator', {
        status: 'failed',
        startedAt: startTime,
        completedAt: new Date(),
        error: errorMessage,
        metadata: { trigger: 'scheduled', duration }
      });
      
      recordCalculationMetrics('scheduled', duration, 'error');
      
      // Send error notification
      await sendCalculatorErrorNotification('Market Price Calculator (Scheduled)', errorMessage);
      logger.error('❌ Error in scheduled market price calculation:', error);
    } finally {
      await globalTurn.release();
    }
  });
};

// Smart Analytics Cache removed - analytics moved to separate analytics-service

// Manual trigger function for testing
export const triggerCalculation = async (): Promise<void> => {
  const startTime = Date.now();
  const startDate = new Date(startTime);
  logger.info('🔧 Manual trigger of market price calculation');

  const globalTurn = await waitForGlobalTurn('manual');

  // Get coordinator instance
  const coordinator = getServiceCoordinator(logger);

  try {
    // Set status to 'running'
    await coordinator.setStatus('market-price-calculator', {
      status: 'running',
      startedAt: startDate,
      metadata: { trigger: 'manual' }
    });

    // Force reconnect to MongoDB for manual execution
    if (mongoose.connection.readyState !== 1) {
      logger.info('🔄 Connecting to MongoDB...');
      await mongoose.connect(config.mongoUri, {
        serverSelectionTimeoutMS: config.dbConnectionTimeout,
        socketTimeoutMS: config.dbSocketTimeout,
        connectTimeoutMS: config.dbConnectionTimeout,
        maxPoolSize: 10,
        minPoolSize: 1
      });
    } else {
      logger.info('✅ MongoDB already connected');
    }

    await calculateAndSaveCategoryStats(ProductCategoryStats);
    const snapshot = getLatestSnapshot();

    const duration = Date.now() - startTime;
    const endDate = new Date();

    // Set status to 'completed'
    await coordinator.setStatus('market-price-calculator', {
      status: 'completed',
      startedAt: startDate,
      completedAt: endDate,
      metadata: { 
        trigger: 'manual',
        duration,
        categoriesProcessed: snapshot?.entryCount || 0
      }
    });

    await sendCalculatorCompleteNotification('Market Price Calculator (Manual)', duration, true, 'Manual calculation completed');
    recordCalculationMetrics('manual', duration, 'success', snapshot ?? undefined);
    logger.info('✅ Manual calculation completed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;

    // Set status to 'failed'
    await coordinator.setStatus('market-price-calculator', {
      status: 'failed',
      startedAt: startDate,
      completedAt: new Date(),
      error: errorMessage,
      metadata: { trigger: 'manual', duration }
    });

    await sendCalculatorErrorNotification('Market Price Calculator (Manual)', errorMessage);
    recordCalculationMetrics('manual', duration, 'error');
    logger.error('❌ Error in manual calculation:', error);
    throw error;
  } finally {
    await globalTurn.release();
  }
};

// CLI entry point for manual calculation
if (process.argv.includes('--calculate')) {
  logger.info('🚀 Starting manual calculation from CLI...');
  triggerCalculation()
    .then(() => {
      logger.info('✅ CLI calculation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ CLI calculation failed:', error);
      process.exit(1);
    });
}

// Cleanup function for graceful shutdown
const cleanupService = async (): Promise<void> => {
  logger.info('📅 Shutting down scheduler...');
  await schedule.gracefulShutdown();
  logger.info('📅 Scheduler shutdown completed');
  
  logger.info('🗄️ Closing MongoDB connection...');
  await mongoose.connection.close();
  logger.info('🗄️ MongoDB connection closed');
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Main function
const main = async (): Promise<void> => {
  logger.info('🚀 Starting Market Price Calculator Service...');

  // Connect to database
  await connectToDatabase();

  // Initialize Service Coordinator
  const coordinator = getServiceCoordinator(logger);
  await coordinator.initialize(config.marketPriceCacheRedisUrl);
  
  if (coordinator.isEnabled()) {
    logger.info('✅ Service Coordinator enabled - other services can track our status');
  } else {
    logger.info('ℹ️  Service Coordinator disabled - set SERVICE_COORDINATOR_ENABLED=true to enable');
  }

  await initMarketPriceCachePublisher({
    redisUrl: config.marketPriceCacheRedisUrl,
    ttlSeconds: config.marketPriceCacheTtlSeconds,
    logger,
  });

  // Send startup notification
  await sendCalculatorStartNotification('Market Price Calculator');
  
  // Schedule the job
  scheduleMarketPriceCalculation();
  
  logger.info('✅ Market Price Calculator Service started successfully');
  logger.info('📊 Service will calculate market prices every 3 hours');
  logger.info('🔧 Use triggerCalculation() for manual execution');
  
  // Lightweight HTTP server to accept on-demand triggers from backend
  const app = express();
  app.use(express.json());
  app.use(metricsMiddleware);
  app.use('/metrics', metricsRouter);

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get('/market-price-cache', (_req, res) => {
    const snapshot = getLatestSnapshot();
    if (!snapshot) {
      res.status(200).json({
        version: null,
        generatedAt: null,
        entryCount: 0,
        data: {},
        cached: false,
      });
      return;
    }

    res.status(200).json({
      ...snapshot,
      cached: true,
    });
  });

  app.get('/market-price-cache/diff', (_req, res) => {
    const diff = getLatestDiff();
    if (!diff) {
      res.status(200).json({
        version: null,
        previousVersion: null,
        generatedAt: null,
        updated: {},
        removed: {},
        cached: false,
      });
      return;
    }

    res.status(200).json({
      ...diff,
      cached: true,
    });
  });

  let isRunning = false;
  app.post('/calculate', async (_req, res) => {
    if (isRunning) {
      res.status(202).json({ success: true, message: 'Calculation already running' });
      return;
    }
    isRunning = true;
    const start = Date.now();
    const startDate = new Date(start);
    res.status(202).json({ success: true, message: 'Calculation started' });
    
    try {
      // Set status to 'running'
      await coordinator.setStatus('market-price-calculator', {
        status: 'running',
        startedAt: startDate,
        metadata: { trigger: 'on-demand' }
      });

      await calculateAndSaveCategoryStats(ProductCategoryStats);
      const snapshot = getLatestSnapshot();
      const duration = Date.now() - start;

      // Set status to 'completed'
      await coordinator.setStatus('market-price-calculator', {
        status: 'completed',
        startedAt: startDate,
        completedAt: new Date(),
        metadata: { 
          trigger: 'on-demand',
          duration,
          categoriesProcessed: snapshot?.entryCount || 0
        }
      });

      recordCalculationMetrics('on-demand', duration, 'success', snapshot ?? undefined);
    } catch (err) {
      const duration = Date.now() - start;
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Set status to 'failed'
      await coordinator.setStatus('market-price-calculator', {
        status: 'failed',
        startedAt: startDate,
        completedAt: new Date(),
        error: errorMessage,
        metadata: { trigger: 'on-demand', duration }
      });

      recordCalculationMetrics('on-demand', duration, 'error');
      logger.error('❌ Error in on-demand market price calculation:', err);
    } finally {
      isRunning = false;
    }
  });

  // REMOVED: Market Analytics Dashboard endpoints - moved to analytics-service


  const port = parseInt((process.env as any)['PORT'] || '9100', 10);
  app.listen(port, () => logger.info(`🛰️  HTTP trigger server listening on port ${port}`));

  // Register cleanup for graceful shutdown
  registerCleanup(cleanupService, 'Market Price Calculator (Scheduler + MongoDB)');
  registerCleanup(shutdownMarketPriceCachePublisher, 'Market Price Cache Publisher');
  registerCleanup(async () => {
    logger.info('🔄 Closing Service Coordinator...');
    await coordinator.close();
    logger.info('✅ Service Coordinator closed');
  }, 'Service Coordinator');
  
  // Initialize graceful shutdown
  initGracefulShutdown();
  logger.info('✅ Graceful shutdown initialized');

  // Keep the process alive
  process.stdin.resume();
};

// Start the service
if (require.main === module) {
  main().catch((error) => {
    logger.error('💥 Failed to start service:', error);
    process.exit(1);
  });
} 