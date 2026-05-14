// Product types
export interface IProduct {
  _id: string;
  shape: string;
  carat: number;
  clarity: string;
  color: string;
  price?: number;
  pricePerCarat: number;
  marketPrice?: number;
  marketPricePerCarat?: number;
  certificateNumber?: string;
  certificate?: string; // Альтернативное поле
  certificateInstitute?: string;
  status: string;
  onDeal?: boolean;
  company?: string;
  /** Country/location (e.g. USA, India) — used for USA location coefficient */
  location?: string;
}

// Category types
export enum ShapeCategory {
  ROUND = 'ROUND',                    // Круглая
  OVAL = 'OVAL',                      // Овальная
  PEAR = 'PEAR',                      // Грушевидная
  CUSHION = 'CUSHION',                // Подушка
  EMERALD = 'EMERALD',                // Изумруд
  RADIANT = 'RADIANT',                // Радиант
  PRINCESS = 'PRINCESS',              // Принцесса
  MARQUISE = 'MARQUISE',              // Маркиз
  HEART = 'HEART',                    // Сердце
  ASSCHER = 'ASSCHER',                // Ашчер
  FANCY = 'FANCY'                     // Фенси (все остальные)
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
  FL = 'FL',
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

// Category combination type
export interface ICategoryCombination {
  shape: ShapeCategory;
  weight: WeightCategory;
  clarity: ClarityCategory;
  color: ColorCategoryEnum;
}

// Product detail type
export interface IProductDetail {
  certificateNumber: string;
  pricePerCarat: number;
}

// Economic indicators type
export interface IEconomicIndicators {
  goldPrice?: number;
  oilPrice?: number;
  inrUsdRate?: number;
}

// Category stats type
export interface ICategoryStats {
  date: Date;
  shape: ShapeCategory;
  weight: WeightCategory;
  clarity: ClarityCategory;
  color: ColorCategoryEnum;
  count: number;
  avgPricePerCarat: number;
  medianPricePerCarat: number;
  marketPricePerCarat: number;
  productDetails: IProductDetail[];
  newProductsToday: number;
  disappearedProductsSinceYesterday: number;
  priceIncreasedCount: number;
  priceDecreasedCount: number;
  priceUnchangedCount: number;
  avgPricePerCarat_newProducts: number;
  avgPricePerCarat_disappearedProducts: number;
  avgPricePerCarat_priceIncreased: number;
  avgPricePerCarat_priceDecreased: number;
  avgPricePerCarat_priceUnchanged: number;
  medianPricePerCarat_newProducts: number;
  medianPricePerCarat_disappearedProducts: number;
  medianPricePerCarat_priceIncreased: number;
  medianPricePerCarat_priceDecreased: number;
  medianPricePerCarat_priceUnchanged: number;
  goldPrice?: number;
  oilPrice?: number;
  inrUsdRate?: number;
}

// API response types
export interface IOilPriceResponse {
  status: string;
  data: {
    price: string;
    timestamp: string;
    currency: string;
    unit: string;
  };
}

export interface IFrankfurterResponse {
  base: string;
  date: string;
  rates: {
    [currency: string]: number;
  };
}

export interface IGoldPriceResponse {
  price: number;
  timestamp: string;
  currency: string;
}

// Configuration type
export interface IConfig {
  mongoUri: string;
  oilPriceApiKey: string;
  coeffInr: number;
  coeffGold: number;
  coeffOil: number;
  logLevel: string;
  calculationInterval: string;
  maxProcessingTime: number;
  dbConnectionTimeout: number;
  dbSocketTimeout: number;
  marketPriceCacheRedisUrl?: string | undefined;
  marketPriceCacheTtlSeconds: number;
}

// Calculation result type
export interface ICalculationResult {
  totalProducts: number;
  validProducts: number;
  processedProducts: number;
  duration: number;
  categoriesProcessed: number;
  errors: string[];
}

// GIA Coefficient types
export interface IGiaCoefficient {
  categoryKey: string;           // Ключ категории (shape-weight-clarity-color)
  giaCoefficient: number;        // Коэффициент GIA (1.5-3.5)
  avgGiaPrice: number;           // Средняя цена GIA камней
  avgIgiPrice: number;           // Средняя цена IGI камней
  giaCount: number;              // Количество GIA камней
  igiCount: number;              // Количество IGI камней
  calculatedAt: Date;            // Время расчета
}

export interface IGiaCoefficientCalculation {
  categoryKey: string;
  giaProducts: IProduct[];
  igiProducts: IProduct[];
  calculatedCoefficient: number;
  isValid: boolean;
  reason?: string | undefined;   // Причина невалидности
}

// USA Location coefficient (USA stones typically higher market price than India/non-USA)
export interface IUsaLocationCoefficientCalculation {
  categoryKey: string;
  usaProducts: IProduct[];
  nonUsaProducts: IProduct[];
  calculatedCoefficient: number;
  isValid: boolean;
  reason?: string;
}

// Logger type
export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown> | Error): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
} 