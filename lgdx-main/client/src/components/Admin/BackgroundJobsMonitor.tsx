import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import {
  fetchBackgroundJobsOverview,
  fetchResourceUsageSnapshot,
  type BackgroundJobsOverview,
  type ResourceUsageSnapshot,
} from '../../api/backgroundJobsApi';
import Button from '../common/Button/Button';
import styles from './BackgroundJobsMonitor.module.css';

const POLL_MS = 5000;

function formatTs(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortId(idOrName: string): string {
  // Typically a sha256-ish container id (64 hex); show a readable prefix.
  const hex = idOrName.replace(/^\/docker\//, '');
  if (/^[a-f0-9]{32,}$/i.test(hex)) return hex.slice(0, 12);
  return idOrName.length > 24 ? `${idOrName.slice(0, 24)}…` : idOrName;
}

function compactImage(image: string): string {
  // docker.io/library/foo:tag@sha256:... -> foo:tag
  const noDigest = image.split('@')[0] ?? image;
  const parts = noDigest.split('/');
  return parts[parts.length - 1] ?? noDigest;
}

function displayResourceService(raw: string): string {
  // If server groups by image, raw will look like "docker.io/library/lgdx-api-sync-service:latest"
  if (raw.includes(':') || raw.includes('/')) return compactImage(raw);
  return shortId(raw);
}

function statusBadgeClass(status: string | undefined): string {
  if (!status) return styles.badgeIdle;
  if (status === 'running') return styles.badgeRunning;
  if (status === 'completed') return styles.badgeCompleted;
  if (status === 'failed') return styles.badgeFailed;
  return styles.badgeIdle;
}

export default function BackgroundJobsMonitor(): React.ReactElement {
  const { t } = useTranslation();
  const [data, setData] = useState<BackgroundJobsOverview | null>(null);
  const [usage, setUsage] = useState<ResourceUsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [overview, u] = await Promise.all([fetchBackgroundJobsOverview(), fetchResourceUsageSnapshot()]);
      setData(overview);
      setUsage(u);
    } catch {
      setError(t('admin.backgroundJobsLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className={styles.wrap}>
      <header>
        <h2 className={styles.pageTitle}>{t('admin.backgroundJobsTitle')}</h2>
        <p className={styles.meta}>{t('admin.backgroundJobsSubtitle')}</p>
      </header>
      <div className={styles.toolbar}>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          {t('admin.backgroundJobsRefresh')}
        </Button>
        <span className={styles.meta}>
          {t('admin.backgroundJobsAutoRefresh', { seconds: POLL_MS / 1000 })}
          {data?.asOf ? ` · ${t('admin.backgroundJobsAsOf')}: ${formatTs(data.asOf)}` : null}
        </span>
      </div>

      {loading && !data ? <p className={styles.meta}>{t('common.loading')}</p> : null}
      {error ? <div className={styles.errorBox}>{error}</div> : null}

      {data && !data.redisAvailable ? (
        <div className={styles.warn}>{t('admin.backgroundJobsRedisUnavailable')}</div>
      ) : null}

      {data ? (
        <>
          {usage ? (
            <div>
              <h3 className={styles.sectionTitle}>{t('admin.backgroundJobsResourcesTitle')}</h3>
              {!usage.ok ? (
                <div className={styles.warn}>
                  {t('admin.backgroundJobsResourcesError')} {usage.error ? `(${usage.error})` : ''}
                </div>
              ) : null}
              <div className={styles.tableWrap}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th scope="col">{t('admin.backgroundJobsColService')}</th>
                      <th scope="col">{t('admin.backgroundJobsCpu')}</th>
                      <th scope="col">{t('admin.backgroundJobsMemory')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.ok && usage.services.length === 0 ? (
                      <tr>
                        <td colSpan={3} className={styles.emptyCell}>
                          {t('admin.backgroundJobsResourcesEmpty')}
                        </td>
                      </tr>
                    ) : null}
                    {usage.services.map((r) => (
                      <tr key={r.service}>
                        <td className={styles.serviceCell} title={r.service}>
                          <div className={styles.servicePrimary}>{displayResourceService(r.service)}</div>
                          <div className={styles.serviceSecondary}>{r.service}</div>
                        </td>
                        <td>{r.cpuCores != null ? r.cpuCores.toFixed(2) : '—'}</td>
                        <td>{r.memBytes != null ? `${(r.memBytes / 1024 / 1024).toFixed(0)} MiB` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className={styles.totalsRow}>
                      <th scope="row">{t('admin.backgroundJobsTotal')}</th>
                      <td>{usage.totals.cpuCores != null ? usage.totals.cpuCores.toFixed(2) : '—'}</td>
                      <td>{usage.totals.memBytes != null ? `${(usage.totals.memBytes / 1024 / 1024 / 1024).toFixed(2)} GiB` : '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className={styles.meta}>
                Prometheus: <span className={styles.mono}>{usage.prometheusUrl}</span>
              </p>
            </div>
          ) : null}

          <div>
            <h3 className={styles.sectionTitle}>{t('admin.backgroundJobsExclusiveSlot')}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>{t('admin.backgroundJobsColStatus')}</th>
                    <th>{t('admin.backgroundJobsColDetail')}</th>
                    <th>{t('admin.backgroundJobsColCompany')}</th>
                    <th>{t('admin.backgroundJobsLockTtl')}</th>
                    <th>{t('admin.backgroundJobsOwnerToken')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <span className={`${styles.badge} ${data.globalLock.busy ? styles.badgeRunning : styles.badgeIdle}`}>
                        {data.globalLock.busy ? t('admin.backgroundJobsBusy') : t('admin.backgroundJobsIdle')}
                      </span>
                    </td>
                    <td>{data.globalLock.parsed?.detail ?? '—'}</td>
                    <td className={styles.mono}>{data.globalLock.parsed?.companyId ?? '—'}</td>
                    <td>{data.globalLock.ttlSeconds != null ? `${data.globalLock.ttlSeconds}s` : '—'}</td>
                    <td className={styles.mono}>{data.globalLock.ownerToken ?? '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className={styles.sectionTitle}>{t('admin.backgroundJobsCoordinatorTitle')}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>{t('admin.backgroundJobsColService')}</th>
                    <th>{t('admin.backgroundJobsColStatus')}</th>
                    <th>{t('admin.backgroundJobsColStarted')}</th>
                    <th>{t('admin.backgroundJobsColCompleted')}</th>
                    <th>{t('admin.backgroundJobsColDetail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coordinatedServices.map((row) => {
                    const st = row.status;
                    const meta = st?.metadata && Object.keys(st.metadata).length ? JSON.stringify(st.metadata) : '—';
                    return (
                      <tr key={row.service}>
                        <td className={styles.mono}>{row.service}</td>
                        <td>
                          {st ? (
                            <span className={`${styles.badge} ${statusBadgeClass(st.status)}`}>{st.status}</span>
                          ) : (
                            <span className={`${styles.badge} ${styles.badgeIdle}`}>—</span>
                          )}
                        </td>
                        <td>{formatTs(st?.startedAt)}</td>
                        <td>{formatTs(st?.completedAt)}</td>
                        <td className={styles.mono}>
                          {st?.error ? st.error : meta}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
