import mongoose, { Schema, Document } from 'mongoose';
import { Types } from 'mongoose';
import { IUser, IDeal } from '../types';

// Notification types для LGDEAL Internal Workflow и Deal Flow
export type NotificationType =
  // LGDEAL Internal Workflow
  | 'deal_assigned'
  | 'deal_reassigned'
  | 'quality_rejected'
  | 'alternative_auto_assigned'
  | 'no_alternatives_available'
  | 'ready_for_shipping'
  | 'stone_received'
  | 'quality_approved'
  // Deal Flow Notifications
  | 'deal_created'
  | 'request_approved'
  | 'request_rejected'
  | 'invoice_uploaded'
  | 'invoice_accepted'
  | 'invoice_rejected'
  | 'invoice_recalled'
  | 'payment_confirmed'
  | 'order_shipped'
  | 'delivery_confirmed'
  | 'alternative_proposed'
  | 'quality_rejected_alternative_selected'
  | 'alternative_accepted'
  | 'alternative_rejected'
  | 'deal_cancelled'
  | 'shipping_cost_updated'
  | 'import_tariff_updated';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

// Интерфейс для документа Notification
export interface INotification extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId | IUser; // Кому предназначено уведомление
  type: NotificationType;
  title: string;
  message: string;
  dealId?: Types.ObjectId | IDeal;
  dealNumber?: string;
  priority: NotificationPriority;
  read: boolean;
  readAt?: Date;
  actionUrl?: string; // e.g., '/deal/123456'
  actionLabel?: string; // e.g., 'View Deal'
  metadata?: Record<string, unknown>; // Дополнительные данные
  createdAt: Date;
  expiresAt: Date; // Auto-delete старых уведомлений через TTL index
}

// Схема Notification
const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: [
        // LGDEAL Internal Workflow
        'deal_assigned',
        'deal_reassigned',
        'quality_rejected',
        'alternative_auto_assigned',
        'no_alternatives_available',
        'ready_for_shipping',
        'stone_received',
        'quality_approved',
        // Deal Flow Notifications
        'deal_created',
        'request_approved',
        'request_rejected',
        'invoice_uploaded',
        'invoice_accepted',
        'invoice_rejected',
        'payment_confirmed',
        'order_shipped',
        'delivery_confirmed',
        'alternative_proposed',
        'quality_rejected_alternative_selected',
        'alternative_accepted',
        'alternative_rejected',
        'deal_cancelled',
        'shipping_cost_updated',
        'import_tariff_updated'
      ],
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true
    },
    dealId: {
      type: Schema.Types.ObjectId,
      ref: 'Deal',
      index: true
    },
    dealNumber: {
      type: String
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    },
    actionUrl: {
      type: String
    },
    actionLabel: {
      type: String
    },
    metadata: {
      type: Schema.Types.Mixed
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    expiresAt: {
      type: Date,
      // По умолчанию уведомления удаляются через 30 дней
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  },
  {
    timestamps: true // Adds createdAt and updatedAt automatically
  }
);

// Compound index для быстрого получения непрочитанных уведомлений пользователя
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// TTL index для автоматического удаления старых уведомлений
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Notification = mongoose.model<INotification>('Notification', NotificationSchema);

export default Notification;
