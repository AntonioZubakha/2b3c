import winston from 'winston';
import { ShapeCategory, WeightCategory, ClarityCategory, ColorCategoryEnum } from './types';

/**
 * Улучшенный сглаживатель цен с расширенной обработкой граничных случаев
 * 
 * Основные улучшения:
 * 1. Защита от деления на ноль и некорректных значений
 * 2. Адаптивные пороги для малых выборок
 * 3. Улучшенная обработка выбросов
 * 4. Статистическая валидация результатов
 * 5. Защита от бесконечных и NaN значений
 * 6. Robustness к экстремальным ценам
 */

export interface IEnhancedAdvancedCategoryStats {
  shape: ShapeCategory;
  weight: WeightCategory;
  clarity: ClarityCategory;
  color: ColorCategoryEnum;
  count: number;
  marketPricePerCarat: number;
  avgPricePerCarat: number;
  medianPricePerCarat: number;
  standardDeviation: number;
  standardError: number;
  mad: number; // Median Absolute Deviation
  logPrice: number;
  winsorizedPrice: number;
  
  // Новые поля для улучшенной обработки
  confidence: number; // Уровень доверия к данным (0-1)
  volatility: number; // Коэффициент вариации
  isOutlier: boolean; // Флаг выброса на уровне категории
  hasInsufficientData: boolean; // Флаг недостаточных данных
  originalPrice: number; // Оригинальная цена до обработки
  priceRange: [number, number]; // Диапазон цен в категории
}

export interface IEnhancedStatisticalTest {
  isSignificant: boolean;
  zScore: number;
  pValue: number;
  confidenceInterval: [number, number];
  effectSize: number;
  robustnessScore: number; // Оценка надежности теста (0-1)
  sampleSizeAdequacy: number; // Адекватность размера выборки (0-1)
}

export interface IEnhancedSmoothingResult {
  originalPrice: number;
  adjustedPrice: number;
  adjustmentPercent: number;
  adjustmentReason: string;
  statisticalTest: IEnhancedStatisticalTest;
  confidence: number;
  methodUsed: string;
  validationPassed: boolean;
}

export interface IEnhancedSmoothingTableResult {
  totalCategories: number;
  adjustedCategories: number;
  summary: {
    maxAdjustment: number;
    avgAdjustment: number;
    statisticalSignificantAdjustments: number;
    isotonicAdjustments: number;
    robustAdjustments: number; // Новое: количество "надежных" корректировок
  };
  processingStats: {
    outliersRemoved: number;
    statisticalTestsPerformed: number;
    categoriesWithLowConfidence: number;
    categoriesWithInsufficientData: number; // Новое
    invalidCategoriesSkipped: number; // Новое
  };
  monotonicityViolationsBefore: number;
  monotonicityViolationsAfter: number;
  monotonicityImprovement: number;
  adjustments: Map<string, IEnhancedSmoothingResult>;
  qualityMetrics: IQualityMetrics; // Новое: метрики качества
}

export interface IQualityMetrics {
  overallConfidence: number; // Общий уровень доверия к результатам
  dataQualityScore: number; // Оценка качества входных данных
  adjustmentReliability: number; // Надежность примененных корректировок
  coverageScore: number; // Покрытие данными (процент категорий с достаточными данными)
}

export class EnhancedAdvancedPriceSmoother {
  // Основные константы
  private readonly Z_THRESHOLD = 1.96;                    // 95% доверительный интервал
  private readonly MIN_SAMPLE_SIZE = 3;                   // Минимальный размер выборки
  private readonly MAX_ADJUSTMENT_PERCENT = 0.15;         // Максимум 15% корректировки
  private readonly MAX_ISOTONIC_ADJUSTMENT_PERCENT = 0.10; // 10% для isotonic regression
  
  // Новые константы для улучшенной обработки
  private readonly MIN_PRICE_THRESHOLD = 1;               // Минимальная разумная цена
  private readonly MAX_PRICE_THRESHOLD = 1000000;         // Максимальная разумная цена
  private readonly OUTLIER_Z_THRESHOLD = 3.0;             // Порог для определения выбросов
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.3;        // Минимальный порог доверия
  private readonly VOLATILITY_THRESHOLD = 1.0;            // Порог высокой волатильности
  private readonly SMALL_SAMPLE_THRESHOLD = 5;            // Порог малой выборки
  
  // Адаптивные коэффициенты (unused but kept for future use)
  
  private readonly logger: winston.Logger;

  constructor() {
    try {
      this.logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        defaultMeta: { service: 'enhanced-price-smoother' },
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
          })
        ]
      });
    } catch (error) {
      // Fallback for test environments - mock logger
      this.logger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {}
      } as any;
    }
  }

  /**
   * Основная функция сглаживания с улучшенной обработкой граничных случаев
   */
  public smoothMarketPrices(categoryStats: IEnhancedAdvancedCategoryStats[]): IEnhancedSmoothingTableResult {
    this.logger.info(`Starting enhanced price smoothing for ${categoryStats.length} categories`);
    
    const totalInputCategories = categoryStats.length;
    
    // Валидация и очистка входных данных
    const validatedStats = this.validateAndCleanInput(categoryStats);
    
    if (validatedStats.length === 0) {
      this.logger.warn('No valid categories after input validation');
      return this.createEmptyResult(totalInputCategories);
    }

    const adjustments = new Map<string, IEnhancedSmoothingResult>();
    const processingMetrics = this.initializeProcessingMetrics();
    
    // 1. Предварительная обработка и оценка качества данных
    const processedStats = this.preprocessDataEnhanced(validatedStats, processingMetrics);
    
    // 2. Группировка и анализ иерархий
    const hierarchyGroups = this.analyzeHierarchies(processedStats);
    
    // 3. Применение улучшенного isotonic regression
    this.applyEnhancedIsotonicRegression(hierarchyGroups, adjustments, processingMetrics);
    
    // 4. Статистическая валидация результатов
    this.validateResults(adjustments, processingMetrics);
    
    // 5. Расчет метрик качества
    const qualityMetrics = this.calculateQualityMetrics(processedStats, adjustments);
    
    return this.buildFinalResult(adjustments, processingMetrics, qualityMetrics, totalInputCategories);
  }

  /**
   * Валидация и очистка входных данных
   */
  private validateAndCleanInput(categoryStats: IEnhancedAdvancedCategoryStats[]): IEnhancedAdvancedCategoryStats[] {
    const validStats: IEnhancedAdvancedCategoryStats[] = [];
    let invalidCount = 0;

    for (const stat of categoryStats) {
      if (this.isValidCategoryStat(stat)) {
        // Очистка от экстремальных значений
        const cleanedStat = this.cleanCategoryStat(stat);
        validStats.push(cleanedStat);
      } else {
        invalidCount++;
        this.logger.debug(`Invalid category stat skipped: ${this.getCategoryKey(stat)}`);
      }
    }

    if (invalidCount > 0) {
      this.logger.warn(`Skipped ${invalidCount} invalid category statistics`);
    }

    return validStats;
  }

  /**
   * Проверка валидности статистики категории
   */
  private isValidCategoryStat(stat: IEnhancedAdvancedCategoryStats): boolean {
    return !!(
      stat &&
      typeof stat.marketPricePerCarat === 'number' &&
      stat.marketPricePerCarat > this.MIN_PRICE_THRESHOLD &&
      stat.marketPricePerCarat < this.MAX_PRICE_THRESHOLD &&
      isFinite(stat.marketPricePerCarat) &&
      !isNaN(stat.marketPricePerCarat) &&
      typeof stat.count === 'number' &&
      stat.count > 0 &&
      isFinite(stat.count) &&
      stat.shape &&
      stat.weight &&
      stat.clarity &&
      stat.color
    );
  }

  /**
   * Очистка статистики категории от экстремальных значений
   */
  private cleanCategoryStat(stat: IEnhancedAdvancedCategoryStats): IEnhancedAdvancedCategoryStats {
    const cleanedStat = { ...stat };
    
    // Сохраняем оригинальную цену
    cleanedStat.originalPrice = stat.marketPricePerCarat;
    
    // Проверяем и корректируем стандартное отклонение
    if (!isFinite(stat.standardDeviation) || isNaN(stat.standardDeviation)) {
      cleanedStat.standardDeviation = stat.marketPricePerCarat * 0.1; // 10% от цены как fallback
    }
    
    // Проверяем и корректируем MAD
    if (!isFinite(stat.mad) || isNaN(stat.mad)) {
      cleanedStat.mad = cleanedStat.standardDeviation * 0.6745; // Приближенное соотношение для нормального распределения
    }
    
    // Рассчитываем доверие к данным
    cleanedStat.confidence = this.calculateDataConfidence(cleanedStat);
    
    // Рассчитываем волатильность
    cleanedStat.volatility = this.calculateVolatility(cleanedStat);
    
    // Определяем, является ли категория выбросом
    cleanedStat.isOutlier = this.isCategoryOutlier(cleanedStat);
    
    // Проверяем достаточность данных
    cleanedStat.hasInsufficientData = stat.count < this.MIN_SAMPLE_SIZE;
    
    // Устанавливаем диапазон цен (приблизительно)
    const priceSpread = cleanedStat.standardDeviation * 2;
    cleanedStat.priceRange = [
      Math.max(this.MIN_PRICE_THRESHOLD, cleanedStat.marketPricePerCarat - priceSpread),
      Math.min(this.MAX_PRICE_THRESHOLD, cleanedStat.marketPricePerCarat + priceSpread)
    ];
    
    return cleanedStat;
  }

  /**
   * Расчет уровня доверия к данным категории
   */
  private calculateDataConfidence(stat: IEnhancedAdvancedCategoryStats): number {
    let confidence = 1.0;
    
    // Штраф за малый размер выборки
    if (stat.count < this.SMALL_SAMPLE_THRESHOLD) {
      confidence *= 0.5;
    } else if (stat.count < this.MIN_SAMPLE_SIZE * 2) {
      confidence *= 0.7;
    }
    
    // Штраф за высокую волатильность
    const cv = stat.standardDeviation / stat.marketPricePerCarat;
    if (cv > this.VOLATILITY_THRESHOLD) {
      confidence *= Math.max(0.2, 1 - (cv - this.VOLATILITY_THRESHOLD) * 0.5);
    }
    
    // Штраф за экстремальные цены
    if (stat.marketPricePerCarat < this.MIN_PRICE_THRESHOLD * 10 || 
        stat.marketPricePerCarat > this.MAX_PRICE_THRESHOLD * 0.1) {
      confidence *= 0.6;
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Расчет волатильности (коэффициента вариации)
   */
  private calculateVolatility(stat: IEnhancedAdvancedCategoryStats): number {
    if (stat.marketPricePerCarat === 0) return Infinity;
    return stat.standardDeviation / stat.marketPricePerCarat;
  }

  /**
   * Определение, является ли категория выбросом
   */
  private isCategoryOutlier(stat: IEnhancedAdvancedCategoryStats): boolean {
    // Используем MAD для робастного определения выбросов
    if (stat.mad === 0) return false;
    
    const modifiedZScore = 0.6745 * (stat.marketPricePerCarat - stat.medianPricePerCarat) / stat.mad;
    return Math.abs(modifiedZScore) > this.OUTLIER_Z_THRESHOLD;
  }

  /**
   * Улучшенная предварительная обработка данных
   */
  private preprocessDataEnhanced(
    stats: IEnhancedAdvancedCategoryStats[], 
    metrics: IProcessingMetrics
  ): IEnhancedAdvancedCategoryStats[] {
    
    const processedStats: IEnhancedAdvancedCategoryStats[] = [];
    
    for (const stat of stats) {
      if (stat.hasInsufficientData) {
        metrics.categoriesWithInsufficientData++;
        this.logger.debug(`Category ${this.getCategoryKey(stat)} has insufficient data (count: ${stat.count})`);
        // Все равно включаем в обработку, но с пониженным весом
      }
      
      if (stat.confidence < this.MIN_CONFIDENCE_THRESHOLD) {
        metrics.categoriesWithLowConfidence++;
        this.logger.debug(`Category ${this.getCategoryKey(stat)} has low confidence: ${stat.confidence.toFixed(3)}`);
      }
      
      if (stat.isOutlier) {
        metrics.outliersRemoved++;
        this.logger.debug(`Category ${this.getCategoryKey(stat)} marked as outlier`);
      }
      
      processedStats.push(stat);
    }
    
    return processedStats;
  }

  /**
   * Анализ иерархий с учетом качества данных
   */
  private analyzeHierarchies(stats: IEnhancedAdvancedCategoryStats[]): IHierarchyGroups {
    const colorGroups = this.groupByColorHierarchy(stats);
    const clarityGroups = this.groupByClarityHierarchy(stats);
    
    // Фильтруем группы с недостаточными данными
    const validColorGroups = colorGroups.filter(group => 
      group.categories.length >= 2 && 
      group.categories.some(cat => !cat.hasInsufficientData)
    );
    
    const validClarityGroups = clarityGroups.filter(group => 
      group.categories.length >= 2 && 
      group.categories.some(cat => !cat.hasInsufficientData)
    );
    
    this.logger.info(`Hierarchy analysis: ${validColorGroups.length} valid color groups, ${validClarityGroups.length} valid clarity groups`);
    
    return {
      colorGroups: validColorGroups,
      clarityGroups: validClarityGroups
    };
  }

  /**
   * Улучшенный isotonic regression с адаптивными порогами
   */
  private applyEnhancedIsotonicRegression(
    hierarchyGroups: IHierarchyGroups,
    adjustments: Map<string, IEnhancedSmoothingResult>,
    metrics: IProcessingMetrics
  ): void {
    
    const totalColorGroups = hierarchyGroups.colorGroups.length;
    const totalClarityGroups = hierarchyGroups.clarityGroups.length;
    
    this.logger.info(`Processing ${totalColorGroups} color groups and ${totalClarityGroups} clarity groups`);
    
    // Обработка цветовых групп
    let processedColorGroups = 0;
    for (const group of hierarchyGroups.colorGroups) {
      this.processHierarchyGroup(group, 'color', adjustments, metrics);
      processedColorGroups++;
      
      // Логируем прогресс каждые 50 групп
      if (processedColorGroups % 50 === 0) {
        this.logger.info(`Processed ${processedColorGroups}/${totalColorGroups} color groups`);
      }
    }
    
    this.logger.info(`Completed processing ${processedColorGroups} color groups`);
    
    // Обработка групп по чистоте
    let processedClarityGroups = 0;
    for (const group of hierarchyGroups.clarityGroups) {
      this.processHierarchyGroup(group, 'clarity', adjustments, metrics);
      processedClarityGroups++;
      
      // Логируем прогресс каждые 50 групп
      if (processedClarityGroups % 50 === 0) {
        this.logger.info(`Processed ${processedClarityGroups}/${totalClarityGroups} clarity groups`);
      }
    }
    
    this.logger.info(`Completed processing ${processedClarityGroups} clarity groups`);
  }

  /**
   * Обработка группы иерархии
   */
  private processHierarchyGroup(
    group: IHierarchyGroup,
    hierarchyType: 'color' | 'clarity',
    adjustments: Map<string, IEnhancedSmoothingResult>,
    metrics: IProcessingMetrics
  ): void {
    
    const sortedCategories = this.sortCategoriesByHierarchy(group.categories, hierarchyType);
    
    if (sortedCategories.length < 2) {
      return; // Недостаточно категорий для сглаживания
    }
    
    // Применяем Pool-Adjacent-Violators алгоритм с учетом доверия к данным
    const smoothedPrices = this.applyPAVWithConfidence(sortedCategories);
    
    // Создаем корректировки с валидацией
    for (let i = 0; i < sortedCategories.length; i++) {
      const category = sortedCategories[i];
      const smoothedPrice = smoothedPrices[i];
      
      if (!category || smoothedPrice === undefined) {
        this.logger.warn(`[SMOOTHER] Invalid category or smoothed price at index ${i}`);
        continue;
      }
      
      const categoryKey = this.getCategoryKey(category);
      
      if (Math.abs(smoothedPrice - category.marketPricePerCarat) > 0.001) {
        const adjustment = this.createValidatedAdjustment(category, smoothedPrice, hierarchyType, metrics);
        
        if (adjustment.validationPassed) {
          adjustments.set(categoryKey, adjustment);
          metrics.isotonicAdjustments++;
          
          if (adjustment.statisticalTest.robustnessScore > 0.7) {
            metrics.robustAdjustments++;
          }
        }
      }
    }
  }

  /**
   * PAV алгоритм с учетом доверия к данным (оптимизированный для предотвращения зависаний)
   */
  private applyPAVWithConfidence(categories: IEnhancedAdvancedCategoryStats[]): number[] {
    const n = categories.length;
    const prices = categories.map(cat => cat.logPrice || Math.log(cat.marketPricePerCarat));
    const weights = categories.map(cat => cat.count * cat.confidence); // Взвешиваем по доверию
    
    // Копируем для модификации
    const smoothedPrices = [...prices];
    const smoothedWeights = [...weights];
    
    // PAV алгоритм для убывающей последовательности с защитой от бесконечных циклов
    let i = 0;
    let iterations = 0;
    const maxIterations = n * n; // Защита от бесконечных циклов
    
    while (i < n - 1 && iterations < maxIterations) {
      iterations++;
      
      const currentPrice = smoothedPrices[i];
      const nextPrice = smoothedPrices[i + 1];
      
      if (currentPrice !== undefined && nextPrice !== undefined && currentPrice < nextPrice) {
        // Нарушение монотонности - объединяем соседние элементы
        let j = i + 1;
        const currentWeight = smoothedWeights[i];
        const nextWeight = smoothedWeights[j];
        
        if (currentWeight === undefined || nextWeight === undefined) {
          i++;
          continue;
        }
        
        let totalWeight = currentWeight + nextWeight;
        let weightedSum = currentPrice * currentWeight + nextPrice * nextWeight;
        
        // Найдем все элементы для объединения
        while (j < n - 1 && iterations < maxIterations) {
          const jPrice = smoothedPrices[j];
          const jNextPrice = smoothedPrices[j + 1];
          
          if (jPrice === undefined || jNextPrice === undefined || jPrice >= jNextPrice) {
            break;
          }
          
          j++;
          const jWeight = smoothedWeights[j];
          const jPriceValue = smoothedPrices[j];
          
          if (jWeight === undefined || jPriceValue === undefined) continue;
          
          totalWeight += jWeight;
          weightedSum += jPriceValue * jWeight;
        }
        
        const averagePrice = totalWeight > 0 ? weightedSum / totalWeight : currentPrice;
        
        // Устанавливаем одинаковое значение для всех объединенных элементов
        for (let k = i; k <= j; k++) {
          if (smoothedPrices[k] !== undefined) {
            smoothedPrices[k] = averagePrice;
          }
        }
        
        // Начинаем заново с предыдущего элемента, но только если мы не в начале
        i = Math.max(0, i - 1);
      } else {
        i++;
      }
    }
    
    // Логируем предупреждение если достигли лимита итераций
    if (iterations >= maxIterations) {
      this.logger.warn(`PAV algorithm reached maximum iterations (${maxIterations}) for ${n} categories`);
    }
    
    // Возвращаем в обычное пространство цен
    return smoothedPrices.map(logPrice => Math.exp(logPrice));
  }

  /**
   * Создание валидированной корректировки
   */
  private createValidatedAdjustment(
    category: IEnhancedAdvancedCategoryStats,
    smoothedPrice: number,
    hierarchyType: string,
    metrics: IProcessingMetrics
  ): IEnhancedSmoothingResult {
    
    const originalPrice = category.marketPricePerCarat;
    const adjustmentPercent = (smoothedPrice - originalPrice) / originalPrice;
    
    // Адаптивное ограничение корректировки на основе доверия к данным
    const maxAdjustment = this.calculateMaxAdjustment(category);
    const boundedAdjustmentPercent = Math.max(-maxAdjustment, Math.min(maxAdjustment, adjustmentPercent));
    const boundedAdjustedPrice = originalPrice * (1 + boundedAdjustmentPercent);
    
    // Статистический тест
    const statisticalTest = this.performEnhancedStatisticalTest(category, boundedAdjustedPrice);
    metrics.statisticalTestsPerformed++;
    
    if (statisticalTest.isSignificant) {
      metrics.statisticalSignificantAdjustments++;
    }
    
    // Валидация результата
    const validationPassed = this.validateAdjustment(category, boundedAdjustedPrice, statisticalTest);
    
    return {
      originalPrice,
      adjustedPrice: boundedAdjustedPrice,
      adjustmentPercent: boundedAdjustmentPercent,
      adjustmentReason: `Isotonic ${hierarchyType} hierarchy correction`,
      statisticalTest,
      confidence: category.confidence,
      methodUsed: 'Enhanced PAV',
      validationPassed
    };
  }

  /**
   * Расчет максимально допустимой корректировки для категории
   */
  private calculateMaxAdjustment(category: IEnhancedAdvancedCategoryStats): number {
    let maxAdjustment = this.MAX_ISOTONIC_ADJUSTMENT_PERCENT;
    
    // Увеличиваем лимит для категорий с высоким доверием
    if (category.confidence > 0.8) {
      maxAdjustment *= 1.2;
    }
    
    // Уменьшаем лимит для малых выборок
    if (category.count < this.SMALL_SAMPLE_THRESHOLD) {
      maxAdjustment *= 0.5;
    }
    
    // Уменьшаем лимит для высокой волатильности
    if (category.volatility > this.VOLATILITY_THRESHOLD) {
      maxAdjustment *= 0.7;
    }
    
    return Math.max(0.01, Math.min(this.MAX_ADJUSTMENT_PERCENT, maxAdjustment));
  }

  /**
   * Улучшенный статистический тест
   */
  private performEnhancedStatisticalTest(
    category: IEnhancedAdvancedCategoryStats,
    adjustedPrice: number
  ): IEnhancedStatisticalTest {
    
    const originalPrice = category.marketPricePerCarat;
    const priceDifference = adjustedPrice - originalPrice;
    
    // Робастная стандартная ошибка
    const robustSE = this.calculateRobustStandardError(category);
    
    // Z-статистика
    const zScore = robustSE > 0 ? priceDifference / robustSE : 0;
    
    // P-значение (двусторонний тест)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));
    
    // Доверительный интервал
    const margin = this.Z_THRESHOLD * robustSE;
    const confidenceInterval: [number, number] = [
      originalPrice - margin,
      originalPrice + margin
    ];
    
    // Размер эффекта
    const effectSize = Math.abs(priceDifference) / category.standardDeviation;
    
    // Оценка надежности теста
    const robustnessScore = this.calculateRobustnessScore(category, zScore);
    
    // Адекватность размера выборки
    const sampleSizeAdequacy = Math.min(1, category.count / this.SMALL_SAMPLE_THRESHOLD);
    
    return {
      isSignificant: pValue < 0.05 && effectSize > 0.2,
      zScore,
      pValue,
      confidenceInterval,
      effectSize,
      robustnessScore,
      sampleSizeAdequacy
    };
  }

  /**
   * Расчет робастной стандартной ошибки
   */
  private calculateRobustStandardError(category: IEnhancedAdvancedCategoryStats): number {
    if (category.count <= 1) return category.standardDeviation;
    
    // Используем MAD-основанную оценку
    const madBasedSE = category.mad * 1.4826 / Math.sqrt(category.count); // 1.4826 для нормального распределения
    const traditionalSE = category.standardDeviation / Math.sqrt(category.count);
    
    // Возвращаем более консервативную оценку
    return Math.max(madBasedSE, traditionalSE);
  }

  /**
   * Оценка надежности статистического теста
   */
  private calculateRobustnessScore(category: IEnhancedAdvancedCategoryStats, zScore: number): number {
    let score = 1.0;
    
    // Штраф за малый размер выборки
    if (category.count < this.SMALL_SAMPLE_THRESHOLD) {
      score *= 0.5;
    }
    
    // Штраф за высокую волатильность
    if (category.volatility > this.VOLATILITY_THRESHOLD) {
      score *= 0.6;
    }
    
    // Штраф за экстремальные Z-значения (могут указывать на проблемы с данными)
    if (Math.abs(zScore) > 5) {
      score *= 0.4;
    }
    
    // Бонус за высокое доверие к данным
    score *= category.confidence;
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Валидация корректировки
   */
  private validateAdjustment(
    category: IEnhancedAdvancedCategoryStats,
    adjustedPrice: number,
    statisticalTest: IEnhancedStatisticalTest
  ): boolean {
    
    // Проверка базовых условий
    if (!isFinite(adjustedPrice) || isNaN(adjustedPrice) || adjustedPrice <= 0) {
      return false;
    }
    
    // Проверка разумности цены
    if (adjustedPrice < this.MIN_PRICE_THRESHOLD || adjustedPrice > this.MAX_PRICE_THRESHOLD) {
      return false;
    }
    
    // Проверка соответствия диапазону категории
    if (adjustedPrice < category.priceRange[0] * 0.5 || adjustedPrice > category.priceRange[1] * 2) {
      return false;
    }
    
    // Для категорий с низким доверием требуем более сильные статистические доказательства
    if (category.confidence < 0.5 && statisticalTest.robustnessScore < 0.6) {
      return false;
    }
    
    return true;
  }

  /**
   * Валидация финальных результатов
   */
  private validateResults(
    adjustments: Map<string, IEnhancedSmoothingResult>,
    metrics: IProcessingMetrics
  ): void {
    
    let invalidAdjustments = 0;
    const keysToRemove: string[] = [];
    
    for (const [key, adjustment] of adjustments) {
      if (!adjustment.validationPassed) {
        keysToRemove.push(key);
        invalidAdjustments++;
      }
    }
    
    // Удаляем недействительные корректировки
    keysToRemove.forEach(key => adjustments.delete(key));
    
    if (invalidAdjustments > 0) {
      this.logger.warn(`Removed ${invalidAdjustments} invalid adjustments during final validation`);
      metrics.invalidCategoriesSkipped += invalidAdjustments;
    }
  }

  /**
   * Расчет метрик качества
   */
  private calculateQualityMetrics(
    stats: IEnhancedAdvancedCategoryStats[],
    adjustments: Map<string, IEnhancedSmoothingResult>
  ): IQualityMetrics {
    
    if (stats.length === 0) {
      return { overallConfidence: 0, dataQualityScore: 0, adjustmentReliability: 0, coverageScore: 0 };
    }
    
    // Общий уровень доверия
    const avgConfidence = stats.reduce((sum, stat) => sum + stat.confidence, 0) / stats.length;
    
    // Оценка качества данных
    const adequateDataCount = stats.filter(stat => !stat.hasInsufficientData).length;
    const dataQualityScore = adequateDataCount / stats.length;
    
    // Надежность корректировок
    const adjustmentValues = Array.from(adjustments.values());
    const reliableAdjustments = adjustmentValues.filter(adj => adj.statisticalTest.robustnessScore > 0.6);
    const adjustmentReliability = adjustmentValues.length > 0 
      ? reliableAdjustments.length / adjustmentValues.length 
      : 1;
    
    // Покрытие данными
    const highConfidenceCount = stats.filter(stat => stat.confidence > 0.7).length;
    const coverageScore = highConfidenceCount / stats.length;
    
    return {
      overallConfidence: avgConfidence,
      dataQualityScore,
      adjustmentReliability,
      coverageScore
    };
  }

  // Утилитарные методы...
  
  private getCategoryKey(stat: IEnhancedAdvancedCategoryStats): string {
    return `${stat.shape}-${stat.weight}-${stat.clarity}-${stat.color}`;
  }

  private groupByColorHierarchy(stats: IEnhancedAdvancedCategoryStats[]): IHierarchyGroup[] {
    // Реализация группировки по цветовой иерархии
    const groups = new Map<string, IEnhancedAdvancedCategoryStats[]>();
    
    for (const stat of stats) {
      const groupKey = `${stat.shape}-${stat.weight}-${stat.clarity}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(stat);
    }
    
    return Array.from(groups.entries()).map(([key, categories]) => ({
      key,
      categories,
      hierarchyType: 'color'
    }));
  }

  private groupByClarityHierarchy(stats: IEnhancedAdvancedCategoryStats[]): IHierarchyGroup[] {
    // Реализация группировки по иерархии чистоты
    const groups = new Map<string, IEnhancedAdvancedCategoryStats[]>();
    
    for (const stat of stats) {
      const groupKey = `${stat.shape}-${stat.weight}-${stat.color}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(stat);
    }
    
    return Array.from(groups.entries()).map(([key, categories]) => ({
      key,
      categories,
      hierarchyType: 'clarity'
    }));
  }

  private sortCategoriesByHierarchy(
    categories: IEnhancedAdvancedCategoryStats[], 
    hierarchyType: 'color' | 'clarity'
  ): IEnhancedAdvancedCategoryStats[] {
    
    if (hierarchyType === 'color') {
      const colorOrder = { 'D': 0, 'E': 1, 'F': 2, 'G': 3, 'H': 4, 'I': 5, 'J': 6, 'K': 7, 'L': 8, 'M': 9 };
      return categories.sort((a, b) => (colorOrder[a.color] || 99) - (colorOrder[b.color] || 99));
    } else {
      // Quality hierarchy (highest first): FL > IF > VVS1 > VVS2 > VS1 > VS2
      const clarityOrder = { 'FL': 0, 'IF': 1, 'VVS1': 2, 'VVS2': 3, 'VS1': 4, 'VS2': 5 };
      return categories.sort((a, b) => (clarityOrder[a.clarity] || 99) - (clarityOrder[b.clarity] || 99));
    }
  }

  private normalCDF(x: number): number {
    // Приближение функции нормального распределения
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  private erf(x: number): number {
    // Приближение функции ошибок
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  private initializeProcessingMetrics(): IProcessingMetrics {
    return {
      adjustedCategories: 0,
      maxAdjustment: 0,
      totalAdjustment: 0,
      statisticalSignificantAdjustments: 0,
      isotonicAdjustments: 0,
      robustAdjustments: 0,
      outliersRemoved: 0,
      statisticalTestsPerformed: 0,
      categoriesWithLowConfidence: 0,
      categoriesWithInsufficientData: 0,
      invalidCategoriesSkipped: 0
    };
  }

  private createEmptyResult(totalInputCategories: number = 0): IEnhancedSmoothingTableResult {
    return {
      totalCategories: totalInputCategories,
      adjustedCategories: 0,
      summary: {
        maxAdjustment: 0,
        avgAdjustment: 0,
        statisticalSignificantAdjustments: 0,
        isotonicAdjustments: 0,
        robustAdjustments: 0
      },
      processingStats: {
        outliersRemoved: 0,
        statisticalTestsPerformed: 0,
        categoriesWithLowConfidence: 0,
        categoriesWithInsufficientData: 0,
        invalidCategoriesSkipped: 0
      },
      monotonicityViolationsBefore: 0,
      monotonicityViolationsAfter: 0,
      monotonicityImprovement: 0,
      adjustments: new Map(),
      qualityMetrics: {
        overallConfidence: 0,
        dataQualityScore: 0,
        adjustmentReliability: 0,
        coverageScore: 0
      }
    };
  }

  private buildFinalResult(
    adjustments: Map<string, IEnhancedSmoothingResult>,
    metrics: IProcessingMetrics,
    qualityMetrics: IQualityMetrics,
    totalInputCategories: number
  ): IEnhancedSmoothingTableResult {
    
    const adjustmentValues = Array.from(adjustments.values());
    const totalAdjustment = adjustmentValues.reduce((sum, adj) => sum + Math.abs(adj.adjustmentPercent), 0);
    const maxAdjustment = adjustmentValues.reduce((max, adj) => Math.max(max, Math.abs(adj.adjustmentPercent)), 0);
    const avgAdjustment = adjustmentValues.length > 0 ? totalAdjustment / adjustmentValues.length : 0;

    return {
      totalCategories: totalInputCategories,
      adjustedCategories: adjustments.size,
      summary: {
        maxAdjustment,
        avgAdjustment,
        statisticalSignificantAdjustments: metrics.statisticalSignificantAdjustments,
        isotonicAdjustments: metrics.isotonicAdjustments,
        robustAdjustments: metrics.robustAdjustments
      },
      processingStats: {
        outliersRemoved: metrics.outliersRemoved,
        statisticalTestsPerformed: metrics.statisticalTestsPerformed,
        categoriesWithLowConfidence: metrics.categoriesWithLowConfidence,
        categoriesWithInsufficientData: metrics.categoriesWithInsufficientData,
        invalidCategoriesSkipped: metrics.invalidCategoriesSkipped
      },
      monotonicityViolationsBefore: 0, // Потребует дополнительной реализации
      monotonicityViolationsAfter: 0,  // Потребует дополнительной реализации
      monotonicityImprovement: 0,      // Потребует дополнительной реализации
      adjustments,
      qualityMetrics
    };
  }
}

// Вспомогательные интерфейсы

interface IProcessingMetrics {
  adjustedCategories: number;
  maxAdjustment: number;
  totalAdjustment: number;
  statisticalSignificantAdjustments: number;
  isotonicAdjustments: number;
  robustAdjustments: number;
  outliersRemoved: number;
  statisticalTestsPerformed: number;
  categoriesWithLowConfidence: number;
  categoriesWithInsufficientData: number;
  invalidCategoriesSkipped: number;
}

interface IHierarchyGroup {
  key: string;
  categories: IEnhancedAdvancedCategoryStats[];
  hierarchyType: 'color' | 'clarity';
}

interface IHierarchyGroups {
  colorGroups: IHierarchyGroup[];
  clarityGroups: IHierarchyGroup[];
}
