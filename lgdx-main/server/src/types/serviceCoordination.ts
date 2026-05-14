/**
 * Service Coordination Types
 * 
 * Типы для координации запуска микросервисов через Redis flags
 * Цель: Избежать race conditions между сервисами (например, backup во время api-sync)
 */

export type ServiceName = 
  | 'api-sync' 
  | 'backup' 
  | 'analytics' 
  | 'market-price-calculator'
  | 'file-import'
  | 'ftp-sync';

export type ServiceStatusType = 'idle' | 'running' | 'completed' | 'failed';

/**
 * Статус сервиса в Redis
 */
export interface ServiceStatus {
  serviceName: ServiceName;
  status: ServiceStatusType;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Настройки ServiceCoordinator
 */
export interface CoordinatorConfig {
  redisKeyPrefix: string;
  defaultTimeout: number;
  cleanupInterval: number;
}

/**
 * Результат проверки зависимостей
 */
export interface DependencyCheck {
  canStart: boolean;
  reason?: string;
  waitingFor?: ServiceName[];
}

