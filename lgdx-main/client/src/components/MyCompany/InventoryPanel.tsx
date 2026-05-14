import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import { isAxiosError } from 'axios';
import { translateShape } from '../../utils/shapeTranslations';
import styles from './InventoryPanel.module.css';
import { Product } from '../../types';
import InventoryDiamondCard from '../DiamondCard/InventoryDiamondCard';
import Button from '../common/Button/Button';
import Input from '../common/Input/Input';
import Badge from '../common/Badge/Badge';
import Modal from '../common/Modal/Modal';
import Select from '../common/Select/Select';
import { FaUpload } from 'react-icons/fa';
import api from '../../api';
import {
  getInventorySyncStatus,
  deleteMyInventoryStock,
  requestInventoryFtpSync,
  requestInventoryApiSync,
  type InventorySyncStatus,
} from '../../api/inventoryApi';

interface NotificationState {
  isOpen: boolean;
  title: string;
  message: string;
}

interface InventoryFilters {
  status: string;
  searchQuery: string;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface ProductsResponse {
  products: Product[];
  pagination: PaginationData;
}

const InventoryPanel: React.FC = () => {
  const { t, formatCurrency } = useTranslation();
  const [inventory, setInventory] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 15,
    total: 0,
    pages: 1,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [filters, setFilters] = useState<InventoryFilters>({
    status: 'All',
    searchQuery: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadMode, setUploadMode] = useState<'replace' | 'add'>('replace');
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  const [syncMeta, setSyncMeta] = useState<InventorySyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [confirmDeleteStock, setConfirmDeleteStock] = useState(false);
  const [deletingStock, setDeletingStock] = useState(false);
  const [ftpRequesting, setFtpRequesting] = useState(false);
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [apiFiles, setApiFiles] = useState<File[]>([]);
  const [apiSubmitting, setApiSubmitting] = useState(false);

  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    title: '',
    message: '',
  });

  const fetchSyncMeta = useCallback(async () => {
    try {
      setSyncLoading(true);
      setSyncError(null);
      const data = await getInventorySyncStatus();
      setSyncMeta(data);
    } catch {
      setSyncError(t('company.inventorySyncLoadError'));
      setSyncMeta(null);
    } finally {
      setSyncLoading(false);
    }
  }, [t]);

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get<ProductsResponse>('/inventory', {
        params: {
          status: filters.status === 'All' ? undefined : filters.status,
          search: filters.searchQuery || undefined,
          page: pagination.page,
          limit: pagination.limit,
        },
      });
      setInventory(response.data.products);
      setPagination(response.data.pagination);
    } catch (err: unknown) {
      setError(isAxiosError(err) ? (err.response?.data?.message || t('company.failedToFetchInventory')) : t('company.failedToFetchInventory'));
      setInventory([]);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit, t]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    fetchSyncMeta();
  }, [fetchSyncMeta]);

  const formatSyncDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  };

  const syncTypeLabel = (st: InventorySyncStatus['syncType']) => {
    if (st === '—') return t('admin.suppliersStockSyncTypeNone');
    const key = `admin.suppliersStockSyncType${st}` as
      | 'admin.suppliersStockSyncTypeAPI'
      | 'admin.suppliersStockSyncTypeFTP'
      | 'admin.suppliersStockSyncTypeLegacyFTP'
      | 'admin.suppliersStockSyncTypeFile';
    return t(key);
  };

  const handleConfirmDeleteStock = async (): Promise<void> => {
    setDeletingStock(true);
    try {
      const res = await deleteMyInventoryStock();
      setConfirmDeleteStock(false);
      setNotification({
        isOpen: true,
        title: t('common.success'),
        message: t('company.deleteMyStockSuccess', { count: res.deletedCount }),
      });
      await fetchInventory();
      await fetchSyncMeta();
    } catch {
      setNotification({
        isOpen: true,
        title: t('common.error'),
        message: t('company.deleteMyStockError'),
      });
    } finally {
      setDeletingStock(false);
    }
  };

  const handleRequestFtp = async (): Promise<void> => {
    setFtpRequesting(true);
    try {
      await requestInventoryFtpSync();
      setNotification({
        isOpen: true,
        title: t('common.success'),
        message: t('company.requestFtpSyncSuccess'),
      });
    } catch {
      setNotification({
        isOpen: true,
        title: t('common.error'),
        message: t('company.requestFtpSyncError'),
      });
    } finally {
      setFtpRequesting(false);
    }
  };

  const handleApiFilesChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const list = e.target.files;
    setApiFiles(list ? Array.from(list) : []);
  };

  const closeApiModal = (): void => {
    if (apiSubmitting) return;
    setApiModalOpen(false);
    setApiFiles([]);
  };

  const handleSubmitApiSync = async (): Promise<void> => {
    setApiSubmitting(true);
    try {
      await requestInventoryApiSync(apiFiles);
      setApiModalOpen(false);
      setApiFiles([]);
      setNotification({
        isOpen: true,
        title: t('common.success'),
        message: t('company.requestApiSyncSuccess'),
      });
    } catch {
      setNotification({
        isOpen: true,
        title: t('common.error'),
        message: t('company.requestApiSyncError'),
      });
    } finally {
      setApiSubmitting(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
    const { name, value } = e.target;
    setPagination(p => ({ ...p, page: 1 }));
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setSelectedFileName(event.target.files[0].name);
    } else {
      setSelectedFile(null);
      setSelectedFileName('');
    }
  };

  const handleUploadStock = async (): Promise<void> => {
    if (!selectedFile) {
      setNotification({ isOpen: true, title: t('common.error'), message: t('company.pleaseSelectFile') });
      return;
    }
    setIsUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('mode', uploadMode);

    try {
      const response = await api.post<{ message: string }>('/inventory/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setNotification({
        isOpen: true,
        title: t('common.success'),
        message: response.data.message || t('company.uploadInitiated'),
      });
      setSelectedFile(null);
      setSelectedFileName('');
      // Refresh inventory after upload
      await fetchInventory();
      await fetchSyncMeta();
    } catch (err: unknown) {
      setError(isAxiosError(err) ? (err.response?.data?.message || t('company.failedToUploadInventory')) : t('company.failedToUploadInventory'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleProductClick = (product: Product): void => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const closeModal = (): void => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  const getStatusBadgeVariant = (status: string | undefined) => {
    switch (status) {
      case 'Available': return 'success';
      case 'OnDeal': return 'warning';
      case 'Sold': return 'danger';
      default: return 'neutral';
    }
  };


  return (
    <div className={styles.inventoryPanel}>
      <div className={styles.topActionsContainer}>
        <div className={styles.syncMetaCard}>
        <h3 className={styles.syncMetaTitle}>{t('company.inventorySyncSectionTitle')}</h3>
        {syncLoading && <p className={styles.syncMetaMuted}>{t('company.loadingInventory')}</p>}
        {syncError && !syncLoading && <p className={styles.uploadError}>{syncError}</p>}
        {!syncLoading && !syncError && syncMeta && (
          <>
            <div className={styles.syncMetaGrid}>
              <div>
                <div className={styles.syncLabel}>{t('company.inventoryLastSync')}</div>
                <div className={styles.syncValue}>{formatSyncDate(syncMeta.lastStockSyncAt)}</div>
              </div>
              <div>
                <div className={styles.syncLabel}>{t('company.inventorySyncType')}</div>
                <div>
                  <span className={styles.syncBadge}>{syncTypeLabel(syncMeta.syncType)}</span>
                </div>
              </div>
              <div>
                <div className={styles.syncLabel}>{t('company.inventoryProducts')}</div>
                <div
                  className={styles.syncValue}
                  title={t('admin.suppliersStockProductsTooltip')}
                >
                  {t('company.inventoryProductsHint', {
                    total: syncMeta.productCount,
                    protected: syncMeta.productCountProtected,
                    deletable: syncMeta.productCountDeletable,
                  })}
                </div>
              </div>
            </div>
            <div className={styles.syncActions}>
              <Button
                type="button"
                variant="danger"
                onClick={() => setConfirmDeleteStock(true)}
                disabled={deletingStock || syncMeta.productCountDeletable === 0}
                title={
                  syncMeta.productCountDeletable === 0
                    ? t('admin.suppliersStockProductsTooltip')
                    : undefined
                }
              >
                {t('company.deleteMyStock')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleRequestFtp}
                loading={ftpRequesting}
                disabled={ftpRequesting}
              >
                {t('company.requestFtpSync')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setApiModalOpen(true)}
              >
                {t('company.requestApiSync')}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className={styles.uploadSectionModern}>
        <div className={styles.uploadHeader}>
          <h3 className={styles.uploadTitle}>{t('company.uploadInventory')}</h3>
          <p className={styles.uploadSubtitle}>
            {t('company.uploadInventorySubtitle')}
          </p>
        </div>
        <form className={styles.uploadForm} onSubmit={e => { e.preventDefault(); handleUploadStock(); }}>
          <label className={styles.fileInputLabel} htmlFor="inventory-file-upload">
            <FaUpload className={styles.uploadIcon} />
            {t('company.browseFile')}
            <input
              type="file"
              id="inventory-file-upload"
              className={styles.fileInput}
              onChange={handleFileChange}
              accept=".xlsx, .xls, .csv"
              disabled={isUploading}
            />
          </label>
          {selectedFileName && (
            <span className={styles.selectedFileName}>{selectedFileName}</span>
          )}
          <Select
            id="upload-mode-select"
            options={[
              { value: 'replace', label: t('company.replaceAll') },
              { value: 'add', label: t('company.updateAddOnly') }
            ]}
            value={uploadMode}
            onChange={e => setUploadMode(e.target.value as 'replace' | 'add')}
            disabled={isUploading}
            className={styles.uploadModeSelectModern}
          />
          <Button
            type="submit"
            onClick={handleUploadStock}
            disabled={isUploading || !selectedFile}
            loading={isUploading}
            className={styles.uploadButtonModern}
          >
            {isUploading ? t('company.uploading') : t('company.uploadStock')}
          </Button>
        </form>
        {error && <div className={styles.uploadError}>{error}</div>}
      </div>
      </div>
      
      <div className={styles.inventoryControls}>
        <Input
          name="searchQuery"
          placeholder={t('company.searchByCertificate')}
          value={filters.searchQuery}
          onChange={handleFilterChange}
          className={styles.searchInput}
        />
        <Select
          name="status"
          options={[
              { value: 'All', label: t('company.allStatuses') },
              { value: 'Available', label: t('company.available') },
              { value: 'OnDeal', label: t('company.onDeal') },
              { value: 'Sold', label: t('company.sold') }
          ]}
          value={filters.status}
          onChange={handleFilterChange}
        />
      </div>

      {loading && <p>{t('company.loadingInventory')}</p>}
      {error && <p className={styles.errorMessage}>{error}</p>}
      
      {!loading && !error && (
        <>
          {inventory.length > 0 ? (
            <div className={styles.inventoryTableContainer}>
              <table className={styles.inventoryTable}>
                <thead>
                  <tr>
                    <th>{t('company.certificateNumber')}</th>
                    <th>{t('company.lab')}</th>
                    <th>{t('company.shape')}</th>
                    <th>{t('company.carat')}</th>
                    <th>{t('company.color')}</th>
                    <th>{t('company.clarity')}</th>
                    <th>{t('dealDetail.price')}</th>
                    <th>{t('company.status')}</th>
                    <th>{t('company.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(product => (
                    <tr
                      key={product._id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${product.certificateNumber} ${translateShape(product.shape, t)} ${product.carat}ct`}
                      className={styles.clickableRow}
                      onClick={() => handleProductClick(product)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleProductClick(product);
                        }
                      }}
                    >
                      <td>{product.certificateNumber}</td>
                      <td>{product.certificateInstitute}</td>
                      <td>{translateShape(product.shape, t)}</td>
                      <td>{product.carat}</td>
                      <td>{product.color}</td>
                      <td>{product.clarity}</td>
                      <td>{formatCurrency(product.price ?? 0)}</td>
                      <td>
                        <Badge variant={getStatusBadgeVariant(product.status)}>
                          {product.status === 'available' ? t('company.available') :
                           product.status === 'OnDeal' ? t('company.onDeal') :
                           product.status === 'Sold' ? t('company.sold') :
                           product.status || t('company.available')}
                        </Badge>
                      </td>
                      <td>
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); handleProductClick(product); }}>{t('common.view')}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>{t('company.noProductsFound')}</p>
            </div>
          )}

          {pagination && pagination.pages > 1 && (
            <div className={styles.paginationControls}>
                <Button 
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    variant="secondary"
                >
                    {t('common.previous')}
                </Button>
                <span>
                    {t('company.pageOf', { page: pagination.page, total: pagination.pages })}
                </span>
                <Button 
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                    variant="secondary"
                >
                    {t('common.next')}
                </Button>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        title={notification.title}
        footer={<Button onClick={() => setNotification({ ...notification, isOpen: false })}>{t('common.close')}</Button>}
      >
        <p>{notification.message}</p>
      </Modal>

      {selectedProduct && (
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={t('company.productDetails', { certificateNumber: selectedProduct.certificateNumber || '' })}
          size="xl"
          className={styles.productDetailsModal}
        >
          <InventoryDiamondCard 
              product={selectedProduct} 
              onAddToCart={() => { /* View-only modal - no cart functionality */ }} // Placeholder, as this is a view-only modal
              isProductInCart={false} // Assuming not in cart in this context
              onGoToCart={() => { /* View-only modal - no cart functionality */ }} // Placeholder
          />
        </Modal>
      )}

      <Modal
        isOpen={confirmDeleteStock}
        onClose={() => !deletingStock && setConfirmDeleteStock(false)}
        title={t('company.deleteMyStockConfirmTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDeleteStock(false)} disabled={deletingStock}>
              {t('company.cancel')}
            </Button>
            <Button variant="danger" onClick={handleConfirmDeleteStock} loading={deletingStock}>
              {t('company.confirm')}
            </Button>
          </>
        }
      >
        <p>{t('company.deleteMyStockConfirmMessage')}</p>
      </Modal>

      <Modal
        isOpen={apiModalOpen}
        onClose={closeApiModal}
        title={t('company.requestApiSyncModalTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={closeApiModal} disabled={apiSubmitting}>
              {t('company.cancel')}
            </Button>
            <Button variant="primary" onClick={handleSubmitApiSync} loading={apiSubmitting}>
              {t('company.requestApiSyncSubmit')}
            </Button>
          </>
        }
      >
        <p className={styles.apiSyncHint}>{t('company.requestApiSyncHint')}</p>
        <label className={styles.apiSyncFileLabel}>
          <FaUpload className={styles.uploadIcon} />
          <span>{t('company.requestApiSyncChooseFiles')}</span>
          <input
            type="file"
            className={styles.fileInput}
            multiple
            onChange={handleApiFilesChange}
            disabled={apiSubmitting}
          />
        </label>
        {apiFiles.length > 0 && (
          <div className={styles.apiSyncFileListContainer}>
            <ul className={styles.apiSyncFileList}>
              {apiFiles.map((f, i) => (
                <li key={`${f.name}-${f.size}-${i}`}>{f.name}</li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default InventoryPanel; 