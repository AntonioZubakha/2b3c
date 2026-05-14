import ExcelJS from 'exceljs';
import csvParser from 'csv-parser'; // Changed from 'csv' to 'csv-parser' for correct typing
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';
import User, { IUserDocument } from '../models/User'; // Added IUserDocument
import Company, { ICompanyDocument } from '../models/Company'; // Added ICompanyDocument for existing products
import Product, { IProductDocument } from '../models/Product'; // Added IProductDocument for existing products
// import { v4 as uuidv4 } from 'uuid'; // Will be handled by npm install @types/uuid
// import * as productUtils from '../utils/productUtils'; // Assuming productUtils.ts exists or will be created
import * as reportUtils from '../utils/reportUtils';
import * as telegramBot from '../utils/telegramBot';
import {
    IUser,
    ICompany,
    IProduct,
    // InventoryProcessingStats // Import from types -- Remove this
} from '../types';
import { toObjectIdString } from '../types/mongoose-helpers';
import {
    COLUMN_MAPPINGS,
    ProcessedProductData, // Import ProcessedProductData
    normalizeShape, // Import normalization functions
    normalizeClarity,
    normalizeColor,
    normalizeCut,
    normalizeGrade, // For polish, symmetry
    normalizeInstitute,
    parseMeasurements, // For measurements
    MeasurementResult,
    validateUrl,
    calculatePricePerCarat,
    DEFAULT_VALUES,
    validateProductStatus, // Import validateProductStatus
    validateDiamondShape, // Import new validation functions
    validateDiamondColor,
    validateDiamondClarity,
    RawProductData, // Import RawProductData
    processProduct, // Заменяем processSingleProduct на processProduct
    getFieldValue, // Заменяем getFieldValueFromRaw на getFieldValue
    ProductProcessingStats, // Import ProductProcessingStats
    findMatchingField // Import findMatchingField
} from '../utils/productUtils'; // Updated import
import mongoose from 'mongoose';
import { publishFileUploadTask } from '../services/messageBroker'; // <--- Новый импорт
import {
    ValidationError, 
    UnauthorizedError, 
    ForbiddenError, 
    NotFoundError,
    asyncHandler 
} from '../middleware/errorHandler';
import { getCompanyStockSyncMeta } from '../utils/companyStockSyncMeta';

// Configurable quotas
const MAX_INVENTORY_ROWS: number = Number.parseInt(process.env.MAX_INVENTORY_ROWS || '20000', 10);

// Interface for raw product data parsed from files
interface HeaderMap {
  [key: string]: string; // Maps column index (XLSX) or header name (CSV) to a product field name
}

/**
 * Parses an XLSX file and extracts product data.
 * @param filePath Path to the XLSX file.
 * @returns Array of raw product data objects.
 */
const parseXlsxFile = async (filePath: string): Promise<RawProductData[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const worksheet = workbook.getWorksheet(1); // Get first worksheet
  if (!worksheet) {
    throw new Error('No worksheet found in the Excel file.');
  }
  
  const data: any[][] = [];
  worksheet.eachRow((row, rowNumber) => {
    const rowData: any[] = [];
    row.eachCell((cell, colNumber) => {
      rowData[colNumber - 1] = cell.value; // ExcelJS uses 1-based indexing
    });
    data.push(rowData);
  });
  
  if (data.length < 2) {
    throw new Error('File doesn\'t contain enough rows. Need headers and at least one data row.');
  }
  
  const headers = data[0];
  const headerMap: HeaderMap = {};
  
  headers.forEach((header, index) => {
    if (!header) return;
    const fieldName = findMatchingField(String(header)); 
    if (fieldName) {
      headerMap[index.toString()] = fieldName; // Store index as string key
    }
  });
  
  const products: RawProductData[] = [];
  for (let i = 1; i < data.length; i++) {
    if (products.length >= MAX_INVENTORY_ROWS) {
      throw new ValidationError(`Row quota exceeded: limit is ${MAX_INVENTORY_ROWS} items`);
    }
    const row = data[i];
    const product: RawProductData = {};
    
    Object.entries(headerMap).forEach(([colIndex, fieldName]) => {
      const value = row[parseInt(colIndex, 10)]; // Parse colIndex back to number
      if (value !== undefined) {
        product[fieldName] = value;
      }
    });
    products.push(product);
  }
  
  return products;
};

/**
 * Parses a CSV file and extracts product data.
 * @param filePath Path to the CSV file.
 * @returns Promise resolving to an array of raw product data objects.
 */
const parseCsvFile = (filePath: string): Promise<RawProductData[]> => {
  return new Promise((resolve, reject) => {
    const results: RawProductData[] = [];
    const headerMap: HeaderMap = {};
    let headerProcessed = false;
    
    const stream = fs.createReadStream(filePath);
    
    stream
      .pipe(csvParser()) // Use csvParser()
      .on('headers', (headers: string[]) => {
        headers.forEach((header) => {
          const fieldName = findMatchingField(String(header)); 
          if (fieldName) {
            headerMap[String(header)] = fieldName;
          }
        });
        headerProcessed = true;
      })
      .on('data', (data: any) => {
        if (!headerProcessed) return;
        
        const product: RawProductData = {};
        
        Object.entries(data).forEach(([headerName, value]) => {
          const fieldName = headerMap[headerName];
          if (fieldName && value !== undefined && value !== null && String(value).trim() !== '') { // Added more robust check for empty/null values
            product[fieldName] = value;
          }
        });
        
        if (Object.keys(product).length > 0) { // Only add if product has some data
          if (results.length >= MAX_INVENTORY_ROWS) {
            stream.destroy(new ValidationError(`Row quota exceeded: limit is ${MAX_INVENTORY_ROWS} items`));
            return;
          }
          results.push(product);
        }
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error: Error) => {
        reject(error);
      });
  });
};

/**
 * Processes an inventory file in the background.
 * This involves parsing products, checking against blacklists, existing inventory,
 * and then creating or updating products in the database.
 * @param filePath Path to the inventory file (XLSX or CSV).
 * @param userId ID of the user who uploaded the file.
 * @param companyDoc Company document object for which the inventory is being processed.
 * @param companyName Name of the company.
 * @param originalFileName Original name of the uploaded file.
 * @param uploadMode Mode of upload ('replace' or 'add'). Defaults to 'replace'.
 */
async function _processInventoryFileInBackground(
  filePath: string, 
  userId: string, // Assuming userId is string, adjust if it's ObjectId from the start
  companyDoc: ICompanyDocument, // Changed from companyId: string to companyDoc: ICompanyDocument
  companyName: string, 
  originalFileName: string, 
  uploadMode: 'replace' | 'add' | undefined
): Promise<void> {
  const startTime = Date.now();
  let reportPath: string | null = null; // Declare reportPath here
  const companyId = companyDoc._id.toString(); // Extract companyId string for internal use

  const initialStats: ProductProcessingStats = { // Changed to ProductProcessingStats
    totalUploaded: 0,
    processed: 0,
    created: 0,
    updated: 0,
    deletedStale: 0,
    skippedByBlacklist: 0,
    skippedByDuplicateInSource: 0,
    skippedExistingOnDealOrSold: 0,
    skippedInvalidStatus: 0,
    skippedInvalidColor: 0,
    replacedOtherCompanyProduct: 0,
    skippedCheaperExistsOtherCompany: 0,
    skippedInvalidClarity: 0,
    skippedInvalidPrice: 0,
    skippedInvalidCarat: 0,
    skippedMissingMedia: 0,
    skippedMissingCertNumber: 0, // Added from ProductProcessingStats
    apiErrors: 0, // Added from ProductProcessingStats
    skippedByApiFilter: 0, // Added from ProductProcessingStats
    skippedNotLabGrown: 0, // Added to satisfy ProductProcessingStats
    skippedAnomalousPricePerCarat: 0,
    skippedInvalidData: 0, // Products with disallowed grades
    errors: []
  };
  // Job status is now handled by the microservice, just log the start
  logger.info(`[FileBGProcessing] Company: ${companyName} (${companyId}), File: ${originalFileName} - Starting background processing.`);
  let parsedProducts: RawProductData[] = [];
  const allProcessedProductsDetailed: reportUtils.ReportProductData[] = []; // Changed type to ReportProductData[]
  let processingError: any = null; // To store any caught error

  const stats: ProductProcessingStats = { // Changed to ProductProcessingStats
    totalUploaded: 0,
    processed: 0,
    created: 0,
    updated: 0,
    deletedStale: 0,
    skippedByBlacklist: 0,
    skippedByDuplicateInSource: 0,
    skippedExistingOnDealOrSold: 0,
    skippedInvalidStatus: 0,
    skippedInvalidColor: 0,
    replacedOtherCompanyProduct: 0,
    skippedCheaperExistsOtherCompany: 0,
    skippedInvalidClarity: 0,
    skippedInvalidPrice: 0,
    skippedInvalidCarat: 0,
    skippedMissingMedia: 0,
    skippedMissingCertNumber: 0, // Added from ProductProcessingStats
    apiErrors: 0, // Added from ProductProcessingStats
    skippedByApiFilter: 0, // Added from ProductProcessingStats
    skippedNotLabGrown: 0, // Added to satisfy ProductProcessingStats
    skippedAnomalousPricePerCarat: 0,
    skippedInvalidData: 0, // Products with disallowed grades
    errors: [] // Initialize errors array for the report
  };

  try {
    await telegramBot.sendSyncStartNotification(companyId, `${companyName} (File: ${originalFileName})`);
    logger.info(`[FileBGProcessing] Company: ${companyName}, File: ${originalFileName} - Parsing file...`);

    const fileExt = path.extname(originalFileName).toLowerCase();
    if (fileExt === '.xlsx' || fileExt === '.xls') {
      parsedProducts = await parseXlsxFile(filePath);
    } else if (fileExt === '.csv') {
      parsedProducts = await parseCsvFile(filePath);
    } else {
      throw new Error('Unsupported file format for background processing.');
    }
    stats.totalUploaded = parsedProducts.length;
    logger.info(`[FileBGProcessing] Company: ${companyName}, File: ${originalFileName} - Parsed. Found ${stats.totalUploaded} products. Starting data processing...`);
    await telegramBot.sendSyncProgressNotification(companyId, companyName, originalFileName, `File parsed. Found ${stats.totalUploaded} products. Starting data processing...`);

    // Products are processed through file-import-service microservice via RabbitMQ
    stats.processed = parsedProducts.length;
    stats.created = parsedProducts.length;
    
    logger.info(`[FileBGProcessing] Company: ${companyName}, File: ${originalFileName} - Product data processing finished.`);

    // 7. Update company sync status and product count
    const finalProductCount = await Product.countDocuments({ company: companyId });
    await Company.findByIdAndUpdate(companyId, {
        lastSync: new Date(),
        productCount: finalProductCount,
        lastSyncStatus: 'success',
        lastSyncFileName: originalFileName,
        lastSyncStats: stats, // Optionally store stats
    });
    logger.info(`[FileBGProcessing] Company: ${companyName} (${companyId}), File: ${originalFileName} - Sync marked as SUCCESSFUL.`);

    // 8. Generate report 
    const userForReport = await User.findById(userId).select('email _id').lean<{ email: string; _id: mongoose.Types.ObjectId }>();
    reportPath = await reportUtils.generateProductReportXlsx(
      { name: companyName, _id: new mongoose.Types.ObjectId(companyId) }, 
      userForReport ? { email: userForReport.email, _id: userForReport._id } : userId,
      stats, 
      allProcessedProductsDetailed, 
      stats.errors || []
    );

    (stats as ProductProcessingStats & { duration?: string }).duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // 9. Send success notification & update company/queue
    await telegramBot.sendSyncSuccessNotification(companyId, companyName, 'MANUAL', stats, reportPath ? { xlsx: reportPath, csv: reportPath } : null);
    
    // Job completion is now handled by the microservice

  } catch (error: unknown) {
    processingError = error;
    logger.error(`[FileBGProcessing] Error during inventory processing for ${companyName}, file ${originalFileName}:`, { error });
    if (stats.errors) { // Ensure errors array is initialized
        const errorObj = error && typeof error === 'object' 
          ? { message: getErrorMessage(error), stack: 'stack' in error ? String(error.stack) : undefined, rawProduct: ('rawProduct' in error ? error.rawProduct : 'N/A') as string }
          : { message: getErrorMessage(error), stack: undefined, rawProduct: 'N/A' };
        stats.errors.push(errorObj);
    }
    await telegramBot.sendSyncErrorNotification(companyId, companyName, originalFileName, getErrorMessage(error));
    // Job failure is now handled by the microservice
    
    // Update company sync status to reflect error
    await Company.findByIdAndUpdate(companyId, {
      lastSync: new Date(), // Still update time of last attempt
      lastSyncStatus: 'failed',
      lastSyncError: getErrorMessage(processingError),
      lastSyncFileName: originalFileName,
      lastSyncStats: stats, // Store stats even on failure
  }).catch((err: unknown) => logger.error('[FileBGProcessing] Failed to update company status after error:', { error: err }));
  logger.warn(`[FileBGProcessing] Company: ${companyName} (${companyId}), File: ${originalFileName} - Sync marked as FAILED.`);

    // Final queue update attempt, regardless of error, if not done already by specific paths
    // This ensures the queue job is closed out.
    const finalJobStatus = processingError ? 'failed' : 'completed';
    const jobDetails = {
       stats,
       error: processingError ? getErrorMessage(processingError) : undefined,
       reportPath: processingError ? undefined : reportPath || undefined 
    };
    const { errors: finalErrors, reportNotes: finalReportNotes, ...finalStatsForQueue } = jobDetails.stats || {};
    // Job finalization is now handled by the microservice

    // Clean up the uploaded file
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      logger.info(`[FileBGProcessing] Company: ${companyName}, File: ${originalFileName} - Temporary file ${filePath} deleted.`);
      }
    } catch (cleanupError) {
    logger.warn(`[FileBGProcessing] Error deleting temporary file ${filePath} for ${companyName}:`, { error: cleanupError });
    }
  }
}

// New function to handle initial inventory upload
const uploadInventory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    throw new ValidationError('No file uploaded');
  }

  // Define a more specific type for req.user based on expected structure from auth middleware
  interface AuthenticatedUserFromRequest {
    userId: string | mongoose.Types.ObjectId; // Property from auth middleware
    company: ICompanyDocument | string | mongoose.Types.ObjectId; // Company could be populated or just an ID
    // Add other properties from req.user if needed, e.g., role
  }

  const authUser = req.user as AuthenticatedUserFromRequest;
  if (!authUser || !authUser.userId) {
    throw new UnauthorizedError('User not authenticated or userId is missing');
  }

  const userIdString = authUser.userId.toString(); // This will be passed to _processInventoryFileInBackground

  let companyDocToUse: ICompanyDocument;
  let companyName: string;

  if (typeof authUser.company === 'string' || authUser.company instanceof mongoose.Types.ObjectId) {
    // If company is just an ID, fetch the full document
    const companyObjId = typeof authUser.company === 'string' ? new mongoose.Types.ObjectId(authUser.company) : authUser.company;
    const fetchedCompany = await Company.findById(companyObjId).lean();
    if (!fetchedCompany) {
      throw new NotFoundError('Company details not found for user');
    }
    companyDocToUse = fetchedCompany as ICompanyDocument; // Cast after ensuring it's fetched
    companyName = fetchedCompany.name;
  } else if (authUser.company && typeof authUser.company === 'object' && '_id' in authUser.company && 'name' in authUser.company) {
    // If company is a populated object (ICompanyDocument-like)
    companyDocToUse = authUser.company as ICompanyDocument;
    companyName = authUser.company.name;
  } else {
    throw new ValidationError('Company information is invalid or missing for user');
  }
  
  if (!companyName) {
    throw new ValidationError('Company name is missing');
  }

  const filePath = req.file.path;
  // Basic magic detection for CSV/XLSX to mitigate disguised uploads
  try {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(8);
    fs.readSync(fd, header, 0, 8, 0);
    fs.closeSync(fd);
    const isZip = header[0] === 0x50 && header[1] === 0x4b; // XLSX (zip-based)
    const seemsText = header.includes(0x2c) || header.includes(0x3b) || header.includes(0x09); // comma/semicolon/tab hints
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const allowed = (ext === '.xlsx' || ext === '.xls') ? isZip : (ext === '.csv' ? true : false);
    if (!allowed && !isZip && ext !== '.csv') {
      try { fs.unlinkSync(filePath); } catch {}
      throw new ValidationError('Invalid file signature for the selected extension.');
    }
  } catch (e: unknown) {
    if (!(e instanceof ValidationError)) {
      throw new ValidationError('Unable to validate file signature.');
    }
    throw e;
  }
  const originalFileName = req.file.originalname || 'unknown';
  const uploadMode = (req.body.mode as 'replace' | 'add' | undefined) || 'replace';

  // Validate upload mode
  if (!['replace', 'add'].includes(uploadMode)) {
    throw new ValidationError('Upload mode must be either "replace" or "add"');
  }

  // Validate file type
  const allowedExtensions = ['.xlsx', '.xls', '.csv'];
  const fileExtension = path.extname(originalFileName).toLowerCase();
  if (!allowedExtensions.includes(fileExtension)) {
    throw new ValidationError('File must be in Excel (.xlsx, .xls) or CSV (.csv) format');
  }

  await publishFileUploadTask({
    filePath,
    userId: userIdString,
    companyDoc: companyDocToUse,
    companyName,
    originalFileName,
    uploadMode
  });
  
  logger.info(`[uploadInventory] File upload task for ${originalFileName} (company: ${companyName}) published via message broker.`);
  
  res.status(202).json({ 
    message: `File uploaded successfully. Processing task for ${originalFileName} has been published.`,
    fileName: originalFileName,
    companyName: companyName
  });
});

// Function to get company inventory with pagination
const getInventory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { company: companyId } = req.user as { company?: string };
  if (!companyId) {
    throw new UnauthorizedError('User is not associated with a company.');
  }

  const { 
    page = 1, 
    limit = 15, 
    search, 
    status 
  } = req.query;

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  const query: mongoose.FilterQuery<IProductDocument> = { company: companyId };

  if (search) {
    query.certificateNumber = { $regex: search, $options: 'i' };
  }

  if (status && typeof status === 'string' && status !== 'All') {
    query.status = status;
  }

  const products = await Product.find(query)
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum)
    .sort({ createdAt: -1 });

  const total = await Product.countDocuments(query);

  res.status(200).json({
    products,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// Function to get a single product by ID
const getProduct = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const authUser = req.user as { userId: string; company: string | { _id?: mongoose.Types.ObjectId } };

  if (!authUser || !authUser.company) {
    throw new UnauthorizedError('User not authenticated or not associated with a company');
  }

  // Validate product ID format
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid product ID format');
  }

  const product = await Product.findById(id).lean<IProduct>();
  
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  // Verify the product belongs to the user's company
  const userCompanyId = typeof authUser.company === 'string' 
    ? authUser.company 
    : authUser.company._id?.toString();
  
  const productCompanyId = toObjectIdString(product.company);
  if (productCompanyId !== userCompanyId) {
    throw new ForbiddenError('Access denied. Product does not belong to your company');
  }

  res.status(200).json(product);
});

// Function to update a product
const updateProduct = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const updateData = req.body;
  const authUser = req.user as { userId: string; company: string | { _id?: mongoose.Types.ObjectId } };

  if (!authUser || !authUser.company) {
    throw new UnauthorizedError('User not authenticated or not associated with a company');
  }

  // Validate product ID format
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid product ID format');
  }

  // Validate update data
  if (!updateData || typeof updateData !== 'object') {
    throw new ValidationError('Update data is required and must be an object');
  }

  const product = await Product.findById(id);
  
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  // Verify the product belongs to the user's company
  const userCompanyId = typeof authUser.company === 'string' 
    ? authUser.company 
    : authUser.company._id?.toString();
  
  const productCompanyId = typeof product.company === 'object' && product.company && '_id' in product.company
    ? (product.company._id as mongoose.Types.ObjectId).toString()
    : product.company?.toString();
    
  if (productCompanyId !== userCompanyId) {
    throw new ForbiddenError('Access denied. Product does not belong to your company');
  }

  if (product.onDeal || product.sold) {
    throw new ForbiddenError('Cannot modify product: it is on a deal or already sold');
  }

  // Remove fields that shouldn't be updated directly
  const {
    _id,
    company,
    createdAt,
    updatedAt,
    ...allowedUpdates
  } = updateData;

  // Update the product
  const updatedProduct = await Product.findByIdAndUpdate(
    id,
    { $set: allowedUpdates },
    { new: true, runValidators: true }
  );

  res.status(200).json(updatedProduct);
});

function getUserCompanyId(req: Request): string | null {
  const u = req.user as { company?: string | mongoose.Types.ObjectId; companyId?: string } | undefined;
  if (!u) return null;
  if (typeof u.company === 'string') return u.company;
  if (u.company && typeof u.company === 'object' && 'toString' in u.company) return u.company.toString();
  if (u.companyId) return u.companyId;
  return null;
}

const getInventorySyncStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const companyId = getUserCompanyId(req);
  if (!companyId) {
    throw new UnauthorizedError('User is not associated with a company.');
  }
  const meta = await getCompanyStockSyncMeta(companyId);
  if (!meta) {
    throw new NotFoundError('Company not found');
  }
  res.status(200).json(meta);
});

const deleteMyStock = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const companyId = getUserCompanyId(req);
  if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
    throw new UnauthorizedError('User is not associated with a company.');
  }

  const result = await Product.deleteMany({
    company: new mongoose.Types.ObjectId(companyId),
    onDeal: { $ne: true },
    sold: { $ne: true }
  });

  logger.info('[Inventory] deleteMyStock', {
    companyId,
    deletedCount: result.deletedCount,
    userId: (req.user as { userId?: string })?.userId
  });

  res.status(200).json({
    success: true,
    deletedCount: result.deletedCount,
    message: `Deleted ${result.deletedCount} product(s). Products in deals and sold were kept.`
  });
});

const requestFtpSync = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const companyId = getUserCompanyId(req);
  if (!companyId) {
    throw new UnauthorizedError('User is not associated with a company.');
  }
  const userId = (req.user as { userId?: string })?.userId;
  const [company, user] = await Promise.all([
    Company.findById(companyId).select('name').lean<{ name?: string }>(),
    userId ? User.findById(userId).select('email').lean<{ email?: string }>() : null
  ]);
  if (!company) {
    throw new NotFoundError('Company not found');
  }
  await telegramBot.sendStockFtpSetupRequestNotification({
    companyName: company.name ?? '',
    companyId,
    requesterEmail: user?.email ?? 'unknown'
  });
  res.status(200).json({ success: true, message: 'Request sent' });
});

const requestApiSync = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const companyId = getUserCompanyId(req);
  if (!companyId) {
    throw new UnauthorizedError('User is not associated with a company.');
  }
  const userId = (req.user as { userId?: string })?.userId;
  const rawFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
  const files = rawFiles.map((f) => ({
    buffer: f.buffer,
    filename: f.originalname || 'file'
  }));

  const [company, user] = await Promise.all([
    Company.findById(companyId).select('name').lean<{ name?: string }>(),
    userId ? User.findById(userId).select('email').lean<{ email?: string }>() : null
  ]);
  if (!company) {
    throw new NotFoundError('Company not found');
  }
  await telegramBot.sendStockApiSetupRequestNotification({
    companyName: company.name ?? '',
    companyId,
    requesterEmail: user?.email ?? 'unknown',
    files
  });
  res.status(200).json({ success: true, message: 'Request sent' });
});

export {
    parseXlsxFile, 
    parseCsvFile,
    _processInventoryFileInBackground,
    uploadInventory,
    getInventory,
    getProduct,
    updateProduct,
    getInventorySyncStatus,
    deleteMyStock,
    requestFtpSync,
    requestApiSync
}; 