import mongoose, { Types } from "mongoose";
import { IDeal, DealStage, DealStatus, IActivityLog, IUser } from "../../../types";
import { processProductsOnDealEnd, cancelAllRelatedDeals } from '../helpers';
import Deal from "../../../models/Deal";
import { ICommand, ActionRequest, ActionError } from "./command.interface";
import { UserRole } from "../helpers";
import { setDealReason } from '../../../utils/dealReasonUtils';
import { sendDealChangeNotification } from '../../../utils/telegramBot';
import { notificationService } from '../../../services/notificationService';
import { logger } from '../../../utils/logger';

export class CancelDealCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { userId } = req.user!;
        const { rejectionReason } = req.body;

        if (deal.status === 'completed' || deal.status === 'cancelled') {
            throw new ActionError('Deal is already completed or cancelled.');
        }

        const previousStage = deal.stage;
        const previousStatus = deal.status;

        deal.stage = 'cancelled' as DealStage;
        deal.status = 'cancelled' as DealStatus;
        
        // Add cancellation reason using unified utility
        if (rejectionReason) {
            setDealReason(deal, rejectionReason, 'cancel');
        }
        
        const reasonText = rejectionReason ? ` Reason: ${rejectionReason}` : '';
        const activityLogDetails = `Deal cancelled by ${currentUserRole}. Was in stage: ${previousStage}, status: ${previousStatus}.${reasonText}`;

        // Process products for the main deal being cancelled
        await processProductsOnDealEnd(deal, 'cancelled', userId);

        // Find and cancel ALL related deals using the shared helper function
        await cancelAllRelatedDeals(deal, userId, rejectionReason);
        
        // Send Telegram notification for deal cancellation
        try {
            sendDealChangeNotification({
                dealNumber: deal.dealNumber,
                dealId: deal._id.toString(),
                oldStatus: previousStatus,
                newStatus: 'cancelled',
                oldStage: previousStage,
                newStage: 'cancelled',
                changedBy: currentUserRole || 'Unknown',
                changeType: 'both',
                additionalInfo: rejectionReason ? `Reason: ${rejectionReason}` : 'Deal cancelled'
            });
        } catch (error) {
            console.error('Failed to send deal cancellation notification:', error);
        }
        
        // Notify counterparty that deal has been cancelled
        try {
            await notificationService.notifyCounterparty(
                deal,
                req.user!.userId,
                'deal_cancelled',
                'Deal Cancelled',
                `Deal #${deal.dealNumber} has been cancelled.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
                'high'
            );
        } catch (error) {
            logger.error('[CancelDealCommand] Failed to send notification', { error });
            // Don't fail the command if notification fails
        }
        
        return { activityLogDetails };
    }
} 