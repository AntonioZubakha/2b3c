import React, { useState, useEffect, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import '../../utils/chartInit';
import { useTranslation } from '../../i18n';
import api from '../../api';
import { determineWeightCategory } from '../../types/constants';
import { chartColors, chartColorsWithOpacity } from '../../utils/chartColors';
import { formatUsd, formatUsdCompact } from '../../utils/currency';
import Button from '../common/Button/Button';
import LoadingSpinner from '../common/LoadingSpinner/LoadingSpinner';
import Modal from '../common/Modal/Modal';
import styles from './CategoryAnalyticsModal.module.css';
import sharedStyles from './SharedModalStyles.module.css';

interface CategoryAnalyticsData {
  date: string;
  count: number;
  avgPricePerCarat: number;
  medianPricePerCarat: number;
  marketPricePerCarat: number;
  newProductsToday: number;
  disappearedProductsSinceYesterday: number;
  priceIncreasedCount: number;
  priceDecreasedCount: number;
  priceUnchangedCount: number;
  goldPrice: number;
  oilPrice: number;
  inrUsdRate: number;
}

interface MongoAnalyticsData {
  _id: { $oid: string };
  clarity: string;
  color: string;
  shape: string;
  weight: string;
  __v: number;
  avgPricePerCarat: number;
  avgPricePerCarat_disappearedProducts: number;
  avgPricePerCarat_newProducts: number;
  avgPricePerCarat_priceDecreased: number;
  avgPricePerCarat_priceIncreased: number;
  avgPricePerCarat_priceUnchanged: number;
  count: number;
  createdAt: { $date: string };
  date: { $date: string };
  disappearedProductsSinceYesterday: number;
  goldPrice: number;
  inrUsdRate: number;
  marketPricePerCarat: number;
  medianPricePerCarat: number;
  medianPricePerCarat_disappearedProducts: number;
  medianPricePerCarat_newProducts: number;
  medianPricePerCarat_priceDecreased: number;
  medianPricePerCarat_priceIncreased: number;
  medianPricePerCarat_priceUnchanged: number;
  newProductsToday: number;
  oilPrice: number;
  priceDecreasedCount: number;
  priceIncreasedCount: number;
  priceUnchangedCount: number;
  productDetails: Array<{ certificateNumber: string; pricePerCarat: number }>;
  productSalesHistory: unknown[];
  reappearedProductsThisPeriod: number;
  salesConfidence: number;
  uniqueSalesThisPeriod: number;
  updatedAt: { $date: string };
}

interface CategoryAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: {
    shape: string; // Оригинальная форма для API запроса (например, "Round")
    weight: string;
    clarity: string;
    color: string;
  };
  displayShape?: string; // Переведенная форма для отображения (например, "Rund" на немецком)
}

const CategoryAnalyticsModal: React.FC<CategoryAnalyticsModalProps> = ({
  isOpen,
  onClose,
  category,
  displayShape
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [analyticsData, setAnalyticsData] = useState<CategoryAnalyticsData[]>([]);

  // Chart options
  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: chartColors.textPrimary,
        },
      },
      title: {
        display: true,
        text: t('catalog.priceTrendsOverTime'),
        color: chartColors.textPrimary,
        font: {
          size: 16,
        },
      },
      tooltip: {
        backgroundColor: chartColors.background,
        titleColor: chartColors.primary,
        bodyColor: chartColors.textPrimary,
        borderColor: chartColors.primary,
        borderWidth: 1,
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          color: chartColors.textSecondary,
          callback: (value) => formatUsd(Number(value))
        },
        grid: {
          color: chartColors.borderPrimary,
        },
        title: {
          display: true,
          text: t('catalog.pricePerCarat'),
          color: chartColors.primary,
        },
      },
      x: {
        ticks: {
          color: chartColors.textSecondary,
        },
        grid: {
          color: chartColors.borderSecondary,
        },
        title: {
          display: true,
          text: t('catalog.timePeriod'),
          color: chartColors.primary,
        },
      }
    }
  };

  const fetchAnalyticsData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 7);

      // Parse weight from "4.5ct" to number and get weight category
      const weightValue = parseFloat(category.weight.replace('ct', ''));
      const weightCategory = determineWeightCategory(weightValue);

      const queryParams = {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        shape: category.shape.toUpperCase(), // Конвертируем в верхний регистр как в БД
        weight: weightCategory,
        clarity: category.clarity,
        color: category.color,
      };


      const response = await api.get('/category-stats', { params: queryParams });
      const data = response.data;

      if (data.success) {
        // Process and sort data by date
        const processedData = data.data
          .map((item: MongoAnalyticsData) => ({
            date: item.date?.$date ? new Date(item.date.$date).toISOString().split('T')[0] : item.date,
            count: item.count || 0,
            avgPricePerCarat: item.avgPricePerCarat || 0,
            medianPricePerCarat: item.medianPricePerCarat || 0,
            marketPricePerCarat: item.marketPricePerCarat || 0,
            newProductsToday: item.newProductsToday || 0,
            disappearedProductsSinceYesterday: item.disappearedProductsSinceYesterday || 0,
            priceIncreasedCount: item.priceIncreasedCount || 0,
            priceDecreasedCount: item.priceDecreasedCount || 0,
            priceUnchangedCount: item.priceUnchangedCount || 0,
            goldPrice: item.goldPrice || 0,
            oilPrice: item.oilPrice || 0,
            inrUsdRate: item.inrUsdRate || 0,
          }))
          .sort((a: CategoryAnalyticsData, b: CategoryAnalyticsData) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );

        setAnalyticsData(processedData);
      } else {
        setError(t('catalog.unableToLoadMarketData'));
      }
    } catch (err) {
      setError(t('catalog.unableToLoadMarketData'));
    } finally {
      setLoading(false);
    }
  }, [category, t]);

  // Fetch analytics data
  useEffect(() => {
    if (isOpen && category) {
      fetchAnalyticsData();
    }
  }, [isOpen, category, fetchAnalyticsData]);

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateShort = (dateStr: string): string => {
    const date = new Date(dateStr);
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  // Prepare chart data
  const chartData = {
    labels: analyticsData.map(item => formatDateShort(item.date)),
    datasets: [
      {
        label: t('catalog.averagePrice'),
        data: analyticsData.map(item => item.avgPricePerCarat),
        borderColor: chartColors.primary,
        backgroundColor: chartColorsWithOpacity.primary.light,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: chartColors.primary,
        pointBorderColor: chartColors.surfacePrimary,
        pointHoverBackgroundColor: chartColors.surfacePrimary,
        pointHoverBorderColor: chartColors.primary,
      },
      {
        label: t('catalog.medianPrice'),
        data: analyticsData.map(item => item.medianPricePerCarat),
        borderColor: chartColors.success,
        backgroundColor: chartColorsWithOpacity.success.light,
        fill: false,
        tension: 0.4,
        pointBackgroundColor: chartColors.success,
        pointBorderColor: chartColors.surfacePrimary,
        pointHoverBackgroundColor: chartColors.surfacePrimary,
        pointHoverBorderColor: chartColors.success,
      },
      {
        label: t('catalog.marketPrice'),
        data: analyticsData.map(item => item.marketPricePerCarat),
        borderColor: chartColors.warning,
        backgroundColor: chartColorsWithOpacity.warning.light,
        fill: false,
        tension: 0.4,
        pointBackgroundColor: chartColors.warning,
        pointBorderColor: chartColors.surfacePrimary,
        pointHoverBackgroundColor: chartColors.surfacePrimary,
        pointHoverBorderColor: chartColors.warning,
      },
    ],
  };

  // Calculate summary statistics
  const totalProducts = analyticsData.reduce((sum, item) => sum + item.count, 0);
  const avgPrice = analyticsData.length > 0 
    ? analyticsData.reduce((sum, item) => sum + item.avgPricePerCarat, 0) / analyticsData.length 
    : 0;
  const priceVolatility = analyticsData.length > 1 
    ? Math.max(...analyticsData.map(item => item.avgPricePerCarat)) - Math.min(...analyticsData.map(item => item.avgPricePerCarat))
    : 0;

  const totalNewProducts = analyticsData.reduce((sum, item) => sum + item.newProductsToday, 0);
  const totalDisappeared = analyticsData.reduce((sum, item) => sum + item.disappearedProductsSinceYesterday, 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('catalog.marketAnalyticsTitle', {
        shape: displayShape || category.shape,
        weight: category.weight,
        clarity: category.clarity,
        color: category.color
      })}
      size="xl"
      className={`${sharedStyles.baseModal} ${styles.analyticsModalOverride}`}
      footer={
        <div className={sharedStyles.modalFooter}>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      <div className={`${sharedStyles.modalContent} ${styles.analyticsContent}`}>
        {loading && (
          <div className={sharedStyles.loadingState}>
            <LoadingSpinner size="lg" />
            <p>{t('catalog.analyzingMarketData')}</p>
          </div>
        )}

        {error && (
          <div className={sharedStyles.errorState}>
            <i className="fas fa-exclamation-triangle"></i>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && analyticsData.length > 0 && (
          <>
            {/* Summary Cards */}
            <div className={styles.summaryCards}>
              <div className={styles.summaryCard}>
                <div className={styles.cardIcon}>
                  <i className="fas fa-gem"></i>
                </div>
                <div className={styles.cardContent}>
                  <h3>{t('catalog.totalProducts')}</h3>
                  <p className={styles.cardValue}>{totalProducts}</p>
                  <p className={styles.cardSubtext}>{t('catalog.trackedThisWeek')}</p>
                </div>
              </div>

              <div className={styles.summaryCard}>
                <div className={styles.cardIcon}>
                  <i className="fas fa-dollar-sign"></i>
                </div>
                <div className={styles.cardContent}>
                  <h3>{t('catalog.averagePrice')}</h3>
                  <p className={styles.cardValue}>{formatUsd(avgPrice)}</p>
                  <p className={styles.cardSubtext}>{t('catalog.perCarat')}</p>
                </div>
              </div>

              <div className={styles.summaryCard}>
                <div className={styles.cardIcon}>
                  <i className="fas fa-chart-line"></i>
                </div>
                <div className={styles.cardContent}>
                  <h3>{t('catalog.priceVolatility')}</h3>
                  <p className={styles.cardValue}>{formatUsd(priceVolatility)}</p>
                  <p className={styles.cardSubtext}>{t('catalog.rangeThisWeek')}</p>
                </div>
              </div>

              <div className={styles.summaryCard}>
                <div className={styles.cardIcon}>
                  <i className="fas fa-exchange-alt"></i>
                </div>
                <div className={styles.cardContent}>
                  <h3>{t('catalog.marketActivity')}</h3>
                  <p className={styles.cardValue}>+{totalNewProducts} / -{totalDisappeared}</p>
                  <p className={styles.cardSubtext}>{t('catalog.newDisappeared')}</p>
                </div>
              </div>
            </div>

            {/* Price Chart */}
            <div className={styles.chartSection}>
              <h3>{t('catalog.priceTrends')}</h3>
              <div className={`${sharedStyles.chartContainer} ${styles.chartContainer}`}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>

            {/* Market Factors */}
            <div className={styles.marketFactorsSection}>
              <h3>{t('catalog.marketFactorsAnalysis')}</h3>
              <div className={styles.factorsGrid}>
                <div className={styles.factorCard}>
                  <h4>{t('catalog.economicIndicators')}</h4>
                  <div className={styles.factorList}>
                    {analyticsData.map((item, index) => (
                      <div key={index} className={styles.factorItem}>
                        <span className={styles.factorDate}>{formatDateShort(item.date)}</span>
                        <div className={styles.factorValues}>
                          {item.goldPrice && item.goldPrice > 0 && (
                            <span title={`${t('catalog.gold')}: ${formatUsd(item.goldPrice)}`}>
                              Au: {formatUsdCompact(item.goldPrice, 0)}
                            </span>
                          )}
                          {item.oilPrice && item.oilPrice > 0 && (
                            <span title={`${t('catalog.oil')}: ${formatUsd(item.oilPrice)}`}>
                              {t('catalog.oil')}: {formatUsdCompact(item.oilPrice, 0)}
                            </span>
                          )}
                          {item.inrUsdRate && item.inrUsdRate > 0 && (
                            <span title={`${t('catalog.usdInr')}: ${item.inrUsdRate.toFixed(2)}`}>
                              ₹: {item.inrUsdRate.toFixed(1)}
                            </span>
                          )}
                          {(!item.goldPrice || item.goldPrice <= 0) && 
                           (!item.oilPrice || item.oilPrice <= 0) && 
                           (!item.inrUsdRate || item.inrUsdRate <= 0) && (
                            <span className={styles.noDataIndicator}>{t('catalog.noData')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.factorCard}>
                  <h4>{t('catalog.priceChanges')}</h4>
                  <div className={styles.factorList}>
                    {analyticsData.map((item, index) => (
                      <div key={index} className={styles.factorItem}>
                        <span className={styles.factorDate}>{formatDateShort(item.date)}</span>
                        <div className={styles.factorValues}>
                          {item.priceIncreasedCount > 0 && (
                            <span className={styles.priceIncrease} title={t('catalog.productsIncreasedInPrice', { count: item.priceIncreasedCount })}>
                              ↑ {item.priceIncreasedCount} {t('catalog.increased')}
                            </span>
                          )}
                          {item.priceDecreasedCount > 0 && (
                            <span className={styles.priceDecrease} title={t('catalog.productsDecreasedInPrice', { count: item.priceDecreasedCount })}>
                              ↓ {item.priceDecreasedCount} {t('catalog.decreased')}
                            </span>
                          )}
                          {item.priceUnchangedCount > 0 && (
                            <span className={styles.priceUnchanged} title={t('catalog.productsUnchanged', { count: item.priceUnchangedCount })}>
                              → {item.priceUnchangedCount} {t('catalog.unchanged')}
                            </span>
                          )}
                          {item.priceIncreasedCount === 0 && item.priceDecreasedCount === 0 && item.priceUnchangedCount === 0 && (
                            <span className={styles.noDataIndicator}>{t('catalog.noPriceChanges')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Data Complexity Indicator */}
            <div className={styles.complexitySection}>
              <h3>{t('catalog.dataPointsAnalyzed')}</h3>
              <div className={styles.complexityGrid}>
                <div className={styles.complexityItem}>
                  <i className="fas fa-database"></i>
                  <span>{t('catalog.productCounts')}</span>
                  <strong>{analyticsData.length} {t('catalog.days')}</strong>
                </div>
                <div className={styles.complexityItem}>
                  <i className="fas fa-chart-bar"></i>
                  <span>{t('catalog.priceMetrics')}</span>
                  <strong>3 {t('catalog.typesPerDay')}</strong>
                </div>
                <div className={styles.complexityItem}>
                  <i className="fas fa-globe"></i>
                  <span>{t('catalog.marketFactors')}</span>
                  <strong>3 {t('catalog.indicators')}</strong>
                </div>
                <div className={styles.complexityItem}>
                  <i className="fas fa-exchange-alt"></i>
                  <span>{t('catalog.priceChanges')}</span>
                  <strong>3 {t('catalog.categories')}</strong>
                </div>
                <div className={styles.complexityItem}>
                  <i className="fas fa-plus-minus"></i>
                  <span>{t('catalog.productFlow')}</span>
                  <strong>2 {t('catalog.directions')}</strong>
                </div>
                <div className={styles.complexityItem}>
                  <i className="fas fa-calculator"></i>
                  <span>{t('catalog.totalCalculations')}</span>
                  <strong>{analyticsData.length * 12}+</strong>
                </div>
              </div>
              <div className={styles.complexityNote}>
                <i className="fas fa-info-circle"></i>
                <p>
                  {t('catalog.marketPriceCalculationNote', { count: analyticsData.length * 12 })}
                </p>
              </div>
            </div>
          </>
        )}

        {!loading && !error && analyticsData.length === 0 && (
          <div className={sharedStyles.noDataState}>
            <i className="fas fa-chart-line"></i>
            <h3>{t('catalog.noDataAvailable')}</h3>
            <p>{t('catalog.noAnalyticsDataFound', {
              shape: displayShape || category.shape,
              weight: category.weight,
              clarity: category.clarity,
              color: category.color
            })}</p>
            <div className={sharedStyles.noDataInfo}>
              <p>{t('catalog.thisCouldMean')}</p>
              <ul>
                <li>{t('catalog.noProductsOfThisSpecification')}</li>
                <li>{t('catalog.analyticsDataStillBeingCollected')}</li>
                <li>{t('catalog.categoryMightBeTooSpecific')}</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default CategoryAnalyticsModal;
