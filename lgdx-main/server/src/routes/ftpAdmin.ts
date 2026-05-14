/**
 * Маршруты для управления FTP через админ-панель
 */

import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { validate } from '../middleware/validation';
import { z } from 'zod';
import * as ftpAdminController from '../controllers/ftpAdminController';

const router: Router = express.Router();

const ftpAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const CreateFtpAccessSchema = z.object({
  uploadQuotaMB: z.number().min(50).max(5000).optional(),
  maxConcurrentConnections: z.number().min(1).max(10).optional(),
  allowedIPs: z.array(z.string()).optional(),
  allowedFileTypes: z.array(z.enum(['xlsx', 'xls', 'csv', 'txt'])).optional(),
  maxFileSizeMB: z.number().min(1).max(200).optional(),
  autoProcessFiles: z.boolean().optional(),
  processMode: z.enum(['replace', 'add']).optional()
});

const UpdateFtpConfigSchema = z.object({
  uploadQuotaMB: z.number().min(50).max(5000).optional(),
  maxConcurrentConnections: z.number().min(1).max(10).optional(),
  allowedIPs: z.array(z.string()).optional(),
  allowedFileTypes: z.array(z.enum(['xlsx', 'xls', 'csv', 'txt'])).optional(),
  maxFileSizeMB: z.number().min(1).max(200).optional(),
  autoProcessFiles: z.boolean().optional(),
  processMode: z.enum(['replace', 'add']).optional(),
  isActive: z.boolean().optional()
});

const SetLegacyFtpSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  host: z.string().optional(),
  port: z.number().optional(),
  remoteDir: z.string().optional()
});

const CompanyIdParamsSchema = z.object({
  companyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid company ID format')
});

router.use(ftpAdminLimiter);
router.use(adminAuthMiddleware);

// List all companies with FTP status
router.get('/companies', ftpAdminController.getFtpCompanies);

// Create new FTP access (platform-hosted on FTP_PASV_URL, defaults to lgdeal.com)
router.post(
  '/companies/:companyId/create',
  validate({ params: CompanyIdParamsSchema, body: CreateFtpAccessSchema }),
  ftpAdminController.createFtpAccess
);

// Set legacy FTP access (lgdeal.com) with manual credentials
router.post(
  '/companies/:companyId/set-legacy',
  validate({ params: CompanyIdParamsSchema, body: SetLegacyFtpSchema }),
  ftpAdminController.setLegacyFtpAccess
);

// Trigger sync for a specific company
router.post(
  '/companies/:companyId/sync',
  validate({ params: CompanyIdParamsSchema }),
  ftpAdminController.syncCompany
);

// Trigger sync for ALL companies with any FTP configured
router.post('/sync-all', ftpAdminController.syncAllCompanies);

// Update FTP config
router.put(
  '/companies/:companyId/config',
  validate({ params: CompanyIdParamsSchema, body: UpdateFtpConfigSchema }),
  ftpAdminController.updateFtpConfig
);

// Reset password (new FTP only)
router.post(
  '/companies/:companyId/reset-password',
  validate({ params: CompanyIdParamsSchema }),
  ftpAdminController.resetFtpPassword
);

// Delete FTP access
router.delete(
  '/companies/:companyId',
  validate({ params: CompanyIdParamsSchema }),
  ftpAdminController.deleteFtpAccess
);

// Stats
router.get('/stats', ftpAdminController.getFtpStats);

export default router;
