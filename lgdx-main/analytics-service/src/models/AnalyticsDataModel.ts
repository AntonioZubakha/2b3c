import mongoose, { Document, Schema } from 'mongoose';

export interface IAnalyticsData extends Document {
  period: 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
  generatedAt: Date;
  
  // Market Overview Data
  marketOverview: {
    totalProducts: number;
    shapeStats: Array<{ _id: string; count: number; }>;
    weightStats: Array<{ range: string; count: number; }>;
    priceSegments: Array<{ range: string; count: number; percentage: number; }>;
    newArrivals: { last24h: number; last72h: number; };
    priceDynamics: Array<{ shape: string; avgPriceLast7Days: number; priceChangePercent: number; trend: 'Bullish' | 'Bearish' | 'Neutral'; }>;
  };
  
  // Demand Analysis Data
  demandAnalysis: {
    totalDisappeared: number;
    totalReappeared: number;
    salesConfidence: number;
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
    categories: Array<{
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
  };
  
  // Supply Insights Data (flexible structure for seller-focused analytics)
  supplyInsights: Record<string, unknown>;
  
  // Price Trends Data
  priceTrends: {
    newArrivals: { last24h: number; last72h: number; };
    priceDynamics: Array<{ shape: string; avgPriceLast7Days: number; priceChangePercent: number; trend: 'Bullish' | 'Bearish' | 'Neutral'; }>;
  };
}

const AnalyticsDataSchema = new Schema<IAnalyticsData>({
  period: {
    type: String,
    enum: ['day', 'week', 'month'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  
  marketOverview: {
    totalProducts: { type: Number, required: true },
    shapeStats: [{
      _id: { type: String, required: true },
      count: { type: Number, required: true }
    }],
    weightStats: [{
      range: { type: String, required: true },
      count: { type: Number, required: true }
    }],
    priceSegments: [{
      range: { type: String, required: true },
      count: { type: Number, required: true },
      percentage: { type: Number, required: true }
    }],
    newArrivals: {
      last24h: { type: Number, required: true },
      last72h: { type: Number, required: true }
    },
    priceDynamics: [{
      shape: { type: String, required: true },
      avgPriceLast7Days: { type: Number, required: true },
      priceChangePercent: { type: Number, required: true },
      trend: { type: String, enum: ['Bullish', 'Bearish', 'Neutral'], required: true }
    }]
  },
  
  demandAnalysis: {
    totalDisappeared: { type: Number, required: true },
    totalReappeared: { type: Number, required: true },
    salesConfidence: { type: Number, required: true },
    topDemandCategories: [{
      shape: { type: String, required: true },
      weight: { type: String, required: true },
      clarity: { type: String, required: true },
      color: { type: String, required: true },
      disappearedProductsSinceYesterday: { type: Number, required: true },
      avgPricePerCarat_disappearedProducts: { type: Number },
      medianPricePerCarat_disappearedProducts: { type: Number },
      date: { type: String, required: true }
    }],
    categories: [{
      shape: { type: String, required: true },
      weight: { type: String, required: true },
      clarity: { type: String, required: true },
      color: { type: String, required: true },
      disappearedProductsSinceYesterday: { type: Number, required: true },
      avgPricePerCarat_disappearedProducts: { type: Number },
      medianPricePerCarat_disappearedProducts: { type: Number },
      date: { type: String, required: true }
    }],
    demandByShape: [{
      shape: { type: String, required: true },
      disappeared: { type: Number, required: true }
    }],
    demandByWeight: [{
      weight: { type: String, required: true },
      disappeared: { type: Number, required: true }
    }],
    demandByClarity: [{
      clarity: { type: String, required: true },
      disappeared: { type: Number, required: true }
    }],
    demandByColor: [{
      color: { type: String, required: true },
      disappeared: { type: Number, required: true }
    }]
  },
  
  supplyInsights: { type: Schema.Types.Mixed, default: () => ({ productionOpportunities: [], profitabilityAnalysis: [] }) },
  
  priceTrends: {
    newArrivals: {
      last24h: { type: Number, required: true },
      last72h: { type: Number, required: true }
    },
    priceDynamics: [{
      shape: { type: String, required: true },
      avgPriceLast7Days: { type: Number, required: true },
      priceChangePercent: { type: Number, required: true },
      trend: { type: String, enum: ['Bullish', 'Bearish', 'Neutral'], required: true }
    }]
  }
}, {
  timestamps: true
});

// Индексы для быстрого поиска
AnalyticsDataSchema.index({ period: 1, endDate: -1 });
AnalyticsDataSchema.index({ startDate: 1, endDate: 1 });
AnalyticsDataSchema.index({ generatedAt: -1 });

export const AnalyticsData = mongoose.model<IAnalyticsData>('AnalyticsData', AnalyticsDataSchema);
