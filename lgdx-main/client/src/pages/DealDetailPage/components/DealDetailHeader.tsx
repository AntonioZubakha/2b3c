import React from 'react';
import { useTranslation } from '../../../i18n';
import { useNavigate } from '../../../routes';
import { Deal, DealStage } from '../../../types';
import DealStageStepper from '../../../components/DealStageStepper/DealStageStepper';
import styles from './DealDetailHeader.module.css';

interface DealDetailHeaderProps {
  deal: Deal;
}

const DealDetailHeader: React.FC<DealDetailHeaderProps> = ({ deal }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const getCounterpartyName = (): string => {
    // If the current user is a buyer role, always show LGDEAL as the supplier.
    if (deal.userRole && (deal.userRole === 'buyer' || deal.userRole === 'LGDEAL buyer' || deal.userRole === 'LGDEAL dual-role')) {
        return 'LGDeal INC';
    }

    // For a seller role, the counterparty is the buyer.
    if (deal.userRole && (deal.userRole === 'seller' || deal.userRole === 'LGDEAL seller')) {
        if (deal.buyerCompanyId && typeof deal.buyerCompanyId !== 'string') {
            return deal.buyerCompanyId.name;
        }
    }

    // Fallback for general case or if userRole is not clear
    if (deal.sellerCompanyId && typeof deal.sellerCompanyId !== 'string') {
      return deal.sellerCompanyId.name;
    }
    if (deal.buyerCompanyId && typeof deal.buyerCompanyId !== 'string') {
      return deal.buyerCompanyId.name;
    }
    return t('deals.notAvailable');
  };

  const handleClose = () => {
    navigate('/my-deals');
  };

  return (
    <div className={styles.dealCommonHeader}>
      <button 
        className={styles.closeButton} 
        onClick={handleClose}
        title={t('dealDetail.backToDeals')}
        aria-label={t('dealDetail.backToDeals')}
      >
        <i className="fas fa-times"></i>
      </button>

      <div className={styles.headerTextContent}>
        <h2>{t('deals.dealNumber')} {deal.dealNumber}</h2>
        <div className={styles.dealMetaInfo}>
          <span><strong>{t('deals.seller') || 'Supplier'}:</strong> {getCounterpartyName()}</span>
          <span className={styles.separator}>|</span>
          <span>{t('common.created') || 'Created'}: {new Date(deal.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      <div className={styles.headerStepperContainer}>
        <DealStageStepper
          currentStage={deal.stage as DealStage}
          currentStageOriginal={deal.stage as DealStage} // Pass original stage if needed
          dealStatus={deal.status}
        />
      </div>
    </div>
  );
};

export default DealDetailHeader; 