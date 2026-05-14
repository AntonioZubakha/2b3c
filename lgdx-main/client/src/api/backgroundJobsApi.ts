import api from './index';

export interface BackgroundJobsOverview {
  asOf: string;
  redisAvailable: boolean;
  globalLock: {
    key: string;
    busy: boolean;
    ownerToken?: string;
    ttlSeconds?: number;
    parsed?: { jobKind: string; companyId?: string; detail: string };
  };
  coordinatedServices: Array<{
    service: string;
    status: null | {
      serviceName: string;
      status: string;
      startedAt?: string;
      completedAt?: string;
      error?: string;
      metadata?: Record<string, unknown>;
    };
  }>;
}

export async function fetchBackgroundJobsOverview(): Promise<BackgroundJobsOverview> {
  const { data } = await api.get<BackgroundJobsOverview>('/admin/background-jobs/overview');
  return data;
}

export interface ResourceUsageSnapshot {
  asOf: string;
  prometheusUrl: string;
  ok: boolean;
  error?: string;
  totals: { cpuCores: number | null; memBytes: number | null };
  services: Array<{ service: string; cpuCores: number | null; memBytes: number | null }>;
}

export async function fetchResourceUsageSnapshot(): Promise<ResourceUsageSnapshot> {
  const { data } = await api.get<ResourceUsageSnapshot>('/admin/monitoring/resource-usage');
  return data;
}
