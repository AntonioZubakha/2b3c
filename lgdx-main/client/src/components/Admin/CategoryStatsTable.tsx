import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import api from '../../api';
import {
  ClarityCategory,
  ColorCategoryEnum,
  determineWeightCategory,
} from '../../types/constants';
import { formatUsdCompact } from '../../utils/currency';
import styles from './CategoryStatsTable.module.css';

const DAY_OPTIONS = [1, 3, 7, 14, 30] as const;

const AVAILABLE_SHAPES = [
  'ROUND', 'OVAL', 'PEAR', 'CUSHION', 'EMERALD',
  'RADIANT', 'PRINCESS', 'MARQUISE', 'HEART', 'ASSCHER', 'FANCY',
] as const;

const SHAPE_PRESETS: { name: 'Classic' | 'Global' | 'Elongated' | 'All'; shapes: string[]; icon: string }[] = [
  { name: 'Classic', shapes: ['ROUND'], icon: '💎' },
  { name: 'Global', shapes: ['ROUND', 'PRINCESS', 'CUSHION'], icon: '👑' },
  { name: 'Elongated', shapes: ['OVAL', 'PEAR', 'MARQUISE'], icon: '💫' },
  { name: 'All', shapes: [], icon: '🌟' },
];

// Types for category stats
interface CategoryStatItem {
  count: number;
  avgPricePerCarat?: number;
  medianPricePerCarat?: number;
  newProductsToday?: number;
  disappearedProductsSinceYesterday?: number;
  priceIncreasedCount?: number;
  priceDecreasedCount?: number;
  priceUnchangedCount?: number;
  // color?: string; // Color is part of the key, not usually stored duplicatively here
  // New fields
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

interface CategoryStat { // This represents the raw data from API for one category-date point
  _id: string;
  date: string;
  shape: string;
  weight: string;
  clarity: string;
  color: string; // Added: D, E, F, G
  count: number;
  avgPricePerCarat?: number;
  medianPricePerCarat?: number;
  newProductsToday?: number;
  disappearedProductsSinceYesterday?: number;
  priceIncreasedCount?: number;
  priceDecreasedCount?: number;
  priceUnchangedCount?: number;
  // New fields
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
  color: string; // Added
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
  stats: Record<string, CategoryStatItem>; // key is shape-weight-clarity, value is object with all metrics
  goldPrice?: number;
  oilPrice?: number;
  inrUsdRate?: number;
}

// Helper function to sort and group category keys
const getSortedAndGroupedCategoryKeys = (keysMap: Record<string, CategoryKey>): CategoryKey[] => {
  const sortedCategoryKeys = Object.values(keysMap).sort((a, b) => {
    if (a.shape !== b.shape) {
      // Определяем порядок шейпов: сначала основные, потом FANCY
      const shapeOrder = { 
        'ROUND': 0, 'OVAL': 1, 'PEAR': 2, 'CUSHION': 3, 'EMERALD': 4, 
        'RADIANT': 5, 'PRINCESS': 6, 'MARQUISE': 7, 'HEART': 8, 'ASSCHER': 9,
        'FANCY': 10
      };
      return (shapeOrder[a.shape as keyof typeof shapeOrder] || 10) - (shapeOrder[b.shape as keyof typeof shapeOrder] || 10);
    }
    const weightA = parseFloat(a.weight.split('-')[0]);
    const weightB = parseFloat(b.weight.split('-')[0]);
    if (weightA !== weightB) {
      return weightA - weightB;
    }
    const clarityOrder = { 'IF': 0, 'VVS1': 1, 'VVS2': 2, 'VS1': 3, 'VS2': 4 };
    const clarityComparison = clarityOrder[a.clarity as keyof typeof clarityOrder] - clarityOrder[b.clarity as keyof typeof clarityOrder];
    if (clarityComparison !== 0) return clarityComparison;
    const colorOrder = { 'D': 0, 'E': 1, 'F': 2, 'G': 3 };
    return colorOrder[a.color as keyof typeof colorOrder] - colorOrder[b.color as keyof typeof colorOrder];
  });

  return sortedCategoryKeys;
};

const CategoryStatsTable: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dateColumns, setDateColumns] = useState<DateColumnData[]>([]);
  const [categoryKeys, setCategoryKeys] = useState<CategoryKey[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [daysToShow, setDaysToShow] = useState<number>(3);
  const [showCountDetails, setShowCountDetails] = useState<boolean>(false);

  // State for filters
  const [filterWeightInput, setFilterWeightInput] = useState<string>('');
  const [filterClarity, setFilterClarity] = useState<ClarityCategory[]>([]);
  const [filterColor, setFilterColor] = useState<ColorCategoryEnum[]>([]);
  const [filterShape, setFilterShape] = useState<string[]>(['ROUND']); // Default to ROUND only
  const [hideEmptyRows, setHideEmptyRows] = useState<boolean>(true);

  const getCategoryKey = useCallback((stat: CategoryStat | CategoryKey): string => {
    return `${stat.shape}-${stat.weight}-${stat.clarity}-${stat.color}`;
  }, []);

  const fetchStatsForDateRange = useCallback(async (endDate: Date, numDays: number) => {
    setLoading(true);
    setError(null);

    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (numDays - 1));

    try{
      // Build query parameters with default filters
      const queryParams: {
        startDate: string;
        endDate: string;
        shape?: string[];
        weight?: string;
      } = {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
      };

      // Always request ALL shapes - filtering will be done on frontend
      queryParams.shape = [...AVAILABLE_SHAPES];
      
      // Don't send clarity/color filters to backend - filter on frontend
      // This ensures we get all data and can filter by multiple values

      const weightQuery = parseFloat(filterWeightInput);
      if (!isNaN(weightQuery)) {
        queryParams.weight = determineWeightCategory(weightQuery);
      }

      const response = await api.get<CategoryStatsResponse>('/category-stats', {
        params: queryParams,
      });

      const stats: CategoryStat[] = response.data.data;

      // Process data
      const newDateColumns: DateColumnData[] = [];
      const categoryKeysMap: Record<string, CategoryKey> = {};

      // Create a map for quick lookup: dateString -> stats
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

          // Convert CategoryStat to CategoryStatItem
          const statItem: CategoryStatItem = {
            count: stat.count,
            avgPricePerCarat: stat.avgPricePerCarat,
            medianPricePerCarat: stat.medianPricePerCarat,
            newProductsToday: stat.newProductsToday,
            disappearedProductsSinceYesterday: stat.disappearedProductsSinceYesterday,
            priceIncreasedCount: stat.priceIncreasedCount,
            priceDecreasedCount: stat.priceDecreasedCount,
            priceUnchangedCount: stat.priceUnchangedCount,
            marketPricePerCarat: stat.marketPricePerCarat,
            avgPricePerCarat_newProducts: stat.avgPricePerCarat_newProducts,
            avgPricePerCarat_disappearedProducts: stat.avgPricePerCarat_disappearedProducts,
            avgPricePerCarat_priceIncreased: stat.avgPricePerCarat_priceIncreased,
            avgPricePerCarat_priceDecreased: stat.avgPricePerCarat_priceDecreased,
            avgPricePerCarat_priceUnchanged: stat.avgPricePerCarat_priceUnchanged,
            medianPricePerCarat_newProducts: stat.medianPricePerCarat_newProducts,
            medianPricePerCarat_disappearedProducts: stat.medianPricePerCarat_disappearedProducts,
            medianPricePerCarat_priceIncreased: stat.medianPricePerCarat_priceIncreased,
            medianPricePerCarat_priceDecreased: stat.medianPricePerCarat_priceDecreased,
            medianPricePerCarat_priceUnchanged: stat.medianPricePerCarat_priceUnchanged,
          };

          statsMap[key] = statItem;
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

      const finalCategoryKeys = getSortedAndGroupedCategoryKeys(categoryKeysMap);
      setDateColumns(newDateColumns.reverse()); // Show earliest date first
      setCategoryKeys(finalCategoryKeys);

    } catch (err) {
      setError(t('categoryStats.failedToLoadData'));
    } finally {
      setLoading(false);
    }
  }, [filterWeightInput, getCategoryKey, t]);

  useEffect(() => {
    fetchStatsForDateRange(currentDate, daysToShow);
  }, [currentDate, daysToShow, fetchStatsForDateRange]);

  // Memoized and filtered category keys for display
  const displayedCategoryKeys = useMemo(() => {
    let filtered = [...categoryKeys];

    // 1. Filter by Shape (frontend filtering for multiple selections)
    if (filterShape.length > 0) {
      filtered = filtered.filter(cat => filterShape.includes(cat.shape));
    }
    // If no shape filter is applied, show all shapes (we now request all shapes from API)

    // 2. Filter by Weight
    const weightQuery = parseFloat(filterWeightInput);
    if (!isNaN(weightQuery)) {
      const targetWeightCategory = determineWeightCategory(weightQuery);
      filtered = filtered.filter(cat => cat.weight === targetWeightCategory);
    }

    // 3. Filter by Clarity
    if (filterClarity.length > 0) {
      filtered = filtered.filter(cat => filterClarity.includes(cat.clarity as ClarityCategory));
    }

    // 4. Filter by Color
    if (filterColor.length > 0) {
      filtered = filtered.filter(cat => filterColor.includes(cat.color as ColorCategoryEnum));
    }

    // 5. Hide empty rows
    if (hideEmptyRows) {
      filtered = filtered.filter(catKey => {
        const catId = getCategoryKey(catKey);
        // A row is considered non-empty if it has a count > 0 on AT LEAST ONE date
        return dateColumns.some(col => col.stats[catId]?.count > 0);
      });
    }

    return filtered;
  }, [categoryKeys, filterShape, filterWeightInput, filterClarity, filterColor, hideEmptyRows, dateColumns, getCategoryKey]);

  // Format category for display
  const formatCategory = (category: CategoryKey): string => {
    return `${category.shape} / ${category.weight} / ${category.clarity} / ${category.color}`;
  };

  // Format date to YYYY-MM-DD
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Format date to MMM D (e.g. Jan 1)
  const formatDateShort = (dateStr: string): string => {
    const date = new Date(dateStr);
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  // Add days to date
  const addDaysToDate = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // Subtract days from date
  const subtractDaysFromDate = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  };

  // Handlers to change date/days
  const handleNextDay = () => setCurrentDate(addDaysToDate(currentDate, 2));
  const handlePreviousDay = () => setCurrentDate(subtractDaysFromDate(currentDate, 2));

  if (loading) {
    return <div className={styles.categoryStatsLoading}>{t('categoryStats.loadingCategoryStats')}</div>;
  }

  if (error) {
    return <div className={styles.categoryStatsError}>{error}</div>;
  }

  return (
    <div className={styles['category-stats-main-card']}>
      <div className={styles['category-stats-container']}>
        <div className={styles['category-stats-controls']}>
          {/* Новый дропдаун выбора периода и стрелки управления датами */}
          <div className={styles.controlsRow}>
            <div className={styles.periodControls} aria-label="Period controls">
              <button
                className={styles.dateNavButton}
                onClick={handlePreviousDay}
                title={t('categoryStats.previous2Days')}
                aria-label={t('categoryStats.previous2Days')}
              >
                &#8592;
              </button>
              <label htmlFor="daysDropdown" className={styles.periodLabel}>{t('categoryStats.period')}</label>
              <select
                id="daysDropdown"
                className={styles.daysDropdown}
                value={daysToShow}
                onChange={e => setDaysToShow(Number(e.target.value))}
              >
                {DAY_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{t('categoryStats.days', { count: opt })}</option>
                ))}
              </select>
              <button
                className={styles.dateNavButton}
                onClick={handleNextDay}
                title={t('categoryStats.next2Days')}
                aria-label={t('categoryStats.next2Days')}
              >
                &#8594;
              </button>
            </div>

            <div className={styles.detailToggle} role="group" aria-label="Count detail level">
              <button
                type="button"
                className={`${styles.detailToggleButton} ${!showCountDetails ? styles.active : ''}`}
                aria-pressed={!showCountDetails}
                onClick={() => setShowCountDetails(false)}
                title="Compact"
              >
                Compact
              </button>
              <button
                type="button"
                className={`${styles.detailToggleButton} ${showCountDetails ? styles.active : ''}`}
                aria-pressed={showCountDetails}
                onClick={() => setShowCountDetails(true)}
                title="Detailed"
              >
                Detailed
              </button>
            </div>
          </div>
          <div className={styles.filtersContainer}>
            <div className={styles.mainFiltersSection}>
              <div className={styles.categoryStatsFiltersRow}>
            <div className={styles.filterGroup}>
              <label htmlFor="weightFilter">{t('categoryStats.weightFilter')}</label>
              <input
                type="number"
                id="weightFilter"
                step="0.01"
                value={filterWeightInput}
                onChange={(e) => setFilterWeightInput(e.target.value)}
                placeholder={t('categoryStats.filterByWeight')}
                className={styles.filterInput}
              />
            </div>
            <div className={styles.filterGroup}>
              <label>{t('categoryStats.clarity')}</label>
              <div className={styles.filterButtons}>
                {(Object.values(ClarityCategory) as ClarityCategory[]).map(clarityValue => (
                  <button
                    key={clarityValue}
                    className={`${styles.filterButton} ${filterClarity.includes(clarityValue) ? styles.active : ''}`}
                    onClick={() => {
                      const newSelection = [...filterClarity];
                      if (newSelection.includes(clarityValue)) {
                        setFilterClarity(newSelection.filter(c => c !== clarityValue));
                      } else {
                        newSelection.push(clarityValue);
                        setFilterClarity(newSelection);
                      }
                    }}
                    type="button"
                  >
                    {clarityValue}
                  </button>
                ))}
                <button
                  className={`${styles.filterButton} ${filterClarity.length === 0 ? styles.active : ''}`}
                  onClick={() => setFilterClarity([])}
                  type="button"
                >
                  {t('categoryStats.all')}
                </button>
              </div>
            </div>
            <div className={styles.filterGroup}>
              <label>{t('categoryStats.color')}</label>
              <div className={styles.filterButtons}>
                {(Object.values(ColorCategoryEnum) as ColorCategoryEnum[]).map(colorValue => (
                  <button
                    key={colorValue}
                    className={`${styles.filterButton} ${filterColor.includes(colorValue) ? styles.active : ''}`}
                    onClick={() => {
                      const newSelection = [...filterColor];
                      if (newSelection.includes(colorValue)) {
                        setFilterColor(newSelection.filter(c => c !== colorValue));
                      } else {
                        newSelection.push(colorValue);
                        setFilterColor(newSelection);
                      }
                    }}
                    type="button"
                  >
                    {colorValue}
                  </button>
                ))}
                <button
                  className={`${styles.filterButton} ${filterColor.length === 0 ? styles.active : ''}`}
                  onClick={() => setFilterColor([])}
                  type="button"
                >
                  {t('categoryStats.all')}
                </button>
              </div>
            </div>
              <div className={styles.filterGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={hideEmptyRows}
                    onChange={() => setHideEmptyRows(!hideEmptyRows)}
                  />
                  {t('categoryStats.hideCategoriesNoProducts')}
                </label>
              </div>
            </div>
            </div>
            <div className={styles.shapeFiltersSection}>
              <div className={styles.filterGroup}>
                <label>{t('categoryStats.shapePresets')}</label>
                <div className={styles.presetButtons}>
                  {SHAPE_PRESETS.map(preset => (
                    <button
                      key={preset.name}
                      className={`${styles.presetButton} ${filterShape.length === preset.shapes.length && preset.shapes.every(shape => filterShape.includes(shape)) ? styles.active : ''}`}
                      onClick={() => setFilterShape([...preset.shapes])}
                      type="button"
                      title={t('categoryStats.selectShapes', { name: preset.name, shapes: preset.shapes.join(', ') || t('categoryStats.allShapes') })}
                    >
                      <span className={styles.presetIcon}>{preset.icon}</span>
                      {preset.name === 'Classic' ? t('categoryStats.classic') : preset.name === 'Global' ? t('categoryStats.global') : preset.name === 'Elongated' ? t('categoryStats.elongated') : t('categoryStats.allShapes')}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.filterGroup}>
                <label>{t('categoryStats.individualShapes')}</label>
                <div className={styles.filterButtons}>
                  {AVAILABLE_SHAPES.map(shape => (
                    <button
                      key={shape}
                      className={`${styles.filterButton} ${filterShape.includes(shape) ? styles.active : ''}`}
                      data-shape={shape}
                      onClick={() => {
                        const newSelection = [...filterShape];
                        if (newSelection.includes(shape)) {
                          setFilterShape(newSelection.filter(s => s !== shape));
                        } else {
                          newSelection.push(shape);
                          setFilterShape(newSelection);
                        }
                      }}
                      type="button"
                      title={t('categoryStats.filterByShape', { shape })}
                    >
                      {shape}
                    </button>
                  ))}
                  <button
                    className={`${styles.filterButton} ${filterShape.length === 0 ? styles.active : ''}`}
                    onClick={() => setFilterShape([])}
                    type="button"
                    title={t('categoryStats.showAllShapes')}
                  >
                    {t('categoryStats.allShapes')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className={styles.categoryStatsTableWrapper}>
          <table className={styles.categoryStatsTable}>
            <thead>
              <tr>
                <th className={styles.categoryColumn}>{t('categoryStats.category')}</th>
                {dateColumns.map((column) => (
                  <th key={column.date} colSpan={4} className={styles.dateColumn}>
                    <div className={styles.dateHeaderMain}>{formatDateShort(column.date)}</div>
                    <div className={styles.economicIndicators}>
                      {column.goldPrice ? <span title={`Gold: ${formatUsdCompact(column.goldPrice, 2)}`}>Au: {formatUsdCompact(column.goldPrice, 0)}</span> : null}
                      {column.oilPrice ? <span title={`Oil: ${formatUsdCompact(column.oilPrice, 2)}`}>Oil: {formatUsdCompact(column.oilPrice, 0)}</span> : null}
                      {column.inrUsdRate ? <span title={`USD/INR: ${column.inrUsdRate.toFixed(2)}`}>₹: {column.inrUsdRate.toFixed(1)}</span> : null}
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                <th className={styles.categoryColumn}>&nbsp;</th>
                {dateColumns.map((column) => (
                  <React.Fragment key={`${column.date}-headers`}>
                    <th className={styles.priceHeader}>{t('categoryStats.count')}</th>
                    <th className={styles.priceHeader}>{t('categoryStats.avgPricePerCarat')}</th>
                    <th className={styles.priceHeader}>{t('categoryStats.medianPricePerCarat')}</th>
                    <th className={styles.priceHeader}>{t('categoryStats.marketPricePerCarat')}</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedCategoryKeys.map((category) => {
                const categoryKey = getCategoryKey(category);
                return (
                  <tr key={categoryKey}>
                    <td
                      className={styles.categoryCell}
                    >
                      <div className={styles.shapeIndicator} data-shape={category.shape}></div>
                      <span>{formatCategory(category)}</span>
                    </td>
                    {dateColumns.map((column) => {
                      const statItem = column.stats[categoryKey];
                      const netDelta =
                        statItem
                          ? ((statItem.newProductsToday || 0) - (statItem.disappearedProductsSinceYesterday || 0))
                          : 0;

                      return (
                        <React.Fragment key={`${column.date}-${categoryKey}-data`}>
                          <td
                            className={statItem && statItem.count > 0 ? styles.hasData : ''}
                          >
                            {statItem ? (
                              <>
                                <div className={styles.mainStat}>{statItem.count}</div>
                                {!showCountDetails ? (
                                  <div className={styles.compactTrend} title="Net new (new today - disappeared)">
                                    Δ {netDelta >= 0 ? `+${netDelta}` : netDelta}
                                  </div>
                                ) : (
                                  <div className={styles.subStats}>
                                    {typeof statItem.newProductsToday === 'number' && statItem.newProductsToday !== 0 && (
                                      <div title={`New Today: +${statItem.newProductsToday}`}>
                                        NT: +{statItem.newProductsToday}
                                        {statItem.medianPricePerCarat_newProducts && statItem.medianPricePerCarat_newProducts > 0 &&
                                          <span className={styles.subStatAvgPrice}>, Mdn {statItem.medianPricePerCarat_newProducts.toFixed(2)}</span>
                                        }
                                      </div>
                                    )}
                                    {typeof statItem.disappearedProductsSinceYesterday === 'number' && statItem.disappearedProductsSinceYesterday !== 0 && (
                                      <div title={`Disappeared Since Yesterday: -${statItem.disappearedProductsSinceYesterday}`}>
                                        DSY: -{statItem.disappearedProductsSinceYesterday}
                                        {statItem.medianPricePerCarat_disappearedProducts && statItem.medianPricePerCarat_disappearedProducts > 0 &&
                                          <span className={styles.subStatAvgPrice}>, Mdn {statItem.medianPricePerCarat_disappearedProducts.toFixed(2)}</span>
                                        }
                                      </div>
                                    )}
                                    {typeof statItem.priceIncreasedCount === 'number' && statItem.priceIncreasedCount !== 0 && (
                                      <div title={`Price Increased: +${statItem.priceIncreasedCount}`}>
                                        PI: +{statItem.priceIncreasedCount}
                                        {statItem.medianPricePerCarat_priceIncreased && statItem.medianPricePerCarat_priceIncreased > 0 &&
                                          <span className={styles.subStatAvgPrice}>, Mdn {statItem.medianPricePerCarat_priceIncreased.toFixed(2)}</span>
                                        }
                                      </div>
                                    )}
                                    {typeof statItem.priceDecreasedCount === 'number' && statItem.priceDecreasedCount !== 0 && (
                                      <div title={`Price Decreased: -${statItem.priceDecreasedCount}`}>
                                        PD: -{statItem.priceDecreasedCount}
                                        {statItem.medianPricePerCarat_priceDecreased && statItem.medianPricePerCarat_priceDecreased > 0 &&
                                          <span className={styles.subStatAvgPrice}>, Mdn {statItem.medianPricePerCarat_priceDecreased.toFixed(2)}</span>
                                        }
                                      </div>
                                    )}
                                    {typeof statItem.priceUnchangedCount === 'number' && statItem.priceUnchangedCount !== 0 && (
                                      <div title={`Price Unchanged: ${statItem.priceUnchangedCount}`}>
                                        PU: {statItem.priceUnchangedCount}
                                        {statItem.medianPricePerCarat_priceUnchanged && statItem.medianPricePerCarat_priceUnchanged > 0 &&
                                          <span className={styles.subStatAvgPrice}>, Mdn {statItem.medianPricePerCarat_priceUnchanged.toFixed(2)}</span>
                                        }
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            ) : '-'}
                          </td>
                          <td className={statItem && statItem.avgPricePerCarat ? styles.hasData : ''}>{statItem && statItem.avgPricePerCarat ? statItem.avgPricePerCarat.toFixed(2) : '-'}</td>
                          <td className={statItem && statItem.medianPricePerCarat ? styles.hasData : ''}>{statItem && statItem.medianPricePerCarat ? statItem.medianPricePerCarat.toFixed(2) : '-'}</td>
                          <td className={statItem && statItem.marketPricePerCarat ? styles.hasData : ''}>{statItem && statItem.marketPricePerCarat ? statItem.marketPricePerCarat.toFixed(2) : '-'}</td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CategoryStatsTable;
