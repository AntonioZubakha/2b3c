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
    
    depthPercentage: { type: Number, required: true },
    tablePercentage: { type: Number, required: true },
    symmetry: { type: String, required: true },
    polish: { type: String, required: true },
    fluorescence: { type: String, required: true },
    measurements: { type: String, required: true },
    lxwRatio: { type: Number, required: true },

    lab: { type: String, required: true },
    certificateNumber: { type: String, required: true },
    certificateUrl: { type: String, required: false },
    videoUrl: { type: String, required: false },
    images: { type: [String], default: [] },

    supplierId: { type: String, required: true },
    price: { type: Number, required: true },
    supplierPrice: { type: Number, required: true },
    availability: { 
      type: String, 
      enum: ['in-stock', 'reserved', 'sold'], 
      default: 'in-stock' 
    },

    diamondScore: { type: Number, required: false },
    dealBadge: { type: String, required: false }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound indexes that match the most frequent filter+sort combinations executed by
// the catalog and search services. Covering availability first narrows the scan.
DiamondSchema.index({ availability: 1, diamondScore: -1 });   // default score sort
DiamondSchema.index({ availability: 1, price: 1 });            // price range + asc sort
DiamondSchema.index({ availability: 1, carat: 1 });            // carat range
DiamondSchema.index({ availability: 1, shape: 1, diamondScore: -1 }); // shape filter
DiamondSchema.index({ availability: 1, color: 1, clarity: 1 });       // color+clarity combo

export default mongoose.model<IDiamondDocument>('Diamond', DiamondSchema);
