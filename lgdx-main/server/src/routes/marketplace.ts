import { logger } from '../utils/logger';
logger.debug('[marketplace.ts] File loaded'); // Diagnostic log
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import * as marketplaceController from '../controllers/marketplaceController';
import { validate } from '../middleware/validation';
import { 
    ProductFilterSchema,
    FindAlternativesSchema,
    FindPerfectPairSchema 
} from '../validation/schemas/productSchemas';
import { ObjectIdSchema } from '../validation/baseSchemas';
import { DemoRequestSchema } from '../validation/schemas/demoRequestSchemas';
import * as demoRequestController from '../controllers/demoRequestController';
import { asyncHandler, asRateLimiter } from '../types/express-helpers';

const demoRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
});

// Create params schema for product ID
const ProductIdParamsSchema = z.object({
    productId: ObjectIdSchema
});

const router: Router = express.Router();

// Homepage stats (stones count rounded to 10k) - public, no auth
router.get('/home-stats', marketplaceController.getHomeStats);

// Demo request - public, rate limited
router.post('/demo-request',
  asRateLimiter(demoRequestLimiter),
  validate({ body: DemoRequestSchema }),
  asyncHandler(demoRequestController.submitDemoRequest)
);

// Get products with optional filtering - public access, but optional auth for personalized results
router.get('/', 
    optionalAuthMiddleware, 
    validate({ query: ProductFilterSchema }), 
    marketplaceController.getProducts
);

// Find a perfect pair for a given product - public access
router.get('/find-pair', 
    optionalAuthMiddleware, 
    validate({ query: FindPerfectPairSchema }), 
    marketplaceController.findPerfectPair
);

// Получение списка компаний-поставщиков
router.get('/suppliers', authMiddleware, marketplaceController.getSuppliers);

// Получение доступных форм бриллиантов - public access
router.get('/shapes', optionalAuthMiddleware, marketplaceController.getShapes);

// Получение доступных цветов бриллиантов - public access
router.get('/colors', optionalAuthMiddleware, marketplaceController.getColors);

// Получение доступных чистот бриллиантов - public access
router.get('/clarities', optionalAuthMiddleware, marketplaceController.getClarities);

// Получение доступных огранок бриллиантов - public access
router.get('/cuts', optionalAuthMiddleware, marketplaceController.getCuts);

// Получение статистики для фильтров (мин/макс значения) - public access
router.get('/filter-stats', optionalAuthMiddleware, marketplaceController.getFilterStats);

// Поиск бриллиантов с применением фильтров - public access
router.get('/search', 
    optionalAuthMiddleware, 
    validate({ query: ProductFilterSchema }), 
    marketplaceController.getProducts
);

// Получение деталей одного бриллианта
router.get('/product/:productId', 
    authMiddleware, 
    validate({ params: ProductIdParamsSchema }), 
    marketplaceController.getProductDetails
);

// Получение истории цен бриллианта
router.get('/product/:productId/price-history', 
    authMiddleware, 
    validate({ params: ProductIdParamsSchema }), 
    marketplaceController.getProductPriceHistory
);

// Получение похожих бриллиантов
router.get('/product/:productId/similar', 
    authMiddleware, 
    validate({ params: ProductIdParamsSchema }), 
    marketplaceController.getSimilarProducts
);

// @route   GET /api/marketplace/lgdeal
// @desc    Get LGDeal INC info (placeholder)
// @access  Public
router.get('/lgdeal', (req: express.Request, res: express.Response) => {
    res.json({
      name: 'LGDeal INC',
      description: 'LGDeal INC management company',
      status: 'active'
    });
});

export default router; 