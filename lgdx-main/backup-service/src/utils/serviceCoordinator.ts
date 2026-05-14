/**
 * Service Coordinator для backup-service
 * 
 * Этот сервис:
 * - Ждет завершения api-sync перед началом backup
 * - Устанавливает свой статус 'running' при начале
 * - Устанавливает статус 'completed' при успехе
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';

type ServiceName = 
  | 'api-sync' 
  | 'backup' 
  | 'analytics' 
  | 'market-price-calculator'
  | 'file-import'
  | 'ftp-sync';

type ServiceStatusType = 'idle' | 'running' | 'completed' | 'failed';

interface ServiceStatus {
  serviceName: ServiceName;
  status: ServiceStatusType;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface CoordinatorConfig {
  redisKeyPrefix: string;
  enabled: boolean;
  defaultTimeout: number;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  redisKeyPrefix: 'lgdx:service:status',
  enabled: process.env.SERVICE_COORDINATOR_ENABLED === 'true',
  defaultTimeout: 7200000, // 2 часа
};

export class ServiceCoordinator {
  private redisClient: RedisClientType | null = null;
  private config: CoordinatorConfig;
  private isInitialized = false;

  constructor(config?: Partial<CoordinatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(redisUrl: string): Promise<void> {
    if (!this.config.enabled) {
      logger.info('[ServiceCoordinator] Coordinator is disabled');
      return;
    }

    if (this.isInitialized && this.redisClient) {
      return;
    }

    try {
      this.redisClient = createClient({ url: redisUrl });

      this.redisClient.on('error', (err: Error) => {
        logger.error('[ServiceCoordinator] Redis error:', { error: err.message });
      });

      await this.redisClient.connect();
      this.isInitialized = true;
      logger.info('[ServiceCoordinator] Initialized successfully');
    } catch (error) {
      logger.error('[ServiceCoordinator] Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.config.enabled = false;
    }
  }

  async setStatus(
    serviceName: ServiceName,
    status: Omit<ServiceStatus, 'serviceName'>
  ): Promise<void> {
    if (!this.config.enabled || !this.redisClient) {
      return;
    }

    try {
      const key = this.getRedisKey(serviceName);
      const value: ServiceStatus = {
        serviceName,
        ...status,
      };

      await this.redisClient.setEx(
        key,
        86400, // 24 часа TTL
        JSON.stringify(value)
      );

      logger.info(`[ServiceCoordinator] Status updated for ${serviceName}`, {
        status: status.status,
      });
    } catch (error) {
      logger.error(`[ServiceCoordinator] Failed to set status`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getStatus(serviceName: ServiceName): Promise<ServiceStatus | null> {
    if (!this.config.enabled || !this.redisClient) {
      return null;
    }

    try {
      const key = this.getRedisKey(serviceName);
      const value = await this.redisClient.get(key);

      if (!value) {
        return null;
      }

      return JSON.parse(value) as ServiceStatus;
    } catch (error) {
      logger.error(`[ServiceCoordinator] Failed to get status`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Дождаться завершения сервиса
   * КРИТИЧНО для backup - ждем api-sync!
   */
  async waitForCompletion(
    serviceName: ServiceName,
    timeout: number = this.config.defaultTimeout
  ): Promise<boolean> {
    if (!this.config.enabled) {
      return true; // Если отключено - разрешаем запуск
    }

    const startTime = Date.now();
    const checkInterval = 10000; // 10 секунд

    logger.info(`[ServiceCoordinator] Waiting for ${serviceName} to complete`, {
      timeout: `${timeout / 1000}s`,
    });

    while (Date.now() - startTime < timeout) {
      const status = await this.getStatus(serviceName);

      if (!status || status.status === 'idle') {
        logger.info(`[ServiceCoordinator] ${serviceName} is not running`);
        return true;
      }

      if (status.status === 'completed') {
        logger.info(`[ServiceCoordinator] ${serviceName} completed successfully`);
        return true;
      }

      if (status.status === 'failed') {
        logger.warn(`[ServiceCoordinator] ${serviceName} failed`, {
          error: status.error,
        });
        return true;
      }

      // Still running - wait
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      logger.info(`[ServiceCoordinator] ${serviceName} still running (${elapsedSeconds}s)`);

      await this.sleep(checkInterval);
    }

    logger.warn(`[ServiceCoordinator] Timeout waiting for ${serviceName}`);
    return false;
  }

  async close(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
        this.isInitialized = false;
        logger.info('[ServiceCoordinator] Connection closed');
      } catch (error) {
        logger.error('[ServiceCoordinator] Error closing connection', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  isEnabled(): boolean {
    return this.config.enabled && this.isInitialized;
  }

  private getRedisKey(serviceName: ServiceName): string {
    return `${this.config.redisKeyPrefix}:${serviceName}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton
let coordinatorInstance: ServiceCoordinator | null = null;

export function getServiceCoordinator(): ServiceCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new ServiceCoordinator();
  }
  return coordinatorInstance;
}

