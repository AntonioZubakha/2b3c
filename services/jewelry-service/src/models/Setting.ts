import mongoose, { Schema, Document } from 'mongoose';
import { ISetting } from '@stonee/shared-types';

export interface ISettingDocument extends ISetting, Document {}

const SettingSchema: Schema = new Schema({
  sku: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  style: {
    type: String,
    enum: ['Solitaire', 'Halo', 'Pavé', 'Side-stone', 'Three-stone'],
    required: true
  },
  // Physical setting technique — see info/JEWELRY_SETTINGS.md.
  settingType: {
    type: String,
    enum: ['Prong', 'Bezel', 'Channel', 'Pavé', 'Peg', 'Screw', 'Tennis', 'Invisible'],
    required: false
  },
  // Which jewelry category the mount is built for. Defaults to 'Ring' on read if absent.
  category: {
    type: String,
    enum: ['Ring', 'Earrings', 'Necklace', 'Bracelet'],
    required: false
  },
  metal: { type: String, enum: ['Gold14K', 'Gold18K', 'Platinum'], required: true },
  color: { type: String, enum: ['Yellow', 'White', 'Rose'], required: true },
  price: { type: Number, required: true },
  compatibleShapes: [{ type: String }],
  images: [{ type: String }]
}, { timestamps: true });

export const Setting = mongoose.model<ISettingDocument>('Setting', SettingSchema);
