import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { GATEWAY, apiFetch } from '../lib/api';
import { orderStatusLabel } from '../lib/displayI18n';

type OrderRow = {
  _id: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  items?: { type: string; productId: string; price: number }[];
};

export default function SupplierOrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = localStorage.getItem('userRole');
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (role !== 'supplier') {
      navigate('/auth?redirect=/supplier/orders');
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(`${GATEWAY.order}/supplier/orders`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMsg(typeof j?.error === 'string' ? j.error : `HTTP ${res.status}`);
          return;
        }
        setRows(Array.isArray(j.data) ? j.data : []);
      } catch {
        setMsg(t('supplier.ordersLoadFail'));
      }
    })();
  }, [navigate, role, t]);

  if (role !== 'supplier') {
    return <div className="pt-40 text-center text-ink-soft">{t('supplier.loading')}</div>;
  }

  return (
    <div className="pt-28 pb-24 px-6 max-w-5xl mx-auto min-h-screen">
      <div className="glass-card p-10 space-y-6 animate-fade-in-up">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-ash mb-1">{t('supplier.workspaceBadge')}</p>
          <h1 className="font-serif text-4xl font-light text-ink">{t('supplier.ordersTitle')}</h1>
          <p className="text-sm text-ink-soft mt-2 max-w-2xl">{t('supplier.ordersIntro')}</p>
        </div>
        <Link to="/supplier/portal" className="text-xs uppercase tracking-[0.18em] text-rose-gold-deep hover:underline">
          ← {t('supplier.backToPortal')}
        </Link>
        {msg && <p className="text-sm text-rose-700">{msg}</p>}
        <div className="rounded-2xl border border-cream-200 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-blush-50 text-[10px] uppercase tracking-[0.18em] text-ash">
              <tr>
                <th className="px-4 py-3">{t('supplier.colOrder')}</th>
                <th className="px-4 py-3">{t('supplier.colStatus')}</th>
                <th className="px-4 py-3">{t('supplier.colTotal')}</th>
                <th className="px-4 py-3">{t('supplier.colDate')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {rows.map(o => (
                <tr key={o._id} className="hover:bg-blush-50/40">
                  <td className="px-4 py-3">
                    <Link to={`/supplier/orders/${o._id}`} className="font-mono text-xs text-rose-gold-deep hover:underline">
                      {o._id.slice(-8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink">{orderStatusLabel(t, o.status)}</td>
                  <td className="px-4 py-3">${o.totalAmount?.toLocaleString?.() ?? o.totalAmount}</td>
                  <td className="px-4 py-3 text-ink-soft text-xs">{new Date(o.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !msg && (
            <div className="px-4 py-10 text-center text-xs text-ash">{t('supplier.ordersEmpty')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
