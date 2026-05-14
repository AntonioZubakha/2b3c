import React from 'react';
import { useTranslation } from '../../i18n';
import styles from './DealStageStepper.module.css';
import reqIcon from '../../assets/images/req.png';
import padIcon from '../../assets/images/pad.png';
import { DealStage, StageStatus, DealStageStepperProps } from '../../types';

interface StageIconsMap {
  [key: string]: string;
}

interface Stage {
  key: DealStage;
  label: string;
  icon: string;
}

// Stage icons mapping
const stageIcons: StageIconsMap = {
  request: reqIcon,
  payment_delivery: padIcon,
  completed: 'fas fa-check-circle',
  cancelled: 'fas fa-times-circle'
};

const DealStageStepper: React.FC<DealStageStepperProps> = ({ currentStage, dealStatus, currentStageOriginal }) => {
  const { t } = useTranslation();
  
  // Function to translate deal status
  const translateDealStatus = (status: string | undefined): string => {
    if (!status) return '';
    
    const statusMap: Record<string, string> = {
      'pending': t('paymentDelivery.dealStatusPending'),
      'rejected': t('paymentDelivery.dealStatusRejected'),
      'cancelled': t('paymentDelivery.dealStatusCancelled'),
      'awaiting_invoice': t('paymentDelivery.dealStatusAwaitingInvoice'),
      'invoice_pending': t('paymentDelivery.dealStatusInvoicePending'),
      'awaiting_payment': t('paymentDelivery.dealStatusAwaitingPayment'),
      'alternative_product_proposed': t('paymentDelivery.dealStatusAlternativeProductProposed'),
      'payment_received': t('paymentDelivery.dealStatusPaymentReceived'),
      'shipped': t('paymentDelivery.dealStatusShipped'),
      'completed': t('paymentDelivery.dealStatusCompleted'),
      'shipping_documents_uploaded': t('paymentDelivery.dealStatusShippingDocumentsUploaded'),
      'delivery_confirmed': t('paymentDelivery.dealStatusDeliveryConfirmed'),
      'payment_pending': t('paymentDelivery.dealStatusPaymentPending'),
      'awaiting_shipping_documents': t('paymentDelivery.dealStatusAwaitingShippingDocuments'),
      'invoice_accepted': t('paymentDelivery.dealStatusInvoiceAccepted'),
      // LGDEAL Internal Workflow statuses
      'assigned_to_manager': t('paymentDelivery.dealStatusAssignedToManager'),
      'quality_check_in_progress': t('paymentDelivery.dealStatusQualityCheckInProgress'),
      'quality_approved': t('paymentDelivery.dealStatusQualityApproved'),
      'quality_rejected': t('paymentDelivery.dealStatusQualityRejected'),
      'ready_for_shipping': t('paymentDelivery.dealStatusReadyForShipping'),
    };
    
    return statusMap[status] || status.replace(/_/g, ' ');
  };
  
  const stages: Stage[] = [
    { key: 'request', label: t('paymentDelivery.request'), icon: stageIcons.request },
    { key: 'payment_delivery', label: t('paymentDelivery.paymentDeliveryStatus'), icon: stageIcons.payment_delivery },
  ];

  let activeStageIndex = stages.findIndex(s => s.key === currentStage);
  
  if (currentStageOriginal === 'completed') {
    activeStageIndex = stages.length - 1; 
  }

  const getStageStatus = (stageIndex: number): StageStatus => {
    if (currentStageOriginal === 'completed') return 'completed';
    if (currentStageOriginal === 'cancelled') {
      if (stageIndex < activeStageIndex) return 'completed';
      if (stageIndex === activeStageIndex) return 'cancelled';
      return 'pending';
    }

    if (stageIndex < activeStageIndex) return 'completed';
    if (stageIndex === activeStageIndex) return 'active';
    return 'pending';
  };

  return (
    <div className={styles.dealStageStepper}>
      {stages.map((stage, index) => {
        const status = getStageStatus(index);
        let label = stage.label;
        if (status === 'active' && dealStatus) {
          label = `${stage.label} (${translateDealStatus(dealStatus)})`;
        } else if (status === 'cancelled' && dealStatus) {
          label = `${stage.label} (${t('paymentDelivery.cancelled')} - ${translateDealStatus(dealStatus)})`;
        }

        return (
          <React.Fragment key={stage.key}>
            <div className={`${styles.step} ${styles[status]}`}>
              <div className={styles.stepIcon}>
                {currentStageOriginal === 'completed' && status === 'completed' ? (
                  <i className={`${stageIcons.completed} ${styles.stepIconFa} ${styles.completed}`}></i>
                ) : status === 'cancelled' ? (
                  <i className={`${stageIcons.cancelled} ${styles.stepIconFa} ${styles.cancelled}`}></i>
                ) : status === 'completed' ? (
                  <i className={`${stageIcons.completed} ${styles.stepIconFa} ${styles.completed}`}></i>
                ) : (
                  <img src={stage.icon} alt={stage.label} className={styles.stepIconImg} />
                )}
              </div>
              <div className={styles.stepLabel}>{label}</div>
            </div>
            {index < stages.length - 1 && 
              <div className={`${styles.stepConnector} ${status === 'completed' || status === 'cancelled' || getStageStatus(index + 1) === 'active' || getStageStatus(index + 1) === 'completed' || getStageStatus(index + 1) === 'cancelled' ? styles.active : ''}`}></div>
            }
          </React.Fragment>
        );
      })}
      
      {currentStageOriginal === 'completed' && (
        <>
          <div className={`${styles.stepConnector} ${styles.active}`}></div>
          <div className={`${styles.step} ${styles.completed}`}>
            <div className={styles.stepIcon}>
              <i className={`${stageIcons.completed} ${styles.stepIconFa} ${styles.completed}`}></i>
            </div>
            <div className={styles.stepLabel}>{t('paymentDelivery.completed')} ({translateDealStatus(dealStatus)})</div>
          </div>
        </>
      )}
      
      {(currentStageOriginal === 'cancelled' && activeStageIndex === -1) && (
        <div className={`${styles.step} ${styles.cancelled} ${styles.standaloneStatus}`}>
          <div className={styles.stepIcon}>
            <i className={`${stageIcons.cancelled} ${styles.stepIconFa} ${styles.cancelled}`}></i>
          </div>
          <div className={styles.stepLabel}>{t('paymentDelivery.dealCancelled')} ({translateDealStatus(dealStatus)})</div>
        </div>
      )}
    </div>
  );
};

export default DealStageStepper; 