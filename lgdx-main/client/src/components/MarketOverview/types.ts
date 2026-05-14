export interface MarketData {
  totalProducts: number;
  shapeStats: Array<{ _id: string; count: number }>;
  weightStats: Array<{ range: string; count: number }>;
  newArrivals?: { last24h: number; last72h: number; };
  priceSegments?: Array<{ range: string; count: number; percentage: number; }>;
  priceDynamics?: Array<{
    shape: string;
    avgPriceLast7Days: number;
    priceChangePercent: number;
    trend?: 'Bullish' | 'Bearish' | 'Neutral';
  }>;
}

export interface DemandData {
  totalDisappeared: number;
  totalReappeared?: number;
  salesConfidence?: number;
  topDemandCategories: Array<{
    shape: string;
    weight: string;
    clarity: string;
    color: string;
    disappearedProductsSinceYesterday: number;
    avgPricePerCarat_disappearedProducts?: number;
    medianPricePerCarat_disappearedProducts?: number;
    date: string;
  }>;
  categories?: Array<{
    shape: string;
    weight: string;
    clarity: string;
    color: string;
    disappearedProductsSinceYesterday: number;
    avgPricePerCarat_disappearedProducts?: number;
    medianPricePerCarat_disappearedProducts?: number;
    date: string;
  }>;
  demandByShape: Array<{ shape: string; disappeared: number; }>;
  demandByWeight: Array<{ weight: string; disappeared: number; }>;
  demandByClarity: Array<{ clarity: string; disappeared: number; }>;
  demandByColor: Array<{ color: string; disappeared: number; }>;
}

export type TabType = 'overview' | 'demand' | 'supply' | 'trends' | 'news' | 'compare';

export type DemandPeriod = 'day' | 'week' | 'month';

export interface TabData {
  id: TabType;
  label: string;
  description: string;
}

// Category-level Price Trends (shape + weight + clarity + color)
export interface CategoryPriceTrend {
  shape: string;
  weight: string;
  clarity: string;
  color: string;
  avgPriceCurrent: number;
  avgPricePrevious: number;
  priceChangePercent: number;
  avgCount: number;
}

export interface CategoryPriceTrendsResult {
  rising: CategoryPriceTrend[];
  falling: CategoryPriceTrend[];
  days: number;
  generatedAt: string;
}

// Category-level Supply Insights
export interface CategorySupplyOpportunity {
  shape: string;
  weight: string;
  clarity: string;
  color: string;
  avgCount: number;
  totalDisappeared: number;
  avgPrice: number;
  priceChangePercent: number;
  demandSupplyRatio: number;
  score: number;
  reasons: string[];
}

export interface CategorySupplyInsightsResult {
  worthProducing: CategorySupplyOpportunity[];
  notWorthProducing: CategorySupplyOpportunity[];
  period: number;
  generatedAt: string;
}

// Full category comparison (shape + weight + clarity + color)
export interface CategorySpec {
  shape: string;
  weight: string;
  clarity: string;
  color: string;
}

export interface CategoryComparisonSide extends CategorySpec {
  avgCount: number;
  totalDisappeared: number;
  avgPrice: number;
  priceChangePercent: number;
  demandSupplyRatio: number;
  score: number;
  reasons: string[];
  dataPoints: number;
}

export interface CategoryComparisonFullResult {
  catA: CategoryComparisonSide;
  catB: CategoryComparisonSide;
  verdict: {
    winner: 'A' | 'B' | 'tie';
    winnerLabel: string;
    scoreA: number;
    scoreB: number;
    reasons: string[];
  };
  days: number;
  generatedAt: string;
}

export interface CategoryOptions {
  shapes: string[];
  weights: string[];
  clarities: string[];
  colors: string[];
}