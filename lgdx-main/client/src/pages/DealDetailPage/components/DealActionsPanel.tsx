import React from 'react';
import { useTranslation } from '../../../i18n';
import { Deal } from '../../../types';
import styles from './DealActionsPanel.module.css';
import dealIconStyles from '../DealDetailIconSpacing.module.css';
import Button from '../../../components/common/Button/Button';

interface DealActionsPanelProps {
  deal: Deal;
  onApprove?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  onAcceptInvoice?: () => void;
  onRejectInvoice?: () => void;
  onRecallInvoice?: () => void;
  onConfirmPayment?: () => void;
  onAddTrackingNumber?: () => void;
  onConfirmDelivery?: () => void;
  onShowActivityLog?: () => void;
  // LGDEAL Internal Workflow actions
  onAssignToManager?: () => void;
  onReassignManager?: () => void;
  onStoneReceived?: () => void;
  onApproveQuality?: () => void;
  onRejectQuality?: () => void;
  onAssignToLogist?: () => void;
}

const DealActionsPanel: React.FC<DealActionsPanelProps> = ({ 
  deal, 
  onApprove, 
  onReject, 
  onCancel, 
  onAcceptInvoice, 
  onRejectInvoice,
  onRecallInvoice,
  onConfirmPayment,
  onAddTrackingNumber,
  onConfirmDelivery,
  onShowActivityLog,
  // LGDEAL Internal Workflow actions
  onAssignToManager,
  onReassignManager,
  onStoneReceived,
  onApproveQuality,
  onRejectQuality,
  onAssignToLogist
}) => {
  const { t } = useTranslation();
  const { allowedActions = [], stage, userRole } = deal;

  const isBuyer = userRole === 'buyer' || userRole === 'LGDEAL buyer' || userRole === 'LGDEAL dual-role';

  const actionsToDisplay = allowedActions.filter(action => {
    // These actions are handled by dedicated components, so we exclude them here.
    if ([
      'accept_alternative_product', 
      'reject_alternative_product',
      'set_shipping_cost',
      'set_import_tariff',
      'upload_invoice',
    ].includes(action)) {
      return false;
    }

    // Invoice actions are only for the buyer who didn't upload the invoice.
    if (['accept_invoice', 'reject_invoice'].includes(action)) {
      if (!isBuyer) {
        return false; // Seller should never see these
      }
      
      // Check if the current user's company uploaded the invoice
      // If they did, they shouldn't see accept/reject buttons
      const userCompanyName = deal.userRole === 'LGDEAL buyer' || deal.userRole === 'LGDEAL dual-role' 
        ? 'lgdeal' 
        : null;
      
      const buyerCompanyId = deal.userRole === 'buyer' ? deal.buyerCompanyId?.toString() : null;
      
      // If the user's company uploaded the invoice, hide accept/reject buttons
      const invoiceUploadedByUserCompany = 
        (userCompanyName && deal.paymentDetails?.uploadedByCompany === userCompanyName) ||
        (buyerCompanyId && deal.paymentDetails?.uploadedByCompany === buyerCompanyId);
      
      if (invoiceUploadedByUserCompany) {
        return false;
      }
    }

    // Explicitly hide 'cancel_deal' for seller roles in the 'request' stage, 
    // as it is semantically replaced by 'reject_request'.
    if (stage === 'request' && (userRole === 'seller' || userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role') && action === 'cancel_deal') {
      return false;
    }

    return true;
  });

  if (actionsToDisplay.length === 0) {
    return null;
  }

  type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'neutral';

  const getButtonProps = (action: string): { text: string; icon: string; variant: ButtonVariant, handler?: () => void, disabled?: boolean, title?: string } | null => {
    const isShippingCostSet = typeof deal.shippingDetails?.cost === 'number';
    switch (action) {
      case 'approve_request':
        return {
          text: t('dealDetail.approveRequest'),
          icon: 'fas fa-check-circle',
          variant: 'success',
          handler: onApprove,
          disabled: !isShippingCostSet,
          title: !isShippingCostSet ? t('dealDetail.setShippingCostToEnable') : t('dealDetail.approveThisRequest')
        };
      case 'reject_request':
        return {
          text: t('dealDetail.rejectRequest'),
          icon: 'fas fa-ban',
          variant: 'danger',
          handler: onReject
        };
      case 'cancel_deal':
        return {
          text: t('dealDetail.cancelDeal'),
          icon: 'fas fa-ban',
          variant: 'danger',
          handler: onCancel,
        };
      case 'accept_invoice':
        return {
            text: t('dealDetail.acceptInvoice'),
            icon: 'fas fa-check-circle',
            variant: 'success',
            handler: onAcceptInvoice
        };
      case 'reject_invoice':
        return {
            text: t('dealDetail.rejectInvoice'),
            icon: 'fas fa-times-circle',
            variant: 'danger',
            handler: onRejectInvoice
        };
      case 'recall_invoice':
        return {
            text: t('dealDetail.recallInvoice'),
            icon: 'fas fa-undo',
            variant: 'danger',
            handler: onRecallInvoice
        };
      case 'confirm_payment':
        return {
            text: t('dealDetail.confirmPayment'),
            icon: 'fas fa-money-check-alt',
            variant: 'success',
            handler: onConfirmPayment
        };
      case 'add_tracking_number':
        return {
            text: t('dealDetail.addTrackingInfo'),
            icon: 'fas fa-truck',
            variant: 'primary',
            handler: onAddTrackingNumber
        };
      case 'confirm_delivery':
        return {
            text: t('dealDetail.confirmDelivery'),
            icon: 'fas fa-box-check',
            variant: 'success',
            handler: onConfirmDelivery
        };
      // LGDEAL Internal Workflow actions
      case 'assign_to_manager':
        return {
            text: t('dealDetail.assignToManager'),
            icon: 'fas fa-user-plus',
            variant: 'primary',
            handler: onAssignToManager
        };
      case 'reassign_manager':
        return {
            text: t('dealDetail.reassignManager'),
            icon: 'fas fa-exchange-alt',
            variant: 'secondary',
            handler: onReassignManager
        };
      case 'stone_received':
        return {
            text: t('dealDetail.stoneReceived'),
            icon: 'fas fa-gem',
            variant: 'success',
            handler: onStoneReceived
        };
      case 'approve_quality':
        return {
            text: t('dealDetail.approveQuality'),
            icon: 'fas fa-check',
            variant: 'success',
            handler: onApproveQuality
        };
      case 'reject_quality':
        return {
            text: t('dealDetail.rejectQuality'),
            icon: 'fas fa-times-circle',
            variant: 'danger',
            handler: onRejectQuality
        };
      case 'assign_to_logist':
        return {
            text: t('dealDetail.assignToLogist'),
            icon: 'fas fa-shipping-fast',
            variant: 'primary',
            handler: onAssignToLogist
        };
      default:
        return null;
    }
  };

  const actionButtons = actionsToDisplay.map(action => {
    const buttonProps = getButtonProps(action);
    if (!buttonProps) return null;
    
    // Destructure to separate the event handler and children from DOM attributes
    const { handler, icon, text, ...rest } = buttonProps;

    return (
      <Button key={action} onClick={handler} {...rest}>
        <i className={icon} />
        <span>&nbsp;{text}</span>
      </Button>
    );
  });

  return (
    <div className={`deal-section card ${styles.actionsPanel}`}>
      <div className={styles.panelHeader}>
        <h3><i className={`fas fa-bolt ${dealIconStyles.iconMarginEnd}`}></i>{t('dealDetail.availableActions')}</h3>
      </div>
      <div className={styles.actionsContainer}>
        {actionButtons}
        {onShowActivityLog && (
            <Button variant="secondary" onClick={onShowActivityLog}>
                <i className={`fas fa-history ${dealIconStyles.iconMarginEnd}`}></i>
                {t('dealDetail.viewActivityLog')}
            </Button>
        )}
      </div>
    </div>
  );
};

export default DealActionsPanel; 