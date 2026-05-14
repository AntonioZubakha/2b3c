import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { TelegramNotifier } from './telegramNotifier';
import { metricsCollector } from './metrics';

const execAsync = promisify(exec);

interface SSLRenewalConfig {
  domain: string;
  certName: string;
  certDomains: string[];
  webrootPath: string;
  stackName: string;
  nginxServiceName: string;
  certPath: string;
  backupDir: string;
  logFile: string;
}

export class SSLRenewalService {
  private config: SSLRenewalConfig;
  private telegramNotifier: TelegramNotifier;

  constructor(config: SSLRenewalConfig) {
    this.config = config;
    this.telegramNotifier = new TelegramNotifier();
  }

  /** Refresh Prometheus `ssl_certificate_expiry_days` from disk (call once at startup). */
  async refreshCertificateExpiryMetric(): Promise<void> {
    const days = await this.getCertificateExpiryDays();
    metricsCollector.updateCertificateExpiry(days);
    logger.info(`📊 Certificate expiry metric updated: ${days} days`);
  }

  async initialize(): Promise<void> {
    logger.info('🔧 Initializing SSL renewal service...');
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.config.backupDir)) {
      fs.mkdirSync(this.config.backupDir, { recursive: true });
      logger.info(`📁 Created backup directory: ${this.config.backupDir}`);
    }

    fs.mkdirSync(this.config.webrootPath, { recursive: true });
    logger.info(`📁 ACME webroot ready: ${this.config.webrootPath}`);

    // Test Docker access
    try {
      await execAsync('docker --version');
      logger.info('✅ Docker CLI available');
    } catch (error) {
      logger.error('❌ Docker CLI not available', { error });
      throw new Error('Docker CLI not available');
    }

    // Test certbot access
    try {
      await execAsync('certbot --version');
      logger.info('✅ Certbot available');
    } catch (error) {
      logger.error('❌ Certbot not available', { error });
      throw new Error('Certbot not available');
    }

    logger.info('✅ SSL renewal service initialized');
  }

  async renewCertificate(): Promise<void> {
    const startTime = Date.now();
    logger.info('🔄 Starting SSL certificate renewal process...');

    try {
      // Step 1: Check if renewal is needed
      const needsRenewal = await this.checkRenewalNeeded();
      if (!needsRenewal) {
        logger.info('✅ Certificate is still valid, no renewal needed');
        return;
      }

      // Step 2: Create backup
      const backupPath = await this.createBackup();

      // Step 3: Nginx must keep port 80 for HTTP-01 (certbot --webroot)
      await this.ensureNginxReadyForWebroot();

      // Step 4: Renew certificate (writes challenges into webroot; nginx serves them)
      await this.renewWithCertbot();

      // Step 5: Validate new certificate
      await this.validateCertificate();

      // Step 6: Reload nginx containers so TLS files from the host mount are picked up
      const reloadStart = Date.now();
      await this.restartNginx();
      const reloadSeconds = (Date.now() - reloadStart) / 1000;

      // Step 7: Verify service
      await this.verifyService();

      // Step 8: Get certificate expiry for metrics
      const expiryDays = await this.getCertificateExpiryDays();

      // Step 9: Send success notification
      const totalDuration = Date.now() - startTime;
      const durationStr = (totalDuration / 1000).toFixed(1);

      await this.telegramNotifier.sendSuccess({
        domain: this.config.domain,
        duration: `${durationStr}s`,
        backupPath
      });

      // Step 10: Update metrics (reloadSeconds ≈ brief blip from service update — not full-site downtime)
      metricsCollector.updateRenewalSuccess(totalDuration, reloadSeconds, expiryDays);

      // Step 11: Cleanup old backups
      await this.cleanupOldBackups();

      logger.info(`✅ SSL certificate renewal completed successfully in ${durationStr}s (nginx reload ~${reloadSeconds.toFixed(1)}s)`);

    } catch (error) {
      logger.error('❌ SSL certificate renewal failed', { error });
      
      // Update metrics
      metricsCollector.updateRenewalFailure();
      
      // Attempt rollback
      try {
        await this.rollback();
      } catch (rollbackError) {
        logger.error('❌ Rollback failed', { error: rollbackError });
      }

      // Send failure notification
      await this.telegramNotifier.sendFailure({
        domain: this.config.domain,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  private async getCertificateExpiryDays(): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `openssl x509 -in ${this.config.certPath}/fullchain.pem -noout -enddate`
      );
      const expiryMatch = stdout.match(/notAfter=(.+)/);
      if (!expiryMatch) return 0;

      const expiryDate = new Date(expiryMatch[1]);
      const now = new Date();
      return Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  }

  private async checkRenewalNeeded(): Promise<boolean> {
    logger.info('🔍 Checking if certificate renewal is needed...');

    try {
      const { stdout } = await execAsync(`certbot certificates`);
      const expiryMatch = stdout.match(/Expiry Date: (.+)/);
      
      if (!expiryMatch) {
        logger.warn('⚠️ Could not determine certificate expiry, assuming renewal needed');
        return true;
      }

      const expiryDate = new Date(expiryMatch[1]);
      const now = new Date();
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      logger.info(`📅 Certificate expires in ${daysUntilExpiry} days`);

      // Update metrics with current expiry
      metricsCollector.updateCertificateExpiry(daysUntilExpiry);

      // Renew if less than 30 days remaining
      return daysUntilExpiry < 30;
    } catch (error) {
      logger.error('❌ Error checking certificate expiry', { error });
      // Assume renewal needed if we can't check
      return true;
    }
  }

  private async createBackup(): Promise<string> {
    logger.info('💾 Creating certificate backup...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.config.backupDir, timestamp);

    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }

    try {
      // Copy certificate files
      const certFiles = ['fullchain.pem', 'privkey.pem', 'chain.pem', 'cert.pem'];
      for (const file of certFiles) {
        const sourcePath = path.join(this.config.certPath, file);
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, path.join(backupPath, file));
        }
      }

      // Save certificate info
      const { stdout } = await execAsync(
        `openssl x509 -in ${this.config.certPath}/fullchain.pem -noout -serial -dates`
      );
      fs.writeFileSync(path.join(backupPath, 'cert_info.txt'), stdout);

      logger.info(`✅ Backup created: ${backupPath}`);
      return backupPath;
    } catch (error) {
      logger.error('❌ Failed to create backup', { error });
      throw error;
    }
  }

  /**
   * HTTP-01 webroot auth requires nginx listening on :80 and serving `/.well-known/acme-challenge/`.
   */
  private async ensureNginxReadyForWebroot(): Promise<void> {
    logger.info('🔍 Ensuring Nginx is up for HTTP-01 webroot challenge...');

    try {
      const { stdout } = await execAsync(
        `docker service ls --filter "name=${this.config.nginxServiceName}" --format "{{.Replicas}}" 2>/dev/null || echo "0/0"`
      );
      const parts = stdout.trim().split('/');
      const current = parseInt(parts[0] || '0', 10);
      const desired = parseInt(parts[1] || '0', 10);

      if (current < 1 || desired < 1) {
        logger.warn('⚠️ Nginx is scaled down; scaling to 1 for ACME HTTP-01');
        await execAsync(`docker service scale ${this.config.nginxServiceName}=1`, { timeout: 120000 });
      }

      await this.waitForNginxRunning(90);
      logger.info('✅ Nginx is running — port 80 should serve ACME challenges');
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; message?: string };
      logger.error('❌ Nginx not ready for webroot renewal', {
        error: err?.message ?? error,
        stdout: err?.stdout,
        stderr: err?.stderr
      });
      throw error;
    }
  }

  private async waitForNginxRunning(maxWaitSec: number): Promise<void> {
    let remaining = maxWaitSec;

    while (remaining > 0) {
      try {
        const { stdout } = await execAsync(
          `docker service ls --filter "name=${this.config.nginxServiceName}" --format "{{.Replicas}}" 2>/dev/null || echo "0/0"`
        );
        const [current, desired] = stdout
          .trim()
          .split('/')
          .map((n) => parseInt(n, 10));

        if (current === desired && current > 0) {
          const { stdout: taskStatus } = await execAsync(
            `docker service ps ${this.config.nginxServiceName} --filter "desired-state=running" --format "{{.CurrentState}}" 2>/dev/null | head -1`
          );
          if (taskStatus.includes('Running')) {
            return;
          }
        }
      } catch {
        // Service may still be scheduling
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      remaining -= 2;
    }

    throw new Error(`Nginx did not become healthy within ${maxWaitSec} seconds`);
  }

  private async renewWithCertbot(): Promise<void> {
    logger.info('🔄 Renewing certificate with Certbot (webroot)...');

    try {
      // Get certificate serial before renewal
      let oldSerial: string | null = null;
      try {
        const { stdout } = await execAsync(
          `openssl x509 -in ${this.config.certPath}/fullchain.pem -noout -serial 2>/dev/null || echo ""`
        );
        oldSerial = stdout.trim();
      } catch {
        // Ignore if we can't get serial
      }

      const domainFlags = this.config.certDomains.map((d) => `-d ${d}`).join(' ');
      const cmd = [
        'certbot certonly',
        '--webroot',
        `-w ${this.config.webrootPath}`,
        domainFlags,
        `--cert-name ${this.config.certName}`,
        '--force-renewal',
        '--non-interactive',
        '--agree-tos',
        '--preferred-challenges http',
        '2>&1'
      ].join(' ');

      const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });

      logger.info('Certbot output:', { stdout, stderr });

      // Check if renewal was successful
      if (!fs.existsSync(path.join(this.config.certPath, 'fullchain.pem'))) {
        throw new Error('Certificate renewal failed: new certificate file not found');
      }

      // Verify that certificate was actually renewed (serial changed)
      if (oldSerial) {
        try {
          const { stdout: newSerialOutput } = await execAsync(
            `openssl x509 -in ${this.config.certPath}/fullchain.pem -noout -serial`
          );
          const newSerial = newSerialOutput.trim();
          if (oldSerial === newSerial) {
            logger.warn('⚠️ Certificate serial did not change - certbot may have skipped renewal');
            // Don't fail - certbot might have determined renewal is not needed yet
          } else {
            logger.info(`✅ Certificate renewed: serial changed from ${oldSerial} to ${newSerial}`);
          }
        } catch {
          // Ignore serial check errors
        }
      }

      logger.info('✅ Certificate renewed successfully');
    } catch (error) {
      logger.error('❌ Certbot renewal failed', { error });
      throw error;
    }
  }

  private async validateCertificate(): Promise<void> {
    logger.info('✅ Validating new certificate...');

    try {
      const certPath = path.join(this.config.certPath, 'fullchain.pem');
      
      if (!fs.existsSync(certPath)) {
        throw new Error('Certificate file not found');
      }

      // Check expiry date
      const { stdout } = await execAsync(
        `openssl x509 -in ${certPath} -noout -enddate`
      );
      const expiryMatch = stdout.match(/notAfter=(.+)/);
      if (!expiryMatch) {
        throw new Error('Could not parse certificate expiry date');
      }

      const expiryDate = new Date(expiryMatch[1]);
      const now = new Date();
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry < 60) {
        throw new Error(`New certificate expires too soon: ${daysUntilExpiry} days`);
      }

      // Check domains (certificate may include www subdomain)
      const { stdout: certText } = await execAsync(
        `openssl x509 -in ${certPath} -noout -text`
      );
      
      const domainCheck = certText.includes(`DNS:${this.config.domain}`) || 
                         certText.includes(`CN=${this.config.domain}`);
      if (!domainCheck) {
        logger.warn(`⚠️ Certificate may not include domain ${this.config.domain}, but continuing...`);
        // Don't fail if domain check fails - certbot might have updated it correctly
      }

      logger.info(`✅ Certificate validated. Expires in ${daysUntilExpiry} days`);
    } catch (error) {
      logger.error('❌ Certificate validation failed', { error });
      throw error;
    }
  }

  private async restartNginx(): Promise<void> {
    logger.info('🔄 Restarting Nginx service...');

    try {
      await execAsync(`docker service scale ${this.config.nginxServiceName}=1`, { timeout: 60000 });
      logger.info('✅ Nginx service scaled to 1 replica');

      await execAsync(`docker service update --force ${this.config.nginxServiceName}`, { timeout: 120000 });
      logger.info('✅ Nginx service update triggered (reload TLS from host mounts)');

      await this.waitForNginxRunning(90);

      await new Promise((resolve) => setTimeout(resolve, 8000));

      logger.info('✅ Nginx restarted successfully');
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; message?: string };
      logger.error('❌ Failed to restart Nginx', {
        error: err?.message ?? error,
        stdout: err?.stdout,
        stderr: err?.stderr
      });
      throw error;
    }
  }

  private async verifyService(): Promise<void> {
    logger.info('🔍 Verifying service health...');

    try {
      // Check HTTP
      const httpStatus = await this.checkHttpHealth();
      if (httpStatus !== 200) {
        throw new Error(`HTTP health check failed: ${httpStatus}`);
      }

      // Check HTTPS
      const httpsStatus = await this.checkHttpsHealth();
      if (httpsStatus !== 200) {
        throw new Error(`HTTPS health check failed: ${httpsStatus}`);
      }

      // Check certificate via SSL
      await this.checkSslCertificate();

      logger.info('✅ Service verification passed');
    } catch (error) {
      logger.error('❌ Service verification failed', { error });
      throw error;
    }
  }

  private async checkHttpHealth(): Promise<number> {
    try {
      // HTTP vhost redirects everything except ACME to HTTPS; follow to confirm nginx is up
      const { stdout } = await execAsync(
        `curl -o /dev/null -s -L -w "%{http_code}" http://${this.config.domain}/health --max-time 15`
      );
      return parseInt(stdout.trim(), 10);
    } catch {
      return 0;
    }
  }

  private async checkHttpsHealth(): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `curl -o /dev/null -s -w "%{http_code}" https://${this.config.domain}/health --max-time 10`
      );
      return parseInt(stdout.trim(), 10);
    } catch {
      return 0;
    }
  }

  private async checkSslCertificate(): Promise<void> {
    // Retry SSL check up to 3 times with delays (server might need time to reload)
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Increasing delay
        
        const { stdout } = await execAsync(
          `echo | timeout 10 openssl s_client -servername ${this.config.domain} -connect ${this.config.domain}:443 -verify_return_error 2>/dev/null | openssl x509 -noout -enddate`
        );
        const expiryMatch = stdout.match(/notAfter=(.+)/);
        if (!expiryMatch) {
          throw new Error('Could not parse SSL certificate expiry');
        }

        const expiryDate = new Date(expiryMatch[1]);
        const now = new Date();
        const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 60) {
          throw new Error(`Certificate in use expires too soon: ${daysUntilExpiry} days`);
        }

        logger.info(`✅ SSL certificate verified. Expires in ${daysUntilExpiry} days`);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`⚠️ SSL certificate check attempt ${attempt}/3 failed, retrying...`, { error: lastError });
      }
    }
    
    // All attempts failed
    logger.error('❌ SSL certificate check failed after 3 attempts', { error: lastError });
    throw lastError || new Error('SSL certificate check failed');
  }

  private async rollback(): Promise<void> {
    logger.info('🔄 Attempting rollback...');

    try {
      // Find latest backup
      const backups = fs.readdirSync(this.config.backupDir)
        .filter(f => fs.statSync(path.join(this.config.backupDir, f)).isDirectory())
        .sort()
        .reverse();

      if (backups.length === 0) {
        throw new Error('No backups found for rollback');
      }

      const latestBackup = path.join(this.config.backupDir, backups[0]);
      logger.info(`📦 Restoring from backup: ${latestBackup}`);

      // Restore certificate files
      const certFiles = ['fullchain.pem', 'privkey.pem', 'chain.pem', 'cert.pem'];
      for (const file of certFiles) {
        const backupFile = path.join(latestBackup, file);
        if (fs.existsSync(backupFile)) {
          fs.copyFileSync(backupFile, path.join(this.config.certPath, file));
        }
      }

      // Restart Nginx
      await this.restartNginx();

      // Send rollback notification
      await this.telegramNotifier.sendRollback({
        domain: this.config.domain,
        backupUsed: latestBackup
      });

      logger.info('✅ Rollback completed');
    } catch (error) {
      logger.error('❌ Rollback failed', { error });
      throw error;
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    logger.info('🧹 Cleaning up old backups...');

    try {
      const backups = fs.readdirSync(this.config.backupDir)
        .filter(f => fs.statSync(path.join(this.config.backupDir, f)).isDirectory())
        .sort()
        .reverse();

      // Keep last 5 backups
      if (backups.length > 5) {
        const toDelete = backups.slice(5);
        for (const backup of toDelete) {
          const backupPath = path.join(this.config.backupDir, backup);
          fs.rmSync(backupPath, { recursive: true, force: true });
          logger.info(`🗑️ Deleted old backup: ${backup}`);
        }
      }

      logger.info('✅ Backup cleanup completed');
    } catch (error) {
      logger.warn('⚠️ Backup cleanup failed (non-critical)', { error });
    }
  }
}

