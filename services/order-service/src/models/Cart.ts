import mongoose, { Schema, Document } from 'mongoose';
import { ICart } from '@stonee/shared-types';

export interface ICartDocument extends ICart, Document {}

const CartItemSchema = new Schema({
  type: { type: String, enum: ['diamond', 'setting', 'jewelry', 'bespoke'], required: true },
  productId: { type: String, required: true },
  bespokePair: {
    diamondId: { type: String },
    settingId: { type: String }
  },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 1 }
});

const CartSchema: Schema = new Schema({
  userId: { type: String, required: false }, // Optional for guests
  sessionId: { type: String, required: true, unique: true },
  items: [CartItemSchema],
  totalAmount: { type: Number, default: 0 }
}, { timestamps: true });

export const Cart = mongoose.model<ICartDocument>('Cart', CartSchema);
