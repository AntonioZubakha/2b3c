import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  method: string;
  url: string;
  statusCode?: number;
  memoryUsage?: NodeJS.MemoryUsage;
}

// Middleware для мониторинга производительности
export const performanceMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();
  
  const metrics: PerformanceMetrics = {
    startTime,
    method: req.method,
    url: req.url
  };

  // Перехватываем завершение ответа
  const originalSend = res.send;
  res.send = function(body: any) {
    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    
    metrics.endTime = endTime;
    metrics.duration = endTime - startTime;
    metrics.statusCode = res.statusCode;
    metrics.memoryUsage = {
      rss: endMemory.rss - startMemory.rss,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal,
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      external: endMemory.external - startMemory.external,
      arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
    };

    // Логируем медленные запросы (> 1 секунды)
    if (metrics.duration > 1000) {
      logger.warn('[Performance] Slow request detected:', {
        method: metrics.method,
        url: metrics.url,
        duration: `${metrics.duration}ms`,
        statusCode: metrics.statusCode,
        memoryDelta: metrics.memoryUsage
      });
    }

    // Логируем очень медленные запросы (> 3 секунды)
    if (metrics.duration > 3000) {
      logger.error('[Performance] Very slow request detected:', {
        method: metrics.method,
        url: metrics.url,
        duration: `${metrics.duration}ms`,
        statusCode: metrics.statusCode,
        memoryDelta: metrics.memoryUsage,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    }

    // Добавляем заголовки с метриками производительности
    res.set('X-Response-Time', `${metrics.duration}ms`);
    res.set('X-Memory-Usage', `${Math.round(metrics.memoryUsage!.heapUsed / 1024 / 1024)}MB`);

    return originalSend.call(this, body);
  };

  next();
};

// Middleware для мониторинга использования памяти
export const memoryMonitorMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const memoryUsage = process.memoryUsage();
  const memoryUsageMB = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024),
    arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024)
  };

  // Предупреждение при высоком использовании памяти
  if (memoryUsageMB.heapUsed > 1000) { // > 1GB
    logger.warn('[Memory] High memory usage detected:', {
      memoryUsage: memoryUsageMB,
      url: req.url,
      method: req.method
    });
  }

  // Критическое использование памяти
  if (memoryUsageMB.heapUsed > 2000) { // > 2GB
    logger.error('[Memory] Critical memory usage detected:', {
      memoryUsage: memoryUsageMB,
      url: req.url,
      method: req.method
    });
    
    // Принудительная сборка мусора если доступна
    if (typeof global.gc === 'function') {
      global.gc();
      logger.info('[Memory] Forced garbage collection executed');
    }
  }

  next();
};

// Middleware для мониторинга базы данных
export const databasePerformanceMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Перехватываем завершение ответа для логирования времени БД
  const originalSend = res.send;
  res.send = function(body: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Логируем медленные запросы к БД
    if (duration > 500) { // > 500ms
      logger.warn('[Database] Slow database operation:', {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        statusCode: res.statusCode
      });
    }

    return originalSend.call(this, body);
  };

  next();
};

// Функция для получения статистики производительности
export const getPerformanceStats = () => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  return {
    uptime: `${Math.round(uptime)}s`,
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      arrayBuffers: `${Math.round(memoryUsage.arrayBuffers / 1024 / 1024)}MB`
    },
    cpu: process.cpuUsage(),
    platform: process.platform,
    nodeVersion: process.version,
    pid: process.pid
  };
};
