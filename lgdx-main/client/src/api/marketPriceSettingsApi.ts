import api from './index';

export interface MarketPriceSettingsResponse {
  coeffInr: number;
  coeffGold: number;
  coeffOil: number;
  weightPriceDecreased: number;
  weightPriceIncreased: number;
  weightNewProducts: number;
  weightDisappeared: number;
  weightUnchanged: number;
  medianSmallKeepPct: number;
  medianMediumKeepPct: number;
  medianLargeExpensiveExcludePct: number;
  medianLargeCheapExcludePct: number;
  medianVeryLargeExpensiveExcludePct: number;
  medianVeryLargeCheapExcludePct: number;
  updatedBy?: { _id: string; firstName: string; lastName: string; email: string };
  updatedAt: string;
  reason: string;
  createdAt: string;
}

export interface UpdateMarketPriceSettingsRequest {
  coeffInr?: number;
  coeffGold?: number;
  coeffOil?: number;
  weightPriceDecreased?: number;
  weightPriceIncreased?: number;
  weightNewProducts?: number;
  weightDisappeared?: number;
  weightUnchanged?: number;
  medianSmallKeepPct?: number;
  medianMediumKeepPct?: number;
  medianLargeExpensiveExcludePct?: number;
  medianLargeCheapExcludePct?: number;
  medianVeryLargeExpensiveExcludePct?: number;
  medianVeryLargeCheapExcludePct?: number;
  reason: string;
}

export const getMarketPriceSettings = () =>
  api.get<MarketPriceSettingsResponse>('/admin/market-price-settings').then(({ data }) => data);

export const updateMarketPriceSettings = (data: UpdateMarketPriceSettingsRequest) =>
  api.put<MarketPriceSettingsResponse>('/admin/market-price-settings', data).then(({ data }) => data);
