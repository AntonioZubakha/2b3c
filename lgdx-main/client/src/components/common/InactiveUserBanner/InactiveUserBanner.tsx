import React from 'react';
import { useTranslation } from '../../../i18n';
import { useAuth } from '../../../context/AuthContext';
import styles from './InactiveUserBanner.module.css';

const InactiveUserBanner: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Don't show banner if user is active or is the first user (supervisor)
  if (!user || user.isActive || user.role === 'supervisor') {
    return null;
  }

  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <div className={styles.icon}>⚠️</div>
        <div className={styles.textContent}>
          <h4 className={styles.title}>{t('auth.accountActivationRequired')}</h4>
          <p className={styles.message}>
            {t('auth.accountActivationRequiredMessage')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default InactiveUserBanner; 