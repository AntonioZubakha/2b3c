import { Request, Response } from 'express';
import { 
    ValidationError, 
    NotFoundError, 
    UnauthorizedError,
    asyncHandler 
} from '../../middleware/errorHandler';
import { dealInitiationService, InitiateDealRequest } from '../../services/dealInitiationService';
import { dealService } from '../../services/dealService';
import { ValidatedRequest } from '../../middleware/validation';
import { InitiateDealRequestSchema, InitiateDealResponse as ZodInitiateDealResponse } from '../../validation/schemas/dealSchemas';

// ---- Type-safe Request Interface ----

type InitiateDealValidatedRequest = ValidatedRequest<
    InitiateDealRequest, // Body type
    {}, // Params type
    {} // Query type
>;

// ---- Controllers using Zod Validation ----

export const initiateDealFromCart = asyncHandler(
    async (req: InitiateDealValidatedRequest, res: Response<ZodInitiateDealResponse>): Promise<void> => {
        // Validate authentication
        if (!req.user?.userId) {
            throw new UnauthorizedError('User not authenticated');
        }

        // Request body is already validated by Zod middleware
        const serviceRequest: InitiateDealRequest = {
            userId: req.user.userId,
            cartItemIds: req.body.cartItemIds,
            shippingAddress: req.body.shippingAddress
        };

        // Execute deal initiation through service
        const result = await dealInitiationService.initiateDealFromCart(serviceRequest);

        // Get full deal details using DealService for consistent response format
        const buyerDealDetails = await dealService.getDealFull(result.buyerDeal._id.toString());

        res.status(201).json({
            success: true,
            message: result.message,
            buyerDeal: buyerDealDetails,
            lgdealToSellerAlternativeDeals: result.lgdealToSellerAlternativeDeals.map(id => id.toString()),
            lgdealToSellerOriginalProductDeals: result.lgdealToSellerOriginalProductDeals.map(id => id.toString())
        });
    }
);

// ---- Helper Functions ----
// (Validation is now handled by Zod middleware)

// ПРИМЕЧАНИЕ: Этот рефакторенный контроллер с Zod валидацией демонстрирует:
// 1. ✅ Типизированный ValidatedRequest с точными типами для body/params/query
// 2. ✅ Удаление ручной валидации - теперь делается автоматически middleware
// 3. ✅ Полная типобезопасность на уровне TypeScript + runtime валидация
// 4. ✅ Понятные сообщения об ошибках валидации для клиента
// 5. ✅ Сокращение кода контроллера еще на ~25 строк
// 6. ✅ Интеграция с Zod schemas из validation/schemas/dealSchemas.ts