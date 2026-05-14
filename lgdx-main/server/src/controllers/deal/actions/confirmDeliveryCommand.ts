import { Types } from 'mongoose';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { IDeal, IUser, IShippingDetails } from '../../../types';
import { UserRole, determineUserRole, processProductsOnDealEnd } from '../helpers';
import { DEAL_STATUSES, DEAL_STAGES, ACTIVITY_LOG_ACTIONS } from '../../../types/constants';
import Deal from '../../../models/Deal';
import { logger } from '../../../utils/logger';
import { sendDealChangeNotification, sendLogistNotification } from '../../../utils/telegramBot';
import { toObjectIdString } from '../../../types/mongoose-helpers';
import { notificationService } from '../../../services/notificationService';

export class ConfirmDeliveryCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { userId, companyId, isLgdealSupervisor } = req.user!;
        
        logger.info('[ConfirmDeliveryCommand] Starting execution for deal:', { dealId: deal._id });
        
        // Determine deal configuration
        const isDirectLgdealDeal = deal.dealType === 'buyer-to-lgdeal' && (!deal.pairedDealIds || deal.pairedDealIds.length === 0);
        
        // Authorization check - only buyer can confirm delivery
        const userIsBuyer = deal.buyerId && (deal.buyerId as IUser)._id.toString() === userId;
        const isLgdealBuyerRole = isLgdealSupervisor && deal.dealType === 'lgdeal-to-seller' && !isDirectLgdealDeal;
        const isLgdealDualRoleAsBuyer = isDirectLgdealDeal && isLgdealSupervisor;

        if (!userIsBuyer && !isLgdealBuyerRole && !isLgdealDualRoleAsBuyer) {
            throw new ActionError('Not authorized to confirm delivery for this deal', 403);
        }

        // Business logic validation
        if (deal.status !== DEAL_STATUSES.SHIPPED) {
            throw new ActionError('Delivery can only be confirmed when status is shipped', 400);
        }

        // Execute the command
        deal.status = DEAL_STATUSES.COMPLETED;
        deal.stage = DEAL_STAGES.COMPLETED;
        
        // Update shipping details
        if (!deal.shippingDetails) deal.shippingDetails = {} as IShippingDetails;
        deal.shippingDetails.deliveredDate = new Date();
        deal.shippingDetails.deliveryConfirmedBy = new Types.ObjectId(userId);
        
        // Set completion timestamp
        deal.completedAt = new Date();
        
        // Process products on deal completion
        await processProductsOnDealEnd(deal, 'completed', userId);

        // Cancel unused paired lgdeal-to-seller deals if this is a buyer-to-lgdeal deal
        if (deal.dealType === 'buyer-to-lgdeal' && deal.pairedDealIds && deal.pairedDealIds.length > 0) {
            
            // First, find the product that was actually selected and sold in this deal
            const finalProduct = deal.products?.[0]?.selectedAlternativeProduct || deal.products?.[0]?.product;
            const finalProductId = toObjectIdString(finalProduct) || '';

            // Find the corresponding lgdeal-to-seller deal that should NOT be cancelled
            let successfulPairedDealId: string | null = null;
            if (finalProductId) {
                // Find which paired deal contains the final product
                for (const pairedDealIdEntry of deal.pairedDealIds) {
                    const pairedDealId = toObjectIdString(pairedDealIdEntry);
                    if (!pairedDealId) continue;
                    
                    const pairedSellerDeal = await Deal.findById(pairedDealId);
                    if (pairedSellerDeal && pairedSellerDeal.products.some(p => toObjectIdString(p.product) === finalProductId)) {
                        successfulPairedDealId = pairedDealId;
                        break;
                    }
                }
            }

            for (const pairedDealIdEntry of deal.pairedDealIds) {
                const pairedDealId = (pairedDealIdEntry as IDeal)?._id || pairedDealIdEntry as Types.ObjectId;
                
                // CRITICAL FIX: Do not cancel the deal that corresponds to the sold product
                if (pairedDealId.toString() === successfulPairedDealId) {
                    logger.debug(`[ConfirmDeliveryCommand] Skipping cancellation for successful paired deal: ${pairedDealId}`);
                    continue; // Skip this deal, it's the one we want to keep
                }

                const pairedSellerDeal = await Deal.findById(pairedDealId);
                
                if (pairedSellerDeal && pairedSellerDeal.status !== DEAL_STATUSES.COMPLETED && pairedSellerDeal.status !== DEAL_STATUSES.CANCELLED) {
                    // 🔒 OPTIMISTIC LOCKING: Use updateOne with status condition
                    const updateResult = await Deal.updateOne(
                        { 
                            _id: pairedDealId,
                            status: pairedSellerDeal.status, // ⬅️ Optimistic lock
                            stage: pairedSellerDeal.stage
                        },
                        {
                            $set: {
                                stage: DEAL_STAGES.CANCELLED,
                                status: DEAL_STATUSES.CANCELLED,
                                cancellationReason: 'Main deal completed - paired deal no longer needed'
                            },
                            $push: {
                                activityLog: {
                                    action: 'deal_cancelled',
                                    performedBy: new Types.ObjectId(userId),
                                    details: `Deal automatically cancelled because main deal #${deal.dealNumber} was completed`,
                                    timestamp: new Date()
                                }
                            }
                        }
                    );
                    
                    if (updateResult.modifiedCount > 0) {
                        logger.info('[ConfirmDeliveryCommand] Cancelled unused paired deal:', { pairedDealId });
                    } else {
                        logger.warn('[ConfirmDeliveryCommand] Failed to cancel paired deal (status changed):', { pairedDealId });
                    }
                }
            }
        }

        logger.info('[ConfirmDeliveryCommand] Command executed successfully - deal completed');
        
        // Send Telegram notification for deal completion
        try {
            sendDealChangeNotification({
                dealNumber: deal.dealNumber,
                dealId: deal._id.toString(),
                oldStatus: DEAL_STATUSES.SHIPPED,
                newStatus: DEAL_STATUSES.COMPLETED,
                oldStage: DEAL_STAGES.PAYMENT_DELIVERY,
                newStage: DEAL_STAGES.COMPLETED,
                changedBy: currentUserRole || 'Unknown',
                changeType: 'both',
                additionalInfo: 'Deal completed - delivery confirmed'
            });

            if (deal.dealType === 'buyer-to-lgdeal') {
                sendLogistNotification(`✅ Deal #${deal.dealNumber}: delivery confirmed by buyer.`);
            }
        } catch (error) {
            logger.error('[ConfirmDeliveryCommand] Failed to send deal completion notification:', { error });
        }

        // Notify seller that delivery has been confirmed
        try {
            await notificationService.notifyCounterparty(
                deal,
                req.user!.userId,
                'delivery_confirmed',
                'Delivery Confirmed',
                `The buyer has confirmed delivery for deal #${deal.dealNumber}. Deal completed successfully!`,
                'medium'
            );
        } catch (error) {
            logger.error('[ConfirmDeliveryCommand] Failed to send notification', { error });
        }
        
        const activityLogDetails = `Delivery confirmed by ${currentUserRole}`;
        return { activityLogDetails };
    }
} 