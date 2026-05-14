import { IProduct, IUsaLocationCoefficientCalculation } from './types';
import winston from 'winston';
import { config } from './config';

/** Normalized location values that count as USA (matches server productUtils parseLocationString) */
const USA_LOCATION_VARIANTS = new Set(['USA', 'US', 'UNITED STATES', 'AMERICA']);

/**
 * Калькулятор коэффициента для камней с Location = USA.
 * Камни в USA дороже, чем в Индии/других локациях — маркетпрайс для USA слегка повышается
 * по аналогии с GIA-коэффициентом.
 */
export class UsaLocationCoefficientCalculator {
  private readonly MIN_COEFFICIENT = 1.0;
  private readonly MAX_COEFFICIENT = 1.5;   // "Слегка" дороже
  private readonly MIN_SAMPLES = 2;
  private readonly FALLBACK_COEFF = 1.05;
  private readonly USA_ONLY_COEFF = 1.1;      // Только USA в категории — умеренная наценка
  private readonly MIN_PRICE_THRESHOLD = 10;
  private readonly MAX_PRICE_THRESHOLD = 100000;

  private historicalCoefficients = new Map<string, { coefficient: number; calculatedAt: Date }>();
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
    } catch {
      this.logger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {}
      } as any;
    }
  }

  /** Проверка, считается ли локация USA (case-insensitive) */
  static isUsaLocation(location?: string | null): boolean {
    if (!location || typeof location !== 'string') return false;
    const normalized = location.toUpperCase().trim();
    return USA_LOCATION_VARIANTS.has(normalized);
  }

  calculateUsaCoefficient(
    productsInCategory: IProduct[],
    categoryKey: string
  ): IUsaLocationCoefficientCalculation {
    if (!productsInCategory?.length || !categoryKey) {
      return this.createResult(categoryKey, [], [], this.FALLBACK_COEFF, false, 'Invalid input');
    }

    const { usaProducts, nonUsaProducts } = this.categorizeByLocation(productsInCategory);

    this.logger.debug(`[USA] Category ${categoryKey}: usaCount=${usaProducts.length}, nonUsaCount=${nonUsaProducts.length}`);

    const cleanUsa = this.removeOutliers(usaProducts);
    const cleanNonUsa = this.removeOutliers(nonUsaProducts);

    if (cleanUsa.length >= this.MIN_SAMPLES && cleanNonUsa.length >= this.MIN_SAMPLES) {
      return this.calculateActualCoefficient(categoryKey, cleanUsa, cleanNonUsa);
    }
    if (cleanUsa.length >= this.MIN_SAMPLES && cleanNonUsa.length === 0) {
      const historical = this.historicalCoefficients.get(categoryKey);
      const coeff = historical?.coefficient ?? this.USA_ONLY_COEFF;
      this.logger.info(`[USA] Category ${categoryKey}: Only USA products (${cleanUsa.length}), using coefficient ${coeff.toFixed(3)}`);
      return this.createResult(categoryKey, cleanUsa, [], coeff, true, 'Only USA products');
    }
    if (cleanNonUsa.length >= this.MIN_SAMPLES && cleanUsa.length === 0) {
      return this.createResult(categoryKey, [], cleanNonUsa, 1.0, true, 'Only non-USA products');
    }

    const historical = this.historicalCoefficients.get(categoryKey);
    const coeff = historical?.coefficient ?? this.FALLBACK_COEFF;
    this.logger.warn(`[USA] Category ${categoryKey}: Insufficient data (USA=${cleanUsa.length}, nonUSA=${cleanNonUsa.length}), using ${coeff.toFixed(3)}`);
    return this.createResult(categoryKey, cleanUsa, cleanNonUsa, coeff, false, `Insufficient data: USA=${cleanUsa.length}, nonUSA=${cleanNonUsa.length}`);
  }

  private categorizeByLocation(products: IProduct[]): { usaProducts: IProduct[]; nonUsaProducts: IProduct[] } {
    const usaProducts: IProduct[] = [];
    const nonUsaProducts: IProduct[] = [];
    for (const p of products) {
      if (!this.isValidProduct(p)) continue;
      if (UsaLocationCoefficientCalculator.isUsaLocation(p.location)) {
        usaProducts.push(p);
      } else {
        nonUsaProducts.push(p);
      }
    }
    return { usaProducts, nonUsaProducts };
  }

  private isValidProduct(p: IProduct): boolean {
    return !!(
      p &&
      typeof p.pricePerCarat === 'number' &&
      p.pricePerCarat > this.MIN_PRICE_THRESHOLD &&   // strict > to match GIA calculator
      p.pricePerCarat <= this.MAX_PRICE_THRESHOLD &&
      !isNaN(p.pricePerCarat) &&
      isFinite(p.pricePerCarat)
    );
  }

  private removeOutliers(products: IProduct[]): IProduct[] {
    if (products.length < 4) return products;
    const prices = products.map(p => p.pricePerCarat).sort((a, b) => a - b);
    const q1 = prices[Math.floor(prices.length * 0.25)]!;
    const q3 = prices[Math.floor(prices.length * 0.75)]!;
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    return products.filter(p => p.pricePerCarat >= lower && p.pricePerCarat <= upper);
  }

  private calculateRobustAverage(products: IProduct[]): number {
    if (products.length === 0) return 0;
    if (products.length === 1) return products[0]?.pricePerCarat ?? 0;
    const prices = products.map(p => p.pricePerCarat).sort((a, b) => a - b);
    const trimCount = Math.floor(prices.length * 0.1);
    const trimmed = prices.slice(trimCount, prices.length - trimCount);
    if (trimmed.length === 0) return prices.reduce((s, x) => s + x, 0) / prices.length;
    return trimmed.reduce((s, x) => s + x, 0) / trimmed.length;
  }

  private calculateActualCoefficient(
    categoryKey: string,
    usaProducts: IProduct[],
    nonUsaProducts: IProduct[]
  ): IUsaLocationCoefficientCalculation {
    const avgUsa = this.calculateRobustAverage(usaProducts);
    const avgNonUsa = this.calculateRobustAverage(nonUsaProducts);

    if (avgNonUsa <= 0) {
      this.logger.warn(`[USA] Category ${categoryKey}: Invalid non-USA average price`);
      return this.createResult(categoryKey, usaProducts, nonUsaProducts, this.FALLBACK_COEFF, false, 'Invalid non-USA average');
    }

    const rawCoefficient = avgUsa / avgNonUsa;
    const finalCoefficient = Math.max(
      this.MIN_COEFFICIENT,
      Math.min(this.MAX_COEFFICIENT, rawCoefficient)
    );

    this.historicalCoefficients.set(categoryKey, { coefficient: finalCoefficient, calculatedAt: new Date() });

    this.logger.info(`[USA] Category ${categoryKey}: coefficient=${finalCoefficient.toFixed(3)} (raw=${rawCoefficient.toFixed(3)}), USA=${usaProducts.length}, nonUSA=${nonUsaProducts.length}`);

    return this.createResult(categoryKey, usaProducts, nonUsaProducts, finalCoefficient, true, '');
  }

  private createResult(
    categoryKey: string,
    usaProducts: IProduct[],
    nonUsaProducts: IProduct[],
    calculatedCoefficient: number,
    isValid: boolean,
    reason: string
  ): IUsaLocationCoefficientCalculation {
    return {
      categoryKey,
      usaProducts,
      nonUsaProducts,
      calculatedCoefficient,
      isValid,
      ...(reason ? { reason } : {})
    };
  }

  /**
   * Применение USA-коэффициента к цене: для USA — умножить на коэффициент, для остальных — без изменений.
   * Вызывается после applyGiaCoefficient (итоговая цена = GIA-скорректированная × location multiplier).
   */
  applyLocationCoefficient(pricePerCarat: number, coefficient: number, location?: string | null): number {
    if (!pricePerCarat || pricePerCarat <= 0 || !isFinite(pricePerCarat)) return 0;
    if (!coefficient || coefficient <= 0 || !isFinite(coefficient)) coefficient = 1.0;

    if (UsaLocationCoefficientCalculator.isUsaLocation(location)) {
      return parseFloat((pricePerCarat * coefficient).toFixed(2));
    }
    return parseFloat(pricePerCarat.toFixed(2));
  }
}
