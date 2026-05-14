import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Flower2, Loader2, Pencil, Receipt, RotateCcw, ShoppingBag, Sparkles, Trash2 } from '../components/icons';
import BrandMark from '../components/BrandMark';
import { DiamondCatalogMedia } from '../components/DiamondCatalogMedia';
import { inferSettingType, type DiamondShape, type JewelryCategory, type SettingType } from '@stonee/shared-types';

import { useBespoke } from '../context/useBespoke';
import {
  dealBadgeLabel,
  diamondShapeLabel,
  pieceMetalColorStyleLine,
  settingCatalogName,
  settingTypeLabel,
  settingTypeTagline,
} from '../lib/displayI18n';
import { useQueryClient } from '@tanstack/react-query';
import { apiJson, GATEWAY } from '../lib/api';
import { orderQueryKeys } from '../lib/orderQuery';
import { orderKycBlockKind, userVisibleOrderError } from '../lib/orderApiErrors';
import { getSessionId } from '../lib/session';
import { resolveSettingImage } from '../lib/imageFallback';
import type { ApiResponse, DiamondDoc, JewelrySettingsResponse, SettingDoc } from '../lib/contracts';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const ALL_CATEGORIES: JewelryCategory[] = ['Ring', 'Earrings', 'Necklace', 'Bracelet'];

const CATEGORY_I18N: Record<JewelryCategory, 'craft.catRing' | 'craft.catEarrings' | 'craft.catNecklace' | 'craft.catBracelet'> = {
  Ring: 'craft.catRing',
  Earrings: 'craft.catEarrings',
  Necklace: 'craft.catNecklace',
  Bracelet: 'craft.catBracelet',
};

const settingTypeOf = (s: SettingDoc): SettingType =>
  s.settingType ?? inferSettingType(s.style);

const settingCategoryOf = (s: SettingDoc): JewelryCategory =>
  s.category ?? 'Ring';

/* -------------------------------------------------------------------------- */
/*  Stepper                                                                    */
/* -------------------------------------------------------------------------- */

const Stepper: React.FC<{
  current: 'jewelry' | 'diamond' | 'summary';
  steps: { id: 'jewelry' | 'diamond' | 'summary'; label: string }[];
}> = ({ current, steps }) => {
  const idx = steps.findIndex(s => s.id === current);
  return (
    <div className="max-w-3xl mx-auto mb-12">
      <div className="flex items-center">
        {steps.map((step, i) => {
          const status = i < idx ? 'done' : i === idx ? 'active' : 'todo';
          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center min-w-[110px]">
                <div
                  className={`step-dot ${
                    status === 'active'
                      ? 'step-dot-active'
                      : status === 'done'
                      ? 'step-dot-done'
                      : 'step-dot-todo'
                  }`}
                >
                  {status === 'done' ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span
                  className={`text-[11px] uppercase tracking-[0.18em] mt-3 font-medium ${
                    status === 'todo' ? 'text-ash-soft' : 'text-ink-soft'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && <div className="step-bar" />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Step 1 — Choose jewelry (setting)                                          */
/* -------------------------------------------------------------------------- */

const StepJewelry: React.FC = () => {
  const { t } = useTranslation();
  const { setSetting } = useBespoke();
  const [settings, setSettings] = useState<SettingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<JewelryCategory | 'All'>('All');
  const [activeType, setActiveType] = useState<SettingType | 'All'>('All');

  useEffect(() => {
    apiJson<SettingDoc[]>(`${GATEWAY.jewelry}/settings`)
      .then(json => {
        const typed = json as JewelrySettingsResponse;
        if (typed.success) setSettings(typed.data);
      })
      .catch(err => console.error('Failed to load settings:', err))
      .finally(() => setLoading(false));
  }, []);

  const availableTypes = useMemo<SettingType[]>(() => {
    const set = new Set<SettingType>();
    settings.forEach(s => set.add(settingTypeOf(s)));
    return Array.from(set);
  }, [settings]);

  const filtered = useMemo(() => {
    return settings.filter(s => {
      if (activeCategory !== 'All' && settingCategoryOf(s) !== activeCategory) return false;
      if (activeType !== 'All' && settingTypeOf(s) !== activeType) return false;
      return true;
    });
  }, [settings, activeCategory, activeType]);

  return (
    <div>
      <div className="text-center mb-12 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blush-50 border border-blush-200/60 text-rose-gold-deep text-xs font-medium tracking-wider mb-6">
          <Flower2 className="w-3.5 h-3.5" />
          <span className="uppercase tracking-[0.2em]">{t('craft.stepOneBadge')}</span>
        </div>
        <h1 className="font-serif text-5xl md:text-6xl font-light mb-4 text-ink">
          {t('craft.stepOneTitle')} <span className="text-gradient italic">{t('craft.stepOneTitleItalic')}</span>
        </h1>
        <p className="text-ink-soft text-base max-w-xl mx-auto">{t('craft.stepOneDesc')}</p>
      </div>

      {/* Filters */}
      <div className="space-y-4 mb-10">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <FilterPill active={activeCategory === 'All'} onClick={() => setActiveCategory('All')}>
            {t('craft.allPieces')}
          </FilterPill>
          {ALL_CATEGORIES.map(cat => (
            <FilterPill
              key={cat}
              active={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
            >
              {t(CATEGORY_I18N[cat])}
            </FilterPill>
          ))}
        </div>
        {availableTypes.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <FilterPill subtle active={activeType === 'All'} onClick={() => setActiveType('All')}>
              {t('craft.anySetting')}
            </FilterPill>
            {availableTypes.map(stType => (
              <FilterPill
                key={stType}
                subtle
                active={activeType === stType}
                onClick={() => setActiveType(stType)}
              >
                {settingTypeLabel(t, stType)}
              </FilterPill>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-card h-96 shimmer-loading" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-ash">
          {t('craft.noFilterMatch')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filtered.map((setting, idx) => (
            <SettingCard
              key={setting._id}
              setting={setting}
              delay={(idx % 3) * 100}
              onSelect={() => setSetting(setting)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const FilterPill: React.FC<{
  active?: boolean;
  subtle?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, subtle, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-5 py-2 rounded-full text-xs font-medium tracking-wide transition-all duration-300 border ${
      active
        ? 'bg-rose-gold text-white border-[color:var(--rose-gold)] shadow-[0_8px_22px_rgba(207,154,133,0.30)]'
        : subtle
        ? 'bg-surface-elev/70 text-ink-soft border-cream-200 hover:border-blush-300 hover:text-rose-gold-deep'
        : 'bg-surface-elev text-ink-soft border-cream-200 hover:bg-blush-50 hover:border-blush-300'
    }`}
  >
    {children}
  </button>
);

const SettingCard: React.FC<{
  setting: SettingDoc;
  delay: number;
  onSelect: () => void;
}> = ({ setting, delay, onSelect }) => {
  const { t, i18n } = useTranslation();
  const type = settingTypeOf(setting);
  const displayName = settingCatalogName(t, setting.sku, setting.name);
  const priceLocale = i18n.language.startsWith('en') ? 'en-US' : 'ru-RU';
  return (
    <article
      className="glass-card overflow-hidden group animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="aspect-[4/3] bg-blush-50 relative overflow-hidden">
        <img
          src={resolveSettingImage({
            images: setting.images,
            category: settingCategoryOf(setting),
            style: setting.style,
            settingType: type,
            key: setting.sku,
          })}
          alt={displayName}
          className="w-full h-full object-contain p-6 group-hover:scale-105 transition-transform duration-700"
        />
        <div className="absolute top-4 left-4 flex gap-2">
          <span className="px-3 py-1 rounded-full bg-white/85 backdrop-blur text-[10px] font-medium uppercase tracking-[0.18em] text-ink-soft">
            {settingTypeLabel(t, type)}
          </span>
        </div>
      </div>
      <div className="p-7">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-serif text-2xl text-ink mb-1">{displayName}</h3>
            <p className="text-[11px] uppercase tracking-[0.18em] text-ash">
              {pieceMetalColorStyleLine(t, setting.metal, setting.color, setting.style)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ash">{t('craft.from')}</p>
            <p className="font-serif text-2xl text-ink">
              ${setting.price.toLocaleString(priceLocale)}
            </p>
          </div>
        </div>
        <p className="text-sm text-ink-soft leading-relaxed mb-5 italic">{settingTypeTagline(t, type)}</p>
        <div className="flex flex-wrap gap-1.5 mb-6">
          {setting.compatibleShapes.slice(0, 6).map(shape => (
            <span
              key={shape}
              className="px-2.5 py-1 rounded-full text-[10px] tracking-wide text-ink-soft bg-cream-100 border border-cream-200"
            >
              {diamondShapeLabel(t, shape)}
            </span>
          ))}
          {setting.compatibleShapes.length > 6 && (
            <span className="px-2.5 py-1 text-[10px] text-ash">
              +{setting.compatibleShapes.length - 6}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSelect}
          className="btn-primary w-full py-3 text-sm font-medium tracking-wide flex items-center justify-center gap-2"
        >
          {t('craft.choosePiece')} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </article>
  );
};

/* -------------------------------------------------------------------------- */
/*  Step 2 — Choose diamond                                                    */
/* -------------------------------------------------------------------------- */

const StepDiamond: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { state, setDiamond, setStep, reset } = useBespoke();
  const setting = state.setting;
  const priceLocale = i18n.language.startsWith('en') ? 'en-US' : 'ru-RU';
  const [diamonds, setDiamonds] = useState<DiamondDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeShape, setActiveShape] = useState<DiamondShape | 'All'>('All');

  useEffect(() => {
    if (!setting) return;
    setLoading(true);
    // Catalog endpoint returns the full list with availability/price; we filter client-side
    // by the setting's compatibleShapes — a single network call instead of N parallel ones.
    apiJson<DiamondDoc[]>(`${GATEWAY.catalog}`)
      .then(json => {
        const typed = json as ApiResponse<DiamondDoc[]>;
        if (typed.success) {
          const compat = new Set(setting.compatibleShapes);
          const visible = typed.data.filter(
            d => compat.has(d.shape) && d.availability !== 'sold',
          );
          setDiamonds(visible);
        }
      })
      .catch(err => console.error('Failed to load catalog:', err))
      .finally(() => setLoading(false));
  }, [setting]);

  const visibleShapes = useMemo<DiamondShape[]>(() => {
    if (!setting) return [];
    const present = new Set<DiamondShape>();
    diamonds.forEach(d => present.add(d.shape));
    return setting.compatibleShapes.filter(s => present.has(s));
  }, [diamonds, setting]);

  const filtered = useMemo(() => {
    if (activeShape === 'All') return diamonds;
    return diamonds.filter(d => d.shape === activeShape);
  }, [diamonds, activeShape]);

  const settingTitle = setting ? settingCatalogName(t, setting.sku, setting.name) : '';
  const stType = setting ? settingTypeOf(setting) : 'Prong';

  if (!setting) {
    return (
      <div className="text-center py-20">
        <p className="text-ink-soft mb-4">{t('craft.chooseJewelryFirst')}</p>
        <button onClick={() => setStep('jewelry')} className="glass-button px-6 py-3 text-sm">
          {t('craft.goBack')}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-12 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blush-50 border border-blush-200/60 text-rose-gold-deep text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="uppercase tracking-[0.2em]">{t('craft.stepTwoBadge')}</span>
        </div>
        <h1 className="font-serif text-5xl md:text-6xl font-light mb-4 text-ink">
          {t('craft.stepTwoTitle')} <span className="text-gradient italic">{settingTitle}</span>
        </h1>
        <p className="text-ink-soft text-base max-w-xl mx-auto">
          {t('craft.stepTwoDesc', { type: settingTypeLabel(t, stType) })}
        </p>
      </div>

      {/* Selected setting strip */}
      <div className="max-w-3xl mx-auto glass-card p-5 mb-10 flex items-center gap-5">
        <img
          src={resolveSettingImage({
            images: setting.images,
            category: settingCategoryOf(setting),
            style: setting.style,
            settingType: settingTypeOf(setting),
            key: setting.sku,
          })}
          alt={settingTitle}
          className="w-20 h-20 rounded-2xl object-contain bg-blush-50 border border-cream-200 p-2"
        />
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ash">{t('craft.selectedPiece')}</p>
          <h3 className="font-serif text-xl text-ink">{settingTitle}</h3>
          <p className="text-xs text-ink-soft">
            {pieceMetalColorStyleLine(t, setting.metal, setting.color, setting.style)} · $
            {setting.price.toLocaleString(priceLocale)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStep('jewelry')}
          className="glass-button px-4 py-2 text-xs flex items-center gap-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {t('craft.change')}
        </button>
      </div>

      {/* Shape filter */}
      {visibleShapes.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          <FilterPill subtle active={activeShape === 'All'} onClick={() => setActiveShape('All')}>
            {t('craft.allShapes')}
          </FilterPill>
          {visibleShapes.map(s => (
            <FilterPill
              key={s}
              subtle
              active={activeShape === s}
              onClick={() => setActiveShape(s)}
            >
              {diamondShapeLabel(t, s)}
            </FilterPill>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="glass-card h-72 shimmer-loading" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-ink-soft mb-4">{t('craft.noStonesStock')}</p>
          <button type="button" onClick={() => reset()} className="glass-button px-6 py-3 text-sm">
            <RotateCcw className="w-3.5 h-3.5 inline mr-2" /> {t('craft.startOver')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((d, idx) => (
            <DiamondCard key={d._id} diamond={d} delay={(idx % 3) * 80} onSelect={() => setDiamond(d)} />
          ))}
        </div>
      )}
    </div>
  );
};

const DiamondCard: React.FC<{
  diamond: DiamondDoc;
  delay: number;
  onSelect: () => void;
}> = ({ diamond: d, delay, onSelect }) => {
  const { t, i18n } = useTranslation();
  const priceLocale = i18n.language.startsWith('en') ? 'en-US' : 'ru-RU';
  return (
    <article
      className="glass-card overflow-hidden group animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="aspect-square bg-blush-50 relative overflow-hidden">
        <DiamondCatalogMedia
          images={d.images}
          videoUrl={d.videoUrl}
          alt={`${diamondShapeLabel(t, d.shape)}`}
          className="absolute inset-0"
          mediaClassName="h-full w-full object-contain p-8 transition-transform duration-700 group-hover:scale-105"
          variant="card"
        />
        {d.dealBadge && (
          <span
            className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[9px] font-medium uppercase tracking-wider ${
              d.dealBadge === 'BEST VALUE'
                ? 'badge-best'
                : d.dealBadge === 'FAIR DEAL'
                ? 'badge-fair'
                : d.dealBadge === 'PREMIUM CUT'
                ? 'badge-premium'
                : 'badge-fair'
            }`}
          >
            {dealBadgeLabel(t, d.dealBadge)}
          </span>
        )}
      </div>
      <div className="p-6">
        <h4 className="font-serif text-xl text-ink mb-1">
          {d.carat} ct {diamondShapeLabel(t, d.shape)}
        </h4>
        <p className="text-[11px] uppercase tracking-[0.18em] text-ash mb-4">
          {d.color} · {d.clarity} · {d.cut}
        </p>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-ash">{t('craft.stone')}</p>
            <p className="font-serif text-2xl text-ink">${d.price.toLocaleString(priceLocale)}</p>
          </div>
          <button
            type="button"
            onClick={onSelect}
            className="btn-primary px-5 py-2.5 text-xs font-medium tracking-wide flex items-center gap-2"
          >
            {t('craft.choose')} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
};

/* -------------------------------------------------------------------------- */
/*  Step 3 — Summary & add to cart                                             */
/* -------------------------------------------------------------------------- */

const StepSummary: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { state, totalPrice, setStep, clearSetting, clearDiamond, reset } = useBespoke();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKycSecurityLink, setShowKycSecurityLink] = useState(false);

  const setting = state.setting;
  const diamond = state.diamond;
  const settingType = setting ? settingTypeOf(setting) : null;
  const priceLocale = i18n.language.startsWith('en') ? 'en-US' : 'ru-RU';
  const settingDisplayName = setting ? settingCatalogName(t, setting.sku, setting.name) : '';
  const diamondTitle =
    diamond && `${diamond.carat} ct ${diamondShapeLabel(t, diamond.shape)}`;

  const fmt = (n: number) => n.toLocaleString(priceLocale, { minimumFractionDigits: 0 });

  /** Matches pricing-service bespoke validation: diamond + setting only. */
  const bespokeLinePrice = totalPrice;

  const handleConfirm = async () => {
    if (!setting || !diamond) return;
    setError(null);
    setShowKycSecurityLink(false);
    setSubmitting(true);
    try {
      const sessionId = getSessionId();

      const addRes = (await apiJson(`${GATEWAY.order}/cart/${sessionId}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bespoke',
          productId: `BESPOKE-${diamond._id}-${setting._id}`,
          bespokePair: { diamondId: diamond.sku, settingId: setting.sku },
          price: bespokeLinePrice,
          quantity: 1,
        }),
      })) as ApiResponse<unknown>;
      if (!addRes.success) throw new Error(t('craft.assembleError'));
      void queryClient.invalidateQueries({ queryKey: orderQueryKeys.carts() });
      reset();

      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/auth?redirect=' + encodeURIComponent('/cart'));
        return;
      }
      navigate('/cart');
    } catch (e) {
      console.error('Bespoke add to cart failed:', e);
      setShowKycSecurityLink(orderKycBlockKind(e) === 'kyc_required');
      setError(userVisibleOrderError(t, e, 'craft.genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!setting || !diamond) {
    return (
      <div className="text-center py-20">
        <p className="text-ink-soft mb-4">{t('craft.sessionIncomplete')}</p>
        <button
          type="button"
          onClick={() => setStep(setting ? 'diamond' : 'jewelry')}
          className="glass-button px-6 py-3 text-sm"
        >
          {t('craft.continueSession')}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-12 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blush-50 border border-blush-200/60 text-rose-gold-deep text-xs font-medium mb-6">
          <Receipt className="w-3.5 h-3.5" />
          <span className="uppercase tracking-[0.2em]">{t('craft.stepThreeBadge')}</span>
        </div>
        <h1 className="font-serif text-5xl md:text-6xl font-light mb-4 text-ink">
          {t('craft.stepThreeTitle')} <span className="text-gradient italic">{t('craft.stepThreeTitleItalic')}</span>
        </h1>
        <p className="text-ink-soft text-base max-w-xl mx-auto">{t('craft.stepThreeDesc')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 max-w-6xl mx-auto">
        <div className="lg:col-span-3 space-y-5">
          <PieceCard
            kind={t('craft.kindPiece')}
            title={settingDisplayName}
            meta={`${pieceMetalColorStyleLine(t, setting.metal, setting.color, setting.style)} · ${settingType ? settingTypeLabel(t, settingType) : ''}`}
            price={setting.price}
            imageSrc={resolveSettingImage({
              images: setting.images,
              category: settingCategoryOf(setting),
              style: setting.style,
              settingType: settingTypeOf(setting),
              key: setting.sku,
            })}
            altText={settingDisplayName}
            onEdit={() => setStep('jewelry')}
            onRemove={clearSetting}
            editLabel={t('craft.chooseAnotherPiece')}
            removeLabel={t('craft.removePiece')}
            fmt={fmt}
          />

          <PieceCard
            kind={t('craft.kindStone')}
            title={diamondTitle ?? ''}
            meta={t('craft.stoneMetaLine', {
              color: diamond.color,
              clarity: diamond.clarity,
              cut: diamond.cut,
              lab: diamond.lab,
            })}
            price={diamond.price}
            media={
              <DiamondCatalogMedia
                images={diamond.images}
                videoUrl={diamond.videoUrl}
                alt={diamondTitle ?? ''}
                className="h-full w-full"
                mediaClassName="h-full w-full object-contain p-1"
                variant="card"
              />
            }
            altText={diamondTitle ?? ''}
            onEdit={() => setStep('diamond')}
            onRemove={clearDiamond}
            editLabel={t('craft.chooseAnotherStone')}
            removeLabel={t('craft.removeStone')}
            fmt={fmt}
          />
        </div>

        <aside className="lg:col-span-2">
          <div className="glass-card-premium p-8 sticky top-32">
            <h3 className="font-serif text-2xl text-ink mb-6">{t('craft.billTitle')}</h3>
            <Row label={t('craft.rowSetting')} value={`$${fmt(setting.price)}`} />
            <Row label={t('craft.rowDiamond')} value={`$${fmt(diamond.price)}`} />
            <div className="petal-divider my-5" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm uppercase tracking-[0.18em] text-ink-soft">{t('craft.total')}</span>
              <span className="font-serif text-4xl text-ink">${fmt(bespokeLinePrice)}</span>
            </div>
            <p className="text-[10px] text-ash uppercase tracking-[0.18em] mt-3">{t('craft.bespokeTotalNote')}</p>

            {error && (
              <div className="mt-5 space-y-3">
                <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
                  {error}
                </p>
                {showKycSecurityLink ? (
                  <Link
                    to="/account/security"
                    className="block text-center w-full py-3 rounded-xl border border-rose-200 bg-white text-[11px] font-medium uppercase tracking-[0.18em] text-rose-900 no-underline hover:bg-rose-50/80 transition-colors"
                  >
                    {t('checkout.kycSecurityCta')}
                  </Link>
                ) : null}
              </div>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirm}
              className="btn-primary w-full mt-6 py-4 text-sm font-medium tracking-wide flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" /> {t('craft.addToBagContinue')}
                </>
              )}
            </button>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStep('jewelry')}
                className="py-3 rounded-full text-[10px] uppercase tracking-[0.18em] text-ink-soft hover:text-rose-gold-deep transition-colors flex items-center justify-center gap-1.5 border border-cream-200 hover:border-blush-300 bg-surface-elev/60"
              >
                <Pencil className="w-3 h-3" /> {t('craft.changePiece')}
              </button>
              <button
                type="button"
                onClick={() => setStep('diamond')}
                className="py-3 rounded-full text-[10px] uppercase tracking-[0.18em] text-ink-soft hover:text-rose-gold-deep transition-colors flex items-center justify-center gap-1.5 border border-cream-200 hover:border-blush-300 bg-surface-elev/60"
              >
                <Pencil className="w-3 h-3" /> {t('craft.changeStone')}
              </button>
            </div>
            <button
              type="button"
              onClick={reset}
              className="w-full mt-2 py-3 rounded-full text-[10px] uppercase tracking-[0.18em] text-ash hover:text-rose-gold-deep transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-3 h-3" /> {t('craft.startOver')}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; subtle?: boolean }> = ({
  label,
  value,
  subtle,
}) => (
  <div className="flex items-baseline justify-between py-2">
    <span className={`text-sm ${subtle ? 'text-ash' : 'text-ink-soft'}`}>{label}</span>
    <span className={`text-sm ${subtle ? 'text-ash' : 'text-ink'}`}>{value}</span>
  </div>
);

type PieceCardProps = {
  kind: string;
  title: string;
  meta: string;
  price: number;
  /** Used when `media` is omitted */
  imageSrc?: string;
  /** Rich thumbnail (e.g. diamond with optional video) */
  media?: React.ReactNode;
  altText: string;
  onEdit: () => void;
  onRemove: () => void;
  editLabel: string;
  removeLabel: string;
  fmt: (n: number) => string;
};

const PieceCard: React.FC<PieceCardProps> = ({
  kind,
  title,
  meta,
  price,
  imageSrc,
  media,
  altText,
  onEdit,
  onRemove,
  editLabel,
  removeLabel,
  fmt,
}) => (
  <div className="glass-card p-6 flex gap-5 items-center group relative">
    <div className="w-24 h-24 rounded-2xl bg-blush-50 border border-cream-200 flex-shrink-0 overflow-hidden flex items-center justify-center">
      {media ?? (
        <img
          src={imageSrc}
          alt={altText}
          className="w-full h-full object-contain p-2"
        />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ash">{kind}</p>
      <h3 className="font-serif text-2xl text-ink truncate">{title}</h3>
      <p className="text-xs text-ink-soft">{meta}</p>
    </div>
    <div className="flex flex-col items-end gap-2">
      <p className="font-serif text-xl text-ink">${fmt(price)}</p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel}
          title={editLabel}
          className="w-8 h-8 rounded-full bg-blush-50 border border-blush-200 text-rose-gold-deep hover:bg-blush-100 transition-colors flex items-center justify-center cursor-pointer"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          title={removeLabel}
          className="w-8 h-8 rounded-full bg-surface-elev border border-cream-200 text-ash hover:text-rose-700 hover:bg-rose-50 hover:border-rose-100 transition-colors flex items-center justify-center cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/*  Page shell                                                                 */
/* -------------------------------------------------------------------------- */

const CraftPage: React.FC = () => {
  const { t } = useTranslation();
  const { state } = useBespoke();
  const step = state.currentStep;
  const stepperSteps = useMemo(
    () => [
      { id: 'jewelry' as const, label: t('craft.stepJewelry') },
      { id: 'diamond' as const, label: t('craft.stepDiamond') },
      { id: 'summary' as const, label: t('craft.stepSummary') },
    ],
    [t],
  );

  return (
    <div className="pt-28 pb-24 px-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-6">
        <BrandMark size={80} />
      </div>
      <Stepper current={step} steps={stepperSteps} />
      {step === 'jewelry' && <StepJewelry />}
      {step === 'diamond' && <StepDiamond />}
      {step === 'summary' && <StepSummary />}
    </div>
  );
};

export default CraftPage;
