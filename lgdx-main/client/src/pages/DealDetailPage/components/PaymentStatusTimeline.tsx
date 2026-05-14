import React, { useState } from 'react';
import { useTranslation } from '../../../i18n';
import { Deal } from '../../../types';
import type { DealDetailPageDealAction } from '../../../api/dealApi';
import styles from './PaymentStatusTimeline.module.css';
import dealIconStyles from '../DealDetailIconSpacing.module.css';
import InvoiceUploadPanel from './InvoiceUploadPanel';
import PaymentMethodSelector from './PaymentMethodSelector';
import PricingAdjustmentPanel from './PricingAdjustmentPanel';
import { downloadInvoice } from '../../../api/dealApi';

interface PaymentStatusTimelineProps {
  deal: Deal;
  setError: (error: string | null) => void;
  handleDealAction: (actionName: DealDetailPageDealAction, payload?: Record<string, unknown>) => void;
}

const PaymentStatusTimeline: React.FC<PaymentStatusTimelineProps> = ({ deal, setError, handleDealAction }) => {
  const { t } = useTranslation();
  const [showPaymentSelector, setShowPaymentSelector] = useState(false);
  
  const isAgreedTerms = deal.negotiationDetails?.finalTerms?.acceptedDate != null;
  const isInvoiceUploaded = deal.paymentDetails?.invoiceFilename != null;
  // Для buyer-to-lgdeal оплата уже получена при статусах LGDEAL (assign_to_manager и далее); для остальных — по payment_received/shipped/completed
  const paymentConfirmedStatuses = ['payment_received', 'shipped', 'delivery_confirmed', 'completed',
    'assigned_to_manager', 'quality_check_in_progress', 'quality_approved', 'quality_rejected', 'ready_for_shipping'];
  const isPaymentConfirmed = paymentConfirmedStatuses.includes(deal.status);
  const isShipped = deal.status === 'shipped' || deal.status === 'delivery_confirmed' || deal.status === 'completed';
  const isDelivered = deal.status === 'delivery_confirmed' || deal.status === 'completed';

  const canUploadInvoice = deal.allowedActions?.includes('upload_invoice');
  const canPay = deal.status === 'awaiting_payment' && deal.userRole?.includes('buyer');

  const handlePaymentSuccess = () => {
    setShowPaymentSelector(false);
    // Обновляем страницу для получения актуального статуса
    window.location.reload();
  };

  const handlePaymentError = (error: string) => {
    setError(error);
  };

  const trackingUrl = deal.shippingDetails?.trackingNumber ?
    (deal.shippingDetails.carrier === 'FedEx' ? `https://www.fedex.com/fedextrack/?trknbr=${deal.shippingDetails.trackingNumber}` :
      deal.shippingDetails.carrier === 'UPS' ? `https://www.ups.com/track?tracknum=${deal.shippingDetails.trackingNumber}` :
      deal.shippingDetails.carrier === 'USPS' ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${deal.shippingDetails.trackingNumber}` :
      deal.shippingDetails.carrier === 'DHL' ? `https://www.dhl.com/us-en/home/tracking/tracking-parcel.html?submit=1&tracking-id=${deal.shippingDetails.trackingNumber}` :
      `#`) : null;

  const RECALL_REASON_PREFIX = '[Recalled by seller]';
  const rejectedInvoices = deal.paymentDetails?.rejectedInvoices;
  const lastInvoiceEvent = rejectedInvoices && rejectedInvoices.length > 0
    ? rejectedInvoices[rejectedInvoices.length - 1]
    : null;
  const isLastInvoiceEventRecall = !!lastInvoiceEvent?.reason?.startsWith(RECALL_REASON_PREFIX);
  const displayInvoiceEventReason = lastInvoiceEvent
    ? (isLastInvoiceEventRecall
      ? (lastInvoiceEvent.reason.slice(RECALL_REASON_PREFIX.length).trim() || '—')
      : lastInvoiceEvent.reason)
    : '';

  return (
    <div className="deal-section card">
      <div className={styles.timelinePlaceholder}>
        <div className={`${styles.timelineItem} ${isAgreedTerms ? styles.completed : styles.active}`}>
          <h4>{t('paymentDelivery.dealTermsAgreed')}</h4>
          {deal.negotiationDetails?.finalTerms?.acceptedDate ? (
            <p>{t('paymentDelivery.agreedOn')} {new Date(deal.negotiationDetails.finalTerms.acceptedDate).toLocaleDateString()}</p>
          ) : <p>{t('paymentDelivery.pendingAgreement')}</p>}
        </div>
        <div className={`${styles.timelineItem} ${isAgreedTerms && !isInvoiceUploaded ? styles.active : (isInvoiceUploaded ? styles.completed : '')}`}>
          <h4>{t('paymentDelivery.invoice')}</h4>
          <p>{t('paymentDelivery.status')} {deal.status === 'awaiting_invoice' ? t('paymentDelivery.waitingForSupplierToSendInvoice') :
            deal.status === 'invoice_pending' ? t('paymentDelivery.invoiceIssuedWaitingForPayment') :
              deal.paymentDetails?.invoiceFilename ? t('paymentDelivery.invoiceUploaded') :
                t('paymentDelivery.pending')}</p>
          {lastInvoiceEvent && (
            <div className={isLastInvoiceEventRecall ? styles.recalledInvoiceInfo : styles.rejectedInvoiceInfo}>
              <p className={isLastInvoiceEventRecall ? styles.textWarning : styles.textDanger}>
                <i className={isLastInvoiceEventRecall ? 'fas fa-undo' : 'fas fa-exclamation-circle'} />
                {' '}
                {isLastInvoiceEventRecall ? t('paymentDelivery.invoiceWasRecalled') : t('paymentDelivery.invoiceWasRejected')}
              </p>
              <p className={styles.rejectionReason}>
                <strong>{t('paymentDelivery.reason')}</strong> {displayInvoiceEventReason}
              </p>
              <p className={styles.rejectionDetails}>
                <small>
                  {isLastInvoiceEventRecall ? t('paymentDelivery.recalledBy') : t('paymentDelivery.rejectedBy')}{' '}
                  {lastInvoiceEvent.rejectedBy?.firstName || 'User'} {t('paymentDelivery.on')}{' '}
                  {new Date(lastInvoiceEvent.date).toLocaleString()}
                </small>
              </p>
              {lastInvoiceEvent.originalFilename && (
                <p className={styles.rejectedFile}>
                  <small>
                    <i className="fas fa-file-pdf" /> {t('paymentDelivery.originalFile')} {lastInvoiceEvent.originalFilename}
                  </small>
                </p>
              )}
            </div>
          )}
          {deal.paymentDetails?.invoiceFilename && (
            <button
              onClick={async () => {
                try {
                  const blob = await downloadInvoice(deal._id);
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', deal.paymentDetails?.invoiceFilename || 'invoice.pdf');
                  document.body.appendChild(link);
                  link.click();
                  link.parentNode?.removeChild(link);
                } catch (err: unknown) {
                  setError(t('paymentDelivery.failedToDownloadInvoice'));
                }
              }}
              className={`btn btn-sm ${styles.invoiceDownloadBtn}`}
            >
              <i className="fas fa-download"></i> {t('paymentDelivery.downloadInvoice')}
            </button>
          )}
          {canUploadInvoice && (
            <>
              {/* Allow seller to correct shipping cost / import tariff before issuing
                  (or re-issuing, after a recall/reject) the invoice. */}
              <PricingAdjustmentPanel
                deal={deal}
                handleDealAction={handleDealAction}
                preInvoiceContext
              />
              <InvoiceUploadPanel
                onUploadInvoice={(file) => handleDealAction('upload_invoice', { invoiceFile: file })}
                isLoading={false} // This can be wired to context later if needed
                deal={deal}
              />
            </>
          )}
        </div>
        <div className={`${styles.timelineItem} ${isInvoiceUploaded && !isPaymentConfirmed ? styles.active : (isPaymentConfirmed ? styles.completed : '')}`}>
          <h4>{t('paymentDelivery.payment')}</h4>
          {isPaymentConfirmed ? (
            <div className={styles.paymentConfirmedBlock}>
              <p className={styles.paymentConfirmedStatus}>
                <i className="fas fa-check-circle" aria-hidden></i>
                {t('paymentDelivery.status')} {t('paymentDelivery.paymentConfirmed')}
              </p>
              <p className={styles.paymentConfirmedDate}>
                {t('paymentDelivery.paymentWasConfirmedOn')} {new Date(deal.activityLog?.find(log => log.action === 'payment_verified')?.timestamp || deal.updatedAt || Date.now()).toLocaleDateString('en-US')}
              </p>
            </div>
          ) : (
            <p>{t('paymentDelivery.status')} {deal.status === 'awaiting_payment' ? t('paymentDelivery.awaitingPaymentConfirmation') : t('paymentDelivery.pending')}</p>
          )}
          
          {/* Payment method selector for buyers when invoice is pending */}
          {canPay && !isPaymentConfirmed && (
            <div className={styles.paymentActions}>
              {!showPaymentSelector ? (
                <button
                  onClick={() => setShowPaymentSelector(true)}
                  className={styles.payButton}
                >
                  <i className={`fas fa-credit-card ${dealIconStyles.iconMarginEnd}`}></i>
                  {t('paymentDelivery.payNow')}
                </button>
              ) : (
                <PaymentMethodSelector
                  deal={deal}
                  onPaymentSuccess={handlePaymentSuccess}
                  onPaymentError={handlePaymentError}
                />
              )}
            </div>
          )}
        </div>
        <div className={`${styles.timelineItem} ${isPaymentConfirmed && !isShipped ? styles.active : (isShipped ? styles.completed : '')}`}>
          <h4>{t('paymentDelivery.shipment')}</h4>
          <p>{t('paymentDelivery.status')} {isShipped ? t('paymentDelivery.shipped') : t('paymentDelivery.pendingShipment')}</p>
          {deal.shippingDetails?.trackingNumber && (
            <div className={styles.trackingLinkContainer}>
              <span className={styles.trackingLabel}>{t('paymentDelivery.tracking')}</span>
              <strong>{deal.shippingDetails.trackingNumber}</strong>
              {trackingUrl && (
                <a href={trackingUrl} target="_blank" rel="noopener noreferrer" title={t('paymentDelivery.trackYourShipment')}>
                  {t('paymentDelivery.trackWith')} {deal.shippingDetails.carrier} <i className="fas fa-external-link-alt"></i>
                </a>
              )}
            </div>
          )}
        </div>
        <div className={`${styles.timelineItem} ${isShipped && !isDelivered ? styles.active : (isDelivered ? styles.completed : '')}`}>
          <h4>{t('paymentDelivery.delivery')}</h4>
          <p>{t('paymentDelivery.status')} {deal.status === 'delivery_confirmed' || deal.status === 'completed' ? t('paymentDelivery.delivered') : t('paymentDelivery.awaitingDelivery')}</p>
          {isDelivered && deal.shippingDetails?.deliveredDate && (
            <p><small>{t('paymentDelivery.deliveredOn')} {new Date(deal.shippingDetails.deliveredDate).toLocaleDateString('en-US')}</small></p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentStatusTimeline; 