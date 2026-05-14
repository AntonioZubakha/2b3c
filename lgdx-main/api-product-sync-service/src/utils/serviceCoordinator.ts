/**
 * Service Coordinator для api-product-sync-service
 * 
 * Интеграция с централизованным координатором для избежания race conditions.
 * 
 * Этот сервис:
 * - Устанавливает статус 'running' при начале синхронизации
 * - Устанавливает статус 'completed' при успехе
 * - Устанавливает статус 'failed' при ошибке
 * - Другие сервисы (backup, analytics) могут ждать завершения
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from '../shared/logger';

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
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  redisKeyPrefix: 'lgdx:service:status',
  enabled: process.env.SERVICE_COORDINATOR_ENABLED === 'true',
};

/**
 * ServiceCoordinator для микросервисов
 * (упрощенная версия для использования в microservices)
 */
export class ServiceCoordinator {
  private redisClient: RedisClientType | null = null;
  private config: CoordinatorConfig;
  private isInitialized = false;

  constructor(config?: Partial<CoordinatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Инициализация Redis клиента
   */
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
      this.config.enabled = false; // Отключаем при ошибке
    }
  }

  /**
   * Установить статус сервиса
   */
  async setStatus(
    serviceName: ServiceName,
    status: Omit<ServiceStatus, 'serviceName'>
  ): Promise<void> {
    if (!this.config.enabled || !this.redisClient) {
      return; // Тихо игнорируем если отключено
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
        metadata: status.metadata,
      });
    } catch (error) {
      logger.error(`[ServiceCoordinator] Failed to set status for ${serviceName}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      // НЕ бросаем ошибку - координация не должна ломать основную логику
    }
  }

  /**
   * Получить статус сервиса
   */
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
      logger.error(`[ServiceCoordinator] Failed to get status for ${serviceName}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Закрыть соединение
   */
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

  /**
   * Проверка работоспособности
   */
  isEnabled(): boolean {
    return this.config.enabled && this.isInitialized;
  }

  private getRedisKey(serviceName: ServiceName): string {
    return `${this.config.redisKeyPrefix}:${serviceName}`;
  }
}

// Singleton instance
let coordinatorInstance: ServiceCoordinator | null = null;

export function getServiceCoordinator(): ServiceCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new ServiceCoordinator();
  }
  return coordinatorInstance;
}

