import { Types } from 'mongoose';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { IDeal, IUser, IPaymentDetails, DealStatus } from '../../../types';
import { UserRole, determineUserRole } from '../helpers';
import { ACTIVITY_LOG_ACTIONS, DEAL_STATUSES } from '../../../types/constants';
import { logger } from '../../../utils/logger';
import { sendDealChangeNotification } from '../../../utils/telegramBot';
import { notificationService } from '../../../services/notificationService';

export class UploadInvoiceCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { userId, companyId, isLgdealSupervisor } = req.user!;
        
        if (!req.file) {
            throw new ActionError('No invoice file was uploaded.', 400);
        }

        // Authorization check is implicitly handled by `getAllowedActions` in the controller,
        // but an explicit check here is good practice.
        if (currentUserRole !== 'seller' && currentUserRole !== 'LGDEAL seller' && currentUserRole !== 'LGDEAL dual-role') {
            throw new ActionError('Not authorized to upload an invoice for this deal.', 403);
        }

        if (deal.status !== DEAL_STATUSES.AWAITING_INVOICE) {
            throw new ActionError(`Invoice can only be uploaded when deal status is '${DEAL_STATUSES.AWAITING_INVOICE}'.`, 400);
        }

        // Execute the command
        if (!deal.paymentDetails) {
            deal.paymentDetails = {} as IPaymentDetails;
        }

        const oldStatus = deal.status;
        deal.paymentDetails.invoiceFilename = req.file.filename;
        deal.invoiceUrl = `/api/deal/${deal._id}/invoice/download`; // Keep the download link structure
        deal.status = DEAL_STATUSES.INVOICE_PENDING as DealStatus;
        
        // Save information about which company uploaded the invoice
        if (isLgdealSupervisor) {
            deal.paymentDetails.uploadedByCompany = 'lgdeal';
        } else if (companyId) {
            deal.paymentDetails.uploadedByCompany = companyId.toString();
        }

        const isDirectLgdealDeal = deal.dealType === 'buyer-to-lgdeal' && (!deal.pairedDealIds || deal.pairedDealIds.length === 0);
        const userRole = determineUserRole(deal, userId, companyId, !!isLgdealSupervisor, isDirectLgdealDeal);
        const activityLogDetails = `Invoice ${req.file.originalname || 'unknown'} uploaded by ${userRole || 'Unknown'}`;

        // Send Telegram notification for invoice upload
        try {
            sendDealChangeNotification({
                dealNumber: deal.dealNumber,
                dealId: deal._id.toString(),
                oldStatus: oldStatus,
                newStatus: deal.status,
                changedBy: userRole || 'Unknown',
                changeType: 'status',
                additionalInfo: `Invoice: ${req.file.originalname || 'unknown'}`
            });
        } catch (error) {
            console.error('Failed to send invoice upload notification:', error);
        }

        // Notify buyer that invoice has been uploaded
        try {
            await notificationService.notifyCounterparty(
                deal,
                req.user!.userId,
                'invoice_uploaded',
                'Invoice Uploaded',
                `The seller has uploaded an invoice for deal #${deal.dealNumber}. Please review it.`,
                'high'
            );
        } catch (error) {
            logger.error('[UploadInvoiceCommand] Failed to send notification', { error });
        }

        // The controller will add the generic activity log. This provides the details.
        logger.info('[UploadInvoiceCommand] Command executed successfully. Status updated to invoice_pending.');

        return { activityLogDetails };
    }
} 