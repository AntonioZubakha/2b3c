// Database models initialization - single source of truth
import mongoose from 'mongoose';

// Define the shape categories
enum ShapeCategory {
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

// Enum для весовых категорий
enum WeightCategory {
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

// Define the clarity categories
enum ClarityCategory {
  FL = 'FL',
  IF = 'IF',
  VVS1 = 'VVS1',
  VVS2 = 'VVS2',
  VS1 = 'VS1',
  VS2 = 'VS2'
}

// Define Color Categories (new)
enum ColorCategoryEnum {
  D = 'D',
  E = 'E',
  F = 'F',
  G = 'G'
  // Add 'OTHER' or similar if needed for non D-G colors
}

// Interface for individual product detail within a category stat
interface IProductDetail {
  certificateNumber: string;
  pricePerCarat: number;
}

// Interface for the category stats document
interface ICategoryStatsDocument extends mongoose.Document {
  date: Date;
  shape: ShapeCategory;
  weight: WeightCategory;
  clarity: ClarityCategory;
  color: ColorCategoryEnum;
  count: number;
  avgPricePerCarat?: number;
  medianPricePerCarat?: number;
  productDetails?: IProductDetail[]; // Added for daily diff calculation
  newProductsToday?: number; // Added
  disappearedProductsSinceYesterday?: number; // Added
  priceIncreasedCount?: number; // Added
  priceDecreasedCount?: number; // Added
  priceUnchangedCount?: number; // Added

  // New fields for average prices and market price
  avgPricePerCarat_newProducts?: number;
  avgPricePerCarat_disappearedProducts?: number;
  avgPricePerCarat_priceIncreased?: number;
  avgPricePerCarat_priceDecreased?: number;
  avgPricePerCarat_priceUnchanged?: number;
  marketPricePerCarat?: number;

  // New fields for median prices per group
  medianPricePerCarat_newProducts?: number;
  medianPricePerCarat_disappearedProducts?: number;
  medianPricePerCarat_priceIncreased?: number;
  medianPricePerCarat_priceDecreased?: number;
  medianPricePerCarat_priceUnchanged?: number;

  // New fields for economic indicators
  goldPrice?: number;
  oilPrice?: number;
  inrUsdRate?: number;

  // Smart demand analytics fields
  uniqueSalesThisPeriod?: number;
  reappearedProductsThisPeriod?: number;
  salesConfidence?: number;
  productSalesHistory?: Array<{
    certificateNumber: string;
    firstDisappearedDate: Date | null;
    lastSeenDate: Date;
    status: 'CONFIRMED_SALE' | 'REAPPEARED' | 'PENDING';
    confidence: number;
  }>;

  createdAt: Date;
  updatedAt: Date;
}

// Interface for the category stats model
interface ICategoryStatsModel extends mongoose.Model<ICategoryStatsDocument> {
  findOrCreateStats(
    date: Date, 
    shape: ShapeCategory, 
    weight: WeightCategory, 
    clarity: ClarityCategory, 
    color: ColorCategoryEnum,
    count: number,
    avgPricePerCarat?: number,
    medianPricePerCarat?: number,
    productDetails?: IProductDetail[], // Added
    newProductsToday?: number, // Added
    disappearedProductsSinceYesterday?: number, // Added
    priceIncreasedCount?: number, // Added
    priceDecreasedCount?: number, // Added
    priceUnchangedCount?: number, // Added
    // New params
    avgPricePerCarat_newProducts?: number,
    avgPricePerCarat_disappearedProducts?: number,
    avgPricePerCarat_priceIncreased?: number,
    avgPricePerCarat_priceDecreased?: number,
    avgPricePerCarat_priceUnchanged?: number,
    marketPricePerCarat?: number,
    // New median params
    medianPricePerCarat_newProducts?: number,
    medianPricePerCarat_disappearedProducts?: number,
    medianPricePerCarat_priceIncreased?: number,
    medianPricePerCarat_priceDecreased?: number,
    medianPricePerCarat_priceUnchanged?: number,
    // New economic indicators
    goldPrice?: number,
    oilPrice?: number,
    inrUsdRate?: number
  ): Promise<ICategoryStatsDocument>;
}

// Schema for the category stats
const ProductDetailSchema = new mongoose.Schema<IProductDetail>(
  {
    certificateNumber: { type: String, required: true },
    pricePerCarat: { type: Number, required: true },
  },
  { _id: false } // Important: Prevent Mongoose from creating _id for subdocuments
);

const CategoryStatsSchema = new mongoose.Schema<ICategoryStatsDocument>(
  {
    date: {
      type: Date,
      required: true,
      index: true
    },
    shape: {
      type: String,
      enum: Object.values(ShapeCategory),
      required: true,
      index: true
    },
    weight: {
      type: String,
      enum: Object.values(WeightCategory),
      required: true,
      index: true
    },
    clarity: {
      type: String,
      enum: Object.values(ClarityCategory),
      required: true,
      index: true
    },
    color: {
      type: String,
      enum: Object.values(ColorCategoryEnum),
      required: true,
      index: true
    },
    count: {
      type: Number,
      default: 0
    },
    avgPricePerCarat: {
      type: Number,
      default: 0
    },
    medianPricePerCarat: {
      type: Number,
      default: 0
    },
    productDetails: {
      type: [ProductDetailSchema],
      default: []
    },
    newProductsToday: {
      type: Number,
      default: 0
    },
    disappearedProductsSinceYesterday: {
      type: Number,
      default: 0
    },
    priceIncreasedCount: {
      type: Number,
      default: 0
    },
    priceDecreasedCount: {
      type: Number,
      default: 0
    },
    priceUnchangedCount: {
      type: Number,
      default: 0
    },
    // New schema fields
    avgPricePerCarat_newProducts: { type: Number, default: 0 },
    avgPricePerCarat_disappearedProducts: { type: Number, default: 0 },
    avgPricePerCarat_priceIncreased: { type: Number, default: 0 },
    avgPricePerCarat_priceDecreased: { type: Number, default: 0 },
    avgPricePerCarat_priceUnchanged: { type: Number, default: 0 },
    marketPricePerCarat: { type: Number, default: 0 }, // Переименовано с marketPrice
    // New schema fields for median prices per group
    medianPricePerCarat_newProducts: { type: Number, default: 0 },
    medianPricePerCarat_disappearedProducts: { type: Number, default: 0 },
    medianPricePerCarat_priceIncreased: { type: Number, default: 0 },
    medianPricePerCarat_priceDecreased: { type: Number, default: 0 },
    medianPricePerCarat_priceUnchanged: { type: Number, default: 0 },
    // New schema fields for economic indicators
    goldPrice: { type: Number, default: 0 },
    oilPrice: { type: Number, default: 0 },
    inrUsdRate: { type: Number, default: 0 },
    // Smart demand analytics schema fields
    uniqueSalesThisPeriod: { type: Number, default: 0 },
    reappearedProductsThisPeriod: { type: Number, default: 0 },
    salesConfidence: { type: Number, default: 0 },
    productSalesHistory: [{
      certificateNumber: { type: String, required: true },
      firstDisappearedDate: { type: Date, required: false },
      lastSeenDate: { type: Date, required: true },
      status: { 
        type: String, 
        enum: ['CONFIRMED_SALE', 'REAPPEARED', 'PENDING'],
        required: true 
      },
      confidence: { type: Number, required: true, min: 0, max: 1 }
    }]
  },
  {
    timestamps: true
  }
);

// Compound index for date + shape + weight + clarity + color
CategoryStatsSchema.index({ date: 1, shape: 1, weight: 1, clarity: 1, color: 1 }, { unique: true });

// Static method to find or create stats
(CategoryStatsSchema.statics as any)['findOrCreateStats'] = async function(
  date: Date,
  shape: ShapeCategory,
  weight: WeightCategory,
  clarity: ClarityCategory,
  color: ColorCategoryEnum,
  count: number,
  avgPricePerCarat?: number,
  medianPricePerCarat?: number,
  productDetails?: IProductDetail[],
  newProductsToday?: number,
  disappearedProductsSinceYesterday?: number,
  priceIncreasedCount?: number,
  priceDecreasedCount?: number,
  priceUnchangedCount?: number,
  avgPricePerCarat_newProducts?: number,
  avgPricePerCarat_disappearedProducts?: number,
  avgPricePerCarat_priceIncreased?: number,
  avgPricePerCarat_priceDecreased?: number,
  avgPricePerCarat_priceUnchanged?: number,
  marketPricePerCarat?: number,
  medianPricePerCarat_newProducts?: number,
  medianPricePerCarat_disappearedProducts?: number,
  medianPricePerCarat_priceIncreased?: number,
  medianPricePerCarat_priceDecreased?: number,
  medianPricePerCarat_priceUnchanged?: number,
  goldPrice?: number,
  oilPrice?: number,
  inrUsdRate?: number
): Promise<ICategoryStatsDocument> {

  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const query = {
    date: {
      $gte: startOfDay,
      $lte: endOfDay
    },
    shape,
    weight,
    clarity,
    color,
  };

  const update = {
    $set: {
      date: startOfDay, // Ensure the date is always the start of the day
      count,
      avgPricePerCarat,
      medianPricePerCarat,
      productDetails,
      newProductsToday,
      disappearedProductsSinceYesterday,
      priceIncreasedCount,
      priceDecreasedCount,
      priceUnchangedCount,
      avgPricePerCarat_newProducts,
      avgPricePerCarat_disappearedProducts,
      avgPricePerCarat_priceIncreased,
      avgPricePerCarat_priceDecreased,
      avgPricePerCarat_priceUnchanged,
      marketPricePerCarat,
      medianPricePerCarat_newProducts,
      medianPricePerCarat_disappearedProducts,
      medianPricePerCarat_priceIncreased,
      medianPricePerCarat_priceDecreased,
      medianPricePerCarat_priceUnchanged,
      goldPrice,
      oilPrice,
      inrUsdRate,
    }
  };

  const options = {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true
  };

  return this.findOneAndUpdate(query, update, options);
};

// Create and export the model - single source of truth
export const ProductCategoryStats: ICategoryStatsModel = (mongoose.models as any)['ProductCategoryStats'] || mongoose.model<ICategoryStatsDocument, ICategoryStatsModel>('ProductCategoryStats', CategoryStatsSchema);
