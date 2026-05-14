import { IDeal } from '../../../types';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { UserRole } from '../helpers';
import { DEAL_STATUSES } from '../../../types/constants';
import { logger } from '../../../utils/logger';
import User from '../../../models/User';
import Company from '../../../models/Company';
import marketplaceConfig from '../../../config/marketplace';
import { notificationService } from '../../../services/notificationService';
import { sendDealChangeNotification } from '../../../utils/telegramBot';

/**
 * Command для отклонения качества камня LGDEAL Manager'ом.
 * Возвращает сделку на стадию Request: супервайзер вручную выбирает альтернативный продукт.
 * Оплата от покупателя уже получена — сделку не отменяем, связанные lgdeal-to-seller не трогаем.
 */
export class RejectQualityCommand implements ICommand {
  public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
    logger.info('[RejectQualityCommand] Starting execution', { dealId: deal._id, userRole: currentUserRole });

    const { reason } = req.body;
    const { userId } = req.user!;

    // 1. Проверка прав: только LGDEAL manager
    if (currentUserRole !== 'LGDEAL manager') {
      throw new ActionError('Only LGDEAL managers can reject quality', 403);
    }

    if (deal.dealType !== 'buyer-to-lgdeal') {
      throw new ActionError('LGDEAL managers can only work with buyer-to-lgdeal deals', 400);
    }

    const assignedToId = deal.assignedTo ?
      ((deal.assignedTo as any)._id || deal.assignedTo).toString() :
      null;

    if (!assignedToId || assignedToId !== userId) {
      throw new ActionError('This deal is not assigned to you', 403);
    }

    if (deal.assignedRole !== 'manager') {
      throw new ActionError('This deal is not assigned to a manager', 400);
    }

    if (deal.status !== DEAL_STATUSES.QUALITY_CHECK_IN_PROGRESS) {
      throw new ActionError('Can only reject quality during quality check', 400);
    }

    if (!reason) {
      throw new ActionError('Reason for quality rejection is required', 400);
    }

    const manager = await User.findById(userId);
    const managerName = manager ? `${manager.firstName} ${manager.lastName}` : 'Unknown Manager';

    // Возврат на Request: супервайзер выберет альтернативу. Оплата уже в казну LGDEAL.
    deal.stage = 'request';
    deal.status = DEAL_STATUSES.QUALITY_REJECTED;
    deal.assignedTo = null as any;
    deal.assignedRole = undefined;
    deal.activePurchaseDealId = undefined; // Сбрасываем источник — супервайзер выберет альтернативу

    // Activity log entry returned via activityLogDetails — actionController добавит его сам
    // 🔒 НЕ вызываем deal.save() — actionController сохраняет через findOneAndUpdate (optimistic locking)

    logger.info('[RejectQualityCommand] Deal state updated in memory, will be saved by actionController', {
      dealId: deal._id,
      dealNumber: deal.dealNumber,
      managerId: userId,
      reason
    });

    // Notify all LGDEAL admins and supervisors — they must select an alternative product
    try {
      const lgdealCompany = await Company.findOne({
        name: marketplaceConfig.managementCompany.name
      });

      if (lgdealCompany) {
        const adminAndSupervisors = await User.find({
          company: lgdealCompany._id,
          role: { $in: ['admin', 'supervisor'] },
          isActive: true
        });

        const dealIdStr = deal._id.toString();
        for (const recipient of adminAndSupervisors) {
          await notificationService.createNotification({
            userId: recipient._id,
            type: 'quality_rejected',
            title: 'Quality Rejected – Select Alternative',
            message: `Manager ${managerName} rejected quality for deal ${deal.dealNumber}. Reason: ${reason}. Please select an alternative product. Buyer payment already received.`,
            dealId: dealIdStr,
            dealNumber: deal.dealNumber,
            priority: 'high',
            actionUrl: `/deal/${dealIdStr}`,
            actionLabel: 'Select Alternative',
            metadata: {
              managerId: userId,
              managerName: managerName,
              rejectionReason: reason
            }
          }, false); // Telegram sent once below via sendDealChangeNotification
        }

        await sendDealChangeNotification({
          dealNumber: deal.dealNumber,
          dealId: deal._id.toString(),
          oldStatus: DEAL_STATUSES.QUALITY_CHECK_IN_PROGRESS,
          newStatus: DEAL_STATUSES.QUALITY_REJECTED,
          changeType: 'status',
          changedBy: managerName,
          additionalInfo: `Quality rejected. Deal returned to Request. Supervisor must select alternative product. Reason: ${reason}. Buyer payment already received.`
        });

        logger.info('[RejectQualityCommand] Admins and supervisors notified', {
          count: adminAndSupervisors.length,
          dealNumber: deal.dealNumber
        });
      }
    } catch (error) {
      logger.error('[RejectQualityCommand] Failed to notify admins/supervisors', { error });
    }

    return {
      activityLogDetails: `Quality rejected: ${reason}. Deal returned to Request. Supervisor will select alternative product. Buyer payment already received.`
    };
  }
}
