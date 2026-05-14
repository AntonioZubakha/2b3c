import { Types } from 'mongoose';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { IDeal, IProduct } from '../../../types';
import { UserRole, processProductsOnDealEnd, cancelAllRelatedDeals } from '../helpers';
import { DEAL_STATUSES, DEAL_STAGES } from '../../../types/constants';
import { setDealReason } from '../../../utils/dealReasonUtils';
import { extractObjectId } from '../../../types/mongoose-helpers';
import { notificationService } from '../../../services/notificationService';
import { logger } from '../../../utils/logger';

export class RejectAlternativeProductCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { userId } = req.user!;
        const { rejectionReason } = req.body;

        // Authorization: only buyer can reject
        if (currentUserRole !== 'buyer') {
            throw new ActionError('Not authorized to reject the alternative product.', 403);
        }
        
        if (deal.status !== DEAL_STATUSES.ALTERNATIVE_PRODUCT_PROPOSED) {
            throw new ActionError('Can only reject when an alternative product is proposed.');
        }

        const dealProductItem = deal.products.find(p => p.selectedAlternativeProduct);

        if (!dealProductItem || !dealProductItem.originalProductDetailsBeforeSwap || typeof dealProductItem.originalPriceBeforeSwap !== 'number') {
            throw new ActionError('Cannot reject, no alternative seems to be selected or original data is missing.', 400);
        }

        // --- Revert product and price logic ---
        const priceOfRejectedAlternative = dealProductItem.price || 0;
        const originalPrice = dealProductItem.originalPriceBeforeSwap;

        deal.amount = (deal.amount || 0) - priceOfRejectedAlternative + originalPrice;
        if (deal.negotiationDetails?.finalTerms) {
            deal.negotiationDetails.finalTerms.price = (deal.negotiationDetails.finalTerms.price || 0) - priceOfRejectedAlternative + originalPrice;
        }

        // Revert product details in the deal
        dealProductItem.product = extractObjectId(dealProductItem.originalProductDetailsBeforeSwap) || new Types.ObjectId();
        dealProductItem.price = dealProductItem.originalPriceBeforeSwap;
        
        // Clean up swap-related fields
        dealProductItem.selectedAlternativeProduct = undefined;

        // Revert deal status to pending, allowing supervisor to act again.
        deal.status = DEAL_STATUSES.PENDING;
        // Stage remains 'request'
        
        // Remove active purchase deal ID, as we reverted the selection
        deal.set('activePurchaseDealId', undefined);

        // Notify seller/LGDEAL that buyer rejected the alternative
        try {
            const reasonText = rejectionReason ? ` Reason: ${rejectionReason}` : '';
            await notificationService.notifyCounterparty(
                deal,
                req.user!.userId,
                'alternative_rejected',
                'Alternative Product Rejected',
                `The buyer has rejected the alternative product for deal #${deal.dealNumber}.${reasonText}`,
                'high'
            );
        } catch (error) {
            logger.error('[RejectAlternativeProductCommand] Failed to send notification', { error });
        }

        const reasonText = rejectionReason ? ` Reason: ${rejectionReason}` : '';
        const activityLogDetails = `Buyer rejected the alternative product proposal.${reasonText} Deal returned to pending state.`;
        
        return { activityLogDetails };
    }
} 