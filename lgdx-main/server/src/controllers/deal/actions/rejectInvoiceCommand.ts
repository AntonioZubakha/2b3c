import mongoose, { Types } from "mongoose";
import * as fs from 'fs';
import * as path from 'path';
import { IDeal, DealStatus, IPaymentDetails, IUser } from "../../../types";
import { ICommand, ActionRequest, ActionError } from "./command.interface";
import { UserRole } from "../helpers";
import { logger } from '../../../utils/logger';
import { getErrorMessage } from '../../../utils/errorHelpers';
import { notificationService } from '../../../services/notificationService';

export class RejectInvoiceCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { rejectionReason } = req.body;
        const { userId, isLgdealSupervisor } = req.user!;
        
        if (deal.stage !== 'payment_delivery' || deal.status !== 'invoice_pending') {
            throw new ActionError('Invoice can only be rejected when status is invoice_pending');
        }

        if (!rejectionReason) {
            throw new ActionError('Rejection reason is required');
        }

        const isBuyer = currentUserRole === 'buyer' || currentUserRole === 'LGDEAL buyer' || currentUserRole === 'LGDEAL dual-role';

        if (!isBuyer) {
            throw new ActionError('Not authorized to reject invoice. Only the buyer can perform this action.', 403);
        }

        try {
            if (!deal.paymentDetails) {
                deal.paymentDetails = {} as IPaymentDetails;
            }

            const oldInvoiceFilename = deal.paymentDetails.invoiceFilename;

            deal.paymentDetails.invoiceFilename = undefined;
            deal.invoiceUrl = undefined;
            deal.status = 'awaiting_invoice' as DealStatus;

            if (!deal.paymentDetails.rejectedInvoices) {
                deal.paymentDetails.rejectedInvoices = [];
            }

            deal.paymentDetails.rejectedInvoices.push({
                date: new Date(),
                reason: rejectionReason,
                rejectedBy: new mongoose.Types.ObjectId(userId) as Types.ObjectId | IUser
            });

            if (oldInvoiceFilename) {
                // IMPORTANT: The path resolution depends on the execution context.
                // This path assumes the server process runs from the project root.
                const invoiceFilePath = path.join(process.cwd(), 'uploads', 'invoices', oldInvoiceFilename);
                try {
                    if (fs.existsSync(invoiceFilePath)) {
                        fs.unlinkSync(invoiceFilePath);
                        logger.info(`Successfully deleted rejected invoice file: ${oldInvoiceFilename}`);
                    } else {
                        logger.warn(`Could not find rejected invoice file to delete at: ${invoiceFilePath}`);
                    }
                } catch (fileError: unknown) {
                    logger.error(`Error deleting rejected invoice file ${oldInvoiceFilename}:`, { error: fileError });
                    // Non-fatal: log and continue. The main logic is updating the deal state.
                }
            }

            // Notify seller that invoice was rejected
            try {
                await notificationService.notifyCounterparty(
                    deal,
                    req.user!.userId,
                    'invoice_rejected',
                    'Invoice Rejected',
                    `The buyer has rejected the invoice for deal #${deal.dealNumber}. Reason: ${rejectionReason}. Please upload a revised invoice.`,
                    'high'
                );
            } catch (error) {
                logger.error('[RejectInvoiceCommand] Failed to send notification', { error });
            }

            const activityLogDetails = `Invoice rejected by ${currentUserRole}. Reason: ${rejectionReason}`;
            return { activityLogDetails };

        } catch (error: unknown) {
            logger.error('Error processing invoice rejection:', { error });
            throw new ActionError(getErrorMessage(error, 'Error processing invoice rejection'), 500);
        }
    }
} 