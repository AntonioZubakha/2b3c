import React from 'react';
import { useTranslation } from '../../../i18n';
import { Deal } from '../../../types';
import styles from './RequestStatusPanel.module.css';

interface RequestStatusPanelProps {
  deal: Deal;
}

const RequestStatusPanel: React.FC<RequestStatusPanelProps> = ({ deal }) => {
  const { t } = useTranslation();
  const getStatusAppearance = (status: string) => {
    switch (status) {
      case 'pending': {
        const isSeller = deal.userRole === 'seller' || deal.userRole === 'LGDEAL seller' || deal.userRole === 'LGDEAL dual-role';
        return {
          icon: isSeller ? 'fas fa-exclamation-circle' : 'fas fa-hourglass-half',
          className: isSeller ? styles.actionRequired : styles.pending,
          title: isSeller ? t('dealDetail.actionRequired') : t('dealDetail.pendingApproval'),
          message: deal.dealState?.waitingMessage || t('dealDetail.awaitingReview'),
        };
      }
      case 'rejected':
        return {
          icon: 'fas fa-times-circle',
          className: styles.rejected,
          title: t('dealDetail.requestRejected'),
          message: deal.requestDetails?.rejectionReason 
            ? t('dealDetail.rejectionReason', { reason: deal.requestDetails.rejectionReason })
            : t('dealDetail.requestRejectedMessage'),
        };
      case 'alternative_product_proposed':
        return {
          icon: 'fas fa-exchange-alt',
          className: styles.actionRequired,
          title: t('dealDetail.alternativeProductProposed'),
          message: t('dealDetail.alternativeProposedMessage'),
        };
      case 'quality_rejected':
        return {
          icon: 'fas fa-check-circle',
          className: styles.approved,
          title: t('dealDetail.qualityRejectedTitle'),
          message: deal.userRole === 'buyer'
            ? t('dealDetail.qualityRejectedMessageBuyer')
            : t('dealDetail.qualityRejectedMessage'),
        };
      case 'awaiting_invoice':
        return {
            icon: 'fas fa-check-circle',
            className: styles.approved,
            title: t('dealDetail.requestApproved'),
            message: t('dealDetail.requestApprovedMessage'),
        }
      default:
        return {
          icon: 'fas fa-info-circle',
          className: '',
          title: t('dealDetail.statusUnknown'),
          message: t('dealDetail.statusUnknownMessage'),
        };
    }
  };

  const { icon, className, title, message } = getStatusAppearance(deal.status);

  return (
    <div className={`deal-section card ${styles.statusPanel}`}>
      <div className={styles.title}>
        <i className="fas fa-file-alt"></i>
        <span>{t('dealDetail.requestStatus')}</span>
      </div>
      <div className={`${styles.statusItem} ${className}`}>
        <div className={styles.icon}>
          <i className={icon}></i>
        </div>
        <div className={styles.details}>
          <span className={styles.statusLabel}>{title}</span>
          <p className={styles.statusMessage}>{message}</p>
        </div>
      </div>
    </div>
  );
};

export default RequestStatusPanel; 