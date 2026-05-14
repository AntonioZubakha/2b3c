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
    index: true
  },
  avgPricePerCarat: {
    type: Number,
    required: true
  },
  medianPricePerCarat: {
    type: Number,
    required: true
  },
  goldPrice: {
    type: Number
  },
  oilPrice: {
    type: Number
  },
  inrUsdRate: {
    type: Number
  }
}, {
  timestamps: true,
  collection: 'productcategorystats'
});

// Compound index for efficient category lookups
ProductCategoryStatsSchema.index({ shape: 1, weight: 1, clarity: 1, color: 1 });
ProductCategoryStatsSchema.index({ date: 1, shape: 1, weight: 1, clarity: 1, color: 1 });

export default mongoose.model<IProductCategoryStats>('ProductCategoryStats', ProductCategoryStatsSchema);
