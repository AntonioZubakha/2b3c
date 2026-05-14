import { Types } from 'mongoose';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { IDeal, IProduct, IDealProduct, IUser, IShippingDetails } from '../../../types';
import { UserRole }from '../helpers';
import Deal from '../../../models/Deal';
import Product from '../../../models/Product';
import { DEAL_STATUSES } from '../../../types/constants';
import { logger } from '../../../utils/logger';
import { sendDealChangeNotification } from '../../../utils/telegramBot';
import { extractObjectId, toObjectIdString } from '../../../types/mongoose-helpers';
import { notificationService } from '../../../services/notificationService';

export class SelectAlternativeProductCommand implements ICommand {
  public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
    const { originalProductId, alternativeProductId } = req.body;
    const { userId } = req.user!;

    if (!originalProductId || !alternativeProductId) {
      throw new ActionError('Original and alternative product IDs are required.', 400);
    }
    
    // Authorization: Only LGDEAL roles should be able to do this.
    if (currentUserRole !== 'LGDEAL seller' && currentUserRole !== 'LGDEAL dual-role') {
        throw new ActionError('Not authorized to select alternative products.', 403);
    }

    // --- Begin logic adapted from stateController ---
    
    const dealProductItem = deal.products.find(p => 
        ((p.product as IProduct)?._id || p.product).toString() === originalProductId
    );

    if (!dealProductItem) {
        throw new ActionError('Original product not found in this deal.', 404);
    }

    // It's possible for a product to be deleted from the main inventory, in which case populate returns null.
    if (!dealProductItem.product) {
        throw new ActionError(`Data for original product (ID: ${originalProductId}) is missing. It may have been deleted.`, 404);
    }

    // Find the specific alternative within the suggested list
    const alternativeInfo = dealProductItem.suggestedAlternatives?.find(alt => 
        ((alt.product as IProduct)?._id || alt.product).toString() === alternativeProductId
    );

    if (!alternativeInfo) {
        throw new ActionError('Selected alternative is not a valid suggestion for this product.', 400);
    }

    // После возврата по quality_rejected нельзя снова выбрать тот же продукт, который не прошёл проверку качества
    const originalIdStr = toObjectIdString(originalProductId) ?? String(originalProductId);
    const alternativeIdStr = toObjectIdString(alternativeProductId) ?? String(alternativeProductId);
    if (deal.status === DEAL_STATUSES.QUALITY_REJECTED && originalIdStr === alternativeIdStr) {
        throw new ActionError('Cannot select the product that failed quality check. Please choose a different alternative.', 400);
    }

    // Security & Logic Check: Ensure the paired deal for the alternative has been approved by its seller.
    const pairedDealForAlternative = await Deal.findById(alternativeInfo.pairedLgdealToSellerDealId).select('status stage shippingDetails').lean();
    if (!pairedDealForAlternative) {
        throw new ActionError('Could not find the linked supplier deal for the selected alternative.', 404);
    }
    // The deal is approved once the supplier approves, moving the stage from 'request' to 'payment_delivery'.
    // We check both stage and status for consistent validation with DealStateService.
    const isApproved = pairedDealForAlternative.stage === 'payment_delivery' || pairedDealForAlternative.status === 'awaiting_invoice';
    if (!isApproved) {
        throw new ActionError('Cannot select an alternative product whose supplier deal has not been approved yet.', 400);
    }

    // Set the active purchase deal ID on the main deal to track which supplier deal is now primary.
    const activePurchaseDealId = extractObjectId(alternativeInfo.pairedLgdealToSellerDealId);
    if (activePurchaseDealId) {
      deal.set('activePurchaseDealId', activePurchaseDealId);
    }

    const alternativeProduct = await Product.findById(alternativeProductId) as IProduct;
    if (!alternativeProduct) {
        throw new ActionError('Alternative product data could not be found.', 404);
    }
    
    // Ensure the alternative product has a valid market price before proceeding.
    if (typeof alternativeProduct.marketPrice !== 'number' || alternativeProduct.marketPrice <= 0) {
        throw new ActionError('Selected alternative product does not have a valid market price.', 400);
    }
    
    const originalProduct = dealProductItem.product as IProduct;

    // If this is the first swap, preserve the very first product's details.
    if (!dealProductItem.originalProductDetailsBeforeSwap) {
        dealProductItem.originalProductDetailsBeforeSwap = { ...((originalProduct && typeof originalProduct.toObject === 'function') ? originalProduct.toObject() : originalProduct) };
        dealProductItem.originalPriceBeforeSwap = dealProductItem.price;
        dealProductItem.originalShippingCostBeforeSwap = deal.negotiationDetails?.finalTerms?.shippingCost ?? 0;
    }

    // --- Price and Shipping Cost Adjustment Logic ---
    
    const priceOfProductBeingReplaced = dealProductItem.price ?? 0;
    const newAlternativePrice = alternativeProduct.marketPrice;
    
    // To make this robust for multiple swaps, we calculate the amount WITHOUT the currently included product price,
    // and then add the new product's price. This avoids chain-calculation errors and improves readability,
    // even if the immediate mathematical result is the same as `(amount - old) + new`.
    const amountWithoutCurrentProduct = (deal.amount || 0) - priceOfProductBeingReplaced;
    deal.amount = amountWithoutCurrentProduct + newAlternativePrice;
    
    // Also update the final terms to reflect the new reality.
    if (deal.negotiationDetails?.finalTerms) {
        const finalTermsPriceWithoutCurrentProduct = (deal.negotiationDetails.finalTerms.price || 0) - priceOfProductBeingReplaced;
        deal.negotiationDetails.finalTerms.price = finalTermsPriceWithoutCurrentProduct + newAlternativePrice;
    }

    logger.info(`[SelectAlternativeProductCommand] Swapped product. Price: ${priceOfProductBeingReplaced} -> ${newAlternativePrice}. New total amount: ${deal.amount}`);

    // Update the list of suggestions: remove the new one, add the old one back.
    const updatedSuggestions = (dealProductItem.suggestedAlternatives || []).filter(
        alt => toObjectIdString(alt.product) !== alternativeProductId
    );
    // Add original product back to suggestions. We don't know its original paired deal ID here,
    // so we add it without one. This is safer than assigning an incorrect ID.
    updatedSuggestions.push({
        product: extractObjectId(originalProduct) || new Types.ObjectId()
        // DO NOT add pairedLgdealToSellerDealId from the alternative, that would be incorrect.
    });
    dealProductItem.suggestedAlternatives = updatedSuggestions;

    // Swap product details
    dealProductItem.product = extractObjectId(alternativeProduct) || new Types.ObjectId();
    dealProductItem.price = alternativeProduct.marketPrice || 0;
    dealProductItem.selectedAlternativeProduct = new Types.ObjectId(alternativeProductId) as Types.ObjectId;
    
    // CRITICAL FIX from previous step is now replaced by the reversible logic above.
    
    // --- End logic from stateController ---

    const oldStatus = deal.status;
    const isAfterQualityReject = oldStatus === DEAL_STATUSES.QUALITY_REJECTED;

    if (isAfterQualityReject) {
      // После отклонения качества: только замена продукта, статус остаётся quality_rejected.
      // Покупатель уже оплатил — не запрашиваем подтверждение, супервайзер затем назначит менеджера.
    } else {
      deal.status = DEAL_STATUSES.ALTERNATIVE_PRODUCT_PROPOSED;
    }

    try {
        sendDealChangeNotification({
            dealNumber: deal.dealNumber,
            dealId: deal._id.toString(),
            oldStatus: oldStatus,
            newStatus: deal.status,
            changedBy: 'LGDeal INC',
            changeType: 'status',
            additionalInfo: isAfterQualityReject
                ? `Alternative selected after quality rejection: ${alternativeProduct.shape || ''} ${alternativeProduct.carat || ''}ct. Buyer payment received.`
                : `Alternative product: ${alternativeProduct.shape || ''} ${alternativeProduct.carat || ''}ct`
        });
    } catch (error) {
        console.error('Failed to send alternative product notification:', error);
    }

    if (isAfterQualityReject) {
        try {
            await notificationService.notifyCounterparty(
                deal,
                req.user!.userId,
                'quality_rejected_alternative_selected',
                'Alternative Product Selected',
                `Your payment has been received. The previous product did not pass our quality check. We have selected an alternative: ${alternativeProduct.shape || ''} ${alternativeProduct.carat || ''}ct. We will verify it and proceed with shipping.`,
                'high'
            );
        } catch (error) {
            logger.error('[SelectAlternativeProductCommand] Failed to send notification', { error });
        }
        const activityLogDetails = `LGDeal INC selected alternative after quality rejection: ${alternativeProduct.shape || ''} ${alternativeProduct.carat || ''}ct. Supervisor may assign manager.`;
        return { activityLogDetails };
    }

    try {
        await notificationService.notifyCounterparty(
            deal,
            req.user!.userId,
            'alternative_proposed',
            'Alternative Product Proposed',
            `An alternative product has been proposed for deal #${deal.dealNumber}: ${alternativeProduct.shape || ''} ${alternativeProduct.carat || ''}ct. Please review and approve or reject.`,
            'high'
        );
    } catch (error) {
        logger.error('[SelectAlternativeProductCommand] Failed to send notification', { error });
    }

    const activityLogDetails = `LGDeal INC proposed an alternative product: ${alternativeProduct.shape || ''} ${alternativeProduct.carat || ''}ct. Waiting for buyer approval.`;
    return { activityLogDetails };
  }
} 