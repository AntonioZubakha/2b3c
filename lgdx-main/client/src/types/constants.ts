// Shape/weight/clarity helpers (aligned with server pricing logic). Deal stage/status literals: types/index.ts.

// --- Client-side Enums and Utility Functions (copied/adapted from server) ---

export enum ShapeCategory {
  ROUND = 'ROUND',                    // Круглая
  SQUARE_RECTANGULAR = 'SQUARE_RECTANGULAR',  // Квадратные/Прямоугольные
  ELONGATED_DROPLET = 'ELONGATED_DROPLET',    // Вытянутые/Каплевидные
  FANCY = 'FANCY'                      // Фенси (все остальные)
}

export enum WeightCategory {
  W_0_00_0_29 = '0.00-0.29',
  W_0_30_0_59 = '0.3-0.59',
  W_0_60_0_99 = '0.6-0.99',
  W_1_00_1_39 = '1-1.39',
  W_1_40_1_79 = '1.4-1.79',
  W_1_80_2_19 = '1.8-2.19',
  W_2_20_2_59 = '2.2-2.59',
  W_2_60_2_99 = '2.6-2.99',
  W_3_00_3_49 = '3-3.49',
  W_3_50_3_99 = '3.5-3.99',
  W_4_00_4_99 = '4-4.99',
  W_5_00_5_99 = '5-5.99',
  W_6_00_6_99 = '6-6.99',
  W_7_00_7_99 = '7-7.99',
  W_8_00_8_99 = '8-8.99',
  W_9_00_9_99 = '9-9.99',
  W_10_00_11_99 = '10-11.99',
  W_12_00_14_99 = '12-14.99',
  W_15_00_24_99 = '15-24.99',
  W_25_00_50_00 = '25-50',
  W_50_01_100_00 = '50.01-100',
  W_100_01_PLUS = '100.01+'
}

export enum ClarityCategory {
  IF = 'IF',
  VVS1 = 'VVS1',
  VVS2 = 'VVS2',
  VS1 = 'VS1',
  VS2 = 'VS2'
}

export enum ColorCategoryEnum {
  D = 'D',
  E = 'E',
  F = 'F',
  G = 'G'
}

export const determineShapeCategory = (shape: string): ShapeCategory => {
  const normalizedShape = shape.toUpperCase().trim();
  
  // Круглая группа
  if (normalizedShape === 'ROUND') {
    return ShapeCategory.ROUND;
  }
  
  // Квадратные/Прямоугольные группы
  if (['CUSHION', 'RADIANT', 'ASSCHER', 'PRINCESS', 'EMERALD', 'TRILLION'].includes(normalizedShape)) {
    return ShapeCategory.SQUARE_RECTANGULAR;
  }
  
  // Вытянутые/Каплевидные группы
  if (['OVAL', 'PEAR', 'MARQUISE'].includes(normalizedShape)) {
    return ShapeCategory.ELONGATED_DROPLET;
  }
  
  // Все остальные формы попадают в категорию Фенси
  return ShapeCategory.FANCY;
};

/**
 * Maps product shape (e.g. "Baguette", "Round") to the category shape string used in
 * ProductCategoryStats / chart API. Must match market-price-calculator's determineShapeCategory.
 * Used when requesting price history chart so Baguette/Trillion/Other request FANCY.
 */
export const getCategoryShapeForChart = (shape: string): string => {
  const n = shape.toUpperCase().trim();
  if (n === 'ROUND') return 'ROUND';
  if (n === 'OVAL') return 'OVAL';
  if (n === 'PEAR') return 'PEAR';
  if (n === 'CUSHION') return 'CUSHION';
  if (n === 'EMERALD') return 'EMERALD';
  if (n === 'RADIANT') return 'RADIANT';
  if (n === 'PRINCESS') return 'PRINCESS';
  if (n === 'MARQUISE') return 'MARQUISE';
  if (n === 'HEART') return 'HEART';
  if (n === 'ASSCHER') return 'ASSCHER';
  return 'FANCY';
};

export const determineWeightCategory = (carat: number): WeightCategory => {
  if (isNaN(carat) || carat === null || carat === undefined || carat < 0) {
    return WeightCategory.W_0_00_0_29;
  }
  if (carat >= 0.0 && carat < 0.3) return WeightCategory.W_0_00_0_29;
  if (carat >= 0.3 && carat < 0.6) return WeightCategory.W_0_30_0_59;
  if (carat >= 0.6 && carat < 1.0) return WeightCategory.W_0_60_0_99;
  if (carat >= 1.0 && carat < 1.4) return WeightCategory.W_1_00_1_39;
  if (carat >= 1.4 && carat < 1.8) return WeightCategory.W_1_40_1_79;
  if (carat >= 1.8 && carat < 2.2) return WeightCategory.W_1_80_2_19;
  if (carat >= 2.2 && carat < 2.6) return WeightCategory.W_2_20_2_59;
  if (carat >= 2.6 && carat < 3.0) return WeightCategory.W_2_60_2_99;
  if (carat >= 3.0 && carat < 3.5) return WeightCategory.W_3_00_3_49;
  if (carat >= 3.5 && carat < 4.0) return WeightCategory.W_3_50_3_99;
  if (carat >= 4.0 && carat < 5.0) return WeightCategory.W_4_00_4_99;
  if (carat >= 5.0 && carat < 6.0) return WeightCategory.W_5_00_5_99;
  if (carat >= 6.0 && carat < 7.0) return WeightCategory.W_6_00_6_99;
  if (carat >= 7.0 && carat < 8.0) return WeightCategory.W_7_00_7_99;
  if (carat >= 8.0 && carat < 9.0) return WeightCategory.W_8_00_8_99;
  if (carat >= 9.0 && carat < 10.0) return WeightCategory.W_9_00_9_99;
  if (carat >= 10.0 && carat < 12.0) return WeightCategory.W_10_00_11_99;
  if (carat >= 12.0 && carat < 15.0) return WeightCategory.W_12_00_14_99;
  if (carat >= 15.0 && carat < 25.0) return WeightCategory.W_15_00_24_99;
  if (carat >= 25.0 && carat <= 50.0) return WeightCategory.W_25_00_50_00;
  if (carat > 50.0 && carat <= 100.0) return WeightCategory.W_50_01_100_00;
  if (carat > 100.0) return WeightCategory.W_100_01_PLUS;
  return WeightCategory.W_0_00_0_29;
};
