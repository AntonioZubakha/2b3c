import { ICategoryStats } from './types';
import { IEnhancedAdvancedCategoryStats } from './advancedPriceSmoother.enhanced';

import { ShapeCategory, WeightCategory, ClarityCategory, ColorCategoryEnum } from './types';

// Simplified interface for price smoothing
interface ISimpleCategoryStats {
  shape: ShapeCategory;
  weight: WeightCategory;
  clarity: ClarityCategory;
  color: ColorCategoryEnum;
  count: number;
  marketPricePerCarat: number;
  avgPricePerCarat: number;
  medianPricePerCarat: number;
}

/**
 * Утилиты для преобразования данных между старым и новым форматом сглаживателя
 */
export class PriceSmootherUtils {
  
  /**
   * Преобразование базовой статистики в расширенную с расчетом дополнительных метрик
   */
  public static convertToAdvancedStats(
    basicStats: ISimpleCategoryStats[], 
    individualPrices?: number[][]
  ): IEnhancedAdvancedCategoryStats[] {
    return basicStats.map(stat => {
      // Если есть индивидуальные цены, рассчитываем точную статистику
      if (individualPrices && individualPrices.length > 0) {
        const prices = individualPrices[basicStats.indexOf(stat)] || [];
        return this.calculateAdvancedStatsFromPrices(stat, prices);
      }
      
      // Иначе используем приближенные расчеты на основе имеющихся данных
      return this.estimateAdvancedStats(stat);
    });
  }

  /**
   * Расчет расширенной статистики на основе индивидуальных цен
   */
  private static calculateAdvancedStatsFromPrices(
    stat: ISimpleCategoryStats, 
    prices: number[]
  ): IEnhancedAdvancedCategoryStats {
    if (prices.length === 0) {
      return this.estimateAdvancedStats(stat);
    }

    // Сортируем цены для расчета медианы и MAD
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const n = prices.length;
    
    // Среднее и стандартное отклонение
    const mean = prices.reduce((sum, price) => sum + price, 0) / n;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / (n - 1);
    const standardDeviation = Math.sqrt(variance);
    const standardError = standardDeviation / Math.sqrt(n);
    
    // Медиана
    const median = n % 2 === 0 
      ? ((sortedPrices[n / 2 - 1] || 0) + (sortedPrices[n / 2] || 0)) / 2
      : (sortedPrices[Math.floor(n / 2)] || 0);
    
    // Median Absolute Deviation (MAD)
    const deviations = prices.map(price => Math.abs(price - median));
    const sortedDeviations = deviations.sort((a, b) => a - b);
    const mad = n % 2 === 0 
      ? ((sortedDeviations[n / 2 - 1] || 0) + (sortedDeviations[n / 2] || 0)) / 2
      : (sortedDeviations[Math.floor(n / 2)] || 0);
    
    // Winsorizing: заменяем экстремальные значения
    const winsorizedPrice = this.winsorizeValue(stat.marketPricePerCarat, mean, standardDeviation);
    
    return {
      ...stat,
      standardDeviation,
      standardError,
      mad,
      logPrice: Math.log(winsorizedPrice),
      winsorizedPrice,
      confidence: 0.8, // Default confidence
      volatility: standardDeviation / mean, // Coefficient of variation
      isOutlier: false, // Default not outlier
      hasInsufficientData: false, // Default sufficient data
      originalPrice: stat.marketPricePerCarat, // Save original price
      priceRange: [stat.marketPricePerCarat * 0.8, stat.marketPricePerCarat * 1.2] as [number, number] // Default range
    };
  }

  /**
   * Оценка расширенной статистики на основе имеющихся данных
   */
  private static estimateAdvancedStats(stat: ISimpleCategoryStats): IEnhancedAdvancedCategoryStats {
    // Используем эвристики для оценки стандартного отклонения
    // Предполагаем, что стандартное отклонение составляет 10-20% от средней цены
    const estimatedStdDev = stat.marketPricePerCarat * 0.15;
    const standardError = estimatedStdDev / Math.sqrt(stat.count);
    
    // MAD обычно составляет 0.67 от стандартного отклонения для нормального распределения
    const mad = estimatedStdDev * 0.67;
    
    // Winsorizing
    const winsorizedPrice = this.winsorizeValue(stat.marketPricePerCarat, stat.avgPricePerCarat, estimatedStdDev);
    
    return {
      ...stat,
      standardDeviation: estimatedStdDev,
      standardError,
      mad,
      logPrice: Math.log(winsorizedPrice),
      winsorizedPrice,
      confidence: 0.6, // Lower confidence for estimated stats
      volatility: estimatedStdDev / stat.avgPricePerCarat, // Coefficient of variation
      isOutlier: false, // Default not outlier
      hasInsufficientData: stat.count < 5, // Mark as insufficient if less than 5 items
      originalPrice: stat.marketPricePerCarat, // Save original price
      priceRange: [stat.marketPricePerCarat * 0.8, stat.marketPricePerCarat * 1.2] as [number, number] // Default range
    };
  }

  /**
   * Winsorizing: ограничение экстремальных значений
   */
  private static winsorizeValue(value: number, mean: number, stdDev: number): number {
    const lowerBound = mean - 2 * stdDev;
    const upperBound = mean + 2 * stdDev;
    return Math.max(lowerBound, Math.min(upperBound, value));
  }

  /**
   * Преобразование расширенной статистики обратно в базовую
   */
  public static convertFromAdvancedStats(advancedStats: IEnhancedAdvancedCategoryStats[]): ICategoryStats[] {
    return advancedStats.map(stat => ({
      date: new Date(),
      shape: stat.shape,
      weight: stat.weight,
      clarity: stat.clarity,
      color: stat.color,
      count: stat.count,
      marketPricePerCarat: stat.marketPricePerCarat,
      avgPricePerCarat: stat.avgPricePerCarat,
      medianPricePerCarat: stat.medianPricePerCarat,
      productDetails: [],
      newProductsToday: 0,
      disappearedProductsSinceYesterday: 0,
      priceIncreasedCount: 0,
      priceDecreasedCount: 0,
      priceUnchangedCount: 0,
      avgPricePerCarat_newProducts: 0,
      avgPricePerCarat_disappearedProducts: 0,
      avgPricePerCarat_priceIncreased: 0,
      avgPricePerCarat_priceDecreased: 0,
      avgPricePerCarat_priceUnchanged: 0,
      medianPricePerCarat_newProducts: 0,
      medianPricePerCarat_disappearedProducts: 0,
      medianPricePerCarat_priceIncreased: 0,
      medianPricePerCarat_priceDecreased: 0,
      medianPricePerCarat_priceUnchanged: 0
    }));
  }

  /**
   * Создание тестовых данных для расширенной статистики
   */
  public static createTestAdvancedStats(overrides: Partial<IEnhancedAdvancedCategoryStats> = {}): IEnhancedAdvancedCategoryStats {
    const baseStat = {
      shape: 'ROUND' as any,
      weight: 'W_1_00_1_39' as any,
      clarity: 'VVS1' as any,
      color: 'D' as any,
      count: 10,
      marketPricePerCarat: 1000,
      avgPricePerCarat: 1000,
      medianPricePerCarat: 1000,
      standardDeviation: 100,
      standardError: 31.62,
      mad: 67,
      logPrice: Math.log(1000),
      winsorizedPrice: 1000,
      confidence: 0.8,
      volatility: 0.1,
      isOutlier: false,
      hasInsufficientData: false,
      originalPrice: 1000,
      priceRange: [800, 1200] as [number, number]
    };

    return { ...baseStat, ...overrides };
  }

  /**
   * Генерация случайных цен для тестирования
   */
  public static generateRandomPrices(
    mean: number, 
    stdDev: number, 
    count: number
  ): number[] {
    const prices: number[] = [];
    
    for (let i = 0; i < count; i++) {
      // Генерация нормально распределенных случайных чисел (Box-Muller)
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      
      const price = mean + stdDev * z0;
      prices.push(Math.max(0, price)); // Убеждаемся, что цена не отрицательная
    }
    
    return prices;
  }

  /**
   * Создание аномальных данных для тестирования
   */
  public static createAnomalousData(
    basePrice: number, 
    anomalyPercent: number, 
    count: number
  ): { prices: number[]; expectedAnomaly: boolean } {
    const prices = this.generateRandomPrices(basePrice, basePrice * 0.1, count);
    
    // Создаем аномалию, увеличивая последние 20% цен
    const anomalyCount = Math.floor(count * 0.2);
    const anomalyMultiplier = 1 + anomalyPercent / 100;
    
    for (let i = count - anomalyCount; i < count; i++) {
      const price = prices[i];
      if (price !== undefined) {
        prices[i] = price * anomalyMultiplier;
      }
    }
    
    return {
      prices,
      expectedAnomaly: anomalyPercent > 20 // Ожидаем аномалию если отклонение > 20%
    };
  }
}
