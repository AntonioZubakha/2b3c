import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import {
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Lock,
  MapPin,
  ShieldCheck,
  Sparkles,
  Truck,
} from '../components/icons';
import { StripePaymentForm } from '../components/StripePaymentForm';
import { cartItemTypeLabel } from '../lib/displayI18n';
import { apiJson, GATEWAY } from '../lib/api';
import { orderKycBlockKind, userVisibleOrderError } from '../lib/orderApiErrors';
import { peekSessionId } from '../lib/session';
import { orderQueryKeys, useCartQuery } from '../lib/orderQuery';
import type { CheckoutResponse, PaymentIntentCreateResponse } from '../lib/contracts';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

const CheckoutPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionId = peekSessionId() ?? '';
  const hasSession = sessionId.length > 0;

  const [step, setStep] = useState<'shipping' | 'payment' | 'success'>('shipping');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [checkoutAlert, setCheckoutAlert] = useState<
    | { type: 'kyc'; kind: 'kyc_required' | 'kyc_unavailable' }
    | { type: 'msg'; message: string }
    | null
  >(null);

  const [address, setAddress] = useState({
    fullName: '',
    street: '',
    city: '',
    postalCode: '',
    country: 'United States',
  });

  const cartQuery = useCartQuery(sessionId, { enabled: hasSession, staleTime: 15_000 });

  useEffect(() => {
    if (!hasSession) {
      navigate('/cart', { replace: true });
      return;
    }
    const c = cartQuery.data;
    if (cartQuery.isSuccess && (!c || c.items.length === 0)) {
      navigate('/cart', { replace: true });
    }
  }, [hasSession, cartQuery.data, cartQuery.isSuccess, navigate]);

  const paymentIntentQuery = useQuery({
    queryKey: ['order', 'payment-intent', orderId],
    queryFn: async ({ signal }) => {
      const res = (await apiJson(`${GATEWAY.order}/orders/${orderId!}/create-payment-intent`, {
        method: 'POST',
        signal,
      })) as PaymentIntentCreateResponse;
      if (!res.success || !res.data?.clientSecret) {
        throw new Error(t('checkout.stripeStartError'));
      }
      return res.data.clientSecret;
    },
    enabled:
      step === 'payment' &&
      Boolean(orderId) &&
      Boolean(stripePublishableKey) &&
      Boolean(stripePromise),
    retry: false,
  });

  const clientSecret = paymentIntentQuery.isSuccess ? paymentIntentQuery.data : null;
  const paymentKycKind = paymentIntentQuery.isError ? orderKycBlockKind(paymentIntentQuery.error) : null;
  const stripeInitError = paymentIntentQuery.isError
    ? paymentKycKind === 'kyc_required'
      ? t('checkout.kycRequiredBody')
      : paymentKycKind === 'kyc_unavailable'
        ? t('checkout.kycUnavailableBody')
        : paymentIntentQuery.error instanceof Error
          ? paymentIntentQuery.error.message
          : t('checkout.paymentInitFailed')
    : null;

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const sid = peekSessionId();
      if (!sid) throw new Error('Missing session');
      const json = (await apiJson<{ orderId: string }>(`${GATEWAY.order}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, shippingAddress: address }),
      })) as CheckoutResponse;
      if (!json.success) {
        throw new Error(
          typeof json.error === 'string' && json.error.length > 0
            ? json.error
            : t('checkout.checkoutFailedGeneric'),
        );
      }
      return json.data.orderId;
    },
    onMutate: () => setCheckoutAlert(null),
    onSuccess: oid => {
      setOrderId(oid);
      setStep('payment');
    },
    onError: (err: unknown) => {
      console.error('Order creation failed:', err);
      const kyc = orderKycBlockKind(err);
      if (kyc) setCheckoutAlert({ type: 'kyc', kind: kyc });
      else setCheckoutAlert({ type: 'msg', message: userVisibleOrderError(t, err, 'checkout.checkoutFailedGeneric') });
    },
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error('Missing order');
      await new Promise(r => setTimeout(r, 600));
      const json = (await apiJson(`${GATEWAY.order}/orders/${orderId}/pay`, {
        method: 'POST',
      })) as { success?: boolean };
      if (!json.success) throw new Error('Payment failed');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderQueryKeys.carts() });
      setStep('success');
    },
    onError: err => console.error('Payment failed:', err),
  });

  const checkoutBusy = checkoutMutation.isPending;
  const payBusy = payMutation.isPending;

  const inputCls =
    'glass-input w-full px-4 py-3.5 text-sm focus:ring-2 focus:ring-[color:var(--rose-gold)]/30';

  const progressSteps = useMemo(
    () =>
      [
        { id: 'shipping' as const, icon: Truck, label: t('checkout.stepLogistics') },
        { id: 'payment' as const, icon: CreditCard, label: t('checkout.stepSettlement') },
        { id: 'success' as const, icon: CheckCircle2, label: t('checkout.stepConfirmation') },
      ] as const,
    [t],
  );

  if (!hasSession) {
    return (
      <div className="pt-40 text-center text-ink-soft animate-pulse">
        {t('checkout.initializing')}
      </div>
    );
  }

  if (cartQuery.isPending) {
    return (
      <div className="pt-40 text-center text-ink-soft animate-pulse">
        {t('checkout.initializing')}
      </div>
    );
  }

  if (cartQuery.isError) {
    return (
      <div className="pt-40 pb-20 px-6 max-w-lg mx-auto text-center space-y-6">
        <p className="text-ink-soft">{t('common.somethingWrong')}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => void cartQuery.refetch()}
            className="glass-button px-8 py-3 text-xs font-medium uppercase tracking-[0.22em]"
          >
            {t('common.retry')}
          </button>
          <Link
            to="/cart"
            className="btn-primary px-8 py-3 text-xs font-medium uppercase tracking-[0.22em] no-underline inline-flex items-center justify-center"
          >
            {t('checkout.backToCart')}
          </Link>
        </div>
      </div>
    );
  }

  if (!cartQuery.data || cartQuery.data.items.length === 0) {
    return (
      <div className="pt-40 text-center text-ink-soft animate-pulse">
        {t('checkout.initializing')}
      </div>
    );
  }

  const cart = cartQuery.data;

  return (
    <div className="pt-32 pb-24 px-6 max-w-5xl mx-auto min-h-screen">
      {/* Progress */}
      <div className="flex items-center justify-center gap-3 mb-16">
        {progressSteps.map((s, i) => {
          const Icon = s.icon;
          return (
            <React.Fragment key={s.id}>
              <div
                className={`flex flex-col items-center gap-2 transition-colors duration-300 ${
                  step === s.id ? 'text-rose-gold-deep' : 'text-ash-soft'
                }`}
              >
                <span
                  className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors duration-300 ${
                    step === s.id
                      ? 'border-[color:var(--rose-gold)] bg-blush-50'
                      : 'border-cream-200 bg-white'
                  }`}
                >
                  <Icon size={18} />
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.22em]">
                  {s.label}
                </span>
              </div>
              {i < 2 && <span className="w-12 h-px bg-cream-200 mb-6" />}
            </React.Fragment>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
        {/* Main */}
        <div className="lg:col-span-2">
          {step === 'shipping' && (
            <div className="glass-card p-10 space-y-8 animate-fade-in">
              {checkoutAlert && (
                <div
                  role="alert"
                  className={`rounded-2xl border px-5 py-4 text-sm leading-relaxed ${
                    checkoutAlert.type === 'kyc'
                      ? 'border-amber-200/90 bg-amber-50/90 text-amber-950/95'
                      : 'border-rose-200/80 bg-rose-50/90 text-ink'
                  }`}
                >
                  {checkoutAlert.type === 'kyc' ? (
                    <>
                      <p className="font-medium text-[11px] uppercase tracking-[0.18em]">
                        {checkoutAlert.kind === 'kyc_required'
                          ? t('checkout.kycRequiredTitle')
                          : t('checkout.kycUnavailableTitle')}
                      </p>
                      <p className="mt-2 text-[13px]">
                        {checkoutAlert.kind === 'kyc_required'
                          ? t('checkout.kycRequiredBody')
                          : t('checkout.kycUnavailableBody')}
                      </p>
                      {checkoutAlert.kind === 'kyc_required' ? (
                        <Link
                          to="/account/security"
                          className="mt-4 inline-flex items-center justify-center w-full py-3 rounded-xl border border-amber-300/80 bg-white/80 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-950 no-underline hover:bg-amber-50/90 transition-colors"
                        >
                          {t('checkout.kycSecurityCta')}
                        </Link>
                      ) : null}
                      {import.meta.env.DEV && checkoutAlert.kind === 'kyc_required' ? (
                        <p className="mt-3 text-[11px] text-amber-900/80 font-mono">{t('checkout.kycDevHint')}</p>
                      ) : null}
                    </>
                  ) : (
                    <p>{checkoutAlert.message}</p>
                  )}
                </div>
              )}
              <h2 className="font-serif text-4xl font-light text-ink">{t('checkout.deliveryTitle')}</h2>
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-ash uppercase tracking-[0.22em]">
                    {t('checkout.fullLegalName')}
                  </label>
                  <input
                    type="text"
                    value={address.fullName}
                    onChange={e => setAddress({ ...address, fullName: e.target.value })}
                    placeholder={t('checkout.namePlaceholder')}
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-ash uppercase tracking-[0.22em]">
                    {t('checkout.street')}
                  </label>
                  <div className="relative">
                    <MapPin
                      size={16}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-ash"
                    />
                    <input
                      type="text"
                      value={address.street}
                      onChange={e => setAddress({ ...address, street: e.target.value })}
                      placeholder={t('checkout.streetPlaceholder')}
                      className={`${inputCls} pl-11`}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-ash uppercase tracking-[0.22em]">
                      {t('checkout.city')}
                    </label>
                    <input
                      type="text"
                      value={address.city}
                      onChange={e => setAddress({ ...address, city: e.target.value })}
                      placeholder={t('checkout.cityPlaceholder')}
                      className={inputCls}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-ash uppercase tracking-[0.22em]">
                      {t('checkout.postal')}
                    </label>
                    <input
                      type="text"
                      value={address.postalCode}
                      onChange={e => setAddress({ ...address, postalCode: e.target.value })}
                      placeholder={t('checkout.postalPlaceholder')}
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => checkoutMutation.mutate()}
                disabled={!address.fullName || !address.street || checkoutBusy}
                className="btn-primary w-full py-5 text-sm font-medium uppercase tracking-[0.22em] flex items-center justify-center gap-3"
              >
                {checkoutBusy ? t('checkout.initializingBtn') : t('checkout.proceedSettlement')}{' '}
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {step === 'payment' && (
            <div className="glass-card p-10 space-y-8 animate-fade-in-up">
              <div className="flex justify-between items-end gap-6 flex-wrap">
                <h2 className="font-serif text-4xl font-light text-ink leading-none">{t('checkout.settlementTitle')}</h2>
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-ash">
                  <span className="px-2 py-1 rounded-md bg-cream-100 text-ink-soft">Visa</span>
                  <span className="px-2 py-1 rounded-md bg-cream-100 text-ink-soft">MC</span>
                  <span className="px-2 py-1 rounded-md bg-cream-100 text-ink-soft">Amex</span>
                </div>
              </div>

              {stripePromise && clientSecret ? (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: {
                      theme: 'stripe',
                      variables: {
                        colorPrimary: '#9d6b53',
                        borderRadius: '12px',
                        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                      },
                    },
                  }}
                >
                  <StripePaymentForm
                    orderId={orderId!}
                    amountLabel={`$${cart.totalAmount.toLocaleString()}`}
                    onComplete={() => {
                      void queryClient.invalidateQueries({ queryKey: orderQueryKeys.carts() });
                      setStep('success');
                    }}
                  />
                </Elements>
              ) : stripePublishableKey && !clientSecret ? (
                <div className="space-y-5">
                  <p className="text-sm text-ink-soft">
                    {stripeInitError
                      ? stripeInitError
                      : t('checkout.stripePrepare')}
                  </p>
                  {paymentKycKind === 'kyc_required' ? (
                    <Link
                      to="/account/security"
                      className="inline-flex items-center justify-center w-full py-3 rounded-xl border border-amber-200 bg-amber-50/90 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-950 no-underline hover:bg-amber-100 transition-colors"
                    >
                      {t('checkout.kycSecurityCta')}
                    </Link>
                  ) : null}
                  {!stripeInitError && (
                    <div className="h-12 w-full rounded-xl bg-cream-100 animate-pulse" />
                  )}
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-5 py-4 text-[11px] text-amber-950/90 leading-relaxed">
                    <strong className="font-medium tracking-wide uppercase text-[10px]">
                      {t('checkout.devModeTitle')}
                    </strong>
                    <p className="mt-2">{t('checkout.devModeBody')}</p>
                  </div>

                  <div className="space-y-6">
                    <div className="glass-card p-8 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-8 opacity-15 text-rose-gold-deep group-hover:scale-110 transition-transform">
                        <CreditCard size={48} />
                      </div>
                      <div className="space-y-6 relative z-10 opacity-60 pointer-events-none">
                        <div className="space-y-2">
                          <label className="text-[10px] font-medium uppercase tracking-[0.22em] text-ash">
                            {t('checkout.cardPreviewDisabled')}
                          </label>
                          <div className="w-full border-b border-cream-200 py-2 text-xl font-mono tracking-widest text-ink-soft">
                            •••• •••• •••• ••••
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-start gap-3 p-4 rounded-2xl bg-blush-50 border border-blush-200">
                <ShieldCheck size={18} className="text-rose-gold-deep flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-ink-soft leading-relaxed">
                  {stripePromise && clientSecret ? t('checkout.stripeSecure') : t('checkout.simSecure')}
                </p>
              </div>

              {(() => {
                const stripeReady = Boolean(stripePromise && clientSecret);
                const stripeLoading =
                  Boolean(stripePublishableKey) &&
                  !clientSecret &&
                  !stripeInitError &&
                  (paymentIntentQuery.isPending || paymentIntentQuery.isFetching);
                if (stripeReady || stripeLoading) return null;
                return (
                  <button
                    type="button"
                    onClick={() => payMutation.mutate()}
                    disabled={payBusy}
                    className="btn-primary w-full py-5 text-sm font-medium uppercase tracking-[0.22em] flex items-center justify-center gap-3"
                  >
                    {payBusy
                      ? t('checkout.securing')
                      : stripeInitError
                        ? t('checkout.simPay', { amount: cart.totalAmount.toLocaleString() })
                        : t('checkout.testPay', { amount: cart.totalAmount.toLocaleString() })}{' '}
                    <ChevronRight size={16} />
                  </button>
                );
              })()}
            </div>
          )}

          {step === 'success' && (
            <div className="glass-card p-12 text-center space-y-10 animate-fade-in-up">
              <div className="relative inline-block">
                <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100 mx-auto">
                  <CheckCircle2 size={44} className="text-emerald-700" />
                </div>
                <div className="absolute -top-1 -right-1 animate-bounce text-rose-gold-deep">
                  <Sparkles size={20} />
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="font-serif text-5xl font-light text-ink">
                  {t('checkout.acquisitionTitle')}{' '}
                  <span className="text-emerald-700 italic">{t('checkout.acquisitionComplete')}</span>
                </h2>
                <p className="text-ink-soft max-w-sm mx-auto">
                  {t('checkout.successBody', { id: orderId?.substring(0, 8) ?? '' })}
                </p>
              </div>

              <div className="pt-6 border-t border-cream-200 grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => navigate('/marketplace')}
                  className="glass-button px-6 py-4 text-xs font-medium uppercase tracking-[0.22em]"
                >
                  {t('checkout.continueBrowsing')}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/account/vault')}
                  className="btn-primary px-6 py-4 text-xs font-medium uppercase tracking-[0.22em]"
                >
                  {t('checkout.accessVault')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6 animate-fade-in-up animate-delay-100">
          <div className="glass-card p-7">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ash mb-5">
              {t('checkout.manifestSummary')}
            </h3>
            <div className="space-y-4">
              {cart.items.map((item, i: number) => (
                <div key={i} className="flex justify-between items-start gap-4">
                  <div className="flex gap-3">
                    <div className="w-12 h-12 rounded-lg bg-blush-50 border border-cream-200 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-ink">{cartItemTypeLabel(t, item.type)}</div>
                      <div className="text-[10px] text-ash uppercase tracking-[0.18em]">
                        {t('checkout.qty')}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-ink">
                    ${item.price.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-5 border-t border-cream-200 space-y-2.5">
              <div className="flex justify-between text-xs text-ink-soft">
                <span>{t('cart.subtotal')}</span>
                <span>${cart.totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs text-emerald-700">
                <span>{t('checkout.expressLogistics')}</span>
                <span>{t('checkout.compFree')}</span>
              </div>
              <div className="petal-divider mt-2" />
              <div className="flex justify-between font-serif text-2xl text-ink pt-1">
                <span>{t('checkout.total')}</span>
                <span>${cart.totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 bg-blush-50 border-blush-200">
            <div className="flex items-center gap-3 mb-3">
              <Lock size={14} className="text-rose-gold-deep" />
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
                {t('checkout.trustTitle')}
              </span>
            </div>
            <p className="text-[11px] text-ink-soft leading-relaxed">{t('checkout.trustBody')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
