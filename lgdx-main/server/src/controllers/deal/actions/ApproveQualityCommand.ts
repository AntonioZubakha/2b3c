import { Types } from 'mongoose';
import { IDeal } from '../../../types';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { UserRole } from '../helpers';
import { DEAL_STATUSES } from '../../../types/constants';
import { logger } from '../../../utils/logger';
import { notificationService } from '../../../services/notificationService';

/**
 * Command для одобрения качества камня LGDEAL Manager'ом
 * После одобрения камень готов к передаче Logist'у для отгрузки
 */
export class ApproveQualityCommand implements ICommand {
  public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
    logger.info('[ApproveQualityCommand] Starting execution', { dealId: deal._id, userRole: currentUserRole });

    const { userId } = req.user!;
    const { notes } = req.body;

    // 1. Проверка прав: только LGDEAL manager
    if (currentUserRole !== 'LGDEAL manager') {
      throw new ActionError('Only LGDEAL managers can approve quality', 403);
    }

    // 1.5. Проверка типа сделки: только buyer-to-lgdeal
    // Manager работает с buyer-to-lgdeal сделками (продажи покупателям)
    // Он проверяет продукт для покупателей
    if (deal.dealType !== 'buyer-to-lgdeal') {
      throw new ActionError('LGDEAL managers can only work with buyer-to-lgdeal deals', 400);
    }

    // 2. Проверка что сделка назначена этому manager'у
    const assignedToId = deal.assignedTo ? 
      ((deal.assignedTo as any)._id || deal.assignedTo).toString() : 
      null;
    
    if (!assignedToId || assignedToId !== userId) {
      throw new ActionError('This deal is not assigned to you', 403);
    }

    if (deal.assignedRole !== 'manager') {
      throw new ActionError('This deal is not assigned to a manager', 400);
    }

    // 3. Проверка статуса: должен быть quality_check_in_progress
    if (deal.status !== DEAL_STATUSES.QUALITY_CHECK_IN_PROGRESS) {
      throw new ActionError('Can only approve quality during quality check', 400);
    }

    // 4. Обновление статуса
    deal.status = DEAL_STATUSES.QUALITY_APPROVED;

    logger.info('[ApproveQualityCommand] Quality approved by manager', {
      dealId: deal._id,
      managerId: userId,
      notes
    });

    // Notify buyer that quality has been approved
    try {
      await notificationService.notifyCounterparty(
        deal,
        userId,
        'quality_approved',
        'Quality Approved',
        `The quality check for deal #${deal.dealNumber} has been approved. Your order is ready for shipping.`,
        'high'
      );
    } catch (error) {
      logger.error('[ApproveQualityCommand] Failed to send notification', { error });
      // Don't fail the command if notification fails
    }

    let activityLogDetails = `Quality approved by manager. Stone is ready for assignment to logist.`;
    if (notes) {
      activityLogDetails += ` Notes: ${notes}`;
    }

    return { activityLogDetails };
  }
}
