import React from 'react';
import { useTranslation } from '../../i18n';
import { TabType } from './types';
import { TABS } from './constants';
import styles from './MarketOverviewTabs.module.css';

interface MarketOverviewTabsNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const MarketOverviewTabsNavigation: React.FC<MarketOverviewTabsNavigationProps> = ({
  activeTab,
  onTabChange
}) => {
  const { t } = useTranslation();

  const getTabLabel = (tabId: string): string => {
    const tabLabels: Record<string, string> = {
      'overview': t('marketOverview.tabs.dashboard'),
      'demand': t('marketOverview.tabs.demandAnalysis'),
      'supply': t('marketOverview.tabs.supplyInsights'),
      'trends': t('marketOverview.tabs.priceTrends'),
      'news': t('marketOverview.tabs.marketNews'),
      'compare': t('marketOverview.tabs.compare'),
    };
    return tabLabels[tabId] || tabId;
  };

  const getTabDescription = (tabId: string): string => {
    const tabDescriptions: Record<string, string> = {
      'overview': t('marketOverview.tabDescriptions.dashboard'),
      'demand': t('marketOverview.tabDescriptions.demandAnalysis'),
      'supply': t('marketOverview.tabDescriptions.supplyInsights'),
      'trends': t('marketOverview.tabDescriptions.priceTrends'),
      'news': t('marketOverview.tabDescriptions.marketNews'),
      'compare': t('marketOverview.tabDescriptions.compare'),
    };
    return tabDescriptions[tabId] || '';
  };

  return (
    <div className={styles.tabsNavigation} role="tablist" aria-label={t('marketOverview.analyticsDashboard')}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-current={activeTab === tab.id ? 'true' : undefined}
          onClick={() => onTabChange(tab.id)}
          className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ''}`}
          title={getTabDescription(tab.id)}
        >
          <span className={styles.tabLabel}>{getTabLabel(tab.id)}</span>
        </button>
      ))}
    </div>
  );
};

export default MarketOverviewTabsNavigation;
