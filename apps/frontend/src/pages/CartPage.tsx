import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, RotateCcw, ShieldCheck, ShoppingBag, Trash2, Truck } from '../components/icons';
import { Link, useNavigate } from 'react-router-dom';
import Seo from '../components/Seo';
import { cartItemTypeLabel } from '../lib/displayI18n';
import { pickJewelryRecommendationSku } from '../lib/cartRecommendationsSku';
import { apiJson, GATEWAY } from '../lib/api';
import { orderQueryKeys, useCartQuery } from '../lib/orderQuery';
import { peekSessionId } from '../lib/session';
import { DiamondCatalogMedia } from '../components/DiamondCatalogMedia';
import { resolveJewelryImage } from '../lib/imageFallback';
import type { CartDoc, JewelryDoc, RecommendationsMatchResponse } from '../lib/contracts';

const itemImage = (type: string) => {
  switch (type) {
    case 'bespoke':
      return '/assets/halo_engagement_ring_gold_yellow_1776706171719.png';
    case 'jewelry':
      return '/assets/pendant.png';
    default:
      return '/assets/solitaire_engagement_ring_platinum_1776706103840.png';
  }
};

const CartPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionId = peekSessionId() ?? '';
  const hasSession = sessionId.length > 0;

  const cartQuery = useCartQuery(sessionId, { enabled: hasSession });

  const recommendationSku = React.useMemo(
    () => pickJewelryRecommendationSku(cartQuery.data?.items),
    [cartQuery.data?.items],
  );

  const recQuery = useQuery({
    queryKey: ['recommendations', 'jewelry', 'cart', recommendationSku],
    queryFn: async () => {
      const enc = encodeURIComponent(recommendationSku!);
      const data = (await apiJson<JewelryDoc[]>(
        `${GATEWAY.recommendations}/match/${enc}`,
      )) as RecommendationsMatchResponse;
      if (!data.success || !Array.isArray(data.data)) return [];
      return data.data;
    },
    enabled: Boolean(recommendationSku),
  });

  const removeMutation = useMutation({
    mutationFn: async (productId: string) => {
      const json = await apiJson<CartDoc>(`${GATEWAY.order}/cart/${sessionId}/item/${productId}`, {
        method: 'DELETE',
      });
      if (!json.success) throw new Error('Remove failed');
      return json.data;
    },
    onSuccess: (nextCart) => {
      queryClient.setQueryData(orderQueryKeys.cart(sessionId), nextCart);
    },
  });

  const cart = cartQuery.data ?? null;
  const recommendations = recQuery.data ?? [];
  const loading = hasSession && cartQuery.isPending;

  const handleCheckout = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/auth?redirect=cart');
      return;
    }
    navigate('/checkout');
  };

  if (loading)
    return (
      <>
        <Seo title={`${t('cart.title')} ${t('cart.titleItalic')}`} description={t('cart.seoDescription')} path="/cart" />
        <div className="pt-40 text-center text-ink-soft">{t('cart.loading')}</div>
      </>
    );

  if (!cart || cart.items.length === 0) {
    return (
      <div className="pt-40 pb-20 px-6 max-w-xl mx-auto text-center">
        <Seo title={`${t('cart.title')} ${t('cart.titleItalic')}`} description={t('cart.emptySubtitle')} path="/cart" />
        <div className="w-20 h-20 bg-blush-50 border border-blush-200 rounded-full flex items-center justify-center mx-auto mb-8">
          <ShoppingBag size={32} className="text-rose-gold-deep" />
        </div>
        <h1 className="font-serif text-4xl font-light text-ink mb-3">{t('cart.emptyTitle')}</h1>
        <p className="text-ink-soft mb-10">{t('cart.emptySubtitle')}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            to="/marketplace"
            className="glass-button px-10 py-4 text-sm font-medium uppercase tracking-[0.22em] inline-block no-underline"
          >
            {t('cart.exploreDiamonds')}
          </Link>
          <Link
            to="/collections"
            className="inline-block text-sm font-medium uppercase tracking-[0.22em] text-rose-gold-deep hover:text-ink border-b border-rose-gold-deep/40 hover:border-ink pb-0.5 no-underline transition-colors"
          >
            {t('cart.exploreCollections')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-20 px-6 max-w-6xl mx-auto min-h-screen">
      <Seo
        title={`${t('cart.title')} ${t('cart.titleItalic')}`}
        description={t('cart.seoDescription')}
        path="/cart"
      />
      <div className="flex items-center gap-4 mb-12 animate-fade-in">
        <h1 className="font-serif text-5xl md:text-6xl font-light text-ink">
          {t('cart.title')} <span className="text-gradient italic">{t('cart.titleItalic')}</span>
        </h1>
        <span className="px-3 py-1 bg-blush-50 border border-blush-200 text-rose-gold-deep rounded-full text-xs font-medium uppercase tracking-[0.18em]">
          {cart.items.length}{' '}
          {cart.items.length === 1 ? t('cart.item_one') : t('cart.item_other')}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-6">
          {cart.items.map((item, idx: number) => (
            <div
              key={idx}
              className="glass-card p-6 flex flex-col md:flex-row gap-6 animate-fade-in-up"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <div className="w-full md:w-32 h-32 rounded-2xl bg-blush-50 flex-shrink-0 overflow-hidden border border-cream-200 relative">
                {item.type === 'diamond' ? (
                  <DiamondCatalogMedia
                    alt=""
                    className="h-full w-full"
                    mediaClassName="h-full w-full object-contain p-3"
                    variant="card"
                  />
                ) : (
                  <img
                    src={itemImage(item.type)}
                    className="w-full h-full object-contain p-3"
                    alt="Product"
                  />
                )}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-serif text-2xl text-ink">{cartItemTypeLabel(t, item.type)}</h3>
                    <p className="text-[10px] text-ash uppercase tracking-[0.22em] font-medium">
                      {t('cart.sku')}: {item.productId}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(item.productId)}
                    className="p-2 text-ash hover:text-rose-700 transition-colors bg-transparent border-0 cursor-pointer disabled:opacity-40"
                    aria-label={t('cart.removeAria')}
                  >
                    <Trash2
                      size={18}
                      className={
                        removeMutation.isPending && removeMutation.variables === item.productId
                          ? 'animate-pulse'
                          : ''
                      }
                    />
                  </button>
                </div>
                <div className="flex items-center gap-6 mt-3">
                  <div className="text-sm text-ink-soft">{t('cart.quantity')}</div>
                  <div className="font-serif text-2xl text-ink">
                    ${item.price.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="pt-2">
            <Link
              to="/marketplace"
              className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-rose-gold-deep hover:text-ink transition-colors no-underline"
            >
              <RotateCcw size={14} /> {t('cart.continueShopping')}
            </Link>
          </div>

          {recommendations.length > 0 && (
            <div className="mt-16 space-y-6">
              <h2 className="font-serif text-3xl text-ink">{t('cart.suggestedTitle')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recommendations.slice(0, 2).map((item, i) => (
                  <div
                    key={i}
                    className="glass-card p-4 flex items-center gap-4 group"
                  >
                    <div className="w-20 h-20 rounded-xl bg-blush-50 overflow-hidden flex-shrink-0 border border-cream-200">
                      <img
                        src={resolveJewelryImage({
                          images: item.images,
                          category: item.category,
                          key: item.sku,
                        })}
                        className="w-full h-full object-contain p-2"
                        alt={item.title}
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-medium text-rose-gold-deep uppercase tracking-[0.22em] mb-1">
                        {item.category}
                      </p>
                      <h4 className="text-sm font-medium text-ink mb-2">{item.title}</h4>
                      <div className="flex items-center justify-between">
                        <span className="font-serif text-lg text-ink">
                          ${typeof item.price === 'number' ? item.price.toLocaleString() : '—'}
                        </span>
                        <button
                          type="button"
                          className="text-[10px] font-medium text-rose-gold-deep px-3 py-1.5 rounded-full bg-blush-50 border border-blush-200 hover:bg-blush-100 transition-all cursor-pointer uppercase tracking-[0.18em]"
                        >
                          {t('cart.addToBag')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="space-y-6">
          <div className="glass-card p-8 sticky top-32">
            <h2 className="font-serif text-3xl text-ink mb-6">{t('cart.summary')}</h2>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm text-ink-soft">
                <span>{t('cart.subtotal')}</span>
                <span>${cart.totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-ink-soft">
                <span>{t('cart.shipping')}</span>
                <span className="text-emerald-700 font-medium uppercase text-[10px] tracking-[0.18em]">
                  {t('cart.complimentary')}
                </span>
              </div>
              <div className="petal-divider mt-2" />
              <div className="pt-2 flex justify-between items-end">
                <span className="font-medium text-ink">{t('cart.total')}</span>
                <div className="text-right">
                  <div className="font-serif text-3xl font-light text-ink">
                    ${cart.totalAmount.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-ash uppercase tracking-[0.18em] mt-1">
                    {t('cart.taxIncluded')}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCheckout}
              className="btn-primary w-full py-5 text-sm font-medium uppercase tracking-[0.22em] flex items-center justify-center gap-2 mb-6"
            >
              {t('cart.checkoutNow')} <ArrowRight size={16} />
            </button>

            <div className="space-y-4 pt-4 border-t border-cream-200">
              <div className="flex items-start gap-3">
                <ShieldCheck size={16} className="text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-ink">{t('cart.warrantyTitle')}</p>
                  <p className="text-[10px] text-ink-soft mt-0.5">{t('cart.warrantyBody')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Truck size={16} className="text-rose-gold-deep shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-ink">{t('cart.insuredTitle')}</p>
                  <p className="text-[10px] text-ink-soft mt-0.5">{t('cart.insuredBody')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;
