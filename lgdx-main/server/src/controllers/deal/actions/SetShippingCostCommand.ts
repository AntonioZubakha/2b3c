import { ICommand, ActionRequest, ActionError } from './command.interface';
import { IDeal, IShippingDetails } from '../../../types';
import { UserRole } from '../helpers';
import { DEAL_STATUSES } from '../../../types/constants';
import { logger } from '../../../utils/logger';
import { notificationService } from '../../../services/notificationService';

export class SetShippingCostCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { shippingCost } = req.body;
        
        logger.info('[SetShippingCostCommand] Starting execution', {
            dealId: deal._id,
            dealType: deal.dealType,
            dealNumber: deal.dealNumber,
            stage: deal.stage,
            currentShippingCost: deal.shippingDetails?.cost,
            newShippingCost: shippingCost,
            currentAmount: deal.amount
        });
        
        // Authorization: any seller-type role can set shipping cost on their deals.
        if (currentUserRole !== 'seller' && currentUserRole !== 'LGDEAL seller' && currentUserRole !== 'LGDEAL dual-role') {
            throw new ActionError('Not authorized to set shipping cost.', 403);
        }
        
        // Business logic: shipping cost may be (re)set during:
        //   1. the 'request' stage (initial setup), or
        //   2. the 'payment_delivery' stage when the invoice has not been issued yet
        //      (status = 'awaiting_invoice'), e.g. after the seller recalled the invoice
        //      or the buyer rejected it and the seller needs to adjust pricing before
        //      re-issuing.
        const isRequestStage = deal.stage === 'request';
        const isPreInvoiceStage = deal.stage === 'payment_delivery'
            && deal.status === DEAL_STATUSES.AWAITING_INVOICE;
        if (!isRequestStage && !isPreInvoiceStage) {
            throw new ActionError(
                `Shipping cost can only be set during the 'request' stage or before an invoice is issued in 'payment_delivery'.`,
                400
            );
        }
        
        if (typeof shippingCost !== 'number' || shippingCost < 0) {
            throw new ActionError('A valid non-negative shipping cost is required.', 400);
        }
        
        // Execute the command
        if (!deal.shippingDetails) {
            deal.shippingDetails = {} as IShippingDetails;
        }
        const oldCost = deal.shippingDetails.cost ?? 0;
        deal.shippingDetails.cost = shippingCost;
        
        // The deal's total amount should always be the sum of products and shipping.
        // To update it correctly, we subtract the old shipping cost (if it was set and added previously) and add the new one.
        const oldAmount = deal.amount || 0;
        if (typeof oldCost === 'number' && oldCost > 0) {
            deal.amount = oldAmount - oldCost + shippingCost;
        } else {
            // If there was no old cost, we just add the new one.
            // This assumes the initial `deal.amount` is just the product subtotal.
            deal.amount = oldAmount + shippingCost;
        }

        logger.info('[SetShippingCostCommand] Shipping cost updated successfully', {
            dealId: deal._id,
            dealType: deal.dealType,
            dealNumber: deal.dealNumber,
            oldCost,
            newCost: shippingCost,
            oldAmount,
            newAmount: deal.amount,
            shippingDetails: deal.shippingDetails
        });

        // Notify buyer that shipping cost has been updated
        try {
            await notificationService.notifyCounterparty(
                deal,
                req.user!.userId,
                'shipping_cost_updated',
                'Shipping Cost Updated',
                `Shipping cost for deal #${deal.dealNumber} has been ${typeof oldCost === 'number' && oldCost > 0 ? 'updated' : 'set'} to $${shippingCost.toFixed(2)}.`,
                'medium'
            );
        } catch (error) {
            logger.error('[SetShippingCostCommand] Failed to send notification', { error });
            // Don't fail the command if notification fails
        }

        const activityLogDetails = `Shipping cost ${typeof oldCost === 'number' && oldCost > 0 ? `updated from $${oldCost.toFixed(2)} to` : 'set to'} $${shippingCost.toFixed(2)}`;
        return { activityLogDetails };
    }
} 