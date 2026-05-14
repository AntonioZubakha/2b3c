/** Customer atelier — order list. Details use `<Link>` to `/account/orders/:id` (no useNavigate here). */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Clock, ExternalLink, Package } from '../components/icons';
import { Link } from 'react-router-dom';
import { cartItemTypeLabel, orderStatusLabel } from '../lib/displayI18n';
import { orderListHintGroup } from '../lib/orderTracking';
import { apiJson, GATEWAY } from '../lib/api';
import type { OrderDoc, OrdersListResponse } from '../lib/contracts';

const OrdersPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const json = (await apiJson<OrderDoc[]>(`${GATEWAY.order}/my-orders`)) as OrdersListResponse;
      if (json.success) setOrders(json.data);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'PAID':
      case 'CONFIRMED':
        /* PAID: legacy/admin-only; Stripe + simulated pay finalize to CONFIRMED (see info/API.md). */
        return 'text-rose-gold-deep bg-blush-50 border-blush-200';
      case 'SHIPPED':
        return 'text-mauve bg-mauve/10 border-mauve/25';
      case 'DELIVERED':
        return 'text-emerald-700 bg-emerald-50 border-emerald-100';
      default:
        return 'text-ash bg-cream-100 border-cream-200';
    }
  };

  if (loading)
    return (
      <div className="pt-40 text-center text-ink-soft">{t('orders.loading')}</div>
    );

  return (
    <div className="pt-32 pb-20 px-6 max-w-5xl mx-auto">
      <div className="mb-16 animate-fade-in">
        <h1 className="font-serif text-5xl md:text-6xl font-light mb-3 text-ink">
          {t('orders.title')} <span className="text-gradient italic">{t('orders.titleItalic')}</span>
        </h1>
        <p className="text-ink-soft">{t('orders.subtitle')}</p>
      </div>

      {orders.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Package size={42} className="text-ash-soft mx-auto mb-6" />
          <h2 className="font-serif text-2xl text-ink mb-2">{t('orders.emptyTitle')}</h2>
          <p className="text-ink-soft mb-8">{t('orders.emptySubtitle')}</p>
          <Link
            to="/marketplace"
            className="glass-button px-8 py-3 text-xs font-medium uppercase tracking-[0.22em] no-underline"
          >
            {t('orders.beginCreation')}
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order, idx) => (
            <div
              key={order._id}
              className="glass-card group overflow-hidden animate-fade-in-up"
              style={{ animationDelay: `${idx * 120}ms` }}
            >
              <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between gap-8 border-b border-cream-200">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-ash uppercase tracking-[0.22em]">
                    {t('orders.orderRef')}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-base text-ink uppercase">
                      {order._id.substring(0, 8)}…
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-medium uppercase tracking-[0.18em] border ${getStatusClass(order.status)}`}
                    >
                      {orderStatusLabel(t, order.status)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col md:items-end gap-1">
                  <span className="text-[10px] font-medium text-ash uppercase tracking-[0.22em]">
                    {t('orders.datePlaced')}
                  </span>
                  <div className="text-sm text-ink-soft">
                    {new Date(order.createdAt).toLocaleDateString(i18n.language.startsWith('en') ? 'en-US' : 'ru-RU', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                </div>

                <div className="flex flex-col md:items-end gap-1">
                  <span className="text-[10px] font-medium text-ash uppercase tracking-[0.22em]">
                    {t('orders.total')}
                  </span>
                  <div className="font-serif text-2xl text-ink">
                    ${order.totalAmount.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="p-8">
                <div className="flex flex-wrap gap-3 mb-4">
                  {order.items.map((item, i: number) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-2 px-3 rounded-xl bg-blush-50 border border-cream-200"
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-cream-100">
                        <img
                          src="/assets/diamond_hero.png"
                          className="w-full h-full object-cover"
                          alt={t('orders.itemAlt')}
                        />
                      </div>
                      <div className="text-xs">
                        <p className="font-medium text-ink">{cartItemTypeLabel(t, item.type)}</p>
                        <p className="text-ash">${item.price.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-4">
                  <div className="flex items-center gap-2 text-xs text-ink-soft max-w-[70%]">
                    <Clock size={12} className="shrink-0" />
                    <span>{t(`orders.listHints.${orderListHintGroup(order.status)}`)}</span>
                  </div>
                  <Link
                    to={`/account/orders/${encodeURIComponent(String(order._id))}`}
                    className="flex items-center gap-2 text-[10px] font-medium text-rose-gold-deep group-hover:text-ink transition-colors uppercase tracking-[0.22em] no-underline"
                  >
                    {t('orders.viewDetails')} <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-16 p-10 glass-card flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="font-serif text-2xl text-ink mb-1">{t('orders.helpTitle')}</h3>
          <p className="text-ink-soft text-sm">{t('orders.helpSubtitle')}</p>
        </div>
        <button
          type="button"
          className="glass-button px-7 py-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em]"
        >
          {t('orders.contactConcierge')} <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
};

export default OrdersPage;
