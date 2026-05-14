import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight,
  Award,
  Clock,
  Download,
  ExternalLink,
  Gem,
  MessageSquare,
  Shield,
  TrendingUp,
  X,
} from '../components/icons';
import { apiJson, GATEWAY } from '../lib/api';
import ConciergeModal from '../components/ConciergeModal';
import AccountKycPanel from '../components/AccountKycPanel';
import type { OrderDoc, OrderItem, OrdersListResponse } from '../lib/contracts';

type VaultAsset = OrderItem & { orderId: string; purchasedAt: string };

const VaultPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [assets, setAssets] = useState<VaultAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConcierge, setShowConcierge] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<VaultAsset | null>(null);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const json = (await apiJson<OrderDoc[]>(`${GATEWAY.order}/my-orders`)) as OrdersListResponse;
        if (json.success) {
          const items = json.data.flatMap(order =>
            order.items.map(item => ({
              ...item,
              orderId: order._id,
              purchasedAt: order.createdAt,
            })),
          );
          setAssets(items);
        }
      } catch (err) {
        console.error('Failed to fetch assets:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAssets();
  }, []);

  const totalInvestment = assets.reduce((acc, a) => acc + a.price, 0);
  const currentValuation = totalInvestment * 1.12;

  if (loading)
    return (
      <div className="pt-40 text-center text-ink-soft animate-pulse">
        {t('vault.loading')}
      </div>
    );

  return (
    <div className="pt-32 pb-24 px-6 max-w-7xl mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-16 animate-fade-in-up">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-blush-50 border border-blush-200 flex items-center justify-center text-rose-gold-deep">
              <Shield size={18} />
            </span>
            <span className="text-[10px] font-medium text-rose-gold-deep uppercase tracking-[0.22em]">
              {t('vault.verifiedBadge')}
            </span>
          </div>
          <h1 className="font-serif text-6xl md:text-7xl font-light tracking-tight text-ink">
            {t('vault.title')} <span className="text-gradient italic">{t('vault.titleItalic')}</span>
          </h1>
          <p className="text-ink-soft max-w-md">{t('vault.subtitle')}</p>
        </div>

        <div className="glass-card-premium p-8 min-w-[320px] relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-15 group-hover:scale-110 transition-transform text-rose-gold-deep">
            <TrendingUp size={56} />
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ash mb-2">
            {t('vault.portfolioValue')}
          </div>
          <div className="font-serif text-5xl font-light text-ink">
            $
            {currentValuation.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-700">
            <ArrowUpRight size={14} /> {t('vault.gainSince')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-3xl text-ink">{t('vault.physicalHoldings')}</h2>
            <span className="text-[10px] font-medium text-ash uppercase tracking-[0.22em]">
              {t('vault.activeItems', { count: assets.length })}
            </span>
          </div>

          {assets.length > 0 ? (
            assets.map((asset, idx) => (
              <div
                key={idx}
                className="glass-card p-6 flex flex-col md:flex-row gap-6 animate-fade-in-up"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="w-full md:w-32 h-32 rounded-2xl bg-blush-50 border border-cream-200 overflow-hidden flex-shrink-0 group">
                  <img
                    src={
                      asset.type === 'diamond'
                        ? '/assets/diamond_render_round_brilliant_1776718136100.png'
                        : '/assets/solitaire_engagement_ring_platinum_1776706103840.png'
                    }
                    className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-700"
                    alt=""
                  />
                </div>
                <div className="flex-1 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-serif text-2xl text-ink capitalize">
                        {asset.type} {t('vault.selection')}
                      </h3>
                      <div className="flex items-center gap-3 text-[10px] text-ash mt-1 uppercase tracking-[0.18em]">
                        <span>
                          {t('vault.sku')}: {asset.productId}
                        </span>
                        <span>•</span>
                        <span>
                          {t('vault.purchased', {
                            date: new Date(asset.purchasedAt).toLocaleDateString(
                              i18n.language.startsWith('en') ? 'en-US' : 'ru-RU',
                            ),
                          })}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAsset(asset)}
                      className="p-2.5 rounded-xl bg-blush-50 border border-blush-200 text-rose-gold-deep hover:bg-blush-100 transition-colors cursor-pointer"
                      aria-label={t('vault.certAria')}
                    >
                      <Award size={18} />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-cream-200">
                    <div>
                      <div className="text-[9px] text-ash font-medium uppercase tracking-[0.22em] mb-1">
                        {t('vault.costBasis')}
                      </div>
                      <div className="text-sm font-medium text-ink">
                        ${asset.price.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-ash font-medium uppercase tracking-[0.22em] mb-1">
                        {t('vault.currentMkt')}
                      </div>
                      <div className="text-sm font-medium text-emerald-700">
                        ${Math.round(asset.price * 1.1).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-ash font-medium uppercase tracking-[0.22em] mb-1">
                        {t('vault.status')}
                      </div>
                      <div className="text-[10px] font-medium text-rose-gold-deep uppercase tracking-[0.22em]">
                        {t('vault.vaultSecured')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="glass-card p-20 text-center">
              <Gem size={42} className="mx-auto mb-4 text-ash-soft" />
              <p className="text-sm text-ink-soft uppercase tracking-[0.22em]">
                {t('vault.noAssets')}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <AccountKycPanel variant="sidebar" />

          <div className="glass-card p-7 space-y-5 bg-blush-50 border-blush-200">
            <div className="flex items-center gap-4">
              <span className="p-2.5 rounded-xl bg-white border border-blush-200 text-rose-gold-deep">
                <MessageSquare size={20} />
              </span>
              <div>
                <h3 className="font-serif text-xl text-ink">{t('vault.bridgeTitle')}</h3>
                <p className="text-[10px] text-ash uppercase tracking-[0.22em]">{t('vault.bridgeChannel')}</p>
              </div>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">{t('vault.bridgeBody')}</p>
            <button
              type="button"
              onClick={() => setShowConcierge(true)}
              className="btn-primary w-full py-4 text-xs font-medium uppercase tracking-[0.22em]"
            >
              {t('vault.connectExpert')}
            </button>
          </div>

          <div className="glass-card p-7">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ash mb-5">
              {t('vault.securityPulse')}
            </h3>
            <div className="space-y-3">
              {[
                { label: t('vault.secFips'), status: t('vault.secFipsStatus'), icon: Shield },
                { label: t('vault.secChain'), status: t('vault.secChainStatus'), icon: Award },
                { label: t('vault.secInsurance'), status: t('vault.secInsuranceStatus'), icon: Clock },
              ].map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-xl bg-blush-50 border border-cream-200"
                >
                  <div className="flex items-center gap-3">
                    <s.icon size={14} className="text-emerald-700" />
                    <span className="text-[10px] font-medium text-ink-soft">{s.label}</span>
                  </div>
                  <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-ink">
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink/40 backdrop-blur-md animate-fade-in">
          <div className="glass-card-premium max-w-2xl w-full p-12 relative overflow-hidden">
            <button
              type="button"
              onClick={() => setSelectedAsset(null)}
              className="absolute top-6 right-6 p-2 rounded-full glass text-ink-soft hover:text-rose-gold-deep transition-colors cursor-pointer"
              aria-label={t('vault.closeAria')}
            >
              <X size={18} />
            </button>
            <div className="text-center space-y-7">
              <div className="w-20 h-20 bg-blush-50 border border-blush-200 rounded-full flex items-center justify-center mx-auto">
                <Award size={40} className="text-rose-gold-deep" />
              </div>
              <div>
                <h2 className="font-serif text-4xl font-light text-ink mb-2">
                  {t('vault.heritageTitle')}
                </h2>
                <p className="text-[10px] text-ash uppercase tracking-[0.22em]">
                  {t('vault.assetRef', { id: selectedAsset.productId })}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 py-7 border-y border-cream-200">
                <div className="text-left p-4 bg-blush-50 border border-cream-200 rounded-xl">
                  <div className="text-[9px] text-ash font-medium uppercase tracking-[0.22em] mb-1">
                    {t('vault.gradingLab')}
                  </div>
                  <div className="text-sm font-medium text-ink">{t('vault.gradingLabValue')}</div>
                </div>
                <div className="text-left p-4 bg-blush-50 border border-cream-200 rounded-xl">
                  <div className="text-[9px] text-ash font-medium uppercase tracking-[0.22em] mb-1">
                    {t('vault.certDate')}
                  </div>
                  <div className="text-sm font-medium text-ink">
                    {new Date(selectedAsset.purchasedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  className="glass-button px-7 py-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em]"
                >
                  <Download size={14} /> {t('vault.downloadPdf')}
                </button>
                <button
                  type="button"
                  className="glass-button px-7 py-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em]"
                >
                  <ExternalLink size={14} /> {t('vault.verifyLab')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConciergeModal isOpen={showConcierge} onClose={() => setShowConcierge(false)} />
    </div>
  );
};

export default VaultPage;
