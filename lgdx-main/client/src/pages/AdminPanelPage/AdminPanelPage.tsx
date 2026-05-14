import React, { useMemo, useState } from 'react';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import OnboardingRequests from '../../components/Admin/OnboardingRequests';
import CompaniesAndUsers from '../../components/Admin/CompaniesAndUsers';
import ApiConfigurations from '../../components/Admin/ApiConfigurations';
import Analytics from '../../components/Admin/Analytics';
import SystemSettings from '../../components/Admin/SystemSettings';
import PerfectPairSettings from '../../components/Admin/PerfectPairSettings';
import ConstantsSettings from '../../components/Admin/ConstantsSettings';
import MarketPriceSettings from '../../components/Admin/MarketPriceSettings';
import ParserAliasesSettings from '../../components/Admin/ParserAliasesSettings';
import SuppliersStockTable from '../../components/Admin/SuppliersStockTable';
import BackgroundJobsMonitor from '../../components/Admin/BackgroundJobsMonitor';
import FtpManagement from '../../components/Admin/FtpManagement';
import ChatManagement from '../../components/Admin/ChatManagement';
import WhatsAppManagement from '../../components/Admin/WhatsAppManagement';
import TelegramUserManagement from '../../components/Admin/TelegramUserManagement';
import CategoryStatsTable from '../../components/Admin/CategoryStatsTable';
import VisualAnalytics from '../../components/Admin/VisualAnalytics';
import BotPromptsSettings from '../../components/Admin/BotPromptsSettings';
import Tabs, { TabItem } from '../../components/common/Tabs';
import PageHeader from '../../components/common/PageHeader/PageHeader';
import PageContainer from '../../components/common/PageContainer/PageContainer';
import PageSection from '../../components/common/PageSection/PageSection';
import styles from './AdminPanelPage.module.css';
import { Navigate } from '../../routes';

// Type for admin panel tabs
type AdminTab = 'onboarding' | 'companies' | 'api-config' | 'analytics' | 'category-stats' | 'ftp-management' | 'background-jobs' | 'chat-management' | 'whatsapp' | 'telegram-user' | 'settings' | 'perfect-pair-settings' | 'constants' | 'market-price-settings' | 'parser-aliases-settings' | 'bot-prompts' | 'suppliers-stock';

type CategoryStatsTab = 'table' | 'charts'

// SystemSettings component is now imported and used directly

function AdminPanelPage(): React.ReactElement {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AdminTab>('onboarding');
  const [categoryStatsActiveTab, setCategoryStatsActiveTab] = useState<CategoryStatsTab>('table');
  const { user, isAuthenticated, isLoading, isLgdealSupervisor } = useAuth();

  const isFullAdmin = user?.role === 'admin';

  const tabs = useMemo<TabItem[]>(() => ([
    {
      key: 'onboarding',
      label: t('admin.onboardingRequests'),
      icon: 'fas fa-user-plus',
    },
    {
      key: 'companies',
      label: t('admin.companiesAndUsers'),
      icon: 'fas fa-building',
    },
    {
      key: 'api-config',
      label: t('admin.apiConfigurations'),
      icon: 'fas fa-cogs',
    },
    {
      key: 'analytics',
      label: t('admin.analytics'),
      icon: 'fas fa-chart-bar',
    },
    {
      key: 'category-stats',
      label: t('admin.categoryStats'),
      icon: 'fas fa-chart-line',
    },
    {
      key: 'ftp-management',
      label: t('admin.ftpManagement'),
      icon: 'fas fa-server',
    },
    {
      key: 'background-jobs',
      label: t('admin.backgroundJobsTab'),
      icon: 'fas fa-tasks',
    },
    {
      key: 'chat-management',
      label: t('admin.chatSupport'),
      icon: 'fas fa-comments',
    },
    {
      key: 'whatsapp',
      label: t('admin.whatsappTab'),
      icon: 'fab fa-whatsapp',
    },
    {
      key: 'telegram-user',
      label: t('admin.telegramUserTab'),
      icon: 'fab fa-telegram',
    },
    ...(isFullAdmin
      ? [
          { key: 'settings' as const, label: t('admin.systemSettings'), icon: 'fas fa-cog' as const },
          { key: 'perfect-pair-settings' as const, label: t('admin.perfectPairSettings'), icon: 'fas fa-gem' as const },
          { key: 'constants' as const, label: t('admin.constantsSettings'), icon: 'fas fa-sliders-h' as const },
          { key: 'market-price-settings' as const, label: t('admin.marketPriceSettings'), icon: 'fas fa-percentage' as const },
          { key: 'parser-aliases-settings' as const, label: 'Parser Aliases', icon: 'fas fa-project-diagram' as const },
          { key: 'bot-prompts' as const, label: t('admin.botPrompts'), icon: 'fas fa-robot' as const },
        ]
      : []),
    {
      key: 'suppliers-stock',
      label: t('admin.suppliersStock'),
      icon: 'fas fa-box-open',
    },
  ]), [t, isFullAdmin]);

  // Check authentication and admin privileges
  if (isLoading) {
    return <div className={styles.loadingContainer}>{t('admin.loadingAuth')}</div>;
  }

  if (!isAuthenticated || !isLgdealSupervisor) {
    return <Navigate to="/login" replace />;
  }

  const renderTabContent = (): React.ReactElement => {
    switch (activeTab) {
      case 'onboarding':
        return <OnboardingRequests />;
      case 'companies':
        return <CompaniesAndUsers />;
      case 'api-config':
        return <ApiConfigurations />;
      case 'analytics':
        return <Analytics />;
      case 'category-stats':
        return (
          <div className={styles['category-stats-admin']}>
            <div className={styles['category-stats-tabs']}>
              <button 
                className={`${styles['category-stats-tab']} ${categoryStatsActiveTab === 'table' ? styles.active : ''}`}
                type="button"
                onClick={() => setCategoryStatsActiveTab('table')}
                aria-pressed={categoryStatsActiveTab === 'table'}
              >
                <i className="fas fa-table"></i> {t('categoryStats.categoryTable')}
              </button>
              <button 
                className={`${styles['category-stats-tab']} ${categoryStatsActiveTab === 'charts' ? styles.active : ''}`}
                type="button"
                onClick={() => setCategoryStatsActiveTab('charts')}
                aria-pressed={categoryStatsActiveTab === 'charts'}
              >
                <i className="fas fa-chart-bar"></i> {t('admin.visualAnalytics')}
              </button>
            </div>
            <div className={styles['category-stats-content']}>
              {categoryStatsActiveTab === 'table' && <CategoryStatsTable />}
              {categoryStatsActiveTab === 'charts' && <VisualAnalytics />}
            </div>
          </div>
        );
      case 'ftp-management':
        return <FtpManagement />;
      case 'background-jobs':
        return <BackgroundJobsMonitor />;
      case 'chat-management':
        return <ChatManagement />;
      case 'whatsapp':
        return <WhatsAppManagement />;
      case 'telegram-user':
        return <TelegramUserManagement />;
      case 'settings':
        return isFullAdmin ? <SystemSettings /> : <p className={styles.loadingContainer}>{t('admin.accessDenied')}</p>;
      case 'perfect-pair-settings':
        return isFullAdmin ? <PerfectPairSettings /> : <p className={styles.loadingContainer}>{t('admin.accessDenied')}</p>;
      case 'constants':
        return isFullAdmin ? <ConstantsSettings /> : <p className={styles.loadingContainer}>{t('admin.accessDenied')}</p>;
      case 'market-price-settings':
        return isFullAdmin ? <MarketPriceSettings /> : <p className={styles.loadingContainer}>{t('admin.accessDenied')}</p>;
      case 'parser-aliases-settings':
        return isFullAdmin ? <ParserAliasesSettings /> : <p className={styles.loadingContainer}>{t('admin.accessDenied')}</p>;
      case 'bot-prompts':
        return isFullAdmin ? <BotPromptsSettings /> : <p className={styles.loadingContainer}>{t('admin.accessDenied')}</p>;
      case 'suppliers-stock':
        return <SuppliersStockTable />;
      default:
        return <OnboardingRequests />;
    }
  };

  return (
    <PageContainer>
      <PageHeader 
        title={t('admin.title')} 
        subtitle={user ? `${t('company.welcome')}, ${user.firstName} ${user.lastName}` : t('admin.systemSettings')}
      />
      
      <PageSection>
        <div className={styles['admin-panel-container']}>
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(tabKey) => setActiveTab(tabKey as AdminTab)}
            className={styles['admin-tabs']}
          />
          
          <div className={styles['admin-tab-view']}>
            {renderTabContent()}
          </div>
        </div>
      </PageSection>
    </PageContainer>
  );
}

export default AdminPanelPage; 