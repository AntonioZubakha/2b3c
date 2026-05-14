import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n/types';
import { MarketData, CategoryPriceTrend, CategoryPriceTrendsResult } from './types';
import { IconTrendUp, IconTrendDown } from './SupplyInsightsIcons';
import analyticsApi from '../../api/analyticsApi';
import styles from './MarketOverviewTabs.module.css';

interface PriceTrendsContentProps {
  marketData: MarketData;
}

const PERIOD_OPTIONS: ReadonlyArray<{ days: number; labelKey: TranslationKey }> = [
  { days: 7, labelKey: 'marketOverview.priceTrends.period7d' },
  { days: 14, labelKey: 'marketOverview.priceTrends.period14d' },
  { days: 30, labelKey: 'marketOverview.priceTrends.period30d' },
];

function formatCategory(item: CategoryPriceTrend): string {
  return `${item.shape} ${item.weight}ct ${item.clarity} ${item.color}`;
}

const CategoryRow: React.FC<{ item: CategoryPriceTrend; rank: number; rising: boolean }> = ({ item, rank, rising }) => {
  const pct = rising ? `+${item.priceChangePercent}%` : `${item.priceChangePercent}%`;

  return (
    <li className={styles.catTrendRow}>
      <span className={styles.catTrendRank}>{rank}</span>
      <div className={styles.catTrendInfo}>
        <span className={styles.catTrendName}>{formatCategory(item)}</span>
        <span className={styles.catTrendMeta}>
          ${item.avgPriceCurrent}/ct · {item.avgCount} {item.avgCount === 1 ? 'unit' : 'units'}
        </span>
      </div>
      <div className={`${styles.catTrendChange} ${rising ? styles.catTrendUp : styles.catTrendDown}`}>
        {rising ? <IconTrendUp className={styles.catTrendIcon} /> : <IconTrendDown className={styles.catTrendIcon} />}
        <strong>{pct}</strong>
      </div>
    </li>
  );
};

const PriceTrendsContent: React.FC<PriceTrendsContentProps> = ({ marketData }) => {
  const { t } = useTranslation();
  const { newArrivals } = marketData;

  const [selectedDays, setSelectedDays] = useState(7);
  const [result, setResult] = useState<CategoryPriceTrendsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrends = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await analyticsApi.get(`/price-trends?days=${days}`);
      if (response.data?.success) {
        setResult({
          rising: response.data.rising ?? [],
          falling: response.data.falling ?? [],
          days: response.data.days ?? days,
          generatedAt: response.data.generatedAt ?? new Date().toISOString()
        });
      } else {
        throw new Error('No data');
      }
    } catch {
      setError(t('categoryStats.failedToLoadData'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchTrends(selectedDays);
  }, [selectedDays, fetchTrends]);

  const rising = result?.rising ?? [];
  const falling = result?.falling ?? [];
  const hasData = rising.length > 0 || falling.length > 0;

  return (
    <div className={styles.tabContent}>
      {/* Header */}
      <div className={styles.simpleTrendsHeader}>
        <div>
          <h2 className={styles.simpleTrendsTitle}>
            {t('marketOverview.priceTrends.categoryTitle')}
          </h2>
          <p className={styles.simpleTrendsSubtitle}>
            {t('marketOverview.priceTrends.categorySubtitle')}
          </p>
        </div>
        <div className={styles.trendsPeriodSwitcher}>
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.days}
              className={`${styles.trendsPeriodBtn} ${selectedDays === opt.days ? styles.trendsPeriodBtnActive : ''}`}
              onClick={() => setSelectedDays(opt.days)}
              disabled={loading}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {newArrivals && (
        <p className={styles.simpleNewListings}>
          {t('marketOverview.simple.newListings', {
            count24: newArrivals.last24h.toLocaleString(),
            count72: newArrivals.last72h.toLocaleString()
          })}
        </p>
      )}

      {loading && (
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner} />
        </div>
      )}

      {error && !loading && (
        <p className={styles.errorMessage}>{error}</p>
      )}

      {!loading && !error && hasData && (
        <div className={styles.catTrendsCols}>
          {/* Rising */}
          <div className={styles.catTrendsCol}>
            <div className={styles.catTrendsColHeader}>
              <IconTrendUp className={`${styles.catTrendsColIcon} ${styles.catIconRising}`} />
              <h3 className={styles.catTrendsColTitle}>
                {t('marketOverview.priceTrends.topRising')}
              </h3>
              <span className={styles.catTrendsCount}>{rising.length}</span>
            </div>
            {rising.length > 0 ? (
              <ol className={styles.catTrendsList}>
                {rising.map((item, i) => (
                  <CategoryRow key={`${item.shape}-${item.weight}-${item.clarity}-${item.color}`} item={item} rank={i + 1} rising />
                ))}
              </ol>
            ) : (
              <p className={styles.simpleColEmpty}>{t('marketOverview.simple.none')}</p>
            )}
          </div>

          {/* Falling */}
          <div className={styles.catTrendsCol}>
            <div className={styles.catTrendsColHeader}>
              <IconTrendDown className={`${styles.catTrendsColIcon} ${styles.catIconFalling}`} />
              <h3 className={styles.catTrendsColTitle}>
                {t('marketOverview.priceTrends.topFalling')}
              </h3>
              <span className={styles.catTrendsCount}>{falling.length}</span>
            </div>
            {falling.length > 0 ? (
              <ol className={styles.catTrendsList}>
                {falling.map((item, i) => (
                  <CategoryRow key={`${item.shape}-${item.weight}-${item.clarity}-${item.color}`} item={item} rank={i + 1} rising={false} />
                ))}
              </ol>
            ) : (
              <p className={styles.simpleColEmpty}>{t('marketOverview.simple.none')}</p>
            )}
          </div>
        </div>
      )}

      {!loading && !error && !hasData && (
        <p className={styles.simpleNoData}>{t('marketOverview.priceTrends.noCategoryChanges')}</p>
      )}

      {result && (
        <p className={styles.compGeneratedAt}>
          {t('marketOverview.lastUpdated')}: {new Date(result.generatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
};

export default PriceTrendsContent;
