import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import Deal from '../../models/Deal';
import User from '../../models/User';
import Company from '../../models/Company';
import marketplaceConfig from '../../config/marketplace';
import { determineUserRole, getAllowedActions, UserRole } from './helpers';
import { IDeal, IUser, IActivityLog } from '../../types';
// Import DealService for proper population
import { DealService } from '../../services/dealService';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorHelpers';
import { 
    NotFoundError, 
    UnauthorizedError, 
    ForbiddenError, 
    ValidationError,
    asyncHandler 
} from '../../middleware/errorHandler';

// Command Pattern Imports
import { ICommand, ActionRequest, ActionError } from './actions/command.interface';
import { ApproveRequestCommand } from './actions/approveRequestCommand';
import { RejectRequestCommand } from './actions/rejectRequestCommand';
import { CancelDealCommand } from './actions/cancelDealCommand';
import { RejectInvoiceCommand } from './actions/rejectInvoiceCommand';
import { AcceptInvoiceCommand } from './actions/acceptInvoiceCommand';
import { RecallInvoiceCommand } from './actions/recallInvoiceCommand';
import { ConfirmPaymentCommand } from './actions/confirmPaymentCommand';
import { ConfirmDeliveryCommand } from './actions/confirmDeliveryCommand';
import { AddTrackingNumberCommand } from './actions/addTrackingNumberCommand';
import { UploadInvoiceCommand } from './actions/uploadInvoiceCommand';
import { SelectAlternativeProductCommand } from './actions/SelectAlternativeProductCommand';
import { AcceptAlternativeProductCommand } from './actions/AcceptAlternativeProductCommand';
import { RejectAlternativeProductCommand } from './actions/RejectAlternativeProductCommand';
import { SetShippingCostCommand } from './actions/SetShippingCostCommand';
import { SetImportTariffCommand } from './actions/SetImportTariffCommand';
import { DealStateService } from '../../services/dealStateService';
// LGDEAL Internal Workflow Commands
import { AssignToManagerCommand } from './actions/AssignToManagerCommand';
import { StoneReceivedCommand } from './actions/StoneReceivedCommand';
import { ApproveQualityCommand } from './actions/ApproveQualityCommand';
import { RejectQualityCommand } from './actions/RejectQualityCommand';
import { AssignToLogistCommand } from './actions/AssignToLogistCommand';
import { ReassignManagerCommand } from './actions/ReassignManagerCommand';

// Validation Schemas Import
import { 
  ApproveRequestSchema, 
  RejectRequestSchema, 
  CancelDealSchema, 
  RejectInvoiceSchema,
  AddTrackingSchema,
  ConfirmDeliverySchema,
  RejectAlternativeProductSchema,
  SelectAlternativeProductSchema,
  SetShippingCostSchema
} from '../../validation/schemas/dealSchemas';

// Initialize DealService instance
const dealService = new DealService();
const dealStateService = new DealStateService();

/**
 * Возвращает количество активных менеджеров в LGDEAL-компании.
 * Используется для условного показа reassign_manager в allowedActions.
 * Вызывается только для supervisor-роли + buyer-to-lgdeal + assigned manager.
 */
async function fetchLgdealManagersCount(): Promise<number | undefined> {
  try {
    const lgdealCompany = await Company.findOne({ name: marketplaceConfig.managementCompany.name });
    if (!lgdealCompany) return undefined;
    return await User.countDocuments({ company: lgdealCompany._id, role: 'manager', isActive: true });
  } catch {
    return undefined; // Безопасный fallback — покажем кнопку (лучше лишняя, чем пропущенная)
  }
}

// Define a type for the request object that includes the user property
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
    companyId?: string;
    isLgdealSupervisor?: boolean;
    isLgdealAdmin?: boolean;
  };
  params: {
    dealId: string;
    actionName: string;
  };
}

// Command Factory
const commandMap: { [key: string]: new () => ICommand } = {
  'approve_request': ApproveRequestCommand,
  'reject_request': RejectRequestCommand,
  'cancel_deal': CancelDealCommand,
  'reject_invoice': RejectInvoiceCommand,
  'accept_invoice': AcceptInvoiceCommand,
  'recall_invoice': RecallInvoiceCommand,
  'confirm_payment': ConfirmPaymentCommand,
  'confirm_delivery': ConfirmDeliveryCommand,
  'add_tracking_number': AddTrackingNumberCommand,
  'upload_invoice': UploadInvoiceCommand,
  'select_alternative_product': SelectAlternativeProductCommand,
  'accept_alternative_product': AcceptAlternativeProductCommand,
  'reject_alternative_product': RejectAlternativeProductCommand,
  'set_shipping_cost': SetShippingCostCommand,
  'set_import_tariff': SetImportTariffCommand,
  // LGDEAL Internal Workflow Actions
  'assign_to_manager': AssignToManagerCommand,
  'stone_received': StoneReceivedCommand,
  'approve_quality': ApproveQualityCommand,
  'reject_quality': RejectQualityCommand,
  'assign_to_logist': AssignToLogistCommand,
  'reassign_manager': ReassignManagerCommand,
};

export const handleDealAction = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { dealId, actionName } = req.params;
  
  logger.debug(`[handleDealAction] Processing action: ${actionName} for deal: ${dealId}`);
  
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }
  
  const { userId, companyId, isLgdealSupervisor } = req.user;
  logger.debug('[handleDealAction] User context', { userId, companyId, isLgdealSupervisor });

  // Validate action name
  if (!actionName || typeof actionName !== 'string') {
    throw new ValidationError('Action name is required and must be a string');
  }

  // Get deal with populated products, buyerId, sellerId, and companies for notifications
  const deal = await Deal.findById(dealId)
    .populate('products.product')
    .populate('buyerId', 'firstName lastName email _id')
    .populate('sellerId', 'firstName lastName email _id')
    .populate('buyerCompanyId', 'name')
    .populate('sellerCompanyId', 'name');
  
  if (!deal) {
    throw new NotFoundError('Deal not found');
  }

  // Determine user role and allowed actions
  const isDirectLgdealDeal = deal.dealType === 'buyer-to-lgdeal' && (!deal.pairedDealIds || deal.pairedDealIds.length === 0);
  const currentUserRole = determineUserRole(deal, userId, companyId, !!isLgdealSupervisor, isDirectLgdealDeal);

  if (!currentUserRole) {
    throw new ForbiddenError('User role could not be determined for this deal');
  }

  // Fetch managersCount only when supervisor works with an assigned-manager buyer-to-lgdeal deal
  const needsManagersCount = (currentUserRole === 'LGDEAL seller' || currentUserRole === 'LGDEAL dual-role')
    && deal.dealType === 'buyer-to-lgdeal'
    && !!deal.assignedTo
    && deal.assignedRole === 'manager';

  const managersCount = needsManagersCount ? await fetchLgdealManagersCount() : undefined;

  const allowedActions = await getAllowedActions(deal, currentUserRole, isDirectLgdealDeal, managersCount);
  if (!allowedActions.includes(actionName)) {
    throw new ForbiddenError(`Action ${actionName} is not allowed for your role or current deal state`);
  }

  // All actions now handled through unified Command Pattern
  // Legacy proxy handlers removed - everything goes through commandMap

  // Use Command Pattern for complex actions handled within this controller.
  const CommandClass = commandMap[actionName];
  if (!CommandClass) {
    throw new ValidationError(`Action ${actionName} is not recognized or implemented yet`);
  }

  try {
    // 🔒 OPTIMISTIC LOCKING: Store original values BEFORE command execution
    const statusBeforeCommand = deal.status;
    const stageBeforeCommand = deal.stage;
    
    logger.info(`[handleDealAction] Executing command: ${actionName} with user role: ${currentUserRole}`, {
      originalStatus: statusBeforeCommand,
      originalStage: stageBeforeCommand
    });
    
    const command = new CommandClass();
    const { activityLogDetails } = await command.execute(deal, req as ActionRequest, currentUserRole);
    logger.info(`[handleDealAction] Command executed successfully: ${actionName}`, {
      newStatus: deal.status,
      newStage: deal.stage
    });
    
    // Common logic for adding activity log, saving the deal, and responding.
    if (activityLogDetails) {
      // Some commands might add their own specific, user-facing logs (e.g., 'message_sent').
      // This check prevents adding a generic, redundant log entry.
      const isLogAlreadyHandledByCommand = deal.activityLog.some(log => log.action === 'message_sent' && log.details === activityLogDetails);

      if (!isLogAlreadyHandledByCommand) {
        deal.activityLog.push({
          action: actionName, 
          performedBy: new mongoose.Types.ObjectId(userId) as Types.ObjectId | IUser,
          details: activityLogDetails,
          timestamp: new Date(),
        } as IActivityLog);
      }
    }
      
    deal.lastActionAt = new Date();
    
    // 🔒 OPTIMISTIC LOCKING: Use findOneAndUpdate to prevent race conditions
    // Save with condition on ORIGINAL status/stage to ensure no concurrent modifications
    const updatedDeal = await Deal.findOneAndUpdate(
      { 
        _id: deal._id,
        status: statusBeforeCommand, // ⬅️ Optimistic lock - check original status
        stage: stageBeforeCommand    // ⬅️ Check original stage
      },
      {
        $set: {
          status: deal.status,
          stage: deal.stage,
          amount: deal.amount,
          fee: deal.fee,
          products: deal.products,
          shippingDetails: deal.shippingDetails,
          paymentDetails: deal.paymentDetails,
          requestDetails: deal.requestDetails,
          pairedDealIds: deal.pairedDealIds,
          activePurchaseDealId: deal.activePurchaseDealId,
          completedAt: deal.completedAt,
          cancellationReason: deal.cancellationReason,
          negotiationDetails: deal.negotiationDetails,
          lastActionAt: deal.lastActionAt,
          activityLog: deal.activityLog, // Replace entire array with modified version
          // LGDEAL Internal Workflow fields
          assignedTo: deal.assignedTo,
          assignedRole: deal.assignedRole,
          assignedAt: deal.assignedAt,
          assignedBy: deal.assignedBy,
          assignmentHistory: deal.assignmentHistory
        }
      },
      { new: true }
    );
    
    if (!updatedDeal) {
      // Deal status was changed by another operation - conflict!
      logger.error('[handleDealAction] 🔒 Optimistic lock failed - deal status was changed concurrently', {
        dealId: deal._id,
        expectedStatus: statusBeforeCommand,
        expectedStage: stageBeforeCommand,
        actualDeal: await Deal.findById(deal._id).select('status stage'),
        actionName
      });
      throw new ValidationError(
        'Deal status was changed by another operation. Please refresh and try again.'
      );
    }
    
    logger.info('[handleDealAction] 🔒 Optimistic lock succeeded - deal updated safely', {
      dealId: deal._id,
      oldStatus: statusBeforeCommand,
      newStatus: updatedDeal.status,
      oldStage: stageBeforeCommand,
      newStage: updatedDeal.stage
    });
    
    // Replace deal object with updated version from DB
    Object.assign(deal, updatedDeal.toObject());

    // The 'deal' object is already updated in memory and saved. 
    // Repopulating it manually to ensure consistency without another DB hit for the whole deal.
    const dealForResponse = await deal.populate([
        { path: 'buyerId', select: 'firstName lastName email' },
        { path: 'sellerId', select: 'firstName lastName email' },
        { path: 'buyerCompanyId', select: 'name' },
        { path: 'sellerCompanyId', select: 'name' },
        { path: 'assignedTo', select: 'firstName lastName email role' },
        { path: 'assignedBy', select: 'firstName lastName email' },
        { path: 'activityLog.performedBy', select: 'firstName lastName' },
        { 
            path: 'products.product', 
            select: 'shape carat color clarity price certificateNumber certificateInstitute location company',
            populate: { path: 'company', select: 'name' }
        },
        { 
            path: 'products.suggestedAlternatives.product', 
            populate: { path: 'company', select: 'name' }
        },
        { 
            path: 'products.selectedAlternativeProduct', 
            populate: { path: 'company', select: 'name' }
        },
        {
            path: 'activePurchaseDealId',
            select: 'shippingDetails'
        }
    ]);

    // После выполнения команды assignedTo/assignedRole могут измениться — пересчитываем managersCount
    const needsManagersCountAfter = (currentUserRole === 'LGDEAL seller' || currentUserRole === 'LGDEAL dual-role')
      && deal.dealType === 'buyer-to-lgdeal'
      && !!deal.assignedTo
      && deal.assignedRole === 'manager';

    const managersCountAfter = needsManagersCountAfter ? await fetchLgdealManagersCount() : undefined;
    const dealStateInfo = await dealStateService.getDealStateInfo(dealForResponse, userId, companyId, !!isLgdealSupervisor, managersCountAfter);

    logger.info('[actionController] Action executed successfully', { actionName, dealId: deal._id });
    
    // Emit real-time deal update to all subscribed clients
    try {
      const emitDealUpdate = (global as typeof globalThis & { emitDealUpdate?: (dealId: string) => Promise<void> }).emitDealUpdate;
      if (emitDealUpdate) {
        await emitDealUpdate(deal._id.toString());
        logger.info('[actionController] ✅ Deal update emitted via WebSocket', { dealId: deal._id, actionName });
      } else {
        logger.warn('[actionController] ⚠️ emitDealUpdate not available on global object', { dealId: deal._id });
      }
    } catch (error) {
      logger.error('[actionController] ❌ Failed to emit deal update', { dealId: deal._id, error: getErrorMessage(error) });
      // Don't fail the request if WebSocket emit fails
    }
    
    // Send a consistent success response.
    // dealStateInfo already contains allowedActions (computed above) — reuse to avoid a second call.
    res.json({
      message: `Action '${actionName}' performed successfully.`,
      deal: {
        ...dealForResponse.toObject(),
        userRole: currentUserRole,
        allowedActions: dealStateInfo.allowedActions,
        isDirectLgdealDeal,
        dealState: dealStateInfo,
      },
    });

  } catch (error: unknown) {
    logger.error('[handleDealAction] Error executing action', { 
      actionName, 
      dealId, 
      error: getErrorMessage(error), 
      stack: error && typeof error === 'object' && 'stack' in error ? error.stack : undefined 
    });
    
    // Handle controlled errors from commands
    if (error instanceof ActionError) {
      logger.warn('[handleDealAction] ActionError detected', { statusCode: error.statusCode });
      // Re-throw as appropriate error type for our error handler
      if (error.statusCode === 400) {
        throw new ValidationError(error.message);
      } else if (error.statusCode === 403) {
        throw new ForbiddenError(error.message);
      } else if (error.statusCode === 404) {
        throw new NotFoundError(error.message);
      }
      throw new Error(error.message);
    }
    // Re-throw unexpected errors to be handled by global error handler
    throw error;
  }
}); 
