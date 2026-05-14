import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Award, FileCheck, Gem, Info, Loader2, Share2, Shield, ShoppingCart } from '../components/icons';
import ScoreRing from '../components/ScoreRing';
import EducationSection from '../components/EducationSection';
import Seo from '../components/Seo';
import WishlistHeartButton from '../components/WishlistHeartButton';
import { apiJson, GATEWAY } from '../lib/api';
import { orderQueryKeys } from '../lib/orderQuery';
import { getSessionId } from '../lib/session';
import { DiamondCatalogMedia } from '../components/DiamondCatalogMedia';
import { pickDiamondCatalogImage, resolveJewelryImage } from '../lib/imageFallback';
import type { DiamondDoc, JewelryDoc, RecommendationsMatchResponse } from '../lib/contracts';

type Diamond = DiamondDoc;

const getBadgeClass = (badge?: string) => {
  switch (badge?.toUpperCase()) {
    case 'BEST VALUE':
      return 'badge-best';
    case 'FAIR DEAL':
      return 'badge-fair';
    case 'PREMIUM CUT':
      return 'badge-premium';
    default:
      return 'bg-cream-100 text-ink-soft border border-cream-200';
  }
};

const DiamondDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [addingToCart, setAddingToCart] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const diamondQuery = useQuery({
    queryKey: ['diamond', id],
    queryFn: async () => {
      const json = await apiJson<Diamond>(`${GATEWAY.catalog}/${id}`);
      if (!json.success) throw new Error('Diamond not found');
      return json.data;
    },
    enabled: Boolean(id),
  });

  const recQuery = useQuery({
    queryKey: ['recommendations', 'jewelry', diamondQuery.data?.sku],
    queryFn: async () => {
      const sku = diamondQuery.data!.sku;
      const enc = encodeURIComponent(sku);
      const data = (await apiJson<JewelryDoc[]>(
        `${GATEWAY.recommendations}/match/${enc}`,
      )) as RecommendationsMatchResponse;
      if (!data.success || !Array.isArray(data.data)) return [];
      return data.data;
    },
    enabled: Boolean(id) && diamondQuery.isSuccess && Boolean(diamondQuery.data?.sku),
  });

  const diamond = diamondQuery.data ?? null;
  const recommendations = recQuery.data ?? [];
  const loading = Boolean(id) && diamondQuery.isPending;

  /** Hooks must run every render — never place after early returns (fixes "more hooks than previous render"). */
  const specs = useMemo(() => {
    if (!diamond) return [];
    return [
      { label: t('diamond.specShape'), value: diamond.shape, icon: <Gem size={16} /> },
      {
        label: t('diamond.specCarat'),
        value: `${diamond.carat} ct`,
        icon: <span className="text-[10px] font-medium tracking-wider">CT</span>,
      },
      {
        label: t('diamond.specColor'),
        value: diamond.color,
        icon: <span className="text-[10px] font-medium tracking-wider">CO</span>,
      },
      {
        label: t('diamond.specClarity'),
        value: diamond.clarity,
        icon: <span className="text-[10px] font-medium tracking-wider">CL</span>,
      },
      { label: t('diamond.specCut'), value: diamond.cut, icon: <Award size={16} /> },
      { label: t('diamond.specPolish'), value: diamond.polish || '—', icon: <Gem size={16} /> },
      { label: t('diamond.specSymmetry'), value: diamond.symmetry || '—', icon: <Info size={16} /> },
      { label: t('diamond.specFluorescence'), value: diamond.fluorescence || '—', icon: <Info size={16} /> },
    ];
  }, [diamond, t]);

  const productJsonLd = useMemo(() => {
    if (!diamond) return undefined;
    const imgPath = pickDiamondCatalogImage(diamond.images);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const payload: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${diamond.carat} ct ${diamond.shape} lab-grown diamond`,
      sku: diamond.sku,
      description: `${diamond.lab} ${diamond.certificateNumber || ''}`.trim(),
      offers: {
        '@type': 'Offer',
        priceCurrency: 'USD',
        price: String(diamond.price),
        availability: 'https://schema.org/InStock',
      },
    };
    if (imgPath) {
      const imageUrl = imgPath.startsWith('http')
        ? imgPath
        : `${origin}${imgPath.startsWith('/') ? imgPath : `/${imgPath}`}`;
      payload.image = imageUrl;
    }
    return JSON.stringify(payload);
  }, [diamond]);

  const dealDisplay = (badge?: string) => {
    if (!badge) return '';
    const n = badge.toUpperCase().replace(/-/g, ' ');
    if (n.includes('BEST')) return t('marketplace.dealBestValue');
    if (n.includes('FAIR')) return t('marketplace.dealFairDeal');
    if (n.includes('PREMIUM')) return t('marketplace.dealPremiumCut');
    return badge;
  };

  const handleAddToCart = async () => {
    if (!diamond) return;
    setAddingToCart(true);
    try {
      const sessionId = getSessionId();
      const data = await apiJson(`${GATEWAY.order}/cart/${sessionId}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'diamond',
          productId: diamond.sku,
          price: diamond.price,
          quantity: 1,
        }),
      });
      if (data.success) {
        void queryClient.invalidateQueries({ queryKey: orderQueryKeys.carts() });
        navigate('/cart');
      }
    } catch (err) {
      console.error('Add to cart failed:', err);
    } finally {
      setAddingToCart(false);
    }
  };

  if (loading) {
    return (
      <div className="pt-32 pb-16 px-6 max-w-7xl mx-auto">
        <Seo title="Stonee · Diamond" description="Loading certified lab-grown diamond." path="/marketplace" />
        <div className="h-[700px] glass-card-premium shimmer-loading" />
      </div>
    );
  }

  if (!diamond) {
    return (
      <div className="pt-32 pb-16 px-6 max-w-7xl mx-auto text-center min-h-[60vh] flex flex-col items-center justify-center">
        <Seo
          title={t('diamond.notFoundTitle')}
          description={t('diamond.notFoundTitle')}
          path="/marketplace"
          noIndex
        />
        <Gem size={64} className="text-ash-soft mb-6" />
        <h1 className="font-serif text-4xl text-ink-soft mb-6">{t('diamond.notFoundTitle')}</h1>
        <Link
          to="/marketplace"
          className="glass-button px-8 py-3 text-sm font-medium uppercase tracking-[0.18em] no-underline"
        >
          {t('diamond.notFoundCta')}
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-20 relative z-10 animate-fade-in-up">
      <Seo
        title={t('diamond.seoTitle', { carat: diamond.carat, shape: diamond.shape })}
        description={t('diamond.seoDescription', {
          carat: diamond.carat,
          shape: diamond.shape,
          color: diamond.color,
          clarity: diamond.clarity,
          lab: diamond.lab,
          cert: diamond.certificateNumber || '—',
        })}
        path={`/diamond/${diamond._id}`}
        jsonLd={productJsonLd}
      />
      <div className="max-w-7xl mx-auto px-6">
        {/* Navigation / Actions */}
        <div className="flex items-center justify-between mb-12">
          <Link
            to="/marketplace"
            className="inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-ink-soft hover:text-rose-gold-deep transition-all no-underline group"
          >
            <span className="w-10 h-10 rounded-full glass flex items-center justify-center group-hover:-translate-x-1 transition-transform">
              <ArrowLeft size={16} />
            </span>
            {t('diamond.backMarketplace')}
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="w-10 h-10 rounded-full glass flex items-center justify-center text-ink-soft hover:text-rose-gold-deep transition-colors"
              aria-label={t('diamond.shareAria')}
            >
              <Share2 size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* LEFT: Visuals */}
          <div className="lg:col-span-7 space-y-6">
            <div className="glass-card-premium p-4 aspect-square flex flex-col items-center justify-center relative group overflow-hidden">
              <DiamondCatalogMedia
                images={diamond.images}
                videoUrl={diamond.videoUrl}
                alt={`${diamond.carat} ct ${diamond.shape} lab-grown diamond, ${diamond.color} ${diamond.clarity}`}
                className="relative z-10 h-full w-full min-h-0"
                mediaClassName="h-full w-full object-contain p-8 transition-transform duration-1000 group-hover:scale-105"
                variant="detail"
              />
              <div className="absolute bottom-6 left-6 z-20">
                <div className="glass-card px-4 py-2.5 rounded-full flex items-center gap-3">
                  <FileCheck size={18} className="text-emerald-700" />
                  <div>
                    <div className="text-[9px] text-ash uppercase tracking-[0.18em]">
                      {t('diamond.verifiedReport')}
                    </div>
                    <div className="text-xs font-medium text-emerald-700">
                      {diamond.lab} {diamond.certificateNumber}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map(i => {
                const thumbImg = diamond.images?.[i];
                const showVideoThumb = !thumbImg && i === 1 && Boolean(diamond.videoUrl?.trim());
                return (
                  <div
                    key={i}
                    className="glass-card aspect-video relative overflow-hidden group cursor-pointer"
                  >
                    {thumbImg ? (
                      <img
                        src={thumbImg}
                        alt={t('diamond.angleAlt')}
                        className="h-full w-full object-contain p-4 opacity-80 transition-opacity group-hover:opacity-100"
                      />
                    ) : showVideoThumb ? (
                      <DiamondCatalogMedia
                        images={undefined}
                        videoUrl={diamond.videoUrl}
                        alt={t('diamond.angleAlt')}
                        className="absolute inset-0"
                        mediaClassName="h-full w-full object-contain p-2"
                        variant="card"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-blush-50/80 to-cream-50/80">
                        <Gem size={28} className="text-rose-gold-deep/30" aria-hidden />
                      </div>
                    )}
                    {i === 1 && diamond.videoUrl?.trim() && !diamond.images?.[1] && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/25 text-[10px] font-medium uppercase tracking-[0.22em] text-white backdrop-blur-[2px]">
                        {t('diamond.video360')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Info */}
          <div className="lg:col-span-5 space-y-10">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {diamond.dealBadge && (
                  <span
                    className={`text-[10px] font-medium px-3 py-1 rounded-full tracking-[0.18em] uppercase ${getBadgeClass(diamond.dealBadge)}`}
                  >
                    {dealDisplay(diamond.dealBadge)}
                  </span>
                )}
                <span className="text-[10px] font-medium px-3 py-1 rounded-full tracking-[0.18em] uppercase bg-cream-100 border border-cream-200 text-ink-soft">
                  {t('diamond.labGrown')}
                </span>
              </div>
              <h1 className="font-serif text-6xl md:text-7xl font-light leading-none text-ink">
                {diamond.carat}ct <span className="text-gradient italic">{diamond.shape}</span>
              </h1>
              <div className="flex items-center gap-3 text-ash text-xs">
                <span className="font-mono">SKU: {diamond.sku}</span>
                <span>•</span>
                <span className="text-emerald-700 font-medium uppercase tracking-[0.18em]">
                  {t('diamond.inStockShip')}
                </span>
              </div>
            </div>

            {diamond.diamondScore && (
              <div className="glass-card p-1 relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 w-2 bg-rose-gold" />
                <div className="p-6 flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
                      {t('diamond.scoreTitle')}
                    </h3>
                    <p className="text-xs text-ink-soft max-w-[220px]">{t('diamond.scoreBlurb')}</p>
                  </div>
                  <ScoreRing score={diamond.diamondScore} size={84} strokeWidth={6} />
                </div>
              </div>
            )}

            <div className="space-y-6">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] text-ash font-medium uppercase tracking-[0.22em] mb-2">
                    {t('diamond.atelierPrice')}
                  </div>
                  <div className="font-serif text-6xl font-light tracking-tight text-ink">
                    ${diamond.price.toLocaleString()}
                  </div>
                </div>
                <div className="text-right pb-1">
                  <div className="text-xs text-ash uppercase tracking-[0.18em]">
                    {t('diamond.estRetail', { price: Math.round(diamond.price * 1.4).toLocaleString() })}
                  </div>
                  <div className="text-xs font-medium text-emerald-700">{t('diamond.youSave')}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={addingToCart}
                  className="btn-primary py-5 text-sm font-medium uppercase tracking-[0.22em] flex items-center justify-center gap-3 cursor-pointer"
                >
                  {addingToCart ? (
                    <Loader2 size={20} />
                  ) : (
                    <>
                      <ShoppingCart size={18} /> {t('diamond.addToCart')}
                    </>
                  )}
                </button>
                <div className="flex justify-center items-center">
                  <WishlistHeartButton
                    diamond={{
                      catalogId: diamond._id,
                      sku: diamond.sku,
                      price: diamond.price,
                      shape: diamond.shape,
                      carat: diamond.carat,
                      color: diamond.color,
                      clarity: diamond.clarity,
                      images: diamond.images,
                      videoUrl: diamond.videoUrl,
                    }}
                    className="h-[52px] w-[52px] flex items-center justify-center"
                  />
                </div>
                <button
                  type="button"
                  className="glass-button py-5 text-sm font-medium uppercase tracking-[0.22em] cursor-pointer"
                >
                  {t('diamond.reserve')}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="glass-card p-4 flex items-center gap-3">
                  <Shield size={18} className="text-rose-gold-deep" />
                  <span className="text-[10px] font-medium text-ink-soft uppercase leading-tight">
                    {t('diamond.lifetimeWarranty').split('\n').map((line, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <br />}
                        {line}
                      </React.Fragment>
                    ))}
                  </span>
                </div>
                <div className="glass-card p-4 flex items-center gap-3">
                  <Award size={18} className="text-mauve" />
                  <span className="text-[10px] font-medium text-ink-soft uppercase leading-tight">
                    {t('diamond.conflictFree').split('\n').map((line, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <br />}
                        {line}
                      </React.Fragment>
                    ))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Technical Specifications */}
        <div className="mt-24 space-y-8 animate-fade-in-up animate-delay-300">
          <div className="flex items-baseline gap-4">
            <h2 className="font-serif text-4xl font-light text-ink">{t('diamond.techSpecs')}</h2>
            <div className="petal-divider" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {specs.map(item => (
              <div key={item.label} className="glass-card p-6 group">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-8 h-8 rounded-full bg-blush-50 flex items-center justify-center text-rose-gold-deep">
                    {item.icon}
                  </span>
                  <span className="text-[10px] text-ash font-medium uppercase tracking-[0.18em] leading-none">
                    {item.label}
                  </span>
                </div>
                <div className="font-serif text-2xl text-ink">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-32">
          <EducationSection />
        </div>

        {recommendations.length > 0 && (
          <div className="mt-32 space-y-12 animate-fade-in-up">
            <div className="text-center space-y-4">
              <h2 className="font-serif text-5xl font-light text-ink">
                {t('diamond.completeLookTitle')} <span className="text-gradient italic">{t('diamond.completeLookItalic')}</span>
              </h2>
              <p className="text-ink-soft text-base">{t('diamond.completeLookSubtitle')}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recommendations.slice(0, 3).map((item, idx) => (
                <div key={idx} className="glass-card group overflow-hidden">
                  <div className="aspect-square relative bg-blush-50 overflow-hidden">
                    <img
                      src={resolveJewelryImage({
                        images: item.images,
                        category: item.category,
                        key: item.sku,
                      })}
                      className="w-full h-full object-contain p-8 transition-transform duration-700 group-hover:scale-105"
                      alt={item.title}
                    />
                  </div>
                  <div className="p-6 space-y-3">
                    <div className="text-[10px] font-medium text-rose-gold-deep uppercase tracking-[0.22em]">
                      {item.category}
                    </div>
                    <h3 className="font-serif text-xl text-ink">{item.title}</h3>
                    <div className="flex items-center justify-between pt-3 border-t border-cream-200">
                      <span className="font-serif text-2xl text-ink">
                        ${typeof item.price === 'number' ? item.price.toLocaleString() : '—'}
                      </span>
                      <button
                        type="button"
                        className="p-2.5 rounded-full bg-blush-50 border border-blush-200 text-rose-gold-deep hover:bg-blush-100 transition-colors cursor-pointer"
                        aria-label={t('diamond.addToCartAria')}
                      >
                        <ShoppingCart size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiamondDetailPage;
