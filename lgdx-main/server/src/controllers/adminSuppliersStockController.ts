import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Company from '../models/Company';
import CompanyApiConfig from '../models/CompanyApiConfig';
import Product from '../models/Product';
import { logger } from '../utils/logger';
import { asyncHandler } from '../types/express-helpers';

export interface SupplierStockRow {
  companyId: string;
  companyName: string;
  lastStockSyncAt: string | null;
  syncType: 'API' | 'FTP' | 'LegacyFTP' | 'File' | '—';
  productCount: number;
  productCountProtected: number;
  productCountDeletable: number;
}

/**
 * GET /admin/suppliers-stock
 * List suppliers with last stock sync date, sync type (API/FTP/File), and product counts.
 * Sortable on the client by lastStockSyncAt.
 */
export const getSuppliersStockList = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const companyIdsWithProducts = await Product.distinct('company');
  if (companyIdsWithProducts.length === 0) {
    res.json([]);
    return;
  }

  const companies = await Company.find({ _id: { $in: companyIdsWithProducts } })
    .select('_id name lastSync ftpConfig.enabled ftpConfig.lastConnectionAt legacyFtpConfig.enabled apiConfig')
    .lean();

  const apiConfigs = await CompanyApiConfig.find({ company: { $in: companyIdsWithProducts } })
    .select('company lastSync isActive')
    .lean();

  const apiByCompany = new Map<string, { lastSync: Date | null; isActive: boolean }>();
  apiConfigs.forEach((c: { company?: mongoose.Types.ObjectId; lastSync?: Date | null; isActive?: boolean }) => {
    const id = c.company?.toString();
    if (id) apiByCompany.set(id, { lastSync: c.lastSync ?? null, isActive: c.isActive ?? false });
  });

  // One aggregation instead of 2*N countDocuments — avoids long request and keeps event loop free
  const countsByCompany = await Product.aggregate<{ _id: mongoose.Types.ObjectId; total: number; protected: number }>([
    { $match: { company: { $in: companyIdsWithProducts } } },
    {
      $group: {
        _id: '$company',
        total: { $sum: 1 },
        protected: { $sum: { $cond: [{ $or: [{ $eq: ['$onDeal', true] }, { $eq: ['$sold', true] }] }, 1, 0] } }
      }
    }
  ]);
  const countMap = new Map<string, { productCount: number; productCountProtected: number }>();
  countsByCompany.forEach((row) => {
    const id = row._id.toString();
    countMap.set(id, {
      productCount: row.total,
      productCountProtected: row.protected
    });
  });

  const rows: SupplierStockRow[] = companies.map((company) => {
    const companyId = company._id.toString();
    const api = apiByCompany.get(companyId);
    const lastSyncApi = api?.lastSync ?? null;
    const lastSyncFile = (company as { lastSync?: Date }).lastSync ?? null;
    const ftpEnabled = (company as { ftpConfig?: { enabled?: boolean; lastConnectionAt?: Date } }).ftpConfig?.enabled ?? false;
    const ftpLastConnectionAt = (company as { ftpConfig?: { lastConnectionAt?: Date } }).ftpConfig?.lastConnectionAt ?? null;
    const legacyFtpEnabled = (company as { legacyFtpConfig?: { enabled?: boolean } }).legacyFtpConfig?.enabled ?? false;
    // Use file/API sync first; for FTP when no lastSync yet, fallback to last FTP connection time
    const lastStockSyncAt = lastSyncApi || lastSyncFile || (ftpEnabled ? ftpLastConnectionAt : null);
    const hasApi = api != null;

    let syncType: SupplierStockRow['syncType'] = '—';
    if (hasApi && api?.isActive) syncType = 'API';
    else if (ftpEnabled) syncType = 'FTP';
    else if (legacyFtpEnabled) syncType = 'LegacyFTP';
    else if (lastSyncFile) syncType = 'File';

    const counts = countMap.get(companyId) ?? { productCount: 0, productCountProtected: 0 };
    const productCount = counts.productCount;
    const productCountProtected = counts.productCountProtected;
    const productCountDeletable = Math.max(0, productCount - productCountProtected);

    return {
      companyId,
      companyName: (company as { name?: string }).name ?? '',
      lastStockSyncAt: lastStockSyncAt ? new Date(lastStockSyncAt).toISOString() : null,
      syncType,
      productCount,
      productCountProtected,
      productCountDeletable
    };
  });

  res.json(rows);
});

/**
 * POST /admin/suppliers-stock/:companyId/delete-stock
 * Delete all products of the supplier that are NOT on deal and NOT sold.
 * Does not touch products in active deals or sold.
 */
export const deleteSupplierStock = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const companyId = req.params.companyId;
  if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
    res.status(400).json({ message: 'Invalid company ID' });
    return;
  }

  const result = await Product.deleteMany({
    company: new mongoose.Types.ObjectId(companyId),
    onDeal: { $ne: true },
    sold: { $ne: true }
  });

  logger.info('[AdminSuppliersStock] Stock deleted', {
    companyId,
    deletedCount: result.deletedCount,
    performedBy: (req as Request & { user?: { userId?: string } }).user?.userId
  });

  res.json({
    success: true,
    deletedCount: result.deletedCount,
    message: `Deleted ${result.deletedCount} product(s). Products in deals and sold were kept.`
  });
});
