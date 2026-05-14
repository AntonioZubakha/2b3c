import api from './index';

export interface SupplierStockRow {
  companyId: string;
  companyName: string;
  lastStockSyncAt: string | null;
  syncType: 'API' | 'FTP' | 'LegacyFTP' | 'File' | '—';
  productCount: number;
  productCountProtected: number;
  productCountDeletable: number;
}

export interface DeleteSupplierStockResponse {
  success: boolean;
  deletedCount: number;
  message: string;
}

export const getSuppliersStockList = () =>
  api.get<SupplierStockRow[]>('/admin/suppliers-stock').then(({ data }) => data);

export const deleteSupplierStock = (companyId: string) =>
  api.post<DeleteSupplierStockResponse>(`/admin/suppliers-stock/${companyId}/delete-stock`).then(({ data }) => data);
