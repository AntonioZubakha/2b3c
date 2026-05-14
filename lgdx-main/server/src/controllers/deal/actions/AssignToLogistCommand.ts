import { Types } from 'mongoose';
import { IDeal } from '../../../types';
import { ICommand, ActionRequest, ActionError } from './command.interface';
import { UserRole } from '../helpers';
import { DEAL_STATUSES } from '../../../types/constants';
import { logger } from '../../../utils/logger';
import User from '../../../models/User';
import Company from '../../../models/Company';
import marketplaceConfig from '../../../config/marketplace';
import { notificationService } from '../../../services/notificationService';
import { sendDealChangeNotification, sendLogistNotification } from '../../../utils/telegramBot';

/**
 * Command для передачи сделки Logist'у после одобрения качества
 * Manager передает камень Logist'у для организации отгрузки buyer'у
 */
export class AssignToLogistCommand implements ICommand {
  public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
    logger.info('[AssignToLogistCommand] Starting execution', { dealId: deal._id, userRole: currentUserRole });

    const { logistId } = req.body;
    const { userId } = req.user!;

    // 1. Проверка прав: только LGDEAL manager может передать logist'у
    if (currentUserRole !== 'LGDEAL manager') {
      throw new ActionError('Only LGDEAL managers can assign deals to logists', 403);
    }

    // 1.5. Проверка типа сделки: только buyer-to-lgdeal
    // Manager работает с buyer-to-lgdeal сделками (продажи покупателям)
    // Он передает сделку Logist'у для доставки покупателю
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

    // 3. Проверка статуса: должен быть quality_approved
    if (deal.status !== DEAL_STATUSES.QUALITY_APPROVED) {
      throw new ActionError('Can only assign to logist after quality is approved', 400);
    }

    // 4. Валидация logistId
    if (!logistId) {
      throw new ActionError('Logist ID is required', 400);
    }

    // 5. Проверка что logist существует и из LGDeal INC
    const logist = await User.findById(logistId).populate<{ company: any }>('company');
    if (!logist) {
      throw new ActionError('Logist not found', 404);
    }

    if (logist.role !== 'logist') {
      throw new ActionError('User is not a logist', 400);
    }

    const lgdealCompany = await Company.findOne({ name: marketplaceConfig.managementCompany.name });
    if (!lgdealCompany) {
      throw new ActionError('LGDeal INC company not found', 500);
    }

    const logistCompanyId = (logist.company as any)?._id?.toString() || (logist.company as any)?.toString();
    if (logistCompanyId !== lgdealCompany._id.toString()) {
      throw new ActionError('Logist must be from LGDeal INC company', 400);
    }

    // 6. Сохраняем старый статус для уведомления
    const oldStatus = deal.status;
    
    // 7. Переназначение на logist'а
    deal.assignedTo = new Types.ObjectId(logistId) as any;
    deal.assignedRole = 'logist';
    deal.assignedAt = new Date();
    deal.assignedBy = new Types.ObjectId(userId) as any;
    deal.status = DEAL_STATUSES.READY_FOR_SHIPPING;

    // 8. Добавление в историю назначений
    if (!deal.assignmentHistory) {
      deal.assignmentHistory = [];
    }
    
    deal.assignmentHistory.push({
      assignedTo: new Types.ObjectId(logistId) as any,
      assignedRole: 'logist',
      assignedBy: new Types.ObjectId(userId) as any,
      assignedAt: new Date()
    } as any);

    // 9. Получаем имя manager'а для уведомления
    const manager = await User.findById(userId);
    const managerName = manager ? `${manager.firstName} ${manager.lastName}` : 'Manager';
    const logistName = `${logist.firstName} ${logist.lastName}`;

    logger.info('[AssignToLogistCommand] Deal assigned to logist', {
      dealId: deal._id,
      logistId,
      logistName
    });

    // 10. Send notification to logist + fan out to admins/supervisors
    try {
      await notificationService.createNotification({
        userId: logistId,
        type: 'ready_for_shipping',
        title: 'Ready for Shipping',
        message: `Deal ${deal.dealNumber} is ready for shipping and has been assigned to you by ${managerName}`,
        dealId: deal._id,
        dealNumber: deal.dealNumber,
        priority: 'high',
        actionUrl: `/deal/${deal._id}`,
        actionLabel: 'View Deal'
      }, false);

      // Admins/supervisors also see all assignment events
      await notificationService.notifyAdminsAndSupervisors(
        deal,
        'ready_for_shipping',
        'Deal Assigned to Logist',
        `Deal ${deal.dealNumber} is ready for shipping and has been assigned to logist ${logistName} by ${managerName}`,
        'high'
      );
      
      const buyerName = (deal.buyerCompanyId as { name?: string })?.name;
      const sellerName = (deal.sellerCompanyId as { name?: string })?.name;
      sendDealChangeNotification({
        dealNumber: deal.dealNumber,
        dealId: deal._id.toString(),
        oldStatus: oldStatus || 'quality_approved',
        newStatus: DEAL_STATUSES.READY_FOR_SHIPPING,
        changedBy: managerName,
        changeType: 'status',
        buyerName,
        sellerName,
        additionalInfo: `Assigned to logist ${logistName}`
      });

      sendLogistNotification(
        `📦 Deal #${deal.dealNumber} ready for shipment.\nAssigned to: ${logistName}`
      );
    } catch (error) {
      logger.error('[AssignToLogistCommand] Failed to send notification', { error });
    }

    const activityLogDetails = `Deal assigned to logist ${logist.firstName} ${logist.lastName} by ${managerName}`;
    return { activityLogDetails };
  }
}
