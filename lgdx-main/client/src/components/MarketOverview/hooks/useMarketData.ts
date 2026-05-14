import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useTranslation } from '../../../i18n';
import analyticsApi from '../../../api/analyticsApi';
import { MarketData, DemandData, DemandPeriod } from '../types';

interface UseMarketDataReturn {
  loading: boolean;
  error: string | null;
  marketData: MarketData | null;
  demandData: DemandData | null;
  demandPeriod: DemandPeriod;
  demandDataCache: Record<DemandPeriod, DemandData | undefined>;
  lastRefresh: Date;
  fetchAllData: () => Promise<void>;
  fetchDemandData: (period: DemandPeriod) => Promise<void>;
  setDemandPeriod: (period: DemandPeriod) => void;
  setDemandData: (data: DemandData | null) => void;
  handleRecalculateMarketOverview: (onNotification?: (title: string, message: string) => void) => Promise<void>;
}

export const useMarketData = (): UseMarketDataReturn => {
  const { t } = useTranslation();
  const { isLgdealSupervisor } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [demandData, setDemandData] = useState<DemandData | null>(null);
  const [demandPeriod, setDemandPeriod] = useState<DemandPeriod>('week');
  const [demandDataCache, setDemandDataCache] = useState<Record<DemandPeriod, DemandData | undefined>>({
    day: undefined,
    week: undefined,
    month: undefined
  });
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load data for the current demand period, not always 'day'
      const response = await analyticsApi.get(`/${demandPeriod}`);
      const data = response.data?.data;

      if (data) {
        setMarketData({
          totalProducts: data.marketOverview?.totalProducts || 0,
          shapeStats: data.marketOverview?.shapeStats || [],
          weightStats: data.marketOverview?.weightStats || [],
          newArrivals: data.priceTrends?.newArrivals,
          priceSegments: data.marketOverview?.priceSegments,
          priceDynamics: data.priceTrends?.priceDynamics
        });

        if (data.demandAnalysis) {
          setDemandData(data.demandAnalysis);
          setDemandDataCache(prev => ({ ...prev, [demandPeriod]: data.demandAnalysis }));
        }

        setLastRefresh(new Date());
      } else {
        throw new Error('No data received from analytics service');
      }
    } catch (err) {
      setError(t('categoryStats.failedToLoadData'));
    } finally {
      setLoading(false);
    }
  }, [demandPeriod, t]);


  const fetchDemandData = useCallback(async (period: DemandPeriod = demandPeriod) => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first
      const cachedData = demandDataCache[period];
      if (cachedData) {
        setDemandData(cachedData);
        setLoading(false);
        return;
      }

      // If no cached data, fetch from API
      const response = await analyticsApi.get(`/${period}`);
      const data = response.data?.data?.demandAnalysis;

      if (data) {
        setDemandData(data);
        setDemandDataCache(prev => ({ ...prev, [period]: data }));
      } else {
        throw new Error('No demand data received from analytics service');
      }
    } catch (err) {
      setError(t('categoryStats.failedToLoadData'));
    } finally {
      setLoading(false);
    }
  }, [demandPeriod, demandDataCache, t]);

  const handleRecalculateMarketOverview = async (onNotification?: (title: string, message: string) => void) => {
    if (!isLgdealSupervisor) return;

    try {
      setLoading(true);
      setError(null);

      const response = await analyticsApi.post('/recalculate');

      if (response.data.success) {
        await fetchAllData();
        setLastRefresh(new Date());

        const { results, duration, message } = response.data;
        const successCount = results.filter((r: { success: boolean }) => r.success).length;
        const resultMessage = results.map((r: { period: string; success: boolean; message: string }) =>
          `${r.period}: ${r.success ? '✅' : '❌'} ${r.message}`
        ).join('\n');

        const notificationMessage = t('admin.marketRecalculationComplete', { 
          message, 
          duration, 
          results: resultMessage, 
          success: successCount, 
          total: results.length 
        });

        if (onNotification) {
          onNotification(t('admin.marketRecalculationTitle'), notificationMessage);
        } else {
          alert(notificationMessage); // Fallback if no callback provided
        }
      } else {
        throw new Error(response.data.message || 'Failed to recalculate market overview');
      }
    } catch (err: unknown) {
      const errorMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || (err as Error)?.message || 'Failed to recalculate market overview';
      setError(errorMessage);
      const errorNotificationMessage = t('admin.marketRecalculationError', { error: errorMessage });
      
      if (onNotification) {
        onNotification(t('common.error'), errorNotificationMessage);
      } else {
        alert(errorNotificationMessage); // Fallback if no callback provided
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Automatically fetch demand data when period changes
  useEffect(() => {
    if (demandPeriod) {
      fetchDemandData(demandPeriod);
    }
  }, [demandPeriod, fetchDemandData]);

  return {
    loading,
    error,
    marketData,
    demandData,
    demandPeriod,
    demandDataCache,
    lastRefresh,
    fetchAllData,
    fetchDemandData,
    setDemandPeriod,
    setDemandData,
    handleRecalculateMarketOverview
  };
};
