import api from './index';

export interface TriggerCalculationResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface PriceHistoryParams {
  shape: string;
  weight: string;
  clarity: string;
  color: string;
  days: number;
}

export interface PriceHistoryDataPoint {
  date: string;
  price: number;
  marketPricePerCarat?: number;
}

interface CategoryStat {
  _id: string;
  date: string;
  shape: string;
  weight: string;
  clarity: string;
  color: string;
  count: number;
  marketPricePerCarat?: number;
  avgPricePerCarat?: number;
  medianPricePerCarat?: number;
  goldPrice?: number;
  oilPrice?: number;
  inrUsdRate?: number;
}

interface CategoryStatsResponse {
  success: boolean;
  startDate?: string;
  endDate?: string;
  totalRecords?: number;
  data: CategoryStat[];
}

/**
 * Fetches the market price history for a specific product category.
 * @param params The category parameters to fetch history for.
 * @returns A promise that resolves to the raw history data.
 */
export const getPriceHistory = async (params: PriceHistoryParams): Promise<PriceHistoryDataPoint[]> => {
    try {
        // Calculate date range for the last N days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - params.days + 1);
        
        const formatDate = (date: Date): string => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // Use the category-stats endpoint with specific category filters
        const response = await api.get<CategoryStatsResponse>('/category-stats', {
            params: {
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                shape: params.shape,
                weight: params.weight,
                clarity: params.clarity,
                color: params.color
            }
        });
        
        if (response.data.success && response.data.data) {
            // Transform the data to match PriceHistoryDataPoint format
            // Use marketPricePerCarat if available, otherwise fallback to avgPricePerCarat
            return response.data.data
                .filter(stat => stat.marketPricePerCarat && stat.marketPricePerCarat > 0)
                .map(stat => ({
                    date: stat.date,
                    price: stat.marketPricePerCarat || stat.avgPricePerCarat || 0,
                    marketPricePerCarat: stat.marketPricePerCarat
                }));
        }
        return [];
    } catch (error) {
        return [];
    }
}; 

/**
 * Triggers market price calculation via main server (proxies to market-price-calculator-service). Admin only.
 */
export const triggerMarketCalculation = async (): Promise<TriggerCalculationResponse> => {
  const response = await api.post<TriggerCalculationResponse>('/admin/trigger-market-calculation');
  return response.data;
};