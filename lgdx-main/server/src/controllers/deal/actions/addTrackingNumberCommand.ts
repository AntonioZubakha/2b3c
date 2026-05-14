import { Types } from 'mongoose';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { IDeal, IUser, ICompany, IShippingDetails } from '../../../types';
import { UserRole, determineUserRole } from '../helpers';
import { DEAL_STATUSES, ACTIVITY_LOG_ACTIONS } from '../../../types/constants';
import { logger } from '../../../utils/logger';
import { notificationService } from '../../../services/notificationService';

export class AddTrackingNumberCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { userId, companyId, isLgdealSupervisor } = req.user!;
        const { trackingNumber, carrier } = req.body;
        
        logger.info('[AddTrackingNumberCommand] Starting execution for deal:', { dealId: deal._id, trackingNumber });
        
        // Validation
        if (!trackingNumber?.trim()) {
            throw new ActionError('Tracking number is required', 400);
        }
        
        // Determine deal configuration
        const isDirectLgdealDeal = deal.dealType === 'buyer-to-lgdeal' && (!deal.pairedDealIds || deal.pairedDealIds.length === 0);
        
        // Authorization check - seller (by user or company), LGDEAL supervisor, or LGDEAL logist can add tracking number
        const dealSellerId = (deal.sellerId as IUser)?._id || deal.sellerId as Types.ObjectId;
        
        // Extract seller company ID string - handle both ICompany and ObjectId types
        let dealSellerCompanyIdStr: string | undefined = undefined;
        if (deal.sellerCompanyId) {
            // Check if it's an ICompany with _id property
            const companyAsICompany = deal.sellerCompanyId as ICompany;
            if ('_id' in companyAsICompany && companyAsICompany._id) {
                dealSellerCompanyIdStr = companyAsICompany._id.toString();
            } else {
                // Otherwise treat as ObjectId - use any to bypass TypeScript's type narrowing issue
                dealSellerCompanyIdStr = String(deal.sellerCompanyId);
            }
        }
        
        const userCompanyIdStr = typeof companyId === 'string' ? companyId : (companyId ? String(companyId) : undefined);
        
        const userIsSeller = (dealSellerId && dealSellerId.toString() === userId) || 
                            (dealSellerCompanyIdStr && dealSellerCompanyIdStr === userCompanyIdStr);
        
        const isLgdealSellerRole = isLgdealSupervisor && deal.dealType === 'buyer-to-lgdeal' && !isDirectLgdealDeal;
        const isLgdealDualRoleAsSeller = isDirectLgdealDeal && isLgdealSupervisor;
        
        // Check if user is assigned logist (only for buyer-to-lgdeal deals)
        // IMPORTANT: This is only for LGDEAL logists working on assigned deals, NOT for regular sellers
        // Logist работает с buyer-to-lgdeal сделками (продажи покупателям)
        // Он организует доставку покупателям
        const isAssignedLogist = deal.dealType === 'buyer-to-lgdeal' && 
                                 deal.assignedTo && 
                                 deal.assignedRole === 'logist' &&
                                 ((deal.assignedTo as any)._id || deal.assignedTo).toString() === userId;

        if (!userIsSeller && !isLgdealSellerRole && !isLgdealDualRoleAsSeller && !isAssignedLogist) {
            throw new ActionError('Not authorized to add tracking number for this deal', 403);
        }
        
        // Logists can only work with buyer-to-lgdeal deals
        if (isAssignedLogist && deal.dealType !== 'buyer-to-lgdeal') {
            throw new ActionError('Logists can only work with buyer-to-lgdeal deals', 400);
        }

        // Business logic validation
        // Logists can only add tracking when status is ready_for_shipping
        if (isAssignedLogist) {
            if (deal.status !== DEAL_STATUSES.READY_FOR_SHIPPING) {
                throw new ActionError('Logists can only add tracking number when deal is ready for shipping', 400);
            }
        } else {
            // Supervisors and sellers can add tracking when payment is received or shipping documents are uploaded
            if (deal.status !== DEAL_STATUSES.PAYMENT_RECEIVED && deal.status !== DEAL_STATUSES.SHIPPING_DOCUMENTS_UPLOADED) {
                throw new ActionError('Tracking number can only be added when payment is received or shipping documents are uploaded', 400);
            }
        }

        // Execute the command
        if (!deal.shippingDetails) deal.shippingDetails = {} as IShippingDetails;
        deal.shippingDetails.trackingNumber = trackingNumber.trim();
        if (carrier?.trim()) {
            deal.shippingDetails.carrier = carrier.trim();
        }
        
        // Update status to shipped
        deal.status = DEAL_STATUSES.SHIPPED;
        
        // Logist работает напрямую с buyer-to-lgdeal сделкой
        // Tracking number уже добавлен на buyer-to-lgdeal сделке
        // Синхронизация не требуется
        
        // Notify buyer that order has been shipped
        try {
            const carrierText = carrier?.trim() ? ` via ${carrier.trim()}` : '';
            await notificationService.notifyCounterparty(
                deal,
                req.user!.userId,
                'order_shipped',
                'Order Shipped',
                `Your order (deal #${deal.dealNumber}) has been shipped${carrierText}. Tracking number: ${trackingNumber}`,
                'high'
            );
        } catch (error) {
            logger.error('[AddTrackingNumberCommand] Failed to send notification', { error });
        }
        
        const carrierText = carrier?.trim() ? ` via ${carrier.trim()}` : '';
        const activityLogDetails = `Tracking number ${trackingNumber}${carrierText} added by ${currentUserRole}`;
        return { activityLogDetails };
    }
} 