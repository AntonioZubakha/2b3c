import React, { useState } from 'react';
import { useTranslation } from '../../i18n';
import CategoryStatsTable from '../../components/Admin/CategoryStatsTable';
import VisualAnalytics from '../../components/Admin/VisualAnalytics';
import styles from './CategoryStatsPage.module.css';
import Tabs, { TabItem } from '../../components/common/Tabs';
import SEO from '../../components/common/SEO/SEO';

const CategoryStatsPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>('table');

  const tabs: TabItem[] = [
    {
      key: 'table',
      label: t('categoryStats.categoryTable'),
      icon: 'fas fa-table',
    },
    {
      key: 'charts',
      label: t('categoryStats.visualAnalytics'),
      icon: 'fas fa-chart-bar',
      disabled: false,
    },
  ];

  return (
    <>
      <SEO
        title={t('categoryStats.title')}
        description={t('categoryStats.subtitle')}
        type="website"
        keywords={[
          'diamond category statistics',
          'diamond analytics',
          'category analysis',
          'diamond market data',
          'B2B Lab-Grown Diamond Exchange',
          'lab-grown diamonds statistics'
        ]}
      />
      <div className={styles['category-stats-page']}>
      <header className="page-header">
        <h1 className="page-title">{t('categoryStats.title')}</h1>
        <p className="page-subtitle">
          {t('categoryStats.subtitle')}
        </p>
      </header>

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      
      <div className={styles['tab-content']}>
        {activeTab === 'table' && (
          <div className={styles['tab-content-container']}>
            <CategoryStatsTable />
          </div>
        )}
        
        {activeTab === 'charts' && (
          <div className={styles['tab-content-container']}>
            <VisualAnalytics />
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default CategoryStatsPage;
