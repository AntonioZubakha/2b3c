import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Интерфейс документа продукта (точная копия с сервера)
export interface IProductDocument extends Document {
  id: string;
  sku: string;
  shape: string;
  weight: string;
  carat: number;
  color: string;
  stoneType: string;
  overtone: string;
  intensity: string;
  clarity: string;
  cut: string;
  polish: string;
  price: number;
  marketPrice: number;
  marketPricePerCarat: number;
  pricePerCarat: number;
  symmetry: string;
  location: string;
  technology: string;
  photo: string;
  video: string;
  sold: boolean;
  onDeal: boolean;
  dealId?: mongoose.Types.ObjectId;
  status: string;
  measurement1: number;
  measurement2: number;
  measurement3: number;
  ratio: number;
  tableSize: number;
  crownHeight: number;
  pavilionDepth: number;
  girdle: string;
  culet: string;
  totalDepth: number;
  fluorescence: string;
  ha: string;
  certificateInstitute: string;
  certificateNumber: string;
  link: string;
  company: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
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
  weight: {
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

// Middleware to update the 'updatedAt' field on save
ProductSchema.pre<IProductDocument>('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Создаем модель Product для микросервиса
const Product: IProductModel = mongoose.model<IProductDocument, IProductModel>('Product', ProductSchema);

export default Product; 