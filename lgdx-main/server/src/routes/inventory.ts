import express, { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as inventoryController from '../controllers/inventoryController';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth'; // Placeholder
import { validate } from '../middleware/validation';
import { asyncHandler, asRateLimiter } from '../types/express-helpers';
import { 
    ProductUploadSchema,
    ProductUpdateSchema,
    ProductFilterSchema
} from '../validation/schemas/productSchemas';
import { ObjectIdSchema } from '../validation/baseSchemas';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const router: Router = express.Router();

// Apply stricter rate limit for large file uploads
const inventoryUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
});

// Create params schema for product ID
const ProductIdParamsSchema = z.object({
    id: ObjectIdSchema
});

function ensureWritableDirectory(dirPath: string): boolean {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const probePath = path.join(
      dirPath,
      `.inventory-upload-probe-${process.pid}-${Date.now()}.tmp`,
    );
    fs.writeFileSync(probePath, 'ok');
    fs.unlinkSync(probePath);
    return true;
  } catch {
    return false;
  }
}

// Resolve writable directory for multipart temp files.
// Swarm here runs with read-only root filesystem, so temp dir must be inside uploads volume.
const uploadsRoot = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(process.cwd(), 'uploads');
const configuredTempUploadDir = process.env.INVENTORY_TEMP_UPLOAD_DIR
  ? path.resolve(process.env.INVENTORY_TEMP_UPLOAD_DIR)
  : null;
const uploadDirCandidates = [
  configuredTempUploadDir,
  uploadsRoot,
  path.join(uploadsRoot, 'inventory_temp'),
  path.join(uploadsRoot, 'inventory_tmp'),
  path.join(uploadsRoot, '.inventory_temp'),
].filter(Boolean) as string[];

const resolvedTempUploadDir =
  uploadDirCandidates.find((dirPath) => ensureWritableDirectory(dirPath)) || null;

if (!resolvedTempUploadDir) {
  logger.error('[InventoryUpload] No writable uploads temp directory found', {
    uploadDirCandidates,
  });
}

const tempUploadDir = resolvedTempUploadDir || uploadDirCandidates[0];

// Helper: parse size strings like "50MB" -> bytes
function parseSizeToBytes(value?: string): number | null {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = (m[2] || 'b').toLowerCase();
  const mult = unit === 'gb' ? 1024 ** 3 : unit === 'mb' ? 1024 ** 2 : unit === 'kb' ? 1024 : 1;
  return Math.max(0, Math.floor(num * mult));
}

// Configure multer for disk storage for inventory files
const inventoryStorage = multer.diskStorage({
  destination: function (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
    cb(null, tempUploadDir);
  },
  filename: function (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExt = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + fileExt);
  }
});

const maxFileSize = parseSizeToBytes(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024; // default 50MB
const upload = multer({ 
  storage: inventoryStorage,
  limits: {
    fileSize: maxFileSize,
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const okExt = /\.(xlsx|xls|csv)$/i.test(file.originalname || '');
    const mt = (file.mimetype || '').toLowerCase();
    const okMime = mt === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      || mt === 'application/vnd.ms-excel'
      || mt === 'text/csv'
      || mt === 'application/csv'
      || mt.startsWith('text/');
    if (okExt && okMime) return cb(null, true);
    cb(new Error('Only Excel (.xlsx/.xls) or CSV files are allowed.'));
  }
});

const apiSyncUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const name = (file.originalname || '').toLowerCase();
    if (/\.(pdf|doc|docx|xlsx|xls|csv|txt|json|yaml|yml|png|jpg|jpeg|webp)$/i.test(name)) {
      return cb(null, true);
    }
    cb(new Error('Unsupported file type for API configuration documents.'));
  }
});

const runApiSyncUpload = (req: Request, res: Response, next: NextFunction): void => {
  apiSyncUpload.array('files', 10)(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Invalid upload';
      res.status(400).json({ message: msg });
      return;
    }
    next();
  });
};

// @route   GET api/inventory/sync-status
// @desc    Last stock sync time and sync type for the user's company
// @access  Private
router.get('/sync-status', authMiddleware, asyncHandler(inventoryController.getInventorySyncStatus));

// @route   POST api/inventory/delete-stock
// @desc    Delete products not on deal and not sold
// @access  Private
router.post('/delete-stock', authMiddleware, asyncHandler(inventoryController.deleteMyStock));

// @route   POST api/inventory/request-ftp-sync
// @access  Private
router.post('/request-ftp-sync', authMiddleware, asyncHandler(inventoryController.requestFtpSync));

// @route   POST api/inventory/request-api-sync (multipart optional files)
// @access  Private
router.post(
  '/request-api-sync',
  authMiddleware,
  runApiSyncUpload,
  asyncHandler(inventoryController.requestApiSync)
);

// @route   POST api/inventory/upload
// @desc    Upload inventory file (xlsx or csv)
// @access  Private
router.post(
  '/upload',
  authMiddleware,
  asRateLimiter(inventoryUploadLimiter),
  upload.single('file'),
  asyncHandler(inventoryController.uploadInventory)
);

// @route   GET api/inventory
// @desc    Get company inventory
// @access  Private
router.get('/', 
    authMiddleware, 
    validate({ query: ProductFilterSchema }), 
    asyncHandler(inventoryController.getInventory)
);

// @route   PUT api/inventory/:id
// @desc    Update a product
// @access  Private
router.put('/:id', 
    authMiddleware, 
    validate({ 
        params: ProductIdParamsSchema, 
        body: ProductUpdateSchema 
    }), 
    asyncHandler(inventoryController.updateProduct)
);

// @route   GET api/inventory/:id
// @desc    Get a single product
// @access  Private
router.get('/:id', 
    authMiddleware, 
    validate({ params: ProductIdParamsSchema }), 
    asyncHandler(inventoryController.getProduct)
);

export default router; 