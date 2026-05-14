import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import Deal from '../../models/Deal';
import User from '../../models/User';
import Company from '../../models/Company';
import marketplaceConfig from '../../config/marketplace';
import Product from '../../models/Product';
import {
  determineUserRole,
  isValidStageTransition,
  isValidStatusTransition,
  processProductsOnDealEnd,
  getAllowedActions,
  UserRole,
  DealStage,
  DealStatus
} from './helpers';
import { IDeal, IUser, ICompany, IProduct, IDealProduct, INegotiationDetails, IShippingDetails, IActivityLog, IProposedTerm, IProposedTermProduct } from '../../types';
// Import DealService for proper population
import { DealService } from '../../services/dealService';

import { DealStateService } from '../../services/dealStateService';
import { 
    NotFoundError, 
    UnauthorizedError, 
    ForbiddenError, 
    ValidationError,
    asyncHandler 
} from '../../middleware/errorHandler';
import { sendDealChangeNotification } from '../../utils/telegramBot';

// Initialize service instances
const dealService = new DealService();
const dealStateService = new DealStateService();

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
    companyId?: string;
    isLgdealSupervisor?: boolean;
  };
  params: {
    dealId: string;
  };
  body: {
    stage?: DealStage;
    status?: DealStatus;
    notes?: string;
    shippingCost?: number;
  };
}

const userPopulateFields = 'email firstName lastName companyId';
const activityLogPopulatePath = { path: 'activityLog.performedBy', select: userPopulateFields, model: 'User' };
const negotiationTermsPopulatePath = { path: 'negotiationDetails.proposedTerms.proposedBy', select: userPopulateFields, model: 'User' };
const negotiationFinalTermsProductsPopulatePath = { path: 'negotiationDetails.finalTerms.products.product', select: 'shape carat color clarity cut price marketPrice certificateNumber location certificateInstitute company', populate: {path: 'company', select: 'name'}, model: 'Product' };
const productsProductPopulatePath = {
    path: 'products.product',
    select: 'shape carat color clarity cut price marketPrice certificateNumber location certificateInstitute company',
    populate: { path: 'company', select: 'name' }
};
const suggestedAlternativesProductPopulatePath = { path: 'products.suggestedAlternatives.product', select: 'shape carat color clarity cut price marketPrice certificateNumber location certificateInstitute company', populate: {path: 'company', select: 'name'} };
const selectedAlternativeProductPopulatePath = { path: 'products.selectedAlternativeProduct', select: 'shape carat color clarity cut price marketPrice certificateNumber location certificateInstitute company', populate: {path: 'company', select: 'name'} };
// originalProductDetailsBeforeSwap is now stored as a full object, no need to populate

export const updateDealStage = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { dealId } = req.params;
  const { stage, status, notes, shippingCost } = req.body;
  
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }
  
  const userId = new Types.ObjectId(req.user.userId);

  let deal = await Deal.findById(dealId)
    .populate('buyerCompanyId', 'name')
    .populate('sellerCompanyId', 'name') as IDeal | null;
  if (!deal) {
    throw new NotFoundError('Deal not found');
  }

  const isDirectLgdealDeal = deal.dealType === 'buyer-to-lgdeal' && (!deal.pairedDealIds || deal.pairedDealIds.length === 0);
  const userRole = determineUserRole(deal, req.user.userId, req.user.companyId, !!req.user.isLgdealSupervisor, isDirectLgdealDeal);

  if (!userRole) {
    throw new ForbiddenError('Not authorized to update this deal');
  }

  if (stage && stage !== deal.stage && !isValidStageTransition(deal.stage, stage)) {
    throw new ValidationError(`Invalid stage transition from ${deal.stage} to ${stage}`);
  }

  if (status && status !== deal.status && !isValidStatusTransition(deal.status, status, stage || deal.stage)) {
    throw new ValidationError(`Invalid status transition from ${deal.status} to ${status} in ${stage || deal.stage} stage`);
  }

  if (typeof shippingCost === 'number') {
    if (shippingCost < 0) {
      throw new ValidationError('Shipping cost cannot be negative');
    }
    if (!deal.shippingDetails) deal.shippingDetails = { cost: 0 } as IShippingDetails;
    const previousCost = deal.shippingDetails.cost;
    deal.shippingDetails.cost = shippingCost;
    deal.activityLog.push({
      action: 'shipping_cost_updated',
      performedBy: userId as unknown as IUser,
      details: `Shipping cost ${previousCost ? 'updated from $'+previousCost.toFixed(2) : 'set'} to $${shippingCost.toFixed(2)} by ${userRole} via general update.`,
      timestamp: new Date()
    } as IActivityLog);
  }

  const oldStage = deal.stage;
  const oldStatus = deal.status;

  if (stage) deal.stage = stage;
  if (status) deal.status = status;
  if (notes) deal.notes = notes; 

  let logDetailsParts: string[] = [];
  if (stage && oldStage !== deal.stage) logDetailsParts.push(`stage changed to ${deal.stage}`);
  if (status && oldStatus !== deal.status) logDetailsParts.push(`status changed to ${deal.status}`);
  // Consider logging note changes if important, e.g. if (notes && deal.notes !== notes) logDetailsParts.push('notes updated');
  // Shipping cost updates are logged separately and more specifically.

  if (logDetailsParts.length > 0) {
    deal.activityLog.push({
      action: 'deal_generic_update', 
      performedBy: userId as unknown as IUser,
      details: `Deal ${logDetailsParts.join(', ')} by ${userRole} via general update.`,
      timestamp: new Date(),
    } as IActivityLog);
  }

  deal.lastActionAt = new Date();
  await deal.save();

  // Send Telegram notification for deal changes
  if (logDetailsParts.length > 0) {
    try {
      const changeType = stage && oldStage !== deal.stage && status && oldStatus !== deal.status ? 'both' :
                        stage && oldStage !== deal.stage ? 'stage' : 'status';
      
      const buyerName = (deal.buyerCompanyId as ICompany)?.name;
      const sellerName = (deal.sellerCompanyId as ICompany)?.name;
      sendDealChangeNotification({
        dealNumber: deal.dealNumber,
        dealId: deal._id.toString(),
        oldStatus: oldStatus,
        newStatus: deal.status,
        oldStage: oldStage,
        newStage: deal.stage,
        changedBy: userRole,
        changeType: changeType as 'status' | 'stage' | 'both',
        buyerName,
        sellerName,
        additionalInfo: notes ? `Notes: ${notes}` : undefined
      });
    } catch (error) {
      console.error('Failed to send deal change notification:', error);
    }
  }

  const populatedDealForResponse = await dealService.getDealFull(dealId);

  if (!populatedDealForResponse) {
    throw new NotFoundError('Populated deal for response not found');
  }
  
  const responseUserRole = determineUserRole(deal, req.user.userId, req.user.companyId, !!req.user.isLgdealSupervisor, isDirectLgdealDeal);

  // Fetch managersCount for supervisor + assigned-manager deals
  let managersCount: number | undefined;
  if ((responseUserRole === 'LGDEAL seller' || responseUserRole === 'LGDEAL dual-role')
    && deal.dealType === 'buyer-to-lgdeal'
    && deal.assignedTo
    && deal.assignedRole === 'manager') {
    try {
      const lgdealCompany = await Company.findOne({ name: marketplaceConfig.managementCompany.name });
      if (lgdealCompany) {
        managersCount = await User.countDocuments({ company: lgdealCompany._id, role: 'manager', isActive: true });
      }
    } catch { /* безопасный fallback */ }
  }

  const response = {
    message: 'Deal updated successfully (generic)',
    deal: {
      ...populatedDealForResponse,
      userRole: responseUserRole,
      allowedActions: await getAllowedActions(deal, responseUserRole, isDirectLgdealDeal, managersCount),
      isDirectLgdealDeal
    }
  };
  
  res.json(response);
});

/**
 * Get the comprehensive state of a deal for the UI
 */
export const getDealState = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }
    const { dealId } = req.params;
    const { userId, companyId, isLgdealSupervisor } = req.user;

    if (!mongoose.Types.ObjectId.isValid(dealId)) {
        throw new ValidationError('Invalid Deal ID format');
    }

    const deal = await Deal.findById(dealId).populate([
        { path: 'products.product', populate: { path: 'company' } },
        { path: 'products.suggestedAlternatives.product', populate: { path: 'company' } },
        { path: 'products.selectedAlternativeProduct', populate: { path: 'company' } },
        { path: 'validationRequests.productId' },
        { path: 'validationRequests.approvedBy' },
        { path: 'pairedDealIds' } 
    ]);

    if (!deal) {
        throw new NotFoundError('Deal not found');
    }

    const dealStateInfo = await dealStateService.getDealStateInfo(deal, userId, companyId, isLgdealSupervisor);
    
    res.json({
        success: true,
        dealState: dealStateInfo
    });
}); 