import { EnhancedGiaCoefficientCalculator } from '../giaCoefficientCalculator.enhanced';
import { IProduct } from '../types';

describe('GiaCoefficientCalculator', () => {
  let calculator: EnhancedGiaCoefficientCalculator;

  beforeEach(() => {
    calculator = new EnhancedGiaCoefficientCalculator();
  });

  describe('calculateGiaCoefficient', () => {
    it('should calculate correct coefficient when both GIA and IGI products are available', () => {
      const products: IProduct[] = [
        {
          _id: '1',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 1000,
          certificateInstitute: 'GIA',
          status: 'available'
        },
        {
          _id: '2',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 1200,
          certificateInstitute: 'GIA',
          status: 'available'
        },
        {
          _id: '3',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 400,
          certificateInstitute: 'IGI',
          status: 'available'
        },
        {
          _id: '4',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 500,
          certificateInstitute: 'IGI',
          status: 'available'
        }
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');

      expect(result.isValid).toBe(true);
      expect(result.calculatedCoefficient).toBeCloseTo(2.44, 1); // (1000+1200)/2 / (400+500)/2 = 1100/450 = 2.44
      expect(result.giaProducts).toHaveLength(2);
      expect(result.igiProducts).toHaveLength(2);
    });

    it('should return invalid result when insufficient GIA products', () => {
      const products: IProduct[] = [
        {
          _id: '1',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 1000,
          certificateInstitute: 'GIA',
          status: 'available'
        },
        {
          _id: '2',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 400,
          certificateInstitute: 'IGI',
          status: 'available'
        },
        {
          _id: '3',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 500,
          certificateInstitute: 'IGI',
          status: 'available'
        }
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Insufficient data: GIA=1');
      expect(result.calculatedCoefficient).toBe(1.5); // Default minimum
    });

    it('should return invalid result when insufficient IGI products', () => {
      const products: IProduct[] = [
        {
          _id: '1',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 1000,
          certificateInstitute: 'GIA',
          status: 'available'
        },
        {
          _id: '2',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 1200,
          certificateInstitute: 'GIA',
          status: 'available'
        },
        {
          _id: '3',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 400,
          certificateInstitute: 'IGI',
          status: 'available'
        }
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Insufficient data: GIA=2, IGI=1 (minimum 2)');
      expect(result.calculatedCoefficient).toBe(1.5); // Default minimum
    });

    it('should limit coefficient to maximum value', () => {
      const products: IProduct[] = [
        {
          _id: '1',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 10000, // Very high GIA price
          certificateInstitute: 'GIA',
          status: 'available'
        },
        {
          _id: '2',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 12000,
          certificateInstitute: 'GIA',
          status: 'available'
        },
        {
          _id: '3',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 1000, // Low IGI price
          certificateInstitute: 'IGI',
          status: 'available'
        },
        {
          _id: '4',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 1200,
          certificateInstitute: 'IGI',
          status: 'available'
        }
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');

      expect(result.isValid).toBe(true);
      expect(result.calculatedCoefficient).toBe(3.5); // Limited to maximum
    });

    it('should limit coefficient to minimum value', () => {
      const products: IProduct[] = [
        {
          _id: '1',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 1000, // Low GIA price
          certificateInstitute: 'GIA',
          status: 'available'
        },
        {
          _id: '2',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 1200,
          certificateInstitute: 'GIA',
          status: 'available'
        },
        {
          _id: '3',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 10000, // Very high IGI price
          certificateInstitute: 'IGI',
          status: 'available'
        },
        {
          _id: '4',
          shape: 'ROUND',
          carat: 1.0,
          clarity: 'VS1',
          color: 'D',
          pricePerCarat: 12000,
          certificateInstitute: 'IGI',
          status: 'available'
        }
      ];

      const result = calculator.calculateGiaCoefficient(products, 'ROUND-1-1.39-VS1-D');

      expect(result.isValid).toBe(true);
      expect(result.calculatedCoefficient).toBe(1.5); // Limited to minimum
    });
  });

  describe('applyGiaCoefficient', () => {
    it('should apply coefficient to GIA products', () => {
      const basePrice = 1000;
      const coefficient = 2.0;

      const result = calculator.applyGiaCoefficient(basePrice, coefficient, 'GIA');

      expect(result).toBe(2000); // 1000 * 2.0
    });

    it('should not apply coefficient to IGI products', () => {
      const basePrice = 1000;
      const coefficient = 2.0;

      const result = calculator.applyGiaCoefficient(basePrice, coefficient, 'IGI');

      expect(result).toBe(1000); // 1000 * 1.0
    });

    it('should apply average coefficient to unknown certificate types', () => {
      const basePrice = 1000;
      const coefficient = 2.0;

      const result = calculator.applyGiaCoefficient(basePrice, coefficient, 'OTHER');

      expect(result).toBe(1500); // 1000 * (2.0 + 1) / 2
    });

    it('should apply average coefficient when certificate type is undefined', () => {
      const basePrice = 1000;
      const coefficient = 2.0;

      const result = calculator.applyGiaCoefficient(basePrice, coefficient, undefined);

      expect(result).toBe(1500); // 1000 * (2.0 + 1) / 2
    });

    it('should handle case-insensitive certificate types', () => {
      const basePrice = 1000;
      const coefficient = 2.0;

      const resultGia = calculator.applyGiaCoefficient(basePrice, coefficient, 'gia');
      const resultIgi = calculator.applyGiaCoefficient(basePrice, coefficient, 'igi');

      expect(resultGia).toBe(2000);
      expect(resultIgi).toBe(1000);
    });
  });

  describe('createGiaCoefficient', () => {
    it('should create valid GIA coefficient object', () => {
      const calculation = {
        categoryKey: 'ROUND-1-1.39-VS1-D',
        giaProducts: [
          {
            _id: '1',
            shape: 'ROUND',
            carat: 1.0,
            clarity: 'VS1',
            color: 'D',
            pricePerCarat: 1000,
            certificateInstitute: 'GIA',
            status: 'available'
          }
        ],
        igiProducts: [
          {
            _id: '2',
            shape: 'ROUND',
            carat: 1.0,
            clarity: 'VS1',
            color: 'D',
            pricePerCarat: 500,
            certificateInstitute: 'IGI',
            status: 'available'
          }
        ],
        calculatedCoefficient: 2.0,
        isValid: true
      };

      const result = calculator.createGiaCoefficient(calculation);

      expect(result.categoryKey).toBe('ROUND-1-1.39-VS1-D');
      expect(result.giaCoefficient).toBe(2.0);
      expect(result.avgGiaPrice).toBe(1000);
      expect(result.avgIgiPrice).toBe(500);
      expect(result.giaCount).toBe(1);
      expect(result.igiCount).toBe(1);
      expect(result.calculatedAt).toBeInstanceOf(Date);
    });
  });

  describe('shouldRecalculateCoefficient', () => {
    it('should return true for old coefficients', () => {
      const oldCoefficient = {
        categoryKey: 'ROUND-1-1.39-VS1-D',
        giaCoefficient: 2.0,
        avgGiaPrice: 1000,
        avgIgiPrice: 500,
        giaCount: 1,
        igiCount: 1,
        calculatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
      };

      const result = calculator.shouldRecalculateCoefficient(oldCoefficient, 24);

      expect(result).toBe(true);
    });

    it('should return false for recent coefficients', () => {
      const recentCoefficient = {
        categoryKey: 'ROUND-1-1.39-VS1-D',
        giaCoefficient: 2.0,
        avgGiaPrice: 1000,
        avgIgiPrice: 500,
        giaCount: 1,
        igiCount: 1,
        calculatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago
      };

      const result = calculator.shouldRecalculateCoefficient(recentCoefficient, 24);

      expect(result).toBe(false);
    });
  });
});
