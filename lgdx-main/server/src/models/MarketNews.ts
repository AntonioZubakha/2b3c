import mongoose, { Document, Schema } from 'mongoose';

export interface IMarketNews extends Document {
  title: string;
  summary: string;
  body?: string;
  imageUrl?: string;
  imageCredit?: string;
  date: Date;
  category: string;
  impact: 'positive' | 'negative' | 'neutral';
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const MarketNewsSchema = new Schema<IMarketNews>(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    summary: { type: String, required: true, trim: true, maxlength: 2000 },
    body: { type: String, trim: true, maxlength: 100000 },
    imageUrl: { type: String, trim: true, maxlength: 2048 },
    imageCredit: { type: String, trim: true, maxlength: 500 },
    date: { type: Date, required: true, default: Date.now },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    impact: {
      type: String,
      required: true,
      enum: ['positive', 'negative', 'neutral'],
      default: 'neutral'
    },
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

MarketNewsSchema.index({ order: 1, createdAt: -1 });

export default mongoose.model<IMarketNews>('MarketNews', MarketNewsSchema);
