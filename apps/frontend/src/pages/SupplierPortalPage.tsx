import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Package, Sparkles, Truck } from '../components/icons';
import { GATEWAY, apiFetch } from '../lib/api';
import type { SupplierCategory } from '@stonee/shared-types';

const EMPTY_DIAMONDS_JSON = `[]`;

type RegistryResponse = {
  success: boolean;
  data?: {
    feeds: { id: string; label: string; method: string; path: string; product: string }[];
    auth: string;
  };
};

type CompanyRow = { id: string; name: string };

type SelfSummaryData = {
  supplierCompanyId: string;
  catalogSupplierId?: string | null;
  canSyncDiamondAtelier?: boolean;
  diamondAtelierFeed?: {
    lastFinishedAt?: string;
    lastStatus?: string;
    lastRecordCount?: number;
  } | null;
};

const selectClass =
  'glass-input w-full px-4 py-3 text-sm focus:ring-2 focus:ring-[color:var(--rose-gold)]/30 cursor-pointer';

const SupplierPortalPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [registry, setRegistry] = useState<RegistryResponse['data'] | null>(null);
  const [ingestJson, setIngestJson] = useState(EMPTY_DIAMONDS_JSON);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);
  const [atelierBusy, setAtelierBusy] = useState(false);
  const [atelierMsg, setAtelierMsg] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState('');
  const [selfSummary, setSelfSummary] = useState<SelfSummaryData | null>(null);
  const role = localStorage.getItem('userRole');
  const category = (localStorage.getItem('supplierCategory') || 'general') as SupplierCategory;
  const label = t(`auth.supplierCat_${category}` as never);

  useEffect(() => {
    if (role !== 'supplier') {
      navigate('/auth?redirect=/supplier/portal');
      return;
    }
    try {
      const raw = localStorage.getItem('supplierCompanies');
      if (raw) {
        const list = JSON.parse(raw) as CompanyRow[];
        if (Array.isArray(list) && list.length > 0) {
          setCompanies(list);
          const stored = localStorage.getItem('supplierCompanyId');
          const picked = stored && list.some(c => c.id === stored) ? stored : list[0].id;
          setActiveCompanyId(picked);
          if (picked !== stored) {
            localStorage.setItem('supplierCompanyId', picked);
            window.dispatchEvent(new Event('storage'));
          }
        }
      }
    } catch {
      setCompanies([]);
    }
  }, [navigate, role]);

  useEffect(() => {
    if (role !== 'supplier') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${GATEWAY.supplier}/self/registry`);
        const json = (await res.json()) as RegistryResponse;
        if (!cancelled && json.success && json.data) setRegistry(json.data);
        else if (!cancelled) setRegistry(null);
      } catch {
        if (!cancelled) setRegistry(null);
      }
      try {
        const r = await apiFetch(`${GATEWAY.supplier}/self/summary`);
        const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: SelfSummaryData };
        if (!cancelled && r.ok && j.success && j.data) setSelfSummary(j.data);
        else if (!cancelled) setSelfSummary(null);
      } catch {
        if (!cancelled) setSelfSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, activeCompanyId]);

  if (role !== 'supplier') {
    return (
      <div className="pt-40 text-center text-ink-soft animate-pulse">{t('supplier.loading')}</div>
    );
  }

  return (
    <div className="pt-28 pb-24 px-6 max-w-4xl mx-auto min-h-screen">
      <div className="glass-card p-10 space-y-8 animate-fade-in-up">
        <div className="flex items-start gap-5">
          <div className="w-14 h-14 rounded-2xl bg-blush-50 border border-blush-200 flex items-center justify-center text-rose-gold-deep">
            <Package size={28} />
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-ash mb-1">
              {t('supplier.workspaceBadge')}
            </p>
            <h1 className="font-serif text-4xl font-light text-ink">
              {t('supplier.title')} {t('supplier.titlePartner')}
            </h1>
            <p className="text-sm text-ink-soft mt-2 max-w-xl">{t('supplier.intro', { label })}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="glass rounded-2xl p-5 border border-cream-200">
            <Sparkles size={18} className="text-rose-gold-deep mb-3" />
            <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-ink mb-1">{t('supplier.cardListings')}</h3>
            <p className="text-[11px] text-ink-soft leading-relaxed">{t('supplier.cardListingsBody')}</p>
          </div>
          <div className="glass rounded-2xl p-5 border border-cream-200">
            <Truck size={18} className="text-mauve mb-3" />
            <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-ink mb-1">{t('supplier.cardFulfillment')}</h3>
            <p className="text-[11px] text-ink-soft leading-relaxed">{t('supplier.cardFulfillmentBody')}</p>
          </div>
          <div className="glass rounded-2xl p-5 border border-cream-200">
            <Package size={18} className="text-rose-gold-deep mb-3" />
            <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-ink mb-1">{t('supplier.cardFeeds')}</h3>
            <p className="text-[11px] text-ink-soft leading-relaxed">
              {selfSummary?.canSyncDiamondAtelier ? t('supplier.cardFeedsBody') : t('supplier.cardFeedsBodySelf')}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="glass rounded-2xl p-6 border border-cream-200 space-y-3">
            <h2 className="font-serif text-xl text-ink">{t('supplier.summaryTitle')}</h2>
            {selfSummary ? (
              <dl className="space-y-2 text-sm text-ink-soft">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-ash">{t('supplier.summaryCatalogId')}</dt>
                  <dd className="font-mono text-xs text-ink mt-0.5">{selfSummary.catalogSupplierId ?? '—'}</dd>
                </div>
                {selfSummary.canSyncDiamondAtelier ? (
                  <>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.18em] text-ash">{t('supplier.summaryLastSync')}</dt>
                      <dd className="text-xs text-ink mt-0.5">
                        {selfSummary.diamondAtelierFeed?.lastFinishedAt
                          ? new Date(selfSummary.diamondAtelierFeed.lastFinishedAt).toLocaleString()
                          : t('supplier.summaryNone')}
                      </dd>
                    </div>
                    {selfSummary.diamondAtelierFeed && (
                      <>
                        <div>
                          <dt className="text-[10px] uppercase tracking-[0.18em] text-ash">{t('supplier.summaryStatus')}</dt>
                          <dd className="text-xs text-ink mt-0.5">{selfSummary.diamondAtelierFeed.lastStatus ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-[0.18em] text-ash">{t('supplier.summaryRows')}</dt>
                          <dd className="text-xs text-ink mt-0.5">{selfSummary.diamondAtelierFeed.lastRecordCount ?? '—'}</dd>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-ink-soft leading-relaxed pt-1">{t('supplier.summaryNoForeignFeed')}</p>
                )}
              </dl>
            ) : (
              <p className="text-xs text-ink-soft">{t('supplier.summaryNone')}</p>
            )}
          </div>
          <div className="glass rounded-2xl p-6 border border-cream-200 flex flex-col justify-center gap-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-ash">{t('nav.orders')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/supplier/orders')}
                className="glass-button px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.22em]"
              >
                {t('supplier.quickNavOrders')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/supplier/inventory')}
                className="glass-button px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.22em]"
              >
                {t('supplier.quickNavInventory')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/supplier/company')}
                className="glass-button px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.22em]"
              >
                {t('supplier.quickNavCompany')}
              </button>
            </div>
          </div>
        </div>

        {companies.length > 1 && (
          <div className="glass rounded-2xl p-6 border border-cream-200 space-y-2">
            <label
              htmlFor="supplier-active-company"
              className="block text-[10px] font-medium uppercase tracking-[0.22em] text-ash"
            >
              {t('supplier.activeCompany')}
            </label>
            <select
              id="supplier-active-company"
              value={activeCompanyId}
              onChange={e => {
                const v = e.target.value;
                setActiveCompanyId(v);
                localStorage.setItem('supplierCompanyId', v);
                window.dispatchEvent(new Event('storage'));
              }}
              className={selectClass}
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-ink-soft leading-relaxed">{t('supplier.activeCompanyHint')}</p>
          </div>
        )}

        {selfSummary?.canSyncDiamondAtelier && (
        <div className="glass rounded-2xl p-6 border border-cream-200 space-y-3">
          <h2 className="font-serif text-2xl text-ink">{t('supplier.atelierTitle')}</h2>
          <p className="text-xs text-ink-soft leading-relaxed">{t('supplier.atelierHint')}</p>
          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              disabled={atelierBusy}
              onClick={async () => {
                setAtelierBusy(true);
                setAtelierMsg(null);
                try {
                  const res = await apiFetch(`${GATEWAY.supplier}/sync/diamond-atelier`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                  });
                  const body = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setAtelierMsg(typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`);
                    return;
                  }
                  setAtelierMsg(t('supplier.atelierOk'));
                  try {
                    const r = await apiFetch(`${GATEWAY.supplier}/self/summary`);
                    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: SelfSummaryData };
                    if (r.ok && j.success && j.data) setSelfSummary(j.data);
                  } catch {
                    /* ignore */
                  }
                } catch {
                  setAtelierMsg(t('supplier.atelierFail'));
                } finally {
                  setAtelierBusy(false);
                }
              }}
              className="glass-button px-6 py-3 text-xs font-medium uppercase tracking-[0.22em] disabled:opacity-50"
            >
              {atelierBusy ? t('supplier.atelierBusy') : t('supplier.atelierSync')}
            </button>
            {atelierMsg && (
              <span
                className={`text-xs ${
                  atelierMsg === t('supplier.atelierOk') ? 'text-ink-soft' : 'text-rose-700 dark:text-rose-300'
                }`}
              >
                {atelierMsg}
              </span>
            )}
          </div>
        </div>
        )}

        <div className="glass rounded-2xl p-6 border border-cream-200 space-y-4">
          <h2 className="font-serif text-2xl text-ink">{t('supplier.ingestTitle')}</h2>
          <p className="text-xs text-ink-soft leading-relaxed">{t('supplier.ingestHint')}</p>
          <textarea
            value={ingestJson}
            onChange={e => {
              setIngestJson(e.target.value);
              setIngestMsg(null);
            }}
            rows={14}
            className="w-full glass-input font-mono text-[11px] leading-relaxed p-4 rounded-xl resize-y min-h-[200px]"
            spellCheck={false}
          />
          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              disabled={ingestBusy}
              onClick={async () => {
                setIngestBusy(true);
                setIngestMsg(null);
                try {
                  let diamonds: unknown;
                  try {
                    diamonds = JSON.parse(ingestJson);
                  } catch {
                    setIngestMsg(t('supplier.ingestInvalidJson'));
                    return;
                  }
                  if (!Array.isArray(diamonds)) {
                    setIngestMsg(t('supplier.ingestMustArray'));
                    return;
                  }
                  const res = await apiFetch(`${GATEWAY.supplier}/ingest/stonee-json`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ diamonds }),
                  });
                  const body = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setIngestMsg(typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`);
                    return;
                  }
                  setIngestMsg(t('supplier.ingestSuccess'));
                } finally {
                  setIngestBusy(false);
                }
              }}
              className="glass-button px-6 py-3 text-xs font-medium uppercase tracking-[0.22em] disabled:opacity-50"
            >
              {ingestBusy ? t('supplier.ingestSending') : t('supplier.ingestSubmit')}
            </button>
          </div>
          {ingestMsg && (
            <p
              className={`text-xs ${
                ingestMsg === t('supplier.ingestSuccess') ? 'text-ink-soft' : 'text-rose-700 dark:text-rose-300'
              }`}
            >
              {ingestMsg}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="font-serif text-2xl text-ink">{t('supplier.registryTitle')}</h2>
          <p className="text-xs text-ink-soft">{registry?.auth}</p>
          <div className="rounded-2xl border border-cream-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-blush-50 text-[10px] uppercase tracking-[0.18em] text-ash">
                <tr>
                  <th className="px-4 py-3">{t('supplier.colFeed')}</th>
                  <th className="px-4 py-3">{t('supplier.colProduct')}</th>
                  <th className="px-4 py-3">{t('supplier.colHttp')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {(registry?.feeds ?? []).map(f => (
                  <tr key={f.id} className="hover:bg-blush-50/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{f.label}</div>
                      <div className="text-[10px] font-mono text-ash">{f.id}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft capitalize">{f.product}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {f.method} {f.path}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!registry?.feeds?.length && (
              <div className="px-4 py-8 text-center text-xs text-ash">{t('supplier.registryEmpty')}</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-cream-200 bg-cream-50/80 px-5 py-4 text-xs text-ink-soft leading-relaxed">
          {t('supplier.footerNote')}
        </div>

        <button
          type="button"
          onClick={() => navigate('/marketplace')}
          className="glass-button px-6 py-3 text-xs font-medium uppercase tracking-[0.22em]"
        >
          {t('supplier.viewStorefront')}
        </button>
      </div>
    </div>
  );
};

export default SupplierPortalPage;
