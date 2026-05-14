/**
 * Оптимизации производительности для микросервиса расчета маркетпрайсов
 * 
 * Основные направления оптимизации:
 * 1. Кэширование промежуточных результатов
 * 2. Пакетная обработка операций
 * 3. Параллельная обработка независимых групп
 * 4. Оптимизация алгоритмов
 * 5. Предварительная фильтрация и индексация данных
 */

import { IProduct } from './types';
import { performance } from 'perf_hooks';
import winston from 'winston';

export interface IPerformanceMetrics {
  operationName: string;
  startTime: number;
  endTime: number;
  duration: number;
  memoryUsage: NodeJS.MemoryUsage;
  itemsProcessed: number;
  throughput: number; // items per second
}

export interface ICacheEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
  size: number; // approximate memory size in bytes
}

export interface IOptimizationConfig {
  enableCaching: boolean;
  cacheMaxSize: number; // MB
  cacheMaxAge: number; // milliseconds
  batchSize: number;
  maxParallelOperations: number;
  enablePerformanceLogging: boolean;
}

/**
 * Система кэширования с управлением памятью
 */
export class SmartCache<T> {
  private cache = new Map<string, ICacheEntry<T>>();
  private maxSize: number; // bytes
  private maxAge: number; // milliseconds
  private currentSize: number = 0;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSizeMB: number = 50, maxAge: number = 60000) {
    this.maxSize = maxSizeMB * 1024 * 1024; // Convert to bytes
    this.maxAge = maxAge;
  }

  set(key: string, data: T): void {
    // Удаляем старую запись, если существует
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      this.currentSize -= oldEntry.size;
    }

    const size = this.estimateSize(data);
    const entry: ICacheEntry<T> = {
      data,
      timestamp: Date.now(),
      hits: 0,
      size
    };

    // Очищаем место, если нужно
    this.evictIfNeeded(size);

    this.cache.set(key, entry);
    this.currentSize += size;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    // Проверяем, не истек ли срок действия
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      this.currentSize -= entry.size;
      this.misses++;
      return null;
    }

    entry.hits++;
    this.hits++;
    return entry.data;
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  getStats(): ICacheStats {
    return {
      size: this.cache.size,
      memoryUsage: this.currentSize,
      hitRate: this.hits / (this.hits + this.misses) || 0,
      hits: this.hits,
      misses: this.misses
    };
  }

  private estimateSize(data: T): number {
    // Приблизительная оценка размера объекта в байтах
    try {
      return JSON.stringify(data).length * 2; // Unicode characters are 2 bytes
    } catch {
      return 1000; // fallback estimate
    }
  }

  private evictIfNeeded(newItemSize: number): void {
    while (this.currentSize + newItemSize > this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey)!;
      this.cache.delete(oldestKey);
      this.currentSize -= entry.size;
    }
  }
}

/**
 * Менеджер производительности и оптимизации
 */
export class PerformanceOptimizer {
  private readonly logger: winston.Logger;
  private readonly config: IOptimizationConfig;
  private readonly cache: SmartCache<any>;
  private performanceMetrics: IPerformanceMetrics[] = [];
  private readonly MAX_METRICS = 1000;

  constructor(logger: winston.Logger, config: Partial<IOptimizationConfig> = {}) {
    this.logger = logger;
    this.config = {
      enableCaching: true,
      cacheMaxSize: 50, // MB
      cacheMaxAge: 300000, // 5 minutes
      batchSize: 100,
      maxParallelOperations: 4,
      enablePerformanceLogging: true,
      ...config
    };
    this.cache = new SmartCache(this.config.cacheMaxSize, this.config.cacheMaxAge);
  }

  /**
   * Измерение производительности операции
   */
  async measurePerformance<T>(
    operationName: string,
    operation: () => Promise<T>,
    itemsCount: number = 1
  ): Promise<T> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();

    try {
      const result = await operation();
      
      if (this.config.enablePerformanceLogging) {
        const endTime = performance.now();
        const endMemory = process.memoryUsage();
        const duration = endTime - startTime;
        
        const metrics: IPerformanceMetrics = {
          operationName,
          startTime,
          endTime,
          duration,
          memoryUsage: {
            rss: endMemory.rss - startMemory.rss,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            external: endMemory.external - startMemory.external,
            arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
          },
          itemsProcessed: itemsCount,
          throughput: itemsCount / (duration / 1000)
        };

        this.addPerformanceMetric(metrics);
        
        if (duration > 1000) { // Log slow operations
          this.logger.warn(`Slow operation detected: ${operationName}`, {
            duration: `${duration.toFixed(2)}ms`,
            throughput: `${metrics.throughput.toFixed(2)} items/sec`,
            memoryIncrease: `${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`
          });
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Performance measurement failed for ${operationName}:`, error);
      throw error;
    }
  }

  /**
   * Кэширование с автоматическим ключом
   */
  async cachedOperation<T>(
    operation: () => Promise<T>,
    cacheKey: string,
    _ttl?: number
  ): Promise<T> {
    if (!this.config.enableCaching) {
      return await operation();
    }

    // Попытка получить из кэша
    const cached = this.cache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Выполнение операции и кэширование результата
    const result = await operation();
    this.cache.set(cacheKey, result);
    
    return result;
  }

  /**
   * Пакетная обработка массива элементов
   */
  async processBatch<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    batchSize?: number
  ): Promise<R[]> {
    const actualBatchSize = batchSize || this.config.batchSize;
    const results: R[] = [];

    for (let i = 0; i < items.length; i += actualBatchSize) {
      const batch = items.slice(i, i + actualBatchSize);
      const batchResults = await processor(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Параллельная обработка независимых групп
   */
  async processParallel<T, R>(
    groups: T[][],
    processor: (group: T[]) => Promise<R[]>,
    maxConcurrency?: number
  ): Promise<R[][]> {
    const concurrency = maxConcurrency || this.config.maxParallelOperations;
    const results: R[][] = [];

    for (let i = 0; i < groups.length; i += concurrency) {
      const promises = groups
        .slice(i, i + concurrency)
        .map(group => processor(group));
      
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Оптимизированная фильтрация и группировка продуктов
   */
  async optimizedProductGrouping(products: IProduct[]): Promise<Map<string, IProduct[]>> {
    return this.measurePerformance(
      'optimizedProductGrouping',
      async () => {
        const groups = new Map<string, IProduct[]>();
        
        // Предварительная фильтрация валидных продуктов
        const validProducts = products.filter(product => 
          product &&
          typeof product.pricePerCarat === 'number' &&
          product.pricePerCarat > 0 &&
          isFinite(product.pricePerCarat) &&
          product.shape &&
          product.clarity &&
          product.color &&
          product.status !== 'OnDeal' &&
          !product.onDeal
        );

        // Группировка за один проход
        for (const product of validProducts) {
          const shape = this.determineShapeCategory(product.shape);
          const weight = this.determineWeightCategory(product.carat);
          const clarity = this.determineClarityCategory(product.clarity);
          const color = this.determineColorCategory(product.color);
          
          if (shape && weight && clarity && color) {
            const key = `${shape}-${weight}-${clarity}-${color}`;
            
            if (!groups.has(key)) {
              groups.set(key, []);
            }
            groups.get(key)!.push(product);
          }
        }

        return groups;
      },
      products.length
    );
  }

  /**
   * Оптимизированный расчет статистик для группы продуктов
   */
  calculateGroupStatistics(products: IProduct[]): IOptimizedStatistics {
    if (products.length === 0) {
      return this.createEmptyStatistics();
    }

    // Извлекаем цены за один проход
    const prices = products.map(p => p.pricePerCarat);
    
    // Сортируем только один раз
    const sortedPrices = [...prices].sort((a, b) => a - b);
    
    // Вычисляем все статистики за один проход
    let sum = 0;
    let sumSquares = 0;
    
    for (const price of prices) {
      sum += price;
      sumSquares += price * price;
    }
    
    const n = prices.length;
    const mean = sum / n;
    const variance = n > 1 ? (sumSquares - sum * sum / n) / (n - 1) : 0;
    const stdDev = Math.sqrt(variance);
    
    // Медиана из отсортированного массива
    const median = n % 2 === 0 
      ? ((sortedPrices[n / 2 - 1] || 0) + (sortedPrices[n / 2] || 0)) / 2
      : (sortedPrices[Math.floor(n / 2)] || 0);
    
    // MAD (Median Absolute Deviation)
    const deviations = prices.map(price => Math.abs(price - median));
    const sortedDeviations = deviations.sort((a, b) => a - b);
    const mad = n % 2 === 0 
      ? ((sortedDeviations[n / 2 - 1] || 0) + (sortedDeviations[n / 2] || 0)) / 2
      : (sortedDeviations[Math.floor(n / 2)] || 0);

    return {
      count: n,
      mean,
      median,
      standardDeviation: stdDev,
      mad,
      min: sortedPrices[0] || 0,
      max: sortedPrices[n - 1] || 0,
      sum,
      variance
    };
  }

  /**
   * Получение метрик производительности
   */
  getPerformanceReport(): IPerformanceReport {
    const metrics = this.performanceMetrics;
    const cacheStats = this.cache.getStats();
    
    if (metrics.length === 0) {
      return {
        totalOperations: 0,
        averageDuration: 0,
        totalThroughput: 0,
        memoryEfficiency: 0,
        cacheStats,
        slowOperations: [],
        recommendations: ['No operations measured yet']
      };
    }

    const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
    const totalItems = metrics.reduce((sum, m) => sum + m.itemsProcessed, 0);
    const averageDuration = totalDuration / metrics.length;
    const totalThroughput = totalItems / (totalDuration / 1000);
    
    const slowOperations = metrics
      .filter(m => m.duration > 1000)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    const memoryUsage = metrics.reduce((sum, m) => sum + (m.memoryUsage.heapUsed || 0), 0);
    const memoryEfficiency = totalItems > 0 ? totalItems / (memoryUsage / 1024 / 1024) : 0;

    const recommendations = this.generateOptimizationRecommendations(metrics, cacheStats);

    return {
      totalOperations: metrics.length,
      averageDuration,
      totalThroughput,
      memoryEfficiency,
      cacheStats,
      slowOperations,
      recommendations
    };
  }

  /**
   * Очистка кэша и метрик
   */
  cleanup(): void {
    this.cache.clear();
    this.performanceMetrics = [];
  }

  // Приватные методы

  private addPerformanceMetric(metric: IPerformanceMetrics): void {
    this.performanceMetrics.push(metric);
    
    if (this.performanceMetrics.length > this.MAX_METRICS) {
      this.performanceMetrics.shift();
    }
  }

  private createEmptyStatistics(): IOptimizedStatistics {
    return {
      count: 0,
      mean: 0,
      median: 0,
      standardDeviation: 0,
      mad: 0,
      min: 0,
      max: 0,
      sum: 0,
      variance: 0
    };
  }

  private generateOptimizationRecommendations(
    metrics: IPerformanceMetrics[],
    cacheStats: ICacheStats
  ): string[] {
    const recommendations: string[] = [];
    
    const slowOpsCount = metrics.filter(m => m.duration > 1000).length;
    if (slowOpsCount > metrics.length * 0.1) {
      recommendations.push('Consider optimizing slow operations (>1s duration)');
    }
    
    if (cacheStats.hitRate < 0.5) {
      recommendations.push('Low cache hit rate - consider adjusting cache size or TTL');
    }
    
    const avgThroughput = metrics.reduce((sum, m) => sum + m.throughput, 0) / metrics.length;
    if (avgThroughput < 100) {
      recommendations.push('Low throughput detected - consider batch processing');
    }
    
    const highMemoryOps = metrics.filter(m => (m.memoryUsage.heapUsed || 0) > 50 * 1024 * 1024);
    if (highMemoryOps.length > 0) {
      recommendations.push('High memory usage operations detected - consider streaming or chunking');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Performance metrics look good');
    }
    
    return recommendations;
  }

  // Заглушки для методов категоризации (должны быть реализованы в основном классе)
  private determineShapeCategory(shape: string): string | null {
    // Реализация должна быть заимствована из основного калькулятора
    return shape?.toUpperCase();
  }

  private determineWeightCategory(carat: number): string | null {
    // Реализация должна быть заимствована из основного калькулятора
    if (carat < 0.3) return '0.00-0.29';
    if (carat < 0.6) return '0.30-0.59';
    if (carat < 1.0) return '0.60-0.99';
    if (carat < 1.4) return '1.00-1.39';
    // ... и так далее
    return '1.00-1.39';
  }

  private determineClarityCategory(clarity: string): string | null {
    // Реализация должна быть заимствована из основного калькулятора
    return clarity?.toUpperCase();
  }

  private determineColorCategory(color: string): string | null {
    // Реализация должна быть заимствована из основного калькулятора
    return color?.toUpperCase();
  }
}

// Интерфейсы для системы оптимизации

export interface ICacheStats {
  size: number;
  memoryUsage: number;
  hitRate: number;
  hits: number;
  misses: number;
}

export interface IOptimizedStatistics {
  count: number;
  mean: number;
  median: number;
  standardDeviation: number;
  mad: number;
  min: number;
  max: number;
  sum: number;
  variance: number;
}

export interface IPerformanceReport {
  totalOperations: number;
  averageDuration: number;
  totalThroughput: number;
  memoryEfficiency: number;
  cacheStats: ICacheStats;
  slowOperations: IPerformanceMetrics[];
  recommendations: string[];
}

/**
 * Декораторы для автоматической оптимизации
 */
export function withCaching(cacheKey: (args: unknown[]) => string, ttl?: number) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: unknown[]) {
      const optimizer = (this as { performanceOptimizer: PerformanceOptimizer }).performanceOptimizer;
      if (!optimizer) {
        return await originalMethod.apply(this, args);
      }
      
      const key = cacheKey(args);
      return await optimizer.cachedOperation(
        () => originalMethod.apply(this, args),
        key,
        ttl
      );
    };
    
    return descriptor;
  };
}

export function withPerformanceTracking(operationName?: string) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const opName = operationName || `Unknown.${_propertyKey}`;
    
    descriptor.value = async function (...args: unknown[]) {
      const optimizer = (this as { performanceOptimizer: PerformanceOptimizer }).performanceOptimizer;
      if (!optimizer) {
        return await originalMethod.apply(this, args);
      }
      
      return await optimizer.measurePerformance(
        opName,
        () => originalMethod.apply(this, args),
        Array.isArray(args[0]) ? args[0].length : 1
      );
    };
    
    return descriptor;
  };
}
