import mongoose, { Document, Schema } from 'mongoose';
import { IDiamond } from '@stonee/shared-types';

export interface IDiamondDocument extends Omit<IDiamond, 'id' | 'createdAt' | 'updatedAt'>, Document {}

const DiamondSchema: Schema = new Schema(
  {
    sku: { type: String, required: true, unique: true },
    shape: { type: String, required: true },
    carat: { type: Number, required: true },
    color: { type: String, required: true },
    clarity: { type: String, required: true },
    cut: { type: String, required: true },
    lab: { type: String, required: true },
    price: { type: Number, required: true },
    availability: { 
      type: String, 
      enum: ['in-stock', 'reserved', 'sold'], 
      default: 'in-stock' 
    },
    diamondScore: { type: Number, required: false },
    dealBadge: { type: String, required: false }
  },
  { 
    strict: false, // Allow other fields from ingestion
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Performance Indexes for Search
DiamondSchema.index({ shape: 1, availability: 1 });
DiamondSchema.index({ price: 1, availability: 1 });
DiamondSchema.index({ carat: 1, availability: 1 });
DiamondSchema.index({ color: 1, clarity: 1 });
DiamondSchema.index({ diamondScore: -1 });

export default mongoose.model<IDiamondDocument>('Diamond', DiamondSchema);
