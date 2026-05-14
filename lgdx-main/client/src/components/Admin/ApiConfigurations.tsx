import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '../../i18n';
import { useNavigate } from '../../routes';
import styles from './ApiConfigurations.module.css';
import sharedStyles from './AdminShared.module.css';
import Button from '../common/Button/Button';
import Input from '../common/Input/Input';
import {
  getCompaniesWithApiConfig,
  syncCompanyNow,
  resetSyncStatus,
  deleteApiConfig,
  syncAllActiveApis,
  replayApiSyncDlq,
  CompanyWithApiConfig
} from '../../api/adminApi';
import { triggerMarketCalculation } from '../../api/categoryStatsApi';

const PAGE_SIZE = 10;

// A new simple Status component to replace the .admin-status logic
interface StatusIndicatorProps {
  status?: 'SYNCING' | 'SUCCESS' | 'ERROR' | 'PENDING' | string | null;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
    const statusText = status || 'IDLE';
    const statusClass = statusText.toLowerCase();

    return (
        <span className={`${sharedStyles.adminStatus} ${sharedStyles[statusClass]}`}>
            {statusText.replace(/_/g, ' ')}
        </span>
    );
};

// Define interfaces for specific API configuration related types

// Define action loading and notification state types
interface ActionState {
  [companyId: string]: boolean | string | null;
}

function ApiConfigurations(): React.ReactElement {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<CompanyWithApiConfig[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<ActionState>({}); // { [companyId]: boolean }
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionState>({}); // { [companyId]: string }
  const [actionSuccess, setActionSuccess] = useState<ActionState>({}); // { [companyId]: string }
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null); // Store company ID to confirm deletion
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  const [syncAllMessage, setSyncAllMessage] = useState<string | null>(null);
  const [syncAllError, setSyncAllError] = useState<string | null>(null);
  const [isReplayingDlq, setIsReplayingDlq] = useState<boolean>(false);
  const [dlqReplayMessage, setDlqReplayMessage] = useState<string | null>(null);
  const [dlqReplayError, setDlqReplayError] = useState<string | null>(null);
  const [isRunningCalc, setIsRunningCalc] = useState<boolean>(false);
  const [calcMessage, setCalcMessage] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [searchByCompany, setSearchByCompany] = useState<string>('');
  const [configPresenceFilter, setConfigPresenceFilter] = useState<'all' | 'with' | 'without'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

  const navigate = useNavigate();

  const filteredCompanies = useMemo(() => {
    const term = searchByCompany.toLowerCase().trim();

    return companies.filter((company) => {
      const matchesName = !term || company.name.toLowerCase().includes(term);
      const hasConfig = !!company.apiConfig;
      const matchesConfigPresence =
        configPresenceFilter === 'all' ||
        (configPresenceFilter === 'with' && hasConfig) ||
        (configPresenceFilter === 'without' && !hasConfig);

      return matchesName && matchesConfigPresence;
    });
  }, [companies, searchByCompany, configPresenceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE));
  const paginatedCompanies = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCompanies.slice(start, start + PAGE_SIZE);
  }, [filteredCompanies, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchByCompany, configPresenceFilter]);
  // Auth is handled by global axios config

  const fetchCompaniesWithApiConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCompaniesWithApiConfig();
      setCompanies(data);
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || (err instanceof Error ? err.message : t('admin.failedToFetchCompanies')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchCompaniesWithApiConfig();
  }, [fetchCompaniesWithApiConfig]);

  const handleResetSyncStatus = async (companyId: string, companyName: string) => {
    setActionLoading(prev => ({ ...prev, [companyId]: true }));
    setActionError(prev => ({ ...prev, [companyId]: null }));
    setActionSuccess(prev => ({ ...prev, [companyId]: null }));
    try {
      await resetSyncStatus(companyId);
      setActionSuccess(prev => ({ ...prev, [companyId]: t('admin.syncStatusReset', { companyName }) }));
      await fetchCompaniesWithApiConfig();
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setActionError(prev => ({ ...prev, [companyId]: axiosError.response?.data?.message || (err instanceof Error ? err.message : 'Failed to reset status') }));
    } finally {
      setActionLoading(prev => ({ ...prev, [companyId]: false }));
    }
  };

  const handleSyncNow = async (companyId: string, companyName: string) => {
    setActionLoading(prev => ({ ...prev, [companyId]: true }));
    setActionError(prev => ({ ...prev, [companyId]: null }));
    setActionSuccess(prev => ({ ...prev, [companyId]: null }));
    try {
      // The endpoint for triggering sync is /api/admin/company-api/:companyId/sync
      await syncCompanyNow(companyId);
      setActionSuccess(prev => ({ ...prev, [companyId]: t('admin.syncInitiatedFor', { companyName }) }));
      // Optionally, refetch companies after a delay or rely on status update via polling/websockets if implemented
      // For now, we show a message. The status will update on next full fetch or tab switch.
      setTimeout(() => fetchCompaniesWithApiConfig(), 5000); // Refresh after 5s
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setActionError(prev => ({ 
        ...prev, 
        [companyId]: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('admin.failedToInitiateSync'))
      }));
    } finally {
      setActionLoading(prev => ({ ...prev, [companyId]: false }));
      setTimeout(() => {
        setActionSuccess(prev => ({ ...prev, [companyId]: null }));
        setActionError(prev => ({ ...prev, [companyId]: null }));
      }, 7000); // Clear message after 7 seconds
    }
  };

  const handleConfigureApi = (companyId: string) => {
    navigate(`/admin-panel/configure-api/${companyId}`);
  };

  // Function to handle API configuration deletion
  const handleDeleteApiConfig = async (companyId: string, companyName: string) => {
    if (deleteConfirmation !== companyId) {
      // First click - show confirmation
      setDeleteConfirmation(companyId);
      return;
    }

    // Second click - proceed with deletion
    setDeleteConfirmation(null);
    setActionLoading(prev => ({ ...prev, [companyId]: true }));
    setActionError(prev => ({ ...prev, [companyId]: null }));
    setActionSuccess(prev => ({ ...prev, [companyId]: null }));
    
    try {
      await deleteApiConfig(companyId);
      setActionSuccess(prev => ({ ...prev, [companyId]: `API configuration for ${companyName} has been deleted.` }));
      // Refresh data after deletion
      setTimeout(() => fetchCompaniesWithApiConfig(), 2000);
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setActionError(prev => ({ 
        ...prev, 
        [companyId]: axiosError.response?.data?.message || (err instanceof Error ? err.message : 'Failed to delete configuration.')
      }));
    } finally {
      setActionLoading(prev => ({ ...prev, [companyId]: false }));
      setTimeout(() => {
        setActionSuccess(prev => ({ ...prev, [companyId]: null }));
        setActionError(prev => ({ ...prev, [companyId]: null }));
      }, 7000); // Clear message after 7 seconds
    }
  };

  // Cancel delete confirmation if they click away
  const handleCancelDelete = () => {
    setDeleteConfirmation(null);
  };

  const handleSyncAllActive = async () => {
    setIsSyncingAll(true);
    setSyncAllMessage(null);
    setSyncAllError(null);
    try {
      const response = await syncAllActiveApis();
      let message = response.message;
      if (response.errors && response.errors.length > 0) {
        message += ` (${response.errors.length} errors during queuing).`;
        setSyncAllError(`Errors encountered: ${response.errors.join('; ')}`);
      }
      setSyncAllMessage(message);
      // Optionally, refresh companies list after a delay
      setTimeout(() => fetchCompaniesWithApiConfig(), 5000); 
    } catch (err: unknown) {
      const errorMsg = (err instanceof Error ? err.message : undefined) || 'Failed to initiate sync for all active APIs.';
      setSyncAllError(errorMsg);
    } finally {
      setIsSyncingAll(false);
      setTimeout(() => {
        setSyncAllMessage(null);
        setSyncAllError(null);
      }, 10000); // Clear message after 10 seconds
    }
  };

  const handleRunMarketCalculation = async () => {
    setIsRunningCalc(true);
    setCalcMessage(null);
    setCalcError(null);
    try {
      const res = await triggerMarketCalculation();
      if (res.success) {
        setCalcMessage(t('admin.marketCalculationStartedDetail'));
      } else {
        setCalcError(res.error || t('admin.failedToTriggerCalculation'));
      }
    } catch (err: unknown) {
      setCalcError((err instanceof Error ? err.message : undefined) || t('admin.failedToTriggerCalculation'));
    } finally {
      setIsRunningCalc(false);
      setTimeout(() => {
        setCalcMessage(null);
        setCalcError(null);
      }, 12000);
    }
  };

  const handleReplayDlq = async () => {
    setIsReplayingDlq(true);
    setDlqReplayMessage(null);
    setDlqReplayError(null);

    try {
      const response = await replayApiSyncDlq(500, true);
      setDlqReplayMessage(response.message);
      // Refresh after replay so UI state catches up.
      setTimeout(() => fetchCompaniesWithApiConfig(), 5000);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setDlqReplayError(
        axiosError.response?.data?.message ||
          (err instanceof Error ? err.message : t('admin.failedToReplayDlq'))
      );
    } finally {
      setIsReplayingDlq(false);
      setTimeout(() => {
        setDlqReplayMessage(null);
        setDlqReplayError(null);
      }, 10000);
    }
  };

  if (loading) {
    return <div className="admin-tab-content"><p>{t('admin.loadingApiConfigurations')}</p></div>;
  }

  if (error) {
    return <div className="admin-tab-content error-message"><p>{t('common.error')}: {error}</p></div>;
  }

  if (companies.length === 0) {
    return <div className="admin-tab-content"><p>{t('admin.noCompaniesToConfigure')}</p></div>;
  }

  return (
    <div className={`admin-tab-content admin-list-container ${styles.apiConfigurationsList}`}>
      <h3>{t('admin.apiConfigurationsAndSync')}</h3>
      <div className={styles.globalActions}>
        <Button
          onClick={handleSyncAllActive}
          variant="secondary"
          className={styles.syncAllButton}
          loading={isSyncingAll}
          disabled={loading}
          size="lg"
        >
          {isSyncingAll ? t('admin.processing') : t('admin.syncAllActiveApis')}
        </Button>
        <Button
          onClick={handleReplayDlq}
          variant="secondary"
          className={styles.syncAllButton}
          loading={isReplayingDlq}
          disabled={loading || isSyncingAll || isReplayingDlq}
          size="lg"
        >
          {isReplayingDlq ? t('admin.processing') : t('admin.replayDlqApiSync')}
        </Button>
        <Button
          onClick={handleRunMarketCalculation}
          variant="primary"
          className={styles.syncAllButton}
          loading={isRunningCalc}
          disabled={loading || isRunningCalc}
          size="lg"
          aria-busy={isRunningCalc}
          aria-label={isRunningCalc ? t('admin.marketCalculationInProgressA11y') : undefined}
        >
          {isRunningCalc ? t('admin.marketCalculationRunning') : t('admin.runMarketCalculation')}
        </Button>
        {isSyncingAll && <p className={styles.messageText}>{t('admin.attemptingToQueueApis')}</p>}
        {syncAllMessage && <p className={`${styles.messageText} ${styles.success}`}>{syncAllMessage}</p>}
        {syncAllError && <p className={`${styles.messageText} ${styles.error}`}>{syncAllError}</p>}
        {dlqReplayMessage && <p className={`${styles.messageText} ${styles.success}`}>{dlqReplayMessage}</p>}
        {dlqReplayError && <p className={`${styles.messageText} ${styles.error}`}>{dlqReplayError}</p>}
        {isRunningCalc && <p className={styles.messageText} role="status">{t('admin.marketCalculationStarting')}</p>}
        {calcMessage && !isRunningCalc && <p className={`${styles.messageText} ${styles.success}`} role="status">{calcMessage}</p>}
        {calcError && <p className={`${styles.messageText} ${styles.error}`}>{calcError}</p>}
      </div>
      <div className={styles.listFilterContainer}>
        <div className={styles.filterControls}>
          <Input
            type="text"
            placeholder={t('admin.searchCompaniesPlaceholder')}
            value={searchByCompany}
            onChange={(e) => setSearchByCompany(e.target.value)}
          />
          <select
            className={styles.filterSelect}
            value={configPresenceFilter}
            onChange={(e) => setConfigPresenceFilter(e.target.value as 'all' | 'with' | 'without')}
            aria-label={t('admin.filterByApiConfiguration')}
          >
            <option value="all">{t('admin.allCompanies')}</option>
            <option value="with">{t('admin.withApiConfig')}</option>
            <option value="without">{t('admin.withoutApiConfig')}</option>
          </select>
        </div>
      </div>
      {filteredCompanies.length === 0 && searchByCompany.trim() && (
        <p className={styles.noMatchText}>{t('admin.noCompaniesMatch', { term: searchByCompany })}</p>
      )}
      <ul className={sharedStyles.adminListContainer}>
        {paginatedCompanies.map((company) => (
          <li key={company._id} className={sharedStyles.adminListItem}>
            <div className={sharedStyles.adminItemDetails}>
              <h4>{company.name}</h4>
              {company.apiConfig ? (
                <div className={sharedStyles.adminItemSubDetails}>
                  <p><strong>Status:</strong>
                    <StatusIndicator status={company.apiConfig.syncStatus} />
                  </p>
                  <p><strong>{t('admin.lastSync')}:</strong> {company.apiConfig.lastSync ? new Date(company.apiConfig.lastSync).toLocaleString() : t('common.never')}</p>
                  {company.apiConfig.lastSyncError && <p className={styles.lastErrorText}><strong>{t('admin.lastError')}:</strong> {company.apiConfig.lastSyncError}</p>}
                </div>
              ) : (
                <p className={styles.noConfigText}>{t('admin.noApiConfigurationForCompany')}</p>
              )}
            </div>
            <div className={`${sharedStyles.adminItemActions} ${styles.itemActions}`}>
              <Button
                onClick={() => handleSyncNow(company._id, company.name)}
                variant="primary"
                loading={!!actionLoading[company._id]}
                disabled={!company.apiConfig || !!actionLoading[company._id]}
              >
                {t('admin.syncNow')}
              </Button>
              {company.apiConfig?.lastSyncError && (
                <Button
                  onClick={() => handleResetSyncStatus(company._id, company.name)}
                  variant="secondary"
                  loading={!!actionLoading[company._id]}
                  disabled={!!actionLoading[company._id]}
                  title={t('admin.resetSyncStatus')}
                >
                  {t('admin.resetSyncStatus')}
                </Button>
              )}
              <Button
                onClick={() => handleConfigureApi(company._id)}
                variant="secondary"
                disabled={!!actionLoading[company._id]}
              >
                {t('admin.configureApi')}
              </Button>
              {company.apiConfig && (
                <Button
                  onClick={() => handleDeleteApiConfig(company._id, company.name)}
                  variant="danger"
                  className={deleteConfirmation === company._id ? 'confirm-delete' : ''}
                  disabled={!!actionLoading[company._id]}
                >
                  {deleteConfirmation === company._id ? t('admin.confirmDelete') : t('admin.deleteConfig')}
                </Button>
              )}
              {deleteConfirmation === company._id && (
                <Button
                  onClick={handleCancelDelete}
                  variant="neutral"
                >
                  {t('common.cancel')}
                </Button>
              )}
              {actionLoading[company._id] && <p className={styles.messageText}>{t('admin.processing')}</p>}
              {actionError[company._id] && <p className={`${styles.messageText} ${styles.error}`}>{actionError[company._id]}</p>}
              {actionSuccess[company._id] && <p className={`${styles.messageText} ${styles.success}`}>{actionSuccess[company._id]}</p>}
            </div>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className={styles.pageButton}
          >
            {t('admin.previous')}
          </button>
          <span className={styles.pageInfo}>
            {t('admin.page', { current: currentPage, total: totalPages })}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className={styles.pageButton}
          >
            {t('admin.next')}
          </button>
        </div>
      )}
    </div>
  );
}

export default ApiConfigurations; 