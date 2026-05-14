import api from './index';

export interface MarketNewsItem {
  id: string;
  _id?: string;
  title: string;
  summary: string;
  body?: string;
  imageUrl?: string;
  imageCredit?: string;
  date: string;
  category: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export const getMarketNewsList = async (): Promise<MarketNewsItem[]> => {
  const response = await api.get<MarketNewsItem[]>('/market-news');
  return response.data;
};

export const createMarketNews = async (data: Omit<MarketNewsItem, 'id' | '_id'>): Promise<MarketNewsItem> => {
  const response = await api.post<MarketNewsItem>('/market-news', data);
  return response.data;
};

export const updateMarketNews = async (id: string, data: Partial<Omit<MarketNewsItem, 'id' | '_id'>>): Promise<MarketNewsItem> => {
  const response = await api.put<MarketNewsItem>(`/market-news/${id}`, data);
  return response.data;
};

export const deleteMarketNews = async (id: string): Promise<void> => {
  await api.delete(`/market-news/${id}`);
};

/** Upload image file for market news; returns { url } to use as imageUrl */
export const uploadMarketNewsImage = async (file: File): Promise<{ url: string }> => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await api.post<{ url: string }>('/market-news/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};
