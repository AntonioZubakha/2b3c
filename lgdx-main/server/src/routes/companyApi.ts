/**
 * DEPRECATED FILE - DO NOT USE
 * 
 * This file contains duplicate routes that have been moved to admin.ts for consistency.
 * All company API routes are now accessible via /api/admin/company-api/*
 * 
 * This file is kept for reference only and should not be mounted in index.ts
 * Date deprecated: 2025-10-16
 */

import express, { Router } from 'express';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import {
    getApiConfig,
    updateApiConfig,
    triggerSync
} from '../controllers/companyApiController';
import { validate } from '../middleware/validation';
import { UpdateApiConfigSchema } from '../validation/schemas/companySchemas';
import { ObjectIdSchema } from '../validation/baseSchemas';
import { z } from 'zod';
import { asyncHandler } from '../types/express-helpers';

// Company API route parameter schema
const CompanyIdParamsSchema = z.object({
    companyId: ObjectIdSchema
});

const router: Router = express.Router();

// Get API configuration for a company
router.get('/:companyId', 
    adminAuthMiddleware,
    validate({ params: CompanyIdParamsSchema }),
    asyncHandler(getApiConfig)
);

// Get API configuration (path that matches frontend expectation)
router.get('/:companyId/config', 
    adminAuthMiddleware,
    validate({ params: CompanyIdParamsSchema }),
    asyncHandler(getApiConfig)
);

// Update API configuration
router.put('/:companyId', 
    adminAuthMiddleware,
    validate({ 
        params: CompanyIdParamsSchema,
        body: UpdateApiConfigSchema 
    }),
    asyncHandler(updateApiConfig)
);

// Update API configuration (path that matches frontend expectation)
router.put('/:companyId/config', 
    adminAuthMiddleware,
    validate({ 
        params: CompanyIdParamsSchema,
        body: UpdateApiConfigSchema 
    }),
    asyncHandler(updateApiConfig)
);

// Delete API configuration
// router.delete('/:companyId', adminAuthMiddleware, asyncHandler(deleteApiConfig)); // Temporarily commented out

// Trigger manual sync
router.post('/:companyId/sync', 
    adminAuthMiddleware,
    validate({ params: CompanyIdParamsSchema }),
    asyncHandler(triggerSync)
);

// Ручной сброс статуса синхронизации
// router.post('/:companyId/reset-sync', adminAuthMiddleware, asyncHandler(resetSyncStatus)); // Temporarily commented out

router.get('/config/:companyId', 
    validate({ params: CompanyIdParamsSchema }),
    asyncHandler(getApiConfig)
);
router.post('/config/:companyId', 
    validate({ 
        params: CompanyIdParamsSchema,
        body: UpdateApiConfigSchema 
    }),
    asyncHandler(updateApiConfig)
);
router.post('/sync/:companyId', 
    validate({ params: CompanyIdParamsSchema }),
    asyncHandler(triggerSync)
);
// router.get('/sync/queue/status', getSyncQueueStatus as any); // Temporarily commented out

export default router; 