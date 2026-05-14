import { Types } from 'mongoose';
import { IDeal, IUser } from '../../../types';
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
 * Command для назначения buyer-to-lgdeal сделки LGDEAL Manager'у
 * Используется LGDEAL Supervisor'ом после получения оплаты от покупателя
 * ВАЖНО: Назначение менеджеру происходит ТОЛЬКО после оплаты, до проверки качества
 * Manager работает с buyer-to-lgdeal сделками (продажи покупателям)
 */
export class AssignToManagerCommand implements ICommand {
  public async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{ activityLogDetails: string }> {
    logger.info('[AssignToManagerCommand] Starting execution', { dealId: deal._id, userRole: currentUserRole, dealType: deal.dealType });

    const { managerId } = req.body; // Убрали supplierDealId из body
    const { userId } = req.user!;

    // 1. Проверка прав: только LGDEAL supervisor может назначать
    if (currentUserRole !== 'LGDEAL seller' && currentUserRole !== 'LGDEAL dual-role') {
      throw new ActionError('Only LGDEAL supervisors can assign deals to managers', 403);
    }

    // 2. Проверка типа сделки: только buyer-to-lgdeal
    // Manager работает с buyer-to-lgdeal сделками (продажи покупателям)
    if (deal.dealType !== 'buyer-to-lgdeal') {
      throw new ActionError('Can only assign buyer-to-lgdeal deals to managers', 400);
    }

    // 3. Проверка статуса: payment_received (оплата получена) или quality_rejected (возврат на request — оплата уже в казну)
    if (deal.status !== DEAL_STATUSES.PAYMENT_RECEIVED && deal.status !== DEAL_STATUSES.QUALITY_REJECTED) {
      throw new ActionError(`Can only assign deals when payment is received (payment_received) or after quality rejection (quality_rejected). Current status: ${deal.status}`, 400);
    }

    // 4. Проверка что сделка еще не назначена
    if (deal.assignedTo) {
      throw new ActionError('Deal is already assigned. Use reassign action instead.', 400);
    }

    // 5. Валидация managerId
    if (!managerId) {
      throw new ActionError('Manager ID is required', 400);
    }

    // 6. Проверка и автоматический выбор activePurchaseDealId
    const hasSupplierDeals = deal.pairedDealIds && deal.pairedDealIds.length > 0;

    // После отклонения качества супервайзер обязан сначала выбрать альтернативу, затем назначить менеджера
    if (deal.status === DEAL_STATUSES.QUALITY_REJECTED && hasSupplierDeals && !deal.activePurchaseDealId) {
      throw new ActionError('Please select an alternative product before assigning to manager.', 400);
    }

    if (hasSupplierDeals) {
      logger.debug('[AssignToManagerCommand] Found pairedDealIds', {
        dealId: deal._id,
        pairedDealIds: deal.pairedDealIds,
        count: deal.pairedDealIds?.length || 0
      });

      // Если activePurchaseDealId не установлен - выбираем первый подтвержденный lgdeal-to-seller автоматически (только не для quality_rejected)
      if (!deal.activePurchaseDealId) {
        const Deal = (await import('../../../models/Deal')).default;
        
        // Сначала загружаем ВСЕ связанные сделки для диагностики
        const allPairedDeals = await Deal.find({
          _id: { $in: deal.pairedDealIds }
        }).select('_id dealNumber dealType status stage');
        
        logger.debug('[AssignToManagerCommand] All paired deals', {
          deals: allPairedDeals.map(d => ({
            id: d._id,
            number: d.dealNumber,
            type: d.dealType,
            status: d.status,
            stage: d.stage
          }))
        });
        
        // Ищем подтвержденные lgdeal-to-seller сделки
        // Статусы: awaiting_invoice (подтверждено), invoice_pending (инвойс загружен), payment_received (оплачено)
        // Или стадия payment_delivery (уже в процессе оплаты/доставки)
        const confirmedSupplierDeals = await Deal.find({
          _id: { $in: deal.pairedDealIds },
          dealType: 'lgdeal-to-seller',
          $or: [
            { status: { $in: [DEAL_STATUSES.AWAITING_INVOICE, DEAL_STATUSES.INVOICE_PENDING, DEAL_STATUSES.PAYMENT_RECEIVED] } },
            { stage: 'payment_delivery' }
          ]
        }).sort({ createdAt: 1 });
        
        logger.debug('[AssignToManagerCommand] Confirmed supplier deals', {
          count: confirmedSupplierDeals.length,
          deals: confirmedSupplierDeals.map(d => ({
            id: d._id,
            number: d.dealNumber,
            status: d.status,
            stage: d.stage
          }))
        });
        
        if (confirmedSupplierDeals.length === 0) {
          throw new ActionError(
            `No confirmed supplier deals available. Found ${allPairedDeals.length} paired deal(s), but none have status awaiting_invoice/invoice_pending/payment_received or stage payment_delivery. Please check supplier deal statuses.`,
            400
          );
        }
        
        // Автоматически устанавливаем первую подтвержденную сделку
        deal.activePurchaseDealId = confirmedSupplierDeals[0]._id;
        
        logger.info('[AssignToManagerCommand] Auto-selected first confirmed supplier deal', {
          dealId: deal._id,
          activePurchaseDealId: deal.activePurchaseDealId,
          supplierDealNumber: confirmedSupplierDeals[0].dealNumber,
          supplierDealStatus: confirmedSupplierDeals[0].status,
          supplierDealStage: confirmedSupplierDeals[0].stage,
          totalSupplierDeals: confirmedSupplierDeals.length
        });
      }
      
      // Валидация что activePurchaseDealId (установленный вручную или автоматически) валиден
      const Deal = (await import('../../../models/Deal')).default;
      const supplierDeal = await Deal.findById(deal.activePurchaseDealId);
      
      if (!supplierDeal) {
        throw new ActionError('Referenced supplier deal not found', 404);
      }
      
      if (supplierDeal.dealType !== 'lgdeal-to-seller') {
        throw new ActionError('Active purchase deal must be lgdeal-to-seller type', 400);
      }

      // Проверяем что сделка в правильном статусе или стадии
      const allowedStatuses = [DEAL_STATUSES.AWAITING_INVOICE, DEAL_STATUSES.INVOICE_PENDING, DEAL_STATUSES.PAYMENT_RECEIVED];
      const isValidStatus = allowedStatuses.includes(
        supplierDeal.status as typeof DEAL_STATUSES.AWAITING_INVOICE | typeof DEAL_STATUSES.INVOICE_PENDING | typeof DEAL_STATUSES.PAYMENT_RECEIVED
      );
      const isValidStage = supplierDeal.stage === 'payment_delivery';
      
      if (!isValidStatus && !isValidStage) {
        throw new ActionError(
          `Supplier deal must be confirmed (status: awaiting_invoice/invoice_pending/payment_received OR stage: payment_delivery). Current: status=${supplierDeal.status}, stage=${supplierDeal.stage}`,
          400
        );
      }
      
      logger.info('[AssignToManagerCommand] Using supplier deal', {
        activePurchaseDealId: deal.activePurchaseDealId,
        supplierDealNumber: supplierDeal.dealNumber,
        supplierDealStatus: supplierDeal.status,
        supplierDealStage: supplierDeal.stage
      });
    } else {
      // Direct deal - камень уже у LGDEAL, источник не нужен
      logger.info('[AssignToManagerCommand] Direct deal - no supplier deal needed', {
        dealId: deal._id,
        dealNumber: deal.dealNumber
      });
    }

    // 7. Проверка что manager существует и из LGDeal INC
    const manager = await User.findById(managerId).populate<{ company: any }>('company');
    if (!manager) {
      throw new ActionError('Manager not found', 404);
    }

    if (manager.role !== 'manager') {
      throw new ActionError('User is not a manager', 400);
    }

    const lgdealCompany = await Company.findOne({ name: marketplaceConfig.managementCompany.name });
    if (!lgdealCompany) {
      throw new ActionError('LGDeal INC company not found', 500);
    }

    const managerCompanyId = (manager.company as any)?._id?.toString() || (manager.company as any)?.toString();
    if (managerCompanyId !== lgdealCompany._id.toString()) {
      throw new ActionError('Manager must be from LGDeal INC company', 400);
    }

    // 5. Сохраняем старый статус для уведомления
    const oldStatus = deal.status;

    // При назначении из quality_rejected сделка в stage request — переводим в payment_delivery
    if (deal.stage === 'request') {
      deal.stage = 'payment_delivery';
    }

    // 6. Назначение
    deal.assignedTo = new Types.ObjectId(managerId) as any;
    deal.assignedRole = 'manager';
    deal.assignedAt = new Date();
    deal.assignedBy = new Types.ObjectId(userId) as any;
    deal.status = DEAL_STATUSES.ASSIGNED_TO_MANAGER;

    // activePurchaseDealId остается как есть (либо установлен, либо null для direct deals)
    logger.info('[AssignToManagerCommand] Manager assigned', {
      dealId: deal._id,
      managerId,
      activePurchaseDealId: deal.activePurchaseDealId || 'none (direct deal)'
    });

    // 8. Добавление в историю назначений
    if (!deal.assignmentHistory) {
      deal.assignmentHistory = [];
    }
    
    deal.assignmentHistory.push({
      assignedTo: new Types.ObjectId(managerId) as any,
      assignedRole: 'manager',
      assignedBy: new Types.ObjectId(userId) as any,
      assignedAt: new Date()
    } as any);

    // 9. Получаем имя supervisor'а для уведомления
    const supervisor = await User.findById(userId);
    const supervisorName = supervisor ? `${supervisor.firstName} ${supervisor.lastName}` : 'Supervisor';
    const managerName = `${manager.firstName} ${manager.lastName}`;

    logger.info('[AssignToManagerCommand] Deal assigned to manager', {
      dealId: deal._id,
      dealNumber: deal.dealNumber,
      managerId,
      managerName,
      activePurchaseDealId: deal.activePurchaseDealId?.toString()
    });

    // 10. Send notification to manager + fan out to admins/supervisors
    try {
      await notificationService.createNotification({
        userId: managerId,
        type: 'deal_assigned',
        title: 'New Deal Assigned',
        message: `Deal ${deal.dealNumber} has been assigned to you by ${supervisorName}`,
        dealId: deal._id,
        dealNumber: deal.dealNumber,
        priority: 'high',
        actionUrl: `/deal/${deal._id}`,
        actionLabel: 'View Deal'
      }, false);

      // Admins/supervisors also see all assignment events (excludes the supervisor who acted)
      await notificationService.notifyAdminsAndSupervisors(
        deal,
        'deal_assigned',
        'Deal Assigned to Manager',
        `Deal ${deal.dealNumber} has been assigned to manager ${managerName} by ${supervisorName}`,
        'high',
        userId
      );
      
      // Telegram с правильными статусами и именем менеджера
      const buyerName = (deal.buyerCompanyId as { name?: string })?.name;
      const sellerName = (deal.sellerCompanyId as { name?: string })?.name;
      sendDealChangeNotification({
        dealNumber: deal.dealNumber,
        dealId: deal._id.toString(),
        oldStatus: oldStatus || 'payment_received',
        newStatus: DEAL_STATUSES.ASSIGNED_TO_MANAGER,
        changedBy: supervisorName,
        changeType: 'status',
        buyerName,
        sellerName,
        additionalInfo: `Assigned to manager ${managerName}`
      });
    } catch (error) {
      logger.error('[AssignToManagerCommand] Failed to send notification', { error });
      // Don't fail the command if notification fails
    }

    const activityLogDetails = `Deal assigned to manager ${manager.firstName} ${manager.lastName} by ${supervisorName}`;
    return { activityLogDetails };
  }
}
