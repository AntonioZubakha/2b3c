import React, { useState } from 'react';
import { useTranslation } from '../../../i18n';
import { Deal, Company } from '../../../types';
import StripePaymentPanel from './StripePaymentPanel';
import styles from './PaymentMethodSelector.module.css';
import dealIconStyles from '../DealDetailIconSpacing.module.css';

interface PaymentMethodSelectorProps {
  deal: Deal;
  onPaymentSuccess: () => void;
  onPaymentError: (error: string) => void;
}

type PaymentMethod = 'stripe' | 'bank_transfer';

// Extract the seller company's Stripe toggle. The seller on buyer-to-lgdeal
// deals is LGDeal INC, so this reads LGDeal INC's paymentSettings.stripeEnabled.
// Default behaviour: Stripe is enabled unless the flag is explicitly `false`.
const resolveStripeAvailability = (deal: Deal): boolean => {
  const sellerCompany = deal.sellerCompanyId;
  if (sellerCompany && typeof sellerCompany === 'object') {
    const flag = (sellerCompany as Company)?.paymentSettings?.stripeEnabled;
    if (flag === false) return false;
  }
  return true;
};

const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  deal,
  onPaymentSuccess,
  onPaymentError
}) => {
  const { t, formatCurrency } = useTranslation();
  const stripeAvailable = resolveStripeAvailability(deal);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    stripeAvailable ? 'stripe' : 'bank_transfer'
  );

  const handleMethodChange = (method: PaymentMethod) => {
    setSelectedMethod(method);
  };

  return (
    <div className={styles.paymentMethodSelector}>
      <div className={styles.header}>
        <h4><i className={`fas fa-credit-card ${dealIconStyles.iconMarginEnd}`}></i>{t('paymentDelivery.choosePaymentMethod')}</h4>
        <p>{t('paymentDelivery.selectPaymentMethod')}</p>
      </div>

      <div className={styles.methodSelector}>
        {stripeAvailable && (
          <div className={styles.methodOption}>
            <input
              type="radio"
              id="stripe"
              name="paymentMethod"
              value="stripe"
              checked={selectedMethod === 'stripe'}
              onChange={() => handleMethodChange('stripe')}
              className={styles.radioInput}
            />
            <label htmlFor="stripe" className={styles.methodLabel}>
              <div className={styles.methodHeader}>
                <i className="fas fa-credit-card"></i>
                <span>{t('stripePayment.payWithCard')}</span>
                <span className={styles.badge}>{t('paymentDelivery.instant')}</span>
              </div>
              <div className={styles.methodDescription}>
                <p>• {t('paymentDelivery.securePaymentCard')}</p>
                <p>• {t('paymentDelivery.instantConfirmation')}</p>
                <p>• {t('stripePayment.processingFee')}</p>
              </div>
            </label>
          </div>
        )}

        <div className={styles.methodOption}>
          <input
            type="radio"
            id="bank_transfer"
            name="paymentMethod"
            value="bank_transfer"
            checked={selectedMethod === 'bank_transfer'}
            onChange={() => handleMethodChange('bank_transfer')}
            className={styles.radioInput}
          />
          <label htmlFor="bank_transfer" className={styles.methodLabel}>
            <div className={styles.methodHeader}>
              <i className="fas fa-university"></i>
              <span>{t('paymentDelivery.bankTransfer')}</span>
              <span className={styles.badge}>{t('paymentDelivery.manual')}</span>
            </div>
            <div className={styles.methodDescription}>
              <p>• {t('paymentDelivery.traditionalBankTransfer')}</p>
              <p>• {t('paymentDelivery.manualConfirmationLgdeal')}</p>
              <p>• {t('paymentDelivery.noProcessingFees')}</p>
            </div>
          </label>
        </div>
      </div>

      {!stripeAvailable && (
        <div className={styles.stripeUnavailableNote}>
          <i className={`fas fa-info-circle ${dealIconStyles.iconMarginEndSm}`}></i>
          {t('paymentDelivery.stripeUnavailable')}
        </div>
      )}

      <div className={styles.paymentContainer}>
        {stripeAvailable && selectedMethod === 'stripe' && (
          <StripePaymentPanel
            deal={deal}
            onPaymentSuccess={onPaymentSuccess}
            onPaymentError={onPaymentError}
          />
        )}

        {selectedMethod === 'bank_transfer' && (
          <div className={styles.bankTransferInfo}>
            <div className={styles.infoHeader}>
              <h5><i className={`fas fa-info-circle ${dealIconStyles.iconMarginEnd}`}></i>{t('paymentDelivery.bankTransferInstructions')}</h5>
            </div>
            
            <div className={styles.instructions}>
              <p>{t('paymentDelivery.completePaymentViaBankTransfer')}</p>
              <ol>
                <li>{t('paymentDelivery.downloadInvoiceButton')}</li>
                <li>{t('paymentDelivery.transferExactAmount')}</li>
                <li>{t('paymentDelivery.includeDealNumber', { dealNumber: deal.dealNumber })}</li>
                <li>{t('paymentDelivery.lgdealConfirmPayment')}</li>
              </ol>
            </div>

            <div className={styles.amountInfo}>
              <div className={styles.amountRow}>
                <span>{t('paymentDelivery.amountToPay')}</span>
                <span className={styles.amount}>{formatCurrency(deal.amount)}</span>
              </div>
              <div className={styles.note}>
                <i className={`fas fa-info-circle ${dealIconStyles.iconMarginEndSm}`}></i>
                {t('paymentDelivery.noAdditionalFeesBankTransfer')}
              </div>
            </div>

            <div className={styles.actions}>
              <button
                onClick={() => {
                  // Trigger invoice download
                  const link = document.createElement('a');
                  link.href = `/api/deal/${deal._id}/invoice/download`;
                  link.download = `invoice-${deal.dealNumber}.pdf`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className={styles.downloadButton}
              >
                <i className={`fas fa-download ${dealIconStyles.iconMarginEnd}`}></i>
                {t('paymentDelivery.downloadInvoice')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentMethodSelector;
