import mongoose, { Schema, Document, Types, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { IProduct } from '../types';

// Интерфейс документа продукта
export interface IProductDocument extends Omit<IProduct, 'id'>, Document {
  id: string; // Explicitly add our own id field
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
    required: true,
    min: 0
  },
  marketPrice: {
    type: Number,
    min: 0
  },
  marketPricePerCarat: {
    type: Number,
    min: 0
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
    default: ''
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
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now
  },
  isOnDealOrSold: {
    type: Boolean,
    default: false
  },
  isValidated: {
    type: Boolean,
    default: false
  },
  validatedAt: {
    type: Date
  },
  validatedBy: {
    type: String
  },

  images: [{
    type: String
  }],
  measurements: {
    length: {
      type: Number
    },
    width: {
      type: Number
    },
    height: {
      type: Number
    },
    table: {
      type: Number
    },
    depth: {
      type: Number
    },
    crownAngle: {
      type: Number
    },
    crownHeight: {
      type: Number
    },
    pavilionAngle: {
      type: Number
    },
    pavilionDepth: {
      type: Number
    },
    girdleThickness: {
      type: String
    },
    culetSize: {
      type: String
    }
  }
}, {
  timestamps: true,
  collection: 'products'
});

// Перед созданием модели регистрируем middleware для обновления дат
ProductSchema.pre('save', function(next) {
  if (this.isNew) {
    this.createdAt = new Date();
  }
  this.updatedAt = new Date();
  next();
});

// Compound indexes for efficient querying
ProductSchema.index({ company: 1, certificateNumber: 1 });
ProductSchema.index({ shape: 1, carat: 1, color: 1, clarity: 1 });
ProductSchema.index({ price: 1, carat: 1 });
ProductSchema.index({ isOnDealOrSold: 1, status: 1 });

const Product = mongoose.model<IProductDocument, IProductModel>('Product', ProductSchema);

export { IProduct };
export default Product; 