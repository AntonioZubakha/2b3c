import mongoose, { Schema, Document, Types } from 'mongoose';

// Define interfaces
interface ICartItem extends Document {
  product: Types.ObjectId;
  quantity: number;
  dateAdded: Date;
}

export interface ICart extends Document {
  user: Types.ObjectId;
  items: ICartItem[];
  updatedAt: Date;
}

// Cart item schema
const CartItemSchema = new Schema<ICartItem>({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    default: 1,
    min: 1
  },
  dateAdded: {
    type: Date,
    default: Date.now
  }
});

// Cart schema
const CartSchema = new Schema<ICart>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [CartItemSchema],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field when cart is modified
CartSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model<ICart>('Cart', CartSchema); 