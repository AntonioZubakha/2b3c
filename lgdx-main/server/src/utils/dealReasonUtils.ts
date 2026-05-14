// Utility functions to handle the confusion between cancellationReason and rejectionReason
// This addresses the architectural inconsistency identified in the audit

import Deal from '../models/Deal';

type IDeal = typeof Deal.prototype;

/**
 * Gets the appropriate reason field based on deal context
 * Unifies cancellationReason vs requestDetails.rejectionReason confusion
 */
export const getDealReason = (deal: IDeal): string | undefined => {
  // For cancelled deals, use cancellationReason
  if (deal.status === 'cancelled' || deal.stage === 'cancelled') {
    return deal.cancellationReason;
  }
  
  // For rejected requests, use requestDetails.rejectionReason
  if (deal.status === 'rejected' && deal.requestDetails?.rejectionReason) {
    return deal.requestDetails.rejectionReason;
  }
  
  // For rejected invoices, use invoiceDetails.rejectionReason  
  if (deal.status === 'invoice_rejected' && deal.invoiceDetails?.rejectionReason) {
    return deal.invoiceDetails.rejectionReason;
  }
  
  // Fallback - try both fields
  return deal.cancellationReason || deal.requestDetails?.rejectionReason;
};

/**
 * Sets the appropriate reason field based on deal context and action
 */
export const setDealReason = (deal: IDeal, reason: string, context: 'cancel' | 'reject_request' | 'reject_invoice'): void => {
  switch (context) {
    case 'cancel':
      deal.cancellationReason = reason;
      break;
      
    case 'reject_request':
      if (!deal.requestDetails) {
        deal.requestDetails = {};
      }
      deal.requestDetails.rejectionReason = reason;
      break;
      
    case 'reject_invoice':
      if (!deal.invoiceDetails) {
        deal.invoiceDetails = {};
      }
      deal.invoiceDetails.rejectionReason = reason;
      break;
  }
};

/**
 * Gets user-friendly reason display text
 */
export const getDealReasonDisplay = (deal: IDeal): string => {
  const reason = getDealReason(deal);
  
  if (!reason) {
    if (deal.status === 'cancelled') {
      return 'Deal was cancelled (no reason provided)';
    }
    if (deal.status === 'rejected') {
      return 'Request was rejected (no reason provided)';
    }
    return 'No reason provided';
  }
  
  return reason;
};

/**
 * Gets the context/type of the reason
 */
export const getDealReasonContext = (deal: IDeal): 'cancel' | 'reject_request' | 'reject_invoice' | 'none' => {
  if (deal.status === 'cancelled' || deal.stage === 'cancelled') {
    return 'cancel';
  }
  
  if (deal.status === 'rejected' && deal.requestDetails?.rejectionReason) {
    return 'reject_request';
  }
  
  if (deal.status === 'invoice_rejected' && deal.invoiceDetails?.rejectionReason) {
    return 'reject_invoice';
  }
  
  return 'none';
}; 