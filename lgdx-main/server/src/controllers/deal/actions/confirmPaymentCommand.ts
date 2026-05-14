import { Types } from 'mongoose';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { IDeal, IUser, ICompany } from '../../../types';
import { UserRole, determineUserRole } from '../helpers';
import { DEAL_STATUSES, ACTIVITY_LOG_ACTIONS } from '../../../types/constants';
import { logger } from '../../../utils/logger';
import Deal from '../../../models/Deal';
import { notificationService } from '../../../services/notificationService';

export class ConfirmPaymentCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { userId, companyId, isLgdealSupervisor } = req.user!;
        
        logger.info('[ConfirmPaymentCommand] Starting execution for deal:', { dealId: deal._id, dealType: deal.dealType });
        
        // Determine deal configuration
        const isDirectLgdealDeal = deal.dealType === 'buyer-to-lgdeal' && (!deal.pairedDealIds || deal.pairedDealIds.length === 0);
        
        // Authorization check - only seller (by user or company) or LGDEAL supervisor can confirm payment
        const dealSellerId = (deal.sellerId as IUser)?._id || deal.sellerId as Types.ObjectId;
        
        // Extract seller company ID string - handle both ICompany and ObjectId types
        let dealSellerCompanyIdStr: string | undefined = undefined;
        if (deal.sellerCompanyId) {
            // Check if it's an ICompany with _id property
            const companyAsICompany = deal.sellerCompanyId as ICompany;
            if ('_id' in companyAsICompany && companyAsICompany._id) {
                dealSellerCompanyIdStr = companyAsICompany._id.toString();
            } else {
                // Otherwise treat as ObjectId - use String() to bypass TypeScript's type narrowing issue
                dealSellerCompanyIdStr = String(deal.sellerCompanyId);
            }
        }
        
        const userCompanyIdStr = typeof companyId === 'string' ? companyId : (companyId ? String(companyId) : undefined);
        
        const userIsSeller = (dealSellerId && dealSellerId.toString() === userId) || 
                            (dealSellerCompanyIdStr && dealSellerCompanyIdStr === userCompanyIdStr);
        
        const isLgdealSellerRole = isLgdealSupervisor && deal.dealType === 'buyer-to-lgdeal' && !isDirectLgdealDeal;
        const isLgdealDualRoleAsSeller = isDirectLgdealDeal && isLgdealSupervisor;

        if (!userIsSeller && !isLgdealSellerRole && !isLgdealDualRoleAsSeller) {
            throw new ActionError('Not authorized to confirm payment for this deal', 403);
        }

        // Business logic validation
        if (deal.status !== DEAL_STATUSES.AWAITING_PAYMENT) {
            throw new ActionError('Payment can only be confirmed when status is awaiting_payment', 400);
        }

        // Execute the command
        deal.status = DEAL_STATUSES.PAYMENT_RECEIVED;
        
        // If this is a buyer-to-lgdeal deal, synchronize status with related lgdeal-to-seller deals
        if (deal.dealType === 'buyer-to-lgdeal') {
            logger.info('[ConfirmPaymentCommand] Syncing payment status to related lgdeal-to-seller deals');
            
            // Find all related lgdeal-to-seller deals
            const relatedDealIds: string[] = [];
            
            // Add deals from pairedDealIds
            if (deal.pairedDealIds && deal.pairedDealIds.length > 0) {
                deal.pairedDealIds.forEach(id => {
                    const dealId = (id as Types.ObjectId).toString();
                    if (dealId) relatedDealIds.push(dealId);
                });
            }
            
            // Add activePurchaseDealId if exists
            if (deal.activePurchaseDealId) {
                const activeDealId = (deal.activePurchaseDealId as Types.ObjectId).toString();
                if (activeDealId && !relatedDealIds.includes(activeDealId)) {
                    relatedDealIds.push(activeDealId);
                }
            }
            
            // Add deals from suggestedAlternatives
            if (deal.products) {
                deal.products.forEach(product => {
                    if (product.suggestedAlternatives) {
                        product.suggestedAlternatives.forEach(alt => {
                            if (alt.pairedLgdealToSellerDealId) {
                                const altDealId = (alt.pairedLgdealToSellerDealId as Types.ObjectId).toString();
                                if (altDealId && !relatedDealIds.includes(altDealId)) {
                                    relatedDealIds.push(altDealId);
                                }
                            }
                        });
                    }
                });
            }
            
            // Update related lgdeal-to-seller deals to payment_received status
            if (relatedDealIds.length > 0) {
                logger.info(`[ConfirmPaymentCommand] Updating ${relatedDealIds.length} related lgdeal-to-seller deals to payment_received`);
                
                // Обновляем статус для всех связанных lgdeal-to-seller сделок
                // которые еще не получили payment_received и не назначены менеджеру
                // ВАЖНО: Если сделка еще в стадии request, переводим ее в payment_delivery
                const dealsToUpdate = await Deal.find({
                    _id: { $in: relatedDealIds },
                    dealType: 'lgdeal-to-seller',
                    status: { $ne: DEAL_STATUSES.PAYMENT_RECEIVED },
                    assignedTo: { $exists: false }
                });
                
                let updatedCount = 0;
                for (const relatedDeal of dealsToUpdate) {
                    const updates: any = {
                        status: DEAL_STATUSES.PAYMENT_RECEIVED,
                        lastActionAt: new Date()
                    };
                    
                    // Если сделка еще в стадии request, переводим ее в payment_delivery
                    if (relatedDeal.stage === 'request') {
                        updates.stage = 'payment_delivery';
                    }
                    
                    await Deal.findByIdAndUpdate(relatedDeal._id, {
                        $set: updates,
                        $push: {
                            activityLog: {
                                action: 'payment_received_synced',
                                performedBy: new Types.ObjectId(userId),
                                details: `Payment status synchronized from buyer-to-lgdeal deal ${deal.dealNumber}`,
                                timestamp: new Date()
                            }
                        }
                    });
                    updatedCount++;
                }
                
                const updateResult = { modifiedCount: updatedCount };
                
                logger.info(`[ConfirmPaymentCommand] Updated ${updateResult.modifiedCount} related lgdeal-to-seller deals`);
            } else {
                logger.warn('[ConfirmPaymentCommand] No related lgdeal-to-seller deals found to sync');
            }
        }
        
        // Notify seller that payment has been confirmed
        try {
            await notificationService.notifyCounterparty(
                deal,
                req.user!.userId,
                'payment_confirmed',
                'Payment Confirmed',
                `Payment has been confirmed for deal #${deal.dealNumber}. Please prepare the shipment.`,
                'high'
            );
        } catch (error) {
            logger.error('[ConfirmPaymentCommand] Failed to send notification', { error });
        }
        
        const activityLogDetails = `Payment confirmed by ${currentUserRole}`;
        return { activityLogDetails };
    }
} 