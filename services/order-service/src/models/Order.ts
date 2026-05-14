import mongoose, { Schema, Document } from 'mongoose';

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

export interface IOrderItem {
  type: 'diamond' | 'setting' | 'jewelry' | 'bespoke';
  productId: string;
  bespokePair?: {
    diamondId?: string;
    settingId?: string;
  };
  price: number;
  quantity: number;
}

export interface IOrder extends Document {
  userId: string;
  items: IOrderItem[];
  totalAmount: number;
  status: OrderStatus;
  shippingAddress: {
    fullName: string;
    addressLine1: string;
    city: string;
    country: string;
    zipCode: string;
  };
  paymentIntentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema({
  type: { type: String, enum: ['diamond', 'setting', 'jewelry', 'bespoke'], required: true },
  productId: { type: String, required: true },
  bespokePair: {
    diamondId: { type: String },
    settingId: { type: String }
  },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 1 }
});

const OrderSchema: Schema = new Schema({
  userId: { type: String, required: true },
  items: [OrderItemSchema],
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: Object.values(OrderStatus), default: OrderStatus.PENDING },
  shippingAddress: {
    fullName: String,
    addressLine1: String,
    city: String,
    country: String,
    zipCode: String
  },
  paymentIntentId: { type: String } // For Stripe integration later
}, { timestamps: true });

export const Order = mongoose.model<IOrder>('Order', OrderSchema);
