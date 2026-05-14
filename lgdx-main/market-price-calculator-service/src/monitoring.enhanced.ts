import winston from 'winston';
import { EventEmitter } from 'events';

/**
 * Улучшенная система мониторинга и логирования
 * для микросервиса расчета маркетпрайсов
 * 
 * Функциональность:
 * 1. Структурированное логирование с контекстом
 * 2. Метрики производительности в реальном времени
 * 3. Система алертов и уведомлений
 * 4. Мониторинг состояния компонентов
 * 5. Трекинг бизнес-метрик
 * 6. Health checks
 */

export enum AlertLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export enum ComponentStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  DOWN = 'DOWN'
}

export interface IMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface IAlert {
  id: string;
  level: AlertLevel;
  message: string;
  component: string;
  timestamp: Date;
  context?: Record<string, any>;
  resolved?: boolean;
  resolvedAt?: Date;
}

export interface IComponentHealth {
  name: string;
  status: ComponentStatus;
  lastCheck: Date;
  responseTime?: number;
  errorRate?: number;
  uptime?: number;
  details?: Record<string, any>;
}

export interface IBusinessMetrics {
  totalProductsProcessed: number;
  categoriesProcessed: number;
  giaCoefficientsCalculated: number;
  priceAdjustmentsApplied: number;
  averageProcessingTime: number;
  errorRate: number;
  qualityScore: number;
  timestamp: Date;
}

export interface ISystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIO: number;
  openConnections: number;
  timestamp: Date;
}

/**
 * Расширенная система мониторинга
 */
export class EnhancedMonitoring extends EventEmitter {
  private readonly logger: winston.Logger;
  private metrics: Map<string, IMetric[]> = new Map();
  private alerts: Map<string, IAlert> = new Map();
  private componentHealth: Map<string, IComponentHealth> = new Map();
  private businessMetrics: IBusinessMetrics[] = [];
  private systemMetrics: ISystemMetrics[] = [];
  
  private readonly MAX_METRICS_HISTORY = 1000;
  private readonly MAX_ALERTS_HISTORY = 100;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  
  private healthCheckInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor() {
    super();
    this.logger = this.createLogger();
    this.setupHealthChecks();
    this.registerComponents();
  }

  /**
   * Создание структурированного логгера
   */
  private createLogger(): winston.Logger {
    return winston.createLogger({
      level: process.env['LOG_LEVEL'] || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] })
      ),
      defaultMeta: { 
        service: 'market-price-calculator',
        version: process.env['npm_package_version'] || '1.0.0',
        environment: process.env['NODE_ENV'] || 'development'
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({ 
          filename: 'logs/error.log', 
          level: 'error',
          maxsize: 10485760, // 10MB
          maxFiles: 5
        }),
        new winston.transports.File({ 
          filename: 'logs/combined.log',
          maxsize: 10485760,
          maxFiles: 10
        })
      ]
    });
  }

  /**
   * Логирование с контекстом
   */
  logWithContext(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context: Record<string, any> = {}
  ): void {
    this.logger[level](message, {
      ...context,
      timestamp: new Date().toISOString(),
      traceId: this.generateTraceId()
    });
  }

  /**
   * Запись метрики
   */
  recordMetric(
    name: string,
    value: number,
    unit: string = 'count',
    tags: Record<string, string> = {}
  ): void {
    const metric: IMetric = {
      name,
      value,
      unit,
      timestamp: new Date(),
      tags
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const history = this.metrics.get(name)!;
    history.push(metric);

    // Ограничиваем историю
    if (history.length > this.MAX_METRICS_HISTORY) {
      history.shift();
    }

    // Проверяем пороги для алертов
    this.checkMetricThresholds(metric);

    // Эмитируем событие для внешних подписчиков
    this.emit('metric', metric);
  }

  /**
   * Создание алерта
   */
  createAlert(
    level: AlertLevel,
    message: string,
    component: string,
    context: Record<string, any> = {}
  ): string {
    const alertId = this.generateAlertId();
    const alert: IAlert = {
      id: alertId,
      level,
      message,
      component,
      timestamp: new Date(),
      context,
      resolved: false
    };

    this.alerts.set(alertId, alert);
    
    // Ограничиваем количество алертов
    if (this.alerts.size > this.MAX_ALERTS_HISTORY) {
      const oldestAlert = Array.from(this.alerts.keys())[0];
      if (oldestAlert) {
        this.alerts.delete(oldestAlert);
      }
    }

    this.logWithContext(this.getLogLevel(level), `[ALERT] ${message}`, {
      alertId,
      level,
      component,
      context
    });

    // Эмитируем событие
    this.emit('alert', alert);

    return alertId;
  }

  /**
   * Разрешение алерта
   */
  resolveAlert(alertId: string, resolution?: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.resolved) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();

    this.logWithContext('info', `[ALERT RESOLVED] ${alert.message}`, {
      alertId,
      resolution,
      duration: alert.resolvedAt.getTime() - alert.timestamp.getTime()
    });

    this.emit('alertResolved', alert);
    return true;
  }

  /**
   * Обновление состояния компонента
   */
  updateComponentHealth(
    name: string,
    status: ComponentStatus,
    details: Record<string, any> = {}
  ): void {
    const now = new Date();
    const existing = this.componentHealth.get(name);
    
    const health: IComponentHealth = {
      name,
      status,
      lastCheck: now,
      uptime: existing?.uptime || 0,
      ...details
    };

    // Вычисляем uptime
    if (existing && status === ComponentStatus.HEALTHY) {
      const timeDiff = now.getTime() - existing.lastCheck.getTime();
      health.uptime = (existing.uptime || 0) + timeDiff;
    }

    this.componentHealth.set(name, health);

    // Создаем алерт при изменении статуса
    if (existing && existing.status !== status) {
      const level = this.getAlertLevelForStatus(status);
      this.createAlert(
        level,
        `Component ${name} status changed from ${existing.status} to ${status}`,
        name,
        { previousStatus: existing.status, currentStatus: status, details }
      );
    }

    this.emit('componentHealthUpdate', health);
  }

  /**
   * Запись бизнес-метрик
   */
  recordBusinessMetrics(metrics: Partial<IBusinessMetrics>): void {
    const businessMetrics: IBusinessMetrics = {
      totalProductsProcessed: 0,
      categoriesProcessed: 0,
      giaCoefficientsCalculated: 0,
      priceAdjustmentsApplied: 0,
      averageProcessingTime: 0,
      errorRate: 0,
      qualityScore: 0,
      timestamp: new Date(),
      ...metrics
    };

    this.businessMetrics.push(businessMetrics);

    // Ограничиваем историю
    if (this.businessMetrics.length > this.MAX_METRICS_HISTORY) {
      this.businessMetrics.shift();
    }

    this.logWithContext('info', 'Business metrics recorded', businessMetrics);
    this.emit('businessMetrics', businessMetrics);
  }

  /**
   * Запись системных метрик
   */
  recordSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const systemMetrics: ISystemMetrics = {
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      memoryUsage: memUsage.heapUsed / memUsage.heapTotal * 100,
      diskUsage: 0, // Requires additional implementation
      networkIO: 0, // Requires additional implementation
      openConnections: 0, // Requires additional implementation
      timestamp: new Date()
    };

    this.systemMetrics.push(systemMetrics);

    if (this.systemMetrics.length > this.MAX_METRICS_HISTORY) {
      this.systemMetrics.shift();
    }

    // Записываем отдельные метрики
    this.recordMetric('system.cpu.usage', systemMetrics.cpuUsage, 'percent');
    this.recordMetric('system.memory.usage', systemMetrics.memoryUsage, 'percent');
    this.recordMetric('system.memory.heap', memUsage.heapUsed, 'bytes');

    this.emit('systemMetrics', systemMetrics);
  }

  /**
   * Health check для всех компонентов
   */
  async performHealthCheck(): Promise<IHealthCheckResult> {
    const results: Record<string, IComponentHealth> = {};
    let overallStatus = ComponentStatus.HEALTHY;

    for (const [name, _health] of this.componentHealth) {
      try {
        // Выполняем специфичные проверки для каждого компонента
        const checkResult = await this.checkComponentHealth(name);
        
        this.updateComponentHealth(name, checkResult.status, {
          responseTime: checkResult.responseTime,
          errorRate: checkResult.errorRate,
          details: checkResult.details
        });

        results[name] = this.componentHealth.get(name)!;

        // Определяем общий статус
        if (checkResult.status === ComponentStatus.DOWN || checkResult.status === ComponentStatus.UNHEALTHY) {
          overallStatus = ComponentStatus.UNHEALTHY;
        } else if (checkResult.status === ComponentStatus.DEGRADED && overallStatus === ComponentStatus.HEALTHY) {
          overallStatus = ComponentStatus.DEGRADED;
        }

      } catch (error) {
        this.updateComponentHealth(name, ComponentStatus.DOWN, {
          error: (error as Error).message
        });
        results[name] = this.componentHealth.get(name)!;
        overallStatus = ComponentStatus.UNHEALTHY;
      }
    }

    const healthCheckResult: IHealthCheckResult = {
      status: overallStatus,
      timestamp: new Date(),
      components: results,
      uptime: process.uptime(),
      version: process.env['npm_package_version'] || '1.0.0'
    };

    this.emit('healthCheck', healthCheckResult);
    return healthCheckResult;
  }

  /**
   * Получение метрик за период
   */
  getMetrics(metricName?: string, since?: Date): IMetric[] {
    if (metricName) {
      const metrics = this.metrics.get(metricName) || [];
      return since ? metrics.filter(m => m.timestamp >= since) : metrics;
    }

    const allMetrics: IMetric[] = [];
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...(since ? metrics.filter(m => m.timestamp >= since) : metrics));
    }

    return allMetrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Получение активных алертов
   */
  getActiveAlerts(): IAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Получение дашборда мониторинга
   */
  getMonitoringDashboard(): IMonitoringDashboard {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    return {
      timestamp: now,
      overallHealth: this.getOverallHealth(),
      activeAlerts: this.getActiveAlerts(),
      recentMetrics: this.getMetrics(undefined, oneHourAgo),
      componentStatus: Object.fromEntries(this.componentHealth),
      businessMetrics: this.businessMetrics.slice(-10), // Last 10 records
      systemMetrics: this.systemMetrics.slice(-10)
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.logWithContext('info', 'Monitoring system shutting down');
    
    // Эмитируем финальные метрики
    this.recordSystemMetrics();
    
    // Даем время на обработку последних событий
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Приватные методы

  private setupHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.performHealthCheck();
        this.recordSystemMetrics();
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private registerComponents(): void {
    // Регистрируем основные компоненты системы
    const components = [
      'database',
      'gia-calculator',
      'price-smoother',
      'external-apis',
      'cache',
      'scheduler'
    ];

    components.forEach(component => {
      this.updateComponentHealth(component, ComponentStatus.HEALTHY);
    });
  }

  private async checkComponentHealth(componentName: string): Promise<IComponentHealthCheck> {
    const startTime = Date.now();
    
    try {
      switch (componentName) {
        case 'database':
          return await this.checkDatabaseHealth();
        case 'gia-calculator':
          return await this.checkGiaCalculatorHealth();
        case 'price-smoother':
          return await this.checkPriceSmootherHealth();
        case 'external-apis':
          return await this.checkExternalApisHealth();
        case 'cache':
          return await this.checkCacheHealth();
        case 'scheduler':
          return await this.checkSchedulerHealth();
        default:
          return {
            status: ComponentStatus.HEALTHY,
            responseTime: Date.now() - startTime,
            errorRate: 0
          };
      }
    } catch (error) {
      return {
        status: ComponentStatus.DOWN,
        responseTime: Date.now() - startTime,
        errorRate: 100,
        details: { error: (error as Error).message }
      };
    }
  }

  private async checkDatabaseHealth(): Promise<IComponentHealthCheck> {
    // Заглушка для проверки БД
    return {
      status: ComponentStatus.HEALTHY,
      responseTime: 50,
      errorRate: 0,
      details: { connection: 'active', latency: '50ms' }
    };
  }

  private async checkGiaCalculatorHealth(): Promise<IComponentHealthCheck> {
    // Заглушка для проверки GIA калькулятора
    return {
      status: ComponentStatus.HEALTHY,
      responseTime: 10,
      errorRate: 0
    };
  }

  private async checkPriceSmootherHealth(): Promise<IComponentHealthCheck> {
    // Заглушка для проверки сглаживателя цен
    return {
      status: ComponentStatus.HEALTHY,
      responseTime: 15,
      errorRate: 0
    };
  }

  private async checkExternalApisHealth(): Promise<IComponentHealthCheck> {
    // Заглушка для проверки внешних API
    return {
      status: ComponentStatus.DEGRADED,
      responseTime: 200,
      errorRate: 5,
      details: { 'oil-api': 'slow', 'gold-api': 'healthy' }
    };
  }

  private async checkCacheHealth(): Promise<IComponentHealthCheck> {
    // Заглушка для проверки кэша
    return {
      status: ComponentStatus.HEALTHY,
      responseTime: 5,
      errorRate: 0
    };
  }

  private async checkSchedulerHealth(): Promise<IComponentHealthCheck> {
    // Заглушка для проверки планировщика
    return {
      status: ComponentStatus.HEALTHY,
      responseTime: 1,
      errorRate: 0
    };
  }

  private checkMetricThresholds(metric: IMetric): void {
    // Проверяем пороги для создания алертов
    const thresholds = this.getMetricThresholds(metric.name);
    
    if (thresholds) {
      if (metric.value > thresholds.critical) {
        this.createAlert(AlertLevel.CRITICAL, 
          `Critical threshold exceeded for ${metric.name}: ${metric.value} > ${thresholds.critical}`,
          'metrics'
        );
      } else if (metric.value > thresholds.warning) {
        this.createAlert(AlertLevel.WARNING,
          `Warning threshold exceeded for ${metric.name}: ${metric.value} > ${thresholds.warning}`,
          'metrics'
        );
      }
    }
  }

  private getMetricThresholds(metricName: string): { warning: number; critical: number } | null {
    const thresholds: Record<string, { warning: number; critical: number }> = {
      'system.cpu.usage': { warning: 70, critical: 90 },
      'system.memory.usage': { warning: 80, critical: 95 },
      'processing.time': { warning: 5000, critical: 10000 },
      'error.rate': { warning: 5, critical: 10 }
    };

    return thresholds[metricName] || null;
  }

  private getOverallHealth(): ComponentStatus {
    const statuses = Array.from(this.componentHealth.values()).map(h => h.status);
    
    if (statuses.includes(ComponentStatus.DOWN)) {
      return ComponentStatus.DOWN;
    } else if (statuses.includes(ComponentStatus.UNHEALTHY)) {
      return ComponentStatus.UNHEALTHY;
    } else if (statuses.includes(ComponentStatus.DEGRADED)) {
      return ComponentStatus.DEGRADED;
    } else {
      return ComponentStatus.HEALTHY;
    }
  }

  private generateTraceId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private getLogLevel(alertLevel: AlertLevel): 'debug' | 'info' | 'warn' | 'error' {
    switch (alertLevel) {
      case AlertLevel.INFO: return 'info';
      case AlertLevel.WARNING: return 'warn';
      case AlertLevel.ERROR:
      case AlertLevel.CRITICAL: return 'error';
      default: return 'info';
    }
  }

  private getAlertLevelForStatus(status: ComponentStatus): AlertLevel {
    switch (status) {
      case ComponentStatus.DOWN: return AlertLevel.CRITICAL;
      case ComponentStatus.UNHEALTHY: return AlertLevel.ERROR;
      case ComponentStatus.DEGRADED: return AlertLevel.WARNING;
      default: return AlertLevel.INFO;
    }
  }
}

// Интерфейсы для системы мониторинга

export interface IComponentHealthCheck {
  status: ComponentStatus;
  responseTime: number;
  errorRate: number;
  details?: Record<string, any>;
}

export interface IHealthCheckResult {
  status: ComponentStatus;
  timestamp: Date;
  components: Record<string, IComponentHealth>;
  uptime: number;
  version: string;
}

export interface IMonitoringDashboard {
  timestamp: Date;
  overallHealth: ComponentStatus;
  activeAlerts: IAlert[];
  recentMetrics: IMetric[];
  componentStatus: Record<string, IComponentHealth>;
  businessMetrics: IBusinessMetrics[];
  systemMetrics: ISystemMetrics[];
}

// Экспорт синглтона для глобального использования
export const monitoring = new EnhancedMonitoring();
