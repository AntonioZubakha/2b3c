// Market Overview Data Types
export interface ShapeStats {
  _id: string;
  count: number;
}

export interface WeightStats {
  range: string;
  count: number;
}

export interface PriceSegment {
  range: string;
  count: number;
  percentage: number;
}

export interface MarketOverviewData {
  totalProducts: number;
  shapeStats: ShapeStats[];
  weightStats: WeightStats[];
  priceSegments: PriceSegment[];
  newArrivals?: {
    last24h: number;
    last72h: number;
  };
  priceDynamics?: Array<{
    shape: string;
    avgPriceLast7Days: number;
    priceChangePercent: number;
  }>;
}

// Demand Analysis Data Types
export interface DemandStats {
  shape: string;
  weight: string;
  clarity: string;
  color: string;
  disappearedProductsSinceYesterday: number;
  avgPricePerCarat_disappearedProducts?: number;
  medianPricePerCarat_disappearedProducts?: number;
  date: string;
  certificateNumbers?: string[]; // For median calculation
}

export interface DemandData {
  totalDisappeared: number;
  totalReappeared?: number; // Optional: now calculated by filtering out reappeared products
  salesConfidence?: number;
  topDemandCategories: DemandStats[];
  categories?: DemandStats[];
  demandByShape: Array<{ shape: string; disappeared: number; }>;
  demandByWeight: Array<{ weight: string; disappeared: number; }>;
  demandByClarity: Array<{ clarity: string; disappeared: number; }>;
  demandByColor: Array<{ color: string; disappeared: number; }>;
}

// Supply Insights Data Types (extended for seller-focused analytics)
export interface SupplyOpportunity {
  shape: string;
  count: number;
  percentage: number;
  recommendation: 'undersupplied' | 'balanced' | 'oversupplied';
  currentSupply: string;
  recommendationText: string;
  marketGap?: number;
  profitPotential?: 'low' | 'medium' | 'high' | 'very_high';
  trendDirection?: 'declining' | 'stable' | 'growing';
  demandIntensity?: number;
  competitionLevel?: 'low' | 'medium' | 'high';
  marketShare?: number;
  averagePrice?: number;
  priceVolatility?: number;
  growthRate?: number;
}

export interface ProfitabilityTrend {
  shape: string;
  avgPriceLast7Days: number;
  priceChangePercent: number;
  profitability: 'rising' | 'declining' | 'stable';
  recommendation: string;
  marketShare?: number;
  demandStrength?: number;
  priceStability?: number;
  investmentRisk?: 'low' | 'medium' | 'high';
  supplyDemandRatio?: number;
  competitiveAdvantage?: number;
  marketPosition?: 'leader' | 'challenger' | 'follower' | 'niche';
}

export interface SupplyInsightsMarketTrends {
  overallSentiment: 'bullish' | 'bearish' | 'neutral';
  keyOpportunities: string[];
  riskFactors: string[];
  recommendedActions: string[];
  marketVolatility: number;
  supplyChainStability: number;
}

export interface SupplyInsightsCompetitiveAnalysis {
  marketLeaders: Array<{ shape: string; dominance: number; strategy: string }>;
  emergingOpportunities: Array<{ shape: string; potential: number; timeline: string }>;
  saturatedSegments: Array<{ shape: string; saturation: number; recommendation: string }>;
  competitiveIntensity: number;
}

export interface SupplyInsightsPredictive {
  nextMonthForecast: Array<{ shape: string; predictedDemand: number; confidence: number }>;
  seasonalTrends: Array<{ shape: string; seasonalFactor: number; peakMonths: string[] }>;
  riskAssessment: Array<{ shape: string; riskLevel: 'low' | 'medium' | 'high'; factors: string[] }>;
}

export interface SupplyInsightsData {
  productionOpportunities: SupplyOpportunity[];
  profitabilityAnalysis: ProfitabilityTrend[];
  marketTrends?: SupplyInsightsMarketTrends;
  competitiveAnalysis?: SupplyInsightsCompetitiveAnalysis;
  predictiveInsights?: SupplyInsightsPredictive;
}

// Price Trends Data Types
export interface PriceTrendsData {
  newArrivals: {
    last24h: number;
    last72h: number;
  };
  priceDynamics: Array<{
    shape: string;
    avgPriceLast7Days: number;
    priceChangePercent: number;
    trend: 'Bullish' | 'Bearish' | 'Neutral';
  }>;
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

export interface CategoryComparisonFullVerdict {
  winner: 'A' | 'B' | 'tie';
  winnerLabel: string;
  scoreA: number;
  scoreB: number;
  reasons: string[];
}

export interface CategoryComparisonFullResult {
  catA: CategoryComparisonSide;
  catB: CategoryComparisonSide;
  verdict: CategoryComparisonFullVerdict;
  days: number;
  generatedAt: string;
}

export interface CategoryOptions {
  shapes: string[];
  weights: string[];
  clarities: string[];
  colors: string[];
}

// Shape-level Category Comparison Types (legacy)
export interface CategoryComparisonShape {
  shape: string;
  profitPotential: 'low' | 'medium' | 'high' | 'very_high';
  recommendation: 'undersupplied' | 'balanced' | 'oversupplied';
  priceTrend7d: number;
  trendDirection: 'declining' | 'stable' | 'growing';
  avgPrice: number;
  demandIntensity: number;
  competitionLevel: 'low' | 'medium' | 'high';
  marketShare: number;
  supplyDemandRatio: number;
}

export type ComparisonWinner = 'A' | 'B' | 'tie';

export interface ComparisonVerdict {
  winner: ComparisonWinner;
  winnerShape: string;
  scoreA: number;
  scoreB: number;
  reasons: string[];
}

export interface CategoryComparisonResult {
  shapeA: CategoryComparisonShape;
  shapeB: CategoryComparisonShape;
  verdict: ComparisonVerdict;
  period: string;
  generatedAt: string;
}

// Complete Analytics Response
export interface AnalyticsResponse {
  success: boolean;
  data: {
    marketOverview: MarketOverviewData;
    demandAnalysis: DemandData;
    supplyInsights: SupplyInsightsData;
    priceTrends: PriceTrendsData;
  };
  period: {
    startDate: string;
    endDate: string;
    daysAnalyzed: number;
  };
  cached?: boolean;
  cacheAge?: number;
}
