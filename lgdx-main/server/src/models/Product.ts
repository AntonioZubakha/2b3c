import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { IProduct } from '../types';

// Интерфейс документа продукта
export interface IProductDocument extends Omit<IProduct, 'id'>, Document {
  id: string; // Explicitly add our own id field
}

/**
 * IProductLean - строгий интерфейс для типизации результатов .lean() запросов
 * 
 * Не содержит index signature [key: string]: unknown, что позволяет TypeScript
 * правильно выводить типы полей при использовании .lean()
 */
export interface IProductLean {
  _id: Types.ObjectId;
  id: string;
  sku?: string;
  company: Types.ObjectId;
  companyId?: string;
  companyName?: string;
  
  // Main product fields
  stockNumber?: string;
  shape?: string;
  carat?: number;
  color?: string;
  clarity?: string;
  cut?: string;
  polish?: string;
  symmetry?: string;
  fluorescence?: string;
  certificateInstitute?: string;
  certificateNumber?: string;
  
  // Pricing
  price?: number;
  marketPrice?: number;
  marketPricePerCarat?: number;
  pricePerCarat?: number;
  discount?: number;
  
  // Measurements
  measurements?: string;
  measurement1?: number;
  measurement2?: number;
  measurement3?: number;
  ratio?: number;
  tableSize?: number;
  totalDepth?: number;
  crownHeight?: number;
  pavilionDepth?: number;
  girdle?: string;
  culet?: string;
  
  // Status
  status?: string;
  onDeal?: boolean;
  sold?: boolean;
  dealId?: Types.ObjectId;
  
  // Media
  photo?: string;
  video?: string;
  reportLink?: string;
  image360?: string;
  link?: string;
  
  // Additional info
  location?: string;
  technology?: string;
  stoneType?: string;
  overtone?: string;
  intensity?: string;
  description?: string;
  notes?: string;
  comment?: string;
  details?: string;
  ha?: string;
  lotNumber?: string;
  additionalInfo?: string;
  
  // Timestamps
  createdAt?: Date;
  updatedAt?: Date;
  lastSync?: Date;
  
  // Internal
  isNew?: boolean;
}

// Интерфейс модели продукта
export interface IProductModel extends Model<IProductDocument> {}

// Схема продукта
const ProductSchema = new Schema<IProductDocument>({
  id: {
    type: String,
    unique: true,
    required: true,
    default: () => uuidv4(),
    index: true
  },
  sku: {
    type: String,
    unique: true,
    sparse: true,
    default: () => uuidv4(),
    index: true
  },
  shape: {
    type: String,
    trim: true,
    default: ''
  },
  carat: {
    type: Number,
    default: 0
  },
  color: {
    type: String,
    trim: true,
    default: ''
  },
  stoneType: {
    type: String,
    trim: true,
    default: 'diamond'
  },
  overtone: {
    type: String,
    trim: true,
    default: ''
  },
  intensity: {
    type: String,
    trim: true,
    default: ''
  },
  clarity: {
    type: String,
    trim: true,
    default: ''
  },
  cut: {
    type: String,
    trim: true,
    default: ''
  },
  polish: {
    type: String,
    trim: true,
    default: ''
  },
  price: {
    type: Number,
    default: 0
  },
  marketPrice: {
    type: Number,
    default: 0
  },
  marketPricePerCarat: {
    type: Number,
    default: 0
  },
  pricePerCarat: {
    type: Number,
    default: 0
  },
  symmetry: {
    type: String,
    trim: true,
    default: ''
  },
  location: {
    type: String,
    trim: true,
    default: ''
  },
  technology: {
    type: String,
    trim: true,
    default: ''
  },
  photo: {
    type: String,
    trim: true,
    default: ''
  },
  video: {
    type: String,
    trim: true,
    default: ''
  },
  sold: {
    type: Boolean,
    default: false
  },
  onDeal: {
    type: Boolean,
    default: false
  },
  dealId: {
    type: Schema.Types.ObjectId,
    ref: 'Deal',
    default: null
  },
  status: {
    type: String,
    trim: true,
    default: 'available',
    enum: ['available', 'OnDeal', 'Sold', 'reserved', 'inactive']
  },
  measurement1: {
    type: Number,
    default: 0
  },
  measurement2: {
    type: Number,
    default: 0
  },
  measurement3: {
    type: Number,
    default: 0
  },
  ratio: {
    type: Number,
    default: 0
  },
  tableSize: {
    type: Number,
    default: 0
  },
  crownHeight: {
    type: Number,
    default: 0
  },
  pavilionDepth: {
    type: Number,
    default: 0
  },
  girdle: {
    type: String,
    trim: true,
    default: ''
  },
  culet: {
    type: String,
    trim: true,
    default: ''
  },
  totalDepth: {
    type: Number,
    default: 0
  },
  fluorescence: {
    type: String,
    trim: true,
    default: ''
  },
  ha: {
    type: String,
    trim: true,
    default: ''
  },
  certificateInstitute: {
    type: String,
    trim: true,
    default: ''
  },
  certificateNumber: {
    type: String,
    trim: true,
    default: '',
    index: true,
    unique: true,
    sparse: true
  },
  link: {
    type: String,
    trim: true,
    default: ''
  },
  company: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// -- Indexes --
// Index for common queries: finding products by company and status
ProductSchema.index({ company: 1, status: 1 });

// Index for finding products by certificate number and institute (key for updates)
ProductSchema.index({ certificateNumber: 1, certificateInstitute: 1 });

// Index for sorting by creation date
ProductSchema.index({ createdAt: -1 });

// -- Analytics Optimization Indexes --
// Composite index for analytics queries (status + shape)
ProductSchema.index({ status: 1, shape: 1 });

// Composite index for weight-based analytics (status + carat)
ProductSchema.index({ status: 1, carat: 1 });

// Composite index for price-based analytics (status + pricePerCarat)
ProductSchema.index({ status: 1, pricePerCarat: 1 });

// Composite index for date-based analytics (status + createdAt)
ProductSchema.index({ status: 1, createdAt: 1 });

// Marketplace read hot-path index:
// - /api/marketplace/home-stats (count by sold/onDeal/photo/price)
// - /api/marketplace/clarities (distinct clarity with same availability filter)
// Partial filter keeps index compact by indexing only products that have a non-empty photo.
ProductSchema.index(
  { sold: 1, onDeal: 1, price: 1, clarity: 1 },
  {
    name: 'idx_marketplace_public_availability_clarity',
    partialFilterExpression: {
      photo: { $exists: true, $gt: '' }
    }
  }
);

// Text index for shape search optimization
ProductSchema.index({ shape: 'text' });

// Middleware to update the 'updatedAt' field on save
ProductSchema.pre<IProductDocument>('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Создаем модель или заглушку в зависимости от наличия MongoDB
let Product: IProductModel;

if ((global as any).products !== undefined) {
  logger.info('Using in-memory Product model');
  
  // Мок-модель для хранения в памяти
  // Эта часть будет заменена в полной TypeScript реализации
  const InMemoryProduct = function(this: any, data: any) {
    Object.assign(this, data);
    this._id = new mongoose.Types.ObjectId(); // Generate a proper ObjectId
    if (!this.id) { // Ensure 'id' field is populated for the mock
      this.id = uuidv4();
    }
    
    // Initialize new fields if they don't exist
    if (this.onDeal === undefined) this.onDeal = false;
    if (this.dealId === undefined) this.dealId = null;
    if (this.status === undefined) this.status = 'available';
    
    // Рассчитываем pricePerCarat, если не указано
    if (this.pricePerCarat === undefined) {
      if (this.price && this.carat && this.carat > 0) {
        this.pricePerCarat = parseFloat((this.price / this.carat).toFixed(2));
      } else {
        this.pricePerCarat = 0;
      }
    }
  } as any;
  
  // Мок-методы для хранения в памяти
  InMemoryProduct.find = async function(filter: any = {}) {
    logger.debug('In-memory Product.find called with filter', { filter });
    
    // Filter results based on all filter criteria
    let results = [...(global as any).products];
    
    // Здесь должна быть реализация фильтрации результатов
    // Текущая реализация опущена для краткости
    
    return results;
  };
  
  InMemoryProduct.countDocuments = async function(filter: any = {}) {
    const results = await this.find(filter);
    return results.length;
  };
  
  Product = InMemoryProduct as any;
} else {
  // Если MongoDB доступна, используем обычную модель
  Product = mongoose.model<IProductDocument, IProductModel>('Product', ProductSchema);
}

export default Product; 