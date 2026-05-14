import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n/types';
import { MarketData, DemandData, DemandPeriod, CategorySupplyOpportunity, CategorySupplyInsightsResult } from './types';
import analyticsApi from '../../api/analyticsApi';
import styles from './MarketOverviewTabs.module.css';

interface SupplyInsightsContentProps {
  marketData: MarketData;
  demandData: DemandData;
  period?: DemandPeriod;
}

const PERIOD_OPTIONS: ReadonlyArray<{ days: number; labelKey: TranslationKey }> = [
  { days: 7, labelKey: 'marketOverview.priceTrends.period7d' },
  { days: 14, labelKey: 'marketOverview.priceTrends.period14d' },
  { days: 30, labelKey: 'marketOverview.priceTrends.period30d' },
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
};

function formatCategory(item: CategorySupplyOpportunity): string {
  return `${item.shape} ${item.weight}ct ${item.clarity} ${item.color}`;
}

interface CategoryCardProps {
  item: CategorySupplyOpportunity;
  rank: number;
  positive: boolean;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ item, rank, positive }) => {
  const { t } = useTranslation();
  const pctStr = item.priceChangePercent > 0
    ? `+${item.priceChangePercent}%`
    : `${item.priceChangePercent}%`;

  return (
    <li className={`${styles.supCatCard} ${positive ? styles.supCatCardPositive : styles.supCatCardNegative}`}>
      <div className={styles.supCatCardTop}>
        <span className={styles.supCatRank}>{rank}</span>
        <div className={styles.supCatInfo}>
          <span className={styles.supCatName}>{formatCategory(item)}</span>
          <span className={styles.supCatPrice}>
            ${item.avgPrice}/ct
            {item.priceChangePercent !== 0 && (
              <span className={item.priceChangePercent > 0 ? styles.supCatPriceUp : styles.supCatPriceDown}>
                {' '}{pctStr}
              </span>
            )}
          </span>
        </div>
      </div>
      <div className={styles.supCatStats}>
        <span className={styles.supCatStat}>
          {t('marketOverview.supplyInsights.sales')}: <strong>{item.totalDisappeared}</strong>
        </span>
        <span className={styles.supCatStat}>
          {t('marketOverview.supplyInsights.supply')}: <strong>{item.avgCount}</strong>
        </span>
        <span className={styles.supCatStat}>
          {t('marketOverview.supplyInsights.ratio')}: <strong>{item.demandSupplyRatio}x</strong>
        </span>
      </div>
      {item.reasons.length > 0 && (
        <div className={styles.supCatReasons}>
          {item.reasons.map(r => (
            <span key={r} className={styles.supCatReason}>
              {REASON_ICONS[r] ?? '•'} {t(`marketOverview.supplyInsights.reasons.${r}` as TranslationKey)}
            </span>
          ))}
        </div>
      )}
    </li>
  );
};

const SupplyInsightsContent: React.FC<SupplyInsightsContentProps> = ({ marketData }) => {
  const { t } = useTranslation();

  const [selectedDays, setSelectedDays] = useState(7);
  const [result, setResult] = useState<CategorySupplyInsightsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOpportunities = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await analyticsApi.get(`/supply-opportunities?days=${days}`);
      if (response.data?.success && response.data?.data) {
        setResult(response.data.data);
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
    fetchOpportunities(selectedDays);
  }, [selectedDays, fetchOpportunities]);

  const worthList = result?.worthProducing ?? [];
  const notWorthList = result?.notWorthProducing ?? [];
  const totalProducts = marketData.totalProducts ?? 0;

  return (
    <div className={styles.tabContent}>
      {/* Header */}
      <div className={styles.simpleTrendsHeader}>
        <div>
          <h2 className={styles.simpleTrendsTitle}>
            {t('marketOverview.supplyInsights.categoryTitle')}
          </h2>
          <p className={styles.simpleTrendsSubtitle}>
            {t('marketOverview.supplyInsights.categorySubtitle')}
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

      {totalProducts > 0 && (
        <p className={styles.simpleNewListings}>
          {t('marketOverview.supplyInsights.totalAnalyzed', { count: totalProducts.toLocaleString() })}
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

      {!loading && !error && (
        <div className={styles.simpleGrid}>
          {/* Worth producing */}
          <div className={styles.simpleCol}>
            <div className={styles.simpleColHeader}>
              <span className={`${styles.simpleColDot} ${styles.simpleColDotUp}`} />
              <h3 className={styles.simpleColTitle}>{t('marketOverview.supplyInsights.worthProducing')}</h3>
              <span className={styles.simpleColSubtitle}>{t('marketOverview.supplyInsights.worthDesc')}</span>
            </div>
            {worthList.length > 0 ? (
              <ol className={styles.supCatList}>
                {worthList.map((item, i) => (
                  <CategoryCard
                    key={`${item.shape}|${item.weight}|${item.clarity}|${item.color}`}
                    item={item}
                    rank={i + 1}
                    positive
                  />
                ))}
              </ol>
            ) : (
              <p className={styles.simpleColEmpty}>{t('marketOverview.simple.none')}</p>
            )}
          </div>

          {/* Not worth producing */}
          <div className={styles.simpleCol}>
            <div className={styles.simpleColHeader}>
              <span className={`${styles.simpleColDot} ${styles.simpleColDotDown}`} />
              <h3 className={styles.simpleColTitle}>{t('marketOverview.supplyInsights.notWorthProducing')}</h3>
              <span className={styles.simpleColSubtitle}>{t('marketOverview.supplyInsights.notWorthDesc')}</span>
            </div>
            {notWorthList.length > 0 ? (
              <ol className={styles.supCatList}>
                {notWorthList.map((item, i) => (
                  <CategoryCard
                    key={`${item.shape}|${item.weight}|${item.clarity}|${item.color}`}
                    item={item}
                    rank={i + 1}
                    positive={false}
                  />
                ))}
              </ol>
            ) : (
              <p className={styles.simpleColEmpty}>{t('marketOverview.simple.none')}</p>
            )}
          </div>
        </div>
      )}

      {result && (
        <p className={styles.compGeneratedAt}>
          {t('marketOverview.lastUpdated')}: {new Date(result.generatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
};

export default SupplyInsightsContent;
