import React, { useState } from 'react';
import { useTranslation } from '../../i18n';
import { useParams } from '../../routes';
import { useAuth } from '../../context/AuthContext';
import { ProductStatusInfo } from '../../types';
import styles from './DealDetailPage.module.css';
import { DealProvider, useDeal } from './context/DealContext';
import { uploadInvoice } from '../../api/dealApi';
import type { DealDetailPageDealAction, DealJsonActionName } from '../../api/dealApi';
import RequestStageView from './components/RequestStageView';
import PaymentDeliveryView from './components/PaymentDeliveryView';
import CompletedView from './components/CompletedView';
import CancelledView from './components/CancelledView';
import DealDetailHeader from './components/DealDetailHeader';
import DealActionsPanel from './components/DealActionsPanel';
import DealDetailHeaderSkeleton from './components/DealDetailHeaderSkeleton';
import DealSectionSkeleton from './components/DealSectionSkeleton';
import RejectionModal from './components/RejectionModal';
import AddTrackingModal from './components/AddTrackingModal';
import ActivityLogModal from './components/ActivityLogModal';
import AssignToManagerModal from './components/AssignToManagerModal';
import ReassignManagerModal from './components/ReassignManagerModal';
import AssignToLogistModal from './components/AssignToLogistModal';
import AssignmentInfo from './components/AssignmentInfo';

// Fix for useParams
export interface RouteParams {
  [key: string]: string | undefined;
  dealId: string;
} 

const DealDetailContent: React.FC = () => {
  const { t } = useTranslation();
  const { deal, isLoading, error, handleDealAction: performAction, setError, setDeal } = useDeal();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<string>('status');
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [currentAction, setCurrentAction] = useState<DealJsonActionName | ''>('');

  const [showTrackingModal, setShowTrackingModal] = useState<boolean>(false);
  const [showActivityLogModal, setShowActivityLogModal] = useState<boolean>(false);
  const [showAssignToManagerModal, setShowAssignToManagerModal] = useState<boolean>(false);
  const [showReassignManagerModal, setShowReassignManagerModal] = useState<boolean>(false);
  const [showAssignToLogistModal, setShowAssignToLogistModal] = useState<boolean>(false);

  // DealProvider уже вызывает fetchDealDetails при монтировании — дублирующий useEffect убран

  const getProductStatus = (productId: string): ProductStatusInfo | null => {
    if (!deal || !deal.dealState) return null;
    return deal.dealState.productStatuses.find(status => status.productId === productId) || null;
  };

  const handleDealAction = async (actionName: DealDetailPageDealAction, payload: Record<string, unknown> = {}) => {
    if (actionName === 'upload_invoice') {
      if (deal && payload.invoiceFile instanceof File) {
        try {
          const updatedDeal = await uploadInvoice(deal._id, payload.invoiceFile);
          setDeal(updatedDeal); // Используем ответ напрямую — без лишнего GET-запроса
        } catch (err: unknown) {
          if (err instanceof Error) setError(err.message);
        }
      }
      return;
    }

    if (actionName === 'reject_invoice' || actionName === 'reject_request' || actionName === 'cancel_deal' || actionName === 'reject_alternative_product' || actionName === 'reject_quality' || actionName === 'recall_invoice') {
      setCurrentAction(actionName);
      setShowRejectModal(true);
      return;
    }

    // Handle assignment actions that require modals
    if (actionName === 'assign_to_manager') {
      setShowAssignToManagerModal(true);
      return;
    }

    if (actionName === 'reassign_manager') {
      setShowReassignManagerModal(true);
      return;
    }

    if (actionName === 'assign_to_logist') {
      setShowAssignToLogistModal(true);
      return;
    }

    try {
      await performAction(actionName, payload);
    } catch (err) {
      // Error is already set in the context
    }
  };
  
  const handleRejectSubmit = async (reason: string) => {
    if (deal && currentAction) {
      try {
        // Different actions expect different payload keys for the reason text.
        let payload: Record<string, string>;
        if (currentAction === 'reject_quality') {
          payload = { reason };
        } else if (currentAction === 'recall_invoice') {
          payload = { recallReason: reason };
        } else {
          payload = { rejectionReason: reason };
        }
        await performAction(currentAction, payload);
        setShowRejectModal(false);
        setRejectionReason('');
        setCurrentAction('');
      } catch (err) {
        // Modal can stay open to show error if desired
      }
    }
  };

  const handleTrackingSubmit = async (trackingNumber: string, carrier: string) => {
    if (deal) {
      try {
        await performAction('add_tracking_number', { trackingNumber, carrier });
        setShowTrackingModal(false);
      } catch (err) {
        // Action failed, error already handled
      }
    }
  };

  const handleAssignToManager = async (managerId: string) => {
    if (deal) {
      try {
        await performAction('assign_to_manager', { managerId });
        setShowAssignToManagerModal(false);
      } catch (err) {
        // Action failed, error already handled
      }
    }
  };

  const handleReassignManager = async (newManagerId: string, reason: string) => {
    if (deal) {
      try {
        await performAction('reassign_manager', { newManagerId, reassignmentReason: reason });
        setShowReassignManagerModal(false);
      } catch (err) {
        // Action failed, error already handled
      }
    }
  };

  const handleAssignToLogist = async (logistId: string) => {
    if (deal) {
      try {
        await performAction('assign_to_logist', { logistId });
        setShowAssignToLogistModal(false);
      } catch (err) {
        // Action failed, error already handled
      }
    }
  };

  const getModalTitleAndPrompt = () => {
    switch (currentAction) {
      case 'reject_invoice': return { title: t('dealDetail.rejectInvoice'), prompt: t('dealDetail.rejectInvoicePrompt') };
      case 'recall_invoice': return { title: t('dealDetail.recallInvoice'), prompt: t('dealDetail.recallInvoicePrompt') };
      case 'reject_request': return { title: t('dealDetail.rejectRequest'), prompt: t('dealDetail.rejectRequestPrompt') };
      case 'reject_alternative_product': return { title: t('dealDetail.rejectAlternative'), prompt: t('dealDetail.rejectAlternativePrompt') };
      case 'reject_quality': return { title: t('dealDetail.rejectQuality'), prompt: t('dealDetail.rejectQualityPrompt') };
      case 'cancel_deal': return { title: t('dealDetail.cancelDeal'), prompt: t('dealDetail.cancelDealPrompt') };
      default: return { title: t('dealDetail.provideReason'), prompt: t('dealDetail.provideReasonPrompt') };
    }
  };

  if (isLoading && !deal) { // Show skeleton only on initial load
    return (
      <div className={styles['deal-detail-page']}>
        <DealDetailHeaderSkeleton />
        <div className={styles['deal-detail-layout']}>
          <div className={styles['layout-main-column']}><DealSectionSkeleton lines={5} hasButton={true} /></div>
          <div className={styles['layout-side-column']}><DealSectionSkeleton lines={3} /><DealSectionSkeleton lines={4} /></div>
        </div>
      </div>
    );
  }

  if (error) return <div className={`${styles['error-message']} ${styles['container']}`}>{error}</div>;
  if (!deal) return <div className={styles['container']}>{t('dealDetail.notFound')}</div>;
  
  const renderCurrentStageView = () => {
    switch (deal.stage) {
      case 'request':
        return <RequestStageView 
                  deal={deal} 
                  user={user} 
                  handleSelectAlternative={(origId: string, altId: string) => {
                    void handleDealAction('select_alternative_product', { originalProductId: origId, alternativeProductId: altId });
                  }}
                  handleDealAction={handleDealAction} 
                  getProductStatus={getProductStatus} 
                />;
      case 'payment_delivery':
        return <PaymentDeliveryView deal={deal} activeTab={activeTab} setActiveTab={setActiveTab} setError={setError} handleDealAction={handleDealAction} />;
      case 'completed':
        return <CompletedView deal={deal} onShowActivityLog={() => setShowActivityLogModal(true)} />;
      case 'cancelled':
        return <CancelledView deal={deal} onShowActivityLog={() => setShowActivityLogModal(true)} />;
      default:
        return <p>{t('dealDetail.unknownDealStage', { stage: deal.stage })}</p>;
    }
  };

  const { title, prompt } = getModalTitleAndPrompt();

  return (
    <>
      <RejectionModal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} onSubmit={handleRejectSubmit} title={title} prompt={prompt} reason={rejectionReason} setReason={setRejectionReason} />
      <AddTrackingModal isOpen={showTrackingModal} onClose={() => setShowTrackingModal(false)} onSubmit={handleTrackingSubmit} />
      {deal && <ActivityLogModal isOpen={showActivityLogModal} onClose={() => setShowActivityLogModal(false)} deal={deal} />}
      {deal && (
        <>
          <AssignToManagerModal 
            isOpen={showAssignToManagerModal} 
            onClose={() => setShowAssignToManagerModal(false)} 
            onSubmit={handleAssignToManager}
            currentManagerId={typeof deal.assignedTo === 'object' && deal.assignedTo ? deal.assignedTo._id : (typeof deal.assignedTo === 'string' ? deal.assignedTo : undefined)}
          />
          <ReassignManagerModal 
            isOpen={showReassignManagerModal} 
            onClose={() => setShowReassignManagerModal(false)} 
            onSubmit={handleReassignManager}
            currentManagerId={typeof deal.assignedTo === 'object' && deal.assignedTo ? deal.assignedTo._id : (typeof deal.assignedTo === 'string' ? deal.assignedTo : '')}
            currentManagerName={typeof deal.assignedTo === 'object' && deal.assignedTo ? `${deal.assignedTo.firstName} ${deal.assignedTo.lastName}` : undefined}
          />
          <AssignToLogistModal 
            isOpen={showAssignToLogistModal} 
            onClose={() => setShowAssignToLogistModal(false)} 
            onSubmit={handleAssignToLogist}
          />
        </>
      )}
      <div className={`${styles['deal-detail-page']} ${styles['animate-fade-in']}`}>
        <DealDetailHeader deal={deal} />
        <div className={styles['deal-details-grid']}>
          <div className={styles['main-column']}>
            {renderCurrentStageView()}
            {deal.assignedTo && <AssignmentInfo deal={deal} />}
            <DealActionsPanel
              deal={deal}
              onApprove={() => handleDealAction('approve_request')}
              onReject={() => handleDealAction('reject_request')}
              onCancel={() => handleDealAction('cancel_deal')}
              onAcceptInvoice={() => handleDealAction('accept_invoice')}
              onRejectInvoice={() => handleDealAction('reject_invoice')}
              onRecallInvoice={() => handleDealAction('recall_invoice')}
              onConfirmPayment={() => handleDealAction('confirm_payment')}
              onAddTrackingNumber={() => setShowTrackingModal(true)}
              onConfirmDelivery={() => handleDealAction('confirm_delivery')}
              onShowActivityLog={() => setShowActivityLogModal(true)}
              onAssignToManager={() => handleDealAction('assign_to_manager')}
              onReassignManager={() => handleDealAction('reassign_manager')}
              onStoneReceived={() => handleDealAction('stone_received')}
              onApproveQuality={() => handleDealAction('approve_quality')}
              onRejectQuality={() => handleDealAction('reject_quality')}
              onAssignToLogist={() => handleDealAction('assign_to_logist')}
            />
          </div>
        </div>
      </div>
    </>
  );
};

const DealDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const { dealId } = useParams<RouteParams>();

  if (!dealId) {
    return <div className={styles['container']}>{t('dealDetail.dealIdNotFound')}</div>;
  }

  return (
    <DealProvider dealId={dealId}>
      <DealDetailContent />
    </DealProvider>
  );
};

export default DealDetailPage; 