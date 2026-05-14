import { EnhancedGiaCoefficientCalculator } from '../giaCoefficientCalculator.enhanced';
import { EnhancedAdvancedPriceSmoother } from '../advancedPriceSmoother.enhanced';
import { IProduct } from '../types';

/**
 * Комплексные тесты для граничных случаев в системе расчета маркетпрайсов
 * 
 * Покрывает следующие сценарии:
 * 1. Экстремальные цены (очень высокие/низкие)
 * 2. Малые выборки (1-2 продукта)
 * 3. Отсутствие данных определенного типа
 * 4. Некорректные входные данные (NaN, Infinity, null)
 * 5. Высокая волатильность
 * 6. Одинаковые цены во всех категориях
 * 7. Экстремальные коэффициенты
 */

describe('Edge Cases - Enhanced GIA Coefficient Calculator', () => {
  let calculator: EnhancedGiaCoefficientCalculator;

  beforeEach(() => {
    calculator = new EnhancedGiaCoefficientCalculator();
  });

  describe('Extreme Prices', () => {
    test('should handle extremely high prices', () => {
      const products: IProduct[] = [
        createProduct('GIA', 999999, 'product1'),
        createProduct('GIA', 800000, 'product2'),
        createProduct('IGI', 500000, 'product3'),
        createProduct('IGI', 400000, 'product4')
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');
      
      expect(result.isValid).toBe(true);
      expect(result.calculatedCoefficient).toBeGreaterThanOrEqual(1.5);
      expect(result.calculatedCoefficient).toBeLessThanOrEqual(3.5);
    });

    test('should handle extremely low prices', () => {
      const products: IProduct[] = [
        createProduct('GIA', 15, 'product1'),
        createProduct('GIA', 20, 'product2'),
        createProduct('IGI', 8, 'product3'),
        createProduct('IGI', 12, 'product4')
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-0.3-0.59-VS2-G');
      
      expect(result.isValid).toBe(true);
      expect(result.calculatedCoefficient).toBeGreaterThanOrEqual(1.5);
    });

    test('should reject prices below minimum threshold', () => {
      const products: IProduct[] = [
        createProduct('GIA', 0.5, 'product1'),  // Слишком низкая цена
        createProduct('IGI', 0.1, 'product2')   // Слишком низкая цена
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-0.3-0.59-VS2-G');
      
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Invalid input data');
    });
  });

  describe('Small Sample Sizes', () => {
    test('should handle single product of each type', () => {
      const products: IProduct[] = [
        createProduct('GIA', 1000, 'product1'),
        createProduct('IGI', 500, 'product2')
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');
      
      expect(result.isValid).toBe(true);
      expect(result.calculatedCoefficient).toBe(2.0); // Should use actual calculation
    });

    test('should handle only one product total', () => {
      const products: IProduct[] = [
        createProduct('GIA', 1000, 'product1')
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');
      
      expect(result.isValid).toBe(true);
      expect(result.calculatedCoefficient).toBe(2.5); // GIA_ONLY_COEFF
      expect(result.reason).toContain('Only GIA products');
    });

    test('should handle empty product array', () => {
      const products: IProduct[] = [];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');
      
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Invalid input data');
    });
  });

  describe('Invalid Input Data', () => {
    test('should handle NaN prices', () => {
      const products: IProduct[] = [
        createProduct('GIA', NaN, 'product1'),
        createProduct('IGI', 500, 'product2')
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');
      
      // Should filter out invalid product and work with remaining
      expect(result.giaProducts.length).toBe(0);
      expect(result.igiProducts.length).toBe(1);
    });

    test('should handle Infinity prices', () => {
      const products: IProduct[] = [
        createProduct('GIA', Infinity, 'product1'),
        createProduct('IGI', 500, 'product2')
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');
      
      expect(result.giaProducts.length).toBe(0);
      expect(result.igiProducts.length).toBe(1);
    });

    test('should handle null/undefined certificateInstitute', () => {
      const products: IProduct[] = [
        { ...createProduct('GIA', 1000, 'product1'), certificateInstitute: undefined },
        { ...createProduct('IGI', 500, 'product2'), certificateInstitute: null as any }
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');
      
      expect(result.giaProducts.length).toBe(0);
      expect(result.igiProducts.length).toBe(0);
    });

    test('should handle invalid category key', () => {
      const products: IProduct[] = [createProduct('GIA', 1000, 'product1')];

      const result = calculator.calculateGiaCoefficient(products, '');
      
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Invalid input data');
    });
  });

  describe('High Volatility Scenarios', () => {
    test('should handle products with extremely different prices in same certificate type', () => {
      const products: IProduct[] = [
        createProduct('GIA', 10000, 'product1'),  // Очень высокая цена
        createProduct('GIA', 100, 'product2'),    // Очень низкая цена
        createProduct('IGI', 5000, 'product3'),
        createProduct('IGI', 50, 'product4')
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');
      
      expect(result.isValid).toBe(true);
      // Система должна обработать выбросы
      expect(result.calculatedCoefficient).toBeGreaterThanOrEqual(1.5);
      expect(result.calculatedCoefficient).toBeLessThanOrEqual(3.5);
    });
  });

  describe('Coefficient Application Edge Cases', () => {
    test('should handle zero base price', () => {
      const result = calculator.applyGiaCoefficient(0, 2.0, 'GIA');
      expect(result).toBe(0);
    });

    test('should handle negative base price', () => {
      const result = calculator.applyGiaCoefficient(-100, 2.0, 'GIA');
      expect(result).toBe(0); // Should return 0 for invalid prices
    });

    test('should handle invalid coefficient', () => {
      const result = calculator.applyGiaCoefficient(1000, NaN, 'GIA');
      expect(result).toBe(1000); // Should use coefficient of 1.0 as fallback
    });

    test('should handle unknown certificate institute', () => {
      const result = calculator.applyGiaCoefficient(1000, 2.0, 'UNKNOWN_CERT');
      expect(result).toBe(1500); // (2.0 + 1) / 2 * 1000 = 1500
    });
  });
});

describe('Edge Cases - Enhanced Price Smoother', () => {
  let smoother: EnhancedAdvancedPriceSmoother;

  beforeEach(() => {
    smoother = new EnhancedAdvancedPriceSmoother();
  });

  describe('Invalid Input Data', () => {
    test('should handle empty category array', () => {
      const result = smoother.smoothMarketPrices([]);
      
      expect(result.totalCategories).toBe(0);
      expect(result.adjustedCategories).toBe(0);
      expect(result.qualityMetrics.overallConfidence).toBe(0);
    });

    test('should handle categories with NaN prices', () => {
      const categories = [
        createCategoryStat('ROUND', '1-1.39', 'VS1', 'D', NaN, 5),
        createCategoryStat('ROUND', '1-1.39', 'VS1', 'E', 1000, 5)
      ];

      const result = smoother.smoothMarketPrices(categories);
      
      expect(result.processingStats.invalidCategoriesSkipped).toBeGreaterThan(0);
    });

    test('should handle categories with Infinity prices', () => {
      const categories = [
        createCategoryStat('ROUND', '1-1.39', 'VS1', 'D', Infinity, 5),
        createCategoryStat('ROUND', '1-1.39', 'VS1', 'E', 1000, 5)
      ];

      const result = smoother.smoothMarketPrices(categories);
      
      expect(result.processingStats.invalidCategoriesSkipped).toBeGreaterThan(0);
    });
  });

  describe('Extreme Price Scenarios', () => {
    test('should handle categories with extremely high prices', () => {
      const categories = [
        createCategoryStat('ROUND', '1-1.39', 'IF', 'D', 999999, 10),
        createCategoryStat('ROUND', '1-1.39', 'VVS1', 'D', 800000, 10),
        createCategoryStat('ROUND', '1-1.39', 'VVS2', 'D', 600000, 10)
      ];

      const result = smoother.smoothMarketPrices(categories);
      
      expect(result.totalCategories).toBe(3);
      expect(result.qualityMetrics.overallConfidence).toBeGreaterThan(0);
    });

    test('should handle categories with extremely low prices', () => {
      const categories = [
        createCategoryStat('ROUND', '0.3-0.59', 'VS2', 'M', 5, 3),
        createCategoryStat('ROUND', '0.3-0.59', 'VS2', 'L', 8, 3),
        createCategoryStat('ROUND', '0.3-0.59', 'VS2', 'K', 12, 3)
      ];

      const result = smoother.smoothMarketPrices(categories);
      
      expect(result.totalCategories).toBe(3);
      expect(result.qualityMetrics.overallConfidence).toBeGreaterThan(0);
    });
  });

  describe('Small Sample Sizes', () => {
    test('should handle categories with single product', () => {
      const categories = [
        createCategoryStat('ROUND', '1-1.39', 'VS1', 'D', 1000, 1),
        createCategoryStat('ROUND', '1-1.39', 'VS1', 'E', 900, 1)
      ];

      const result = smoother.smoothMarketPrices(categories);
      
      expect(result.processingStats.categoriesWithInsufficientData).toBe(2);
      expect(result.qualityMetrics.dataQualityScore).toBeLessThan(1);
    });

    test('should handle single category', () => {
      const categories = [
        createCategoryStat('ROUND', '1-1.39', 'VS1', 'D', 1000, 10)
      ];

      const result = smoother.smoothMarketPrices(categories);
      
      expect(result.totalCategories).toBe(1);
      expect(result.adjustedCategories).toBe(0); // No adjustments possible with single category
    });
  });

  describe('High Volatility Scenarios', () => {
    test('should handle categories with very high standard deviation', () => {
      const categories = [
        {
          ...createCategoryStat('ROUND', '1-1.39', 'VS1', 'D', 1000, 10),
          standardDeviation: 5000, // Very high SD
          mad: 3000
        },
        {
          ...createCategoryStat('ROUND', '1-1.39', 'VS1', 'E', 900, 10),
          standardDeviation: 4500,
          mad: 2800
        }
      ];

      const result = smoother.smoothMarketPrices(categories);
      
      expect(result.processingStats.categoriesWithLowConfidence).toBeGreaterThan(0);
      expect(result.qualityMetrics.overallConfidence).toBeLessThan(0.8);
    });
  });

  describe('Monotonicity Edge Cases', () => {
    test('should handle identical prices in hierarchy', () => {
      const categories = [
        createCategoryStat('ROUND', '1-1.39', 'IF', 'D', 1000, 5),
        createCategoryStat('ROUND', '1-1.39', 'VVS1', 'D', 1000, 5),
        createCategoryStat('ROUND', '1-1.39', 'VVS2', 'D', 1000, 5)
      ];

      const result = smoother.smoothMarketPrices(categories);
      
      expect(result.totalCategories).toBe(3);
      // System should handle identical prices gracefully
    });

    test('should handle severely inverted hierarchy', () => {
      const categories = [
        createCategoryStat('ROUND', '1-1.39', 'IF', 'D', 500, 5),   // Lowest quality, lowest price
        createCategoryStat('ROUND', '1-1.39', 'VVS1', 'D', 1000, 5), // Mid quality, mid price
        createCategoryStat('ROUND', '1-1.39', 'VVS2', 'D', 1500, 5)  // Higher quality, higher price (inverted)
      ];

      const result = smoother.smoothMarketPrices(categories);
      
      expect(result.totalCategories).toBe(3);
      expect(result.adjustedCategories).toBeGreaterThan(0); // Should make adjustments
    });
  });
});

// Helper functions for creating test data

function createProduct(
  certificateInstitute: string, 
  pricePerCarat: number, 
  id: string
): IProduct {
  return {
    _id: id,
    shape: 'Round',
    carat: 1.0,
    clarity: 'VS1',
    color: 'D',
    pricePerCarat,
    certificateInstitute,
    status: 'available',
    onDeal: false
  };
}

function createCategoryStat(
  shape: string,
  weight: string,
  clarity: string,
  color: string,
  marketPricePerCarat: number,
  count: number
): any {
  const standardDeviation = marketPricePerCarat * 0.1; // 10% SD
  const mad = standardDeviation * 0.6745;
  
  return {
    shape: shape as any,
    weight: weight as any,
    clarity: clarity as any,
    color: color as any,
    count,
    marketPricePerCarat,
    avgPricePerCarat: marketPricePerCarat,
    medianPricePerCarat: marketPricePerCarat,
    standardDeviation,
    standardError: standardDeviation / Math.sqrt(count),
    mad,
    logPrice: Math.log(marketPricePerCarat),
    winsorizedPrice: marketPricePerCarat,
    confidence: 0.8,
    volatility: standardDeviation / marketPricePerCarat,
    isOutlier: false,
    hasInsufficientData: count < 3,
    originalPrice: marketPricePerCarat,
    priceRange: [marketPricePerCarat * 0.8, marketPricePerCarat * 1.2] as [number, number]
  };
}

describe('Integration Edge Cases', () => {
  test('should handle complete workflow with problematic data', () => {
    const calculator = new EnhancedGiaCoefficientCalculator();
    const smoother = new EnhancedAdvancedPriceSmoother();

    // Create problematic product data
    const products: IProduct[] = [
      createProduct('GIA', NaN, 'invalid1'),        // Invalid price
      createProduct('IGI', Infinity, 'invalid2'),   // Invalid price
      createProduct('GIA', 1000000, 'extreme1'),    // Extreme high price
      createProduct('IGI', 1, 'extreme2'),          // Extreme low price
      createProduct('GIA', 1500, 'valid1'),         // Valid
      createProduct('IGI', 1000, 'valid2'),         // Valid
    ];

    // Test GIA coefficient calculation
    const giaResult = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');
    expect(giaResult.isValid).toBe(true);
    expect(giaResult.giaProducts.length).toBeGreaterThan(0);
    expect(giaResult.igiProducts.length).toBeGreaterThan(0);

    // Test price smoothing with problematic categories
    const categories = [
      createCategoryStat('ROUND', '1-1.39', 'IF', 'D', NaN, 5),      // Invalid price
      createCategoryStat('ROUND', '1-1.39', 'VVS1', 'D', 1000, 1),  // Insufficient data
      createCategoryStat('ROUND', '1-1.39', 'VVS2', 'D', 900, 10),  // Valid
      createCategoryStat('ROUND', '1-1.39', 'VS1', 'D', 800, 10),   // Valid
    ];

    const smoothingResult = smoother.smoothMarketPrices(categories);
    expect(smoothingResult.totalCategories).toBeGreaterThan(0);
    expect(smoothingResult.processingStats.invalidCategoriesSkipped).toBeGreaterThan(0);
    expect(smoothingResult.qualityMetrics.overallConfidence).toBeGreaterThan(0);
  });
});
