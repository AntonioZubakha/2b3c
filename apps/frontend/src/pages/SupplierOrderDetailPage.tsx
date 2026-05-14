import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GATEWAY, apiFetch } from '../lib/api';
import { orderStatusLabel } from '../lib/displayI18n';

export default function SupplierOrderDetailPage() {
  const { t } = useTranslation();
  const { orderId } = useParams();
  const navigate = useNavigate();
  const role = localStorage.getItem('userRole');
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (role !== 'supplier' || !orderId) {
      navigate('/auth?redirect=/supplier/orders');
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(`${GATEWAY.order}/supplier/orders/${encodeURIComponent(orderId)}`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMsg(typeof j?.error === 'string' ? j.error : `HTTP ${res.status}`);
          return;
        }
        setOrder((j.data as Record<string, unknown>) ?? null);
      } catch {
        setMsg(t('supplier.orderLoadFail'));
      }
    })();
  }, [navigate, orderId, role, t]);

  if (role !== 'supplier') {
    return <div className="pt-40 text-center text-ink-soft">{t('supplier.loading')}</div>;
  }

  return (
    <div className="pt-28 pb-24 px-6 max-w-3xl mx-auto min-h-screen">
      <div className="glass-card p-10 space-y-6 animate-fade-in-up">
        <Link to="/supplier/orders" className="text-xs uppercase tracking-[0.18em] text-rose-gold-deep hover:underline">
          ← {t('supplier.backToOrders')}
        </Link>
        {msg && <p className="text-sm text-rose-700">{msg}</p>}
        {order && (
          <div className="space-y-4">
            <h1 className="font-serif text-3xl font-light text-ink">{t('supplier.orderDetailTitle')}</h1>
            <p className="text-sm text-ink-soft">
              {orderStatusLabel(t, String(order.status))} · ${Number(order.totalAmount).toLocaleString()}
            </p>
            <pre className="text-[11px] font-mono bg-cream-50 rounded-xl p-4 overflow-x-auto border border-cream-200">
              {JSON.stringify(order, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
