import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { catalogSupplierIdForCompany } from '@stonee/shared-types';
import { GATEWAY } from '../lib/api';

type Row = {
  _id: string;
  sku?: string;
  shape?: string;
  carat?: number;
  price?: number;
  availability?: string;
};

export default function SupplierInventoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = localStorage.getItem('userRole');
  const token = localStorage.getItem('token');
  const [storageTick, setStorageTick] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fn = () => setStorageTick(x => x + 1);
    window.addEventListener('storage', fn);
    return () => window.removeEventListener('storage', fn);
  }, []);

  useEffect(() => {
    if (!token || role !== 'supplier') {
      navigate('/auth?redirect=/supplier/inventory');
      return;
    }
    const companyId = localStorage.getItem('supplierCompanyId') || '';
    if (!companyId) {
      navigate('/auth?redirect=/supplier/inventory');
      return;
    }
    const supplierCatalogId = catalogSupplierIdForCompany(companyId);
    let cancelled = false;
    (async () => {
      setMsg(null);
      setLoading(true);
      try {
        const q = new URLSearchParams({
          supplierId: supplierCatalogId,
          limit: '150',
          sort: 'createdAt-desc',
        });
        const res = await fetch(`${GATEWAY.catalog}/?${q.toString()}`);
        const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Row[]; error?: string };
        if (!res.ok || !j.success) {
          if (!cancelled) {
            setMsg(typeof j.error === 'string' ? j.error : t('supplier.inventoryLoadFail'));
            setRows([]);
          }
          return;
        }
        if (!cancelled) setRows(Array.isArray(j.data) ? j.data : []);
      } catch {
        if (!cancelled) {
          setMsg(t('supplier.inventoryLoadFail'));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, role, storageTick, t, token]);

  if (!token || role !== 'supplier') {
    return <div className="pt-40 text-center text-ink-soft">{t('supplier.loading')}</div>;
  }

  return (
    <div className="pt-28 pb-24 px-6 max-w-5xl mx-auto min-h-screen">
      <div className="glass-card p-10 space-y-6 animate-fade-in-up">
        <Link to="/supplier/portal" className="text-xs uppercase tracking-[0.18em] text-rose-gold-deep hover:underline">
          ← {t('supplier.backToPortal')}
        </Link>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-ash mb-1">{t('supplier.workspaceBadge')}</p>
          <h1 className="font-serif text-4xl font-light text-ink">{t('supplier.inventoryTitle')}</h1>
          <p className="text-sm text-ink-soft mt-2 max-w-2xl">{t('supplier.inventoryIntro')}</p>
        </div>
        {msg && <p className="text-sm text-rose-700">{msg}</p>}
        <div className="rounded-2xl border border-cream-200 overflow-hidden">
          {loading ? (
            <div className="px-4 py-10 text-center text-xs text-ash">{t('supplier.inventoryLoading')}</div>
          ) : (
            <>
              <table className="w-full text-left text-sm">
                <thead className="bg-blush-50 text-[10px] uppercase tracking-[0.18em] text-ash">
                  <tr>
                    <th className="px-4 py-3">{t('supplier.inventoryColSku')}</th>
                    <th className="px-4 py-3">{t('supplier.inventoryColShape')}</th>
                    <th className="px-4 py-3">{t('supplier.inventoryColCarat')}</th>
                    <th className="px-4 py-3">{t('supplier.inventoryColPrice')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-200">
                  {rows.map(r => (
                    <tr key={r._id} className="hover:bg-blush-50/40">
                      <td className="px-4 py-3 font-mono text-xs text-ink">{r.sku ?? '—'}</td>
                      <td className="px-4 py-3 text-ink-soft">{r.shape ?? '—'}</td>
                      <td className="px-4 py-3 text-ink-soft">{r.carat != null ? String(r.carat) : '—'}</td>
                      <td className="px-4 py-3 text-ink">
                        {r.price != null ? `$${Number(r.price).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/diamond/${r._id}`}
                          className="text-[10px] uppercase tracking-[0.18em] text-rose-gold-deep hover:underline"
                        >
                          {t('supplier.inventoryOpen')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && !msg && (
                <div className="px-4 py-10 text-center text-xs text-ash">{t('supplier.inventoryEmpty')}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
