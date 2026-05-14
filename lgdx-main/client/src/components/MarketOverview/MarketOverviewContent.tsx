import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import type { DiamondShape } from '../../i18n/types';
import { translateShape } from '../../utils/shapeTranslations';
import { MarketData, CategoryPriceTrend, CategorySupplyOpportunity } from './types';
import { MAIN_SHAPES } from './constants';
import { IconTrendUp, IconTrendDown, IconTarget } from './SupplyInsightsIcons';
import analyticsApi from '../../api/analyticsApi';
import styles from './MarketOverviewTabs.module.css';

interface MarketOverviewContentProps {
  marketData: MarketData;
}

function formatCat(item: CategoryPriceTrend | CategorySupplyOpportunity): string {
  return `${item.shape} ${item.weight}ct ${item.clarity} ${item.color}`;
}

const MarketOverviewContent: React.FC<MarketOverviewContentProps> = ({ marketData }) => {
  const { t } = useTranslation();
  const { totalProducts, shapeStats, weightStats, priceSegments, newArrivals } = marketData;

  const [rising, setRising] = useState<CategoryPriceTrend[]>([]);
  const [falling, setFalling] = useState<CategoryPriceTrend[]>([]);
  const [worthProducing, setWorthProducing] = useState<CategorySupplyOpportunity[]>([]);
  const [notWorthProducing, setNotWorthProducing] = useState<CategorySupplyOpportunity[]>([]);
  const [glanceLoading, setGlanceLoading] = useState(true);

  const loadGlanceData = useCallback(async () => {
    setGlanceLoading(true);
    try {
      const [trendsRes, supplyRes] = await Promise.all([
        analyticsApi.get('/price-trends?days=7'),
        analyticsApi.get('/supply-opportunities?days=7'),
      ]);
      if (trendsRes.data?.success) {
        setRising((trendsRes.data.rising ?? []).slice(0, 5));
        setFalling((trendsRes.data.falling ?? []).slice(0, 5));
      }
      if (supplyRes.data?.success && supplyRes.data?.data) {
        setWorthProducing((supplyRes.data.data.worthProducing ?? []).slice(0, 5));
        setNotWorthProducing((supplyRes.data.data.notWorthProducing ?? []).slice(0, 5));
      }
    } catch {
      // glance data is optional — fail silently
    } finally {
      setGlanceLoading(false);
    }
  }, []);

  useEffect(() => { loadGlanceData(); }, [loadGlanceData]);

  const hasGlance = rising.length > 0 || falling.length > 0 || worthProducing.length > 0 || notWorthProducing.length > 0;

  // Shape distribution
  let otherShapesCount = 0;
  const processedShapeStats = (shapeStats || []).filter(stat => {
    if (MAIN_SHAPES.some(ms => ms.toLowerCase() === stat._id.toLowerCase())) return true;
    otherShapesCount += stat.count;
    return false;
  });
  const otherShapesLabel = t('marketOverview.otherShapes');
  if (otherShapesCount > 0) processedShapeStats.push({ _id: otherShapesLabel, count: otherShapesCount });
  processedShapeStats.sort((a, b) => {
    if (a._id === otherShapesLabel) return 1;
    if (b._id === otherShapesLabel) return -1;
    return b.count - a.count;
  });
  const maxShapeCount = Math.max(...processedShapeStats.map(s => s.count), 0);
  const maxWeightCount = Math.max(...(weightStats || []).map(w => w.count), 0);

  return (
    <div className={styles.tabContent}>

      {/* ── At a glance ───────────────────────────────── */}
      <div className={styles.glanceSection}>
        <div className={styles.glanceTitleRow}>
          <h2 className={styles.glanceTitle}>{t('marketOverview.glance.title')}</h2>
          <span className={styles.glanceSubtitle}>{t('marketOverview.glance.subtitle')}</span>
        </div>

        {glanceLoading ? (
          <div className={styles.glanceLoading}>
            <div className={styles.loadingSpinner} />
          </div>
        ) : hasGlance ? (
          <div className={styles.glanceGrid}>

            {/* Rising */}
            {rising.length > 0 && (
              <div className={`${styles.glanceCard} ${styles.glanceCardRising}`}>
                <div className={styles.glanceCardHead}>
                  <IconTrendUp className={`${styles.glanceCardIcon} ${styles.glanceIconUp}`} />
                  <div>
                    <div className={styles.glanceCardTitle}>{t('marketOverview.glance.topRising')}</div>
                    <div className={styles.glanceCardHint}>{t('marketOverview.glance.last7d')}</div>
                  </div>
                </div>
                <ul className={styles.glanceCatList}>
                  {rising.map(item => (
                    <li key={formatCat(item)} className={styles.glanceCatRow}>
                      <span className={styles.glanceCatName}>{formatCat(item)}</span>
                      <strong className={styles.glanceCatUp}>+{item.priceChangePercent}%</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Falling */}
            {falling.length > 0 && (
              <div className={`${styles.glanceCard} ${styles.glanceCardFalling}`}>
                <div className={styles.glanceCardHead}>
                  <IconTrendDown className={`${styles.glanceCardIcon} ${styles.glanceIconDown}`} />
                  <div>
                    <div className={styles.glanceCardTitle}>{t('marketOverview.glance.topFalling')}</div>
                    <div className={styles.glanceCardHint}>{t('marketOverview.glance.last7d')}</div>
                  </div>
                </div>
                <ul className={styles.glanceCatList}>
                  {falling.map(item => (
                    <li key={formatCat(item)} className={styles.glanceCatRow}>
                      <span className={styles.glanceCatName}>{formatCat(item)}</span>
                      <strong className={styles.glanceCatDown}>{item.priceChangePercent}%</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Worth producing */}
            {worthProducing.length > 0 && (
              <div className={`${styles.glanceCard} ${styles.glanceCardWorth}`}>
                <div className={styles.glanceCardHead}>
                  <IconTarget className={`${styles.glanceCardIcon} ${styles.glanceIconWorth}`} />
                  <div>
                    <div className={styles.glanceCardTitle}>{t('marketOverview.glance.topWorth')}</div>
                    <div className={styles.glanceCardHint}>{t('marketOverview.glance.highDemandLowSupply')}</div>
                  </div>
                </div>
                <ul className={styles.glanceCatList}>
                  {worthProducing.map(item => (
                    <li key={formatCat(item)} className={styles.glanceCatRow}>
                      <span className={styles.glanceCatName}>{formatCat(item)}</span>
                      <span className={styles.glanceCatMeta}>{item.totalDisappeared} {t('marketOverview.glance.sales')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Not worth producing */}
            {notWorthProducing.length > 0 && (
              <div className={`${styles.glanceCard} ${styles.glanceCardNotWorth}`}>
                <div className={styles.glanceCardHead}>
                  <IconTarget className={`${styles.glanceCardIcon} ${styles.glanceIconNotWorth}`} />
                  <div>
                    <div className={styles.glanceCardTitle}>{t('marketOverview.glance.topNotWorth')}</div>
                    <div className={styles.glanceCardHint}>{t('marketOverview.glance.oversuppliedOrFalling')}</div>
                  </div>
                </div>
                <ul className={styles.glanceCatList}>
                  {notWorthProducing.map(item => (
                    <li key={formatCat(item)} className={styles.glanceCatRow}>
                      <span className={styles.glanceCatName}>{formatCat(item)}</span>
                      <span className={styles.glanceCatMeta}>{item.avgCount} {t('marketOverview.glance.available')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        ) : null}
      </div>

      {/* ── Market totals row ─────────────────────────── */}
      <div className={styles.glanceStatsRow}>
        <div className={styles.glanceStat}>
          <span className={styles.glanceStatNum}>{totalProducts.toLocaleString()}</span>
          <span className={styles.glanceStatLabel}>{t('marketOverview.totalProducts')}</span>
        </div>
        {newArrivals && (
          <>
            <div className={styles.glanceStat}>
              <span className={styles.glanceStatNum}>{newArrivals.last24h.toLocaleString()}</span>
              <span className={styles.glanceStatLabel}>{t('marketOverview.glance.newLast24h')}</span>
            </div>
            <div className={styles.glanceStat}>
              <span className={styles.glanceStatNum}>{newArrivals.last72h.toLocaleString()}</span>
              <span className={styles.glanceStatLabel}>{t('marketOverview.glance.newLast72h')}</span>
            </div>
          </>
        )}
        {shapeStats && shapeStats.length > 0 && (
          <div className={styles.glanceStat}>
            <span className={styles.glanceStatNum}>{shapeStats.length}</span>
            <span className={styles.glanceStatLabel}>{t('marketOverview.glance.shapeVarieties')}</span>
          </div>
        )}
      </div>

      {/* ── Distribution charts ───────────────────────── */}
      <div className={styles.chartsGrid}>
        {/* Shape Distribution */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3>{t('marketOverview.distributionByShape')}</h3>
            <div className={styles.chartMeta}>{processedShapeStats.length} {t('marketOverview.categories')}</div>
          </div>
          <div className={styles.barChart}>
            {processedShapeStats.map((stat, index) => (
              <div
                key={stat._id || 'unknown'}
                className={styles.barItem}
                style={{ '--animation-delay': `${index * 0.1}s` } as React.CSSProperties}
              >
                <div className={styles.barLabel}>
                  {stat._id === otherShapesLabel ? otherShapesLabel : (translateShape(stat._id as DiamondShape, t) || t('marketOverview.notSpecified'))}
                </div>
                <div className={styles.barContainer}>
                  <div className={styles.barFill} style={{ '--bar-width': `${(stat.count / maxShapeCount) * 100}%` } as React.CSSProperties} />
                </div>
                <div className={styles.barValue}>{stat.count.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Weight Distribution */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3>{t('marketOverview.distributionByCarat')}</h3>
            <div className={styles.chartMeta}>{weightStats?.length || 0} {t('marketOverview.ranges')}</div>
          </div>
          <div className={styles.barChart}>
            {(weightStats || []).map((weight, index) => (
              <div
                key={weight.range}
                className={styles.barItem}
                style={{ '--animation-delay': `${index * 0.1}s` } as React.CSSProperties}
              >
                <div className={styles.barLabel}>{weight.range} ct</div>
                <div className={styles.barContainer}>
                  <div className={styles.barFill} style={{ '--bar-width': `${(weight.count / maxWeightCount) * 100}%` } as React.CSSProperties} />
                </div>
                <div className={styles.barValue}>{weight.count.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Price Segments */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3>{t('marketOverview.priceSegments')}</h3>
            <div className={styles.chartMeta}>
              {t('marketOverview.priceSegmentsSubtitle')}
              {priceSegments && priceSegments.length > 0 && ` · ${priceSegments.length} ${t('marketOverview.segments') || 'segments'}`}
            </div>
          </div>
          {priceSegments && priceSegments.length > 0 ? (
            <div className={styles.barChart}>
              {priceSegments.map((segment, index) => (
                <div
                  key={segment.range}
                  className={styles.barItem}
                  style={{ '--animation-delay': `${index * 0.1}s` } as React.CSSProperties}
                >
                  <div className={styles.barLabel}>{segment.range}</div>
                  <div className={styles.barContainer}>
                    <div className={styles.barFill} style={{ '--bar-width': `${segment.percentage}%` } as React.CSSProperties} />
                  </div>
                  <div className={styles.barValue}>{segment.count.toLocaleString()} ({segment.percentage}%)</div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.chartMeta}>{t('marketOverview.priceSegmentsNoData')}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketOverviewContent;
