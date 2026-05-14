import Deal from '../models/Deal';
import { logger } from '../utils/logger';
import { IDeal, IUser, ICompany, IProduct } from '../types';
import { Types } from 'mongoose';
import { sendDealChangeNotification } from '../utils/telegramBot';

// DTOs для разных уровней детализации
export interface DealSummaryDto {
    _id: string;
    dealNumber: string;
    status: string;
    stage: string;
    amount: number;
    counterpartyName: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface DealDetailsDto extends DealSummaryDto {
    buyer: {
        _id: string;
        email: string;
        firstName: string;
        lastName: string;
    };
    seller?: {
        _id: string;
        email: string;
        firstName: string;
        lastName: string;
    };
    products: Array<{
        product: {
            _id: string;
            shape: string;
            carat: number;
            color: string;
            clarity: string;
            price: number;
            certificateNumber: string;
            certificateInstitute: string;
            location: string;
            company: {
                _id: string;
                name: string;
            };
        };
        quantity: number;
        unitPrice: number;
        suggestedAlternatives?: Array<{
            product: {
                _id: string;
                shape: string;
                carat: number;
                color: string;
                clarity: string;
                price: number;
                certificateNumber: string;
                certificateInstitute: string;
                location: string;
                company: {
                    _id: string;
                    name: string;
                };
            };
            pairedLgdealToSellerDealId?: string;
        }>;
        selectedAlternativeProduct?: {
            _id: string;
            shape: string;
            carat: number;
            color: string;
            clarity: string;
            price: number;
            certificateNumber: string;
            certificateInstitute: string;
            location: string;
            company: {
                _id: string;
                name: string;
            };
        };
        originalProductStruckOut?: boolean;
        originalPriceBeforeSwap?: number;
        originalProductDetailsBeforeSwap?: Record<string, unknown>;
        // Validation fields
        isValidated: boolean;
        validatedAt?: string;
        validatedBy?: string;
    }>;
}

export interface DealFullDto extends DealDetailsDto {
    buyerCompanyId?: {
        _id: string;
        name: string;
        details?: {
            legalAddress?: Record<string, unknown>;
        };
    };
    sellerCompanyId?: {
        _id: string;
        name: string;
        paymentSettings?: {
            stripeEnabled?: boolean;
        };
    };
    activityLog: Array<{
        action: string;
        performedBy: {
            _id: string;
            email: string;
            firstName: string;
            lastName: string;
        };
        timestamp: Date;
        details: string;
    }>;
    pairedDeals: Array<{
        _id: string;
        dealNumber: string;
        status: string;
        shippingDetails: Record<string, unknown>;
        sellerCompany: {
            _id: string;
            name: string;
        };
    }>;
    paymentDetails: Record<string, unknown>;
    // Additional fields for compatibility with IDeal
    dealType?: string;
    buyerId?: string | { _id: string };
    sellerId?: string | { _id: string };
    invoiceUrl?: string;
    // Raw IDs array (ObjectId[] spread from aggregate result)
    pairedDealIds?: unknown[];
    pairedDealId?: unknown;
    // Deal state fields needed by business-logic helpers
    shippingDetails?: Record<string, unknown>;
    activePurchaseDealId?: unknown;
    negotiationDetails?: Record<string, unknown>;
    // LGDEAL Internal Workflow fields
    assignedTo?: {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
        role?: string;
    } | null;
    assignedRole?: 'manager' | 'logist';
    assignedAt?: Date | null;
    assignedBy?: {
        _id: string;
        firstName: string;
        lastName: string;
        email?: string;
    } | null;
    assignmentHistory?: Array<{
        assignedTo: unknown;
        assignedRole: string;
        assignedBy: unknown;
        assignedAt: Date;
        reassignmentReason?: string;
    }>;
    products: Array<{
        product: {
            _id: string;
            shape: string;
            carat: number;
            color: string;
            clarity: string;
            price: number;
            certificateNumber: string;
            certificateInstitute: string;
            location: string;
            company: {
                _id: string;
                name: string;
            };
        };
        quantity: number;
        unitPrice: number;
        suggestedAlternatives?: Array<{
            product: {
                _id: string;
                shape: string;
                carat: number;
                color: string;
                clarity: string;
                price: number;
                certificateNumber: string;
                certificateInstitute: string;
                location: string;
                company: {
                    _id: string;
                    name: string;
                };
            };
            pairedLgdealToSellerDealId?: string;
        }>;
        selectedAlternativeProduct?: {
            _id: string;
            shape: string;
            carat: number;
            color: string;
            clarity: string;
            price: number;
            certificateNumber: string;
            certificateInstitute: string;
            location: string;
            company: {
                _id: string;
                name: string;
            };
        };
        originalProductStruckOut?: boolean;
        originalPriceBeforeSwap?: number;
        originalProductDetailsBeforeSwap?: Record<string, unknown>;
        // Validation fields
        isValidated: boolean;
        validatedAt?: string;
        validatedBy?: string;
    }>;
}

export class DealService {
    /**
     * Получает краткую информацию о сделке для списков
     */
    async getDealSummary(dealId: string): Promise<DealSummaryDto | null> {
        const pipeline = [
            { $match: { _id: new Types.ObjectId(dealId) } },
            {
                $project: {
                    dealNumber: 1,
                    status: 1,
                    stage: 1,
                    amount: 1,
                    counterpartyName: 1,
                    createdAt: 1,
                    updatedAt: 1
                }
            }
        ];

        const deals = await Deal.aggregate(pipeline);
        return deals[0] || null;
    }

    /**
     * Получает детальную информацию о сделке (без тяжелых данных)
     */
    async getDealDetails(dealId: string): Promise<DealDetailsDto | null> {
        const pipeline = [
            { $match: { _id: new Types.ObjectId(dealId) } },
            // Lookup buyer
            {
                $lookup: {
                    from: 'users',
                    localField: 'buyerId',
                    foreignField: '_id',
                    as: 'buyer',
                    pipeline: [
                        { $project: { email: 1, firstName: 1, lastName: 1 } }
                    ]
                }
            },
            // Lookup seller
            {
                $lookup: {
                    from: 'users',
                    localField: 'sellerId',
                    foreignField: '_id',
                    as: 'seller',
                    pipeline: [
                        { $project: { email: 1, firstName: 1, lastName: 1 } }
                    ]
                }
            },
            // Lookup products with companies
            {
                $lookup: {
                    from: 'products',
                    localField: 'products.product',
                    foreignField: '_id',
                    as: 'productDetails',
                    pipeline: [
                        {
                            $lookup: {
                                from: 'companies',
                                localField: 'company',
                                foreignField: '_id',
                                as: 'companyDetails',
                                pipeline: [{ $project: { name: 1 } }]
                            }
                        },
                        {
                            $addFields: {
                                company: { $arrayElemAt: ['$companyDetails', 0] }
                            }
                        },
                        {
                            $project: {
                                shape: 1,
                                carat: 1,
                                color: 1,
                                clarity: 1,
                                price: 1,
                                certificateNumber: 1,
                                certificateInstitute: 1,
                                location: 1,
                                company: 1,
                                photo: 1,
                                video: 1
                            }
                        }
                    ]
                }
            },
            {
                $project: {
                    dealNumber: 1,
                    status: 1,
                    stage: 1,
                    amount: 1,
                    counterpartyName: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    buyer: { $arrayElemAt: ['$buyer', 0] },
                    seller: { $arrayElemAt: ['$seller', 0] },
                    products: {
                        $map: {
                            input: '$products',
                            as: 'productItem',
                            in: {
                                product: {
                                    $arrayElemAt: [
                                        {
                                            $filter: {
                                                input: '$productDetails',
                                                cond: { $eq: ['$$this._id', '$$productItem.product'] }
                                            }
                                        },
                                        0
                                    ]
                                },
                                quantity: '$$productItem.quantity',
                                unitPrice: '$$productItem.unitPrice'
                            }
                        }
                    }
                }
            }
        ];

        const deals = await Deal.aggregate(pipeline);
        return deals[0] || null;
    }

    /**
     * Получает полную информацию о сделке (включая тяжелые данные)
     */
    async getDealFull(dealId: string): Promise<DealFullDto | null> {
        // Validate dealId format before attempting to create ObjectId
        if (!dealId || !Types.ObjectId.isValid(dealId)) {
            logger.warn(`[getDealFull] Invalid dealId: ${dealId}`);
            return null;
        }

        // Используем агрегацию для оптимизации
        const pipeline = [
            { $match: { _id: new Types.ObjectId(dealId) } },
            // Lookup buyer
            {
                $lookup: {
                    from: 'users',
                    localField: 'buyerId',
                    foreignField: '_id',
                    as: 'buyer',
                    pipeline: [{ $project: { email: 1, firstName: 1, lastName: 1 } }]
                }
            },
            // Lookup seller
            {
                $lookup: {
                    from: 'users',
                    localField: 'sellerId',
                    foreignField: '_id',
                    as: 'seller',
                    pipeline: [{ $project: { email: 1, firstName: 1, lastName: 1 } }]
                }
            },
            // Lookup buyer company
            {
                $lookup: {
                    from: 'companies',
                    localField: 'buyerCompanyId',
                    foreignField: '_id',
                    as: 'buyerCompany',
                    pipeline: [{ $project: { name: 1, 'details.legalAddress': 1 } }]
                }
            },
            // Lookup seller company
            {
                $lookup: {
                    from: 'companies',
                    localField: 'sellerCompanyId',
                    foreignField: '_id',
                    as: 'sellerCompany',
                    pipeline: [{ $project: { name: 1, paymentSettings: 1 } }]
                }
            },
            // Lookup assignedTo (LGDEAL manager/logist)
            {
                $lookup: {
                    from: 'users',
                    localField: 'assignedTo',
                    foreignField: '_id',
                    as: 'assignedTo',
                    pipeline: [{ $project: { email: 1, firstName: 1, lastName: 1, role: 1 } }]
                }
            },
            // Lookup assignedBy (who assigned the deal)
            {
                $lookup: {
                    from: 'users',
                    localField: 'assignedBy',
                    foreignField: '_id',
                    as: 'assignedBy',
                    pipeline: [{ $project: { email: 1, firstName: 1, lastName: 1 } }]
                }
            },
            // Products with details
            {
                $lookup: {
                    from: 'products',
                    localField: 'products.product',
                    foreignField: '_id',
                    as: 'productDetails',
                    pipeline: [
                        {
                            $lookup: {
                                from: 'companies',
                                localField: 'company',
                                foreignField: '_id',
                                as: 'companyDetails',
                                pipeline: [{ $project: { name: 1 } }]
                            }
                        },
                        {
                            $addFields: {
                                company: { $arrayElemAt: ['$companyDetails', 0] }
                            }
                        },
                        {
                            $project: {
                                shape: 1,
                                carat: 1,
                                color: 1,
                                clarity: 1,
                                price: 1,
                                certificateNumber: 1,
                                certificateInstitute: 1,
                                location: 1,
                                company: 1,
                                photo: 1,
                                video: 1,
                                cut: 1,
                                polish: 1,
                                symmetry: 1,
                                measurement1: 1,
                                measurement2: 1,
                                measurement3: 1,
                                lab: 1,
                            }
                        }
                    ]
                }
            },
            // Lookup for suggested alternatives products
            {
                $lookup: {
                    from: 'products',
                    localField: 'products.suggestedAlternatives.product',
                    foreignField: '_id',
                    as: 'suggestedAlternativeProducts',
                    pipeline: [
                        {
                            $lookup: {
                                from: 'companies',
                                localField: 'company',
                                foreignField: '_id',
                                as: 'company',
                                pipeline: [{ $project: { name: 1 } }]
                            }
                        },
                        {
                            $project: {
                                shape: 1,
                                carat: 1,
                                color: 1,
                                clarity: 1,
                                price: 1,
                                marketPrice: 1,
                                certificateNumber: 1,
                                certificateInstitute: 1,
                                location: 1,
                                photo: 1,
                                videoUrl: 1,
                                company: { $arrayElemAt: ['$company', 0] },
                                cut: 1,
                                polish: 1,
                                symmetry: 1,
                                measurement1: 1,
                                measurement2: 1,
                                measurement3: 1,
                                lab: 1,
                            }
                        }
                    ]
                }
            },
            // Lookup for selected alternative products
            {
                $lookup: {
                    from: 'products',
                    localField: 'products.selectedAlternativeProduct',
                    foreignField: '_id',
                    as: 'selectedAlternativeProducts',
                    pipeline: [
                        {
                            $lookup: {
                                from: 'companies',
                                localField: 'company',
                                foreignField: '_id',
                                as: 'company',
                                pipeline: [{ $project: { name: 1 } }]
                            }
                        },
                        {
                            $project: {
                                shape: 1,
                                carat: 1,
                                color: 1,
                                clarity: 1,
                                price: 1,
                                marketPrice: 1,
                                certificateNumber: 1,
                                certificateInstitute: 1,
                                location: 1,
                                photo: 1,
                                videoUrl: 1,
                                company: { $arrayElemAt: ['$company', 0] },
                                cut: 1,
                                polish: 1,
                                symmetry: 1,
                                measurement1: 1,
                                measurement2: 1,
                                measurement3: 1,
                                lab: 1,
                            }
                        }
                    ]
                }
            },
            // NEW: Lookup for paired deals within suggested alternatives
            {
                $lookup: {
                    from: 'deals',
                    localField: 'products.suggestedAlternatives.pairedLgdealToSellerDealId',
                    foreignField: '_id',
                    as: 'suggestedAlternativePairedDeals',
                    pipeline: [
                        { $project: { status: 1, stage: 1, dealNumber: 1, shippingDetails: 1 } }
                    ]
                }
            },
            // Activity log with users
            {
                $lookup: {
                    from: 'users',
                    localField: 'activityLog.performedBy',
                    foreignField: '_id',
                    as: 'activityUsers',
                    pipeline: [{ $project: { email: 1, firstName: 1, lastName: 1 } }]
                }
            },
            // Paired deals
            {
                $lookup: {
                    from: 'deals',
                    localField: 'pairedDealIds',
                    foreignField: '_id',
                    as: 'pairedDeals',
                    pipeline: [
                        {
                            $lookup: {
                                from: 'companies',
                                localField: 'sellerCompanyId',
                                foreignField: '_id',
                                as: 'sellerCompany',
                                pipeline: [{ $project: { name: 1 } }]
                            }
                        },
                        {
                            $project: {
                                dealNumber: 1,
                                status: 1,
                                shippingDetails: 1,
                                sellerCompany: { $arrayElemAt: ['$sellerCompany', 0] }
                            }
                        }
                    ]
                }
            }
        ];

        const deals = await Deal.aggregate(pipeline);
        const deal = deals[0];
        
        if (!deal) return null;
        
        // --- OPTIMIZATION: Convert arrays to maps for efficient lookup ---
        const productDetailsMap = new Map(deal.productDetails?.map((p: { _id: Types.ObjectId; [key: string]: unknown }) => [p._id.toString(), p]) || []);
        // Backfill productSnapshot for items that have product but no snapshot (so future reads survive product deletion)
        const rawProducts = deal.products as Array<{ product?: Types.ObjectId; productSnapshot?: unknown }>;
        rawProducts?.forEach((productItem: { product?: Types.ObjectId; productSnapshot?: unknown }, index: number) => {
            if (!productItem.product) return;
            const detail = productDetailsMap.get(productItem.product.toString()) as { shape?: string; carat?: number; color?: string; clarity?: string; certificateNumber?: string; certificateInstitute?: string; location?: string } | undefined;
            if (detail && !productItem.productSnapshot) {
                const snapshot = { shape: detail.shape, carat: detail.carat, color: detail.color, clarity: detail.clarity, certificateNumber: detail.certificateNumber, certificateInstitute: detail.certificateInstitute, location: detail.location };
                Deal.updateOne(
                    { _id: deal._id },
                    { $set: { [`products.${index}.productSnapshot`]: snapshot } }
                ).catch(err => logger.warn('[getDealFull] Backfill productSnapshot failed', { dealId: deal._id, index, err }));
            }
        });
        const suggestedAlternativeProductsMap = new Map(deal.suggestedAlternativeProducts?.map((p: { _id: Types.ObjectId; [key: string]: unknown }) => [p._id.toString(), p]) || []);
        const selectedAlternativeProductsMap = new Map(deal.selectedAlternativeProducts?.map((p: { _id: Types.ObjectId; [key: string]: unknown }) => [p._id.toString(), p]) || []);
        const suggestedAlternativePairedDealsMap = new Map(deal.suggestedAlternativePairedDeals?.map((pd: { _id: Types.ObjectId; [key: string]: unknown }) => [pd._id.toString(), pd]) || []);
        const activityUsersMap = new Map(deal.activityUsers?.map((u: { _id: Types.ObjectId; [key: string]: unknown }) => [u._id.toString(), u]) || []);
        // --- END OPTIMIZATION ---
        
        // Преобразуем массивы в объекты для buyer и seller
        return {
            ...deal,
            buyer: deal.buyer?.[0] || null,
            seller: deal.seller?.[0] || null,
            buyerId: deal.buyer?.[0] || deal.buyerId,
            sellerId: deal.seller?.[0] || deal.sellerId,
            buyerCompanyId: deal.buyerCompany?.[0] || deal.buyerCompanyId,
            sellerCompanyId: deal.sellerCompany?.[0] || deal.sellerCompanyId,
            assignedTo: deal.assignedTo?.[0] || null,
            assignedBy: deal.assignedBy?.[0] || null,
            // Объединяем products с их деталями и альтернативными товарами
            products: deal.products?.map((productItem: { product?: Types.ObjectId; suggestedAlternatives?: Array<{ product?: Types.ObjectId; pairedLgdealToSellerDealId?: Types.ObjectId }>; [key: string]: unknown }) => {
                // Проверяем, что productItem.product существует перед вызовом toString()
                const productDetail = productItem.product 
                    ? productDetailsMap.get(productItem.product.toString())
                    : null;
                // Если продукт удалён из каталога — подставляем снапшот для отображения
                const productSnapshot = (productItem as { productSnapshot?: { shape?: string; carat?: number; color?: string; clarity?: string; certificateNumber?: string; certificateInstitute?: string; location?: string } }).productSnapshot;
                const productForResponse = productDetail
                    || (productSnapshot && productItem.product
                        ? { _id: productItem.product, ...productSnapshot }
                        : null);

                // Обрабатываем suggestedAlternatives
                const suggestedAlternatives = productItem.suggestedAlternatives?.map((altItem: { product?: Types.ObjectId; pairedLgdealToSellerDealId?: Types.ObjectId }) => {
                    const altProductDetail = altItem.product 
                        ? suggestedAlternativeProductsMap.get(altItem.product.toString())
                        : null;
                    const pairedDealDetail = altItem.pairedLgdealToSellerDealId 
                        ? suggestedAlternativePairedDealsMap.get(altItem.pairedLgdealToSellerDealId.toString())
                        : null;
                    
                    return {
                        ...altItem,
                        product: altProductDetail || altItem.product,
                        pairedLgdealToSellerDealId: pairedDealDetail || altItem.pairedLgdealToSellerDealId
                    };
                }) || [];

                // Обрабатываем selectedAlternativeProduct
                let selectedAlternativeProduct = productItem.selectedAlternativeProduct;
                if (selectedAlternativeProduct) {
                    const selectedAltDetail = selectedAlternativeProductsMap.get(selectedAlternativeProduct.toString());
                    selectedAlternativeProduct = selectedAltDetail || selectedAlternativeProduct;
                }

                return {
                    ...productItem,
                    product: productForResponse,
                    suggestedAlternatives,
                    selectedAlternativeProduct,
                    // Ensure originalProductDetailsBeforeSwap compatibility
                    originalProductDetailsBeforeSwap: productItem.originalProductDetailsBeforeSwap
                };
            }) || [],
            // Объединяем activityLog с пользователями
            activityLog: deal.activityLog?.map((log: { performedBy?: Types.ObjectId; [key: string]: unknown }) => ({
                ...log,
                performedBy: log.performedBy 
                    ? activityUsersMap.get(log.performedBy.toString()) || log.performedBy
                    : log.performedBy
            })) || []
        } as DealFullDto;
    }

    /**
     * Получает сделки пользователя с пагинацией
     */
    async getUserDeals(
        userId: string, 
        type: 'buyer' | 'seller', 
        page: number = 1, 
        limit: number = 20
    ): Promise<{ deals: DealSummaryDto[]; total: number; totalPages: number }> {
        // Validate userId format before attempting to create ObjectId
        if (!userId || !Types.ObjectId.isValid(userId)) {
            logger.warn(`[getUserDeals] Invalid userId: ${userId}`);
            return { deals: [], total: 0, totalPages: 0 };
        }

        const matchField = type === 'buyer' ? 'buyerId' : 'sellerId';
        const skip = (page - 1) * limit;

        const pipeline = [
            { $match: { [matchField]: new Types.ObjectId(userId) } },
            { $sort: { createdAt: -1 as -1 } },
            {
                $facet: {
                    deals: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $project: {
                                dealNumber: 1,
                                status: 1,
                                stage: 1,
                                amount: 1,
                                counterpartyName: 1,
                                createdAt: 1,
                                updatedAt: 1
                            }
                        }
                    ],
                    totalCount: [{ $count: 'count' }]
                }
            }
        ];

        const result = await Deal.aggregate(pipeline);
        const deals = result[0]?.deals || [];
        const total = result[0]?.totalCount[0]?.count || 0;
        const totalPages = Math.ceil(total / limit);

        return { deals, total, totalPages };
    }

    /**
     * Создает новую сделку
     */
    async createDeal(dealData: Partial<IDeal>): Promise<IDeal> {
        const deal = new Deal(dealData);
        return await deal.save();
    }

    /**
     * Обновляет статус сделки
     */
    async updateDealStatus(dealId: string, status: string, performedBy: string): Promise<IDeal | null> {
        // Validate IDs format before attempting to create ObjectId
        if (!dealId || !Types.ObjectId.isValid(dealId)) {
            logger.warn(`[updateDealStatus] Invalid dealId: ${dealId}`);
            return null;
        }
        if (!performedBy || !Types.ObjectId.isValid(performedBy)) {
            logger.warn(`[updateDealStatus] Invalid performedBy: ${performedBy}`);
            return null;
        }

        // Get the deal before updating to capture old status
        const oldDeal = await Deal.findById(dealId);
        if (!oldDeal) {
            logger.warn(`[updateDealStatus] Deal not found: ${dealId}`);
            return null;
        }

        const updatedDeal = await Deal.findByIdAndUpdate(
            dealId,
            {
                $set: { status },
                $push: {
                    activityLog: {
                        action: 'status_changed',
                        performedBy: new Types.ObjectId(performedBy),
                        performedAt: new Date(),
                        details: `Status changed to ${status}`
                    }
                }
            },
            { new: true }
        );

        // Send Telegram notification for status change
        if (updatedDeal && oldDeal.status !== status) {
            try {
                sendDealChangeNotification({
                    dealNumber: updatedDeal.dealNumber,
                    dealId: updatedDeal._id.toString(),
                    oldStatus: oldDeal.status,
                    newStatus: status,
                    changedBy: 'System (DealService)',
                    changeType: 'status'
                });
            } catch (error) {
                console.error('Failed to send deal status change notification:', error);
            }
        }

        return updatedDeal;
    }

    /**
     * Добавляет запись в лог активности
     */
    async addActivityLog(
        dealId: string, 
        action: string, 
        performedBy: string, 
        details: string
    ): Promise<void> {
        // Validate IDs format before attempting to create ObjectId
        if (!dealId || !Types.ObjectId.isValid(dealId)) {
            logger.warn(`[addActivityLog] Invalid dealId: ${dealId}`);
            return;
        }
        if (!performedBy || !Types.ObjectId.isValid(performedBy)) {
            logger.warn(`[addActivityLog] Invalid performedBy: ${performedBy}`);
            return;
        }

        await Deal.findByIdAndUpdate(dealId, {
            $push: {
                activityLog: {
                    action,
                    performedBy: new Types.ObjectId(performedBy),
                    performedAt: new Date(),
                    details
                }
            }
        });
    }
}

// Legacy функция для обратной совместимости
export const getPopulatedDealById = async (dealId: string | Types.ObjectId): Promise<IDeal | null> => {
    const dealService = new DealService();
    logger.warn('DEPRECATED: Use DealService.getDealFull() instead of getPopulatedDealById');
    return dealService.getDealFull(dealId.toString()) as Promise<IDeal | null>;
};

// Экспорт экземпляра сервиса
export const dealService = new DealService();

/**
 * Converts DealFullDto to IDeal-compatible format for legacy helper functions
 */
export function convertDtoToIDealFormat(dto: DealFullDto): Partial<IDeal> {
    return {
        _id: new Types.ObjectId(dto._id),
        dealNumber: dto.dealNumber,
        status: dto.status as IDeal['status'],
        stage: dto.stage as IDeal['stage'],
        amount: dto.amount,
        dealType: dto.dealType as IDeal['dealType'],
        buyerId: typeof dto.buyer?._id === 'string' ? new Types.ObjectId(dto.buyer._id) : dto.buyer?._id as Types.ObjectId | undefined,
        sellerId: typeof dto.seller?._id === 'string' ? new Types.ObjectId(dto.seller._id) : dto.seller?._id as Types.ObjectId | undefined,
        buyerCompanyId: typeof dto.buyerCompanyId?._id === 'string' ? new Types.ObjectId(dto.buyerCompanyId._id) : dto.buyerCompanyId?._id as Types.ObjectId | undefined,
        sellerCompanyId: typeof dto.sellerCompanyId?._id === 'string' ? new Types.ObjectId(dto.sellerCompanyId._id) : dto.sellerCompanyId?._id as Types.ObjectId | undefined,
        invoiceUrl: dto.invoiceUrl,
        products: dto.products as unknown as IDeal['products'],
        createdAt: dto.createdAt,
        updatedAt: dto.updatedAt
    };
} 