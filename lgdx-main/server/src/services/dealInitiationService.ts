import mongoose, { Types } from 'mongoose';
import Deal from '../models/Deal';
import Product from '../models/Product';
import User from '../models/User';
import Company from '../models/Company';
import Counter from '../models/Counter';
import marketplaceConfig from '../config/marketplace';
import { findAlternativeProducts } from '../controllers/deal/helpers';
import { extractObjectId } from '../types/mongoose-helpers';
import { 
    IDeal, 
    IUser, 
    IProduct, 
    ICompany, 
    IDealProduct, 
    ICartItem, 
    IShippingDetails, 
    IRequestDetails, 
    IActivityLog, 
    DealStatus, 
    DealStage, 
    IShippingAddress 
} from '../types';
import { 
    ValidationError, 
    NotFoundError, 
    AppError 
} from '../middleware/errorHandler';
import { sendDealEventNotification } from '../utils/telegramBot';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';
import { notificationService } from './notificationService';

// Types and Interfaces
type DealType = 'buyer-to-lgdeal' | 'lgdeal-to-seller';

interface ICounterModel extends mongoose.Model<ICounter> {
    getNextValue(counterName: string, startValue?: number, digits?: number): Promise<string>;
}

interface ICounter extends mongoose.Document {
    _id: string;
    seq: number;
}

interface MarketplaceConfig {
    managementCompany: {
        name: string;
        shippingAddress?: {
            recipientName?: string;
            addressLine1?: string;
            city?: string;
            stateProvinceRegion?: string;
            postalCode?: string;
            country?: string;
        }
    };
    defaultInternalShippingCost?: number;
    sellerDealPricePercentage?: number;
    sellerDealFeePercentage?: number;
}

interface PopulatedCartItem extends Omit<ICartItem, 'product'> {
    _id?: Types.ObjectId;
    product: IProduct;
}

interface PopulatedUser extends IUser {
    cart: {
        items: PopulatedCartItem[];
        updatedAt: Date;
    };
}

// DTOs
export interface InitiateDealRequest {
    userId: string;
    cartItemIds: string[];
    shippingAddress: {
        address: string;
        city: string;
        region: string;
        zipCode: string;
        country: string;
    };
}

export interface InitiateDealResponse {
    success: boolean;
    message: string;
    buyerDeal: IDeal;
    lgdealToSellerAlternativeDeals: Types.ObjectId[];
    lgdealToSellerOriginalProductDeals: Types.ObjectId[];
}

interface SellerGroup {
    seller: IUser;
    company: ICompany;
    products: IDealProduct[];
}

export class DealInitiationService {
    private productMarketPricesAtInitiation: Map<string, { marketPrice: number; marketPricePerCarat: number }> = new Map();
    
    /**
     * Main method to initiate deals from cart
     */
    async initiateDealFromCart(request: InitiateDealRequest): Promise<InitiateDealResponse> {
        // Validate request
        this.validateRequest(request);
        
        // Get buyer and validate
        const buyer = await this.getBuyerWithPopulatedCart(request.userId);
        const buyerCompany = await this.getBuyerCompany(buyer);
        
        // Ensure no product in cart is already in another deal or sold (prevents double-booking)
        await this.ensureProductsAvailableForDeal(request.cartItemIds, buyer);
        
        // Get LGDEAL company
        const lgdealCompany = await this.getLgdealCompany();
        
        // Process cart items and create deal structure
        const dealStructure = await this.processCartItems(
            buyer, 
            request.cartItemIds, 
            lgdealCompany._id
        );
        
        // Get default LGDEAL supervisor for all deals
        const lgdealSupervisorId = await this.getDefaultLgdealSupervisor(lgdealCompany);
        
        // Create main buyer-to-LGDEAL deal
        const buyerDeal = await this.createBuyerToLgdealDeal(
            buyer,
            buyerCompany,
            lgdealCompany,
            dealStructure,
            request.shippingAddress,
            lgdealSupervisorId
        );
        
        // Create LGDEAL-to-seller deals for alternatives
        const alternativeDealsResult = await this.createAlternativeSellerDeals(
            dealStructure.alternativeDeals,
            buyerDeal,
            lgdealCompany,
            lgdealSupervisorId // ✅ Use LGDEAL supervisor, not buyer
        );
        
        // Create LGDEAL-to-seller deals for original products
        const originalProductDeals = await this.createOriginalProductSellerDeals(
            dealStructure.sellerGroups,
            buyerDeal,
            lgdealCompany,
            lgdealSupervisorId // ✅ Use LGDEAL supervisor, not buyer
        );
        
        // Update buyer deal with paired deal IDs
        await this.updateBuyerDealWithPairedDeals(
            buyerDeal,
            [...alternativeDealsResult.dealIds, ...originalProductDeals]
        );
        
        // Update buyer deal with alternative pairedLgdealToSellerDealId mappings
        await this.updateAlternativesMappings(
            buyerDeal._id,
            alternativeDealsResult.productToDealMapping
        );
        
        // Update product statuses
        await this.updateProductStatuses(dealStructure.productIdsToUpdate);
        
        // Clear cart
        await this.clearProcessedCartItems(buyer, request.cartItemIds);
        
        // Repopulate the deal for the notification
        const populatedDeal = await Deal.findById(buyerDeal._id).populate<{
            buyerId: IUser;
            buyerCompanyId: ICompany;
            products: {
                product: IProduct & { company: ICompany };
                suggestedAlternatives: {
                    product: IProduct & { company: ICompany };
                }[];
            }[];
        }>([
            { path: 'buyerId', select: 'firstName lastName email phone' },
            { path: 'buyerCompanyId', select: 'name details' },
            { 
                path: 'products.product',
                select: 'shape carat color clarity certificateNumber company',
                populate: { path: 'company', select: '_id name' }
            },
            {
                path: 'products.suggestedAlternatives.product',
                select: 'shape carat color clarity certificateNumber company',
                populate: {
                    path: 'company',
                    select: '_id name'
                }
            }
        ]);

        // Fetch seller deals once (for TG customer-order summary and for seller notifications)
        const allSellerDealIds = [
            ...alternativeDealsResult.dealIds,
            ...originalProductDeals
        ];
        let sellerDealsPopulated: Array<{
            _id: Types.ObjectId; dealNumber: string; sellerId?: IUser | Types.ObjectId;
            sellerCompanyId?: ICompany | Types.ObjectId; buyerCompanyId?: ICompany | Types.ObjectId;
            metadata?: { dashboardDealType?: string };
        }> = [];
        if (allSellerDealIds.length > 0) {
            sellerDealsPopulated = await Deal.find({ _id: { $in: allSellerDealIds } })
                .populate('sellerId', 'firstName lastName email _id')
                .populate('buyerCompanyId', 'name')
                .populate('sellerCompanyId', 'name')
                .lean() as typeof sellerDealsPopulated;
        }

        const supplierDealsSummary = sellerDealsPopulated.map((sd: any) => ({
            dealNumber: sd.dealNumber,
            sellerName: sd.sellerCompanyId && typeof sd.sellerCompanyId === 'object' && 'name' in sd.sellerCompanyId ? sd.sellerCompanyId.name : 'Supplier',
            type: (sd.metadata?.dashboardDealType === 'alternativeSupplierPurchase' ? 'alternative' : 'main') as 'main' | 'alternative'
        }));

        // Send Telegram notification for customer order (with supplier deals context)
        if (populatedDeal) {
            this.sendNewDealNotification(populatedDeal as unknown as IDeal, supplierDealsSummary);
        }
        
        // Notify buyer that their deal was created
        try {
            const buyerIdStr = buyerDeal.buyerId?.toString();
            if (buyerIdStr) {
                await notificationService.createNotification({
                    userId: buyerIdStr,
                    type: 'deal_created',
                    title: 'Deal Created',
                    message: `Your order #${buyerDeal.dealNumber} has been created and sent to the seller for review.`,
                    dealId: buyerDeal._id,
                    dealNumber: buyerDeal.dealNumber,
                    priority: 'medium',
                    actionUrl: `/deal/${buyerDeal._id}`,
                    actionLabel: 'View Deal'
                });
            }

            // Notify admins and supervisors about the new deal
            await notificationService.notifyAdminsAndSupervisors(
                { _id: buyerDeal._id, dealNumber: buyerDeal.dealNumber },
                'deal_created',
                'New Customer Deal',
                `New deal #${buyerDeal.dealNumber} created by buyer. Awaiting seller approval.`,
                'medium'
            );
        } catch (error) {
            logger.error('[DealInitiationService] Failed to send buyer/admin deal_created notification', { error });
        }

        // Send notifications to sellers for all created lgdeal-to-seller deals
        try {
            if (sellerDealsPopulated.length > 0) {
                const customerOrderNumber = buyerDeal.dealNumber;
                for (const sellerDeal of sellerDealsPopulated) {
                    if (sellerDeal.sellerId) {
                        let sellerId: string | undefined;
                        
                        if (typeof sellerDeal.sellerId === 'object' && '_id' in sellerDeal.sellerId) {
                            sellerId = (sellerDeal.sellerId as IUser)._id?.toString();
                        } else if (typeof sellerDeal.sellerId === 'object' && 'toString' in sellerDeal.sellerId) {
                            sellerId = (sellerDeal.sellerId as Types.ObjectId).toString();
                        } else {
                            sellerId = String(sellerDeal.sellerId);
                        }
                        const sellerCompany = sellerDeal.sellerCompanyId as ICompany | Types.ObjectId | undefined;
                        const sellerName = sellerCompany && typeof sellerCompany === 'object' && 'name' in sellerCompany
                            ? (sellerCompany as ICompany).name
                            : 'Seller';
                        const dealKind = (sellerDeal as any).metadata?.dashboardDealType === 'alternativeSupplierPurchase' ? 'alternative' : 'main product';
                        if (sellerId) {
                            await notificationService.createNotification({
                                userId: sellerId,
                                type: 'deal_created',
                                title: 'New Deal Request',
                                message: `Customer order #${customerOrderNumber}. Our purchase #${sellerDeal.dealNumber}: LGDEAL → ${sellerName} (${dealKind}). Please review.`,
                                dealId: sellerDeal._id,
                                dealNumber: sellerDeal.dealNumber,
                                priority: 'high',
                                actionUrl: `/deal/${sellerDeal._id}`,
                                actionLabel: 'View Deal'
                            });
                            
                            logger.info('[DealInitiationService] Notification sent to seller', {
                                sellerId,
                                dealId: sellerDeal._id,
                                dealNumber: sellerDeal.dealNumber
                            });
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('[DealInitiationService] Failed to send notifications to sellers', { error });
            // Don't fail the whole operation if notifications fail
        }
        
        return {
            success: true,
            message: 'Deals initiated successfully from cart.',
            buyerDeal,
            lgdealToSellerAlternativeDeals: alternativeDealsResult.dealIds,
            lgdealToSellerOriginalProductDeals: originalProductDeals
        };
    }
    
    private validateRequest(request: InitiateDealRequest): void {
        if (!request.cartItemIds || !Array.isArray(request.cartItemIds) || request.cartItemIds.length === 0) {
            throw new ValidationError('No cart items specified for checkout');
        }
        
        if (!request.shippingAddress) {
            throw new ValidationError('Shipping address is required');
        }
        
        const { address, city, country } = request.shippingAddress;
        if (!address || !city || !country) {
            throw new ValidationError('Address, city, and country are required in shipping address');
        }
    }
    
    private async getBuyerWithPopulatedCart(userId: string): Promise<PopulatedUser> {
        const buyerUserId = new Types.ObjectId(userId);
        
        const buyer = await User.findById(buyerUserId).populate({
            path: 'cart.items.product',
            model: 'Product',
            populate: { path: 'company', model: 'Company', select: 'name _id' }
        }) as PopulatedUser | null;
        
        if (!buyer || !buyer.company) {
            throw new NotFoundError('Buyer or buyer\'s associated company not found');
        }
        
        return buyer;
    }
    
    private async getBuyerCompany(buyer: PopulatedUser): Promise<ICompany> {
        const buyerCompany = await Company.findById(buyer.company) as ICompany | null;
        if (!buyerCompany) {
            throw new NotFoundError('Buyer company details not found');
        }
        return buyerCompany;
    }
    
    private async getLgdealCompany(): Promise<ICompany> {
        const lgdealCompany = await Company.findOne({ 
            name: (marketplaceConfig as MarketplaceConfig).managementCompany.name 
        }).populate('details.shippingAddress') as ICompany | null;
        
        if (!lgdealCompany || !lgdealCompany._id) {
            throw new AppError('LGDeal INC Management company not found', 500);
        }
        
        return lgdealCompany;
    }
    
    /**
     * Get default LGDEAL supervisor for deal assignment
     * Finds the first active supervisor in LGDEAL company
     */
    private async getDefaultLgdealSupervisor(lgdealCompany: ICompany): Promise<Types.ObjectId> {
        // Try to find a supervisor (manager role preferred)
        const supervisor = await User.findOne({ 
            company: lgdealCompany._id,
            role: { $in: ['supervisor', 'manager'] },
            isActive: true
        }).select('_id').sort({ role: -1 }); // 'supervisor' sorts before 'manager'
        
        if (supervisor && supervisor._id) {
            logger.debug('[DealInitiationService] Found LGDEAL supervisor', { supervisorId: supervisor._id });
            return supervisor._id as Types.ObjectId;
        }
        
        // Fallback: try to find any LGDEAL employee
        const anyLgdealUser = await User.findOne({ 
            company: lgdealCompany._id,
            isActive: true
        }).select('_id');
        
        if (anyLgdealUser && anyLgdealUser._id) {
            logger.warn('[DealInitiationService] No supervisor found, using fallback LGDEAL user', { userId: anyLgdealUser._id });
            return anyLgdealUser._id as Types.ObjectId;
        }
        
        throw new AppError('No active LGDEAL users found for deal assignment', 500);
    }
    
    /**
     * Ensures all products in the selected cart items are still available (not in another deal, not sold).
     * Prevents double-booking when the same product is in two deals.
     */
    private async ensureProductsAvailableForDeal(cartItemIds: string[], buyer: PopulatedUser): Promise<void> {
        if (!buyer.cart?.items?.length || !cartItemIds.length) return;
        const productIds: Types.ObjectId[] = [];
        for (const cartItemId of cartItemIds) {
            const cartItem = buyer.cart!.items.find(item => item._id!.toString() === cartItemId.toString());
            if (cartItem?.product?._id) {
                productIds.push(cartItem.product._id as Types.ObjectId);
            }
        }
        if (productIds.length === 0) return;
        const products = await Product.find({ _id: { $in: productIds } })
            .select('_id onDeal sold status')
            .lean<Array<{ _id: Types.ObjectId; onDeal?: boolean; sold?: boolean; status?: string }>>();
        const unavailable = products.filter(p => p.onDeal === true || p.sold === true);
        if (unavailable.length > 0) {
            const ids = unavailable.map(p => p._id.toString()).join(', ');
            throw new ValidationError(
                `One or more products are no longer available (already in a deal or sold). Please remove them from the cart and try again. Product IDs: ${ids}`
            );
        }
    }
    
    private async processCartItems(
        buyer: PopulatedUser, 
        cartItemIds: string[], 
        lgdealCompanyId: Types.ObjectId
    ) {
        const sellerGroups = new Map<string, SellerGroup>();
        const allProductsForBuyerDeal: IDealProduct[] = [];
        const productIdsToUpdate: Types.ObjectId[] = [];
        const lgdealInventoryProducts: { productId: Types.ObjectId; price: number; originalProductData: IProduct }[] = [];
        const alternativeDeals: Array<{
            product: IProduct;
            sellerUser: IUser;
            sellerCompany: ICompany;
            price: number;
        }> = [];
        let totalBuyerDealAmount = 0;
        
        for (const cartItemId of cartItemIds) {
            const cartItem = buyer.cart.items.find(item => item._id!.toString() === cartItemId.toString());
            if (!cartItem?.product) {
                logger.warn(`Cart item ${cartItemId} not found in buyer's populated cart. Skipping.`);
                continue;
            }
            
            const product = cartItem.product;
            
            if (!product._id) {
                throw new ValidationError(`Invalid ID for product associated with cart item ${cartItemId}`);
            }
            
            if (!product.company) {
                throw new ValidationError(`Product ${product._id} is missing company information`);
            }
            
            // Get the fixed market price for this product
            const fixedMarketPrice = this.productMarketPricesAtInitiation.get(product._id.toString());
            const marketPrice = fixedMarketPrice?.marketPrice || product.marketPrice || 0;
            
            if (typeof marketPrice !== 'number' || marketPrice <= 0) {
                throw new ValidationError(`Product ${product._id} must have a valid marketPrice to be included in a deal.`);
            }
            
            totalBuyerDealAmount += marketPrice;
            productIdsToUpdate.push(product._id as Types.ObjectId);
            
            // Process alternatives
            const alternatives = await this.processProductAlternatives(
                product, 
                lgdealCompanyId,
                alternativeDeals
            );
            
            // Add to buyer deal products (with snapshot so deal display survives product deletion)
            allProductsForBuyerDeal.push({
                product: product._id as Types.ObjectId,
                productSnapshot: {
                    shape: product.shape,
                    carat: product.carat,
                    color: product.color,
                    clarity: product.clarity,
                    certificateNumber: product.certificateNumber,
                    certificateInstitute: product.certificateInstitute,
                    location: product.location,
                },
                price: marketPrice,
                quantity: 1,
                marketPriceAtInitiation: marketPrice,
                suggestedAlternatives: alternatives,
            });
            
            // Process seller grouping
            await this.processSellerGrouping(
                product,
                lgdealCompanyId,
                sellerGroups,
                lgdealInventoryProducts
            );
        }
        
        return {
            sellerGroups,
            allProductsForBuyerDeal,
            productIdsToUpdate,
            lgdealInventoryProducts,
            alternativeDeals,
            totalBuyerDealAmount
        };
    }
    
    private async processProductAlternatives(
        product: IProduct,
        lgdealCompanyId: Types.ObjectId,
        alternativeDeals: Array<{
            product: IProduct;
            sellerUser: IUser;
            sellerCompany: ICompany;
            price: number;
        }>
    ): Promise<IDealProduct['suggestedAlternatives']> {
        const foundAlternatives = await findAlternativeProducts(product, 3);
        const alternativesForProduct: IDealProduct['suggestedAlternatives'] = [];
        
        for (const altProduct of foundAlternatives) {
            const altProductPrice = altProduct.marketPrice;
            if (!altProduct._id || !altProduct.company || !altProductPrice) {
                logger.warn(`Alternative product ${altProduct._id} is missing required data (ID, company, or marketPrice) and will be skipped.`);
                continue;
            }
            
            const altSellerCompany = altProduct.company && typeof altProduct.company === 'object' && '_id' in altProduct.company
                ? altProduct.company
                : null;
            if (!altSellerCompany) {
                logger.warn(`Alternative product ${altProduct._id} has no valid company, skipping`);
                continue;
            }
            const altSellerUser = await this.findSellerUser(altSellerCompany._id);

            if (!altSellerUser) {
                logger.warn(`No active seller found for company ${altSellerCompany && typeof altSellerCompany === 'object' && 'name' in altSellerCompany ? altSellerCompany.name : altSellerCompany} (alternative product ${altProduct._id})`);
                alternativesForProduct.push({
                    product: extractObjectId(altProduct) || new Types.ObjectId(),
                    pairedLgdealToSellerDealId: null
                });
                continue;
            }
            
            // Store for later deal creation
            alternativeDeals.push({
                product: altProduct,
                sellerUser: altSellerUser,
                sellerCompany: altSellerCompany as unknown as ICompany, // We know it's not null due to check above
                price: altProductPrice
            });
            
            // Placeholder - will be updated after deal creation
            alternativesForProduct.push({
                product: extractObjectId(altProduct) || new Types.ObjectId(), 
                pairedLgdealToSellerDealId: null 
            });
        }
        
        return alternativesForProduct;
    }
    
    private async processSellerGrouping(
        product: IProduct,
        lgdealCompanyId: Types.ObjectId,
        sellerGroups: Map<string, SellerGroup>,
        lgdealInventoryProducts: Array<{ productId: Types.ObjectId; price: number; originalProductData: IProduct }>
    ): Promise<void> {
        const productSellerCompany = product.company && typeof product.company === 'object' && '_id' in product.company
            ? product.company
            : null;
        if (!productSellerCompany) {
            logger.warn(`Product ${product._id} has no valid company, skipping`);
            return;
        }
        const isLgdealProduct = productSellerCompany._id.toString() === lgdealCompanyId.toString();
        
        const priceForLgdealProduct = product.marketPrice;
        if (isLgdealProduct) {
            if (priceForLgdealProduct === undefined) {
            logger.warn(`[DealInitiationService] Market price for LGDEAL's own product ${product._id} is undefined. Skipping.`);
                return;
            }
            lgdealInventoryProducts.push({
                productId: product._id as Types.ObjectId,
                price: priceForLgdealProduct, // Use 100% market price for internal products
                originalProductData: product
            });
            return;
        }
        
        const sellerUser = await this.findSellerUser(productSellerCompany._id);
        if (!sellerUser) {
            logger.warn(`No active seller found for company ${productSellerCompany && typeof productSellerCompany === 'object' && 'name' in productSellerCompany ? productSellerCompany.name : productSellerCompany} (product ${product._id})`);
            return;
        }

        const sellerKey = sellerUser._id.toString();
        if (!sellerGroups.has(sellerKey)) {
            sellerGroups.set(sellerKey, {
                seller: sellerUser,
                company: productSellerCompany as unknown as ICompany, // We know it's not null due to check above
                products: [],
            });
        }
        
        const group = sellerGroups.get(sellerKey)!;
        
        // Get the fixed market price for this product
        const productIdString = extractObjectId(product)?.toString() || (typeof product._id === 'string' ? product._id : product._id?.toString());
        const fixedMarketPrice = this.productMarketPricesAtInitiation.get(productIdString || '');
        const priceToPass = fixedMarketPrice?.marketPrice || product.marketPrice || 0;
        
        if (typeof priceToPass !== 'number' || priceToPass <= 0) {
            logger.warn(`[DealInitiationService] Market price for original product ${product._id} is undefined, cannot add to seller group.`);
            return;
        }

        // Pass the product's market price. It will be adjusted in createSellerDealData. Snapshot for display if product is later deleted.
        group.products.push({
            product: product._id as Types.ObjectId,
            productSnapshot: {
                shape: product.shape,
                carat: product.carat,
                color: product.color,
                clarity: product.clarity,
                certificateNumber: product.certificateNumber,
                certificateInstitute: product.certificateInstitute,
                location: product.location,
            },
            price: priceToPass,
            quantity: 1,
            marketPriceAtInitiation: priceToPass,
        });
    }
    
    private async findSellerUser(companyId: Types.ObjectId): Promise<IUser | null> {
        return await User.findOne({
            company: companyId,
            $or: [{ role: 'supervisor' }, { role: 'manager' }],
            isActive: true
        }) || await User.findOne({ company: companyId, isActive: true });
    }
    
    private async createBuyerToLgdealDeal(
        buyer: PopulatedUser,
        buyerCompany: ICompany,
        lgdealCompany: ICompany,
        dealStructure: any,
        shippingAddress: any,
        lgdealSupervisorId: Types.ObjectId
    ): Promise<IDeal> {
        const dealNumber = await (Counter as unknown as ICounterModel).getNextValue('deal');

        // Calculate fee based on marketplace config
        const fee = 0; // Buyer has no fee as per config

        // Calculate total amount using market prices (100%)
        const totalAmountForBuyer = dealStructure.allProductsForBuyerDeal.reduce(
            (sum: number, p: IDealProduct) => sum + (p.marketPriceAtInitiation || p.price), 
            0
        );

        const newDeal = new Deal({
            dealNumber,
            amount: totalAmountForBuyer, // Full market price
            fee: fee,
            buyerId: buyer._id,
            buyerCompanyId: buyerCompany._id,
            sellerId: lgdealSupervisorId, // ✅ Set LGDEAL supervisor as seller
            sellerCompanyId: lgdealCompany._id,
            stage: 'request' as DealStage,
            status: 'pending' as DealStatus,
            dealType: 'buyer-to-lgdeal' as DealType,
            products: dealStructure.allProductsForBuyerDeal.map((p: IDealProduct) => ({
                ...p,
                price: p.marketPriceAtInitiation || p.price // Ensure we use market price
            })),
            requestDetails: {
                requestDate: new Date(),
                requestedBy: buyer._id,
                notes: 'Deal initiated from cart checkout'
            } as IRequestDetails,
            shippingDetails: {
                cost: (marketplaceConfig as MarketplaceConfig).defaultInternalShippingCost || 0,
                shippingAddress: {
                    recipientName: `${buyer.firstName} ${buyer.lastName}`,
                    addressLine1: shippingAddress.address,
                    city: shippingAddress.city,
                    stateProvinceRegion: shippingAddress.region,
                    postalCode: shippingAddress.zipCode,
                    country: shippingAddress.country,
                } as IShippingAddress
            } as IShippingDetails,
            activityLog: [{
                action: 'deal_created',
                performedBy: buyer._id,
                details: `Buyer initiated deal #${dealNumber} for products purchase.`,
                timestamp: new Date(),
            }] as IActivityLog[],
            lastActionAt: new Date(),
        });
        
        return await newDeal.save();
    }
    
    private async createAlternativeSellerDeals(
        alternativeDeals: Array<{
            product: IProduct;
            sellerUser: IUser;
            sellerCompany: ICompany;
            price: number;
        }>,
        buyerDeal: IDeal,
        lgdealCompany: ICompany,
        lgdealSupervisorId: Types.ObjectId
    ): Promise<{ dealIds: Types.ObjectId[]; productToDealMapping: Map<string, Types.ObjectId> }> {
        const createdDeals: Types.ObjectId[] = [];
        const productToDealMapping = new Map<string, Types.ObjectId>();
        let letterSuffixAlternative = 0;

        // Get fee percentages from config
        const sellerTransactionFee = marketplaceConfig.managementCompany.sellerTransactionFee; // 4%
        const sellerPricePercentage = 1 - sellerTransactionFee; // 96%
        
        for (const altDeal of alternativeDeals) {
            try {
                const dealNumber = `${await (Counter as unknown as ICounterModel).getNextValue('sellerDealNumber', 100001, 6)}alts${letterSuffixAlternative++}`;
                
                const marketPrice = altDeal.product.marketPrice;
                if (typeof marketPrice !== 'number' || marketPrice <= 0) {
                    logger.warn(`Skipping alternative deal creation for product ${altDeal.product._id} due to invalid market price.`);
                    continue;
                }
                const roundedMarketPrice = Number(marketPrice.toFixed(2));
                const sellerAmount = Number((roundedMarketPrice * sellerPricePercentage).toFixed(2));
                const fee = Number((roundedMarketPrice * sellerTransactionFee).toFixed(2));

                const dealData: Partial<IDeal> = {
                    dealNumber,
                    dealType: 'lgdeal-to-seller',
                    status: 'pending',
                    stage: 'request',
                    buyerId: lgdealSupervisorId, // ✅ Use LGDEAL supervisor as buyer
                    buyerCompanyId: lgdealCompany._id,
                    sellerId: altDeal.sellerUser._id,
                    sellerCompanyId: altDeal.sellerCompany._id,
                    products: [{
                        product: extractObjectId(altDeal.product) || new Types.ObjectId(),
                        productSnapshot: {
                            shape: altDeal.product.shape,
                            carat: altDeal.product.carat,
                            color: altDeal.product.color,
                            clarity: altDeal.product.clarity,
                            certificateNumber: altDeal.product.certificateNumber,
                            certificateInstitute: altDeal.product.certificateInstitute,
                            location: altDeal.product.location,
                        },
                        price: sellerAmount, // 96% of market price
                        marketPriceAtInitiation: roundedMarketPrice,
                        quantity: 1
                    }],
                    amount: sellerAmount,
                    fee: fee,
                    pairedDealId: buyerDeal._id,
                    shippingDetails: {
                        shippingAddress: this.getLgdealShippingAddress(lgdealCompany)
                    },
                    requestDetails: {
                        requestedBy: lgdealSupervisorId, // ✅ LGDEAL supervisor requests alternatives
                        requestDate: new Date(),
                        notes: `System-generated deal for alternative to product in deal ${buyerDeal.dealNumber}.`
                    },
                    metadata: {
                        dashboardDealType: 'alternativeSupplierPurchase'
                    }
                };
                
                const createdDeal = await Deal.create(dealData);
                createdDeals.push(createdDeal._id);
                
                // Map alternative product ID to created deal ID
                productToDealMapping.set(altDeal.product._id!.toString(), createdDeal._id);
            } catch (error: unknown) {
                logger.error(`Failed to save alternative deal for product ${altDeal.product._id}:`, { error: getErrorMessage(error) });
            }
        }
        
        return { dealIds: createdDeals, productToDealMapping };
    }
    
    private async createOriginalProductSellerDeals(
        sellerGroups: Map<string, SellerGroup>,
        buyerDeal: IDeal,
        lgdealCompany: ICompany,
        lgdealSupervisorId: Types.ObjectId
    ): Promise<Types.ObjectId[]> {
        const createdDeals: Types.ObjectId[] = [];
        let letterSuffixOriginal = 'a';
        
        for (const [_sellerId, group] of sellerGroups) {
            try {
                const currentSuffix = letterSuffixOriginal;
                letterSuffixOriginal = String.fromCharCode(letterSuffixOriginal.charCodeAt(0) + 1);
                
                const dealNumber = `${await (Counter as unknown as ICounterModel).getNextValue('sellerDealNumber', 100001, 6)}${currentSuffix}`;
                
                const dealData = await this.createSellerDealData(
                    dealNumber,
                    group.seller,
                    group.company,
                    lgdealCompany,
                    group.products,
                    buyerDeal,
                    lgdealSupervisorId,
                    `LGDEAL purchase request for product(s) for main deal #${buyerDeal.dealNumber}`,
                    'primarySupplierPurchase'
                );
                
                const savedDeal = await new Deal(dealData).save();
                createdDeals.push(savedDeal._id);
            } catch (error: unknown) {
                logger.error(`Failed to save seller deal for group:`, { error: getErrorMessage(error) });
            }
        }
        
        return createdDeals;
    }
    
    private async createSellerDealData(
        dealNumber: string,
        seller: IUser,
        company: ICompany,
        lgdealCompany: ICompany,
        products: IDealProduct[],
        buyerDeal: IDeal,
        lgdealSupervisorId: Types.ObjectId,
        notes: string,
        dashboardDealType: 'primarySupplierPurchase' | 'alternativeSupplierPurchase'
    ): Promise<Partial<IDeal>> {
        if (!seller || !company || !lgdealCompany || !buyerDeal) {
            throw new AppError('Missing required data for seller deal creation', 500);
        }

        // Get fee percentages from config
        const sellerTransactionFee = marketplaceConfig.managementCompany.sellerTransactionFee; // 4%
        const sellerPricePercentage = 1 - sellerTransactionFee; // 96%

        // Calculate total market price first, rounding to 2 decimal places
        const totalMarketPrice = Number(products.reduce((sum, p) => {
            const price = p.marketPriceAtInitiation;
            if (typeof price !== 'number' || price <= 0) {
                throw new ValidationError(`Invalid market price for product during seller deal creation.`);
            }
            return sum + price;
        }, 0).toFixed(2));

        // Calculate seller amount and fee from total market price, rounding to 2 decimal places
        const sellerAmount = Number((totalMarketPrice * sellerPricePercentage).toFixed(2)); // 96% of market price
        const fee = Number((totalMarketPrice * sellerTransactionFee).toFixed(2)); // 4% of market price

        const sellerProducts = products.map((p: IDealProduct) => {
            const productMarketPrice = p.marketPriceAtInitiation;
            if (typeof productMarketPrice !== 'number' || productMarketPrice <= 0) {
                throw new ValidationError(`Invalid market price detected for product ${p.product} when creating seller deal product list.`);
            }

            return {
                product: p.product,
                productSnapshot: p.productSnapshot,
                price: Number((productMarketPrice * sellerPricePercentage).toFixed(2)), // 96% of market price
                quantity: p.quantity,
                marketPriceAtInitiation: productMarketPrice // Store original market price
            };
        });

        return {
            dealNumber,
            dealType: 'lgdeal-to-seller',
            status: 'pending',
            stage: 'request',
            buyerId: lgdealSupervisorId, // ✅ Use LGDEAL supervisor as buyer
            buyerCompanyId: lgdealCompany._id,
            sellerId: seller._id,
            sellerCompanyId: company._id,
            products: sellerProducts,
            amount: sellerAmount,
            fee: fee,
            pairedDealId: buyerDeal._id,
            shippingDetails: {
                shippingAddress: this.getLgdealShippingAddress(lgdealCompany)
            },
            requestDetails: {
                requestedBy: lgdealSupervisorId, // ✅ LGDEAL supervisor requests from seller
                requestDate: new Date(),
                notes,
            },
            metadata: {
                dashboardDealType: dashboardDealType
            }
        };
    }
    
    private getLgdealShippingAddress(lgdealCompany: ICompany): IShippingAddress {
        const addr = (marketplaceConfig as MarketplaceConfig).managementCompany.shippingAddress;
        return {
            recipientName: lgdealCompany.name,
            addressLine1: addr?.addressLine1 || 
                         lgdealCompany.details?.legalAddress?.addressLine1 || 
                         lgdealCompany.details?.legalAddress?.address || '',
            city: addr?.city || 
                  lgdealCompany.details?.legalAddress?.city || '',
            stateProvinceRegion: addr?.stateProvinceRegion || 
                                lgdealCompany.details?.legalAddress?.stateProvinceRegion || 
                                lgdealCompany.details?.legalAddress?.region || '',
            postalCode: addr?.postalCode || 
                       lgdealCompany.details?.legalAddress?.postalCode || 
                       lgdealCompany.details?.legalAddress?.zipCode || '',
            country: addr?.country || 
                    lgdealCompany.details?.legalAddress?.country || '',
        } as IShippingAddress;
    }
    
    private async updateBuyerDealWithPairedDeals(
        buyerDeal: IDeal,
        pairedDealIds: Types.ObjectId[]
    ): Promise<void> {
        if (pairedDealIds.length > 0) {
            buyerDeal.pairedDealIds = pairedDealIds;
            await buyerDeal.save();
        }
    }
    
    private async updateAlternativesMappings(
        buyerDealId: Types.ObjectId,
        productToDealMapping: Map<string, Types.ObjectId>
    ): Promise<void> {
        if (productToDealMapping.size === 0) {
            return;
        }
        
        // Update the buyer deal with correct pairedLgdealToSellerDealId mappings
        const updateOps: any[] = [];
        
        for (const [productId, dealId] of productToDealMapping) {
            // Используем два arrayFilter-а: 'prod' ограничивает обновление только тем элементом products,
            // у которого есть нужная альтернатива; 'alt' ограничивает конкретную альтернативу.
            // Это гарантирует точечное обновление даже при нескольких продуктах в сделке.
            updateOps.push({
                updateOne: {
                    filter: { 
                        _id: buyerDealId,
                        'products.suggestedAlternatives.product': new Types.ObjectId(productId)
                    },
                    update: {
                        $set: {
                            'products.$[prod].suggestedAlternatives.$[alt].pairedLgdealToSellerDealId': dealId
                        }
                    },
                    arrayFilters: [
                        { 'prod.suggestedAlternatives.product': new Types.ObjectId(productId) },
                        { 'alt.product': new Types.ObjectId(productId) }
                    ]
                }
            });
        }
        
        if (updateOps.length > 0) {
            try {
                await Deal.bulkWrite(updateOps);
                logger.info(`Updated ${updateOps.length} alternative product mappings for buyer deal ${buyerDealId}`);
            } catch (error: unknown) {
                logger.error(`Failed to update alternative mappings for buyer deal ${buyerDealId}:`, { error: getErrorMessage(error) });
            }
        }
    }
    
    private async updateProductStatuses(productIds: Types.ObjectId[]): Promise<void> {
        if (productIds.length > 0) {
            // Get current market prices for products before updating status
            type ProductPriceInfo = { _id: Types.ObjectId; marketPrice?: number; marketPricePerCarat?: number };
            const products = await Product.find({ _id: { $in: productIds } })
                .select('_id marketPrice marketPricePerCarat')
                .lean<ProductPriceInfo[]>();
            
            // Create a map of product market prices
            const productMarketPrices = new Map<string, { marketPrice: number; marketPricePerCarat: number }>(
                products.map(p => [p._id.toString(), {
                    marketPrice: p.marketPrice || 0,
                    marketPricePerCarat: p.marketPricePerCarat || 0
                }])
            );
            
            // Update product statuses
            await Product.updateMany(
                { _id: { $in: productIds } },
                { $set: { status: 'OnDeal', onDeal: true } }
            );
            
            // Store market prices for later use in deal products
            this.productMarketPricesAtInitiation = productMarketPrices;
        }
    }
    
    private async clearProcessedCartItems(buyer: PopulatedUser, cartItemIds: string[]): Promise<void> {
        if (buyer.cart?.items) {
            const cartItemObjectIds = cartItemIds.map(id => new Types.ObjectId(id));
            buyer.cart.items = buyer.cart.items.filter(item => 
                !cartItemObjectIds.some(processedId => processedId.equals(item._id!))
            );
            buyer.cart.updatedAt = new Date();
            await buyer.save();
        }
    }

    private sendNewDealNotification(
        deal: IDeal,
        supplierDealsSummary?: Array<{ dealNumber: string; sellerName: string; type: 'main' | 'alternative' }>
    ): void {
        try {
            type PopulatedCompany = ICompany & { details?: { phone?: string }};
            type PopulatedProduct = IProduct & { company: PopulatedCompany };
            type PopulatedDealProduct = { product: PopulatedProduct, isAlternative: boolean, price: number };
            type PopulatedUser = IUser & { phone: string };

            const escapeHTML = (text: string | number | undefined | null) => {
                if (text === undefined || text === null) return '';
                return String(text)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            };

            const buyer = deal.buyerId as PopulatedUser;
            const buyerCompany = deal.buyerCompanyId as PopulatedCompany;
            const dealProducts = deal.products as PopulatedDealProduct[];

            const mainProducts = dealProducts.filter(p => !p.isAlternative && p.product);
            const alternativeProducts = dealProducts.filter(p => p.isAlternative && p.product);

            const mainSellers = [...new Map(mainProducts.flatMap(p => 
                p.product.company ? [[p.product.company._id.toString(), p.product.company]] : []
            )).values()];

            const altSellers = [...new Map(alternativeProducts.flatMap(p => 
                p.product.company ? [[p.product.company._id.toString(), p.product.company]] : []
            )).values()];
            
            const dealDate = new Date(deal.createdAt);
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const formattedDate = `${dealDate.getDate()} ${monthNames[dealDate.getMonth()]} ${dealDate.getFullYear()}`;
            
            const userPhone = buyer.phone ? String(buyer.phone) : '';
            const companyPhone = buyerCompany.details?.phone ? String(buyerCompany.details.phone) : '';
            const cleanPhone = (userPhone || companyPhone).replace(/[^\\d]/g, '');
            const whatsappLink = cleanPhone ? `https://wa.me/${cleanPhone}` : '';

            const header = `<b>#order_created</b>`;
            const orderInfo = `💰 <b>CUSTOMER ORDER</b> #${escapeHTML(deal.dealNumber)} — ${escapeHTML(formattedDate)}`;
            const orderTypeLine = `📌 <i>Customer sale: ${escapeHTML(buyerCompany.name)} → LGDEAL. Product sources (suppliers) below; we buy from them in separate deals. Main product may be replaced by alternative during the flow.</i>`;
            
            const contactParts = [];
            if (cleanPhone) {
                contactParts.push(escapeHTML(`+${cleanPhone}`));
            }
            if (buyer.email) {
                contactParts.push(escapeHTML(buyer.email));
            }
            const contactsString = contactParts.length > 0 ? contactParts.join(', ') : 'N/A';
            
            const userInfoLines = [
                `<b>User</b> [${escapeHTML(buyer._id.toString())}]: ${escapeHTML(buyer.firstName)} ${escapeHTML(buyer.lastName)}`,
                `<b>Contacts</b>: ${contactsString}`,
            ];
            if (whatsappLink) {
                userInfoLines.push(`<b>Whatsapp</b>: <a href="${whatsappLink}">Contact Link</a>`);
            }

            const buyerSellerInfoLines = [
                `<b>Customer</b> [${escapeHTML(buyerCompany._id.toString())}]: ${escapeHTML(buyerCompany.name)}`,
                ...mainSellers.map(s => `<b>Product source (main)</b> [${escapeHTML(s._id.toString())}]: ${escapeHTML(s.name)}`),
                ...altSellers.map(s => `<b>Product source (alt)</b> [${escapeHTML(s._id.toString())}]: ${escapeHTML(s.name)}`),
            ];

            const mainProductItems = mainProducts.map((p, index) => {
                const product = p.product;
                const sellerName = product.company ? escapeHTML(product.company.name) : 'N/A';
                return ` ${index + 1}) ${escapeHTML(product.carat || '')}ct ${escapeHTML(product.shape || '')} ${escapeHTML(product.color || '')}/${escapeHTML(product.clarity || '')}, IGI ${escapeHTML(product.certificateNumber || 'N/A')}, Seller: ${sellerName}, $${escapeHTML(p.price?.toFixed(2) || '0.00')}`;
            }).join('\n');

            let alternativeProductItems = '';
            if (alternativeProducts.length > 0) {
                alternativeProductItems = alternativeProducts.map((p, index) => {
                    const product = p.product;
                    const sellerName = product.company ? escapeHTML(product.company.name) : 'N/A';
                    return ` ${index + 1}) ${escapeHTML(product.carat || '')}ct ${escapeHTML(product.shape || '')} ${escapeHTML(product.color || '')}/${escapeHTML(product.clarity || '')}, IGI ${escapeHTML(product.certificateNumber || 'N/A')}, Seller: ${sellerName}, $${escapeHTML(p.price?.toFixed(2) || '0.00')}`;
                }).join('\n');
            }

            const total = `<b>Total</b>: $${escapeHTML(deal.amount?.toFixed(2) || '0.00')}`;
            const footer = `<i>Server App: #APP_DIAMONDS_LGDEAL_API</i>`;

            const messageParts = [
                header,
                orderInfo,
                orderTypeLine,
                ...userInfoLines,
                ...buyerSellerInfoLines,
                '<b>Products:</b>',
                mainProductItems,
            ];

            if (alternativeProductItems) {
                messageParts.push(
                    '<b>Alternative Products:</b>',
                    alternativeProductItems
                );
            }

            if (supplierDealsSummary && supplierDealsSummary.length > 0) {
                messageParts.push('<b>Supplier deals created (LGDEAL → supplier):</b>');
                supplierDealsSummary.forEach(s => {
                    const label = s.type === 'alternative' ? 'alternative' : 'main product';
                    messageParts.push(` • #${escapeHTML(s.dealNumber)} → ${escapeHTML(s.sellerName)} (${label})`);
                });
            }

            messageParts.push(
                total,
                footer
            );

            const message = messageParts.join('\n\n');

            sendDealEventNotification(message);
        } catch (error) {
            logger.error(`[DealInitiationService] Failed to send Telegram notification for deal ${deal._id}:`, { error });
        }
    }
}

// Export service instance
export const dealInitiationService = new DealInitiationService();