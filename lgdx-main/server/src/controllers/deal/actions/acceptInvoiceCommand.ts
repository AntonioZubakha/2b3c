import { Types } from 'mongoose';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { IDeal, IUser } from '../../../types';
import { UserRole, determineUserRole } from '../helpers';
import { DEAL_STATUSES, ACTIVITY_LOG_ACTIONS } from '../../../types/constants';
import { logger } from '../../../utils/logger';
import { notificationService } from '../../../services/notificationService';

export class AcceptInvoiceCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { userId, companyId, isLgdealSupervisor } = req.user!;
        
        logger.info('[AcceptInvoiceCommand] Starting execution for deal:', { dealId: deal._id });
        
        // Authorization check - only buyer can accept invoice
        const isBuyer = currentUserRole === 'buyer' || currentUserRole === 'LGDEAL buyer' || currentUserRole === 'LGDEAL dual-role';

        if (!isBuyer) {
            throw new ActionError('Not authorized to accept invoice for this deal. Only the buyer can perform this action.', 403);
        }

        // Business logic validation
        if (deal.status !== DEAL_STATUSES.INVOICE_PENDING) {
            throw new ActionError('Invoice can only be accepted when status is invoice_pending', 400);
        }

        // Execute the command
        deal.status = DEAL_STATUSES.AWAITING_PAYMENT;
        
        // Notify seller that invoice was accepted
        try {
            await notificationService.notifyCounterparty(
                deal,
                req.user!.userId,
                'invoice_accepted',
                'Invoice Accepted',
                `The buyer has accepted the invoice for deal #${deal.dealNumber}. Awaiting payment confirmation.`,
                'medium'
            );
        } catch (error) {
            logger.error('[AcceptInvoiceCommand] Failed to send notification', { error });
        }
        
        const activityLogDetails = `Invoice accepted by ${currentUserRole}`;
        return { activityLogDetails };
    }
} 