import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import { getSuppliersStockList, deleteSupplierStock, SupplierStockRow } from '../../api/suppliersStockApi';
import Button from '../common/Button/Button';
import Modal from '../common/Modal/Modal';
import styles from './SuppliersStockTable.module.css';

type SortKey = 'lastStockSyncAt' | 'companyName' | 'syncType' | 'productCount';
type SortDir = 'asc' | 'desc';

export default function SuppliersStockTable(): React.ReactElement {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SupplierStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('lastStockSyncAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ companyId: string; companyName: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSuppliersStockList();
      setRows(data);
    } catch (e) {
      setError(t('admin.suppliersStockLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let aVal: string | number | null = a[sortKey];
      let bVal: string | number | null = b[sortKey];
      if (sortKey === 'lastStockSyncAt') {
        aVal = a.lastStockSyncAt ? new Date(a.lastStockSyncAt).getTime() : 0;
        bVal = b.lastStockSyncAt ? new Date(b.lastStockSyncAt).getTime() : 0;
      }
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDir === 'asc' ? -1 : 1;
      if (bVal == null) return sortDir === 'asc' ? 1 : -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const c = aVal.localeCompare(bVal);
        return sortDir === 'asc' ? c : -c;
      }
      const c = (aVal as number) - (bVal as number);
      return sortDir === 'asc' ? c : -c;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'lastStockSyncAt' ? 'desc' : 'asc');
    }
  };

  const handleDeleteClick = (companyId: string, companyName: string) => {
    setConfirmDelete({ companyId, companyName });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.companyId);
    try {
      const res = await deleteSupplierStock(confirmDelete.companyId);
      setSuccessMessage(t('admin.suppliersStockDeleteSuccess', { count: res.deletedCount }));
      setTimeout(() => setSuccessMessage(null), 4000);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(t('admin.suppliersStockDeleteError'));
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <p>{t('admin.suppliersStockLoading')}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.title}>{t('admin.suppliersStockTitle')}</h3>
      <p className={styles.description}>{t('admin.suppliersStockDescription')}</p>

      {error && (
        <div className={styles.error}>
          {error}
          <button type="button" onClick={() => setError(null)} className={styles.dismiss}>×</button>
        </div>
      )}
      {successMessage && (
        <div className={styles.success}>
          {successMessage}
          <button type="button" onClick={() => setSuccessMessage(null)} className={styles.dismiss}>×</button>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <button type="button" className={styles.thButton} onClick={() => handleSort('companyName')}>
                  {t('admin.suppliersStockSupplier')}
                  {sortKey === 'companyName' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </button>
              </th>
              <th>
                <button type="button" className={styles.thButton} onClick={() => handleSort('lastStockSyncAt')}>
                  {t('admin.suppliersStockLastSync')}
                  {sortKey === 'lastStockSyncAt' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </button>
              </th>
              <th>
                <button type="button" className={styles.thButton} onClick={() => handleSort('syncType')}>
                  {t('admin.suppliersStockSyncType')}
                  {sortKey === 'syncType' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </button>
              </th>
              <th>
                <button type="button" className={styles.thButton} onClick={() => handleSort('productCount')}>
                  {t('admin.suppliersStockProducts')}
                  {sortKey === 'productCount' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </button>
              </th>
              <th>{t('admin.suppliersStockActions')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>{t('admin.suppliersStockEmpty')}</td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.companyId}>
                  <td className={styles.cellName}>{row.companyName}</td>
                  <td>{formatDate(row.lastStockSyncAt)}</td>
                  <td><span className={styles.syncBadge}>{row.syncType === '—' ? t('admin.suppliersStockSyncTypeNone') : t(`admin.suppliersStockSyncType${row.syncType}` as 'admin.suppliersStockSyncTypeAPI' | 'admin.suppliersStockSyncTypeFTP' | 'admin.suppliersStockSyncTypeLegacyFTP' | 'admin.suppliersStockSyncTypeFile')}</span></td>
                  <td>
                    <span title={t('admin.suppliersStockProductsTooltip')}>
                      {row.productCount} ({row.productCountProtected} {t('admin.suppliersStockProtected')}, {row.productCountDeletable} {t('admin.suppliersStockDeletable')})
                    </span>
                  </td>
                  <td>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={row.productCountDeletable === 0 || deletingId === row.companyId}
                      onClick={() => handleDeleteClick(row.companyId, row.companyName)}
                    >
                      {deletingId === row.companyId ? t('admin.suppliersStockDeleting') : t('admin.suppliersStockDeleteStock')}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('admin.suppliersStockConfirmDeleteTitle')}
        footer={
          <>
            <Button variant="neutral" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={handleConfirmDelete} disabled={!!deletingId}>
              {deletingId ? t('admin.suppliersStockDeleting') : t('admin.suppliersStockConfirmDeleteButton')}
            </Button>
          </>
        }
      >
        {confirmDelete && (
          <p>{t('admin.suppliersStockConfirmDeleteMessage', { name: confirmDelete.companyName })}</p>
        )}
      </Modal>
    </div>
  );
}
