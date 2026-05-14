import mongoose, { Document, Schema } from 'mongoose';

export interface IProductCategoryStats extends Document {
  date: Date;
  shape: string;
  weight: string;
  clarity: string;
  color: string;
  count: number;
  marketPricePerCarat: number;
  avgPricePerCarat: number;
  medianPricePerCarat: number;
  goldPrice?: number;
  oilPrice?: number;
  inrUsdRate?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ProductCategoryStatsSchema = new Schema<IProductCategoryStats>({
  date: {
    type: Date,
    required: true,
    index: true
  },
  shape: {
    type: String,
    required: true,
    index: true
  },
  weight: {
    type: String,
    required: true,
    index: true
  },
  clarity: {
    type: String,
    required: true,
    index: true
  },
  color: {
    type: String,
    required: true,
    index: true
  },
  count: {
    type: Number,
    required: true,
    default: 0
  },
  marketPricePerCarat: {
    type: Number,
    required: true,
    min: 0
  },
  avgPricePerCarat: {
    type: Number,
    required: true,
    min: 0
  },
  medianPricePerCarat: {
    type: Number,
    required: true,
    min: 0
  },
  goldPrice: {
    type: Number,
    min: 0
  },
  oilPrice: {
    type: Number,
    min: 0
  },
  inrUsdRate: {
    type: Number,
    min: 0
  }
}, {
  timestamps: true
});

// Составной индекс для быстрого поиска по категории
ProductCategoryStatsSchema.index({ shape: 1, weight: 1, clarity: 1, color: 1 });

export const ProductCategoryStats = mongoose.model<IProductCategoryStats>('ProductCategoryStats', ProductCategoryStatsSchema);
