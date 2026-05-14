/**
 * FTP Management — admin panel component.
 * Supports both the platform-hosted FTP (lgdeal.com) and legacy external FTP credentials provided by suppliers.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Button from '../common/Button/Button';
import Modal from '../common/Modal/Modal';
import Input from '../common/Input/Input';
import LoadingSpinner from '../common/LoadingSpinner/LoadingSpinner';
import { useTranslation } from '../../i18n';
import api from '../../api';
import styles from './FtpManagement.module.css';

type FtpType = 'new' | 'legacy' | 'none';
type CreateMode = 'new' | 'legacy';
type ConfigPresenceFilter = 'all' | 'with' | 'without';

interface FtpCompany {
  _id: string;
  name: string;
  status: string;
  ftpType: FtpType;
  // New FTP
  ftpEnabled: boolean;
  ftpActive: boolean;
  ftpUsername: string | null;
  lastConnection: string | null;
  // Legacy FTP
  legacyEnabled: boolean;
  legacyUsername: string | null;
  legacyHost: string | null;
  legacyLastPolled: string | null;
  legacyErrors: number;
  legacyLastError: string | null;
}

interface NewFtpForm {
  uploadQuotaMB: number;
  maxConcurrentConnections: number;
  autoProcessFiles: boolean;
  processMode: 'replace' | 'add';
}

interface LegacyFtpForm {
  username: string;
  password: string;
  host: string;
  port: number;
  remoteDir: string;
}

const FtpManagement: React.FC = () => {
  const { t } = useTranslation();

  const [companies, setCompanies] = useState<FtpCompany[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal]       = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [confirmationModal, setConfirmationModal]   = useState<{
    isOpen: boolean; title: string; message: string; onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => { /* no-op */ } });

  const [selectedCompany, setSelectedCompany] = useState<FtpCompany | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode>('new');
  const [credentials, setCredentials] = useState<{
    server: string; port: number; username: string; password: string;
  } | null>(null);

  const [newForm, setNewForm] = useState<NewFtpForm>({
    uploadQuotaMB: 1000,
    maxConcurrentConnections: 2,
    autoProcessFiles: true,
    processMode: 'replace',
  });

  const [legacyForm, setLegacyForm] = useState<LegacyFtpForm>({
    username: '',
    password: '',
    host: '65.21.109.96',
    port: 21,
    remoteDir: '/files',
  });

  // Filter and pagination
  const [filterName, setFilterName] = useState('');
  const [configPresenceFilter, setConfigPresenceFilter] = useState<ConfigPresenceFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/ftp/companies');
      setCompanies(res.data?.companies || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.failedToLoadFtpData'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleCreateFtp = async () => {
    if (!selectedCompany) return;
    try {
      if (createMode === 'new') {
        const res = await api.post(`/admin/ftp/companies/${selectedCompany._id}/create`, newForm);
        setCredentials(res.data?.ftpCredentials);
        setShowCredentialsModal(true);
      } else {
        await api.post(`/admin/ftp/companies/${selectedCompany._id}/set-legacy`, legacyForm);
        showSuccess(`Legacy FTP configured for ${selectedCompany.name}`);
      }
      setShowCreateModal(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.failedToCreateFtpAccess'));
    }
  };

  const handleResetPassword = (companyId: string) => {
    setConfirmationModal({
      isOpen: true,
      title: t('admin.resetPassword'),
      message: t('admin.resetPasswordConfirm'),
      onConfirm: async () => {
        setConfirmationModal(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await api.post(`/admin/ftp/companies/${companyId}/reset-password`);
          setCredentials(res.data?.newCredentials);
          setShowCredentialsModal(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : t('admin.failedToResetFtpPassword'));
        }
      },
    });
  };

  const handleToggleActive = async (companyId: string, currentActive: boolean) => {
    try {
      await api.put(`/admin/ftp/companies/${companyId}/config`, { isActive: !currentActive });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.failedToUpdateFtpStatus'));
    }
  };

  const handleDelete = (companyId: string) => {
    setConfirmationModal({
      isOpen: true,
      title: t('admin.confirmDelete'),
      message: t('admin.deleteFtpConfirm'),
      onConfirm: async () => {
        setConfirmationModal(prev => ({ ...prev, isOpen: false }));
        try {
          await api.delete(`/admin/ftp/companies/${companyId}`);
          await fetchData();
        } catch (err) {
          setError(err instanceof Error ? err.message : t('admin.failedToDeleteFtpAccess'));
        }
      },
    });
  };

  const handleSync = async (company: FtpCompany) => {
    setSyncingId(company._id);
    try {
      await api.post(`/admin/ftp/companies/${company._id}/sync`);
      showSuccess(`Sync triggered for ${company.name}`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger sync');
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await api.post('/admin/ftp/sync-all');
      showSuccess(res.data?.message || 'Sync triggered for all companies');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger sync-all');
    } finally {
      setSyncingAll(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getTypeBadge = (company: FtpCompany) => {
    if (company.ftpType === 'new') {
      return (
        <span className={styles.badgeNew}>
          <span className="fas fa-server"></span> NEW
        </span>
      );
    }
    if (company.ftpType === 'legacy') {
      return (
        <span className={styles.badgeLegacy}>
          <span className="fas fa-history"></span> LEGACY
        </span>
      );
    }
    return <span className={styles.badgeNone}>—</span>;
  };

  const getStatusBadge = (company: FtpCompany) => {
    if (company.ftpType === 'none') {
      return <span className={styles.statusDisabled}>DISABLED</span>;
    }
    if (company.ftpType === 'legacy') {
      if (company.legacyErrors >= 5) return <span className={styles.statusError}>ERROR</span>;
      return <span className={styles.statusActive}>ACTIVE</span>;
    }
    if (company.ftpActive) return <span className={styles.statusActive}>ACTIVE</span>;
    return <span className={styles.statusInactive}>INACTIVE</span>;
  };

  const openCreateModal = (company: FtpCompany) => {
    setSelectedCompany(company);
    // Pre-fill legacy form username hint if available
    setLegacyForm({ username: '', password: '', host: '65.21.109.96', port: 21, remoteDir: '/files' });
    setCreateMode('new');
    setShowCreateModal(true);
  };

  if (loading) return <LoadingSpinner />;

  const withFtp    = companies.filter(c => c.ftpType !== 'none').length;
  const withNew    = companies.filter(c => c.ftpType === 'new').length;
  const withLegacy = companies.filter(c => c.ftpType === 'legacy').length;

  const filterLower = filterName.trim().toLowerCase();
  const filteredCompanies = companies.filter((company) => {
    const matchesName = !filterLower || company.name.toLowerCase().includes(filterLower);
    const hasConfig = company.ftpType !== 'none';
    const matchesConfigPresence =
      configPresenceFilter === 'all' ||
      (configPresenceFilter === 'with' && hasConfig) ||
      (configPresenceFilter === 'without' && !hasConfig);
    return matchesName && matchesConfigPresence;
  });
  const totalFiltered = filteredCompanies.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageCompanies = filteredCompanies.slice(start, start + pageSize);

  const goToPage = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)));

  return (
    <div className={`admin-tab-content ${styles.ftpManagement}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2>{t('admin.ftpManagementTitle')}</h2>
          <p>{t('admin.ftpManagementSubtitle')}</p>
        </div>
        <Button
          onClick={handleSyncAll}
          variant="primary"
          size="sm"
          disabled={syncingAll}
          className={styles.syncAllBtn}
        >
          <span className={`fas ${syncingAll ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`}></span>
          {syncingAll ? 'Syncing…' : 'Sync All FTP'}
        </Button>
      </div>

      {/* Notifications */}
      {error && (
        <div className={styles.error}>
          <span className="fas fa-exclamation-triangle"></span>
          {error}
          <button onClick={() => setError(null)} className={styles.closeError}>×</button>
        </div>
      )}
      {successMsg && (
        <div className={styles.success}>
          <span className="fas fa-check-circle"></span>
          {successMsg}
        </div>
      )}

      {/* Stats pills */}
      <div className={styles.pills}>
        <div className={styles.pill}>
          <span className={styles.pillValue}>{companies.length}</span>
          <span className={styles.pillLabel}>Total</span>
        </div>
        <div className={`${styles.pill} ${styles.pillNew}`}>
          <span className={styles.pillValue}>{withNew}</span>
          <span className={styles.pillLabel}>New FTP</span>
        </div>
        <div className={`${styles.pill} ${styles.pillLegacy}`}>
          <span className={styles.pillValue}>{withLegacy}</span>
          <span className={styles.pillLabel}>Legacy FTP</span>
        </div>
        <div className={styles.pill}>
          <span className={styles.pillValue}>{companies.length - withFtp}</span>
          <span className={styles.pillLabel}>No FTP</span>
        </div>
      </div>

      {/* Filter and page size */}
      <div className={styles.toolbar}>
        <div className={styles.filterWrap}>
          <span className={styles.filterIcon} aria-hidden><span className="fas fa-search"></span></span>
          <input
            type="text"
            className={styles.filterInput}
            placeholder="Filter by company name..."
            value={filterName}
            onChange={(e) => { setFilterName(e.target.value); setPage(1); }}
          />
          {filterName && (
            <button
              type="button"
              className={styles.filterClear}
              onClick={() => { setFilterName(''); setPage(1); }}
              title="Clear filter"
            >
              <span className="fas fa-times"></span>
            </button>
          )}
        </div>
        <div className={styles.pageSizeWrap}>
          <label className={styles.pageSizeLabel}>{t('admin.configuration')}:</label>
          <select
            className={styles.pageSizeSelect}
            value={configPresenceFilter}
            onChange={(e) => { setConfigPresenceFilter(e.target.value as ConfigPresenceFilter); setPage(1); }}
          >
            <option value="all">{t('admin.allCompanies')}</option>
            <option value="with">{t('admin.withFtpConfig')}</option>
            <option value="without">{t('admin.withoutFtpConfig')}</option>
          </select>
        </div>
        <div className={styles.pageSizeWrap}>
          <label className={styles.pageSizeLabel}>Per page:</label>
          <select
            className={styles.pageSizeSelect}
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        <table className={styles.companiesTable}>
          <thead>
            <tr>
              <th className={styles.colCompany}>{t('admin.company')}</th>
              <th className={styles.colType}>Type</th>
              <th className={styles.colStatus}>Status</th>
              <th className={styles.colUsername}>Username</th>
              <th className={styles.colLastSync}>Last Sync</th>
              <th className={styles.colActions}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pageCompanies.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.emptyCell}>
                  {filterLower ? 'No companies match the filter.' : 'No companies.'}
                </td>
              </tr>
            ) : (
            pageCompanies.map((company) => (
              <tr key={company._id}>
                <td className={styles.colCompany}>
                  <div className={styles.companyName}>{company.name}</div>
                </td>
                <td className={styles.colType}>{getTypeBadge(company)}</td>
                <td className={styles.colStatus}>{getStatusBadge(company)}</td>
                <td className={styles.colUsername}>
                  <span className={styles.username} title={company.ftpUsername || company.legacyUsername || ''}>
                    {company.ftpType === 'new'
                      ? (company.ftpUsername || '—')
                      : company.ftpType === 'legacy'
                        ? (company.legacyUsername || '—')
                        : '—'}
                  </span>
                  {company.legacyErrors > 0 && (
                    <span className={styles.errorBadge} title={company.legacyLastError || ''}>
                      {company.legacyErrors} err
                    </span>
                  )}
                </td>
                <td className={styles.colLastSync}>
                  {company.ftpType === 'legacy'
                    ? formatDate(company.legacyLastPolled)
                    : formatDate(company.lastConnection)}
                </td>
                <td className={styles.colActions}>
                  <div className={styles.actions}>
                    {company.ftpType === 'none' ? (
                      <Button onClick={() => openCreateModal(company)} variant="primary" size="sm">
                        <span className="fas fa-plus"></span> Setup FTP
                      </Button>
                    ) : (
                      <>
                        {/* Force sync button */}
                        <Button
                          onClick={() => handleSync(company)}
                          variant="secondary"
                          size="sm"
                          disabled={syncingId === company._id}
                          title="Force sync now"
                        >
                          <span className={`fas ${syncingId === company._id ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`}></span>
                          Sync
                        </Button>

                        {/* Toggle active (new FTP only) */}
                        {company.ftpType === 'new' && (
                          <Button
                            onClick={() => handleToggleActive(company._id, company.ftpActive)}
                            variant={company.ftpActive ? 'secondary' : 'primary'}
                            size="sm"
                          >
                            <span className={`fas fa-${company.ftpActive ? 'pause' : 'play'}`}></span>
                            {company.ftpActive ? 'Pause' : 'Resume'}
                          </Button>
                        )}

                        {/* Reset password (new FTP only) */}
                        {company.ftpType === 'new' && (
                          <Button onClick={() => handleResetPassword(company._id)} variant="secondary" size="sm">
                            <span className="fas fa-key"></span>
                          </Button>
                        )}

                        {/* Delete */}
                        <Button onClick={() => handleDelete(company._id)} variant="danger" size="sm">
                          <span className="fas fa-trash"></span>
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalFiltered > 0 && (
        <div className={styles.pagination}>
          <span className={styles.paginationSummary}>
            Showing {start + 1}–{Math.min(start + pageSize, totalFiltered)} of {totalFiltered}
            {filterLower ? ' (filtered)' : ''}
          </span>
          <div className={styles.paginationControls}>
            <button
              type="button"
              className={styles.paginationBtn}
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              title="Previous page"
            >
              <span className="fas fa-chevron-left"></span> Prev
            </button>
            <span className={styles.paginationPage}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className={styles.paginationBtn}
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
              title="Next page"
            >
              Next <span className="fas fa-chevron-right"></span>
            </button>
          </div>
        </div>
      )}

      {/* Create/Set FTP Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={`Setup FTP — ${selectedCompany?.name || ''}`}
      >
        <div className={styles.createForm}>
          {/* Mode selector */}
          <div className={styles.modeSelector}>
            <button
              className={`${styles.modeBtn} ${createMode === 'new' ? styles.modeBtnActive : ''}`}
              onClick={() => setCreateMode('new')}
            >
              <span className="fas fa-server"></span>
              New FTP (platform-hosted)
            </button>
            <button
              className={`${styles.modeBtn} ${createMode === 'legacy' ? styles.modeBtnActive : ''}`}
              onClick={() => setCreateMode('legacy')}
            >
              <span className="fas fa-history"></span>
              Legacy FTP (supplier-owned)
            </button>
          </div>

          {createMode === 'new' ? (
            <>
              <div className={styles.formGroup}>
                <label>Upload Quota (MB)</label>
                <Input
                  type="number"
                  value={newForm.uploadQuotaMB}
                  onChange={(e) => setNewForm({ ...newForm, uploadQuotaMB: parseInt(e.target.value) })}
                  min={50} max={5000}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Max concurrent connections</label>
                <Input
                  type="number"
                  value={newForm.maxConcurrentConnections}
                  onChange={(e) => setNewForm({ ...newForm, maxConcurrentConnections: parseInt(e.target.value) })}
                  min={1} max={10}
                />
              </div>
              <div className={styles.checkboxGroup}>
                <label>
                  <input
                    type="checkbox"
                    checked={newForm.autoProcessFiles}
                    onChange={(e) => setNewForm({ ...newForm, autoProcessFiles: e.target.checked })}
                  />
                  Auto-process files on upload
                </label>
              </div>
            </>
          ) : (
            <>
              <div className={styles.legacyNote}>
                <span className="fas fa-info-circle"></span>
                The supplier already has external FTP credentials (from their own hosting). Enter them here — the system will
                periodically pull their files automatically.
              </div>
              <div className={styles.formGroup}>
                <label>FTP Username (e.g. ftp_2476)</label>
                <Input
                  type="text"
                  value={legacyForm.username}
                  onChange={(e) => setLegacyForm({ ...legacyForm, username: e.target.value })}
                  placeholder="ftp_XXXX"
                />
              </div>
              <div className={styles.formGroup}>
                <label>FTP Password</label>
                <Input
                  type="text"
                  value={legacyForm.password}
                  onChange={(e) => setLegacyForm({ ...legacyForm, password: e.target.value })}
                  placeholder="supplier's FTP password"
                />
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Host</label>
                  <Input
                    type="text"
                    value={legacyForm.host}
                    onChange={(e) => setLegacyForm({ ...legacyForm, host: e.target.value })}
                  />
                </div>
                <div className={styles.formGroupSm}>
                  <label>Port</label>
                  <Input
                    type="number"
                    value={legacyForm.port}
                    onChange={(e) => setLegacyForm({ ...legacyForm, port: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>Remote directory</label>
                <Input
                  type="text"
                  value={legacyForm.remoteDir}
                  onChange={(e) => setLegacyForm({ ...legacyForm, remoteDir: e.target.value })}
                />
              </div>
            </>
          )}

          <div className={styles.formActions}>
            <Button onClick={() => setShowCreateModal(false)} variant="secondary">
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateFtp} variant="primary">
              {createMode === 'new' ? 'Create FTP Access' : 'Save Legacy FTP'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Credentials Modal */}
      <Modal
        isOpen={showCredentialsModal}
        onClose={() => setShowCredentialsModal(false)}
        title={t('admin.ftpCredentials')}
      >
        {credentials && (
          <div className={styles.credentialsContainer}>
            <div className={styles.credentialsWarning}>
              <span className="fas fa-exclamation-triangle"></span>
              {t('admin.saveCredentialsSecure')}
            </div>
            {[
              { label: t('admin.server'),   value: credentials.server },
              { label: t('admin.port'),     value: String(credentials.port) },
              { label: t('admin.username'), value: credentials.username },
              { label: t('admin.password'), value: credentials.password, danger: true },
            ].map(({ label, value, danger }) => (
              <div key={label} className={styles.credentialItem}>
                <label>{label}</label>
                <code className={danger ? styles.password : ''}>{value}</code>
              </div>
            ))}
            <div className={styles.formActions}>
              <Button onClick={() => setShowCredentialsModal(false)} variant="primary">
                {t('common.close')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
        title={confirmationModal.title}
        footer={
          <>
            <Button onClick={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))} variant="neutral">
              {t('common.cancel')}
            </Button>
            <Button onClick={confirmationModal.onConfirm} variant="primary">
              {t('common.ok')}
            </Button>
          </>
        }
      >
        <p>{confirmationModal.message}</p>
      </Modal>
    </div>
  );
};

export default FtpManagement;
