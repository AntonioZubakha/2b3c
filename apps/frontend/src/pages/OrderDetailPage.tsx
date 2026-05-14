import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Clock, MapPin, Package } from '../components/icons';
import { cartItemTypeLabel, orderStatusLabel } from '../lib/displayI18n';
import {
  getOrderTrackingSteps,
  orderDetailProgressHintGroup,
  orderHasBespoke,
} from '../lib/orderTracking';
import { apiJson, GATEWAY, type ApiResponse } from '../lib/api';
import type { OrderDoc } from '../lib/contracts';

const OrderDetailPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError(t('orderDetail.missingOrder'));
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const json = await apiJson<OrderDoc>(
          `${GATEWAY.order}/my-orders/${encodeURIComponent(orderId)}`
        ) as ApiResponse<OrderDoc>;
        if (json.success) {
          setOrder(json.data);
        } else {
          setError(t('orderDetail.loadError'));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'Unauthorized' || msg.includes('401')) {
          navigate(
            `/auth?redirect=${encodeURIComponent(`/account/orders/${orderId}`)}`,
            { replace: true }
          );
          return;
        }
        setError(msg || t('orderDetail.loadError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, navigate, t]);

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'PAID':
      case 'CONFIRMED':
        /* PAID: legacy/admin-only; buyer pay paths set CONFIRMED (see info/FRONTEND.md). */
        return 'text-rose-gold-deep bg-blush-50 border-blush-200';
      case 'SHIPPED':
        return 'text-mauve bg-mauve/10 border-mauve/25';
      case 'DELIVERED':
        return 'text-emerald-700 bg-emerald-50 border-emerald-100';
      default:
        return 'text-ash bg-cream-100 border-cream-200';
    }
  };

  if (loading) {
    return (
      <div className="pt-40 text-center text-ink-soft">{t('orderDetail.loading')}</div>
    );
  }

  if (error || !order) {
    return (
      <div className="pt-32 pb-20 px-6 max-w-2xl mx-auto text-center">
        <Package size={40} className="text-ash mx-auto mb-4" />
        <h1 className="font-serif text-2xl text-ink mb-2">{t('orderDetail.unavailableTitle')}</h1>
        <p className="text-ink-soft mb-8">{error ?? t('orderDetail.notFound')}</p>
        <Link to="/account/orders" className="glass-button px-6 py-3 text-xs uppercase tracking-[0.22em] no-underline">
          {t('orderDetail.backToOrders')}
        </Link>
      </div>
    );
  }

  const addr = order.shippingAddress;
  const trackingSteps = getOrderTrackingSteps(order.status);

  return (
    <div className="pt-32 pb-20 px-6 max-w-3xl mx-auto">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-xs text-ink-soft hover:text-rose-gold-deep mb-8 uppercase tracking-[0.18em]"
      >
        <ArrowLeft size={14} /> {t('orderDetail.back')}
      </button>

      <div className="glass-card overflow-hidden animate-fade-in-up">
        <div className="p-8 border-b border-cream-200 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-medium text-ash uppercase tracking-[0.22em] mb-1">{t('orderDetail.orderRef')}</p>
            <p className="font-mono text-lg text-ink">{order._id}</p>
          </div>
          <span
            className={`self-start px-3 py-1 rounded-full text-[10px] font-medium uppercase tracking-[0.18em] border ${getStatusClass(order.status)}`}
          >
            {orderStatusLabel(t, order.status)}
          </span>
        </div>

        <div className="p-8 border-b border-cream-200 grid sm:grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-medium text-ash uppercase tracking-[0.22em] mb-1">{t('orderDetail.placedOn')}</p>
            <p className="text-sm text-ink">
              {new Date(order.createdAt).toLocaleDateString(i18n.language.startsWith('en') ? 'en-US' : 'ru-RU', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-ash uppercase tracking-[0.22em] mb-1">{t('orderDetail.total')}</p>
            <p className="font-serif text-3xl text-ink">${order.totalAmount.toLocaleString()}</p>
          </div>
        </div>

        <div className="p-8 border-b border-cream-200">
          <h2 className="font-serif text-xl text-ink mb-1">{t('orderDetail.trackingTitle')}</h2>
          <p className="text-xs text-ink-soft leading-relaxed mb-6 max-w-xl">
            {orderHasBespoke(order.items) ? t('orderDetail.trackingContextBespoke') : t('orderDetail.trackingContextReady')}
          </p>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trackingSteps.map((step, idx) => (
              <li
                key={step.id}
                className={`flex gap-3 rounded-xl border px-4 py-3 ${
                  step.current
                    ? 'border-rose-gold-deep bg-blush-50'
                    : step.completed
                      ? 'border-emerald-100 bg-emerald-50/60'
                      : 'border-cream-200 bg-cream-50/40'
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium ${
                    step.current
                      ? 'border-rose-gold-deep text-rose-gold-deep'
                      : step.completed
                        ? 'border-emerald-200 text-emerald-800'
                        : 'border-cream-200 text-ash'
                  }`}
                  aria-current={step.current ? 'step' : undefined}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink leading-snug">{orderStatusLabel(t, step.id)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="p-8 border-b border-cream-200">
          <h2 className="font-serif text-xl text-ink mb-4">{t('orderDetail.items')}</h2>
          <ul className="space-y-3">
            {order.items.map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-4 py-3 px-4 rounded-xl bg-blush-50 border border-cream-200"
              >
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-cream-100 shrink-0">
                  <img src="/assets/diamond_hero.png" alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink">{cartItemTypeLabel(t, item.type)}</p>
                  {item.type === 'bespoke' && item.bespokePair && (
                    <p className="text-[11px] text-ash font-mono truncate">
                      {t('orderDetail.bespokeMeta', {
                        diamond: item.bespokePair.diamondId,
                        setting: item.bespokePair.settingId,
                      })}
                    </p>
                  )}
                  {item.type !== 'bespoke' && (
                    <p className="text-[11px] text-ash font-mono truncate">{item.productId}</p>
                  )}
                </div>
                <p className="text-sm text-ink shrink-0">${item.price.toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-8">
          <h2 className="font-serif text-xl text-ink mb-4 flex items-center gap-2">
            <MapPin size={18} className="text-rose-gold-deep" /> {t('orderDetail.shipping')}
          </h2>
          <div className="text-sm text-ink-soft space-y-1">
            <p className="font-medium text-ink">{addr.fullName}</p>
            <p>{addr.addressLine1}</p>
            <p>
              {addr.city}, {addr.zipCode}
            </p>
            <p>{addr.country}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-soft mt-6">
            <Clock size={12} /> {t(`orderDetail.progressHints.${orderDetailProgressHintGroup(order.status)}`)}
          </div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link to="/account/orders" className="text-xs text-rose-gold-deep hover:text-ink uppercase tracking-[0.22em]">
          {t('orderDetail.allOrders')}
        </Link>
      </div>
    </div>
  );
};

export default OrderDetailPage;
