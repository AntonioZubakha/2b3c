/**
 * Service Coordinator
 * 
 * Координирует запуск микросервисов через Redis flags для избежания race conditions.
 * 
 * Проблема: api-sync и backup могут запускаться одновременно, что приводит к неконсистентным бэкапам.
 * Решение: Сервисы устанавливают статус в Redis, другие сервисы могут ждать завершения.
 * 
 * Пример использования:
 * ```typescript
 * const coordinator = new ServiceCoordinator();
 * 
 * // В api-sync сервисе:
 * await coordinator.setStatus('api-sync', { status: 'running', startedAt: new Date() });
 * // ... выполнение синхронизации ...
 * await coordinator.setStatus('api-sync', { status: 'completed', completedAt: new Date() });
 * 
 * // В backup сервисе:
 * const canStart = await coordinator.waitForCompletion('api-sync', 7200000);
 * if (!canStart) {
 *   logger.warn('api-sync still running, skipping backup');
 *   return;
 * }
 * ```
 */

import { RedisClientType } from 'redis';
import { getRedisClient } from '../config/redis';
import { logger } from './logger';
import { 
  ServiceName, 
  ServiceStatus, 
  ServiceStatusType,
  CoordinatorConfig,
  DependencyCheck 
} from '../types/serviceCoordination';

const DEFAULT_CONFIG: CoordinatorConfig = {
  redisKeyPrefix: 'lgdx:service:status',
  defaultTimeout: 7200000, // 2 часа по умолчанию
  cleanupInterval: 86400000, // 24 часа
};

export class ServiceCoordinator {
  private redisClient: RedisClientType;
  private config: CoordinatorConfig;

  constructor(customClient?: RedisClientType, config?: Partial<CoordinatorConfig>) {
    this.redisClient = customClient || getRedisClient();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Установить статус сервиса
   */
  async setStatus(
    serviceName: ServiceName,
    status: Omit<ServiceStatus, 'serviceName'>
  ): Promise<void> {
    try {
      const key = this.getRedisKey(serviceName);
      const value: ServiceStatus = {
        serviceName,
        ...status,
      };

      // Сохраняем в Redis с TTL 24 часа
      await this.redisClient.setEx(
        key,
        Math.floor(this.config.cleanupInterval / 1000),
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
      throw error;
    }
  }

  /**
   * Получить статус сервиса
   */
  async getStatus(serviceName: ServiceName): Promise<ServiceStatus | null> {
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
   * Дождаться завершения сервиса
   * 
   * @param serviceName - имя сервиса, которого ждем
   * @param timeout - максимальное время ожидания в миллисекундах
   * @returns true если сервис завершился, false если timeout
   */
  async waitForCompletion(
    serviceName: ServiceName,
    timeout: number = this.config.defaultTimeout
  ): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 10000; // Проверяем каждые 10 секунд

    logger.info(`[ServiceCoordinator] Waiting for ${serviceName} to complete`, {
      timeout: `${timeout / 1000}s`,
    });

    while (Date.now() - startTime < timeout) {
      const status = await this.getStatus(serviceName);

      if (!status || status.status === 'idle') {
        // Сервис не запущен или уже завершился (статус очищен)
        logger.info(`[ServiceCoordinator] ${serviceName} is not running (idle or no status)`);
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
        return true; // Продолжаем, даже если сервис завершился с ошибкой
      }

      if (status.status === 'running') {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        logger.info(`[ServiceCoordinator] ${serviceName} still running, waiting... (${elapsedSeconds}s elapsed)`);
      }

      // Ждем перед следующей проверкой
      await this.sleep(checkInterval);
    }

    // Timeout достигнут
    logger.warn(`[ServiceCoordinator] Timeout waiting for ${serviceName}`, {
      timeout: `${timeout / 1000}s`,
    });
    return false;
  }

  /**
   * Проверить можно ли запускать сервис (с учетом зависимостей)
   */
  async canStart(
    serviceName: ServiceName,
    dependencies: ServiceName[] = []
  ): Promise<DependencyCheck> {
    try {
      if (dependencies.length === 0) {
        return { canStart: true };
      }

      const waitingFor: ServiceName[] = [];

      for (const dep of dependencies) {
        const status = await this.getStatus(dep);

        if (status && status.status === 'running') {
          waitingFor.push(dep);
        }
      }

      if (waitingFor.length > 0) {
        return {
          canStart: false,
          reason: `Waiting for dependencies: ${waitingFor.join(', ')}`,
          waitingFor,
        };
      }

      return { canStart: true };
    } catch (error) {
      logger.error(`[ServiceCoordinator] Error checking dependencies for ${serviceName}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      // В случае ошибки разрешаем запуск (fail-safe)
      return { canStart: true, reason: 'Error checking dependencies, allowing start' };
    }
  }

  /**
   * Очистить статус сервиса (установить в idle)
   */
  async clearStatus(serviceName: ServiceName): Promise<void> {
    try {
      const key = this.getRedisKey(serviceName);
      await this.redisClient.del(key);
      logger.info(`[ServiceCoordinator] Status cleared for ${serviceName}`);
    } catch (error) {
      logger.error(`[ServiceCoordinator] Failed to clear status for ${serviceName}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Очистить старые статусы (старше указанного времени)
   */
  async cleanup(olderThanMs: number = this.config.cleanupInterval): Promise<number> {
    try {
      const pattern = `${this.config.redisKeyPrefix}:*`;
      const keys = await this.redisClient.keys(pattern);
      let deletedCount = 0;

      for (const key of keys) {
        const value = await this.redisClient.get(key);
        if (!value) continue;

        try {
          const status = JSON.parse(value) as ServiceStatus;
          const timestamp = status.completedAt || status.startedAt;

          if (timestamp) {
            const age = Date.now() - new Date(timestamp).getTime();
            if (age > olderThanMs) {
              await this.redisClient.del(key);
              deletedCount++;
            }
          }
        } catch (e) {
          // Невалидные данные - удаляем
          await this.redisClient.del(key);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.info(`[ServiceCoordinator] Cleanup completed: ${deletedCount} old statuses removed`);
      }

      return deletedCount;
    } catch (error) {
      logger.error('[ServiceCoordinator] Cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Получить все статусы сервисов (для мониторинга)
   */
  async getAllStatuses(): Promise<Record<ServiceName, ServiceStatus | null>> {
    const services: ServiceName[] = [
      'api-sync',
      'backup',
      'analytics',
      'market-price-calculator',
      'file-import',
      'ftp-sync',
    ];

    const statuses: Record<ServiceName, ServiceStatus | null> = {} as Record<ServiceName, ServiceStatus | null>;

    for (const service of services) {
      statuses[service] = await this.getStatus(service);
    }

    return statuses;
  }

  // Приватные методы

  private getRedisKey(serviceName: ServiceName): string {
    return `${this.config.redisKeyPrefix}:${serviceName}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance для удобного использования
 */
let coordinatorInstance: ServiceCoordinator | null = null;

export function getServiceCoordinator(): ServiceCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new ServiceCoordinator();
  }
  return coordinatorInstance;
}

