import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpDown, Gem, Search, SlidersHorizontal } from '../components/icons';
import ScoreRing from '../components/ScoreRing';
import Seo from '../components/Seo';
import WishlistHeartButton from '../components/WishlistHeartButton';
import { apiJson, GATEWAY } from '../lib/api';
import { useBespoke } from '../context/useBespoke';
import { DiamondCatalogMedia } from '../components/DiamondCatalogMedia';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { DiamondDoc, SearchFilterResponse } from '../lib/contracts';
import type { DiamondShape } from '@stonee/shared-types';

type Diamond = DiamondDoc;

const SHAPES: DiamondShape[] = [
  'Round',
  'Oval',
  'Emerald',
  'Princess',
  'Cushion',
  'Pear',
  'Marquise',
  'Heart',
];
const COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J'];
const CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2'];

const getBadgeClass = (badge?: string) => {
  switch (badge?.toUpperCase()) {
    case 'BEST-VALUE':
    case 'BEST VALUE':
      return 'badge-best';
    case 'FAIR-DEAL':
    case 'FAIR DEAL':
      return 'badge-fair';
    case 'PREMIUM-CUT':
    case 'PREMIUM CUT':
      return 'badge-premium';
    case 'OVERPRICED':
      return 'bg-rose-50 text-rose-700 border border-rose-100';
    default:
      return 'bg-cream-100 text-ash border border-cream-200';
  }
};

type AvailabilityUI = {
  label: string;
  className: string;
  dotClassName: string;
};

const MarketplacePage: React.FC = () => {
  const { t } = useTranslation();
  const getAvailabilityUI = useCallback(
    (availability?: string): AvailabilityUI => {
      switch ((availability || '').toLowerCase()) {
        case 'in-stock':
          return {
            label: t('marketplace.availAvailable'),
            className: 'text-emerald-700',
            dotClassName: 'bg-emerald-500 animate-pulse',
          };
        case 'reserved':
          return {
            label: t('marketplace.availReserved'),
            className: 'text-amber-700',
            dotClassName: 'bg-amber-500',
          };
        case 'sold':
          return { label: t('marketplace.availSold'), className: 'text-rose-700', dotClassName: 'bg-rose-500' };
        default:
          return { label: t('marketplace.availUnknown'), className: 'text-ash', dotClassName: 'bg-ash-soft' };
      }
    },
    [t],
  );
  const { state, setDiamond } = useBespoke();
  const navigate = useNavigate();
  const [activeShape, setActiveShape] = useState<DiamondShape[]>([]);
  const [activeColor, setActiveColor] = useState<string[]>([]);
  const [activeClarity, setActiveClarity] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 15000]);
  const [caratRange, setCaratRange] = useState<[number, number]>([0, 5]);
  const [sortBy, setSortBy] = useState<string>('score-desc');
  const [showFilters, setShowFilters] = useState(false);
  const inventoryQuery = useQuery({
    queryKey: ['marketplace', 'inventory-shapes'],
    queryFn: async () => {
      const params = new URLSearchParams({
        minPrice: '0',
        maxPrice: '999999',
        minCarat: '0',
        maxCarat: '99',
        sort: 'score-desc',
      });
      const json = (await apiJson<Diamond[]>(
        `${GATEWAY.search}/filter?${params.toString()}`,
      )) as SearchFilterResponse;
      if (!json.success) return new Set<DiamondShape>();
      const shapes = new Set<DiamondShape>();
      json.data.forEach(d => shapes.add(d.shape as DiamondShape));
      return shapes;
    },
    staleTime: 5 * 60 * 1000,
  });
  const inventoryShapes = useMemo(
    () => inventoryQuery.data ?? new Set<DiamondShape>(),
    [inventoryQuery.data],
  );

  // Final shape pool the user may pick from = real inventory ∩ setting compat.
  const availableShapes = useMemo<DiamondShape[]>(
    () =>
      SHAPES.filter(shape => {
        const inStock = inventoryShapes.size === 0 || inventoryShapes.has(shape);
        const fitsSetting =
          !state.setting || state.setting.compatibleShapes.includes(shape);
        return inStock && fitsSetting;
      }),
    [inventoryShapes, state.setting],
  );

  // If the available pool changed (e.g. user picked a setting), prune any
  // active filter that's no longer reachable.
  useEffect(() => {
    setActiveShape(curr => curr.filter(s => availableShapes.includes(s)));
  }, [availableShapes]);

  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams();
    let shapesToQuery: DiamondShape[] = [];

    if (state.setting) {
      if (activeShape.length > 0) {
        shapesToQuery = activeShape.filter(s => state.setting!.compatibleShapes.includes(s));
      } else {
        shapesToQuery = state.setting.compatibleShapes;
      }
    } else if (activeShape.length > 0) {
      shapesToQuery = activeShape;
    }

    if (shapesToQuery.length > 0) params.append('shape', shapesToQuery.join(','));
    if (activeColor.length > 0) params.append('color', activeColor.join(','));
    if (activeClarity.length > 0) params.append('clarity', activeClarity.join(','));
    params.append('minPrice', priceRange[0].toString());
    params.append('maxPrice', priceRange[1].toString());
    params.append('minCarat', caratRange[0].toString());
    params.append('maxCarat', caratRange[1].toString());
    params.append('sort', sortBy);
    return params.toString();
  }, [activeShape, activeColor, activeClarity, priceRange, caratRange, sortBy, state.setting]);

  const debouncedFilterQs = useDebouncedValue(filterQueryString, 300);

  const diamondsQuery = useQuery({
    queryKey: ['marketplace', 'diamonds', debouncedFilterQs],
    queryFn: async () => {
      const json = (await apiJson<Diamond[]>(
        `${GATEWAY.search}/filter?${debouncedFilterQs}`,
      )) as SearchFilterResponse;
      if (!json.success) return [];
      return json.data;
    },
    placeholderData: keepPreviousData,
  });

  const diamonds = diamondsQuery.data ?? [];
  const loading = diamondsQuery.isPending && diamonds.length === 0;

  const toggleFilter = <T,>(list: T[], item: T, setter: (val: T[]) => void) => {
    if (list.includes(item)) setter(list.filter(i => i !== item));
    else setter([...list, item]);
  };

  const dealDisplay = useCallback(
    (badge?: string) => {
      if (!badge) return '';
      const n = badge.toUpperCase().replace(/-/g, ' ');
      if (n.includes('BEST')) return t('marketplace.dealBestValue');
      if (n.includes('FAIR')) return t('marketplace.dealFairDeal');
      if (n.includes('PREMIUM')) return t('marketplace.dealPremiumCut');
      if (n.includes('OVER')) return t('marketplace.dealOverpriced');
      return badge;
    },
    [t],
  );

  return (
    <>
      <Seo
        title={`${t('marketplace.title')} ${t('marketplace.titleItalic')}`}
        description={t('marketplace.seoDescription')}
        path="/marketplace"
      />
      <div className="pt-28 pb-16 px-4 relative z-10">
      <div className="max-w-7xl mx-auto">
        {/* Bespoke Selection Strip */}
        {(state.diamond || state.setting) && (
          <div className="glass-card rounded-2xl p-4 mb-8 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {state.setting && (
                  <span className="w-9 h-9 rounded-full bg-blush-100 border border-blush-200 text-rose-gold-deep flex items-center justify-center text-[10px] font-medium uppercase tracking-wider">
                    {t('marketplace.badgeRing')}
                  </span>
                )}
                {state.diamond && (
                  <span className="w-9 h-9 rounded-full bg-cream-100 border border-cream-200 text-rose-gold-deep flex items-center justify-center text-[10px] font-medium uppercase tracking-wider">
                    {t('marketplace.badgeGem')}
                  </span>
                )}
              </div>
              <div className="text-sm">
                <span className="text-ash">{t('marketplace.yourSelection')} </span>
                <span className="font-medium text-ink">
                  {state.setting ? state.setting.name : t('marketplace.noSetting')}
                  {' + '}
                  {state.diamond ? `${state.diamond.carat}ct ${state.diamond.shape}` : t('marketplace.noStone')}
                </span>
              </div>
            </div>
            <Link
              to="/craft"
              className="glass-button px-6 py-2 text-xs font-medium uppercase tracking-[0.18em] no-underline"
            >
              {t('marketplace.openAtelier')}
            </Link>
          </div>
        )}

        {/* Header */}
        <div className="mb-10 animate-fade-in-up">
          <h1 className="font-serif text-5xl md:text-6xl font-light mb-3 text-ink">
            {t('marketplace.title')} <span className="text-gradient italic">{t('marketplace.titleItalic')}</span>
          </h1>
          <p className="text-ink-soft text-base">
            {t('marketplace.browseLive', { count: diamonds.length })}
            {state.setting && (
              <span className="text-rose-gold-deep ml-2">
                {t('marketplace.filteredFor', { name: state.setting.name })}
              </span>
            )}
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="glass-card rounded-2xl p-4 mb-8 animate-fade-in-up animate-delay-100">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ash" size={18} />
              <input
                type="text"
                placeholder={t('marketplace.searchPlaceholder')}
                className="glass-input w-full py-3 pl-12 pr-4 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="glass-button px-6 py-3 flex items-center gap-2 text-sm"
            >
              <SlidersHorizontal size={16} /> {t('marketplace.filters')}
            </button>
            <div className="flex items-center gap-2 glass-button px-4 py-2">
              <ArrowUpDown size={14} />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-transparent border-none text-sm text-ink focus:outline-none cursor-pointer"
              >
                <option value="score-desc">{t('marketplace.sortScore')}</option>
                <option value="price-asc">{t('marketplace.sortPriceAsc')}</option>
                <option value="price-desc">{t('marketplace.sortPriceDesc')}</option>
              </select>
            </div>
          </div>

          {showFilters && (
            <div className="mt-6 pt-6 grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in-up border-t border-cream-200">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.22em] text-ash mb-3 block">
                    {t('marketplace.priceRange')}
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={0}
                      max={15000}
                      value={priceRange[1]}
                      onChange={e => setPriceRange([priceRange[0], Number(e.target.value)])}
                      className="w-full accent-[color:var(--rose-gold)]"
                    />
                    <span className="text-sm font-mono text-ink-soft w-24 text-right">
                      ${priceRange[1].toLocaleString()}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.22em] text-ash mb-3 block">
                    {t('marketplace.color')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleFilter(activeColor, c, setActiveColor)}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-medium transition-all border ${
                          activeColor.includes(c)
                            ? 'bg-rose-gold text-white border-[color:var(--rose-gold)]'
                            : 'bg-cream-100 text-ink-soft border-cream-200 hover:bg-blush-50'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.22em] text-ash mb-3 block">
                    {t('marketplace.caratRange')}
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={0.1}
                      value={caratRange[1]}
                      onChange={e => setCaratRange([caratRange[0], Number(e.target.value)])}
                      className="w-full accent-[color:var(--mauve)]"
                    />
                    <span className="text-sm font-mono text-ink-soft w-24 text-right">
                      {caratRange[1]} ct
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.22em] text-ash mb-3 block">
                    {t('marketplace.clarity')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CLARITIES.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleFilter(activeClarity, c, setActiveClarity)}
                        className={`px-3 h-9 rounded-lg flex items-center justify-center text-[10px] font-medium transition-all border ${
                          activeClarity.includes(c)
                            ? 'bg-mauve text-white border-mauve'
                            : 'bg-cream-100 text-ink-soft border-cream-200 hover:bg-blush-50'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Shape filter — quiet by default, bright with a halo when picked. */}
        <div className="flex flex-wrap gap-2 pb-6 mb-10 animate-fade-in-up animate-delay-200">
          {availableShapes.length === 0 && inventoryShapes.size > 0 && (
            <p className="text-xs text-ash italic px-2">
              {t('marketplace.noShapesCombo')}
            </p>
          )}
          {(availableShapes.length > 0 || inventoryShapes.size === 0) && (
            <button
              type="button"
              onClick={() => setActiveShape([])}
              aria-pressed={activeShape.length === 0}
              className={`px-6 py-2.5 rounded-full text-xs font-medium uppercase tracking-[0.18em] whitespace-nowrap transition-all duration-300 border-2 ${
                activeShape.length === 0
                  ? 'bg-blush-50 border-rose-gold text-rose-gold-deep shadow-[0_6px_20px_rgba(207,154,133,0.20)]'
                  : 'bg-transparent border-cream-200 text-ash hover:text-ink-soft hover:border-blush-200'
              }`}
            >
              {t('marketplace.allShapes')}
            </button>
          )}
          {availableShapes.map(shape => {
            const isActive = activeShape.includes(shape);
            return (
              <button
                key={shape}
                type="button"
                onClick={() => toggleFilter(activeShape, shape, setActiveShape)}
                aria-pressed={isActive}
                className={`px-6 py-2.5 rounded-full text-xs font-medium uppercase tracking-[0.18em] whitespace-nowrap transition-all duration-300 border-2 flex items-center gap-2.5 cursor-pointer ${
                  isActive
                    ? 'bg-blush-50 border-rose-gold text-rose-gold-deep shadow-[0_6px_20px_rgba(207,154,133,0.20)]'
                    : 'bg-transparent border-cream-200 text-ash hover:text-ink-soft hover:border-blush-200'
                }`}
              >
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-rose-gold" />}
                {shape}
              </button>
            );
          })}
        </div>

        {/* Diamond Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="glass-card h-72 shimmer-loading" />
            ))}
          </div>
        ) : diamonds.length === 0 ? (
          <div className="glass-card p-16 text-center">
            <Gem size={42} className="text-ash-soft mx-auto mb-4" />
            <h3 className="font-serif text-2xl text-ink mb-1">{t('marketplace.noDiamondsTitle')}</h3>
            <p className="text-ink-soft text-sm">{t('marketplace.noDiamondsHint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {diamonds.map((diamond, idx) => {
              const availabilityUI = getAvailabilityUI(diamond.availability);
              const isSold = (diamond.availability || '').toLowerCase() === 'sold';
              const isReserved = (diamond.availability || '').toLowerCase() === 'reserved';
              const isSelectable = !isSold && !isReserved;

              return (
                <Link
                  to={`/diamond/${diamond._id}`}
                  key={diamond._id}
                  className={`glass-card product-card-lift overflow-hidden group no-underline animate-fade-in-up ${
                    isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60 grayscale'
                  }`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-blush-50 rounded-t-[1.75rem]">
                    <DiamondCatalogMedia
                      images={diamond.images}
                      videoUrl={diamond.videoUrl}
                      alt={diamond.shape}
                      className="absolute inset-0"
                      mediaClassName="h-full w-full object-contain p-8 transition-transform duration-700 group-hover:scale-105"
                      variant="card"
                    />

                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                      {diamond.dealBadge && (
                        <span
                          className={`text-[10px] font-medium px-3 py-1 rounded-full uppercase tracking-[0.18em] ${getBadgeClass(diamond.dealBadge)}`}
                        >
                          {dealDisplay(diamond.dealBadge)}
                        </span>
                      )}
                    </div>

                    {diamond.diamondScore && (
                      <div className="absolute top-4 right-4">
                        <ScoreRing score={diamond.diamondScore} size={50} strokeWidth={4} />
                      </div>
                    )}
                    <div className="absolute bottom-3 right-3 z-20">
                      <WishlistHeartButton
                        stopNavigation
                        size="sm"
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
                      />
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-serif text-2xl text-ink group-hover:text-rose-gold-deep transition-colors">
                          {diamond.carat}ct {diamond.shape}
                        </h3>
                        <div className="flex gap-2 text-[11px] text-ash uppercase tracking-[0.18em] mt-1.5">
                          <span>{diamond.color}</span>
                          <span>•</span>
                          <span>{diamond.clarity}</span>
                          <span>•</span>
                          <span>{diamond.cut}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-serif text-2xl text-ink">
                          ${diamond.price.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-ash uppercase tracking-[0.18em]">
                          {t('marketplace.atelierPrice')}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-4 border-y border-cream-200 mb-4">
                      <div className="text-center">
                        <div className="text-[10px] text-ash uppercase tracking-[0.18em] mb-1">
                          {t('marketplace.depth')}
                        </div>
                        <div className="text-xs text-ink-soft">
                          {diamond.depthPercentage ? `${diamond.depthPercentage}%` : '—'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-ash uppercase tracking-[0.18em] mb-1">
                          {t('marketplace.table')}
                        </div>
                        <div className="text-xs text-ink-soft">
                          {diamond.tablePercentage ? `${diamond.tablePercentage}%` : '—'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-ash uppercase tracking-[0.18em] mb-1">
                          {t('marketplace.lab')}
                        </div>
                        <div className="text-xs font-medium text-emerald-700 uppercase tracking-wider">
                          {diamond.lab}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] text-ash font-mono">SKU: {diamond.sku}</span>
                      <div className={`flex items-center gap-1.5 ${availabilityUI.className}`}>
                        <span className="text-[10px] font-medium uppercase tracking-[0.18em]">
                          {availabilityUI.label}
                        </span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${availabilityUI.dotClassName}`}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!isSelectable) return;
                        setDiamond(diamond);
                        navigate('/craft');
                      }}
                      className={`w-full py-3 rounded-full text-xs font-medium uppercase tracking-[0.22em] transition-all border ${
                        isSelectable
                          ? 'bg-blush-50 border-blush-200 text-rose-gold-deep hover:bg-blush-100 cursor-pointer'
                          : 'bg-cream-100 border-cream-200 text-ash cursor-not-allowed'
                      }`}
                    >
                      {isSelectable ? t('marketplace.selectForPiece') : t('marketplace.notAvailable')}
                    </button>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default MarketplacePage;
