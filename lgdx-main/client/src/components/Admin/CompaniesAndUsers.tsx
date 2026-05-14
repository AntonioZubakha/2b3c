import React, { useMemo, useState } from 'react';
import { useTranslation } from '../../i18n';
import Tabs, { TabItem } from '../common/Tabs';
import CompaniesList from './CompaniesList';
import UsersManagement from './UsersManagement';
import styles from './CompaniesAndUsers.module.css';

type InnerTab = 'companies' | 'users';

function CompaniesAndUsers(): React.ReactElement {
  const { t } = useTranslation();
  const [innerTab, setInnerTab] = useState<InnerTab>('companies');

  const innerTabs = useMemo<TabItem[]>(() => ([
    {
      key: 'companies',
      label: t('admin.companiesList'),
      icon: 'fas fa-building',
    },
    {
      key: 'users',
      label: t('admin.userManagement'),
      icon: 'fas fa-users',
    },
  ]), [t]);

  return (
    <div className={styles.wrapper}>
      <Tabs
        tabs={innerTabs}
        activeTab={innerTab}
        onTabChange={(key) => setInnerTab(key as InnerTab)}
        className={styles.innerTabs}
      />
      <div className={styles.innerContent}>
        {innerTab === 'companies' ? <CompaniesList /> : <UsersManagement />}
      </div>
    </div>
  );
}

export default CompaniesAndUsers;
