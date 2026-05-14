/**
 * Notification types — must stay in sync with server/src/models/Notification.ts
 */

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
  // Deal Flow
  | 'deal_created'
  | 'request_approved'
  | 'request_rejected'
  | 'invoice_uploaded'
  | 'invoice_accepted'
  | 'invoice_rejected'
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

export interface Notification {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  dealId?: string;
  dealNumber?: string;
  priority: NotificationPriority;
  read: boolean;
  readAt?: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
}

export interface NotificationsResponse {
  success: boolean;
  notifications: Notification[];
  total: number;
  unreadCount: number;
}

export interface UnreadNotificationsResponse {
  success: boolean;
  notifications: Notification[];
  count: number;
}

export interface UnreadCountResponse {
  success: boolean;
  count: number;
}

export interface MarkAsReadResponse {
  success: boolean;
  message: string;
}

export interface MarkAllAsReadResponse {
  success: boolean;
  message: string;
  count: number;
}
