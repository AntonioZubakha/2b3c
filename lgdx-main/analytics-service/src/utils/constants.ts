/**
 * Constants for Analytics Service
 */

export const MAIN_SHAPES = [
  'ROUND', 'OVAL', 'PEAR', 'CUSHION', 'EMERALD', 'RADIANT', 
  'PRINCESS', 'MARQUISE', 'HEART', 'ASSCHER',
  // Also include lowercase versions for compatibility
  'Round', 'Oval', 'Pear', 'Cushion', 'Emerald', 'Radiant', 
  'Princess', 'Marquise', 'Heart', 'Asscher'
];

export const WEIGHT_BOUNDARIES = [0, 0.3, 0.6, 1, 1.4, 1.8, 2.2, 2.6, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 12, 15, 25, 50];

export const PRICE_BOUNDARIES = [0, 100, 200, 300, 500, 1000, 2000, 5000];

export const DEMAND_CONFIDENCE_THRESHOLDS = {
  HIGH: 100,
  MEDIUM: 50,
  LOW: 20,
  VERY_LOW: 10
} as const;

export const SUPPLY_THRESHOLDS = {
  OVERSUPPLIED: 15,
  BALANCED: 8
} as const;

export const TREND_THRESHOLDS = {
  RISING: 5,
  DECLINING: -5
} as const;

// Лимиты запросов к БД
export const DB_LIMITS = {
  MAX_CATEGORY_STATS: 50000,      // Максимум записей из ProductCategoryStats
  MAX_CERTIFICATES: 100000,       // Максимум сертификатов для анализа
  MAX_CHART_POINTS: 365,          // Максимум точек для графика (1 год)
  DEFAULT_QUERY_TIMEOUT: 30000,   // Таймаут запроса (30 сек)
} as const;

// Значения confidence
export const CONFIDENCE_VALUES = {
  EXCELLENT: 0.9,  // >= 100 disappeared
  GOOD: 0.8,       // >= 50 disappeared
  MODERATE: 0.7,   // >= 20 disappeared
  LOW: 0.6,        // >= 10 disappeared
  POOR: 0.3,       // < 10 disappeared
  NONE: 0.1,       // No data
} as const;

// Пороги концентрации спроса
export const DEMAND_CONCENTRATION = {
  HIGH: 0.8,        // > 80% в одной категории
  MODERATE: 0.6,    // > 60% в одной категории
} as const;

// Корректировки confidence при концентрации
export const CONCENTRATION_PENALTIES = {
  HIGH: 0.7,        // Уменьшить на 30%
  MODERATE: 0.8,    // Уменьшить на 20%
} as const;

// Временные интервалы (мс)
export const TIME_INTERVALS = {
  LAST_24H: 24 * 60 * 60 * 1000,
  LAST_72H: 72 * 60 * 60 * 1000,
  LAST_7_DAYS: 7 * 24 * 60 * 60 * 1000,
  LAST_14_DAYS: 14 * 24 * 60 * 60 * 1000,
} as const;

// Пороги давности данных
export const DATA_FRESHNESS = {
  WARNING_HOURS: 4,         // Предупреждение если данные старше 4 часов
  CRITICAL_HOURS: 12,       // Критично если данные старше 12 часов
} as const;