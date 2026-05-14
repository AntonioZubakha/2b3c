import React from 'react';
import { MarketData, DemandData, TabType, DemandPeriod } from './types';
import MarketOverviewContent from './MarketOverviewContent';
import DemandAnalysisContent from './DemandAnalysisContent';
import SupplyInsightsContent from './SupplyInsightsContent';
import PriceTrendsContent from './PriceTrendsContent';
import MarketNewsContent from './MarketNewsContent';
import CategoryComparisonContent from './CategoryComparisonContent';
import styles from './MarketOverviewTabs.module.css';

interface MarketOverviewContentContainerProps {
  activeTab: TabType;
  marketData: MarketData | null;
  demandData: DemandData | null;
  demandPeriod: DemandPeriod;
  onPeriodChange: (period: DemandPeriod) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const MarketOverviewContentContainer: React.FC<MarketOverviewContentContainerProps> = ({
  activeTab,
  marketData,
  demandData,
  demandPeriod,
  onPeriodChange,
  loading,
  error,
  onRetry
}) => {
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading analytics data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <p className={styles.errorMessage}>{error}</p>
        <button onClick={onRetry} className={styles.retryButton}>
          Try Again
        </button>
      </div>
    );
  }

  switch (activeTab) {
    case 'overview':
      return marketData ? (
        <MarketOverviewContent marketData={marketData} />
      ) : <div className={styles.noData}>No market data available</div>;
    case 'demand':
      return demandData ? (
        <DemandAnalysisContent
          demandData={demandData}
          demandPeriod={demandPeriod}
          onPeriodChange={onPeriodChange}
        />
      ) : <div className={styles.noData}>No demand data available</div>;
    case 'supply':
      return marketData && demandData ? (
        <SupplyInsightsContent
          marketData={marketData}
          demandData={demandData}
          period={demandPeriod}
        />
      ) : <div className={styles.noData}>No supply analysis data available</div>;
    case 'trends':
      return marketData ? <PriceTrendsContent marketData={marketData} /> : <div className={styles.noData}>No trend data available</div>;
    case 'news':
      return <MarketNewsContent />;
    case 'compare':
      return (
        <CategoryComparisonContent
          availableShapes={marketData?.shapeStats?.map(s => s._id).filter(s => s !== 'OTHER SHAPES')}
        />
      );
    default:
      return marketData ? <MarketOverviewContent marketData={marketData} /> : <div className={styles.noData}>No market data available</div>;
  }
};

export default MarketOverviewContentContainer;
