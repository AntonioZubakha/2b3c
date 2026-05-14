import mongoose, { Types } from "mongoose";
import * as fs from 'fs';
import * as path from 'path';
import { IDeal, DealStatus, IPaymentDetails, IUser } from "../../../types";
import { ICommand, ActionRequest, ActionError } from "./command.interface";
import { UserRole } from "../helpers";
import { DEAL_STATUSES } from "../../../types/constants";
import { logger } from '../../../utils/logger';
import { getErrorMessage } from '../../../utils/errorHelpers';
import { notificationService } from '../../../services/notificationService';

/**
 * Allows the seller (the side that uploaded the invoice) to recall it while it is still
 * pending buyer review. Use case: the seller realises that pricing/logistics has changed
 * after issuing the invoice (e.g. the goods will be shipped from a different origin) and
 * needs to adjust shipping cost / import tariff before re-issuing the invoice.
 *
 * Effect:
 *   stage: payment_delivery → payment_delivery (unchanged)
 *   status: invoice_pending  → awaiting_invoice
 *   - removes the invoice file from disk
 *   - clears invoiceFilename / invoiceUrl / uploadedByCompany
 *   - records the recall in paymentDetails.rejectedInvoices (rejectedBy = seller, reason
 *     prefixed with "[Recalled by seller]") so it shows up in the invoice history UI
 */
export class RecallInvoiceCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { recallReason } = req.body as { recallReason?: string };
        const { userId } = req.user!;

        if (deal.stage !== 'payment_delivery' || deal.status !== DEAL_STATUSES.INVOICE_PENDING) {
            throw new ActionError('Invoice can only be recalled when status is invoice_pending');
        }

        const isSeller = currentUserRole === 'seller'
            || currentUserRole === 'LGDEAL seller'
            || currentUserRole === 'LGDEAL dual-role';

        if (!isSeller) {
            throw new ActionError('Not authorized to recall invoice. Only the seller (the party that uploaded it) can perform this action.', 403);
        }

        try {
            if (!deal.paymentDetails) {
                deal.paymentDetails = {} as IPaymentDetails;
            }

            const oldInvoiceFilename = deal.paymentDetails.invoiceFilename;

            deal.paymentDetails.invoiceFilename = undefined;
            deal.paymentDetails.uploadedByCompany = undefined;
            deal.invoiceUrl = undefined;
            deal.status = DEAL_STATUSES.AWAITING_INVOICE as DealStatus;

            if (!deal.paymentDetails.rejectedInvoices) {
                deal.paymentDetails.rejectedInvoices = [];
            }

            const reasonText = recallReason && recallReason.trim().length > 0
                ? `[Recalled by seller] ${recallReason.trim()}`
                : '[Recalled by seller]';

            deal.paymentDetails.rejectedInvoices.push({
                date: new Date(),
                reason: reasonText,
                rejectedBy: new mongoose.Types.ObjectId(userId) as Types.ObjectId | IUser,
                originalFilename: oldInvoiceFilename,
            });

            if (oldInvoiceFilename) {
                const invoiceFilePath = path.join(process.cwd(), 'uploads', 'invoices', oldInvoiceFilename);
                try {
                    if (fs.existsSync(invoiceFilePath)) {
                        fs.unlinkSync(invoiceFilePath);
                        logger.info(`Successfully deleted recalled invoice file: ${oldInvoiceFilename}`);
                    } else {
                        logger.warn(`Could not find recalled invoice file to delete at: ${invoiceFilePath}`);
                    }
                } catch (fileError: unknown) {
                    logger.error(`Error deleting recalled invoice file ${oldInvoiceFilename}:`, { error: fileError });
                }
            }

            try {
                await notificationService.notifyCounterparty(
                    deal,
                    req.user!.userId,
                    'invoice_recalled',
                    'Invoice Recalled',
                    `The seller has recalled the invoice for deal #${deal.dealNumber}.${recallReason ? ` Reason: ${recallReason}.` : ''} A revised invoice will be uploaded shortly.`,
                    'high'
                );
            } catch (error) {
                logger.error('[RecallInvoiceCommand] Failed to send notification', { error });
            }

            const activityLogDetails = recallReason
                ? `Invoice recalled by ${currentUserRole}. Reason: ${recallReason}`
                : `Invoice recalled by ${currentUserRole}`;
            return { activityLogDetails };

        } catch (error: unknown) {
            logger.error('Error processing invoice recall:', { error });
            throw new ActionError(getErrorMessage(error, 'Error processing invoice recall'), 500);
        }
    }
}
