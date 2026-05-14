import { IProduct, IGiaCoefficient, IGiaCoefficientCalculation } from './types';
import winston from 'winston';
import { config } from './config';

/**
 * Расширенный калькулятор GIA-коэффициента с улучшенной обработкой граничных случаев
 * 
 * Основные улучшения:
 * - Правильное логирование через winston
 * - Валидация входных данных
 * - Оптимизированная фильтрация продуктов
 * - Статистическая валидация результатов
 * - Адаптивные пороги для разных размеров выборок
 * - Защита от аномальных значений
 */
export class EnhancedGiaCoefficientCalculator {
  // Keep original levels so market price stays above supplier price in catalog. Lower values
  // (e.g. MIN 1.15, FALLBACK 1.8) caused market price to sit below supplier too often.
  private readonly MIN_COEFFICIENT = 1.5;  
  private readonly MAX_COEFFICIENT = 3.5;  
  private readonly MIN_SAMPLES = 2;        
  private readonly FALLBACK_COEFF = 2.0;   
  private readonly GIA_ONLY_COEFF = 2.5;   
  private readonly IGI_ONLY_COEFF = 1.0;   
  
  // Новые параметры для улучшенной обработки
  // private readonly OUTLIER_THRESHOLD = 3.0;  // Порог для выбросов (3 сигмы) - unused
  private readonly MIN_PRICE_THRESHOLD = 10; // Минимальная разумная цена за карат
  private readonly MAX_PRICE_THRESHOLD = 100000; // Максимальная разумная цена за карат
  private readonly COEFFICIENT_VARIANCE_THRESHOLD = 0.5; // Порог вариации коэффициента
  
  // Кэш для хранения исторических коэффициентов с метаданными
  private historicalCoefficients = new Map<string, IHistoricalCoefficient>();
  
  private readonly logger: winston.Logger;

  constructor() {
    try {
      this.logger = winston.createLogger({
        level: config.logLevel,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        defaultMeta: { service: 'market-price-calculator' },
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
   * Оптимизированный расчет GIA-коэффициента с улучшенной обработкой граничных случаев
   */
  calculateGiaCoefficient(
    productsInCategory: IProduct[], 
    categoryKey: string
  ): IGiaCoefficientCalculation {
    
    // Валидация входных данных
    if (!this.validateInput(productsInCategory, categoryKey)) {
      return this.createInvalidResult(categoryKey, [], [], this.FALLBACK_COEFF, 'Invalid input data');
    }

    // Оптимизированная фильтрация за один проход
    const categorizedProducts = this.categorizeProductsByCertificate(productsInCategory);
    const { giaProducts, igiProducts, otherProducts } = categorizedProducts;

    this.logger.debug(`[GIA] Category ${categoryKey}:`, {
      totalProducts: productsInCategory.length,
      giaCount: giaProducts.length,
      igiCount: igiProducts.length,
      otherCount: otherProducts.length
    });

    // Очистка данных от аномальных значений
    const cleanGiaProducts = this.removeOutliers(giaProducts);
    const cleanIgiProducts = this.removeOutliers(igiProducts);

    if (cleanGiaProducts.length !== giaProducts.length || cleanIgiProducts.length !== igiProducts.length) {
      this.logger.warn(`[GIA] Category ${categoryKey}: Removed outliers - GIA: ${giaProducts.length - cleanGiaProducts.length}, IGI: ${igiProducts.length - cleanIgiProducts.length}`);
    }

    // Случай 1: Есть и GIA, и IGI - рассчитываем коэффициент
    if (cleanGiaProducts.length >= this.MIN_SAMPLES && cleanIgiProducts.length >= this.MIN_SAMPLES) {
      return this.calculateActualCoefficient(categoryKey, cleanGiaProducts, cleanIgiProducts);
    }

    // Случай 2: Только GIA продукты
    if (cleanGiaProducts.length >= this.MIN_SAMPLES && cleanIgiProducts.length === 0) {
      return this.handleGiaOnlyCase(categoryKey, cleanGiaProducts, cleanIgiProducts);
    }

    // Случай 3: Только IGI продукты
    if (cleanIgiProducts.length >= this.MIN_SAMPLES && cleanGiaProducts.length === 0) {
      return this.handleIgiOnlyCase(categoryKey, cleanGiaProducts, cleanIgiProducts);
    }

    // Случай 4: Недостаточно данных
    return this.handleInsufficientDataCase(categoryKey, cleanGiaProducts, cleanIgiProducts);
  }

  /**
   * Валидация входных данных
   */
  private validateInput(products: IProduct[], categoryKey: string): boolean {
    if (!products || !Array.isArray(products)) {
      this.logger.error(`[GIA] Invalid products array for category ${categoryKey}`);
      return false;
    }

    if (!categoryKey || typeof categoryKey !== 'string') {
      this.logger.error(`[GIA] Invalid category key: ${categoryKey}`);
      return false;
    }

    if (products.length === 0) {
      this.logger.debug(`[GIA] Empty products array for category ${categoryKey}`);
      return false;
    }

    return true;
  }

  /**
   * Оптимизированная категоризация продуктов за один проход
   */
  private categorizeProductsByCertificate(products: IProduct[]): ICategorizedProducts {
    const result: ICategorizedProducts = {
      giaProducts: [],
      igiProducts: [],
      otherProducts: []
    };

    for (const product of products) {
      // Валидация продукта
      if (!this.isValidProduct(product)) {
        continue;
      }

      const institute = product.certificateInstitute?.toUpperCase().trim();
      
      switch (institute) {
        case 'GIA':
          result.giaProducts.push(product);
          break;
        case 'IGI':
          result.igiProducts.push(product);
          break;
        default:
          if (institute) {
            result.otherProducts.push(product);
          }
          break;
      }
    }

    return result;
  }

  /**
   * Проверка валидности продукта
   */
  private isValidProduct(product: IProduct): boolean {
    return !!(
      product &&
      typeof product.pricePerCarat === 'number' &&
      product.pricePerCarat > this.MIN_PRICE_THRESHOLD &&
      product.pricePerCarat < this.MAX_PRICE_THRESHOLD &&
      !isNaN(product.pricePerCarat) &&
      isFinite(product.pricePerCarat)
    );
  }

  /**
   * Удаление выбросов на основе межквартильного размаха (IQR)
   */
  private removeOutliers(products: IProduct[]): IProduct[] {
    if (products.length < 4) {
      return products; // Недостаточно данных для определения выбросов
    }

    const prices = products.map(p => p.pricePerCarat).sort((a, b) => a - b);
    const q1Index = Math.floor(prices.length * 0.25);
    const q3Index = Math.floor(prices.length * 0.75);
    
    const q1 = prices[q1Index];
    const q3 = prices[q3Index];
    
    if (q1 === undefined || q3 === undefined) {
      return products; // Возвращаем исходные продукты, если не можем вычислить квартили
    }
    
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return products.filter(product => 
      product.pricePerCarat >= lowerBound && 
      product.pricePerCarat <= upperBound
    );
  }

  /**
   * Расчет фактического коэффициента для случая с GIA и IGI продуктами
   */
  private calculateActualCoefficient(
    categoryKey: string, 
    giaProducts: IProduct[], 
    igiProducts: IProduct[]
  ): IGiaCoefficientCalculation {
    
    const avgGiaPrice = this.calculateRobustAverage(giaProducts);
    const avgIgiPrice = this.calculateRobustAverage(igiProducts);

    if (avgIgiPrice <= 0) {
      this.logger.warn(`[GIA] Category ${categoryKey}: Invalid IGI average price: ${avgIgiPrice}`);
      return this.createInvalidResult(categoryKey, giaProducts, igiProducts, this.MIN_COEFFICIENT, 'Invalid IGI average price');
    }

    const rawCoefficient = avgGiaPrice / avgIgiPrice;
    
    // Проверка на аномальный коэффициент
    if (rawCoefficient < this.MIN_COEFFICIENT * 0.5 || rawCoefficient > this.MAX_COEFFICIENT * 2) {
      this.logger.warn(`[GIA] Category ${categoryKey}: Anomalous coefficient detected: ${rawCoefficient.toFixed(3)}`);
    }
    
    const finalCoefficient = Math.max(
      this.MIN_COEFFICIENT,
      Math.min(this.MAX_COEFFICIENT, rawCoefficient)
    );

    // Статистическая валидация
    const statisticalValidation = this.validateCoefficientStatistically(giaProducts, igiProducts, finalCoefficient);
    
    // Сохранение исторических данных
    this.saveHistoricalCoefficient(categoryKey, finalCoefficient, {
      giaCount: giaProducts.length,
      igiCount: igiProducts.length,
      avgGiaPrice,
      avgIgiPrice,
      rawCoefficient,
      statisticalValidation
    });

    this.logger.info(`[GIA] Category ${categoryKey}: Calculated coefficient=${finalCoefficient.toFixed(3)} (raw=${rawCoefficient.toFixed(3)})`, {
      giaCount: giaProducts.length,
      igiCount: igiProducts.length,
      avgGiaPrice: avgGiaPrice.toFixed(2),
      avgIgiPrice: avgIgiPrice.toFixed(2),
      isStatisticallyValid: statisticalValidation.isValid
    });

    return {
      categoryKey,
      giaProducts,
      igiProducts,
      calculatedCoefficient: finalCoefficient,
      isValid: statisticalValidation.isValid,
      reason: statisticalValidation.isValid ? '' : statisticalValidation.reason
    };
  }

  /**
   * Расчет робастного среднего (усеченное среднее)
   */
  private calculateRobustAverage(products: IProduct[]): number {
    if (products.length === 0) return 0;
    if (products.length === 1) return products[0]?.pricePerCarat || 0;

    const prices = products.map(p => p.pricePerCarat).sort((a, b) => a - b);
    
    // Усеченное среднее (убираем крайние 10% с каждой стороны)
    const trimPercent = 0.1;
    const trimCount = Math.floor(prices.length * trimPercent);
    const trimmedPrices = prices.slice(trimCount, prices.length - trimCount);
    
    if (trimmedPrices.length === 0) {
      // Если после обрезки ничего не осталось, используем обычное среднее
      return prices.reduce((sum, price) => sum + price, 0) / prices.length;
    }
    
    return trimmedPrices.reduce((sum, price) => sum + price, 0) / trimmedPrices.length;
  }

  /**
   * Статистическая валидация коэффициента
   */
  private validateCoefficientStatistically(
    giaProducts: IProduct[], 
    igiProducts: IProduct[], 
    _coefficient: number
  ): IStatisticalValidation {
    
    const giaPrices = giaProducts.map(p => p.pricePerCarat);
    const igiPrices = igiProducts.map(p => p.pricePerCarat);
    
    // Проверка дисперсии
    const giaVariance = this.calculateVariance(giaPrices);
    const igiVariance = this.calculateVariance(igiPrices);
    const giaCV = Math.sqrt(giaVariance) / this.calculateMean(giaPrices);
    const igiCV = Math.sqrt(igiVariance) / this.calculateMean(igiPrices);
    
    // Если коэффициент вариации слишком высокий, результат может быть ненадежным
    if (giaCV > this.COEFFICIENT_VARIANCE_THRESHOLD || igiCV > this.COEFFICIENT_VARIANCE_THRESHOLD) {
      return {
        isValid: false,
        reason: `High variance detected (GIA CV: ${giaCV.toFixed(3)}, IGI CV: ${igiCV.toFixed(3)})`,
        confidenceLevel: 0.3
      };
    }

    // Проверка размера выборки для статистической значимости
    const minSampleForReliability = 5;
    if (giaProducts.length < minSampleForReliability || igiProducts.length < minSampleForReliability) {
      return {
        isValid: true, // Valid but with low confidence
        reason: 'Small sample size',
        confidenceLevel: 0.6
      };
    }

    return {
      isValid: true,
      confidenceLevel: 0.9
    };
  }

  private calculateMean(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = this.calculateMean(values);
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
  }

  /**
   * Обработка случая только GIA продуктов
   */
  private handleGiaOnlyCase(
    categoryKey: string, 
    giaProducts: IProduct[], 
    igiProducts: IProduct[]
  ): IGiaCoefficientCalculation {
    const historicalCoeff = this.getHistoricalCoefficient(categoryKey);
    const coefficient = historicalCoeff?.coefficient || this.GIA_ONLY_COEFF;
    
    this.logger.info(`[GIA] Category ${categoryKey}: Only GIA products (${giaProducts.length}), using coefficient ${coefficient.toFixed(3)}`, {
      source: historicalCoeff ? 'historical' : 'default'
    });
    
    return {
      categoryKey,
      giaProducts,
      igiProducts,
      calculatedCoefficient: coefficient,
      isValid: true,
      reason: `Only GIA products, using ${historicalCoeff ? 'historical' : 'default'} coefficient`
    };
  }

  /**
   * Обработка случая только IGI продуктов
   */
  private handleIgiOnlyCase(
    categoryKey: string, 
    giaProducts: IProduct[], 
    igiProducts: IProduct[]
  ): IGiaCoefficientCalculation {
    this.logger.info(`[GIA] Category ${categoryKey}: Only IGI products (${igiProducts.length}), using coefficient ${this.IGI_ONLY_COEFF}`);
    
    return {
      categoryKey,
      giaProducts,
      igiProducts,
      calculatedCoefficient: this.IGI_ONLY_COEFF,
      isValid: true,
      reason: 'Only IGI products, using minimum coefficient'
    };
  }

  /**
   * Обработка случая недостаточных данных
   */
  private handleInsufficientDataCase(
    categoryKey: string, 
    giaProducts: IProduct[], 
    igiProducts: IProduct[]
  ): IGiaCoefficientCalculation {
    const historicalCoeff = this.getHistoricalCoefficient(categoryKey);
    const coefficient = historicalCoeff?.coefficient || this.FALLBACK_COEFF;
    
    this.logger.warn(`[GIA] Category ${categoryKey}: Insufficient data (GIA=${giaProducts.length}, IGI=${igiProducts.length}), using coefficient ${coefficient.toFixed(3)}`, {
      source: historicalCoeff ? 'historical' : 'fallback',
      minRequired: this.MIN_SAMPLES
    });
    
    return {
      categoryKey,
      giaProducts,
      igiProducts,
      calculatedCoefficient: coefficient,
      isValid: false,
      reason: `Insufficient data: GIA=${giaProducts.length}, IGI=${igiProducts.length} (minimum ${this.MIN_SAMPLES}), using ${historicalCoeff ? 'historical' : 'fallback'} coefficient`
    };
  }

  /**
   * Создание результата с ошибкой
   */
  private createInvalidResult(
    categoryKey: string,
    giaProducts: IProduct[],
    igiProducts: IProduct[],
    coefficient: number,
    reason: string
  ): IGiaCoefficientCalculation {
    return {
      categoryKey,
      giaProducts,
      igiProducts,
      calculatedCoefficient: coefficient,
      isValid: false,
      reason
    };
  }

  /**
   * Сохранение исторического коэффициента с метаданными
   */
  private saveHistoricalCoefficient(
    categoryKey: string, 
    coefficient: number, 
    metadata: Partial<IHistoricalCoefficientMetadata>
  ): void {
    this.historicalCoefficients.set(categoryKey, {
      coefficient,
      calculatedAt: new Date(),
      usageCount: 1,
      metadata: {
        giaCount: metadata.giaCount || 0,
        igiCount: metadata.igiCount || 0,
        avgGiaPrice: metadata.avgGiaPrice || 0,
        avgIgiPrice: metadata.avgIgiPrice || 0,
        rawCoefficient: metadata.rawCoefficient || coefficient,
        statisticalValidation: metadata.statisticalValidation || { isValid: false, confidenceLevel: 0 }
      }
    });
  }

  /**
   * Получение исторического коэффициента
   */
  private getHistoricalCoefficient(categoryKey: string): IHistoricalCoefficient | null {
    const historical = this.historicalCoefficients.get(categoryKey);
    if (historical) {
      // Увеличиваем счетчик использования
      historical.usageCount++;
    }
    return historical || null;
  }

  /**
   * Применение GIA-коэффициента к цене с дополнительной валидацией
   */
  applyGiaCoefficient(
    basePrice: number, 
    coefficient: number, 
    certificateInstitute?: string
  ): number {
    // Валидация входных данных
    if (!basePrice || basePrice <= 0 || !isFinite(basePrice)) {
      this.logger.warn(`[GIA] Invalid base price: ${basePrice}`);
      return 0;
    }

    if (!coefficient || coefficient <= 0 || !isFinite(coefficient)) {
      this.logger.warn(`[GIA] Invalid coefficient: ${coefficient}, using 1.0`);
      coefficient = 1.0;
    }

    if (!certificateInstitute) {
      // Для неизвестных сертификатов используем среднее значение
      return parseFloat((basePrice * ((coefficient + 1) / 2)).toFixed(2));
    }

    const institute = certificateInstitute.toUpperCase().trim();
    
    switch (institute) {
      case 'GIA':
        return parseFloat((basePrice * coefficient).toFixed(2));
      case 'IGI':
        return parseFloat(basePrice.toFixed(2)); // Без изменений для IGI
      default:
        // Для других сертификатов используем среднее значение
        return parseFloat((basePrice * ((coefficient + 1) / 2)).toFixed(2));
    }
  }

  /**
   * Создание объекта GIA-коэффициента для сохранения
   */
  createGiaCoefficient(calculation: IGiaCoefficientCalculation): IGiaCoefficient {
    const avgGiaPrice = calculation.giaProducts.length > 0 
      ? this.calculateRobustAverage(calculation.giaProducts) 
      : 0;
    const avgIgiPrice = calculation.igiProducts.length > 0 
      ? this.calculateRobustAverage(calculation.igiProducts) 
      : 0;

    return {
      categoryKey: calculation.categoryKey,
      giaCoefficient: calculation.calculatedCoefficient,
      avgGiaPrice,
      avgIgiPrice,
      giaCount: calculation.giaProducts.length,
      igiCount: calculation.igiProducts.length,
      calculatedAt: new Date()
    };
  }

  /**
   * Проверка необходимости пересчета коэффициента
   */
  shouldRecalculateCoefficient(
    coefficient: IGiaCoefficient, 
    maxAgeHours: number = 24
  ): boolean {
    const now = new Date();
    const ageHours = (now.getTime() - coefficient.calculatedAt.getTime()) / (1000 * 60 * 60);
    return ageHours > maxAgeHours;
  }

  /**
   * Получение статистики по коэффициентам с дополнительными метриками
   */
  getCoefficientStats(): IEnhancedCoefficientStats {
    const coefficients = Array.from(this.historicalCoefficients.values());
    
    if (coefficients.length === 0) {
      return { 
        total: 0, 
        average: 0, 
        min: 0, 
        max: 0,
        standardDeviation: 0,
        reliableCoefficients: 0,
        totalUsage: 0
      };
    }
    
    const values = coefficients.map(c => c.coefficient);
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);
    
    const reliableCoefficients = coefficients.filter(c => 
      c.metadata.statisticalValidation?.isValid && 
      (c.metadata.statisticalValidation.confidenceLevel || 0) > 0.7
    ).length;
    
    const totalUsage = coefficients.reduce((sum, c) => sum + c.usageCount, 0);
    
    return {
      total: coefficients.length,
      average,
      min: Math.min(...values),
      max: Math.max(...values),
      standardDeviation,
      reliableCoefficients,
      totalUsage
    };
  }
}

// Дополнительные интерфейсы для расширенной функциональности

interface ICategorizedProducts {
  giaProducts: IProduct[];
  igiProducts: IProduct[];
  otherProducts: IProduct[];
}

interface IStatisticalValidation {
  isValid: boolean;
  reason?: string;
  confidenceLevel: number;
}

interface IHistoricalCoefficientMetadata {
  giaCount: number;
  igiCount: number;
  avgGiaPrice: number;
  avgIgiPrice: number;
  rawCoefficient: number;
  statisticalValidation: IStatisticalValidation;
}

interface IHistoricalCoefficient {
  coefficient: number;
  calculatedAt: Date;
  usageCount: number;
  metadata: IHistoricalCoefficientMetadata;
}

interface IEnhancedCoefficientStats {
  total: number;
  average: number;
  min: number;
  max: number;
  standardDeviation: number;
  reliableCoefficients: number;
  totalUsage: number;
}
