import mongoose, { Schema, Document } from 'mongoose';
import { IJewelry } from '@stonee/shared-types';

export interface IJewelryDocument extends IJewelry, Document {}

const JewelrySchema: Schema = new Schema({
  sku: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  collectionName: { type: String, required: true },
  category: { type: String, enum: ['Ring', 'Earrings', 'Necklace', 'Bracelet'], required: true },
  price: { type: Number, required: true },
  metal: { type: String, enum: ['Gold14K', 'Gold18K', 'Platinum'], required: true },
  color: { type: String, enum: ['Yellow', 'White', 'Rose'], required: true },
  mainStoneId: { type: Schema.Types.ObjectId, ref: 'Diamond' },
  images: [{ type: String }]
}, { timestamps: true });

export const Jewelry = mongoose.model<IJewelryDocument>('Jewelry', JewelrySchema);
