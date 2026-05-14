import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n/types';
import analyticsApi from '../../api/analyticsApi';
import {
  CategoryComparisonFullResult,
  CategoryComparisonSide,
  CategoryOptions,
  CategorySpec
} from './types';
import { IconTrendUp, IconTrendDown, IconTarget } from './SupplyInsightsIcons';
import styles from './MarketOverviewTabs.module.css';

const PERIOD_OPTIONS = [
  { days: 7,  label: '7d' },
  { days: 14, label: '14d' },
  { days: 30, label: '30d' },
];

const REASON_ICONS: Record<string, string> = {
  demand_exceeds_supply: '🔥',
  high_demand: '📈',
  moderate_demand: '📊',
  very_low_demand: '🔇',
  no_demand: '❌',
  prices_rising: '💹',
  prices_falling: '📉',
  market_saturated: '🏚',
  scarce_supply: '🎯',
  higher_demand_ratio: '🔥',
  better_price_trend: '📈',
  more_sales: '💰',
  less_competition: '🎯',
  overall_better_score: '⚖️',
};

interface SavedComparison {
  catA: CategorySpec;
  catB: CategorySpec;
}

interface CategoryComparisonContentProps {
  availableShapes?: string[];
}

function formatCat(s: CategorySpec | CategoryComparisonSide): string {
  return `${s.shape} ${s.weight}ct ${s.clarity} ${s.color}`;
}

// ── Category selector ──────────────────────────────────────────────
interface CategorySelectorProps {
  label: string;
  value: CategorySpec;
  onChange: (v: CategorySpec) => void;
  options: CategoryOptions;
}

const CategorySelector: React.FC<CategorySelectorProps> = ({ label, value, onChange, options }) => {
  const { t } = useTranslation();
  const set = (field: keyof CategorySpec) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    onChange({ ...value, [field]: e.target.value });

  return (
    <div className={styles.catSelectorGroup}>
      <div className={styles.catSelectorLabel}>{label}</div>
      <div className={styles.catSelectorPreview}>{formatCat(value)}</div>
      <div className={styles.catSelectorFields}>
        <div className={styles.catSelectorField}>
          <label className={styles.catFieldLabel}>{t('marketOverview.catComp.shape')}</label>
          <select className={styles.compSelect} value={value.shape} onChange={set('shape')}>
            {options.shapes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className={styles.catSelectorField}>
          <label className={styles.catFieldLabel}>{t('marketOverview.catComp.weight')}</label>
          <select className={styles.compSelect} value={value.weight} onChange={set('weight')}>
            {options.weights.map(w => <option key={w} value={w}>{w}ct</option>)}
          </select>
        </div>
        <div className={styles.catSelectorField}>
          <label className={styles.catFieldLabel}>{t('marketOverview.catComp.clarity')}</label>
          <select className={styles.compSelect} value={value.clarity} onChange={set('clarity')}>
            {options.clarities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className={styles.catSelectorField}>
          <label className={styles.catFieldLabel}>{t('marketOverview.catComp.color')}</label>
          <select className={styles.compSelect} value={value.color} onChange={set('color')}>
            {options.colors.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
};

// ── Side metric card ───────────────────────────────────────────────
const SideCard: React.FC<{
  data: CategoryComparisonSide;
  label: string;
  isWinner: boolean;
  isTie: boolean;
}> = ({ data, label, isWinner, isTie }) => {
  const { t } = useTranslation();
  const noData = data.dataPoints === 0;

  const pctStr = data.priceChangePercent > 0
    ? `+${data.priceChangePercent}%`
    : `${data.priceChangePercent}%`;

  return (
    <div className={`${styles.compCard} ${isWinner ? styles.compCardWinner : ''} ${isTie ? styles.compCardTie : ''}`}>
      <div className={styles.compCardHeader}>
        <span className={styles.compCardLabel}>{label}</span>
        <span className={styles.compCardShape}>{formatCat(data)}</span>
        {isWinner && (
          <span className={styles.compWinnerBadge}>
            <IconTarget className={styles.compWinnerIcon} />
            {t('marketOverview.comparison.winnerLabel')}
          </span>
        )}
      </div>

      {noData ? (
        <p className={styles.catCompNoData}>{t('marketOverview.catComp.noDataForCategory')}</p>
      ) : (
        <>
          <div className={styles.compMetricRow}>
            <span className={styles.compMetricLabel}>{t('marketOverview.supplyInsights.sales')}</span>
            <strong className={styles.compMetricValue}>{data.totalDisappeared}</strong>
          </div>
          <div className={styles.compMetricRow}>
            <span className={styles.compMetricLabel}>{t('marketOverview.supplyInsights.supply')}</span>
            <strong className={styles.compMetricValue}>{data.avgCount}</strong>
          </div>
          <div className={styles.compMetricRow}>
            <span className={styles.compMetricLabel}>{t('marketOverview.supplyInsights.ratio')}</span>
            <strong className={`${styles.compMetricValue} ${data.demandSupplyRatio >= 1 ? styles.catCompGood : data.demandSupplyRatio < 0.1 ? styles.catCompBad : ''}`}>
              {data.demandSupplyRatio}x
            </strong>
          </div>
          <div className={styles.compMetricRow}>
            <span className={styles.compMetricLabel}>{t('marketOverview.comparison.avgPriceLabel')}</span>
            <span className={styles.compMetricValue}>
              {data.avgPrice > 0 ? `$${data.avgPrice.toFixed(0)}/ct` : '—'}
            </span>
          </div>
          <div className={styles.compMetricRow}>
            <span className={styles.compMetricLabel}>{t('marketOverview.comparison.priceTrend7d')}</span>
            <span className={`${styles.compTrend} ${data.priceChangePercent > 0 ? styles.compTrendUp : data.priceChangePercent < 0 ? styles.compTrendDown : styles.compTrendNeutral}`}>
              {data.priceChangePercent > 0 ? <IconTrendUp className={styles.compTrendIcon} /> : data.priceChangePercent < 0 ? <IconTrendDown className={styles.compTrendIcon} /> : null}
              {data.priceChangePercent !== 0 ? pctStr : '—'}
            </span>
          </div>
          <div className={styles.compMetricRow}>
            <span className={styles.compMetricLabel}>{t('marketOverview.catComp.score')}</span>
            <strong className={`${styles.compMetricValue} ${data.score > 0 ? styles.catCompGood : data.score < 0 ? styles.catCompBad : ''}`}>
              {data.score > 0 ? `+${data.score}` : data.score}
            </strong>
          </div>
          {data.reasons.length > 0 && (
            <div className={styles.catCompReasons}>
              {data.reasons.map(r => (
                <span key={r} className={styles.supCatReason}>
                  {REASON_ICONS[r] ?? '•'} {t(`marketOverview.supplyInsights.reasons.${r}` as TranslationKey)}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────
const DEFAULT_CAT: CategorySpec = { shape: 'ROUND', weight: '1-1.39', clarity: 'VS1', color: 'G' };
const DEFAULT_CAT_B: CategorySpec = { shape: 'OVAL', weight: '1-1.39', clarity: 'VS1', color: 'G' };

const CategoryComparisonContent: React.FC<CategoryComparisonContentProps> = ({ availableShapes }) => {
  const { t } = useTranslation();

  const [options, setOptions] = useState<CategoryOptions>({
    shapes: (availableShapes && availableShapes.length > 0)
      ? availableShapes
      : ['ROUND', 'OVAL', 'PEAR', 'CUSHION', 'EMERALD', 'RADIANT', 'PRINCESS', 'MARQUISE', 'HEART', 'ASSCHER'],
    weights: ['0.30-0.49', '0.50-0.89', '0.90-0.99', '1-1.39', '1.40-1.69', '1.70-1.99', '2-2.99', '3+'],
    clarities: ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2'],
    colors: ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'],
  });

  const [catA, setCatA] = useState<CategorySpec>(DEFAULT_CAT);
  const [catB, setCatB] = useState<CategorySpec>(DEFAULT_CAT_B);
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<CategoryComparisonFullResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [savedComparisons, setSavedComparisons] = useState<SavedComparison[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('lgdx_savedCatComparisons') || '[]');
    } catch { return []; }
  });

  // Load available options from API
  useEffect(() => {
    analyticsApi.get('/category-options').then(res => {
      if (res.data?.success && res.data?.data) {
        const d = res.data.data as CategoryOptions;
        if (d.shapes?.length) setOptions(d);
        // Reset selections to valid values
        setCatA(prev => ({
          shape: d.shapes.includes(prev.shape) ? prev.shape : (d.shapes[0] ?? prev.shape),
          weight: d.weights.includes(prev.weight) ? prev.weight : (d.weights[3] ?? prev.weight),
          clarity: d.clarities.includes(prev.clarity) ? prev.clarity : (d.clarities[4] ?? prev.clarity),
          color: d.colors.includes(prev.color) ? prev.color : (d.colors[3] ?? prev.color),
        }));
        setCatB(prev => ({
          shape: d.shapes.includes(prev.shape) ? prev.shape : (d.shapes[1] ?? prev.shape),
          weight: d.weights.includes(prev.weight) ? prev.weight : (d.weights[3] ?? prev.weight),
          clarity: d.clarities.includes(prev.clarity) ? prev.clarity : (d.clarities[4] ?? prev.clarity),
          color: d.colors.includes(prev.color) ? prev.color : (d.colors[3] ?? prev.color),
        }));
      }
    }).catch(() => { /* use defaults */ });
  }, []);

  const isSame = catA.shape === catB.shape && catA.weight === catB.weight &&
    catA.clarity === catB.clarity && catA.color === catB.color;

  const handleCompare = useCallback(async () => {
    if (isSame) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        shapeA: catA.shape, weightA: catA.weight, clarityA: catA.clarity, colorA: catA.color,
        shapeB: catB.shape, weightB: catB.weight, clarityB: catB.clarity, colorB: catB.color,
        days: String(days),
      });
      const res = await analyticsApi.get(`/compare-categories?${params}`);
      if (res.data?.success) {
        setResult(res.data.data);
      } else {
        throw new Error(res.data?.error || 'Failed to compare');
      }
    } catch {
      setError(t('marketOverview.comparison.errorFailed'));
    } finally {
      setLoading(false);
    }
  }, [catA, catB, days, isSame, t]);

  const handleExport = useCallback(() => {
    if (!result) return;
    const lines = [
      `Market Comparison: ${formatCat(result.catA)} vs ${formatCat(result.catB)}`,
      `Period: ${result.days} days`,
      '---',
      `${formatCat(result.catA)}: ${result.catA.totalDisappeared} sales | ${result.catA.avgCount} available | Ratio ${result.catA.demandSupplyRatio}x | $${result.catA.avgPrice}/ct | Price ${result.catA.priceChangePercent > 0 ? '+' : ''}${result.catA.priceChangePercent}% | Score ${result.catA.score}`,
      `${formatCat(result.catB)}: ${result.catB.totalDisappeared} sales | ${result.catB.avgCount} available | Ratio ${result.catB.demandSupplyRatio}x | $${result.catB.avgPrice}/ct | Price ${result.catB.priceChangePercent > 0 ? '+' : ''}${result.catB.priceChangePercent}% | Score ${result.catB.score}`,
      '---',
      result.verdict.winner === 'tie'
        ? `VERDICT: ${t('marketOverview.comparison.tie')}`
        : `VERDICT: Produce ${result.verdict.winnerLabel} — ${result.verdict.reasons.map(r => t(`marketOverview.catComp.verdictReasons.${r}` as TranslationKey)).join(', ')}`,
      '---',
      `Generated: ${new Date(result.generatedAt).toLocaleString()}`,
    ];
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).catch(() => {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result, t]);

  const handleSave = useCallback(() => {
    if (isSame) return;
    const exists = savedComparisons.some(c =>
      c.catA.shape === catA.shape && c.catA.weight === catA.weight &&
      c.catA.clarity === catA.clarity && c.catA.color === catA.color &&
      c.catB.shape === catB.shape && c.catB.weight === catB.weight &&
      c.catB.clarity === catB.clarity && c.catB.color === catB.color
    );
    if (!exists) {
      const updated = [{ catA, catB }, ...savedComparisons].slice(0, 5);
      setSavedComparisons(updated);
      localStorage.setItem('lgdx_savedCatComparisons', JSON.stringify(updated));
    }
  }, [catA, catB, isSame, savedComparisons]);

  const handleRemoveSaved = useCallback((i: number) => {
    const updated = savedComparisons.filter((_, idx) => idx !== i);
    setSavedComparisons(updated);
    localStorage.setItem('lgdx_savedCatComparisons', JSON.stringify(updated));
  }, [savedComparisons]);

  const handleLoadSaved = useCallback((saved: SavedComparison) => {
    setCatA(saved.catA);
    setCatB(saved.catB);
  }, []);

  const { verdict } = result || {};
  const isWinnerA = verdict?.winner === 'A';
  const isWinnerB = verdict?.winner === 'B';
  const isTie = verdict?.winner === 'tie';

  return (
    <div className={styles.tabContent}>
      <div className={styles.compHeader}>
        <h2 className={styles.compTitle}>{t('marketOverview.catComp.title')}</h2>
        <p className={styles.compSubtitle}>{t('marketOverview.catComp.subtitle')}</p>
      </div>

      {/* Selector row */}
      <div className={styles.catCompSelectorRow}>
        <CategorySelector
          label={t('marketOverview.comparison.shapeA')}
          value={catA}
          onChange={setCatA}
          options={options}
        />

        <div className={styles.catCompVsCol}>
          <div className={styles.compVsLabel}>vs</div>
          <div className={styles.catCompPeriod}>
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.days}
                className={`${styles.trendsPeriodBtn} ${days === opt.days ? styles.trendsPeriodBtnActive : ''}`}
                onClick={() => setDays(opt.days)}
                disabled={loading}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            className={styles.compAnalyzeBtn}
            onClick={handleCompare}
            disabled={loading || isSame}
          >
            {loading ? t('common.loading') : t('marketOverview.comparison.analyze')}
          </button>
        </div>

        <CategorySelector
          label={t('marketOverview.comparison.shapeB')}
          value={catB}
          onChange={setCatB}
          options={options}
        />
      </div>

      {isSame && (
        <p className={styles.compSameShapeWarning}>{t('marketOverview.catComp.sameCategoryWarning')}</p>
      )}
      {error && <p className={styles.errorMessage}>{error}</p>}

      {/* Results */}
      {result && (
        <>
          <div className={styles.compCards}>
            <SideCard data={result.catA} label={t('marketOverview.comparison.shapeA')} isWinner={isWinnerA} isTie={isTie} />
            <div className={styles.compCardsDivider}>vs</div>
            <SideCard data={result.catB} label={t('marketOverview.comparison.shapeB')} isWinner={isWinnerB} isTie={isTie} />
          </div>

          {/* Verdict */}
          <div className={`${styles.compVerdict} ${isTie ? styles.compVerdictTie : styles.compVerdictWinner}`}>
            <div className={styles.compVerdictIcon}>
              <IconTarget className={styles.compVerdictIconSvg} />
            </div>
            <div className={styles.compVerdictContent}>
              <h3 className={styles.compVerdictTitle}>{t('marketOverview.comparison.verdict')}</h3>
              {isTie ? (
                <p className={styles.compVerdictText}>{t('marketOverview.comparison.tie')}</p>
              ) : (
                <>
                  <p className={styles.compVerdictText}>
                    {t('marketOverview.catComp.betterToProduce', { category: verdict?.winnerLabel || '' })}
                  </p>
                  {verdict && verdict.reasons.length > 0 && (
                    <>
                      <p className={styles.compVerdictBecause}>{t('marketOverview.comparison.because')}</p>
                      <ul className={styles.compVerdictReasons}>
                        {verdict.reasons.map(r => (
                          <li key={r}>{REASON_ICONS[r] ?? '•'} {t(`marketOverview.catComp.verdictReasons.${r}` as TranslationKey)}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p className={styles.compVerdictScore}>
                    Score: {formatCat(result.catA)} {verdict?.scoreA} — {formatCat(result.catB)} {verdict?.scoreB}
                  </p>
                </>
              )}
              <div className={styles.compVerdictActions}>
                <button className={styles.compActionBtn} onClick={handleExport}>
                  {copied ? t('marketOverview.comparison.exportCopied') : t('marketOverview.comparison.exportVerdict')}
                </button>
                <button className={styles.compActionBtn} onClick={handleSave}>
                  {t('marketOverview.comparison.saveComparison')}
                </button>
              </div>
            </div>
          </div>

          <p className={styles.compGeneratedAt}>
            {t('marketOverview.lastUpdated')}: {new Date(result.generatedAt).toLocaleString()}
          </p>
        </>
      )}

      {!result && !loading && (
        <div className={styles.compEmptyState}>
          <p>{t('marketOverview.catComp.emptyState')}</p>
          <button className={styles.compAnalyzeBtn} onClick={handleCompare} disabled={isSame}>
            {t('marketOverview.comparison.analyze')}
          </button>
        </div>
      )}

      {/* Saved */}
      {savedComparisons.length > 0 && (
        <div className={styles.compSaved}>
          <h4 className={styles.compSavedTitle}>{t('marketOverview.comparison.savedComparisons')}</h4>
          <div className={styles.compSavedList}>
            {savedComparisons.map((saved, i) => (
              <div key={i} className={styles.compSavedItem}>
                <button className={styles.compSavedLoad} onClick={() => handleLoadSaved(saved)}>
                  {formatCat(saved.catA)} vs {formatCat(saved.catB)}
                </button>
                <button className={styles.compSavedRemove} onClick={() => handleRemoveSaved(i)} aria-label={t('marketOverview.comparison.remove')}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryComparisonContent;
