import React from 'react';
import { useTranslation } from '../../../i18n';
import { Deal, ActivityLogEntry } from '../../../types';
import styles from './ActivityLog.module.css';

interface ActivityLogProps {
  deal: Deal;
}

const ActivityLog: React.FC<ActivityLogProps> = ({ deal }) => {
  const { t } = useTranslation();

  const getIconClass = (action: string) => {
    switch (action) {
      case 'deal_created':
      case 'approve_request':
      case 'accept_invoice':
      case 'confirm_payment':
      case 'confirm_delivery':
      case 'accept_alternative_product':
      case 'payment_verified': // Assuming this is a success state
        return `fas fa-check-circle ${styles.iconSuccess}`;
      case 'deal_cancelled':
      case 'reject_request':
      case 'reject_invoice':
      case 'reject_alternative_product':
        return `fas fa-times-circle ${styles.iconDanger}`;
      default:
        return `fas fa-info-circle ${styles.iconInfo}`;
    }
  };

  const getActorName = (log: ActivityLogEntry) => {
    const user = log.performedBy;
    if (user && user.firstName) {
      return `${user.firstName}`;
    }
    // Fallback for system or unknown actors
    if(log.details?.includes('LGDEAL') || log.details?.includes('LGDeal')) return 'LGDeal INC';
    if(log.details?.includes('Buyer')) return t('deals.buyer');
    return t('dealDetail.system');
  };


  return (
    <>
      {deal.activityLog && deal.activityLog.length > 0 ? (
        <ul className={styles.logList}>
          {[...deal.activityLog].reverse().map((log, index) => (
            <li key={index} className={styles.logItem}>
              <div className={styles.logIcon}>
                <i className={getIconClass(log.action)}></i>
              </div>
              <div className={styles.logContent}>
                <div className={styles.logHeader}>
                  <span className={styles.logActor}>{getActorName(log)}</span>
                  <span className={styles.logTimestamp}>{new Date(log.timestamp).toLocaleString('en-US')}</span>
                </div>
                <p className={styles.logDetails}>{log.details}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.noActivity}>{t('dealDetail.noActivityRecorded')}</p>
      )}
    </>
  );
};

export default ActivityLog; 