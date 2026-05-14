import mongoose, { Document, Schema } from 'mongoose';

export interface IProductDetail {
  certificateNumber: string;
  pricePerCarat: number;
  _id: mongoose.Types.ObjectId;
}

export interface IProductCategoryStats extends Document {
  _id: mongoose.Types.ObjectId;
  shape: string;
  weight: string;
  clarity: string;
  color: string;
  count: number;
  avgPricePerCarat: number;
  medianPricePerCarat: number;
  marketPricePerCarat: number;
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
  productDetails: IProductDetail[];
  goldPrice: number;
  oilPrice: number;
  inrUsdRate: number;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

const productDetailSchema = new Schema<IProductDetail>({
  certificateNumber: { type: String, required: true },
  pricePerCarat: { type: Number, required: true }
}, { _id: true });

const productCategoryStatsSchema = new Schema<IProductCategoryStats>({
  shape: { type: String, required: true },
  weight: { type: String, required: true },
  clarity: { type: String, required: true },
  color: { type: String, required: true },
  count: { type: Number, required: true },
  avgPricePerCarat: { type: Number, required: true },
  medianPricePerCarat: { type: Number, required: true },
  marketPricePerCarat: { type: Number, required: true },
  newProductsToday: { type: Number, default: 0 },
  disappearedProductsSinceYesterday: { type: Number, default: 0 },
  priceIncreasedCount: { type: Number, default: 0 },
  priceDecreasedCount: { type: Number, default: 0 },
  priceUnchangedCount: { type: Number, default: 0 },
  avgPricePerCarat_newProducts: { type: Number, default: 0 },
  avgPricePerCarat_disappearedProducts: { type: Number, default: 0 },
  avgPricePerCarat_priceIncreased: { type: Number, default: 0 },
  avgPricePerCarat_priceDecreased: { type: Number, default: 0 },
  avgPricePerCarat_priceUnchanged: { type: Number, default: 0 },
  medianPricePerCarat_newProducts: { type: Number, default: 0 },
  medianPricePerCarat_disappearedProducts: { type: Number, default: 0 },
  medianPricePerCarat_priceIncreased: { type: Number, default: 0 },
  medianPricePerCarat_priceDecreased: { type: Number, default: 0 },
  medianPricePerCarat_priceUnchanged: { type: Number, default: 0 },
  productDetails: [productDetailSchema],
  goldPrice: { type: Number, required: true },
  oilPrice: { type: Number, required: true },
  inrUsdRate: { type: Number, required: true },
  date: { type: Date, required: true }
}, {
  timestamps: true,
  collection: 'productcategorystats'
});

// Indexes for better performance
productCategoryStatsSchema.index({ date: 1 });
productCategoryStatsSchema.index({ shape: 1, weight: 1, clarity: 1, color: 1 });
productCategoryStatsSchema.index({ date: 1, shape: 1, weight: 1, clarity: 1, color: 1 });

// Compound index for date range queries with category filters (most used for charts)
productCategoryStatsSchema.index({
  date: 1,
  shape: 1,
  weight: 1,
  clarity: 1,
  color: 1,
  marketPricePerCarat: 1
}, {
  name: 'chart_performance_index'
});

export const ProductCategoryStats = mongoose.model<IProductCategoryStats>('ProductCategoryStats', productCategoryStatsSchema);
