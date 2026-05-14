import type { Request, Response } from 'express';
import { initializeRedisClient, getRedisClient } from '../config/redis';
import { getServiceCoordinator } from '../utils/serviceCoordinator';
import type { ServiceName, ServiceStatus } from '../types/serviceCoordination';
import { logger } from '../utils/logger';

const GLOBAL_SYNC_LOCK_KEY = process.env.GLOBAL_SYNC_LOCK_KEY || 'sync:lock:global';

interface ParsedGlobalLockOwner {
  jobKind: string;
  companyId?: string;
  detail: string;
}

/** Best-effort parse of lock value tokens set by microservices (prefix–companyId–timestamp). */
function parseGlobalLockOwner(ownerToken: string): ParsedGlobalLockOwner {
  const extractIdBeforeTimestamp = (prefix: string): { companyId?: string; rest: string } => {
    const rest = ownerToken.slice(prefix.length);
    const lastDash = rest.lastIndexOf('-');
    if (lastDash <= 0) return { rest };
    const maybeId = rest.slice(0, lastDash);
    const tail = rest.slice(lastDash + 1);
    if (/^[a-f0-9]{24}$/i.test(maybeId) && /^\d+$/.test(tail)) {
      return { companyId: maybeId, rest: `${maybeId} (${tail})` };
    }
    return { rest };
  };

  if (ownerToken.startsWith('api-sync-global-')) {
    const { companyId, rest } = extractIdBeforeTimestamp('api-sync-global-');
    return {
      jobKind: 'api_product_sync',
      companyId,
      detail: `API product sync — ${rest}`,
    };
  }
  if (ownerToken.startsWith('file-sync-global-')) {
    const { companyId, rest } = extractIdBeforeTimestamp('file-sync-global-');
    return {
      jobKind: 'file_import',
      companyId,
      detail: `File import — ${rest}`,
    };
  }
  if (ownerToken.startsWith('analytics-')) {
    return { jobKind: 'analytics', detail: `Analytics — ${ownerToken}` };
  }
  if (ownerToken.startsWith('market-price-')) {
    return { jobKind: 'market_price', detail: `Market price calculator — ${ownerToken}` };
  }
  if (ownerToken.startsWith('legacy-ftp-poller-single-')) {
    const { companyId, rest } = extractIdBeforeTimestamp('legacy-ftp-poller-single-');
    return {
      jobKind: 'legacy_ftp_poll',
      companyId,
      detail: `Legacy FTP poll (company) — ${rest}`,
    };
  }
  if (ownerToken.startsWith('legacy-ftp-poller-')) {
    return { jobKind: 'legacy_ftp_poll', detail: `Legacy FTP poll (batch) — ${ownerToken}` };
  }

  return { jobKind: 'unknown', detail: ownerToken };
}

function normalizeStatus(raw: ServiceStatus | null): ServiceStatus | null {
  if (!raw) return null;
  return {
    ...raw,
    startedAt: raw.startedAt ? new Date(raw.startedAt) : undefined,
    completedAt: raw.completedAt ? new Date(raw.completedAt) : undefined,
  };
}

/**
 * GET /api/admin/background-jobs/overview
 * Snapshot: global exclusive-job lock + last known coordinator statuses in Redis.
 */
export async function getBackgroundJobsOverview(_req: Request, res: Response): Promise<void> {
  const asOf = new Date().toISOString();

  let redisAvailable = false;
  let ownerToken: string | null = null;
  let ttlSeconds: number | undefined;

  try {
    await initializeRedisClient();
    const redis = getRedisClient();
    redisAvailable = true;
    ownerToken = await redis.get(GLOBAL_SYNC_LOCK_KEY);
    if (ownerToken) {
      const ttl = await redis.ttl(GLOBAL_SYNC_LOCK_KEY);
      ttlSeconds = ttl > 0 ? ttl : undefined;
    }
  } catch (err) {
    logger.warn('[adminBackgroundJobs] Redis unavailable', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const coordinatedServices: { service: ServiceName; status: ServiceStatus | null }[] = [];

  if (redisAvailable) {
    try {
      const coordinator = getServiceCoordinator();
      const all = await coordinator.getAllStatuses();
      const order: ServiceName[] = [
        'market-price-calculator',
        'api-sync',
        'file-import',
        'ftp-sync',
        'analytics',
        'backup',
      ];
      for (const service of order) {
        coordinatedServices.push({
          service,
          status: normalizeStatus(all[service] ?? null),
        });
      }
    } catch (err) {
      logger.warn('[adminBackgroundJobs] Coordinator read failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const parsed = ownerToken ? parseGlobalLockOwner(ownerToken) : undefined;

  res.json({
    asOf,
    redisAvailable,
    globalLock: {
      key: GLOBAL_SYNC_LOCK_KEY,
      busy: Boolean(ownerToken),
      ownerToken: ownerToken ?? undefined,
      ttlSeconds,
      parsed,
    },
    coordinatedServices,
  });
}
