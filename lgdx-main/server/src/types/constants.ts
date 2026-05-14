export const DEAL_STAGES = {
  REQUEST: 'request',
  PAYMENT_DELIVERY: 'payment_delivery',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const;

export const DEAL_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  NEGOTIATING: 'negotiating',
  TERMS_PROPOSED: 'terms_proposed',
  SELLER_COUNTER_OFFER: 'seller_counter_offer',
  SELLER_FINAL_OFFER: 'seller_final_offer',
  TERMS_ACCEPTED: 'terms_accepted',
  AWAITING_INVOICE: 'awaiting_invoice',
  INVOICE_PENDING: 'invoice_pending',
  INVOICE_ACCEPTED: 'invoice_accepted',
  AWAITING_PAYMENT: 'awaiting_payment',
  ALTERNATIVE_PRODUCT_PROPOSED: 'alternative_product_proposed',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_RECEIVED: 'payment_received',
  AWAITING_SHIPPING_DOCUMENTS: 'awaiting_shipping_documents',
  SHIPPING_DOCUMENTS_UPLOADED: 'shipping_documents_uploaded',
  SHIPPED: 'shipped',
  DELIVERY_CONFIRMED: 'delivery_confirmed',
  COMPLETED: 'completed',
  // LGDEAL Internal Workflow statuses
  ASSIGNED_TO_MANAGER: 'assigned_to_manager',
  QUALITY_CHECK_IN_PROGRESS: 'quality_check_in_progress',
  QUALITY_APPROVED: 'quality_approved',
  QUALITY_REJECTED: 'quality_rejected', // Возврат на request: супервайзер выбирает альтернативу (оплата уже получена)
  READY_FOR_SHIPPING: 'ready_for_shipping'
} as const;

export const DEAL_ACTIONS = {
  APPROVE_REQUEST: 'approve_request',
  REJECT_REQUEST: 'reject_request',
  CANCEL_DEAL: 'cancel_deal',
  REJECT_INVOICE: 'reject_invoice',
  ACCEPT_INVOICE: 'accept_invoice',
  RECALL_INVOICE: 'recall_invoice',
  CONFIRM_PAYMENT: 'confirm_payment',
  CONFIRM_DELIVERY: 'confirm_delivery',
  UPLOAD_INVOICE: 'upload_invoice',
  ADD_TRACKING_NUMBER: 'add_tracking_number',
  UPLOAD_SHIPPING_DOCUMENTS: 'upload_shipping_documents',
  SELECT_ALTERNATIVE_PRODUCT: 'select_alternative_product',
  ACCEPT_ALTERNATIVE_PRODUCT: 'accept_alternative_product',
  REJECT_ALTERNATIVE_PRODUCT: 'reject_alternative_product',
  // LGDEAL Internal Workflow actions
  ASSIGN_TO_MANAGER: 'assign_to_manager',
  REASSIGN_MANAGER: 'reassign_manager',
  STONE_RECEIVED: 'stone_received',
  APPROVE_QUALITY: 'approve_quality',
  REJECT_QUALITY: 'reject_quality',
  ASSIGN_TO_LOGIST: 'assign_to_logist'
} as const;

export const ACTIVITY_LOG_ACTIONS = {
  MESSAGE_SENT: 'message_sent',
  INVOICE_ACCEPTED: 'invoice_accepted',
  INVOICE_RECALLED: 'invoice_recalled',
  PAYMENT_VERIFIED: 'payment_verified',
  DELIVERY_CONFIRMED: 'delivery_confirmed',
  SHIPPING_DOCS_UPLOADED: 'shipping_docs_uploaded',
  TRACKING_ADDED: 'tracking_added',
  ALTERNATIVE_PRODUCT_PROPOSED: 'alternative_product_proposed',
  ALTERNATIVE_PRODUCT_ACCEPTED: 'alternative_product_accepted',
  ALTERNATIVE_PRODUCT_REJECTED: 'alternative_product_rejected',
} as const;

// Type exports
export type DealStage = typeof DEAL_STAGES[keyof typeof DEAL_STAGES];
export type DealStatus = typeof DEAL_STATUSES[keyof typeof DEAL_STATUSES];
export type DealAction = typeof DEAL_ACTIONS[keyof typeof DEAL_ACTIONS];
export type ActivityLogAction = typeof ACTIVITY_LOG_ACTIONS[keyof typeof ACTIVITY_LOG_ACTIONS]; 