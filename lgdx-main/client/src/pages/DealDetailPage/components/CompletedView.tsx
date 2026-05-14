import React from 'react';
import { useTranslation } from '../../../i18n';
import { Deal } from '../../../types';
import AgreedTerms from './AgreedTerms';
import Button from '../../../components/common/Button/Button';
import styles from './CompletedView.module.css';
import dealIconStyles from '../DealDetailIconSpacing.module.css';

interface CompletedViewProps {
  deal: Deal;
  onShowActivityLog?: () => void;
}

const CompletedView: React.FC<CompletedViewProps> = ({ deal, onShowActivityLog }) => {
  const { t } = useTranslation();
  const completedDate = deal.completedAt || deal.updatedAt;

  return (
    <div className={styles.completedViewContainer}>
      <div className={`deal-section card ${styles.summaryPanel}`}>
        <h3 className={styles.summaryTitle}>
          <i className={`fas fa-check-circle ${dealIconStyles.iconMarginEnd}`}></i>
          {t('dealDetail.dealCompleted')}
        </h3>
        <p className={styles.summaryText}>
          {t('dealDetail.dealCompletedMessage', { date: completedDate ? new Date(completedDate).toLocaleDateString('en-US') : t('deals.notAvailable') })}
        </p>
      </div>

      {onShowActivityLog && (
        <div className={styles.activityLogSection}>
          <div className={styles.activityLogTitleGroup}>
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
      )}
      
      <AgreedTerms deal={deal} />
      
    </div>
  );
};

export default CompletedView; 