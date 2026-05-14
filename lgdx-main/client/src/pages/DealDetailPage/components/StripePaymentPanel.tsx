import React, { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { useTranslation } from '../../../i18n';
import { Deal } from '../../../types';
import { createStripePaymentIntent, getStripePublishableKey, checkPaymentStatus } from '../../../api/stripeApi';
import styles from './StripePaymentPanel.module.css';
import dealIconStyles from '../DealDetailIconSpacing.module.css';

interface StripePaymentPanelProps {
  deal: Deal;
  onPaymentSuccess: () => void;
  onPaymentError: (error: string) => void;
}

// Компонент формы оплаты
const PaymentForm: React.FC<{
  deal: Deal;
  onPaymentSuccess: () => void;
  onPaymentError: (error: string) => void;
}> = ({ deal, onPaymentSuccess, onPaymentError }) => {
  const { t, formatCurrency } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [cardholderName, setCardholderName] = useState('');
  const [cardErrors, setCardErrors] = useState<{
    cardNumber?: string;
    cardExpiry?: string;
    cardCvc?: string;
  }>({});

  useEffect(() => {
    // Создаем Payment Intent при загрузке компонента
    const createPaymentIntent = async () => {
      try {
        const paymentIntent = await createStripePaymentIntent(deal._id, {
          amount: deal.amount,
          currency: 'usd'
        });
        setClientSecret(paymentIntent.clientSecret);
      } catch (error) {
        onPaymentError(t('stripePayment.failedToInitializePayment'));
      }
    };

    createPaymentIntent();
  }, [deal._id, deal.amount, onPaymentError, t]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      return;
    }

    if (!cardholderName.trim()) {
      onPaymentError(t('stripePayment.pleaseEnterCardholderName'));
      return;
    }

    setIsProcessing(true);

    try {
      const cardNumberElement = elements.getElement(CardNumberElement);
      const cardExpiryElement = elements.getElement(CardExpiryElement);
      const cardCvcElement = elements.getElement(CardCvcElement);

      if (!cardNumberElement || !cardExpiryElement || !cardCvcElement) {
        throw new Error('Card elements not found');
      }

      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardNumberElement,
          billing_details: {
            name: cardholderName.trim(),
          },
        }
      });

      if (error) {
        onPaymentError(error.message || t('stripePayment.paymentFailed'));
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Проверяем статус платежа и обновляем статус сделки
        try {
          await checkPaymentStatus(deal._id);
          onPaymentSuccess();
        } catch (error) {
          // Даже если проверка статуса не удалась, платеж прошел успешно
          onPaymentSuccess();
        }
      }
    } catch (error) {
      onPaymentError(t('stripePayment.paymentFailedTryAgain'));
    } finally {
      setIsProcessing(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: 'var(--color-text-primary)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontWeight: '400',
        lineHeight: '1.5',
        '::placeholder': {
          color: 'var(--color-text-secondary)',
        },
        backgroundColor: 'var(--color-surface-primary)',
        padding: '12px 16px',
      },
      invalid: {
        color: 'var(--color-danger)',
      },
      complete: {
        color: 'var(--color-success)',
      },
    },
    hidePostalCode: true,
    disabled: false,
  };

  return (
    <form onSubmit={handleSubmit} className={styles.paymentForm}>
      <div className={styles.cardFormContainer}>
        <label className={styles.label}>{t('stripePayment.cardholderName')}</label>
        <input
          type="text"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          placeholder={t('stripePayment.cardholderNamePlaceholder')}
          className={styles.cardholderInput}
          required
        />
      </div>

      <div className={styles.cardFormContainer}>
        <label className={styles.label}>{t('stripePayment.cardNumber')}</label>
        <div className={styles.cardElementWrapper}>
          <CardNumberElement
            options={cardElementOptions}
            onChange={(event) => {
              setCardErrors(prev => ({
                ...prev,
                cardNumber: event.error?.message
              }));
            }}
          />
        </div>
        {cardErrors.cardNumber && (
          <div className={styles.errorMessage}>{cardErrors.cardNumber}</div>
        )}
      </div>

      <div className={styles.cardRow}>
        <div className={styles.cardFormContainer}>
          <label className={styles.label}>{t('stripePayment.expiryDate')}</label>
          <div className={styles.cardElementWrapper}>
            <CardExpiryElement
              options={cardElementOptions}
              onChange={(event) => {
                setCardErrors(prev => ({
                  ...prev,
                  cardExpiry: event.error?.message
                }));
              }}
            />
          </div>
          {cardErrors.cardExpiry && (
            <div className={styles.errorMessage}>{cardErrors.cardExpiry}</div>
          )}
        </div>

        <div className={styles.cardFormContainer}>
          <label className={styles.label}>{t('stripePayment.cvc')}</label>
          <div className={styles.cardElementWrapper}>
            <CardCvcElement
              options={cardElementOptions}
              onChange={(event) => {
                setCardErrors(prev => ({
                  ...prev,
                  cardCvc: event.error?.message
                }));
              }}
            />
          </div>
          {cardErrors.cardCvc && (
            <div className={styles.errorMessage}>{cardErrors.cardCvc}</div>
          )}
        </div>
      </div>
      
      <div className={styles.paymentSummary}>
        <div className={styles.amountRow}>
          <span>{t('stripePayment.amount')}</span>
          <span className={styles.amount}>{formatCurrency(deal.amount, 'USD')}</span>
        </div>
        <div className={styles.feeRow}>
          <span>{t('stripePayment.processingFee')}</span>
          <span className={styles.fee}>{formatCurrency(deal.amount * 0.029, 'USD')}</span>
        </div>
        <div className={styles.totalRow}>
          <span>{t('stripePayment.total')}</span>
          <span className={styles.total}>{formatCurrency(deal.amount * 1.029, 'USD')}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className={styles.payButton}
      >
        {isProcessing ? t('stripePayment.processing') : `${t('stripePayment.pay')} ${formatCurrency(deal.amount * 1.029, 'USD')}`}
      </button>
    </form>
  );
};

// Основной компонент панели оплаты
const StripePaymentPanel: React.FC<StripePaymentPanelProps> = ({
  deal,
  onPaymentSuccess,
  onPaymentError
}) => {
  const { t } = useTranslation();
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeStripe = async () => {
      try {
        const publishableKey = await getStripePublishableKey();
        setStripePromise(loadStripe(publishableKey));
      } catch (error) {
        onPaymentError(t('stripePayment.failedToLoadPaymentSystem'));
      } finally {
        setIsLoading(false);
      }
    };

    initializeStripe();
  }, [onPaymentError, t]);

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>{t('stripePayment.loadingPaymentSystem')}</p>
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className={styles.errorContainer}>
        <p>{t('stripePayment.failedToLoadPaymentSystem')}</p>
      </div>
    );
  }

  return (
    <div className={styles.stripePaymentPanel}>
      <div className={styles.header}>
        <h5><i className={`fas fa-credit-card ${dealIconStyles.iconMarginEnd}`}></i>{t('stripePayment.payWithCard')}</h5>
        <p className={styles.description}>
          {t('stripePayment.description')}
        </p>
      </div>

      <Elements stripe={stripePromise}>
        <PaymentForm
          deal={deal}
          onPaymentSuccess={onPaymentSuccess}
          onPaymentError={onPaymentError}
        />
      </Elements>

      <div className={styles.securityInfo}>
        <p><i className={`fas fa-shield-alt ${dealIconStyles.iconMarginEndSm}`}></i> {t('stripePayment.yourPaymentInformationSecure')}</p>
        <p><i className={`fas fa-lock ${dealIconStyles.iconMarginEndSm}`}></i> {t('stripePayment.weNeverStoreCardDetails')}</p>
      </div>
    </div>
  );
};

export default StripePaymentPanel;
