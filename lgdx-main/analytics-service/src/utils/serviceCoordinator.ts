/**
 * Service Coordinator для analytics-service
 * 
 * Этот сервис:
 * - Ждет завершения market-price-calculator перед запуском
 * - Устанавливает свой статус 'running' при начале аналитики
 * - Устанавливает статус 'completed' при успехе
 * - Устанавливает статус 'failed' при ошибке
 */

import { createClient, RedisClientType } from 'redis';

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

interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  redisKeyPrefix: 'lgdx:service:status',
  enabled: process.env['SERVICE_COORDINATOR_ENABLED'] === 'true',
  defaultTimeout: 7200000,
};

export class ServiceCoordinator {
  private redisClient: RedisClientType | null = null;
  private config: CoordinatorConfig;
  private isInitialized = false;
  private logger: Logger;

  constructor(logger: Logger, config?: Partial<CoordinatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  async initialize(redisUrl?: string): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('[ServiceCoordinator] Coordinator is disabled (set SERVICE_COORDINATOR_ENABLED=true to enable)');
      return;
    }

    if (!redisUrl) {
      this.logger.warn('[ServiceCoordinator] No Redis URL provided, coordinator will be disabled');
      this.config.enabled = false;
      return;
    }

    if (this.isInitialized && this.redisClient) {
      return;
    }

    try {
      this.redisClient = createClient({ url: redisUrl });

      this.redisClient.on('error', (err: Error) => {
        this.logger.error('[ServiceCoordinator] Redis error:', { error: err.message });
      });

      await this.redisClient.connect();
      this.isInitialized = true;
      this.logger.info('[ServiceCoordinator] ✅ Initialized successfully', {
        keyPrefix: this.config.redisKeyPrefix
      });
    } catch (error) {
      this.logger.error('[ServiceCoordinator] Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Graceful degradation - continue without coordinator
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
        86400, // 24 hours TTL
        JSON.stringify(value)
      );

      this.logger.info(`[ServiceCoordinator] Status updated for ${serviceName}`, {
        status: status.status,
        metadata: status.metadata,
      });
    } catch (error) {
      this.logger.error(`[ServiceCoordinator] Failed to set status`, {
        serviceName,
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
      this.logger.error(`[ServiceCoordinator] Failed to get status`, {
        serviceName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async waitForCompletion(
    serviceName: ServiceName, 
    timeoutMs: number = this.config.defaultTimeout
  ): Promise<boolean> {
    if (!this.config.enabled) {
      this.logger.warn('[ServiceCoordinator] Coordinator disabled, skipping wait');
      return true;
    }

    const startTime = Date.now();
    const checkInterval = 30000; // 30 seconds

    this.logger.info(`[ServiceCoordinator] Waiting for ${serviceName} to complete (timeout: ${timeoutMs}ms)`);

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getStatus(serviceName);

      if (!status) {
        this.logger.warn(`[ServiceCoordinator] No status found for ${serviceName}, assuming not running`);
        return true;
      }

      if (status.status === 'completed') {
        this.logger.info(`[ServiceCoordinator] ✅ ${serviceName} completed successfully`);
        return true;
      }

      if (status.status === 'failed') {
        this.logger.warn(`[ServiceCoordinator] ⚠️ ${serviceName} failed: ${status.error}`);
        return false;
      }

      // Still running, wait and check again
      await this.sleep(checkInterval);
    }

    this.logger.error(`[ServiceCoordinator] ⏰ Timeout waiting for ${serviceName}`);
    return false;
  }

  async close(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
        this.isInitialized = false;
        this.logger.info('[ServiceCoordinator] Connection closed');
      } catch (error) {
        this.logger.error('[ServiceCoordinator] Error closing connection', {
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
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

let coordinatorInstance: ServiceCoordinator | null = null;

export function getServiceCoordinator(logger: Logger): ServiceCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new ServiceCoordinator(logger);
  }
  return coordinatorInstance;
}
