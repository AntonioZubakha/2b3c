import React, { useState, useEffect, useCallback, memo } from 'react';
import { useMarketData } from './hooks/useMarketData';
import { TabType, DemandPeriod } from './types';
import MarketOverviewHeader from './MarketOverviewHeader';
import MarketOverviewTabsNavigation from './MarketOverviewTabsNavigation';
import MarketOverviewContentContainer from './MarketOverviewContentContainer';
import Modal from '../common/Modal/Modal';
import Button from '../common/Button/Button';
import { useTranslation } from '../../i18n';
import styles from './MarketOverviewTabs.module.css';

const MarketOverviewTabs: React.FC = memo(() => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
  });

  const {
    loading,
    error,
    marketData,
    demandData,
    demandPeriod,
    demandDataCache,
    lastRefresh,
    fetchAllData,
    setDemandPeriod,
    setDemandData,
    handleRecalculateMarketOverview
  } = useMarketData();

  const handleRecalculateWithNotification = useCallback(async () => {
    await handleRecalculateMarketOverview((title, message) => {
      setNotification({
        isOpen: true,
        title,
        message,
      });
    });
  }, [handleRecalculateMarketOverview]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handlePeriodChange = useCallback((period: DemandPeriod) => {
    setDemandPeriod(period);

    // Мгновенно показываем кэшированные данные, если есть
    // Но не устанавливаем undefined, если данных в кэше нет
    if (demandDataCache && demandDataCache[period]) {
      setDemandData(demandDataCache[period]);
    }
  }, [demandDataCache, setDemandPeriod, setDemandData]);
  return (
    <div className={styles.container}>
      {/* Header */}
      <MarketOverviewHeader
        lastRefresh={lastRefresh}
        onRecalculate={handleRecalculateWithNotification}
        loading={loading}
      />

      {/* Tabs Navigation */}
      <MarketOverviewTabsNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Tab Content */}
      <div className={styles.contentContainer}>
        <MarketOverviewContentContainer
          activeTab={activeTab}
          marketData={marketData}
          demandData={demandData}
          demandPeriod={demandPeriod}
          onPeriodChange={handlePeriodChange}
          loading={loading}
          error={error}
          onRetry={fetchAllData}
        />
      </div>

      {/* Notification Modal */}
      <Modal
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        title={notification.title}
        footer={
          <Button onClick={() => setNotification({ ...notification, isOpen: false })}>
            {t('common.close')}
          </Button>
        }
      >
        <div style={{ whiteSpace: 'pre-wrap' }}>{notification.message}</div>
      </Modal>
    </div>
  );
});

MarketOverviewTabs.displayName = 'MarketOverviewTabs';

export default MarketOverviewTabs;
