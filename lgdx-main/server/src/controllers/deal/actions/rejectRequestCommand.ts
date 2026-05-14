import { IDeal, DealStage, DealStatus, IRequestDetails } from "../../../types";
import { ICommand, ActionRequest, ActionError } from "./command.interface";
import { UserRole, processProductsOnDealEnd, cancelAllRelatedDeals } from "../helpers";
import { Types } from "mongoose";
import { notificationService } from '../../../services/notificationService';
import { logger } from '../../../utils/logger';

export class RejectRequestCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { rejectionReason } = req.body;
        const { userId } = req.user!;

        if (deal.stage !== 'request' || deal.status !== 'pending') {
            throw new ActionError('Request can only be rejected if deal is in request stage and pending status.');
        }

        if (currentUserRole !== 'seller' && currentUserRole !== 'LGDEAL seller') {
            throw new ActionError('Only seller can reject request.', 403);
        }

        deal.stage = 'cancelled' as DealStage;
        deal.status = 'rejected' as DealStatus;
        if (rejectionReason) {
            if(!deal.requestDetails) deal.requestDetails = { requestDate: new Date(), requestedBy: new Types.ObjectId(userId) } as IRequestDetails;
            deal.requestDetails.rejectionReason = rejectionReason;
        }

        // Process products for the main deal being rejected
        await processProductsOnDealEnd(deal, 'cancelled', userId);

        // Find and cancel ALL related deals using the shared helper function
        await cancelAllRelatedDeals(deal, userId, rejectionReason);
        
        // Notify buyer that their request was rejected
        try {
            await notificationService.notifyCounterparty(
                deal,
                req.user!.userId,
                'request_rejected',
                'Request Rejected',
                `Your request for deal #${deal.dealNumber} has been rejected by the seller.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
                'high'
            );
        } catch (error) {
            logger.error('[RejectRequestCommand] Failed to send notification', { error });
        }
        
        const activityLogDetails = `${currentUserRole} rejected the request.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`;
        return { activityLogDetails };
    }
} 