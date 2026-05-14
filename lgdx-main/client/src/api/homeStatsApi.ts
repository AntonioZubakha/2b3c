import api from './index';

export interface HomeStats {
  stonesCount: number;
}

/**
 * Fetches homepage stats (stones count rounded to 10k). Public endpoint.
 */
export async function getHomeStats(): Promise<HomeStats> {
  const { data } = await api.get<HomeStats>('/marketplace/home-stats');
  return data;
}

/**
 * Format stones count for display: 250000 -> "250K+", 120000 -> "120K+"
 */
export function formatStonesCount(count: number): string {
  if (count >= 1000) {
    return `${Math.round(count / 1000)}K+`;
  }
  return `${count}+`;
}
