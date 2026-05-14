/**
 * Types for custom hooks
 */

import { ChartData } from 'chart.js';

// Price history hook result
export interface UsePriceHistoryResult {
  priceHistory: ChartData<'line'> | null;
  isLoading: boolean;
  error: string | null;
}

// Chart visibility hook result
export interface UseChartVisibilityResult {
  isChartVisible: boolean;
  chartRef: React.RefObject<HTMLDivElement | null>;
}
