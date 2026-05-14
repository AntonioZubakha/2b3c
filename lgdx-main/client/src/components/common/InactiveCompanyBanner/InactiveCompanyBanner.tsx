import React from 'react';
import { useTranslation } from '../../../i18n';
import { useAuth } from '../../../context/AuthContext';
import { Company } from '../../../types';
import styles from './InactiveCompanyBanner.module.css';

const InactiveCompanyBanner: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user || !user.company) {
    return null;
  }

  const company = user.company as Company;
  
  // Don't show banner if company is active
  if (company.status === 'active') {
    return null;
  }

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'pending_review':
        return {
          title: t('company.accountBeingVerified'),
          message: '',
          type: 'warning'
        };
      case 'rejected':
        return {
          title: t('company.accountBeingVerified'),
          message: '',
          type: 'error'
        };
      case 'suspended':
        return {
          title: t('company.accountBeingVerified'),
          message: '',
          type: 'error'
        };
      default:
        return {
          title: t('company.accountBeingVerified'),
          message: '',
          type: 'warning'
        };
    }
  };

  const statusInfo = getStatusMessage(company.status || '');
  const iconMap = {
    warning: '⚠️',
    error: '🚫'
  };

  return (
    <div className={`${styles.banner} ${styles[statusInfo.type]}`}>
      <div className={styles.content}>
        <div className={styles.icon}>
          {iconMap[statusInfo.type as keyof typeof iconMap]}
        </div>
        <div className={styles.textContent}>
          <h4 className={styles.title}>{statusInfo.title}</h4>
          {statusInfo.message && <p className={styles.message}>{statusInfo.message}</p>}
        </div>
      </div>
    </div>
  );
};

export default InactiveCompanyBanner; 