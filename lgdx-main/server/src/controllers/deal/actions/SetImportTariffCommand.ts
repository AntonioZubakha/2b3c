import { ICommand, ActionRequest, ActionError } from './command.interface';
import { IDeal, IShippingDetails } from '../../../types';
import { UserRole } from '../helpers';
import { DEAL_STATUSES } from '../../../types/constants';
import { logger } from '../../../utils/logger';
import { notificationService } from '../../../services/notificationService';

/**
 * Sets the import tariff (duty/customs cost) on a buyer-to-lgdeal deal at request stage.
 * Only LGDEAL as seller can set this; the amount is added to the deal total and shown to the buyer.
 * Not used on lgdeal-to-seller deals (purchases from India/suppliers).
 */
export class SetImportTariffCommand implements ICommand {
    public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
        const { importTariff: newImportTariff } = req.body;

        logger.info('[SetImportTariffCommand] Starting execution', {
            dealId: deal._id,
            dealType: deal.dealType,
            dealNumber: deal.dealNumber,
            stage: deal.stage,
            currentImportTariff: deal.shippingDetails?.importTariff,
            newImportTariff,
            currentAmount: deal.amount
        });

        if (deal.dealType !== 'buyer-to-lgdeal') {
            throw new ActionError('Import tariff can only be set on buyer-to-LGDeal deals.', 400);
        }

        if (currentUserRole !== 'LGDEAL seller' && currentUserRole !== 'LGDEAL dual-role') {
            throw new ActionError('Only LGDeal INC (seller) can set import tariff.', 403);
        }

        // Allow during the initial 'request' stage, or in 'payment_delivery' before an
        // invoice has been (re)issued — supports the "recall invoice → adjust pricing →
        // re-upload" flow when logistics change after the original invoice.
        const isRequestStage = deal.stage === 'request';
        const isPreInvoiceStage = deal.stage === 'payment_delivery'
            && deal.status === DEAL_STATUSES.AWAITING_INVOICE;
        if (!isRequestStage && !isPreInvoiceStage) {
            throw new ActionError(
                `Import tariff can only be set during the 'request' stage or before an invoice is issued in 'payment_delivery'.`,
                400
            );
        }

        if (typeof newImportTariff !== 'number' || newImportTariff < 0) {
            throw new ActionError('A valid non-negative import tariff is required.', 400);
        }

        if (!deal.shippingDetails) {
            deal.shippingDetails = {} as IShippingDetails;
        }
        const oldImportTariff = deal.shippingDetails.importTariff ?? 0;
        deal.shippingDetails.importTariff = newImportTariff;

        const oldAmount = deal.amount || 0;
        if (typeof oldImportTariff === 'number' && oldImportTariff > 0) {
            deal.amount = oldAmount - oldImportTariff + newImportTariff;
        } else {
            deal.amount = oldAmount + newImportTariff;
        }

        logger.info('[SetImportTariffCommand] Import tariff updated successfully', {
            dealId: deal._id,
            dealNumber: deal.dealNumber,
            oldImportTariff,
            newImportTariff,
            newAmount: deal.amount
        });

        try {
            await notificationService.notifyCounterparty(
                deal,
                req.user!.userId,
                'import_tariff_updated',
                'Import Tariff Updated',
                `Import tariff for deal #${deal.dealNumber} has been ${oldImportTariff > 0 ? 'updated' : 'set'} to $${newImportTariff.toFixed(2)}.`,
                'medium'
            );
        } catch (error) {
            logger.error('[SetImportTariffCommand] Failed to send notification', { error });
        }

        const activityLogDetails = oldImportTariff > 0
            ? `Import tariff updated from $${oldImportTariff.toFixed(2)} to $${newImportTariff.toFixed(2)}`
            : `Import tariff set to $${newImportTariff.toFixed(2)}`;
        return { activityLogDetails };
    }
}
