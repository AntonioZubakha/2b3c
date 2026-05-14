import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Line, Bar, Pie } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import '../../utils/chartInit';
import {
  ClarityCategory,
  ColorCategoryEnum,
} from '../../types/constants';
import api from '../../api';
import { formatUsdCompact } from '../../utils/currency';
import styles from './VisualAnalytics.module.css';

// Types (same as CategoryStatsTable)
interface CategoryStatItem {
  count: number;
  avgPricePerCarat?: number;
  medianPricePerCarat?: number;
  newProductsToday?: number;
  disappearedProductsSinceYesterday?: number;
  priceIncreasedCount?: number;
  priceDecreasedCount?: number;
  priceUnchangedCount?: number;
  marketPricePerCarat?: number;
  avgPricePerCarat_newProducts?: number;
  avgPricePerCarat_disappearedProducts?: number;
  avgPricePerCarat_priceIncreased?: number;
  avgPricePerCarat_priceDecreased?: number;
  avgPricePerCarat_priceUnchanged?: number;
  medianPricePerCarat_newProducts?: number;
  medianPricePerCarat_disappearedProducts?: number;
  medianPricePerCarat_priceIncreased?: number;
  medianPricePerCarat_priceDecreased?: number;
  medianPricePerCarat_priceUnchanged?: number;
  goldPrice?: number;
  oilPrice?: number;
  inrUsdRate?: number;
}

// Новые категории шейпов
enum ShapeCategory {
  ROUND = 'ROUND',
  OVAL = 'OVAL',
  PEAR = 'PEAR',
  CUSHION = 'CUSHION',
  EMERALD = 'EMERALD',
  RADIANT = 'RADIANT',
  PRINCESS = 'PRINCESS',
  MARQUISE = 'MARQUISE',
  HEART = 'HEART',
  ASSCHER = 'ASSCHER',
  FANCY = 'FANCY'
}

interface CategoryStat {
  _id: string;
  date: string;
  shape: string;
  weight: string;
  clarity: string;
  color: string;
  count: number;
  avgPricePerCarat?: number;
  medianPricePerCarat?: number;
  newProductsToday?: number;
  disappearedProductsSinceYesterday?: number;
  priceIncreasedCount?: number;
  priceDecreasedCount?: number;
  priceUnchangedCount?: number;
  marketPricePerCarat?: number;
  avgPricePerCarat_newProducts?: number;
  avgPricePerCarat_disappearedProducts?: number;
  avgPricePerCarat_priceIncreased?: number;
  avgPricePerCarat_priceDecreased?: number;
  avgPricePerCarat_priceUnchanged?: number;
  medianPricePerCarat_newProducts?: number;
  medianPricePerCarat_disappearedProducts?: number;
  medianPricePerCarat_priceIncreased?: number;
  medianPricePerCarat_priceDecreased?: number;
  medianPricePerCarat_priceUnchanged?: number;
  goldPrice?: number;
  oilPrice?: number;
  inrUsdRate?: number;
}

interface CategoryKey {
  shape: string;
  weight: string;
  clarity: string;
  color: string;
}

interface CategoryStatsResponse {
  success: boolean;
  startDate?: string;
  endDate?: string;
  totalRecords?: number;
  data: CategoryStat[];
}

interface DateColumnData {
  date: string;
  stats: Record<string, CategoryStatItem>;
  goldPrice?: number;
  oilPrice?: number;
  inrUsdRate?: number;
}

const VisualAnalytics: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dateColumns, setDateColumns] = useState<DateColumnData[]>([]);
  const [categoryKeys, setCategoryKeys] = useState<CategoryKey[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [daysToShow, setDaysToShow] = useState<number>(7);

  const getCategoryKey = (stat: CategoryStat | CategoryKey): string => {
    return `${stat.shape}-${stat.weight}-${stat.clarity}-${stat.color}`;
  };

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

  const fetchStatsForDateRange = useCallback(async (endDate: Date, numDays: number) => {
    setLoading(true);
    setError(null);

    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (numDays - 1));


    try {
      const response = await api.get<CategoryStatsResponse>('/category-stats', {
        params: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
        },
      });

      const stats: CategoryStat[] = response.data.data;

      const newDateColumns: DateColumnData[] = [];
      const categoryKeysMap: Record<string, CategoryKey> = {};

      const statsByDate: Record<string, CategoryStat[]> = {};
      stats.forEach(stat => {
        const dateKey = stat.date.split('T')[0];
        if (!statsByDate[dateKey]) {
          statsByDate[dateKey] = [];
        }
        statsByDate[dateKey].push(stat);

        const catKey = getCategoryKey(stat);
        if (!categoryKeysMap[catKey]) {
          categoryKeysMap[catKey] = {
            shape: stat.shape,
            weight: stat.weight,
            clarity: stat.clarity,
            color: stat.color,
          };
        }
      });
      
      for (let i = 0; i < numDays; i++) {
        const d = new Date(endDate);
        d.setDate(d.getDate() - i);
        const dateStr = formatDate(d);

        const dailyStats = statsByDate[dateStr] || [];
        const statsMap: Record<string, CategoryStatItem> = {};
        
        dailyStats.forEach(stat => {
          const key = getCategoryKey(stat);
          statsMap[key] = stat;
        });

        const goldPrice = dailyStats.length > 0 ? dailyStats[0].goldPrice : undefined;
        const oilPrice = dailyStats.length > 0 ? dailyStats[0].oilPrice : undefined;
        const inrUsdRate = dailyStats.length > 0 ? dailyStats[0].inrUsdRate : undefined;

        newDateColumns.push({
          date: dateStr,
          stats: statsMap,
          goldPrice,
          oilPrice,
          inrUsdRate
        });
      }

      setDateColumns(newDateColumns.reverse());
      setCategoryKeys(Object.values(categoryKeysMap));

    } catch (err) {
      setError('Failed to load data. Please try refreshing the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatsForDateRange(currentDate, daysToShow);
  }, [currentDate, daysToShow, fetchStatsForDateRange]);

  // Memoized chart data calculations
  const shapeDistributionData = useMemo(() => {
    if (!dateColumns.length) return null;

    const latestData = dateColumns[dateColumns.length - 1];
    const shapeTotals: Record<string, number> = {};

    // Инициализируем все категории шейпов
    Object.values(ShapeCategory).forEach(shape => {
      shapeTotals[shape] = 0;
    });

    Object.values(latestData.stats).forEach(stat => {
      if (stat.count > 0) {
        const shape = categoryKeys.find(key =>
          getCategoryKey(key) === Object.keys(latestData.stats).find(k => latestData.stats[k] === stat)
        )?.shape;

        if (shape && Object.prototype.hasOwnProperty.call(shapeTotals, shape)) {
          shapeTotals[shape] += stat.count;
        }
      }
    });

    // Получаем топ-6 шейпов для отображения
    const sortedShapes = Object.entries(shapeTotals)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const labels = sortedShapes.map(([shape]) => {
      switch (shape) {
        case ShapeCategory.ROUND: return 'Round';
        case ShapeCategory.OVAL: return 'Oval';
        case ShapeCategory.PEAR: return 'Pear';
        case ShapeCategory.CUSHION: return 'Cushion';
        case ShapeCategory.EMERALD: return 'Emerald';
        case ShapeCategory.RADIANT: return 'Radiant';
        case ShapeCategory.PRINCESS: return 'Princess';
        case ShapeCategory.MARQUISE: return 'Marquise';
        case ShapeCategory.HEART: return 'Heart';
        case ShapeCategory.ASSCHER: return 'Asscher';
        case ShapeCategory.FANCY: return 'Fancy';
        default: return shape;
      }
    });

    const data = sortedShapes.map(([, count]) => count);

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: [
          'var(--color-chart-round)',      // ROUND - голубой
          'var(--color-chart-oval)',       // OVAL - бирюзовый
          'var(--color-chart-pear)',       // PEAR - оранжевый
          'var(--color-chart-cushion)',    // CUSHION - розовый
          'var(--color-chart-emerald)',    // EMERALD - синий
          'var(--color-chart-radiant)',    // RADIANT - желтый
          'var(--color-chart-princess)',   // PRINCESS - светло-бирюзовый
          'var(--color-chart-marquise)',   // MARQUISE - фиолетовый
          'var(--color-chart-heart)',      // HEART - светло-оранжевый
          'var(--color-chart-asscher)',    // ASSCHER - серый
          'var(--color-chart-fancy)'       // FANCY - индиго
        ].slice(0, data.length),
        borderColor: [
          'var(--color-chart-round)',
          'var(--color-chart-oval)',
          'var(--color-chart-pear)',
          'var(--color-chart-cushion)',
          'var(--color-chart-emerald)',
          'var(--color-chart-radiant)',
          'var(--color-chart-princess)',
          'var(--color-chart-marquise)',
          'var(--color-chart-heart)',
          'var(--color-chart-asscher)',
          'var(--color-chart-fancy)'
        ].slice(0, data.length),
        borderWidth: 2
      }]
    };
  }, [dateColumns, categoryKeys]);

  const weightDistributionData = useMemo(() => {
    if (!dateColumns.length) return null;

    const latestData = dateColumns[dateColumns.length - 1];
    const weightTotals: Record<string, number> = {};

    categoryKeys.forEach(key => {
      const stat = latestData.stats[getCategoryKey(key)];
      if (stat && stat.count > 0) {
        weightTotals[key.weight] = (weightTotals[key.weight] || 0) + stat.count;
      }
    });

    const sortedWeights = Object.keys(weightTotals).sort((a, b) => {
      const aNum = parseFloat(a.split('-')[0]);
      const bNum = parseFloat(b.split('-')[0]);
      return aNum - bNum;
    });

    return {
      labels: sortedWeights,
      datasets: [{
        label: 'Product Count',
        data: sortedWeights.map(weight => weightTotals[weight]),
        backgroundColor: 'var(--color-chart-bg-alpha-1)',
        borderColor: 'var(--color-brand-primary)',
        borderWidth: 2
      }]
    };
  }, [dateColumns, categoryKeys]);

  const priceTimelineData = useMemo(() => {
    if (!dateColumns.length) return null;

    const labels = dateColumns.map(col => formatDateShort(col.date));

    // Создаем массивы для всех категорий шейпов
    const shapePrices: Record<string, (number | null)[]> = {};
    Object.values(ShapeCategory).forEach(shape => {
      shapePrices[shape] = [];
    });
    const marketPrices: (number | null)[] = [];

    dateColumns.forEach(col => {
      // Инициализируем суммы для каждого шейпа
      const shapeSums: Record<string, number> = {};
      const shapeCounts: Record<string, number> = {};
      Object.values(ShapeCategory).forEach(shape => {
        shapeSums[shape] = 0;
        shapeCounts[shape] = 0;
      });
      let marketSum = 0, marketCount = 0;

      Object.entries(col.stats).forEach(([keyStr, stat]) => {
        const key = categoryKeys.find(k => getCategoryKey(k) === keyStr);
        if (!key || !stat.count) return;

        if (stat.avgPricePerCarat) {
          shapeSums[key.shape] += stat.avgPricePerCarat * stat.count;
          shapeCounts[key.shape] += stat.count;
        }

        if (stat.marketPricePerCarat) {
          marketSum += stat.marketPricePerCarat * stat.count;
          marketCount += stat.count;
        }
      });

      // Добавляем средние цены для каждого шейпа
      Object.values(ShapeCategory).forEach(shape => {
        shapePrices[shape].push(shapeCounts[shape] > 0 ? shapeSums[shape] / shapeCounts[shape] : null);
      });

      marketPrices.push(marketCount > 0 ? marketSum / marketCount : null);
    });

    // Создаем датасеты только для шейпов, у которых есть данные
    const datasets: { label: string; data: (number | null)[]; backgroundColor: string; borderColor: string; tension?: number; fill?: boolean; borderWidth?: number }[] = [];
    const colors = [
      { border: 'var(--color-chart-round)', bg: 'var(--color-chart-bg-alpha-1)' },      // ROUND
      { border: 'var(--color-chart-oval)', bg: 'var(--color-chart-bg-alpha-2)' },        // OVAL
      { border: 'var(--color-chart-pear)', bg: 'var(--color-chart-bg-alpha-3)' },        // PEAR
      { border: 'var(--color-chart-cushion)', bg: 'var(--color-chart-bg-alpha-4)' },     // CUSHION
      { border: 'var(--color-chart-emerald)', bg: 'var(--color-chart-bg-alpha-5)' },     // EMERALD
      { border: 'var(--color-chart-radiant)', bg: 'var(--color-chart-bg-alpha-6)' },     // RADIANT
      { border: 'var(--color-chart-princess)', bg: 'var(--color-chart-bg-alpha-7)' },    // PRINCESS
      { border: 'var(--color-chart-marquise)', bg: 'var(--color-chart-bg-alpha-8)' },    // MARQUISE
      { border: 'var(--color-chart-heart)', bg: 'var(--color-chart-bg-alpha-9)' },        // HEART
      { border: 'var(--color-chart-asscher)', bg: 'var(--color-chart-bg-alpha-10)' },     // ASSCHER
      { border: 'var(--color-chart-fancy)', bg: 'var(--color-chart-bg-alpha-1)' }         // FANCY
    ];

    Object.values(ShapeCategory).forEach((shape, index) => {
      const prices = shapePrices[shape];
      // Проверяем, есть ли хоть одно значение
      if (prices.some(price => price !== null)) {
        datasets.push({
          label: `${shape.charAt(0).toUpperCase() + shape.slice(1)} Avg Price/ct`,
          data: prices,
          borderColor: colors[index].border,
          backgroundColor: colors[index].bg,
          tension: 0.3,
          fill: true
        });
      }
    });

    // Добавляем рыночную цену
    datasets.push({
      label: 'Market Price/ct',
      data: marketPrices,
      borderColor: 'var(--color-chart-currency)',
      backgroundColor: 'var(--color-chart-bg-alpha-4)',
      tension: 0.3,
      fill: true
    });

    return { labels, datasets };
  }, [dateColumns, categoryKeys]);

  const economicIndicatorsData = useMemo(() => {
    if (!dateColumns.length) return null;

    const labels = dateColumns.map(col => formatDateShort(col.date));
    const goldPrices = dateColumns.map(col => col.goldPrice || null);
    const oilPrices = dateColumns.map(col => col.oilPrice || null);
    const inrRates = dateColumns.map(col => col.inrUsdRate || null);

    return {
      labels,
      datasets: [
        {
          label: 'Gold Price ($)',
          data: goldPrices,
          borderColor: 'var(--color-chart-gold)',
          backgroundColor: 'var(--color-chart-bg-alpha-1)',
          yAxisID: 'y',
          tension: 0.3
        },
        {
          label: 'Oil Price ($)',
          data: oilPrices,
          borderColor: 'var(--color-chart-oil)',
          backgroundColor: 'var(--color-chart-bg-alpha-1)',
          yAxisID: 'y',
          tension: 0.3
        },
        {
          label: 'USD/INR Rate',
          data: inrRates,
          borderColor: 'var(--color-chart-currency)',
          backgroundColor: 'var(--color-chart-bg-alpha-4)',
          yAxisID: 'y1',
          tension: 0.3
        }
      ]
    };
  }, [dateColumns]);

  const clarityColorHeatmapData = useMemo(() => {
    if (!dateColumns.length) return null;

    const latestData = dateColumns[dateColumns.length - 1];
    const heatmapData: { clarity: string; color: string; count: number }[] = [];

    Object.values(ClarityCategory).forEach(clarity => {
      Object.values(ColorCategoryEnum).forEach(color => {
        const matchingKeys = categoryKeys.filter(key => key.clarity === clarity && key.color === color);
        const totalCount = matchingKeys.reduce((sum, key) => {
          const stat = latestData.stats[getCategoryKey(key)];
          return sum + (stat?.count || 0);
        }, 0);

        heatmapData.push({ clarity, color, count: totalCount });
      });
    });

    return heatmapData;
  }, [dateColumns, categoryKeys]);

  // Key metrics calculation
  const keyMetrics = useMemo(() => {
    if (!dateColumns.length) return null;

    const latestData = dateColumns[dateColumns.length - 1];
    const previousData = dateColumns.length > 1 ? dateColumns[dateColumns.length - 2] : null;

    let totalProducts = 0;
    let totalNewProducts = 0;
    let totalDisappeared = 0;
    let avgMarketPrice = 0;
    let marketPriceCount = 0;

    Object.values(latestData.stats).forEach(stat => {
      totalProducts += stat.count || 0;
      totalNewProducts += stat.newProductsToday || 0;
      totalDisappeared += stat.disappearedProductsSinceYesterday || 0;
      
      if (stat.marketPricePerCarat && stat.count) {
        avgMarketPrice += stat.marketPricePerCarat * stat.count;
        marketPriceCount += stat.count;
      }
    });

    avgMarketPrice = marketPriceCount > 0 ? avgMarketPrice / marketPriceCount : 0;

    let previousTotalProducts = 0;
    if (previousData) {
      Object.values(previousData.stats).forEach(stat => {
        previousTotalProducts += stat.count || 0;
      });
    }

    const productsChange = previousData ? 
      ((totalProducts - previousTotalProducts) / previousTotalProducts * 100) : 0;

    return {
      totalProducts,
      totalNewProducts,
      totalDisappeared,
      avgMarketPrice,
      productsChange,
      goldPrice: latestData.goldPrice,
      oilPrice: latestData.oilPrice,
      inrUsdRate: latestData.inrUsdRate
    };
  }, [dateColumns]);

  // Chart options
  const pieOptions: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: 'var(--color-text-primary)',
          font: {
            size: 12
          }
        }
      },
      title: {
        display: true,
        text: 'Distribution by Shape',
        color: 'var(--color-text-primary)',
        font: {
          size: 16,
          weight: 'bold'
        }
      }
    }
  };

  const barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: true,
        text: 'Carat',
        color: 'var(--color-text-primary)',
        font: {
          size: 16,
          weight: 'bold'
        }
      }
    },
    scales: {
      y: {
        ticks: {
          color: 'var(--color-text-secondary)'
        },
        grid: {
          color: 'var(--color-border-primary)'
        }
      },
      x: {
        ticks: {
          color: 'var(--color-text-secondary)',
          maxRotation: 45
        },
        grid: {
          display: false
        }
      }
    }
  };

  const lineOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: 'var(--color-text-primary)',
          font: {
            size: 12
          }
        }
      },
      title: {
        display: true,
        text: 'Price Trends Over Time',
        color: 'var(--color-text-primary)',
        font: {
          size: 16,
          weight: 'bold'
        }
      }
    },
    scales: {
      y: {
        ticks: {
          color: 'var(--color-text-secondary)',
          callback: (value) => formatUsdCompact(Number(value), 0)
        },
        grid: {
          color: 'var(--color-border-primary)'
        }
      },
      x: {
        ticks: {
          color: 'var(--color-text-secondary)'
        },
        grid: {
          display: false
        }
      }
    }
  };

  const economicOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: 'var(--color-text-primary)',
          font: {
            size: 12
          }
        }
      },
      title: {
        display: true,
        text: 'Economic Indicators',
        color: 'var(--color-text-primary)',
        font: {
          size: 16,
          weight: 'bold'
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: 'var(--color-text-secondary)'
        },
        grid: {
          display: false
        }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        ticks: {
          color: 'var(--color-text-secondary)'
        },
        grid: {
          color: 'var(--color-border-primary)'
        }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        ticks: {
          color: 'var(--color-text-secondary)'
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading visual analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.visualAnalyticsContainer}>
      {/* Controls */}
      <div className={styles.controlsSection}>
        <div className={styles.dateControls}>
          <button
            className={styles.navButton}
            onClick={() => setCurrentDate(new Date(currentDate.getTime() - 2 * 24 * 60 * 60 * 1000))}
          >
            ← Previous 2 days
          </button>
          
          <select
            value={daysToShow}
            onChange={(e) => setDaysToShow(Number(e.target.value))}
            className={styles.daysSelect}
          >
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>

          <button
            className={styles.navButton}
            onClick={() => setCurrentDate(new Date(currentDate.getTime() + 2 * 24 * 60 * 60 * 1000))}
          >
            Next 2 days →
          </button>
        </div>
      </div>

      {/* Key Metrics Dashboard */}
      {keyMetrics && (
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <h3>Total Products</h3>
            <div className={styles.metricValue}>{keyMetrics.totalProducts.toLocaleString()}</div>
            <div className={`${styles.metricChange} ${keyMetrics.productsChange >= 0 ? styles.positive : styles.negative}`}>
              {keyMetrics.productsChange >= 0 ? '+' : ''}{keyMetrics.productsChange.toFixed(1)}%
            </div>
          </div>
          
          <div className={styles.metricCard}>
            <h3>New Products (24h)</h3>
            <div className={styles.metricValue}>{keyMetrics.totalNewProducts.toLocaleString()}</div>
          </div>
          
          <div className={styles.metricCard}>
            <h3>Disappeared (24h)</h3>
            <div className={styles.metricValue}>{keyMetrics.totalDisappeared.toLocaleString()}</div>
          </div>
          
          <div className={styles.metricCard}>
            <h3>Avg Market Price</h3>
            <div className={styles.metricValue}>{formatUsdCompact(keyMetrics.avgMarketPrice, 0)}/ct</div>
          </div>
          
          <div className={styles.metricCard}>
            <h3>Gold Price</h3>
            <div className={styles.metricValue}>{keyMetrics.goldPrice != null ? formatUsdCompact(keyMetrics.goldPrice, 0) : 'N/A'}</div>
          </div>
          
          <div className={styles.metricCard}>
            <h3>USD/INR</h3>
            <div className={styles.metricValue}>{keyMetrics.inrUsdRate?.toFixed(2) || 'N/A'}</div>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className={styles.chartsGrid}>
        {/* Shape Distribution */}
        <div className={styles.chartCard}>
          <div className={styles.chartContainer}>
            {shapeDistributionData && (
              <Pie data={shapeDistributionData} options={pieOptions} />
            )}
          </div>
        </div>

        {/* Weight Distribution */}
        <div className={styles.chartCard}>
          <div className={styles.chartContainer}>
            {weightDistributionData && (
              <Bar data={weightDistributionData} options={barOptions} />
            )}
          </div>
        </div>

        {/* Price Timeline */}
        <div className={`${styles.chartCard} ${styles.wideChart}`}>
          <div className={styles.chartContainer}>
            {priceTimelineData && (
              <Line data={priceTimelineData} options={lineOptions} />
            )}
          </div>
        </div>

        {/* Economic Indicators */}
        <div className={`${styles.chartCard} ${styles.wideChart}`}>
          <div className={styles.chartContainer}>
            {economicIndicatorsData && (
              <Line data={economicIndicatorsData} options={economicOptions} />
            )}
          </div>
        </div>

        {/* Clarity-Color Heatmap */}
        <div className={`${styles.chartCard} ${styles.wideChart}`}>
          <div className={styles.heatmapContainer}>
            <h3 className={styles.chartTitle}>Clarity × Color Distribution</h3>
            <div className={styles.heatmapGrid}>
              <div className={styles.heatmapAxis}>
                <div className={styles.axisLabel}></div>
                {Object.values(ColorCategoryEnum).map(color => (
                  <div key={color} className={styles.axisItem}>{color}</div>
                ))}
              </div>
              {Object.values(ClarityCategory).map(clarity => (
                <div key={clarity} className={styles.heatmapRow}>
                  <div className={styles.rowLabel}>{clarity}</div>
                  {Object.values(ColorCategoryEnum).map(color => {
                    const dataPoint = clarityColorHeatmapData?.find(
                      d => d.clarity === clarity && d.color === color
                    );
                    const raw = dataPoint ? Math.min(dataPoint.count / 1000, 1) : 0;
                    const bucket = Math.round(raw * 10) * 10; // 0..100 step 10
                    return (
                      <div
                        key={`${clarity}-${color}`}
                        className={`${styles.heatmapCell} ${styles[`heatOpacity${bucket}`]}`}
                        title={`${clarity} / ${color}: ${dataPoint?.count || 0} products`}
                      >
                        {dataPoint && dataPoint.count > 0 ? dataPoint.count : ''}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisualAnalytics;
