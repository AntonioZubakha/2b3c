import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Filter,
  Gem,
  History,
  PieChart,
  Receipt,
  Search,
  TrendingUp,
  Truck,
} from '../components/icons';
import {
  canEditOrderStatus,
  canViewFinanceTab,
  isStoneeStaffRole,
} from '@stonee/shared-types';
import { orderStatusLabel } from '../lib/displayI18n';
import { apiFetch, GATEWAY } from '../lib/api';
import { setStaffBuyerPreview, isStaffBuyerPreview } from '../lib/uiSurface';

type CatalogStats = { inStock: number; total: number };

type DiamondAtelierAdminPayload = {
  envConfigured: boolean;
  baseUrl: string;
  supplierUserIdSet: boolean;
  last: {
    source?: string;
    lastStartedAt?: string;
    lastFinishedAt?: string;
    lastStatus?: string;
    lastRecordCount?: number;
    lastPages?: number;
    lastError?: string;
    lastRequestUrlMasked?: string;
  } | null;
};

type ApiOrderStatus = 'PENDING' | 'PAID' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

type ApiOrder = {
  _id: string;
  userId: string;
  userEmail?: string;
  items: unknown[];
  totalAmount: number;
  status: ApiOrderStatus;
  createdAt: string;
  updatedAt: string;
};

type NotificationLogType = 'ORDER_CREATED' | 'ORDER_STATUS_UPDATE';

type ApiNotificationLog = {
  id: string;
  receivedAt: string;
  type: NotificationLogType;
  orderId: string;
  status?: string;
  totalAmount?: number;
  items?: number;
  userEmail?: string;
};

const MerchantDashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const staffRole = typeof window !== 'undefined' ? localStorage.getItem('userRole') || '' : '';

  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [logs, setLogs] = useState<ApiNotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'finance' | 'logs'>('orders');
  const [catalogStats, setCatalogStats] = useState<CatalogStats | null>(null);
  const [daAdmin, setDaAdmin] = useState<DiamondAtelierAdminPayload | null>(null);
  const [daBusy, setDaBusy] = useState(false);
  const [daMsg, setDaMsg] = useState<string | null>(null);
  const [buyerPreview, setBuyerPreviewState] = useState(() =>
    typeof window !== 'undefined' ? isStaffBuyerPreview() : false,
  );

  useEffect(() => {
    const sync = () => setBuyerPreviewState(isStaffBuyerPreview());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const tabs = useMemo(() => {
    const list: ('orders' | 'finance' | 'logs')[] = ['orders'];
    if (canViewFinanceTab(staffRole)) list.push('finance');
    if (isStoneeStaffRole(staffRole)) list.push('logs');
    return list;
  }, [staffRole]);

  useEffect(() => {
    if (!isStoneeStaffRole(staffRole)) {
      navigate('/auth?redirect=/merchant');
    }
  }, [navigate, staffRole]);

  useEffect(() => {
    if (!tabs.includes(activeTab)) setActiveTab('orders');
  }, [activeTab, tabs]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const orderRes = await apiFetch(`${GATEWAY.order}/admin/orders`);
      const orderJson = await orderRes.json();
      if (orderJson.success) setOrders(orderJson.data as ApiOrder[]);

      const logRes = await apiFetch(`/api/notifications/logs`);
      if (logRes.ok) {
        const logJson = await logRes.json();
        if (logJson.success) setLogs(logJson.data as ApiNotificationLog[]);
      } else {
        setLogs([]);
      }

      const statsRes = await apiFetch(`${GATEWAY.catalog}/stats`);
      if (statsRes.ok) {
        const statsJson = await statsRes.json();
        if (statsJson.success && statsJson.data) setCatalogStats(statsJson.data as CatalogStats);
      } else {
        setCatalogStats(null);
      }

      if (isStoneeStaffRole(staffRole)) {
        const daRes = await apiFetch(`${GATEWAY.supplier}/admin/diamond-atelier-status`);
        if (daRes.ok) {
          const daJson = await daRes.json();
          if (daJson.success && daJson.data) setDaAdmin(daJson.data as DiamondAtelierAdminPayload);
        } else {
          setDaAdmin(null);
        }
      } else {
        setDaAdmin(null);
      }
    } catch (err) {
      console.error('Failed to fetch merchant data:', err);
    } finally {
      setLoading(false);
    }
  }, [staffRole]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const updateStatus = async (orderId: string, newStatus: ApiOrderStatus) => {
    try {
      const res = await apiFetch(`${GATEWAY.order}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setOrders(orders.map(o => (o._id === orderId ? { ...o, status: newStatus } : o)));
        fetchData();
      }
    } catch (err) {
      console.error('Status update failed:', err);
    }
  };

  const totalRevenue = orders.reduce((acc, o) => acc + o.totalAmount, 0);

  const roleBadge = useMemo(() => {
    const map: Record<string, string> = {
      stonee: t('merchant.roleLegacy'),
      stonee_admin: t('merchant.roleAdmin'),
      stonee_supervisor: t('merchant.roleSupervisor'),
      stonee_manager: t('merchant.roleManager'),
    };
    return map[staffRole] ?? t('merchant.roleStaff');
  }, [staffRole, t]);

  const stats = useMemo(
    () => [
      {
        label: t('merchant.statRevenue'),
        value: `$${totalRevenue.toLocaleString()}`,
        icon: TrendingUp,
        tone: 'text-emerald-700',
      },
      {
        label: t('merchant.statOrders'),
        value: orders.length,
        icon: Receipt,
        tone: 'text-rose-gold-deep',
      },
      {
        label: t('merchant.statCatalogInStock'),
        value: catalogStats != null ? String(catalogStats.inStock) : '—',
        icon: Gem,
        tone: 'text-mauve',
      },
      {
        label: t('merchant.statPipeline'),
        value: orders.filter(o => o.status !== 'SHIPPED').length,
        icon: Activity,
        tone: 'text-amber-700',
      },
    ],
    [catalogStats, orders, t, totalRevenue],
  );

  const statusBadge = (status: ApiOrderStatus) => {
    switch (status) {
      case 'PENDING':
        return 'merchant-status-pending';
      case 'SHIPPED':
        return 'merchant-status-shipped';
      case 'DELIVERED':
        return 'merchant-status-delivered';
      case 'CANCELLED':
        return 'merchant-status-cancelled';
      case 'PAID':
        return 'merchant-status-paid';
      case 'CONFIRMED':
      default:
        return 'merchant-status-confirmed';
    }
  };

  if (loading)
    return (
      <div className="pt-40 text-center text-ink-soft animate-pulse">
        {t('merchant.loading')}
      </div>
    );

  return (
    <div className="pt-28 pb-20 px-6 max-w-[1600px] mx-auto min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 animate-fade-in-up">
        <div>
          <h1 className="font-serif text-5xl font-light mb-2 flex items-center gap-4 text-ink">
            {t('merchant.title')} <span className="text-gradient italic">{t('merchant.titleItalic')}</span>
            <span className="px-3 py-1 bg-blush-50 text-rose-gold-deep border border-blush-200 rounded-lg text-[10px] font-medium uppercase tracking-[0.22em]">
              {roleBadge}
            </span>
          </h1>
          <p className="text-ink-soft text-sm">
            {t('merchant.subtitle')}
            {staffRole === 'stonee_manager' && (
              <span className="block mt-2 text-amber-800/90 text-xs">{t('merchant.managerNote')}</span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-stretch md:items-end gap-4">
          <label className="glass rounded-2xl px-4 py-3 border border-cream-200 max-w-md flex items-start gap-3 cursor-pointer text-left">
            <input
              type="checkbox"
              className="mt-1 rounded border-cream-300 accent-rose-gold"
              checked={buyerPreview}
              onChange={e => {
                const on = e.target.checked;
                setStaffBuyerPreview(on);
                setBuyerPreviewState(on);
                navigate(on ? '/craft' : '/merchant');
              }}
            />
            <span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-ink">
                {t('merchant.previewBuyer')}
              </span>
              <span className="block text-[10px] text-ash mt-1 leading-relaxed">{t('merchant.previewBuyerHint')}</span>
            </span>
          </label>
          <div className="flex items-center gap-3">
          <div className="glass flex items-center p-1 rounded-xl">
            {tabs.map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-[10px] font-medium uppercase tracking-[0.22em] transition-all ${
                  activeTab === tab
                    ? 'bg-rose-gold text-white shadow-[0_8px_22px_rgba(207,154,133,0.30)]'
                    : 'text-ink-soft hover:text-rose-gold-deep'
                }`}
              >
                {tab === 'orders' ? t('merchant.tabOrders') : tab === 'finance' ? t('merchant.tabFinance') : t('merchant.tabLogs')}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="p-2.5 glass rounded-xl text-ink-soft hover:text-rose-gold-deep transition-colors"
            aria-label={t('merchant.refreshAria')}
          >
            <Activity size={18} />
          </button>
        </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12 animate-fade-in-up animate-delay-100">
        {stats.map((stat, idx) => (
          <div key={idx} className="glass-card p-6 group cursor-default relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 text-ink group-hover:opacity-10 transition-opacity">
              <stat.icon size={70} />
            </div>
            <div className="flex justify-between items-start mb-4">
              <span
                className={`p-3 rounded-2xl bg-blush-50 border border-blush-200 ${stat.tone}`}
              >
                <stat.icon size={20} />
              </span>
              <span className="merchant-pill-live">
                <ArrowUpRight size={10} className="opacity-80 shrink-0" aria-hidden />
                {t('merchant.live')}
              </span>
            </div>
            <div className="font-serif text-3xl font-light text-ink mb-1">{stat.value}</div>
            <div className="text-[10px] text-ash font-medium uppercase tracking-[0.22em]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="animate-fade-in-up animate-delay-200">
        {activeTab === 'orders' && (
          <div className="glass-card overflow-hidden">
            <div className="p-7 border-b border-cream-200 flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h2 className="font-serif text-3xl text-ink">{t('merchant.ordersBoardTitle')}</h2>
                <p className="text-[10px] text-ash mt-1 uppercase tracking-[0.22em]">{t('merchant.pipelineSubtitle')}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-ash"
                  />
                  <input
                    type="text"
                    placeholder={t('merchant.searchPlaceholder')}
                    className="glass-input py-2 pl-9 pr-4 text-xs w-64"
                  />
                </div>
                <button
                  type="button"
                  className="p-2.5 glass rounded-lg text-ink-soft hover:text-rose-gold-deep transition-colors"
                  aria-label={t('merchant.filterAria')}
                >
                  <Filter size={14} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-blush-50 text-[10px] font-medium uppercase text-ash tracking-[0.22em]">
                    <th className="px-7 py-4">{t('merchant.colReference')}</th>
                    <th className="px-7 py-4">{t('merchant.colStatus')}</th>
                    <th className="px-7 py-4">{t('merchant.colClient')}</th>
                    <th className="px-7 py-4">{t('merchant.colValue')}</th>
                    <th className="px-7 py-4">{t('merchant.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-200">
                  {orders.map(order => (
                    <tr key={order._id} className="hover:bg-blush-50/40 transition-colors group">
                      <td className="px-7 py-5">
                        <div className="font-mono text-sm font-medium text-rose-gold-deep">
                          #{order._id.substring(0, 8)}
                        </div>
                        <div className="text-[10px] text-ash mt-1 uppercase tracking-[0.18em]">
                          {t('merchant.created')}{' '}
                          {new Date(order.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-7 py-5">
                        <div className={`merchant-status-pill ${statusBadge(order.status)}`}>
                          {order.status === 'PENDING' && <Clock size={10} className="shrink-0 opacity-90" />}
                          {order.status === 'SHIPPED' && <Truck size={10} className="shrink-0 opacity-90" />}
                          {(order.status === 'CONFIRMED' ||
                            order.status === 'PAID' ||
                            order.status === 'DELIVERED') && (
                            <CheckCircle2 size={10} className="shrink-0 opacity-90" />
                          )}
                          {orderStatusLabel(t, order.status)}
                        </div>
                      </td>
                      <td className="px-7 py-5">
                        <div className="text-sm font-medium text-ink">
                          {order.userEmail?.split('@')[0] || t('merchant.exclusiveClient')}
                        </div>
                        <div className="text-[10px] text-ash font-mono mt-0.5">
                          {order.userId.substring(0, 12)}…
                        </div>
                      </td>
                      <td className="px-7 py-5">
                        <div className="font-serif text-lg text-ink">
                          ${order.totalAmount.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-7 py-5">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                          {canEditOrderStatus(staffRole) && order.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => updateStatus(order._id, 'CONFIRMED')}
                              className="p-2 glass rounded-xl text-ink-soft hover:text-emerald-700 transition-colors"
                              title={t('merchant.confirmTitle')}
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          )}
                          {canEditOrderStatus(staffRole) &&
                            (['PENDING', 'CONFIRMED'] as ApiOrderStatus[]).includes(
                            order.status,
                          ) && (
                            <button
                              type="button"
                              onClick={() => updateStatus(order._id, 'SHIPPED')}
                              className="p-2 glass rounded-xl text-ink-soft hover:text-mauve transition-colors"
                              title={t('merchant.shipTitle')}
                            >
                              <Truck size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="p-2 glass rounded-xl text-ink-soft hover:text-rose-gold-deep transition-colors"
                            aria-label={t('merchant.inspectAria')}
                          >
                            <Search size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'finance' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-9 flex flex-col justify-between">
              <div>
                <h3 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ash mb-7">
                  {t('merchant.financeBreakdown')}
                </h3>
                <div className="space-y-7">
                  {orders.length === 0 ? (
                    <p className="text-xs text-ink-soft leading-relaxed">{t('merchant.finNoOrders')}</p>
                  ) : (
                    <div>
                      <div className="flex justify-between text-xs mb-2 uppercase tracking-[0.22em]">
                        <span className="text-ink-soft">{t('merchant.finRecordedOrders')}</span>
                        <span className="font-medium text-ink">100%</span>
                      </div>
                      <div className="h-2.5 w-full bg-cream-100 rounded-full overflow-hidden border border-cream-200">
                        <div
                          className="h-full rounded-full"
                          style={{ width: '100%', background: 'var(--rose-gold)' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-10 pt-6 border-t border-cream-200 flex items-end justify-between">
                <div>
                  <div className="text-[10px] text-ash uppercase tracking-[0.22em] mb-1">
                    {t('merchant.projectedAnnual')}
                  </div>
                  <div className="font-serif text-4xl font-light text-gradient">
                    ${(totalRevenue * 12).toLocaleString()}
                  </div>
                </div>
                <PieChart size={42} className="text-rose-gold-deep opacity-20" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="glass-card p-9 flex items-center justify-between">
                <div>
                  <h4 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ash mb-2">
                    {t('merchant.avgOrder')}
                  </h4>
                  <div className="font-serif text-5xl font-light text-ink">
                    ${Math.round(totalRevenue / (orders.length || 1)).toLocaleString()}
                  </div>
                  <p className="text-[10px] text-ink-soft font-medium mt-2 uppercase tracking-[0.18em]">
                    {t('merchant.periodSample')}
                  </p>
                </div>
                <PieChart size={68} className="text-rose-gold-deep opacity-15" />
              </div>
              <div className="glass-card p-9 flex items-center justify-between bg-emerald-50 border-emerald-100">
                <div>
                  <h4 className="text-[10px] font-medium uppercase tracking-[0.22em] text-emerald-800 mb-2">
                    {t('merchant.takeHome')}
                  </h4>
                  <div className="font-serif text-5xl font-light text-emerald-700">—</div>
                  <p className="text-[10px] text-ink-soft font-medium mt-2 uppercase tracking-[0.22em]">
                    {t('merchant.postSupplier')}
                  </p>
                </div>
                <CheckCircle2 size={68} className="text-emerald-700 opacity-15" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="glass-card p-7 animate-fade-in-up">
            <div className="flex items-center justify-between mb-6 pb-5 border-b border-cream-200">
              <div>
                <h2 className="font-serif text-3xl text-ink">{t('merchant.logTitle')}</h2>
                <p className="text-[10px] text-ash mt-1 uppercase tracking-[0.22em]">{t('merchant.logSubtitle')}</p>
              </div>
              <History size={22} className="text-ash" />
            </div>
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {logs.length > 0 ? (
                logs.map(log => (
                  <div
                    key={log.id}
                    className="flex gap-5 p-4 rounded-2xl bg-blush-50 border border-cream-200 hover:bg-blush-100 transition-all"
                  >
                    <div className="flex-shrink-0 pt-1">
                      <span
                        className={`block w-2.5 h-2.5 rounded-full ${
                          log.type === 'ORDER_CREATED' ? 'bg-rose-gold' : 'bg-emerald-600'
                        }`}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="text-xs font-medium uppercase tracking-[0.22em] text-ink">
                          {log.type === 'ORDER_CREATED' ? t('merchant.logNew') : t('merchant.logStatus')}
                        </span>
                        <span className="text-[10px] font-mono text-ash">
                          {new Date(log.receivedAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-ink-soft leading-relaxed">
                        {log.type === 'ORDER_CREATED'
                          ? t('merchant.logIncoming', { amount: String(log.totalAmount?.toLocaleString() ?? '') })
                          : t('merchant.logOrderStatus', {
                              id: log.orderId.substring(0, 8),
                              status: String(log.status ?? ''),
                            })}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-[10px] font-mono text-ash uppercase">
                      {log.orderId.substring(0, 6)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-16 text-ash uppercase text-[10px] tracking-[0.22em]">
                  {t('merchant.logEmpty')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ops: gateway health + Diamond Atelier feed (staff) */}
      {activeTab === 'orders' && (
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in-up animate-delay-400">
          <div className="glass-card p-9 flex flex-col md:flex-row items-center gap-7">
            <div className="w-16 h-16 rounded-[2rem] bg-blush-50 border border-blush-200 flex items-center justify-center flex-shrink-0 text-rose-gold-deep">
              <Activity size={28} />
            </div>
            <div className="space-y-1.5 text-center md:text-left">
              <h3 className="font-serif text-xl text-ink">{t('merchant.healthTitle')}</h3>
              <p className="text-xs text-ink-soft leading-relaxed">{t('merchant.healthBody')}</p>
            </div>
          </div>
          {isStoneeStaffRole(staffRole) ? (
            <div className="glass-card p-9 space-y-4 text-left">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-[2rem] bg-cream-100 border border-cream-200 flex items-center justify-center flex-shrink-0 text-mauve">
                  <Gem size={28} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif text-xl text-ink">{t('merchant.daTitle')}</h3>
                  <p className="text-xs text-ink-soft mt-1 leading-relaxed">{t('merchant.daSubtitle')}</p>
                </div>
              </div>
              {daAdmin && (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-ink-soft font-mono">
                  <div>
                    <dt className="text-ash uppercase tracking-wider mb-0.5">{t('merchant.daEnv')}</dt>
                    <dd>{daAdmin.envConfigured ? t('merchant.daYes') : t('merchant.daNo')}</dd>
                  </div>
                  <div>
                    <dt className="text-ash uppercase tracking-wider mb-0.5">{t('merchant.daSupplierId')}</dt>
                    <dd>{daAdmin.supplierUserIdSet ? t('merchant.daYes') : t('merchant.daNo')}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-ash uppercase tracking-wider mb-0.5">{t('merchant.daBaseUrl')}</dt>
                    <dd className="break-all">{daAdmin.baseUrl}</dd>
                  </div>
                  {daAdmin.last?.lastFinishedAt && (
                    <div>
                      <dt className="text-ash uppercase tracking-wider mb-0.5">{t('merchant.daLastSync')}</dt>
                      <dd>{new Date(daAdmin.last.lastFinishedAt).toLocaleString()}</dd>
                    </div>
                  )}
                  {daAdmin.last?.lastStatus && (
                    <div>
                      <dt className="text-ash uppercase tracking-wider mb-0.5">{t('merchant.daStatus')}</dt>
                      <dd>{daAdmin.last.lastStatus}</dd>
                    </div>
                  )}
                  {daAdmin.last != null && typeof daAdmin.last.lastRecordCount === 'number' && (
                    <div>
                      <dt className="text-ash uppercase tracking-wider mb-0.5">{t('merchant.daRows')}</dt>
                      <dd>{daAdmin.last.lastRecordCount}</dd>
                    </div>
                  )}
                  {daAdmin.last?.lastError && (
                    <div className="sm:col-span-2 text-rose-700">
                      <dt className="text-ash uppercase tracking-wider mb-0.5">{t('merchant.daError')}</dt>
                      <dd className="break-words">{daAdmin.last.lastError}</dd>
                    </div>
                  )}
                  {daAdmin.last?.lastRequestUrlMasked && (
                    <div className="sm:col-span-2">
                      <dt className="text-ash uppercase tracking-wider mb-0.5">{t('merchant.daMaskedUrl')}</dt>
                      <dd className="break-all opacity-90">{daAdmin.last.lastRequestUrlMasked}</dd>
                    </div>
                  )}
                </dl>
              )}
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  disabled={daBusy}
                  onClick={async () => {
                    setDaBusy(true);
                    setDaMsg(null);
                    try {
                      const res = await apiFetch(`${GATEWAY.supplier}/sync/diamond-atelier`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                      });
                      const body = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        setDaMsg(typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`);
                        return;
                      }
                      setDaMsg(t('merchant.daSyncOk'));
                      await fetchData();
                    } catch (e) {
                      setDaMsg(t('merchant.daSyncFail'));
                      console.error(e);
                    } finally {
                      setDaBusy(false);
                    }
                  }}
                  className="glass-button px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.22em] disabled:opacity-50"
                >
                  {daBusy ? t('merchant.daSyncBusy') : t('merchant.daSyncRun')}
                </button>
                {daMsg && <span className="text-xs text-ink-soft">{daMsg}</span>}
              </div>
            </div>
          ) : (
            <div className="glass-card p-9 flex flex-col md:flex-row items-center gap-7">
              <div className="w-16 h-16 rounded-[2rem] bg-cream-100 border border-cream-200 flex items-center justify-center flex-shrink-0 text-mauve">
                <Gem size={28} />
              </div>
              <div className="space-y-1.5 text-center md:text-left">
                <h3 className="font-serif text-xl text-ink">{t('merchant.syncTitle')}</h3>
                <p className="text-xs text-ink-soft leading-relaxed">{t('merchant.syncBody')}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MerchantDashboard;
