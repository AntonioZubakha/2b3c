import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
  _id: mongoose.Types.ObjectId;
  certificateNumber: string;
  carat: number;
  shape: string;
  clarity: string;
  color: string;
  price: number;
  pricePerCarat: number;
  marketPrice: number;
  marketPricePerCarat: number;
  status: string;
  onDeal: boolean;
  sold: boolean;
  createdAt: Date;
  updatedAt: Date;
  company: mongoose.Types.ObjectId;
  certificateInstitute: string;
  crownHeight: number;
  culet: string;
  cut: string;
  dealId: mongoose.Types.ObjectId | null;
  fluorescence: string;
  girdle: string;
  ha: string;
  id: string;
  intensity: string;
  link: string;
  location: string;
  measurement1: number;
  measurement2: number;
  measurement3: number;
  overtone: string;
  pavilionDepth: number;
  photo: string;
  polish: string;
  ratio: number;
  sku: string;
  stoneType: string;
  symmetry: string;
  tableSize: number;
  technology: string;
  totalDepth: number;
  video: string;
  weight: string;
}

const productSchema = new Schema<IProduct>({
  certificateNumber: { type: String, required: true },
  carat: { type: Number, required: true },
  shape: { type: String, required: true },
  clarity: { type: String, required: true },
  color: { type: String, required: true },
  price: { type: Number, required: true },
  pricePerCarat: { type: Number, required: true },
  marketPrice: { type: Number, required: true },
  marketPricePerCarat: { type: Number, required: true },
  status: { type: String, required: true },
  onDeal: { type: Boolean, default: false },
  sold: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  company: { type: Schema.Types.ObjectId, ref: 'Company' },
  certificateInstitute: { type: String, required: true },
  crownHeight: { type: Number, required: true },
  culet: { type: String, default: '' },
  cut: { type: String, default: '' },
  dealId: { type: Schema.Types.ObjectId, ref: 'Deal', default: null },
  fluorescence: { type: String, default: 'NONE' },
  girdle: { type: String, default: '' },
  ha: { type: String, default: 'no' },
  id: { type: String, required: true },
  intensity: { type: String, default: '' },
  link: { type: String, default: '' },
  location: { type: String, required: true },
  measurement1: { type: Number, required: true },
  measurement2: { type: Number, required: true },
  measurement3: { type: Number, required: true },
  overtone: { type: String, default: '' },
  pavilionDepth: { type: Number, required: true },
  photo: { type: String, default: '' },
  polish: { type: String, required: true },
  ratio: { type: Number, required: true },
  sku: { type: String, required: true },
  stoneType: { type: String, required: true },
  symmetry: { type: String, required: true },
  tableSize: { type: Number, required: true },
  technology: { type: String, required: true },
  totalDepth: { type: Number, required: true },
  video: { type: String, default: '' },
  weight: { type: String, default: '' }
}, {
  timestamps: true,
  collection: 'products'
});

export const Product = mongoose.model<IProduct>('Product', productSchema);
