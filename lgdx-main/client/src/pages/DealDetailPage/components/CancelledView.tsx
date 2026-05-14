import React from 'react';
import { useTranslation } from '../../../i18n';
import { Deal } from '../../../types';
import Button from '../../../components/common/Button/Button';
import styles from './CancelledView.module.css';
import dealIconStyles from '../DealDetailIconSpacing.module.css';

interface CancelledViewProps {
  deal: Deal;
  onShowActivityLog?: () => void;
}

const CancelledView: React.FC<CancelledViewProps> = ({ deal, onShowActivityLog }) => {
  const { t } = useTranslation();
  const reason = deal.cancellationReason || deal.requestDetails?.rejectionReason || t('dealDetail.noReasonProvided');

  return (
    <div className={styles.cancelledViewContainer}>
      <div className={`deal-section card ${styles.cancellationInfo}`}>
        <h3><i className={`fas fa-ban ${dealIconStyles.iconMarginEnd}`}></i>{t('dealDetail.dealCancelled')}</h3>
        <p>{reason}</p>
      </div>

      {onShowActivityLog && (
        <div className={`deal-section card ${styles.activityLogCard}`}>
          <div className={styles.activityLogContent}>
            <div className={styles.activityLogInfo}>
              <i className="fas fa-history"></i>
              <div>
                <h4>{t('dealDetail.viewActivityLog')}</h4>
                <p>{t('dealDetail.activityLogDescription')}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={onShowActivityLog}>
              <i className={`fas fa-history ${dealIconStyles.iconMarginEnd}`}></i>
              {t('dealDetail.viewActivityLog')}
            </Button>
          </div>
        </div>
      )}
      
    </div>
  );
};

export default CancelledView; 