import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChartData } from 'chart.js';
import api from '../api';
import { Product } from '../types';
import { ClarityCategory, ColorCategoryEnum, determineWeightCategory, getCategoryShapeForChart } from '../types/constants';
import { UsePriceHistoryResult } from '../types/hooks';
import { chartColors, chartColorsWithOpacity } from '../utils/chartColors';

// Types for category stats
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
  marketPricePerCarat?: number;
}

interface CategoryStatsResponse {
  success: boolean;
  startDate?: string;
  endDate?: string;
  totalRecords?: number;
  data: CategoryStat[];
}

// Cache for API responses
const categoryStatsCache = new Map<string, { data: CategoryStatsResponse; timestamp: number }>();
const pendingRequests = new Map<string, Promise<CategoryStatsResponse>>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes for better performance
const SESSION_STORAGE_KEY = 'priceHistoryCache';

// Session storage helpers for long-term caching
const getFromSessionStorage = (key: string): CategoryStatsResponse | null => {
  try {
    const stored = sessionStorage.getItem(`${SESSION_STORAGE_KEY}_${key}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Date.now() - parsed.timestamp < CACHE_DURATION) {
        return parsed.data;
      } else {
        sessionStorage.removeItem(`${SESSION_STORAGE_KEY}_${key}`);
      }
    }
  } catch (error) {
    // Silent fail
  }
  return null;
};

const saveToSessionStorage = (key: string, data: CategoryStatsResponse): void => {
  try {
    sessionStorage.setItem(`${SESSION_STORAGE_KEY}_${key}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (error) {
    // Silent fail
  }
};


/**
 * Custom hook for managing diamond price history
 * @param product - The diamond product
 * @param isChartVisible - Whether the chart should be visible
 * @returns Price history data and loading state
 */
export const usePriceHistory = (product: Product | null, isChartVisible: boolean): UsePriceHistoryResult => {
  const [priceHistory, setPriceHistory] = useState<ChartData<'line'> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize the cache key for this product's category (use category shape, e.g. FANCY for Baguette/Other/Trillion)
  const cacheKey = useMemo(() => {
    if (!product?.carat || !product?.shape || !product?.clarity || !product?.color) {
      return null;
    }
    const categoryShape = getCategoryShapeForChart(product.shape);
    const weightCategory = determineWeightCategory(product.carat);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 9); // 10 days total for chart
    const formatDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    return `${categoryShape}_${weightCategory}_${product.clarity}_${product.color}_${formatDate(startDate)}_${formatDate(endDate)}`;
  }, [product?.carat, product?.shape, product?.clarity, product?.color]);

  // Cached API call function
  const fetchCategoryStats = useCallback(async (key: string): Promise<CategoryStatsResponse> => {
    // Check session storage first (long-term cache)
    const sessionCached = getFromSessionStorage(key);
    if (sessionCached) {
      return sessionCached;
    }

    // Check memory cache second (short-term cache)
    const cached = categoryStatsCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      return cached.data;
    }

    // Check if request is already pending
    if (pendingRequests.has(key)) {
      const pendingRequest = pendingRequests.get(key);
      if (pendingRequest) {
        return pendingRequest;
      }
    }

    // Make new request using optimized chart endpoint
    const requestPromise = (async (): Promise<CategoryStatsResponse> => {
      if (!product || !product.shape || !product.clarity || !product.color) {
        throw new Error('Product data is incomplete');
      }

      const weightCategory = determineWeightCategory(product.carat || 0);
      const categoryShape = getCategoryShapeForChart(product.shape);

      const response = await api.get<{ success: boolean; data: CategoryStat[]; totalPoints: number; dateRange: { startDate: string; endDate: string } }>(
        `/category-stats/chart/${categoryShape}/${weightCategory}/${product.clarity}/${product.color}`,
        {
          params: {
            days: '10', // Get last 10 days for chart
          },
        }
      );

      // Transform response to match expected format
      const transformedResponse: CategoryStatsResponse = {
        success: response.data.success,
        data: response.data.data,
        totalRecords: response.data.totalPoints,
        startDate: response.data.dateRange.startDate,
        endDate: response.data.dateRange.endDate,
      };

      // Cache the response in both memory and session storage
      categoryStatsCache.set(key, {
        data: transformedResponse,
        timestamp: Date.now()
      });

      saveToSessionStorage(key, transformedResponse);

      // Remove from pending requests
      pendingRequests.delete(key);

      return transformedResponse;
    })().catch(error => {
      // Remove from pending requests even on error
      pendingRequests.delete(key);
      throw error;
    });

    pendingRequests.set(key, requestPromise);
    return requestPromise;
  }, [product]);

  useEffect(() => {
    if (!product || !cacheKey || !isChartVisible) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      setPriceHistory(null);

      try {
        const { clarity, color } = product;

        // Check if the product's category is one that is tracked for stats
        const isTrackedClarity = Object.values(ClarityCategory).includes(clarity as ClarityCategory);
        const isTrackedColor = Object.values(ColorCategoryEnum).includes(color as ColorCategoryEnum);

        if (!isTrackedClarity || !isTrackedColor) {
            if (cancelled) return;
            setPriceHistory(null);
            return;
        }

        const formatDate = (date: Date): string => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        // Use cached API call
        const response = await fetchCategoryStats(cacheKey);
        if (cancelled) return;

        const stats: CategoryStat[] = response.data;

        // Data is already filtered by API, no need for client-side filtering
        const categoryStats = stats;

        if (categoryStats.length > 0) {
          // Create a map of date -> marketPricePerCarat
          const priceMap = new Map<string, number>();
          let validDataPoints = 0;

          categoryStats.forEach(stat => {
            if (stat.marketPricePerCarat && stat.marketPricePerCarat > 0) {
              const dateStr = stat.date.split('T')[0]; // e.g. "2025-08-07"
              priceMap.set(dateStr, stat.marketPricePerCarat);
              validDataPoints++;
            }
          });

          // Only show chart if we have at least 2 valid data points
          if (validDataPoints < 2) {
            if (cancelled) return;
            setPriceHistory(null);
          } else {
            // Calculate GIA coefficient if this is a GIA product
            let giaCoefficient = 1.0;
            const isGiaProduct = product.certificateInstitute?.toUpperCase().includes('GIA');

            if (isGiaProduct && product.marketPricePerCarat) {
              // Find the most recent IGI base price from category stats (sorted by date descending)
              const sortedStats = categoryStats
                .filter(stat => stat.marketPricePerCarat && stat.marketPricePerCarat > 0)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

              const latestStat = sortedStats[0]; // Most recent stat
              if (latestStat && latestStat.marketPricePerCarat && latestStat.marketPricePerCarat > 0) {
                giaCoefficient = product.marketPricePerCarat / latestStat.marketPricePerCarat;
              }
            }

            // Create chart data for the last 10 days
            const labels: string[] = [];
            const dataPoints: (number | null)[] = [];

            for (let i = 9; i >= 0; i--) {
              const date = new Date();
              date.setDate(date.getDate() - i);

              const dateKey = formatDate(date);
              labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

              const basePrice = priceMap.get(dateKey);
              const adjustedPrice = basePrice ? basePrice * giaCoefficient : null;
              dataPoints.push(adjustedPrice);
            }

            const chartLabel = isGiaProduct ? 'GIA Market Price per Carat ($)' : 'Market Price per Carat ($)';

            if (cancelled) return;

            setPriceHistory({
              labels,
              datasets: [
                {
                  label: chartLabel,
                  data: dataPoints,
                  borderColor: chartColors.primary,
                  backgroundColor: chartColorsWithOpacity.primary.light,
                  pointBackgroundColor: chartColors.primary,
                  pointBorderColor: chartColors.surfacePrimary,
                  pointHoverBackgroundColor: chartColors.surfacePrimary,
                  pointHoverBorderColor: chartColors.primary,
                  tension: 0.3,
                  fill: true,
                  spanGaps: true,
                },
              ],
            });
          }
        } else {
          if (cancelled) return;
          setPriceHistory(null);
        }

      } catch (err: unknown) {
        if (cancelled) return;
        const errorMessage = err instanceof Error ? err.message : 'Failed to load price history.';
        setError(errorMessage);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [product, cacheKey, fetchCategoryStats, isChartVisible]);

  return { priceHistory, isLoading, error };
};
