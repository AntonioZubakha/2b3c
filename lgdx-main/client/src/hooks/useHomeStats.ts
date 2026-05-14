import { useState, useEffect } from 'react';
import { getHomeStats, formatStonesCount } from '../api/homeStatsApi';

const CACHE_MS = 5 * 60 * 1000; // 5 minutes
let cached: { stonesFormatted: string; fetchedAt: number } | null = null;

export function useHomeStats(): { stonesFormatted: string; loading: boolean } {
  const [stonesFormatted, setStonesFormatted] = useState<string>(cached?.stonesFormatted ?? '250K+');
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
      setStonesFormatted(cached.stonesFormatted);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getHomeStats()
      .then((res) => {
        if (cancelled) return;
        const formatted = formatStonesCount(res.stonesCount);
        setStonesFormatted(formatted);
        cached = { stonesFormatted: formatted, fetchedAt: Date.now() };
      })
      .catch(() => {
        if (!cancelled) setStonesFormatted('250K+');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { stonesFormatted, loading };
}
