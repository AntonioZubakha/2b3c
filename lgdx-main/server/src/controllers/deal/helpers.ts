import { Types } from 'mongoose';
import Product from '../../models/Product';
import { IDeal, IProduct, IUser, DealStatus as TypeDealStatus, DealStage as TypeDealStage, ICompany, IActivityLog } from '../../types';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorHelpers';
import { DEAL_STAGES, DEAL_STATUSES, ACTIVITY_LOG_ACTIONS } from '../../types/constants';
import { toObjectIdString } from '../../types/mongoose-helpers';

// Types for role determination functions
export type UserRole = 'buyer' | 'seller' | 'LGDEAL buyer' | 'LGDEAL seller' | 'LGDEAL dual-role' | 'LGDEAL manager' | 'LGDEAL logist' | null;
export type DealType = 'buyer-to-lgdeal' | 'lgdeal-to-seller';
export type DealStage = TypeDealStage;
export type DealStatus = TypeDealStatus;

/**
 * Determines the LGDEAL role in a deal
 */
export const determineLgdealRole = (deal: IDeal, userIsLgdealAdmin: boolean): 'buyer' | 'seller' | null => {
  if (!userIsLgdealAdmin) return null;
  
  if (deal.dealType === 'buyer-to-lgdeal') {
    return 'seller'; // LGDEAL acts as the seller
  } else if (deal.dealType === 'lgdeal-to-seller') {
    return 'buyer'; // LGDEAL acts as the buyer
  }
  
  return null;
};

/**
 * Determines the user's role in a deal
 */
export const determineUserRole = (
  deal: IDeal,
  userId: string,
  companyId: string | undefined | Types.ObjectId, 
  isLgdealSupervisor: boolean,
  isDirectLgdealDeal: boolean
): UserRole => {
  logger.debug('[determineUserRole] Input', { userId, companyId: companyId?.toString?.() || companyId, isLgdealSupervisor, isDirectLgdealDeal });
  const userIdObj = new Types.ObjectId(userId);
  const userCompanyIdStr = typeof companyId === 'string' ? companyId : companyId?.toString();
  logger.debug('[determineUserRole] Converted', { userIdObj, userCompanyIdStr });

  // LGDEAL Internal Workflow: Check if user is assigned Manager or Logist
  if (deal.assignedTo) {
    const assignedToId = (deal.assignedTo as IUser)?._id || deal.assignedTo as Types.ObjectId;
    if (assignedToId?.toString() === userId) {
      if (deal.assignedRole === 'manager') {
        logger.debug('[determineUserRole] Determined role: LGDEAL manager (assigned)');
        return 'LGDEAL manager';
      }
      if (deal.assignedRole === 'logist') {
        logger.debug('[determineUserRole] Determined role: LGDEAL logist (assigned)');
        return 'LGDEAL logist';
      }
    }
  }

  // LGDEAL Supervisor роли (имеют доступ ко всем сделкам)
  if (isLgdealSupervisor) {
    if (isDirectLgdealDeal) return 'LGDEAL dual-role';
    if (deal.dealType === 'buyer-to-lgdeal') return 'LGDEAL seller';
    if (deal.dealType === 'lgdeal-to-seller') return 'LGDEAL buyer';
  }

  const dealBuyerId = (deal.buyerId as IUser)?._id || deal.buyerId as Types.ObjectId;
  const dealSellerId = (deal.sellerId as IUser)?._id || deal.sellerId as Types.ObjectId;
  const dealBuyerCompanyId = (deal.buyerCompanyId as ICompany)?._id?.toString() || (deal.buyerCompanyId as Types.ObjectId)?.toString();
  const dealSellerCompanyId = (deal.sellerCompanyId as ICompany)?._id?.toString() || (deal.sellerCompanyId as Types.ObjectId)?.toString();
  
  logger.debug('[determineUserRole] Deal data', { dealBuyerId, dealSellerId });
  logger.debug('[determineUserRole] Deal companies', { dealBuyerCompanyId, dealSellerCompanyId });

  if (dealBuyerId?.equals(userIdObj) || (dealBuyerCompanyId && dealBuyerCompanyId === userCompanyIdStr)) {
    logger.debug('[determineUserRole] Determined role: buyer');
    return 'buyer';
  }
  if (dealSellerId?.equals(userIdObj) || (dealSellerCompanyId && dealSellerCompanyId === userCompanyIdStr)) {
    logger.debug('[determineUserRole] Determined role: seller');
    return 'seller';
  }
  
  // Check if user is seller of any alternative products
  if (deal.products && Array.isArray(deal.products)) {
    for (const dealProduct of deal.products) {
      if (dealProduct.suggestedAlternatives && Array.isArray(dealProduct.suggestedAlternatives)) {
        for (const alternative of dealProduct.suggestedAlternatives) {
          const altProduct = alternative.product as IProduct;
          if (altProduct && altProduct.company) {
            const altCompanyId = toObjectIdString(altProduct.company);
            if (altCompanyId && altCompanyId === userCompanyIdStr) {
              logger.debug('[determineUserRole] Determined role: seller (via alternative product company)');
              return 'seller';
            }
          }
        }
      }
      // Also check selectedAlternativeProduct
      if (dealProduct.selectedAlternativeProduct) {
        const selectedAltProduct = dealProduct.selectedAlternativeProduct as IProduct;
        if (selectedAltProduct && selectedAltProduct.company) {
          const selectedAltCompanyId = toObjectIdString(selectedAltProduct.company);
          if (selectedAltCompanyId && selectedAltCompanyId === userCompanyIdStr) {
            logger.debug('[determineUserRole] Determined role: seller (via selected alternative product company)');
            return 'seller';
          }
        }
      }
    }
  }
  
  logger.debug('[determineUserRole] No role determined - returning null');
  return null;
};

/**
 * Checks if the transition between deal stages is valid
 */
export const isValidStageTransition = (currentStage: DealStage, nextStage: DealStage): boolean => {
  const allowedTransitions: Partial<Record<DealStage, DealStage[]>> = {
    request: ['payment_delivery', 'cancelled', 'completed'],
    payment_delivery: ['completed', 'cancelled', 'request'], // request: возврат при Reject Quality
    completed: [],
    cancelled: [],
  };
  return allowedTransitions[currentStage]?.includes(nextStage) || false;
};

// Use Partial<Record<DealStatus, DealStatus[]>> to represent possible transitions
// from one status to another within a specific stage.
type StageStatusTransitions = Partial<Record<DealStatus, DealStatus[]>>;
// Allowed status transitions by stage
const validTransitions: Partial<Record<DealStage, StageStatusTransitions>> = {
  request: {
    pending: ['rejected', 'alternative_product_proposed'],
    alternative_product_proposed: [], // переход в awaiting_invoice происходит через смену стадии (accept_alternative)
    rejected: [],
    cancelled: [],
    quality_rejected: ['assigned_to_manager'] // После выбора альтернативы супервайзер назначает менеджера
  },
  payment_delivery: {
    awaiting_invoice: ['invoice_pending'], // Поставщик загружает инвойс
    assigned_to_manager: ['quality_check_in_progress', 'cancelled'], // Manager получает камень
    quality_check_in_progress: ['quality_approved', 'quality_rejected', 'cancelled'], // Manager одобряет или отклоняет (возврат на request)
    quality_approved: ['ready_for_shipping', 'cancelled'], // Manager назначает logist'у
    ready_for_shipping: ['shipped', 'cancelled'], // Logist добавляет tracking
    invoice_pending: ['awaiting_payment', 'rejected', 'invoice_accepted', 'awaiting_invoice'], // awaiting_invoice: возврат при reject_invoice (buyer) или recall_invoice (seller)
    invoice_accepted: ['awaiting_payment'],
    awaiting_payment: ['payment_received', 'payment_pending'],
    payment_pending: ['payment_received', 'rejected'],
    payment_received: ['assigned_to_manager', 'shipped', 'awaiting_shipping_documents'], // После оплаты можно назначить менеджеру
    awaiting_shipping_documents: ['shipped', 'shipping_documents_uploaded'],
    shipping_documents_uploaded: ['shipped'],
    shipped: ['completed', 'delivery_confirmed'],
    delivery_confirmed: ['completed'],
    completed: [],
    rejected: [],
    cancelled: []
  },
  completed: {
    completed: []
  },
  cancelled: {
    cancelled: [],
    rejected: []
  }
};

/**
 * Checks if the transition between deal statuses is valid
 */
export const isValidStatusTransition = (
  currentStatus: DealStatus,
  nextStatus: DealStatus,
  stage: DealStage
): boolean => {
  const commonTransitions: DealStatus[] = ['cancelled'];
  if (commonTransitions.includes(nextStatus)) return true;

  const stageTransitions = validTransitions[stage];
  if (stageTransitions) {
    const statusTransitions = stageTransitions[currentStatus];
    if (statusTransitions) {
      return statusTransitions.includes(nextStatus);
    }
  }
  return false;
};

/**
 * Processes products upon deal completion or cancellation
 */
export const processProductsOnDealEnd = async (
  deal: IDeal,
  finalStatus: 'completed' | 'cancelled',
  performedById: string | Types.ObjectId
): Promise<void> => {
  try {
    for (const dealProduct of deal.products) {
      const product = await Product.findById(dealProduct.product);
      if (!product) {
        logger.error(`Product with ID ${dealProduct.product} not found during deal end processing.`);
        continue;
      }

      if (finalStatus === 'completed') {
        product.sold = true;
        product.status = 'Sold';
        await product.save();
      } else if (finalStatus === 'cancelled') {
        if (product.status === 'OnDeal') { 
            product.status = 'available'; 
            product.sold = false;
            await product.save();
        }
      }
    }
  } catch (error: unknown) {
    logger.error(`Error processing products on deal end for deal ${deal.dealNumber}: ${getErrorMessage(error)}`);
  }
};

/**
 * Determines allowed actions based on the deal state and user role
 * @param managersCount Optional count of managers in LGDEAL company (for reassign_manager action)
 */
export const getAllowedActions = async (
  deal: IDeal,
  userRole: UserRole,
  isDirectLgdealDeal: boolean,
  managersCount?: number
): Promise<string[]> => {
  const { stage, status } = deal;
  const actions: string[] = [];

  logger.debug(`[getAllowedActions] DIAGNOSTIC`, { dealNumber: deal.dealNumber, stage, status, userRole, dealType: deal.dealType, isDirectLgdealDeal });

  if (status === 'completed' || status === 'cancelled' || status === 'rejected') {
    logger.debug(`[getAllowedActions] Deal is in final state (${status}), returning empty actions`);
    return []; // No actions on final-state deals
  }

  const isBuyerRole = userRole === 'buyer' || userRole === 'LGDEAL buyer' || userRole === 'LGDEAL dual-role';
  const isSellerRole = userRole === 'seller' || userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role';

  logger.debug(`[getAllowedActions] Role check - isBuyerRole: ${isBuyerRole}, isSellerRole: ${isSellerRole}`);

  // cancel_deal: buyer cannot cancel when quality_rejected — payment already received by LGDEAL
  const buyerCanCancel = isBuyerRole && status !== 'quality_rejected';
  if (buyerCanCancel || isSellerRole) {
    actions.push('cancel_deal');
    logger.debug(`[getAllowedActions] Added cancel_deal`);
  }

  if (deal.invoiceUrl) {
    actions.push('download_invoice');
    logger.debug(`[getAllowedActions] Added download_invoice (invoice exists)`);
  }

  // --- Stage-Specific Actions ---
  logger.debug(`[getAllowedActions] Processing stage-specific actions for stage: ${stage}`);
  switch (stage) {
    case 'request':
      logger.debug(`[getAllowedActions] Processing REQUEST stage actions`);
      if (userRole === 'seller' || userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role') {
        logger.debug(`[getAllowedActions] User has seller role, checking status conditions`);
        if (status === 'pending') {
          actions.push('approve_request', 'reject_request');
          logger.debug(`[getAllowedActions] Added approve_request, reject_request for pending status`);
        }
        // A seller can always set their shipping cost during the request stage, regardless of status
        actions.push('set_shipping_cost');
        logger.debug(`[getAllowedActions] Added set_shipping_cost for seller role in request stage`);
      } else {
        logger.debug(`[getAllowedActions] User does NOT have seller role, userRole: ${userRole}`);
      }
      if (userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role') {
        logger.debug(`[getAllowedActions] User has LGDEAL seller role, checking alternative product actions`);
        if (status === 'pending' || status === 'quality_rejected') {
            actions.push('select_alternative_product');
            logger.debug(`[getAllowedActions] Added select_alternative_product for LGDEAL seller`);
        }
        // Import tariff only on buyer-to-lgdeal (LGDEAL as seller to buyer), not on lgdeal-to-seller
        if (deal.dealType === 'buyer-to-lgdeal') {
          actions.push('set_import_tariff');
          logger.debug(`[getAllowedActions] Added set_import_tariff for LGDEAL seller on buyer-to-lgdeal`);
        }
      }
      break;

    case 'payment_delivery':
      // Seller-like roles actions
      if (userRole === 'seller' || userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role') {
        if (status === 'awaiting_invoice') {
          actions.push('upload_invoice');
          // Перед выставлением счёта (или после отзыва/отклонения предыдущего)
          // продавец может скорректировать стоимость доставки и (для buyer-to-lgdeal)
          // импортный тариф — без возврата на стадию request.
          actions.push('set_shipping_cost');
          if ((userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role') && deal.dealType === 'buyer-to-lgdeal') {
            actions.push('set_import_tariff');
          }
        }
        if (status === 'invoice_pending') {
          // Только сторона, загрузившая инвойс, может его отозвать.
          // sellerCompanyId может быть populated-объектом (ICompany) или ObjectId.
          const sellerCompanyIdStr = userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role'
            ? 'lgdeal'
            : ((deal.sellerCompanyId as ICompany)?._id?.toString() || (deal.sellerCompanyId as Types.ObjectId)?.toString());
          if (sellerCompanyIdStr && deal.paymentDetails?.uploadedByCompany === sellerCompanyIdStr) {
            actions.push('recall_invoice');
            logger.debug(`[getAllowedActions] Added recall_invoice for seller (uploadedByCompany matches)`);
          }
        }
        if (status === 'awaiting_payment') {
          actions.push('confirm_payment');
        }
        if (status === 'payment_received') {
          actions.push('add_tracking_number');
        }
      }
      
      // Buyer-like roles actions
      if (userRole === 'buyer' || userRole === 'LGDEAL buyer' || userRole === 'LGDEAL dual-role') {
        if (status === 'invoice_pending') {
            // Check if the current user's company uploaded the invoice
            // If they did, they shouldn't see accept/reject buttons
            const currentUserCompanyId = userRole === 'LGDEAL buyer' || userRole === 'LGDEAL dual-role' 
              ? 'lgdeal' // For LGDEAL users, we need to check if they uploaded the invoice
              : null;
            
            // For regular buyers, check if their company uploaded the invoice
            const buyerCompanyId = userRole === 'buyer' ? deal.buyerCompanyId?.toString() : null;
            
            // Only show accept/reject if the user's company didn't upload the invoice
            const invoiceUploadedByUserCompany = 
              (currentUserCompanyId && deal.paymentDetails?.uploadedByCompany === currentUserCompanyId) ||
              (buyerCompanyId && deal.paymentDetails?.uploadedByCompany === buyerCompanyId);
            
            if (!invoiceUploadedByUserCompany) {
              actions.push('accept_invoice', 'reject_invoice');
            }
        }
        if (status === 'shipped') {
          actions.push('confirm_delivery');
        }
      }
      break;
  }

  // Final check for alternative product proposal status, which can override some stage logic
  if (status === 'alternative_product_proposed') {
    if (userRole === 'buyer') {
      actions.push('accept_alternative_product', 'reject_alternative_product');
    }
    // Allow all sellers to set shipping cost while proposal is with the buyer
    if (userRole === 'seller' || userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role') {
      actions.push('set_shipping_cost');
    }
    if ((userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role') && deal.dealType === 'buyer-to-lgdeal') {
      actions.push('set_import_tariff');
    }
  }

  // LGDEAL Internal Workflow Actions
  logger.debug(`[getAllowedActions] Checking LGDEAL Internal Workflow actions`);
  
  // LGDEAL Supervisor actions
  if (userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role') {
    // Может назначать manager'ам buyer-to-lgdeal сделки: payment_received (оплата получена) или quality_rejected (возврат на request после отклонения качества)
    if (deal.dealType === 'buyer-to-lgdeal' && !deal.assignedTo && (status === 'payment_received' || status === 'quality_rejected')) {
      actions.push('assign_to_manager');
      logger.debug(`[getAllowedActions] Added assign_to_manager for supervisor (payment_received or quality_rejected on buyer-to-lgdeal)`);
    }
    
    // Может переназначать сделки между manager'ами (только если >1 manager в компании)
    if (deal.dealType === 'buyer-to-lgdeal' && deal.assignedTo && deal.assignedRole === 'manager') {
      // Показывать reassign_manager только если есть более 1 manager'а
      if (managersCount === undefined || managersCount > 1) {
        actions.push('reassign_manager');
        logger.debug(`[getAllowedActions] Added reassign_manager for supervisor (managersCount: ${managersCount})`);
      } else {
        logger.debug(`[getAllowedActions] Skipped reassign_manager - only ${managersCount} manager(s) in company`);
      }
    }
  }

  // LGDEAL Manager actions
  if (userRole === 'LGDEAL manager') {
    logger.debug(`[getAllowedActions] Processing LGDEAL manager actions, status: ${status}, dealType: ${deal.dealType}`);
    
    // Managers work only with buyer-to-lgdeal deals (продажи покупателям)
    if (deal.dealType === 'buyer-to-lgdeal') {
      if (status === 'assigned_to_manager') {
        actions.push('stone_received');
        logger.debug(`[getAllowedActions] Added stone_received for manager`);
      }
      
      if (status === 'quality_check_in_progress') {
        actions.push('approve_quality', 'reject_quality');
        logger.debug(`[getAllowedActions] Added approve_quality, reject_quality for manager`);
      }
      
      if (status === 'quality_approved') {
        actions.push('assign_to_logist');
        logger.debug(`[getAllowedActions] Added assign_to_logist for manager`);
      }
    }
  }

  // LGDEAL Logist actions
  if (userRole === 'LGDEAL logist') {
    logger.debug(`[getAllowedActions] Processing LGDEAL logist actions, status: ${status}, dealType: ${deal.dealType}`);
    
    // Logists work only with buyer-to-lgdeal deals (продажи покупателям)
    // Они организуют доставку покупателям
    if (deal.dealType === 'buyer-to-lgdeal') {
      if (status === 'ready_for_shipping') {
        actions.push('add_tracking_number');
        logger.debug(`[getAllowedActions] Added add_tracking_number for logist`);
      }
      // Note: confirm_delivery is done by buyer, not logist
    }
  }

  return [...new Set(actions)]; // Return unique actions
};

// Constants for color search
const COLOR_GRADES = ['D', 'E', 'F', 'G'];

/**
 * Gets the search criteria for color
 */
export const getColorSearchCriteria = (primaryColor: string | undefined): string[] => {
  if (!primaryColor) return []; // If color is not defined, return an empty array
  
  const upperColor = primaryColor.toUpperCase();
  const index = COLOR_GRADES.indexOf(upperColor);
  if (index === -1) {
    return [upperColor];
  }
  const criteria = [COLOR_GRADES[index]];
  return criteria;
};

/**
 * Finds alternative products for the specified product.
 * Uses tolerance from admin constants (measurements/ratio/geometry and carat).
 */
export const findAlternativeProducts = async (primaryProduct: IProduct, limit: number = 3): Promise<IProduct[]> => {
  if (!primaryProduct) {
    return [];
  }

  const ConstantsSettingsService = (await import('../../services/constantsSettingsService')).default;
  const constants = await ConstantsSettingsService.getSettingsOrCached();
  const tol = constants.measurementRatioGeometryTolerancePct ?? 0.025;
  const weightTolerance = constants.alternativesCaratTolerance ?? 0.03;
  const colorCriteria = getColorSearchCriteria(primaryProduct.color);

  const carat = primaryProduct.carat || 0;
  const weightLowerBound = carat - weightTolerance;
  const weightUpperBound = carat + weightTolerance;

  try {
    const query: any = {
      _id: { $ne: primaryProduct._id },
      shape: primaryProduct.shape,
      carat: { $gte: weightLowerBound, $lte: weightUpperBound },
      clarity: primaryProduct.clarity,
      sold: false,
      status: 'available',
      company: { $ne: primaryProduct.company }
    };

    if (colorCriteria.length > 0) {
      query.color = { $in: colorCriteria };
    }

    // Measurements, ratio, geometry: 2.5% tolerance (only when primary has value)
    const addNumericRange = (key: string, refVal: number | undefined) => {
      if (refVal != null && typeof refVal === 'number' && refVal > 0) {
        query[key] = { $gte: refVal * (1 - tol), $lte: refVal * (1 + tol) };
      }
    };
    addNumericRange('ratio', primaryProduct.ratio);
    addNumericRange('measurement1', primaryProduct.measurement1);
    addNumericRange('measurement2', primaryProduct.measurement2);
    addNumericRange('measurement3', primaryProduct.measurement3);
    addNumericRange('tableSize', primaryProduct.tableSize);
    addNumericRange('totalDepth', primaryProduct.totalDepth);
    addNumericRange('crownHeight', primaryProduct.crownHeight);
    addNumericRange('pavilionDepth', primaryProduct.pavilionDepth);

    const alternatives = await Product.find(query)
      .sort({ carat: 1 })
      .limit(limit)
      .populate('company', 'name')
      .select('_id price marketPrice carat color clarity shape company certificateNumber location');

    return alternatives;
  } catch (error) {
    logger.error('Error finding alternative products:', { error });
    return [];
  }
};

/**
 * Comprehensive function to find and cancel all related deals
 */
export const cancelAllRelatedDeals = async (mainDeal: IDeal, userId: string, rejectionReason?: string): Promise<void> => {
  // If the deal being cancelled is just an alternative supplier purchase, do not cascade cancel its parent.
  // The deal itself is cancelled by the command, this function only handles the *cascade*.
  if (mainDeal.dealType === 'lgdeal-to-seller' && mainDeal.metadata?.dashboardDealType === 'alternativeSupplierPurchase') {
    logger.info(`[cancelAllRelatedDeals] This is an alternative supplier deal (${mainDeal.dealNumber}). No cascading cancellation will be performed.`);
    return;
  }

  const relatedDealIds = new Set<string>();
  const mainDealId = mainDeal._id.toString();

  logger.info(`[cancelAllRelatedDeals] Finding all related deals for main deal ${mainDeal.dealNumber} (${mainDealId})`);

  // 1. Direct paired deals from pairedDealIds
  if (mainDeal.pairedDealIds && mainDeal.pairedDealIds.length > 0) {
    mainDeal.pairedDealIds.forEach(id => {
      const dealId = toObjectIdString(id) || '';
      if (dealId) {
        relatedDealIds.add(dealId);
        logger.debug(`[cancelAllRelatedDeals] Added from pairedDealIds: ${dealId}`);
      }
    });
  }

  // 2. Deals from suggestedAlternatives
  if (mainDeal.products) {
    mainDeal.products.forEach(product => {
      if (product.suggestedAlternatives) {
        product.suggestedAlternatives.forEach(alt => {
          if (alt.pairedLgdealToSellerDealId) {
            const dealId = toObjectIdString(alt.pairedLgdealToSellerDealId) || '';
            if (dealId) {
              relatedDealIds.add(dealId);
              logger.debug(`[cancelAllRelatedDeals] Added from suggestedAlternatives: ${dealId}`);
            }
          }
        });
      }
    });
  }

  // 3. Single pairedDealId (if exists)
  if (mainDeal.pairedDealId) {
    const dealId = toObjectIdString(mainDeal.pairedDealId) || '';
    if (dealId) {
      relatedDealIds.add(dealId);
      logger.debug(`[cancelAllRelatedDeals] Added from pairedDealId: ${dealId}`);
    }
  }

  // 4. Find deals that reference this deal as their paired deal
  try {
    const Deal = (await import("../../models/Deal")).default;
    const dealsReferencingMain = await Deal.find({
      $or: [
        { pairedDealId: mainDeal._id },
        { pairedDealIds: mainDeal._id }
      ],
      status: { $nin: ['completed', 'cancelled'] }
    }).select('_id dealNumber');

    dealsReferencingMain.forEach(deal => {
      relatedDealIds.add(deal._id.toString());
      logger.debug(`[cancelAllRelatedDeals] Added reverse reference: ${deal._id} (${deal.dealNumber})`);
    });
  } catch (error: unknown) {
    logger.error(`[cancelAllRelatedDeals] Error finding reverse references: ${getErrorMessage(error)}`);
  }

  // 5. For buyer-to-lgdeal deals, find all lgdeal-to-seller deals with products from this deal
  if (mainDeal.dealType === 'buyer-to-lgdeal' && mainDeal.products) {
    try {
      const Deal = (await import("../../models/Deal")).default;
      const productIds = mainDeal.products.map(p => toObjectIdString(p.product) || '').filter(Boolean);
      
      const relatedSellerDeals = await Deal.find({
        dealType: 'lgdeal-to-seller',
        'products.product': { $in: productIds },
        status: { $nin: ['completed', 'cancelled'] }
      }).select('_id dealNumber');

      relatedSellerDeals.forEach(deal => {
        relatedDealIds.add(deal._id.toString());
        logger.debug(`[cancelAllRelatedDeals] Added by product match: ${deal._id} (${deal.dealNumber})`);
      });
    } catch (error: unknown) {
      logger.error(`[cancelAllRelatedDeals] Error finding deals by product match: ${getErrorMessage(error)}`);
    }
  }

  // 6. For lgdeal-to-seller deals, find the main buyer deal
  if (mainDeal.dealType === 'lgdeal-to-seller') {
    // Only cascade-cancel the parent if the cancelled deal was for a primary product.
    if (mainDeal.metadata?.dashboardDealType === 'alternativeSupplierPurchase') {
        logger.info(`[cancelAllRelatedDeals] Skipping parent deal cancellation for alternative supplier deal ${mainDeal.dealNumber}`);
    } else {
        // This is a primary supplier purchase, or metadata is missing. Default to old (cascading) behavior.
        try {
            const Deal = (await import("../../models/Deal")).default;
            const mainBuyerDeals = await Deal.find({
                dealType: 'buyer-to-lgdeal',
                $or: [
                    { pairedDealId: mainDeal._id },
                    { pairedDealIds: mainDeal._id },
                    { 'products.suggestedAlternatives.pairedLgdealToSellerDealId': mainDeal._id }
                ],
                status: { $nin: ['completed', 'cancelled'] }
            }).select('_id dealNumber');

            mainBuyerDeals.forEach(deal => {
                relatedDealIds.add(deal._id.toString());
                logger.debug(`[cancelAllRelatedDeals] Added main buyer deal for cancellation: ${deal._id} (${deal.dealNumber})`);
            });
        } catch (error: unknown) {
            logger.error(`[cancelAllRelatedDeals] Error finding main buyer deals: ${getErrorMessage(error)}`);
        }
    }
  }

  // Remove the main deal from the list (we don't want to cancel it twice)
  relatedDealIds.delete(mainDealId);

  logger.info(`[cancelAllRelatedDeals] Found ${relatedDealIds.size} related deals to cancel`, { relatedDealIds: Array.from(relatedDealIds) });

  // Cancel all related deals
  if (relatedDealIds.size > 0) {
    const mongoose = (await import("mongoose")).default;
    const Deal = (await import("../../models/Deal")).default;
    
    for (const relatedDealId of Array.from(relatedDealIds)) {
      try {
        const relatedDeal = await Deal.findById(relatedDealId) as IDeal | null;
        if (relatedDeal && relatedDeal.status !== 'completed' && relatedDeal.status !== 'cancelled') {
          
          // Process products before updating deal status
          await processProductsOnDealEnd(relatedDeal, 'cancelled', userId);
          
          // 🔒 OPTIMISTIC LOCKING: Use updateOne with status/stage conditions
          const updateResult = await Deal.updateOne(
            { 
              _id: relatedDealId,
              status: relatedDeal.status, // ⬅️ Optimistic lock
              stage: relatedDeal.stage
            },
            {
              $set: {
                stage: 'cancelled' as DealStage,
                status: 'cancelled' as DealStatus,
                cancellationReason: rejectionReason || 'Cascaded from main deal cancellation',
                lastActionAt: new Date()
              },
              $push: {
                activityLog: {
                  action: 'deal_cancelled_cascaded',
                  performedBy: new mongoose.Types.ObjectId(userId) as Types.ObjectId | IUser,
                  details: `Deal automatically cancelled because related deal #${mainDeal.dealNumber} was cancelled. ${rejectionReason ? `Reason: ${rejectionReason}` : ''}`,
                  timestamp: new Date(),
                } as IActivityLog
              }
            }
          );
          
          if (updateResult.modifiedCount > 0) {
            logger.info(`[cancelAllRelatedDeals] ✅ Successfully cancelled related deal ${relatedDeal.dealNumber} (${relatedDealId})`);
            // Push real-time update so every participant of the related deal sees the cancellation immediately
            const emitFn = (global as typeof globalThis & { emitDealUpdate?: (id: string) => Promise<void> }).emitDealUpdate;
            if (emitFn) {
              emitFn(relatedDealId).catch((e: unknown) =>
                logger.warn(`[cancelAllRelatedDeals] emitDealUpdate failed for cascaded deal ${relatedDealId}`, { error: e })
              );
            }
          } else {
            logger.warn(`[cancelAllRelatedDeals] ⚠️  Failed to cancel related deal ${relatedDealId} - status was changed by another operation`);
          }
        } else if (relatedDeal) {
          logger.info(`[cancelAllRelatedDeals] Skipped deal ${relatedDeal.dealNumber} - already ${relatedDeal.status}`);
        } else {
          logger.warn(`[cancelAllRelatedDeals] Deal ${relatedDealId} not found`);
        }
      } catch (error: unknown) {
        logger.error(`[cancelAllRelatedDeals] Error cancelling related deal ${relatedDealId}: ${getErrorMessage(error)}`);
        // Continue with other deals even if one fails
      }
    }
  }

  logger.info(`[cancelAllRelatedDeals] Completed cascading cancellation for deal ${mainDeal.dealNumber}`);
}; 