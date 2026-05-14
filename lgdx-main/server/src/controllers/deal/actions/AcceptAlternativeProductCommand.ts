import { Types } from 'mongoose';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { IDeal, IUser } from '../../../types';
import { UserRole } from '../helpers';
import { DEAL_STATUSES, DEAL_STAGES, ACTIVITY_LOG_ACTIONS } from '../../../types/constants';
import { notificationService } from '../../../services/notificationService';
import { logger } from '../../../utils/logger';

export class AcceptAlternativeProductCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { userId } = req.user!;
        
        // Authorization: only buyer can accept
        if (currentUserRole !== 'buyer') {
            throw new ActionError('Not authorized to accept the alternative product.', 403);
        }

        // Business logic validation
        if (deal.status !== DEAL_STATUSES.ALTERNATIVE_PRODUCT_PROPOSED) {
            throw new ActionError('Can only accept when an alternative product is proposed.', 400);
        }

        // Execute the command
        deal.stage = DEAL_STAGES.PAYMENT_DELIVERY;
        deal.status = DEAL_STATUSES.AWAITING_INVOICE;
        
        // Notify seller/LGDEAL that buyer accepted the alternative
        try {
            await notificationService.notifyCounterparty(
                deal,
                req.user!.userId,
                'alternative_accepted',
                'Alternative Product Accepted',
                `The buyer has accepted the alternative product for deal #${deal.dealNumber}.`,
                'medium'
            );
        } catch (error) {
            logger.error('[AcceptAlternativeProductCommand] Failed to send notification', { error });
        }
        
        const activityLogDetails = `Buyer accepted the alternative product proposal.`;
        return { activityLogDetails };
    }
} 