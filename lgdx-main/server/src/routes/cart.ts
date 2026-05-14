import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import Product from '../models/Product';
import { authMiddleware as auth } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { AddToCartSchema, UpdateCartQuantitySchema } from '../validation/schemas/productSchemas';
import { IProduct } from '../types';
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/errorHandler';
import cacheService from '../services/cacheService';

const router = Router();

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    role: string;
        companyId?: string;
    isLgdealSupervisor?: boolean;
  };
}

router.get('/', auth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    console.log('[Cart Route] GET /cart - Starting request for user:', req.user.userId);
    
    // Попробуем получить данные из кэша
    const cachedUserData = await cacheService.getCachedUserData(req.user.userId);
    if (cachedUserData && cachedUserData.cart) {
        console.log('[Cart Route] Using cached user data');
        return res.json({
            items: cachedUserData.cart.items || [],
            total: cachedUserData.cart.total || 0,
            cached: true
        });
    }
    
    const user = await User.findById(req.user.userId)
        .populate<{ cart: { items: { product: IProduct, quantity: number, _id: mongoose.Types.ObjectId }[] } }>({
            path: 'cart.items.product',
            select: 'name price marketPrice photo shape carat color clarity certificateNumber certificateInstitute lab'
        }).lean();
    
    console.log('[Cart Route] User found:', {
        userId: user?._id,
        hasCart: !!user?.cart,
        cartItemsCount: user?.cart?.items?.length || 0,
        cartStructure: JSON.stringify(user?.cart, null, 2)
    });
    
    if (!user) {
        throw new NotFoundError("User not found");
    }

    // Безопасная инициализация корзины
    const cart = user.cart || { items: [] };
    
    // Проверяем, что items существует и является массивом
    if (!Array.isArray(cart.items)) {
        console.warn('[Cart Route] cart.items is not an array:', cart.items);
        cart.items = [];
    }
    
    console.log('[Cart Route] Processing cart items:', {
        itemsCount: cart.items.length,
        items: cart.items.map(item => ({
            _id: item._id,
            productId: item.product?._id || item.product,
            quantity: item.quantity,
            hasProduct: !!item.product,
            productType: typeof item.product
        }))
    });
    
    // Безопасный расчет общей суммы
    let cartTotal = 0;
    try {
        cartTotal = cart.items.reduce((total, item) => {
            // Проверяем, что item и item.product существуют
            if (!item || !item.product) {
                console.warn('[Cart Route] Invalid cart item:', item);
                return total;
            }
            
            // Проверяем, что product имеет marketPrice
            const price = (typeof item.product === 'object' && item.product.marketPrice && typeof item.product.marketPrice === 'number') 
                ? item.product.marketPrice 
                : 0;
            
            const quantity = item.quantity || 1;
            const itemTotal = price * quantity;
            
            console.log('[Cart Route] Item calculation:', {
                itemId: item._id,
                price,
                quantity,
                itemTotal
            });
            
            return total + itemTotal;
        }, 0);
    } catch (error) {
        console.error('[Cart Route] Error calculating cart total:', error);
        cartTotal = 0;
    }
    
    console.log('[Cart Route] Cart total calculated:', cartTotal);
    
    // Кэшируем данные пользователя
    const userData = {
        cart: {
            items: cart.items,
            total: cartTotal
        }
    };
    await cacheService.cacheUserData(req.user.userId, userData);
    
    res.json({
        items: cart.items,
        total: cartTotal.toFixed(2),
        cached: false
    });
}));

router.post('/add', auth, validate({ body: AddToCartSchema }), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    console.log('[Cart Route] POST /add - Starting request:', {
        userId: req.user.userId,
        body: req.body,
        headers: req.headers
    });
    
    const { productId, quantity } = req.body;
    console.log('[Cart Route] Request data:', { productId, quantity });

    const product = await Product.findById(productId).lean();
    console.log('[Cart Route] Product found:', {
        productId,
        productExists: !!product,
        hasMarketPrice: product?.marketPrice,
        marketPrice: product?.marketPrice
    });
    
    if (!product) {
        throw new NotFoundError("Product not found");
    }

    if ((product as IProduct).onDeal === true || (product as IProduct).sold === true) {
        throw new ValidationError('This product is no longer available (already in a deal or sold).');
    }

    if (typeof product.marketPrice !== 'number' || product.marketPrice <= 0) {
        console.warn('[Cart Route] Product has invalid market price:', product.marketPrice);
        throw new ValidationError('Product cannot be added to cart without a valid market price.');
    }

    const user = await User.findById(req.user.userId);
    console.log('[Cart Route] User found:', {
        userId: user?._id,
        hasCart: !!user?.cart,
        cartItemsCount: user?.cart?.items?.length || 0
    });
    
    if (!user) {
        throw new NotFoundError("User not found");
    }
    
    if (!user.cart) {
        console.log('[Cart Route] Creating new cart for user');
        user.cart = { items: [], updatedAt: new Date() };
    }
    
    const existingItemIndex = user.cart.items.findIndex(item => item.product.toString() === productId);
    console.log('[Cart Route] Existing item check:', {
        existingItemIndex,
        existingItem: existingItemIndex > -1 ? user.cart.items[existingItemIndex] : null
    });

    if (existingItemIndex > -1) {
        console.log('[Cart Route] Updating existing item quantity');
        user.cart.items[existingItemIndex].quantity += quantity;
    } else {
        console.log('[Cart Route] Adding new item to cart');
        const newItem = { 
            product: product._id,
            quantity,
            price: product.price || 0,
            companyId: product.company,
            addedAt: new Date()
        };
        // ICartItem has complex union types, use unknown assertion for safety
        user.cart.items.push(newItem as unknown as typeof user.cart.items[0]);
    }
    
    user.cart.updatedAt = new Date();
    await user.save();
    console.log('[Cart Route] Cart saved successfully');

    // Инвалидируем кэш пользователя
    await cacheService.invalidatePattern(`user:${req.user.userId}*`);

    res.status(200).json({
      success: true,
        message: 'Product added to cart successfully.'
    });
}));

router.delete('/remove/:itemId', auth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { itemId } = req.params;
    const user = await User.findById(req.user.userId);
    if (!user || !user.cart) {
        throw new NotFoundError("User or user cart not found");
    }
    const initialLength = user.cart.items.length;
    user.cart.items = user.cart.items.filter(item => item._id && item._id!.toString() !== itemId);
    if (user.cart.items.length === initialLength) {
        throw new NotFoundError("Item not found in cart");
    }
    user.cart.updatedAt = new Date();
    await user.save();
    // Вернуть обновлённый список и сумму
    const items = await Promise.all(user.cart.items
      .filter(item => !!item._id)
      .map(async (item) => {
        const product = await Product.findById(item.product).lean();
        return { _id: item._id!.toString(), product };
      })
    );
    const totalAmount = items.reduce((sum, item) => {
        const product = item.product;
        const price = product && typeof product === 'object' && 'marketPrice' in product 
            ? (product.marketPrice as number) 
            : 0;
        return sum + price;
    }, 0);
    res.status(200).json({
        success: true,
        message: 'Product removed from cart successfully.',
        items,
        totalAmount
    });
}));

router.put('/update', auth, validate({ body: UpdateCartQuantitySchema }), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { productId, newQuantity } = req.body;

    if (newQuantity <= 0) {
        throw new ValidationError("Quantity must be a positive number. To remove an item, use the remove endpoint.");
    }
    
    const user = await User.findById(req.user.userId);
    if (!user || !user.cart) {
        throw new NotFoundError("User or user cart not found");
    }

    const cartItem = user.cart.items.find(item => item.product.toString() === productId);

    if (!cartItem) {
        throw new NotFoundError("Item not found in cart");
    }

    cartItem.quantity = newQuantity;
    user.cart.updatedAt = new Date();
    await user.save();

    res.status(200).json({
        success: true,
        message: 'Cart updated successfully.'
    });
}));

router.delete('/clear', auth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = await User.findById(req.user.userId);
    if (!user) {
        throw new NotFoundError("User not found");
    }
    
    if (!user.cart) {
        user.cart = { items: [], updatedAt: new Date() };
    }
    
    user.cart.items = [];
    user.cart.updatedAt = new Date();
    await user.save();
    
    res.status(200).json({
      success: true,
        message: 'Cart cleared successfully.'
    });
}));

export default router; 