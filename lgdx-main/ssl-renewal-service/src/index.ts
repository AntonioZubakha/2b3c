import * as cron from 'node-cron';
import { logger } from './logger';
import { SSLRenewalService } from './sslRenewalService';
import { createHealthCheckServer, setRenewalServiceInstance } from './healthCheck';
import { metricsCollector } from './metrics';

const RENEWAL_SCHEDULE = process.env.RENEWAL_SCHEDULE || '30 1 * * 1'; // Default: Monday 01:30 UTC
const DOMAIN = process.env.DOMAIN || 'lgdeal.com';
const CERT_NAME = process.env.CERT_NAME || DOMAIN;
const ACME_WEBROOT = process.env.ACME_WEBROOT || '/var/www/certbot';
const CERTBOT_DOMAINS = process.env.CERTBOT_DOMAINS
  ? process.env.CERTBOT_DOMAINS.split(',').map((s) => s.trim()).filter(Boolean)
  : [DOMAIN, `www.${DOMAIN}`];
const STACK_NAME = process.env.STACK_NAME || 'lgdx';
const NGINX_SERVICE_NAME = process.env.NGINX_SERVICE_NAME || 'lgdx_nginx';
const CERT_PATH = process.env.CERT_PATH || '/etc/letsencrypt/live/lgdeal.com';
const BACKUP_DIR = process.env.BACKUP_DIR || '/app/ssl-backups';
const LOG_FILE = process.env.LOG_FILE || '/app/logs/ssl-renewal.log';
const HEARTBEAT_INTERVAL_SEC = Math.max(60, parseInt(process.env.HEARTBEAT_INTERVAL_SEC || '900', 10));

async function main() {
  logger.info('🚀 SSL Renewal Service starting...');
  logger.info(`📅 Schedule: ${RENEWAL_SCHEDULE}`);
  logger.info(`🌐 Domain: ${DOMAIN}`);
  logger.info(`🔐 Cert name: ${CERT_NAME}, ACME webroot: ${ACME_WEBROOT}`);
  logger.info(`🌐 SANs: ${CERTBOT_DOMAINS.join(', ')}`);
  logger.info(`📦 Stack: ${STACK_NAME}`);
  logger.info(`🔧 Nginx Service: ${NGINX_SERVICE_NAME}`);

  // Start health check server
  createHealthCheckServer();

  // Create SSL renewal service
  const renewalService = new SSLRenewalService({
    domain: DOMAIN,
    certName: CERT_NAME,
    certDomains: CERTBOT_DOMAINS,
    webrootPath: ACME_WEBROOT,
    stackName: STACK_NAME,
    nginxServiceName: NGINX_SERVICE_NAME,
    certPath: CERT_PATH,
    backupDir: BACKUP_DIR,
    logFile: LOG_FILE
  });

  // Make service instance available to health check server
  setRenewalServiceInstance(renewalService);

  // Initialize service
  await renewalService.initialize();

  // Populate ssl_certificate_expiry_days immediately (not only on scheduled renewal)
  await renewalService.refreshCertificateExpiryMetric();

  let heartbeatInFlight = false;
  const heartbeatTimer = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = true;
    void (async () => {
      try {
        await renewalService.refreshCertificateExpiryMetric();
        const metrics = metricsCollector.getMetrics();
        logger.info('💓 SSL renewal heartbeat', {
          domain: DOMAIN,
          certName: CERT_NAME,
          certExpiryDays: metrics.certificateExpiryDays,
          lastRenewalStatus: metrics.lastRenewalStatus,
          totalRenewals: metrics.totalRenewals,
          failedRenewals: metrics.failedRenewals,
          lastRenewalTimestamp: metrics.lastRenewalTimestamp
            ? new Date(metrics.lastRenewalTimestamp).toISOString()
            : null
        });
      } catch (error) {
        logger.warn('⚠️ SSL renewal heartbeat failed', { error });
      } finally {
        heartbeatInFlight = false;
      }
    })();
  }, HEARTBEAT_INTERVAL_SEC * 1000);

  // Do not keep process alive only because of heartbeat timer.
  heartbeatTimer.unref();
  logger.info(`💓 Heartbeat enabled every ${HEARTBEAT_INTERVAL_SEC}s`);

  // Schedule renewal task
  const job = cron.schedule(RENEWAL_SCHEDULE, async () => {
    logger.info(`⏰ SSL renewal task triggered at ${new Date().toISOString()}`);
    try {
      await renewalService.renewCertificate();
    } catch (error) {
      logger.error('❌ SSL renewal task failed', { error });
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  if (job) {
    logger.info('✅ SSL renewal scheduler initialized successfully');
    logger.info(`📅 Renewal schedule: ${RENEWAL_SCHEDULE} (Monday 01:30 UTC - before other tasks)`);
  } else {
    logger.error('❌ Failed to create schedule job - invalid cron pattern?');
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('🛑 SIGTERM received, shutting down gracefully...');
    job.stop();
    clearInterval(heartbeatTimer);
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('🛑 SIGINT received, shutting down gracefully...');
    job.stop();
    clearInterval(heartbeatTimer);
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error('❌ Fatal error in SSL renewal service', { error });
  process.exit(1);
});

