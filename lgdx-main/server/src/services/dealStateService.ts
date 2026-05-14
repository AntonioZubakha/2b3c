import { IDeal, IUser } from '../types';
import { determineUserRole, getAllowedActions, UserRole } from '../controllers/deal/helpers';
import { DEAL_STATUSES, DEAL_STAGES } from '../types/constants';
import { extractObjectId, toObjectIdString, isPopulated } from '../types/mongoose-helpers';

export interface ProductStatusInfo {
  productId: string;
  status: 'selected' | 'pending' | 'available' | 'not_confirmed' | 'completed_not_found' | 'pending_approval' | 'not_available' | 'error';
  displayStatus: string;
  canSelect: boolean;
  purchaseShippingCost?: number;
  saleShippingCost?: number;
}



export interface DealStateInfo {
  userRole: UserRole;
  allowedActions: string[];
  isDirectLgdealDeal: boolean;
  productStatuses: ProductStatusInfo[];
  waitingMessage: string;
}

export class DealStateService {
  
  /**
   * Get comprehensive state information for a deal
   * @param managersCount Optional: pre-fetched LGDEAL managers count for reassign_manager visibility
   */
  public async getDealStateInfo(
    deal: IDeal, 
    userId: string, 
    companyId?: string, 
    isLgdealSupervisor: boolean = false,
    managersCount?: number
  ): Promise<DealStateInfo> {
    const isDirectLgdealDeal = deal.dealType === 'buyer-to-lgdeal' && (!deal.pairedDealIds || deal.pairedDealIds.length === 0);
    const userRole = determineUserRole(deal, userId, companyId, isLgdealSupervisor, isDirectLgdealDeal);
    const allowedActions = await getAllowedActions(deal, userRole, isDirectLgdealDeal, managersCount);
    
    const productStatuses = await this.getProductStatuses(deal);
    const waitingMessage = this.getWaitingMessage(deal, userRole);
    
    return {
      userRole,
      allowedActions,
      isDirectLgdealDeal,
      productStatuses,
      waitingMessage
    };
  }

  /**
   * Get status information for all products in a deal (main + alternatives).
   * Processes EVERY entry in deal.products, not just the first one.
   */
  public async getProductStatuses(deal: IDeal): Promise<ProductStatusInfo[]> {
    if (!deal.products || deal.products.length === 0) {
      return [];
    }

    // Import Deal model dynamically to avoid circular dependencies
    const { default: DealModel } = await import('../models/Deal');

    const allStatuses: ProductStatusInfo[] = [];

    // Sale shipping cost (LGD → Buyer) lives on the main buyer deal itself
    const saleShippingCost = deal.shippingDetails?.cost ?? 0;

    // Purchase shipping cost (Supplier → LGD) comes from activePurchaseDealId when present
    let activePurchaseShippingCost = 0;
    if (deal.activePurchaseDealId) {
      const activePurchaseDeal = await DealModel
        .findById(deal.activePurchaseDealId)
        .select('shippingDetails')
        .lean();
      activePurchaseShippingCost = activePurchaseDeal?.shippingDetails?.cost ?? 0;
    }

    for (const item of deal.products) {
      const mainProductId = toObjectIdString(item.product) || '';

      // Fallback purchase cost for items without an active purchase deal
      let purchaseShippingCost = activePurchaseShippingCost;
      if (!deal.activePurchaseDealId) {
        // `item.product` can be null/undefined for legacy or partially-deleted product references.
        // In that case we cannot resolve original paired deal by product id — fall back to 0.
        const productRef =
          item.product && typeof item.product === 'object' && '_id' in (item.product as object)
            ? (item.product as { _id?: unknown })._id ?? item.product
            : item.product;
        if (!productRef) {
          purchaseShippingCost = 0;
          // still continue building statuses for UI consistency
        } else {
        const originalPairedDeal = await DealModel
          .findOne({
            dealType: 'lgdeal-to-seller',
            'products.product': productRef,
          })
          .select('shippingDetails')
          .lean();
        purchaseShippingCost = originalPairedDeal?.shippingDetails?.cost ?? 0;
        }
      }

      const isSelectedAlternative = !!item.selectedAlternativeProduct;
      allStatuses.push({
        productId: mainProductId,
        status: 'selected',
        displayStatus: isSelectedAlternative ? 'Selected Alternative' : 'Main Product',
        canSelect: true,
        purchaseShippingCost,
        saleShippingCost,
      });

      // Alternatives for this product item
      for (const alternative of item.suggestedAlternatives ?? []) {
        if (!alternative.product) continue;

        const altProductIdStr = (alternative.product as { _id?: unknown })._id?.toString()
          ?? toObjectIdString(alternative.product)
          ?? '';

        if (!altProductIdStr) continue;

        const pairedDeal = alternative.pairedLgdealToSellerDealId;

        if (pairedDeal && isPopulated<IDeal>(pairedDeal)) {
          const isApproved = pairedDeal.stage === 'payment_delivery' || pairedDeal.status === 'awaiting_invoice';
          const altPurchaseCost = pairedDeal.shippingDetails?.cost ?? 0;

          allStatuses.push({
            productId: altProductIdStr,
            status: isApproved ? 'available' : 'pending_approval',
            displayStatus: isApproved ? 'Available' : 'Awaiting Approval',
            canSelect: isApproved,
            purchaseShippingCost: altPurchaseCost,
          });
        } else {
          allStatuses.push({
            productId: altProductIdStr,
            status: 'pending',
            displayStatus: 'Pending',
            canSelect: false,
            purchaseShippingCost: 0,
          });
        }
      }
    }

    return allStatuses;
  }



  /**
   * Check if a specific product is currently selected
   */
  public isProductSelected(deal: IDeal, productId: string, itemIndex: number): boolean {
    const item = deal.products?.[itemIndex];
    
    if (!item || !item.product || !item.product._id) {
      return false;
    }
    
    // Check if this is the currently active main product
    const isCurrentMainProduct = item.product._id.toString() === productId;
    
    // Check if this is a selected alternative that became the main product
    if (item.selectedAlternativeProduct) {
      const selectedAltId = typeof item.selectedAlternativeProduct === 'string'
        ? item.selectedAlternativeProduct
        : item.selectedAlternativeProduct._id?.toString();
      
      return selectedAltId === productId;
    }
    
    return isCurrentMainProduct;
  }

  /**
   * Get waiting message for deal based on status and user role.
   * Covers all statuses including LGDEAL Internal Workflow statuses.
   */
  public getWaitingMessage(deal: IDeal, userRole?: UserRole): string {
    if (!deal) return 'Loading deal information...';

    const isLgdealRole = userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role'
      || userRole === 'LGDEAL buyer' || userRole === 'LGDEAL manager' || userRole === 'LGDEAL logist';
    const isBuyer = userRole === 'buyer' || userRole === 'LGDEAL buyer';
    const isSeller = userRole === 'seller' || userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role';

    switch (deal.status) {
      // ── Request stage ──────────────────────────────────────────────
      case DEAL_STATUSES.PENDING:
        return isSeller
          ? 'Waiting for you to approve or reject this request'
          : 'Waiting for seller to approve your request';

      case DEAL_STATUSES.ALTERNATIVE_PRODUCT_PROPOSED:
        return isBuyer
          ? 'An alternative product has been proposed. Please review it.'
          : 'Waiting for the buyer to accept or reject the alternative product proposal.';

      case DEAL_STATUSES.QUALITY_REJECTED:
        return userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role'
          ? 'Quality check failed. Please select an alternative product and assign to manager.'
          : userRole === 'buyer'
            ? 'The product did not pass quality check. We are selecting an alternative for you.'
            : 'Quality rejected. Awaiting supervisor to select alternative product.';

      // ── Payment / Delivery stage ────────────────────────────────────
      case DEAL_STATUSES.AWAITING_INVOICE:
        return isSeller
          ? 'Please upload an invoice to proceed'
          : 'Waiting for seller to upload invoice';

      case DEAL_STATUSES.INVOICE_PENDING:
        return isBuyer
          ? 'Please review and accept the invoice'
          : 'Waiting for buyer to accept invoice';

      case DEAL_STATUSES.INVOICE_ACCEPTED:
        return 'Invoice accepted. Awaiting payment.';

      case DEAL_STATUSES.AWAITING_PAYMENT:
        return isSeller
          ? 'Waiting for buyer to complete payment'
          : 'Please complete payment to proceed';

      case DEAL_STATUSES.PAYMENT_PENDING:
        return isBuyer
          ? 'Your payment is being processed'
          : 'Waiting for buyer payment to clear';

      case DEAL_STATUSES.PAYMENT_RECEIVED:
        if (userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role') {
          return 'Payment received. Please assign deal to a manager for quality check.';
        }
        if (userRole === 'buyer') return 'Payment confirmed. Awaiting shipment preparation.';
        return 'Payment received. Preparing for shipment.';

      // ── LGDEAL Internal Workflow statuses ───────────────────────────
      case DEAL_STATUSES.ASSIGNED_TO_MANAGER:
        return userRole === 'LGDEAL manager'
          ? 'Deal assigned to you. Please confirm receipt of the stone.'
          : userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role'
            ? 'Deal assigned to manager. Awaiting stone receipt confirmation.'
            : 'Your order is being processed by our quality team.';

      case DEAL_STATUSES.QUALITY_CHECK_IN_PROGRESS:
        return userRole === 'LGDEAL manager'
          ? 'Please complete the quality inspection and approve or reject.'
          : userRole === 'buyer'
            ? 'Your stone is undergoing quality inspection.'
            : 'Quality inspection in progress.';

      case DEAL_STATUSES.QUALITY_APPROVED:
        return userRole === 'LGDEAL manager'
          ? 'Quality approved. Please assign to logist for shipping.'
          : userRole === 'buyer'
            ? 'Quality approved. Your order is being prepared for shipping.'
            : 'Quality approved. Awaiting logist assignment.';

      case DEAL_STATUSES.READY_FOR_SHIPPING:
        return userRole === 'LGDEAL logist'
          ? 'Please arrange shipping and add a tracking number.'
          : userRole === 'buyer'
            ? 'Your order is ready and will be shipped soon.'
            : 'Ready for shipping. Awaiting logist to add tracking number.';

      // ── Shipping / Delivery ─────────────────────────────────────────
      case DEAL_STATUSES.AWAITING_SHIPPING_DOCUMENTS:
        return isSeller
          ? 'Please upload shipping documents'
          : 'Waiting for shipping documents';

      case DEAL_STATUSES.SHIPPING_DOCUMENTS_UPLOADED:
        return isSeller
          ? 'Shipping documents uploaded. Ready to ship.'
          : 'Shipping documents received. Awaiting shipment.';

      case DEAL_STATUSES.SHIPPED:
        return isBuyer
          ? 'Your order has been shipped. Please confirm delivery when received.'
          : 'Waiting for buyer to confirm delivery';

      case DEAL_STATUSES.DELIVERY_CONFIRMED:
        return 'Delivery confirmed. Finalising the deal.';

      // ── Terminal statuses ───────────────────────────────────────────
      case DEAL_STATUSES.COMPLETED:
        return 'Deal completed successfully.';

      case DEAL_STATUSES.CANCELLED:
        return 'Deal has been cancelled.';

      case DEAL_STATUSES.REJECTED:
        return 'Deal has been rejected.';

      default:
        return 'Processing...';
    }
  }
} 