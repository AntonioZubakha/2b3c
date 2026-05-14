import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Deal from '../../models/Deal';
import User from '../../models/User';
import Company from '../../models/Company';
import marketplaceConfig from '../../config/marketplace'; // Assuming typed marketplace config
import { getAllowedActions, determineUserRole, UserRole } from './helpers';
import { IDeal, IUser, ICompany, IProduct, IDealProduct, IDashboardDeal } from '../../types';
import { NotFoundError, UnauthorizedError, asyncHandler } from '../../middleware/errorHandler';
import fs from 'fs';
import path from 'path';
import { ForbiddenError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

import { DealService } from '../../services/dealService';
import { DealStateService } from '../../services/dealStateService'; // Import DealStateService


const dealService = new DealService();
const dealStateService = new DealStateService(); // Instantiate DealStateService

// Define a type for the request object that includes the user property
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string; 
    companyId?: string; // companyId can be string or Types.ObjectId, ensure consistency
    isLgdealSupervisor?: boolean;
    isLgdealAdmin?: boolean; 
    isImpersonation?: boolean;
  };
  params: {
    dealId: string;
  }
}

// Assuming marketplaceConfig structure - replace with actual type if available
interface MarketplaceConfig {
    managementCompany: {
        name: string;
    };
}

const productPopulateFields = 'shape carat color clarity cut price marketPrice certificateNumber location certificateInstitute company originalPrice quantity isSold status';

/**
 * Get all buyer's deals
 */
export const getBuyerDeals = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  logger.debug('[getBuyerDeals] Starting buyer deals fetch...');
  
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }
  
  const userId = req.user.userId;
  const isLgdealSupport = !!(req.user.isLgdealSupervisor || req.user.isLgdealAdmin || req.user.role === 'admin');
  
  // During impersonation, act as the impersonated user, not as a supervisor.
  if (isLgdealSupport && !req.user.isImpersonation) { 
    const lgdealCompany = await Company.findOne({ 
      name: (marketplaceConfig as MarketplaceConfig).managementCompany.name 
    }) as ICompany | null;
    
    if (!lgdealCompany) {
      throw new NotFoundError('Management company not found');
    }
    
    const deals = await Deal.find({ 
      buyerCompanyId: lgdealCompany._id,
      dealType: 'lgdeal-to-seller'
    })
    .populate<{ products: IDealProduct[] }>({ path: 'products.product', select: productPopulateFields })
    .populate<{ sellerCompanyId: ICompany }>('sellerCompanyId', 'name')
    .populate<{ pairedDealId: { buyerCompanyId: ICompany } }>({ 
      path: 'pairedDealId',
      select: 'buyerCompanyId',
      populate: {
        path: 'buyerCompanyId',
        select: 'name'
      }
    })
    .sort({ createdAt: -1 });
    
    logger.info(`[getBuyerDeals] Returning ${deals.length} LGDEAL buyer deals (support/admin)`);
    res.json({ deals: deals as IDeal[] });
    return;
  }
  
  const deals = await Deal.find({ 
    buyerId: new Types.ObjectId(userId),
    dealType: 'buyer-to-lgdeal'
  })
  .populate<{ products: IDealProduct[] }>({ path: 'products.product', select: productPopulateFields })
  .populate<{ sellerCompanyId: ICompany }>('sellerCompanyId', 'name')
  .populate<{ pairedDealId: { sellerCompanyId: ICompany } }>({ 
    path: 'pairedDealId',
    select: 'sellerCompanyId',
    populate: {
      path: 'sellerCompanyId',
      select: 'name'
    }
  })
  .sort({ createdAt: -1 });
  
  logger.info(`[getBuyerDeals] Returning ${deals.length} regular buyer deals for user ${userId}`);
  res.json({ deals: deals as IDeal[] });
});

/**
 * Get all seller's deals
 */
export const getSellerDeals = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  logger.debug('[getSellerDeals] Starting seller deals fetch...');
  
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }
  
  const userId = req.user.userId;
  const isLgdealSupport = !!(req.user.isLgdealSupervisor || req.user.isLgdealAdmin || req.user.role === 'admin');
  
  // During impersonation, act as the impersonated user, not as a supervisor.
  if (isLgdealSupport && !req.user.isImpersonation) {
    const lgdealCompany = await Company.findOne({ 
      name: (marketplaceConfig as MarketplaceConfig).managementCompany.name 
    }) as ICompany | null;
    
    if (!lgdealCompany) {
      throw new NotFoundError('Management company not found');
    }
    
    const deals = await Deal.find({ 
      sellerCompanyId: lgdealCompany._id,
      dealType: 'buyer-to-lgdeal'
    })
    .populate<{ buyerId: IUser }>('buyerId', 'firstName lastName email')
    .populate<{ products: IDealProduct[] }>({ path: 'products.product', select: productPopulateFields })
    .populate<{ buyerCompanyId: ICompany }>('buyerCompanyId', 'name')
    .populate<{ pairedDealId: { sellerCompanyId: ICompany } }>({ 
      path: 'pairedDealId',
      select: 'sellerCompanyId',
      populate: {
        path: 'sellerCompanyId',
        select: 'name'
      }
    })
    .sort({ createdAt: -1 });
    
    logger.info(`[getSellerDeals] Returning ${deals.length} LGDEAL seller deals (support/admin)`);
    res.json({ deals: deals as IDeal[] });
    return;
  }
  
  const user = await User.findById(userId).populate<{ company: ICompany }>('company') as IUser | null;
  if (!user || !user.company) {
    throw new NotFoundError('User or user company not found');
  }
  
  // LGDEAL Internal Workflow: Manager or Logist filtering
  const userCompany = user.company as ICompany;
  const isLgdealCompany = userCompany.name === (marketplaceConfig as MarketplaceConfig).managementCompany.name;
  
  if (isLgdealCompany && (user.role === 'manager' || user.role === 'logist')) {
    logger.debug(`[getSellerDeals] LGDEAL ${user.role} detected, filtering by assignedTo`);
    
    // Manager и Logist работают с buyer-to-lgdeal сделками (продажи покупателям)
    // Они проверяют продукт для покупателей и организуют доставку покупателям
    const deals = await Deal.find({
      assignedTo: new Types.ObjectId(userId),
      assignedRole: user.role,
      dealType: 'buyer-to-lgdeal'
    })
    .populate<{ buyerId: IUser }>('buyerId', 'firstName lastName email')
    .populate<{ products: IDealProduct[] }>({ path: 'products.product', select: productPopulateFields })
    .populate<{ buyerCompanyId: ICompany }>('buyerCompanyId', 'name')
    .populate<{ pairedDealId: { buyerCompanyId: ICompany } }>({ 
      path: 'pairedDealId',
      select: 'buyerCompanyId',
      populate: {
        path: 'buyerCompanyId',
        select: 'name'
      }
    })
    .sort({ createdAt: -1 });
    
    logger.info(`[getSellerDeals] Returning ${deals.length} deals for LGDEAL ${user.role} ${userId}`);
    res.json({ deals: deals as IDeal[] });
    return;
  }
  
  // Regular seller logic
  const deals = await Deal.find({
    $or: [
      { sellerId: new Types.ObjectId(userId) },
      { sellerCompanyId: user.company as Types.ObjectId } 
    ],
    dealType: 'lgdeal-to-seller'
  })
  .populate<{ products: IDealProduct[] }>({ path: 'products.product', select: productPopulateFields })
  .populate<{ buyerCompanyId: ICompany }>('buyerCompanyId', 'name')
  .populate<{ pairedDealId: { buyerCompanyId: ICompany } }>({ 
    path: 'pairedDealId',
    select: 'buyerCompanyId',
    populate: {
      path: 'buyerCompanyId',
      select: 'name'
    }
  })
  .sort({ createdAt: -1 });
  
  logger.info(`[getSellerDeals] Returning ${deals.length} regular seller deals for user ${userId}`);
  res.json({ deals: deals as IDeal[] });
});

export const getDealById = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { dealId } = req.params;
  
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }
  
  const userId = req.user.userId;
  const userIsLgdealSupervisor = !!req.user.isLgdealSupervisor;
  const userIsLgdealAdmin = !!(req.user.isLgdealAdmin || req.user.role === 'admin');
  const userIsLgdealSupport = userIsLgdealSupervisor || userIsLgdealAdmin;
  
  const userDocument = await User.findById(userId) as IUser | null;
  if (!userDocument || !userDocument.company) {
    throw new NotFoundError('User or user company not found');
  }

  const dealData = await dealService.getDealFull(dealId);
  
  if (!dealData) {
    throw new NotFoundError('Deal not found');
  }

  // Загружаем полную информацию о сделке, включая assignedTo, для проверки доступа
  // getPopulatedDealById может не загружать assignedTo, поэтому загружаем отдельно
  const dealWithAssignment = await Deal.findById(dealId).select('assignedTo assignedRole buyerId sellerId').lean();
  
  logger.debug('[getDealById] Deal assignment data', {
    dealId,
    dealWithAssignment: dealWithAssignment ? {
      assignedTo: dealWithAssignment.assignedTo,
      assignedToType: typeof dealWithAssignment.assignedTo,
      assignedRole: dealWithAssignment.assignedRole,
      assignedToIsObjectId: dealWithAssignment.assignedTo instanceof Types.ObjectId
    } : null,
    // dealData.assignedTo is populated by getDealFull (LGDEAL Internal Workflow field)
    dealDataAssignedTo: dealData.assignedTo?._id ?? null,
    dealDataAssignedRole: dealData.assignedRole ?? null,
  });
  
  // Проверяем доступ к сделке
  // buyerId / sellerId в DealFullDto: либо строка, либо { _id: string }, либо undefined
  const extractId = (v: string | { _id: string } | undefined): string | undefined =>
    typeof v === 'string' ? v : v?._id ? String(v._id) : undefined;

  const dealBuyerId  = extractId(dealData.buyerId);
  const dealSellerId = extractId(dealData.sellerId);

  // Company IDs can be returned either as a string or as a populated {_id} object in DealFullDto
  const dealBuyerCompanyId = extractId(dealData.buyerCompanyId as unknown as string | { _id: string } | undefined);
  const dealSellerCompanyId = extractId(dealData.sellerCompanyId as unknown as string | { _id: string } | undefined);
  const userCompanyId = userDocument.company?.toString();
  
  // .lean() always returns raw BSON ObjectId instances — .toString() is safe on all of them.
  // Fallback to the populated dealData.assignedTo._id if the lean query returned nothing.
  const assignedToId: string | null =
    (dealWithAssignment?.assignedTo as any)?.toString?.() ??
    dealData.assignedTo?._id ??
    null;
  const assignedRole: string | null =
    dealWithAssignment?.assignedRole ?? dealData.assignedRole ?? null;
  
  // Проверяем роль пользователя для правильной проверки доступа
  const userModelRole = userDocument.role;
  
  // Нормализуем ID для сравнения (приводим к строкам)
  const normalizedUserId = String(userId).trim();
  const normalizedAssignedToId = assignedToId ? String(assignedToId).trim() : null;
  
  const isAssignedUser = normalizedAssignedToId === normalizedUserId;
  const isCorrectRole = 
    (userModelRole === 'manager' && assignedRole === 'manager') ||
    (userModelRole === 'logist' && assignedRole === 'logist');
  
  logger.info('[getDealById] Access check', {
    userId,
    normalizedUserId,
    userModelRole,
    assignedToId,
    normalizedAssignedToId,
    assignedRole,
    isAssignedUser,
    isCorrectRole,
    dealBuyerId,
    dealSellerId,
    dealBuyerCompanyId,
    dealSellerCompanyId,
    userCompanyId,
    userIsLgdealSupervisor,
    userIsLgdealAdmin,
    userIsLgdealSupport,
    dealId,
    dealType: dealData.dealType,
    comparison: {
      normalizedMatch: normalizedAssignedToId === normalizedUserId,
      originalMatch: assignedToId === userId,
      userIdString: String(userId),
      assignedToIdString: assignedToId ? String(assignedToId) : null
    }
  });
  
  // Проверка доступа с учетом типа сделки LGDEAL
  let hasAccess = false;
  
  if (dealData.dealType === 'buyer-to-lgdeal') {
    // Для buyer-to-lgdeal: только покупатель или LGDEAL (supervisor/manager/logist)
    hasAccess = 
      userIsLgdealSupport || 
      (dealBuyerId === userId) ||
      (!!userCompanyId && !!dealBuyerCompanyId && dealBuyerCompanyId === userCompanyId) ||
      (isAssignedUser && isCorrectRole);
  } else if (dealData.dealType === 'lgdeal-to-seller') {
    // Для lgdeal-to-seller: только продавец или LGDEAL (supervisor/manager/logist)
    hasAccess = 
      userIsLgdealSupport || 
      (dealSellerId === userId) ||
      (!!userCompanyId && !!dealSellerCompanyId && dealSellerCompanyId === userCompanyId) ||
      (isAssignedUser && isCorrectRole);
  } else {
    // Для обычных сделок: покупатель или продавец
    hasAccess = 
      userIsLgdealSupport || 
      (dealBuyerId === userId) ||
      (dealSellerId === userId);
  }

  if (!hasAccess) {
    logger.warn('[getDealById] Access denied', {
      userId,
      dealId,
      dealType: dealData.dealType,
      dealBuyerId,
      dealSellerId,
      dealBuyerCompanyId,
      dealSellerCompanyId,
      userCompanyId,
      userIsLgdealSupervisor,
      userIsLgdealAdmin,
      userIsLgdealSupport,
      isAssignedUser,
      isCorrectRole
    });
    throw new UnauthorizedError('Not authorized to view this deal');
  }
  
  // Canonical definition: buyer-to-lgdeal без связанных поставщических сделок = камень уже у LGDEAL
  const isDirectLgdealDeal = dealData.dealType === 'buyer-to-lgdeal'
    && (!dealData.pairedDealIds || dealData.pairedDealIds.length === 0);

  // DealFullDto содержит все нужные поля IDeal в рантайме (агрегация возвращает полный документ).
  // Каст через unknown необходим только из-за отсутствия Mongoose-методов в типе DTO.
  const dealForLogic = dealData as unknown as IDeal;
  const userRole = determineUserRole(dealForLogic, userId, userDocument.company?.toString(), userIsLgdealSupervisor, isDirectLgdealDeal);
  
  // Для supervisor'ов получаем количество manager'ов для проверки reassign_manager действия
  let managersCount: number | undefined = undefined;
  if (userIsLgdealSupport && dealData.dealType === 'buyer-to-lgdeal' && dealData.assignedTo?._id && dealData.assignedRole === 'manager') {
    try {
      const lgdealCompany = await Company.findOne({ 
        name: marketplaceConfig.managementCompany.name 
      });
      if (lgdealCompany) {
        managersCount = await User.countDocuments({
          company: lgdealCompany._id,
          role: 'manager',
          isActive: true
        });
      }
    } catch (error) {
      logger.error('[getDealById] Failed to get managers count', { error });
      // Продолжаем без managersCount (безопасный вариант - reassign_manager не покажется)
    }
  }
  
  const dealWithExtraInfo = {
    ...dealData,
    userRole,
    allowedActions: await getAllowedActions(dealForLogic, userRole, isDirectLgdealDeal, managersCount),
    isDirectLgdealDeal,
    dealState: await dealStateService.getDealStateInfo(dealForLogic, userId, userDocument.company?.toString(), userIsLgdealSupervisor, managersCount),
  };
  
  res.json({ deal: dealWithExtraInfo });
});

/**
 * Download an invoice for a deal
 */
export const downloadInvoice = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { dealId } = req.params;
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }
    const userId = req.user.userId;

    // Select buyerId, sellerId, assignedTo as ObjectId refs (not populated) — compare via .toString()
    const deal = await Deal.findById(dealId)
      .select('buyerId sellerId assignedTo assignedRole paymentDetails.invoiceFilename') as IDeal | null;
    if (!deal) {
      throw new NotFoundError('Deal not found');
    }

    // Сравниваем ObjectId напрямую через toString() — без cast к IUser (они не populated)
    const buyerIdStr   = deal.buyerId?.toString();
    const sellerIdStr  = deal.sellerId?.toString();
    const assignedIdStr = deal.assignedTo?.toString();

    const userIsBuyer      = buyerIdStr === userId;
    const userIsSeller     = sellerIdStr === userId;
  const userIsLgdealAdmin = !!(req.user.isLgdealSupervisor || req.user.isLgdealAdmin || req.user.role === 'admin');
    // Manager или Logist, назначенный на эту сделку, также имеет доступ к инвойсу
    const userIsAssigned   = !!assignedIdStr && assignedIdStr === userId;

    if (!userIsBuyer && !userIsSeller && !userIsLgdealAdmin && !userIsAssigned) {
      throw new ForbiddenError('Not authorized to view this invoice');
    }
    
    if (!deal.paymentDetails || !deal.paymentDetails.invoiceFilename) {
      throw new NotFoundError('No invoice filename found for this deal');
    }

    const invoiceFilename = deal.paymentDetails.invoiceFilename;
    // Securely construct the file path (respect UPLOAD_PATH if set)
    const uploadsRoot = process.env.UPLOAD_PATH
      ? path.resolve(process.env.UPLOAD_PATH)
      : path.join(process.cwd(), 'uploads');
    const invoiceFilePath = path.join(uploadsRoot, 'invoices', path.basename(invoiceFilename));

    if (!fs.existsSync(invoiceFilePath)) {
      logger.error(`[downloadInvoice] Invoice file NOT FOUND at: ${invoiceFilePath}`);
      throw new NotFoundError(`Invoice file '${invoiceFilename}' not found on server.`);
    }

    res.setHeader('Content-Disposition', `attachment; filename="${invoiceFilename}"`);
    
    // Determine Content-Type based on file extension
    const fileExt = path.extname(invoiceFilename).toLowerCase();
    let contentType = 'application/octet-stream'; // default
    
    switch (fileExt) {
        case '.pdf':
            contentType = 'application/pdf';
            break;
        case '.doc':
            contentType = 'application/msword';
            break;
        case '.docx':
            contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            break;
        case '.jpg':
        case '.jpeg':
            contentType = 'image/jpeg';
            break;
        case '.png':
            contentType = 'image/png';
            break;
    }
    
    res.setHeader('Content-Type', contentType);

    const fileStream = fs.createReadStream(invoiceFilePath);
    fileStream.pipe(res);
    fileStream.on('error', (err) => {
      logger.error('Error streaming invoice file:', { error: err });
      // Don't try to send another response if headers are already sent
      if (!res.headersSent) {
        res.status(500).send({ message: 'Error streaming file' });
      }
    });

  } catch (error) {
    // Let the central error handler manage the response
    throw error;
  }
};

/**
 * Get all deals formatted for the LGDEAL Supervisor Dashboard.
 * This is a more complex query that groups customer sales with their linked supplier purchases.
 */
export const getSupervisorDashboardDeals = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    logger.debug('[getSupervisorDashboardDeals] Starting dashboard data fetch...');
    
    // Authorization check: Only LGDEAL support/admin can access dashboard
    if (!req.user) {
        throw new UnauthorizedError('User not authenticated');
    }
    
    if (!(req.user.isLgdealSupervisor || req.user.isLgdealAdmin || req.user.role === 'admin')) {
        throw new ForbiddenError('Access denied. Dashboard is only available for LGDEAL support/admin.');
    }
    
    // 1. Fetch all main sales to customers
    const customerSales = await Deal.find({ dealType: 'buyer-to-lgdeal' })
        .populate<{ buyerCompanyId: ICompany }>('buyerCompanyId', 'name')
        .populate<{ products: IDealProduct[] }>({ 
            path: 'products.product', 
            select: 'shape carat color clarity' 
        })
        .sort({ createdAt: -1 })
        .lean();

    logger.info(`[getSupervisorDashboardDeals] Found ${customerSales.length} customer sales`);

    // 2. Fetch all related purchases from suppliers (match either pairedDealId or pairedDealIds)
    const customerSaleIds = customerSales.map(s => s._id);
    const relatedPurchases = await Deal.find({
        dealType: 'lgdeal-to-seller',
        $or: [
            { pairedDealId:  { $in: customerSaleIds } },
            { pairedDealIds: { $in: customerSaleIds } },
        ],
    })
    .populate<{ sellerCompanyId: ICompany }>('sellerCompanyId', 'name')
    .populate<{ products: IDealProduct[] }>({ 
        path: 'products.product', 
        select: 'shape carat color clarity' 
    })
    .lean();

    // 3. Group purchases by their parent deal ID for efficient lookup
    const purchasesByParentDealId = new Map<string, any[]>();
    relatedPurchases.forEach(purchase => {
        if (purchase.pairedDealId) {
            const parentId = purchase.pairedDealId.toString();
            if (!purchasesByParentDealId.has(parentId)) {
                purchasesByParentDealId.set(parentId, []);
            }
            purchasesByParentDealId.get(parentId)!.push({
                _id: purchase._id.toString(),
                dealNumber: purchase.dealNumber,
                stage: purchase.stage,
                status: purchase.status,
                amount: purchase.amount,
                counterpartyName: (purchase.sellerCompanyId as ICompany)?.name || 'N/A',
                products: purchase.products,
                dashboardDealType: purchase.metadata?.dashboardDealType || 'alternativeSupplierPurchase',
                createdAt: purchase.createdAt, // Add missing createdAt field
                dealType: purchase.dealType, // Add dealType for consistency
            });
        }
    });

    // 4. Construct the final dashboard items
    const dashboardItems = customerSales.map(sale => {
        const linkedPurchasesRaw = purchasesByParentDealId.get(sale._id.toString()) || [];
        const mainProductIds = new Set(sale.products.map(p => (p.product as IProduct)?._id?.toString()).filter(Boolean));

        const linkedPurchases = linkedPurchasesRaw.map(p => {
            // A purchase is primary if its product is one of the main products in the customer sale.
            // This assumes single-product purchases, adjust if purchases can contain multiple products.
            const purchaseProductId = (p.products[0]?.product as IProduct)?._id?.toString();
            const isPrimary = purchaseProductId ? mainProductIds.has(purchaseProductId) : false;
            
            return {
                ...p,
                dashboardDealType: isPrimary ? 'primarySupplierPurchase' : 'alternativeSupplierPurchase'
            };
        });
        
        // Sort linked purchases: primary first, then by creation date or number
        linkedPurchases.sort((a, b) => {
            if (a.dashboardDealType === 'primarySupplierPurchase') return -1;
            if (b.dashboardDealType === 'primarySupplierPurchase') return 1;
            return 0; 
        });

        return {
            customerSale: {
                _id: sale._id.toString(),
                dealNumber: sale.dealNumber,
                stage: sale.stage,
                status: sale.status,
                amount: sale.amount,
                counterpartyName: (sale.buyerCompanyId as ICompany)?.name || 'N/A',
                products: sale.products,
                dashboardDealType: 'mainCustomerSale',
                createdAt: sale.createdAt, // Add missing createdAt field
                dealType: sale.dealType, // Add dealType for consistency
            },
            linkedPurchases: linkedPurchases
        };
    });

    logger.info(`[getSupervisorDashboardDeals] Returning ${dashboardItems.length} dashboard items`);
    res.json({ deals: dashboardItems });
}); 