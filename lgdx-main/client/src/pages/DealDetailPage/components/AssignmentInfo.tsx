import React from 'react';
import { useTranslation } from '../../../i18n';
import { Deal } from '../../../types';
import styles from './AssignmentInfo.module.css';
import dealIconStyles from '../DealDetailIconSpacing.module.css';

interface AssignmentInfoProps {
  deal: Deal;
}

const AssignmentInfo: React.FC<AssignmentInfoProps> = ({ deal }) => {
  const { t } = useTranslation();

  // Check if deal is assigned
  if (!deal.assignedTo || !deal.assignedRole) {
    return null;
  }

  const assignedUser = typeof deal.assignedTo === 'object' 
    ? deal.assignedTo 
    : null;

  const assignedByUser = typeof deal.assignedBy === 'object' 
    ? deal.assignedBy 
    : null;

  const roleLabel = deal.assignedRole === 'manager' 
    ? t('dealDetail.manager') 
    : t('dealDetail.logist');

  const assignedUserName = assignedUser 
    ? `${assignedUser.firstName} ${assignedUser.lastName}`
    : t('dealDetail.unknownUser');

  const assignedByName = assignedByUser 
    ? `${assignedByUser.firstName} ${assignedByUser.lastName}`
    : t('dealDetail.unknownUser');

  const assignedAtDate = deal.assignedAt 
    ? new Date(deal.assignedAt).toLocaleString()
    : null;

  return (
    <div className={`deal-section card ${styles.assignmentInfo}`}>
      <h3>
        <i className={`fas fa-user-check ${dealIconStyles.iconMarginEnd}`}></i>
        {t('dealDetail.assignmentInfo')}
      </h3>
      <div className={styles.infoGrid}>
        <div className={styles.infoItem}>
          <strong>{t('dealDetail.assignedTo')}:</strong>
          <span>
            {assignedUserName} ({roleLabel})
          </span>
        </div>
        {assignedByUser && (
          <div className={styles.infoItem}>
            <strong>{t('dealDetail.assignedBy')}:</strong>
            <span>{assignedByName}</span>
          </div>
        )}
        {assignedAtDate && (
          <div className={styles.infoItem}>
            <strong>{t('dealDetail.assignedAt')}:</strong>
            <span>{assignedAtDate}</span>
          </div>
        )}
      </div>
      <div className={styles.note}>
        <i className={`fas fa-info-circle ${dealIconStyles.iconMarginEnd}`}></i>
        <span>{t('dealDetail.assignmentHistoryNote')}</span>
      </div>
    </div>
  );
};

export default AssignmentInfo;
