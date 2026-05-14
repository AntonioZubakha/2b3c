import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { IconRefresh } from './SupplyInsightsIcons';
import styles from './MarketOverviewTabs.module.css';

interface MarketOverviewHeaderProps {
  lastRefresh: Date;
  onRecalculate: () => void;
  loading: boolean;
}

const MarketOverviewHeader: React.FC<MarketOverviewHeaderProps> = ({
  lastRefresh,
  onRecalculate,
  loading
}) => {
  const { isLgdealSupervisor } = useAuth();
  const { t } = useTranslation();

  return (
    <div className={styles.header}>
      <div className={styles.headerContent}>
        <div className={styles.titleSection}>
          <h2 className={styles.title}>{t('marketOverview.analyticsDashboard')}</h2>
          <p className={styles.subtitle}>
            {t('marketOverview.analyticsDashboardSubtitle')}
          </p>
          <div className={styles.lastUpdated}>
            {t('marketOverview.lastUpdated')}: {lastRefresh.toLocaleTimeString()}
          </div>
        </div>
        {isLgdealSupervisor && (
          <div className={styles.adminButtons}>
            <button
              onClick={onRecalculate}
              disabled={loading}
              className={styles.recalculateButton}
              title={t('marketOverview.recalculateMarketTooltip')}
            >
              <span className={`${styles.recalculateIcon} ${loading ? styles.spinning : ''}`} aria-hidden>
                <IconRefresh className={styles.recalculateIconSvg} />
              </span>
              {t('marketOverview.recalculateMarket')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketOverviewHeader;
