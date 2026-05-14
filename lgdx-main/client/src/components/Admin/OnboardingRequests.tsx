import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import styles from './OnboardingRequests.module.css';
import sharedStyles from './AdminShared.module.css';
import { Company, User } from '../../types';
import Button from '../common/Button/Button';
import { getCompaniesAndUsers, approveOnboardingRequest, rejectOnboardingRequest } from '../../api/adminApi';

// Define a more specific company type with pending_review status
interface PendingCompany extends Company {
  status: 'pending_review';
  users?: Array<{
    user: User | string;
    role: string;
    isActive: boolean;
    _id?: string;
  }>;
}

function OnboardingRequests(): React.ReactElement {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<PendingCompany[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnboardingRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pendingCompanies = await getCompaniesAndUsers('pending_review');
      
      // Фильтруем только валидные компании
      const validCompanies = (pendingCompanies as PendingCompany[]).filter(company => 
        company && company._id && company.name
      );
      
      setRequests(validCompanies);
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || (err instanceof Error ? err.message : t('admin.failedToFetchRequests')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchOnboardingRequests();
  }, [fetchOnboardingRequests]);

  const handleAction = async (companyId: string, action: 'approve' | 'reject') => {
    if (!companyId) {
      return;
    }
    
    try {
      setLoading(true);
      if (action === 'approve') {
        await approveOnboardingRequest(companyId);
      } else {
        await rejectOnboardingRequest(companyId);
      }
      fetchOnboardingRequests(); // Refetch to update the list
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || (err instanceof Error ? err.message : action === 'approve' ? t('admin.failedToApprove') : t('admin.failedToReject')));
      setLoading(false); // Reset loading only if action fails, otherwise fetchOnboardingRequests handles it
    }
  };

  if (loading && requests.length === 0) {
    return <div className="admin-tab-content"><p>{t('admin.loadingRequests')}</p></div>;
  }

  if (error) {
    return <div className={`admin-tab-content ${styles.errorMessage}`}><p>{t('common.error')}: {error}</p></div>;
  }

  if (!loading && (!requests || requests.length === 0)) {
    return <div className="admin-tab-content"><p>{t('admin.noPendingRequests')}</p></div>;
  }

  return (
    <div className={`admin-tab-content ${styles.onboardingRequests}`}>
      <h3>{t('admin.onboardingRequests')}</h3>
      {loading && <p className={styles.processingMessage}>{t('admin.processingAction')}</p>} 
      <ul className={sharedStyles.adminListContainer}>
        {requests && requests.length > 0 ? (
          requests.map((company) => (
            <li key={company._id} className={sharedStyles.adminListItem}>
              <div className={sharedStyles.adminItemDetails}>
                <h4>{company.name}</h4>
                <div className={styles.subDetails}>
                  <p><strong>{t('admin.firstUser')}:</strong> {company.users && company.users.length > 0 && company.users[0].user && typeof company.users[0].user !== 'string' 
                    ? company.users[0].user.email 
                    : t('common.no')}
                  </p>
                  <p><strong>{t('admin.description')}:</strong> {company.description || t('admin.noDescription')}</p>
                  <p><strong>{t('admin.requestedAt')}:</strong> {company.createdAt ? new Date(company.createdAt).toLocaleDateString() : t('admin.unknown')}</p>
                </div>
              </div>
              <div className={sharedStyles.adminItemActions}>
                <Button
                  onClick={() => handleAction(company._id, 'approve')}
                  variant="success"
                  disabled={loading}
                >
                  {t('admin.approve')}
                </Button>
                <Button
                  onClick={() => handleAction(company._id, 'reject')}
                  variant="danger"
                  disabled={loading}
                >
                  {t('admin.reject')}
                </Button>
              </div>
            </li>
          ))
        ) : (
          <li className={sharedStyles.adminListItem}>
            <p>{t('admin.noPendingRequestsFound')}</p>
          </li>
        )}
      </ul>
    </div>
  );
}

export default OnboardingRequests; 