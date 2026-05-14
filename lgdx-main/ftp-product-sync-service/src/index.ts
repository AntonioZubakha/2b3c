/**
 * LGDX FTP Product Sync Service
 * Основная точка входа для FTP-сервиса автоматической синхронизации продуктов
 */

import * as dotenv from 'dotenv';
import { logger } from './shared/logger';
import { FtpServer } from './services/ftpServer';
import { FileWatcher } from './services/fileWatcher';
import { connectToDatabase } from './shared/database';
import { connectToRabbitMQ } from './shared/rabbitmq';
import { connectToRedis, disconnectFromRedis } from './shared/redis';
import { FtpMetrics } from './services/metrics';
import { FtpRateLimiter } from './services/rateLimiter';
import { TelegramNotifier } from './services/telegramNotifier';
import { healthCheckServer } from './healthCheck';
import { initGracefulShutdown, registerCleanup } from './utils/gracefulShutdown';
import Redis from 'ioredis';

// Загружаем переменные окружения
dotenv.config();

class FtpProductSyncService {
  private ftpServer?: FtpServer;
  private fileWatcher?: FileWatcher;
  private metrics?: FtpMetrics;
  private rateLimiter?: FtpRateLimiter;
  private telegramNotifier?: TelegramNotifier;
  private redisClient?: Redis;
  private isShuttingDown = false;

  async start(): Promise<void> {
    try {
      logger.info('[FTP-Service] Starting LGDX FTP Product Sync Service...');

      // Инициализация подключений
      await this.initializeConnections();

      // Инициализация сервисов
      await this.initializeServices();

      // Запуск health check сервера
      await this.startHealthCheck();

      // Graceful shutdown handlers
      this.setupGracefulShutdown();

      logger.info('[FTP-Service] ✅ FTP Product Sync Service started successfully');
      logger.info(`[FTP-Service] 🔗 FTP Server listening on port 21`);
      logger.info(`[FTP-Service] 📁 File watcher monitoring: /ftp-data`);

    } catch (error) {
      logger.error('[FTP-Service] ❌ Failed to start service:', error);
      process.exit(1);
    }
  }

  private async initializeConnections(): Promise<void> {
    // Подключение к MongoDB
    await connectToDatabase();
    logger.info('[FTP-Service] ✅ Connected to MongoDB');

    // Подключение к RabbitMQ
    await connectToRabbitMQ();
    logger.info('[FTP-Service] ✅ Connected to RabbitMQ');

    // Подключение к Redis (для rate limiting) с повторами при старте (Swarm/DNS может быть медленным)
    const redisAttempts = 5;
    const redisDelayMs = 3000;
    for (let attempt = 1; attempt <= redisAttempts; attempt++) {
      try {
        this.redisClient = await connectToRedis();
        logger.info('[FTP-Service] ✅ Connected to Redis');
        break;
      } catch (err) {
        logger.warn(`[FTP-Service] Redis connection attempt ${attempt}/${redisAttempts} failed:`, err);
        if (attempt === redisAttempts) throw err;
        await new Promise(r => setTimeout(r, redisDelayMs));
      }
    }
  }

  private async initializeServices(): Promise<void> {
    // Инициализация метрик
    this.metrics = new FtpMetrics();
    logger.info('[FTP-Service] ✅ Metrics initialized');

    // Инициализация Rate Limiter
    if (this.redisClient) {
      this.rateLimiter = new FtpRateLimiter(this.redisClient);
      logger.info('[FTP-Service] ✅ Rate Limiter initialized');
    } else {
      logger.warn('[FTP-Service] ⚠️ Rate Limiter disabled (Redis not available)');
    }

    // Инициализация Telegram Notifier
    this.telegramNotifier = new TelegramNotifier();
    logger.info('[FTP-Service] ✅ Telegram Notifier initialized');

    // Инициализация FTP сервера
    this.ftpServer = new FtpServer();
    await this.ftpServer.start();
    logger.info('[FTP-Service] ✅ FTP Server started');

    // Инициализация File Watcher
    this.fileWatcher = new FileWatcher(
      this.metrics,
      this.rateLimiter,
      this.telegramNotifier
    );
    await this.fileWatcher.start();
    logger.info('[FTP-Service] ✅ File Watcher started');
  }

  private async startHealthCheck(): Promise<void> {
    const healthPort = process.env.HEALTH_PORT || 3000;
    await healthCheckServer(Number(healthPort), { fileWatcher: this.fileWatcher });
    logger.info(`[FTP-Service] ✅ Health check server started on port ${healthPort}`);
  }

  private setupGracefulShutdown(): void {
    // Register cleanup functions for graceful shutdown
    registerCleanup(async () => {
      if (this.ftpServer) {
        logger.info('[FTP-Service] Stopping FTP Server...');
        await this.ftpServer.stop();
        logger.info('[FTP-Service] ✅ FTP Server stopped');
      }
    }, 'FTP Server');

    registerCleanup(async () => {
      if (this.fileWatcher) {
        logger.info('[FTP-Service] Stopping File Watcher...');
        await this.fileWatcher.stop();
        logger.info('[FTP-Service] ✅ File Watcher stopped');
      }
    }, 'File Watcher');

    registerCleanup(async () => {
      if (this.rateLimiter) {
        logger.info('[FTP-Service] Closing Rate Limiter...');
        await this.rateLimiter.close();
        logger.info('[FTP-Service] ✅ Rate Limiter closed');
      }
    }, 'Rate Limiter');

    registerCleanup(async () => {
      logger.info('[FTP-Service] Disconnecting from Redis...');
      await disconnectFromRedis();
      logger.info('[FTP-Service] ✅ Disconnected from Redis');
    }, 'Redis');
    
    // Initialize graceful shutdown
    initGracefulShutdown();
    logger.info('[FTP-Service] ✅ Graceful shutdown initialized');
    
    // Keep exception handlers for logging
    process.on('uncaughtException', (error: Error) => {
      logger.error('[FTP-Service] ❌ Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
      logger.error('[FTP-Service] ❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }
}

// Запуск сервиса
const service = new FtpProductSyncService();
service.start().catch((error) => {
  logger.error('[FTP-Service] ❌ Fatal error during startup:', error);
  process.exit(1);
});
