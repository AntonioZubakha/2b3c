import React from 'react';
import { useTranslation } from '../../../i18n';
import { Deal } from '../../../types';
import type { DealDetailPageDealAction } from '../../../api/dealApi';
import PaymentStatusTimeline from './PaymentStatusTimeline';
import AgreedTerms from './AgreedTerms';
import styles from './PaymentDeliveryView.module.css';
import Tabs, { TabItem } from '../../../components/common/Tabs';

interface PaymentDeliveryViewProps {
  deal: Deal;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  setError: (error: string | null) => void;
  handleDealAction: (actionName: DealDetailPageDealAction, payload?: Record<string, unknown>) => void;
}

const PaymentDeliveryView: React.FC<PaymentDeliveryViewProps> = ({
  deal,
  activeTab,
  setActiveTab,
  setError,
  handleDealAction,
}) => {
  const { t } = useTranslation();
  const tabItems: TabItem[] = [
    {
      key: 'status',
      label: t('paymentDelivery.paymentDeliveryStatus'),
      icon: 'fas fa-receipt',
      content: <PaymentStatusTimeline deal={deal} setError={setError} handleDealAction={handleDealAction} />
    },
    {
      key: 'terms',
      label: t('paymentDelivery.agreedDealTerms'),
      icon: 'fas fa-file-contract',
      content: <AgreedTerms deal={deal} />
    }
  ];
  
  return (
    <div className={styles.paymentDeliveryStageView}>
      <Tabs
        tabs={tabItems}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        showContent={false} /* We will render content manually below */
      />

      <div className={styles.tabContent}>
        {activeTab === 'status' && <PaymentStatusTimeline deal={deal} setError={setError} handleDealAction={handleDealAction} />}
        {activeTab === 'terms' && <AgreedTerms deal={deal} />}
      </div>
    </div>
  );
};

export default PaymentDeliveryView; 