import api from './index';

export interface InventorySyncStatus {
  lastStockSyncAt: string | null;
  syncType: 'API' | 'FTP' | 'LegacyFTP' | 'File' | '—';
  productCount: number;
  productCountProtected: number;
  productCountDeletable: number;
}

export const getInventorySyncStatus = () =>
  api.get<InventorySyncStatus>('/inventory/sync-status').then((r) => r.data);

export const deleteMyInventoryStock = () =>
  api.post<{ success: boolean; deletedCount: number; message: string }>('/inventory/delete-stock').then((r) => r.data);

export const requestInventoryFtpSync = () =>
  api.post<{ success: boolean; message: string }>('/inventory/request-ftp-sync').then((r) => r.data);

export const requestInventoryApiSync = (files: File[]) => {
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  return api
    .post<{ success: boolean; message: string }>('/inventory/request-api-sync', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};
