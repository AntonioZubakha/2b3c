import axios, { AxiosInstance } from 'axios';
import { logger } from './logger';

// Simple in-process concurrency/circuit control per host
const concurrencyByHost = new Map<string, { active: number; failures: number; openedAt?: number }>();
const MAX_CONCURRENCY = Number(process.env.API_MAX_CONCURRENCY || 5);
const CB_FAILURE_THRESHOLD = Number(process.env.API_CB_FAILURES || 5); // open after 5 consecutive failures
const CB_COOLDOWN_MS = Number(process.env.API_CB_COOLDOWN_MS || 60_000); // 60s cooldown

// Centralized HTTP client for external supplier APIs
// Security defaults:
// - Hard timeouts to avoid hanging connections
// - No redirects to prevent redirect-based SSRF
// - Limited max content length (defensive)
// - Optional proxy disabled by default

const configuredMb = Number(process.env.API_MAX_CONTENT_LENGTH_MB || NaN);
// Default ceiling higher to accommodate large supplier payloads; can be overridden via env.
const fallbackMb = 600;
const maxMb = Number.isFinite(configuredMb) ? configuredMb : fallbackMb;
// Support disabling cap by setting env to 0 or negative -> effectively unlimited
const bytesCap = maxMb <= 0 ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.floor(maxMb)) * 1024 * 1024;
const httpClient: AxiosInstance = axios.create({
  timeout: 600000, // Увеличиваем таймаут до 10 минут для очень больших API ответов
  maxRedirects: 0,
  maxContentLength: bytesCap,
  maxBodyLength: bytesCap,
});

httpClient.interceptors.request.use(async (config) => {
  try {
    if (config?.url) {
      const url = new URL(config.url, config.baseURL);
      const host = url.host;
      const entry = concurrencyByHost.get(host) || { active: 0, failures: 0 };
      // Circuit breaker check
      if (entry.openedAt && Date.now() - (entry.openedAt || 0) < CB_COOLDOWN_MS) {
        return Promise.reject(new Error(`[httpClient] Circuit open for host ${host}`));
      }
      // Concurrency gate
      if (entry.active >= MAX_CONCURRENCY) {
        return Promise.reject(new Error(`[httpClient] Concurrency limit reached for host ${host}`));
      }
      entry.active += 1;
      concurrencyByHost.set(host, entry);
      (config as unknown as Record<string, unknown>)['__host'] = host;
    }
  } catch (e) {
    logger.debug('[httpClient] Request guard failed (invalid URL or config)', {
      error: e instanceof Error ? e.message : String(e),
      url: config?.url,
    });
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
  return config;
});

const finalize = (config?: Record<string, unknown>, success?: boolean) => {
  try {
    const host = config?.['__host'];
    if (!host || typeof host !== 'string') return;
    const entry = concurrencyByHost.get(host);
    if (!entry) return;
    entry.active = Math.max(0, entry.active - 1);
    if (success) {
      entry.failures = 0;
      entry.openedAt = undefined;
    } else {
      entry.failures += 1;
      if (entry.failures >= CB_FAILURE_THRESHOLD) {
        entry.openedAt = Date.now();
      }
    }
    concurrencyByHost.set(host, entry);
  } catch {}
};

httpClient.interceptors.response.use((res) => {
  finalize(res?.config as unknown as Record<string, unknown>, true);
  return res;
}, (error: unknown) => {
  if (error && typeof error === 'object' && 'config' in error) {
    finalize((error as { config?: unknown }).config as Record<string, unknown>, false);
  }
  return Promise.reject(error);
});

export default httpClient;
