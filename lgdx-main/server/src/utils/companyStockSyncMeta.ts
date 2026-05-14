import mongoose from 'mongoose';
import Company from '../models/Company';
import CompanyApiConfig from '../models/CompanyApiConfig';
import Product from '../models/Product';

export type SupplierSyncType = 'API' | 'FTP' | 'LegacyFTP' | 'File' | '—';

export interface CompanyStockSyncMeta {
  lastStockSyncAt: string | null;
  syncType: SupplierSyncType;
  productCount: number;
  productCountProtected: number;
  productCountDeletable: number;
}

/**
 * Last stock sync time, sync channel, and product counts for one company (same rules as admin suppliers stock).
 */
export async function getCompanyStockSyncMeta(companyId: string): Promise<CompanyStockSyncMeta | null> {
  if (!mongoose.Types.ObjectId.isValid(companyId)) return null;

  const company = await Company.findById(companyId)
    .select('_id lastSync ftpConfig.enabled ftpConfig.lastConnectionAt legacyFtpConfig.enabled')
    .lean();
  if (!company) return null;

  const apiDoc = await CompanyApiConfig.findOne({ company: companyId }).select('lastSync isActive').lean();
  const api = apiDoc
    ? { lastSync: apiDoc.lastSync ?? null, isActive: apiDoc.isActive ?? false }
    : undefined;

  const countAgg = await Product.aggregate<{ total: number; protected: number }>([
    { $match: { company: new mongoose.Types.ObjectId(companyId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        protected: {
          $sum: {
            $cond: [{ $or: [{ $eq: ['$onDeal', true] }, { $eq: ['$sold', true] }] }, 1, 0]
          }
        }
      }
    }
  ]);
  const total = countAgg[0]?.total ?? 0;
  const protectedCount = countAgg[0]?.protected ?? 0;

  const lastSyncApi = api?.lastSync ?? null;
  const lastSyncFile = (company as { lastSync?: Date }).lastSync ?? null;
  const ftpEnabled =
    (company as { ftpConfig?: { enabled?: boolean; lastConnectionAt?: Date } }).ftpConfig?.enabled ?? false;
  const ftpLastConnectionAt =
    (company as { ftpConfig?: { lastConnectionAt?: Date } }).ftpConfig?.lastConnectionAt ?? null;
  const legacyFtpEnabled =
    (company as { legacyFtpConfig?: { enabled?: boolean } }).legacyFtpConfig?.enabled ?? false;
  const lastStockSyncAt = lastSyncApi || lastSyncFile || (ftpEnabled ? ftpLastConnectionAt : null);
  const hasApi = api != null;

  let syncType: SupplierSyncType = '—';
  if (hasApi && api?.isActive) syncType = 'API';
  else if (ftpEnabled) syncType = 'FTP';
  else if (legacyFtpEnabled) syncType = 'LegacyFTP';
  else if (lastSyncFile) syncType = 'File';

  return {
    lastStockSyncAt: lastStockSyncAt ? new Date(lastStockSyncAt).toISOString() : null,
    syncType,
    productCount: total,
    productCountProtected: protectedCount,
    productCountDeletable: Math.max(0, total - protectedCount)
  };
}
