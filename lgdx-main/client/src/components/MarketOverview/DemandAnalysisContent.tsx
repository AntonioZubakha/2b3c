import React from 'react';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { DemandData, DemandPeriod } from './types';
import { DEMAND_INTENSITY_THRESHOLD, LOW_CONFIDENCE_THRESHOLD, SMALL_SAMPLE_WARNING } from './constants';
import { IconAlert, IconChart, IconWeight, IconGem, IconPalette } from './SupplyInsightsIcons';
import styles from './MarketOverviewTabs.module.css';

interface DemandAnalysisContentProps {
  demandData: DemandData;
  demandPeriod: DemandPeriod;
  onPeriodChange: (period: DemandPeriod) => void;
}

const DemandAnalysisContent: React.FC<DemandAnalysisContentProps> = ({
  demandData,
  demandPeriod,
  onPeriodChange
}) => {
  const { t } = useTranslation();
  const { isLgdealSupervisor } = useAuth();
  const { totalDisappeared, topDemandCategories, demandByShape, demandByWeight, demandByClarity, demandByColor } = demandData;

  const getDemandLevel = (percentage: number) => {
    return percentage > 20 ? 'high' : percentage > 10 ? 'medium' : 'low';
  };

  const getDemandIntensity = (disappeared: number, maxCount: number) => {
    return maxCount > 0 ? (disappeared / maxCount) * 100 : 0;
  };

  const PERIOD_LABELS: Record<DemandPeriod, string> = {
    day:   t('marketOverview.priceTrends.period1d'),
    week:  t('marketOverview.priceTrends.period7d'),
    month: t('marketOverview.priceTrends.period30d'),
  };

  return (
    <div className={styles.tabContent}>

      {/* Header + period switcher */}
      <div className={styles.simpleTrendsHeader}>
        <div>
          <h2 className={styles.simpleTrendsTitle}>{t('marketOverview.demandAnalysis.title')}</h2>
          <p className={styles.simpleTrendsSubtitle}>{t('marketOverview.demandAnalysis.subtitle')}</p>
        </div>
        <div className={styles.trendsPeriodSwitcher}>
          {(['day', 'week', 'month'] as DemandPeriod[]).map((period) => (
            <button
              key={period}
              type="button"
              className={`${styles.trendsPeriodBtn} ${demandPeriod === period ? styles.trendsPeriodBtnActive : ''}`}
              onClick={() => onPeriodChange(period)}
            >
              {PERIOD_LABELS[period]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat bar */}
      <div className={styles.demandOverview}>
        <div className={styles.demandStat}>
          <div className={styles.demandNumber}>{totalDisappeared.toLocaleString()}</div>
          <div className={styles.demandLabel}>
            {demandPeriod === 'day' ? t('marketOverview.demandAnalysis.actualSalesYesterday') :
             demandPeriod === 'week' ? t('marketOverview.demandAnalysis.actualSalesLastWeek') :
             t('marketOverview.demandAnalysis.actualSalesLastMonth')}
          </div>
        </div>
        <div className={styles.demandStat}>
          <div className={styles.demandNumber}>{topDemandCategories.length}</div>
          <div className={styles.demandLabel}>{t('marketOverview.demandAnalysis.activeDemandCategories')}</div>
        </div>
        {isLgdealSupervisor && demandData.totalReappeared !== undefined && demandData.totalReappeared > 0 && (
          <div className={styles.demandStat}>
            <div className={styles.demandNumber}>{demandData.totalReappeared.toLocaleString()}</div>
            <div className={styles.demandLabel}>{t('marketOverview.demandAnalysis.productsReappeared')}</div>
          </div>
        )}
        {demandData.salesConfidence !== undefined && (
          <div className={styles.demandStat}>
            <div className={styles.demandNumber}>
              {(demandData.salesConfidence * 100).toFixed(1)}%
              {demandData.salesConfidence < LOW_CONFIDENCE_THRESHOLD && (
                <IconAlert className={styles.lowConfidenceWarningIcon} aria-hidden />
              )}
            </div>
            <div className={styles.demandLabel}>{t('marketOverview.demandAnalysis.salesConfidence')}</div>
            {demandData.salesConfidence < LOW_CONFIDENCE_THRESHOLD && (
              <div className={styles.confidenceWarning}>
                {t('marketOverview.demandAnalysis.lowConfidenceWarning')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Most In-Demand Shapes */}
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <h3>{t('marketOverview.demandAnalysis.mostInDemandShapes')}</h3>
          <div className={styles.chartMeta}>{t('marketOverview.demandAnalysis.top5ByVolume')}</div>
        </div>
        <div className={styles.demandGrid}>
          {demandByShape.slice(0, 5).map((shape, index) => {
            const percentage = totalDisappeared > 0 ? ((shape.disappeared / totalDisappeared) * 100).toFixed(1) : '0';
            const demandLevel = getDemandLevel(parseFloat(percentage));

            return (
              <div key={shape.shape} className={`${styles.demandCard} ${styles[demandLevel]}`}>
                <div className={styles.demandRank}>#{index + 1}</div>
                <div className={styles.demandShape}>{shape.shape}</div>
                <div className={styles.demandStats}>
                  <div className={styles.demandCount}>{shape.disappeared.toLocaleString()}</div>
                  <div className={styles.demandPercent}>{percentage}% {t('marketOverview.demandAnalysis.ofDemand')}</div>
                </div>
                <div className={`${styles.demandLevel} ${styles[demandLevel]}`}>
                  {demandLevel === 'high'
                    ? t('marketOverview.demandAnalysis.highDemand')
                    : demandLevel === 'medium'
                    ? t('marketOverview.demandAnalysis.moderateDemand')
                    : t('marketOverview.demandAnalysis.lowDemand')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weight bar chart */}
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <h3>{t('marketOverview.demandAnalysis.sizePreferences')}</h3>
          <div className={styles.chartMeta}>{t('marketOverview.demandAnalysis.customerWeightPreferences')}</div>
        </div>
        <div className={styles.barChart}>
          {demandByWeight.slice(0, 8).map((weight, index) => {
            const maxCount = Math.max(...demandByWeight.map(w => w.disappeared));
            const demandIntensity = getDemandIntensity(weight.disappeared, maxCount);

            return (
              <div
                key={weight.weight}
                className={styles.barItem}
                style={{ '--animation-delay': `${index * 0.1}s` } as React.CSSProperties}
              >
                <div className={styles.barLabel}>
                  {weight.weight} ct
                  {demandIntensity > DEMAND_INTENSITY_THRESHOLD && (
                    <span className={styles.hotLabel}>{t('marketOverview.demandAnalysis.hot')}</span>
                  )}
                </div>
                <div className={styles.barContainer}>
                  <div
                    className={styles.barFill}
                    style={{ '--bar-width': `${demandIntensity}%` } as React.CSSProperties}
                  />
                </div>
                <div className={styles.barValue}>{weight.disappeared.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Clarity + Color side-by-side */}
      <div className={styles.gridRow}>
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3>{t('marketOverview.demandAnalysis.clarityDemand')}</h3>
            <div className={styles.chartMeta}>{t('marketOverview.demandAnalysis.mostWantedClarities')}</div>
          </div>
          <div className={styles.demandList}>
            {demandByClarity.slice(0, 6).map((clarity, index) => (
              <div key={clarity.clarity} className={styles.demandListItem}>
                <span className={styles.demandListRank}>{index + 1}</span>
                <span className={styles.demandListName}>{clarity.clarity}</span>
                <span className={styles.demandListValue}>{clarity.disappeared.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3>{t('marketOverview.demandAnalysis.colorDemand')}</h3>
            <div className={styles.chartMeta}>{t('marketOverview.demandAnalysis.mostWantedColors')}</div>
          </div>
          <div className={styles.demandList}>
            {demandByColor.slice(0, 6).map((color, index) => (
              <div key={color.color} className={styles.demandListItem}>
                <span className={styles.demandListRank}>{index + 1}</span>
                <span className={styles.demandListName}>{color.color}</span>
                <span className={styles.demandListValue}>{color.disappeared.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Production recommendations */}
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <h3>{t('marketOverview.demandAnalysis.productionRecommendations')}</h3>
          <div className={styles.chartMeta}>{t('marketOverview.demandAnalysis.basedOnSalesData')}</div>
          {totalDisappeared < SMALL_SAMPLE_WARNING && (
            <div className={styles.statisticalWarning}>
              <IconAlert className={styles.statisticalWarningIcon} aria-hidden />
              {' '}{t('marketOverview.demandAnalysis.lowSampleSizeWarning', { count: totalDisappeared })}
            </div>
          )}
        </div>
        <div className={styles.recommendationsList}>
          {demandByShape.length > 0 && (
            <div className={styles.recommendation}>
              <IconChart className={styles.recommendationIcon} aria-hidden />
              <div>
                <strong>{t('marketOverview.demandAnalysis.focusOnHotShapes')}</strong>
                {' '}{demandByShape.slice(0, 3).map(s => s.shape).join(', ')} {t('marketOverview.demandAnalysis.showHighestDemand')}
              </div>
            </div>
          )}
          {demandByWeight.length > 0 && (
            <div className={styles.recommendation}>
              <IconWeight className={styles.recommendationIcon} aria-hidden />
              <div>
                <strong>{t('marketOverview.demandAnalysis.optimizeSizeRange')}</strong>
                {' '}{t('marketOverview.demandAnalysis.focusOnRanges')} {demandByWeight.slice(0, 2).map(w => w.weight).join(' and ')} ct {t('marketOverview.demandAnalysis.ranges')}
              </div>
            </div>
          )}
          {demandByClarity.length > 0 && (
            <div className={styles.recommendation}>
              <IconGem className={styles.recommendationIcon} aria-hidden />
              <div>
                <strong>{t('marketOverview.demandAnalysis.clarityStrategy')}</strong>
                {' '}{demandByClarity.slice(0, 2).map(c => c.clarity).join(' and ')} {t('marketOverview.demandAnalysis.claritiesInHighestDemand')}
              </div>
            </div>
          )}
          {demandByColor.length > 0 && (
            <div className={styles.recommendation}>
              <IconPalette className={styles.recommendationIcon} aria-hidden />
              <div>
                <strong>{t('marketOverview.demandAnalysis.colorFocus')}</strong>
                {' '}{demandByColor.slice(0, 2).map(c => c.color).join(' and ')} {t('marketOverview.demandAnalysis.colorsMostSoughtAfter')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DemandAnalysisContent;
