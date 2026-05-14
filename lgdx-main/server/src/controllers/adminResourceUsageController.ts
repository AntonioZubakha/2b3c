import type { Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';

type PromQueryResult = {
  status: 'success' | 'error';
  data?: { resultType: string; result: Array<{ metric: Record<string, string>; value: [number, string] }> };
  error?: string;
};

const PROM_URL = process.env['PROMETHEUS_URL'] || 'http://prometheus:9090';

/** cAdvisor + Swarm often omit swarm labels on some hosts; widen window so rate() is stable. */
const RATE_WINDOW = '3m';

function parseVector(result: PromQueryResult): Array<{ metric: Record<string, string>; value: number }> {
  const rows = result.data?.result ?? [];
  return rows.map((r) => ({ metric: r.metric, value: Number(r.value?.[1] ?? '0') }));
}

function extractContainerIdFromCgroupId(rawId: string | undefined): string | null {
  if (!rawId) return null;
  // /docker/<id>
  const m1 = rawId.match(/^\/docker\/([a-f0-9]{12,})$/i);
  if (m1) return m1[1];
  // /system.slice/docker-<id>.scope
  const m2 = rawId.match(/^\/system\.slice\/docker-([a-f0-9]{12,})\.scope$/i);
  if (m2) return m2[1];
  return null;
}

async function promQuery(query: string): Promise<PromQueryResult> {
  const url = `${PROM_URL}/api/v1/query`;
  const res = await axios.get(url, {
    params: { query },
    timeout: 8000,
    // Prometheus returns 4xx with a useful JSON body; don't throw away the details.
    validateStatus: () => true,
  });

  const data = res.data as PromQueryResult;
  if (res.status >= 200 && res.status < 300) return data;

  const promErr = typeof data?.error === 'string' ? data.error : undefined;
  return {
    status: 'error',
    error: promErr ? `Prometheus HTTP ${res.status}: ${promErr}` : `Prometheus HTTP ${res.status}`,
  };
}

function mergeCpuMemByLabel(
  cpuRows: Array<{ metric: Record<string, string>; value: number }>,
  memRows: Array<{ metric: Record<string, string>; value: number }>,
  groupLabel: string,
  displayKey: (raw: string) => string,
): Map<string, { cpuCores: number | null; memBytes: number | null }> {
  const m = new Map<string, { cpuCores: number | null; memBytes: number | null }>();
  for (const r of cpuRows) {
    const raw = r.metric[groupLabel];
    if (!raw) continue;
    const key = displayKey(raw);
    const cur = m.get(key) ?? { cpuCores: null, memBytes: null };
    m.set(key, { ...cur, cpuCores: r.value });
  }
  for (const r of memRows) {
    const raw = r.metric[groupLabel];
    if (!raw) continue;
    const key = displayKey(raw);
    const cur = m.get(key) ?? { cpuCores: null, memBytes: null };
    m.set(key, { ...cur, memBytes: r.value });
  }
  return m;
}

/** Human-readable row id when grouping by cAdvisor `name` (cgroup path). */
function prettyCgroupName(raw: string): string {
  if (raw.startsWith('/docker/')) return raw.slice('/docker/'.length);
  const m = raw.match(/^\/system\.slice\/docker-(.+)\.scope$/);
  if (m) return m[1];
  return raw;
}

function buildQueriesForLabel(groupLabel: string): { cpuQ: string; memQ: string } {
  const sel = `${groupLabel}!="",id!="/"`;
  return {
    // Some cAdvisor setups expose CPU with `cpu="total"`, others expose only percpu (or omit the label).
    // Sum over cpu label implicitly by not filtering on it here.
    cpuQ: `sum by (${groupLabel}) (rate(container_cpu_usage_seconds_total{${sel}}[${RATE_WINDOW}]))`,
    memQ: `sum by (${groupLabel}) (container_memory_working_set_bytes{${sel}})`,
  };
}

/**
 * Fallbacks when Swarm/Compose labels aren't present.
 *
 * On Docker Desktop / containerd-backed engines, cAdvisor still exports per-container metrics with:
 * - `id` like `/docker/<containerId>`
 * - `name` often equal to `<containerId>` (not a cgroup path)
 *
 * Prefer grouping by `name` when present; otherwise group by `id`.
 */
// Docker engines can expose container cgroups either as /docker/<id> or as systemd scopes.
const CONTAINER_ID_RE = '/docker/.+|/system.slice/docker-.+[.]scope';

const DOCKER_IMAGE_CPU_FALLBACK = `sum by (image) (rate(container_cpu_usage_seconds_total{id=~"${CONTAINER_ID_RE}",image!=""}[${RATE_WINDOW}]))`;
const DOCKER_IMAGE_MEM_FALLBACK = `sum by (image) (container_memory_working_set_bytes{id=~"${CONTAINER_ID_RE}",image!=""})`;

const DOCKER_ID_CPU = `sum by (id) (rate(container_cpu_usage_seconds_total{id=~"${CONTAINER_ID_RE}",id!="/"}[${RATE_WINDOW}]))`;
const DOCKER_ID_MEM = `sum by (id) (container_memory_working_set_bytes{id=~"${CONTAINER_ID_RE}",id!="/"})`;
const DOCKER_ID_IMAGE_MAP = `max by (id,image) (container_last_seen{id=~"${CONTAINER_ID_RE}",image!=""})`;

const DOCKER_NAME_CPU_FALLBACK = `sum by (name) (rate(container_cpu_usage_seconds_total{id=~"${CONTAINER_ID_RE}",name!=""}[${RATE_WINDOW}]))`;
const DOCKER_NAME_MEM_FALLBACK = `sum by (name) (container_memory_working_set_bytes{id=~"${CONTAINER_ID_RE}",name!=""})`;

const DOCKER_ID_CPU_FALLBACK = `sum by (id) (rate(container_cpu_usage_seconds_total{id=~"${CONTAINER_ID_RE}",id!="/"}[${RATE_WINDOW}]))`;
const DOCKER_ID_MEM_FALLBACK = `sum by (id) (container_memory_working_set_bytes{id=~"${CONTAINER_ID_RE}",id!="/"})`;

// Legacy: some hosts expose `name` as a cgroup path (including systemd slice).
const CGROUP_NAME_CPU_FALLBACK = `sum by (name) (rate(container_cpu_usage_seconds_total{name=~"/docker/.+|/system.slice/docker-.+[.]scope",id!="/"}[${RATE_WINDOW}]))`;
const CGROUP_NAME_MEM_FALLBACK = `sum by (name) (container_memory_working_set_bytes{name=~"/docker/.+|/system.slice/docker-.+[.]scope",id!="/"})`;

export interface ServiceResourceRow {
  service: string;
  cpuCores: number | null;
  memBytes: number | null;
}

export interface ResourceUsageSnapshot {
  asOf: string;
  prometheusUrl: string;
  ok: boolean;
  error?: string;
  totals: { cpuCores: number | null; memBytes: number | null };
  services: ServiceResourceRow[];
}

/**
 * GET /api/admin/monitoring/resource-usage
 *
 * Uses cAdvisor metrics to compute per-service CPU and memory.
 * Tries Swarm labels first, then Compose, then cgroup `name` (Prometheus + cAdvisor scrape required).
 */
export async function getResourceUsageSnapshot(_req: Request, res: Response): Promise<void> {
  const asOf = new Date().toISOString();

  try {
    const strategies: Array<{ groupLabel: string; display: (raw: string) => string }> = [
      { groupLabel: 'container_label_com_docker_swarm_service_name', display: (s) => s },
      { groupLabel: 'container_label_com_docker_compose_service', display: (s) => s },
    ];

    let merged: Map<string, { cpuCores: number | null; memBytes: number | null }> | null = null;

    for (const { groupLabel, display } of strategies) {
      const { cpuQ, memQ } = buildQueriesForLabel(groupLabel);
      const [cpuR, memR] = await Promise.all([promQuery(cpuQ), promQuery(memQ)]);
      if (cpuR.status !== 'success' || memR.status !== 'success') {
        const err = cpuR.error || memR.error || 'Prometheus query failed';
        res.json({
          asOf,
          prometheusUrl: PROM_URL,
          ok: false,
          error: err,
          totals: { cpuCores: null, memBytes: null },
          services: [],
        } satisfies ResourceUsageSnapshot);
        return;
      }
      const trial = mergeCpuMemByLabel(parseVector(cpuR), parseVector(memR), groupLabel, display);
      if (trial.size > 0) {
        merged = trial;
        break;
      }
    }

    if (!merged || merged.size === 0) {
      // 0) If we have per-container image labels, group by image for a human-friendly view.
      {
        const [cpuR, memR] = await Promise.all([promQuery(DOCKER_IMAGE_CPU_FALLBACK), promQuery(DOCKER_IMAGE_MEM_FALLBACK)]);
        if (cpuR.status !== 'success' || memR.status !== 'success') {
          const err = cpuR.error || memR.error || 'Prometheus query failed';
          res.json({
            asOf,
            prometheusUrl: PROM_URL,
            ok: false,
            error: err,
            totals: { cpuCores: null, memBytes: null },
            services: [],
          } satisfies ResourceUsageSnapshot);
          return;
        }
        const trial = mergeCpuMemByLabel(parseVector(cpuR), parseVector(memR), 'image', (s) => s);
        if (trial.size > 0) merged = trial;
      }
    }

    if (!merged || merged.size === 0) {
      // 0.5) If memory lacks `image` label, aggregate by id then re-aggregate by image using container_last_seen mapping.
      const [cpuR, memR, mapR] = await Promise.all([promQuery(DOCKER_ID_CPU), promQuery(DOCKER_ID_MEM), promQuery(DOCKER_ID_IMAGE_MAP)]);
      if (cpuR.status !== 'success' || memR.status !== 'success' || mapR.status !== 'success') {
        const err = cpuR.error || memR.error || mapR.error || 'Prometheus query failed';
        res.json({
          asOf,
          prometheusUrl: PROM_URL,
          ok: false,
          error: err,
          totals: { cpuCores: null, memBytes: null },
          services: [],
        } satisfies ResourceUsageSnapshot);
        return;
      }

      const cpuById = new Map<string, number>();
      for (const r of parseVector(cpuR)) {
        const cid = extractContainerIdFromCgroupId(r.metric.id);
        if (cid) cpuById.set(cid, r.value);
      }
      const memById = new Map<string, number>();
      for (const r of parseVector(memR)) {
        const cid = extractContainerIdFromCgroupId(r.metric.id);
        if (cid) memById.set(cid, r.value);
      }
      const imageById = new Map<string, string>();
      for (const r of parseVector(mapR)) {
        const id = extractContainerIdFromCgroupId(r.metric.id);
        const image = r.metric.image;
        if (id && image) imageById.set(id, image);
      }

      const agg = new Map<string, { cpuCores: number | null; memBytes: number | null }>();
      const ids = new Set<string>([...cpuById.keys(), ...memById.keys()]);
      for (const id of ids) {
        const image = imageById.get(id);
        if (!image) continue;
        const cur = agg.get(image) ?? { cpuCores: 0, memBytes: 0 };
        const cpu = cpuById.get(id);
        const mem = memById.get(id);
        agg.set(image, {
          cpuCores: (cur.cpuCores ?? 0) + (cpu ?? 0),
          memBytes: (cur.memBytes ?? 0) + (mem ?? 0),
        });
      }

      if (agg.size > 0) merged = agg;
    }

    if (!merged || merged.size === 0) {
      // 1) Docker Desktop style: name = containerId; id = /docker/<containerId>
      {
        const [cpuR, memR] = await Promise.all([promQuery(DOCKER_NAME_CPU_FALLBACK), promQuery(DOCKER_NAME_MEM_FALLBACK)]);
        if (cpuR.status !== 'success' || memR.status !== 'success') {
          const err = cpuR.error || memR.error || 'Prometheus query failed';
          res.json({
            asOf,
            prometheusUrl: PROM_URL,
            ok: false,
            error: err,
            totals: { cpuCores: null, memBytes: null },
            services: [],
          } satisfies ResourceUsageSnapshot);
          return;
        }
        const trial = mergeCpuMemByLabel(parseVector(cpuR), parseVector(memR), 'name', (s) => s);
        if (trial.size > 0) merged = trial;
      }
    }

    if (!merged || merged.size === 0) {
      // 2) Legacy: name is a cgroup path (including systemd slices)
      {
        const [cpuR, memR] = await Promise.all([promQuery(CGROUP_NAME_CPU_FALLBACK), promQuery(CGROUP_NAME_MEM_FALLBACK)]);
        if (cpuR.status !== 'success' || memR.status !== 'success') {
          const err = cpuR.error || memR.error || 'Prometheus query failed';
          res.json({
            asOf,
            prometheusUrl: PROM_URL,
            ok: false,
            error: err,
            totals: { cpuCores: null, memBytes: null },
            services: [],
          } satisfies ResourceUsageSnapshot);
          return;
        }
        const trial = mergeCpuMemByLabel(parseVector(cpuR), parseVector(memR), 'name', prettyCgroupName);
        if (trial.size > 0) merged = trial;
      }
    }

    if (!merged || merged.size === 0) {
      // 3) Last resort: group by id
      const [cpuR, memR] = await Promise.all([promQuery(DOCKER_ID_CPU_FALLBACK), promQuery(DOCKER_ID_MEM_FALLBACK)]);
      if (cpuR.status !== 'success' || memR.status !== 'success') {
        const err = cpuR.error || memR.error || 'Prometheus query failed';
        res.json({
          asOf,
          prometheusUrl: PROM_URL,
          ok: false,
          error: err,
          totals: { cpuCores: null, memBytes: null },
          services: [],
        } satisfies ResourceUsageSnapshot);
        return;
      }
      merged = mergeCpuMemByLabel(parseVector(cpuR), parseVector(memR), 'id', prettyCgroupName);
    }

    const services = Array.from(merged.entries())
      .map(([service, v]) => ({ service, ...v }))
      .sort((a, b) => a.service.localeCompare(b.service));

    const totalCpu = services.reduce((acc, r) => acc + (r.cpuCores ?? 0), 0);
    const totalMem = services.reduce((acc, r) => acc + (r.memBytes ?? 0), 0);

    res.json({
      asOf,
      prometheusUrl: PROM_URL,
      ok: true,
      totals: { cpuCores: totalCpu, memBytes: totalMem },
      services,
    } satisfies ResourceUsageSnapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('[adminResourceUsage] Failed to fetch resource usage', { error: msg });
    res.json({
      asOf,
      prometheusUrl: PROM_URL,
      ok: false,
      error: msg,
      totals: { cpuCores: null, memBytes: null },
      services: [],
    } satisfies ResourceUsageSnapshot);
  }
}
