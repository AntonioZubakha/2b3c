import mongoose, { Schema, Document } from 'mongoose';
import { Types } from 'mongoose';

// Интерфейс для чёрного списка сертификатов
export interface IBlacklistedCertificate extends Document {
  certificateNumber: string;
  reason: 'product_sold' | 'deal_cancelled' | 'duplicate' | 'other';
  dealId?: Types.ObjectId;
  addedBy: Types.ObjectId;
  addedAt: Date;
}

// Схема чёрного списка сертификатов
const BlacklistedCertificateSchema: Schema = new Schema({
  certificateNumber: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  reason: { 
    type: String, 
    enum: ['product_sold', 'deal_cancelled', 'duplicate', 'other'],
    required: true 
  },
  dealId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Deal' 
  },
  addedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  addedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true
});

export default mongoose.model<IBlacklistedCertificate>('BlacklistedCertificate', BlacklistedCertificateSchema); 