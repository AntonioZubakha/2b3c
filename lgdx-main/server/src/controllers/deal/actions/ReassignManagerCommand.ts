import { Types } from 'mongoose';
import { IDeal } from '../../../types';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { UserRole } from '../helpers';
import { logger } from '../../../utils/logger';
import User from '../../../models/User';
import Company from '../../../models/Company';
import marketplaceConfig from '../../../config/marketplace';
import { notificationService } from '../../../services/notificationService';

/**
 * Command для переназначения сделки другому LGDEAL Manager'у
 * Используется Supervisor'ом при необходимости (болезнь, перегрузка, etc.)
 */
export class ReassignManagerCommand implements ICommand {
  public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
    logger.info('[ReassignManagerCommand] Starting execution', { dealId: deal._id, userRole: currentUserRole });

    const { newManagerId, reassignmentReason } = req.body;
    const { userId } = req.user!;

    // 1. Проверка прав: только LGDEAL supervisor
    if (currentUserRole !== 'LGDEAL seller' && currentUserRole !== 'LGDEAL dual-role') {
      throw new ActionError('Only LGDEAL supervisors can reassign managers', 403);
    }

    // 2. Проверка что сделка назначена manager'у
    if (!deal.assignedTo || deal.assignedRole !== 'manager') {
      throw new ActionError('Deal is not assigned to a manager', 400);
    }

    // 3. Валидация newManagerId
    if (!newManagerId) {
      throw new ActionError('New manager ID is required', 400);
    }

    // 3.5. Валидация reassignmentReason (обязательна согласно документации)
    if (!reassignmentReason || reassignmentReason.trim().length === 0) {
      throw new ActionError('Reassignment reason is required', 400);
    }

    // 4. Проверка что это другой manager
    const currentManagerId = ((deal.assignedTo as any)._id || deal.assignedTo).toString();
    if (currentManagerId === newManagerId) {
      throw new ActionError('Cannot reassign to the same manager', 400);
    }

    // 5. Получение старого manager'а для логирования
    const oldManager = await User.findById(currentManagerId);
    
    // 6. Проверка что новый manager существует и из LGDeal INC
    const newManager = await User.findById(newManagerId).populate<{ company: any }>('company');
    if (!newManager) {
      throw new ActionError('New manager not found', 404);
    }

    if (newManager.role !== 'manager') {
      throw new ActionError('User is not a manager', 400);
    }

    const lgdealCompany = await Company.findOne({ name: marketplaceConfig.managementCompany.name });
    if (!lgdealCompany) {
      throw new ActionError('LGDeal INC company not found', 500);
    }

    const newManagerCompanyId = (newManager.company as any)?._id?.toString() || (newManager.company as any)?.toString();
    if (newManagerCompanyId !== lgdealCompany._id.toString()) {
      throw new ActionError('New manager must be from LGDeal INC company', 400);
    }

    // 7. Переназначение
    deal.assignedTo = new Types.ObjectId(newManagerId) as any;
    deal.assignedAt = new Date();
    deal.assignedBy = new Types.ObjectId(userId) as any;

    // 8. Добавление в историю назначений
    if (!deal.assignmentHistory) {
      deal.assignmentHistory = [];
    }
    
    deal.assignmentHistory.push({
      assignedTo: new Types.ObjectId(newManagerId) as any,
      assignedRole: 'manager',
      assignedBy: new Types.ObjectId(userId) as any,
      assignedAt: new Date(),
      reassignmentReason: reassignmentReason || 'No reason provided'
    } as any);

    logger.info('[ReassignManagerCommand] Deal reassigned to new manager', {
      dealId: deal._id,
      oldManagerId: currentManagerId,
      oldManagerName: oldManager ? `${oldManager.firstName} ${oldManager.lastName}` : 'Unknown',
      newManagerId,
      newManagerName: `${newManager.firstName} ${newManager.lastName}`,
      reason: reassignmentReason
    });

    // 9. Send notifications
    try {
      // Notify old manager
      await notificationService.createNotification({
        userId: currentManagerId,
        type: 'deal_reassigned',
        title: 'Deal Reassigned',
        message: `Deal ${deal.dealNumber} has been reassigned to another manager`,
        dealId: deal._id,
        dealNumber: deal.dealNumber,
        priority: 'medium'
      });

      // Notify new manager
      await notificationService.createNotification({
        userId: newManagerId,
        type: 'deal_assigned',
        title: 'Deal Reassigned to You',
        message: `Deal ${deal.dealNumber} has been reassigned to you${reassignmentReason ? `. Reason: ${reassignmentReason}` : ''}`,
        dealId: deal._id,
        dealNumber: deal.dealNumber,
        priority: 'high',
        actionUrl: `/deal/${deal._id}`,
        actionLabel: 'View Deal'
      });

      // Admins/supervisors also see all reassignment events (exclude supervisor who acted)
      const oldManagerName = oldManager ? `${oldManager.firstName} ${oldManager.lastName}` : 'previous manager';
      await notificationService.notifyAdminsAndSupervisors(
        deal,
        'deal_reassigned',
        'Deal Reassigned',
        `Deal ${deal.dealNumber} reassigned from ${oldManagerName} to ${newManager.firstName} ${newManager.lastName}${reassignmentReason ? `. Reason: ${reassignmentReason}` : ''}`,
        'medium',
        userId
      );
    } catch (error) {
      logger.error('[ReassignManagerCommand] Failed to send notifications', { error });
    }

    const supervisor = await User.findById(userId);
    const supervisorName = supervisor ? `${supervisor.firstName} ${supervisor.lastName}` : 'Supervisor';
    const oldManagerName = oldManager ? `${oldManager.firstName} ${oldManager.lastName}` : 'Unknown Manager';
    let activityLogDetails = `Deal reassigned from ${oldManagerName} to ${newManager.firstName} ${newManager.lastName} by ${supervisorName}`;
    if (reassignmentReason) {
      activityLogDetails += `. Reason: ${reassignmentReason}`;
    }

    return { activityLogDetails };
  }
}
