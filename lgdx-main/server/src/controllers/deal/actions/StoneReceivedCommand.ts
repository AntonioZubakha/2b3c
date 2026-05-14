import { Types } from 'mongoose';
import { IDeal } from '../../../types';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { UserRole } from '../helpers';
import { DEAL_STATUSES } from '../../../types/constants';
import { logger } from '../../../utils/logger';
import { notificationService } from '../../../services/notificationService';

/**
 * Command для отметки получения камня LGDEAL Manager'ом
 * Manager получил камень от поставщика и начинает проверку качества
 */
export class StoneReceivedCommand implements ICommand {
  public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
    logger.info('[StoneReceivedCommand] Starting execution', { dealId: deal._id, userRole: currentUserRole });

    const { userId } = req.user!;

    // 1. Проверка прав: только LGDEAL manager
    if (currentUserRole !== 'LGDEAL manager') {
      throw new ActionError('Only LGDEAL managers can mark stone as received', 403);
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

    // 3. Проверка статуса: должен быть assigned_to_manager
    if (deal.status !== DEAL_STATUSES.ASSIGNED_TO_MANAGER) {
      throw new ActionError('Can only mark stone as received when deal is assigned to manager', 400);
    }

    // 4. Обновление статуса
    deal.status = DEAL_STATUSES.QUALITY_CHECK_IN_PROGRESS;

    logger.info('[StoneReceivedCommand] Stone marked as received, quality check started', {
      dealId: deal._id,
      managerId: userId
    });

    // Notify buyer that stone has been received
    try {
      await notificationService.notifyCounterparty(
        deal,
        userId,
        'stone_received',
        'Stone Received',
        `The stone for deal #${deal.dealNumber} has been received. Quality check is in progress.`,
        'medium'
      );
    } catch (error) {
      logger.error('[StoneReceivedCommand] Failed to send notification', { error });
      // Don't fail the command if notification fails
    }

    const activityLogDetails = `Stone received by manager. Quality check in progress.`;
    return { activityLogDetails };
  }
}
