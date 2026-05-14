import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { ChevronRight } from './icons';
import { apiJson, GATEWAY } from '../lib/api';

type Props = {
  orderId: string;
  amountLabel: string;
  onComplete: () => void;
};

export const StripePaymentForm: React.FC<Props> = ({ orderId, amountLabel, onComplete }) => {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setMsg(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/checkout`,
      },
    });

    if (error) {
      setMsg(error.message ?? t('stripe.paymentFailed'));
      setBusy(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      try {
        await apiJson(`${GATEWAY.order}/orders/${orderId}/confirm-stripe-payment`, { method: 'POST' });
        onComplete();
      } catch (err) {
        setMsg(err instanceof Error ? err.message : t('stripe.confirmFailed'));
      }
    }

    setBusy(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-2xl border border-cream-200 bg-white/80 p-6 shadow-sm ring-1 ring-black/[0.03]">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      {msg ? <p className="text-sm text-red-800/90">{msg}</p> : null}
      <button
        type="submit"
        disabled={!stripe || busy}
        className="btn-primary w-full py-5 text-sm font-medium uppercase tracking-[0.22em] flex items-center justify-center gap-3 disabled:opacity-50"
      >
        {busy ? t('stripe.processing') : t('stripe.payCta', { amount: amountLabel })}
        <ChevronRight size={16} />
      </button>
    </form>
  );
};
