/**
 * Метрики для FTP сервиса
 */

import client from 'prom-client';
import { logger } from '../shared/logger';

const register = new client.Registry();

register.setDefaultLabels({
  service: 'ftp-product-sync-service',
});

client.collectDefaultMetrics({ register });

const connectionCounter = new client.Counter({
  name: 'ftp_connections_total',
  help: 'Total FTP connections handled by the service',
  labelNames: ['status'],
});

register.registerMetric(connectionCounter);

const activeConnectionsGauge = new client.Gauge({
  name: 'ftp_active_connections',
  help: 'Number of active FTP connections',
});

register.registerMetric(activeConnectionsGauge);

const fileUploadCounter = new client.Counter({
  name: 'ftp_file_uploads_total',
  help: 'Total number of FTP file uploads processed',
  labelNames: ['status'],
});

register.registerMetric(fileUploadCounter);

const uploadedBytesCounter = new client.Counter({
  name: 'ftp_uploaded_bytes_total',
  help: 'Total bytes uploaded via FTP',
});

register.registerMetric(uploadedBytesCounter);

const errorCounter = new client.Counter({
  name: 'ftp_errors_total',
  help: 'Total FTP errors',
  labelNames: ['type'],
});

register.registerMetric(errorCounter);

const invalidUploadPathCounter = new client.Counter({
  name: 'ftp_invalid_upload_path_total',
  help: 'STOR paths rejected by path sanitizer',
  labelNames: ['reason'],
});

register.registerMetric(invalidUploadPathCounter);

export class FtpMetrics {
  private connectionCount = 0;
  private uploadCount = 0;
  private errorCount = 0;
  private activeConnections = 0;
  private totalBytesTransferred = 0;

  constructor() {
    logger.info('[Metrics] FTP Metrics initialized');
  }

  // Подключения
  recordConnection(companyId: string, status: 'success' | 'failure'): void {
    this.connectionCount++;
    connectionCounter.inc({ status });
    if (status === 'success') {
      this.activeConnections++;
      activeConnectionsGauge.set(this.activeConnections);
    } else {
      this.errorCount++;
    }
    logger.debug(`[Metrics] Connection recorded for company ${companyId}: ${status}`);
  }

  recordDisconnection(companyId: string): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
    activeConnectionsGauge.set(this.activeConnections);
    logger.debug(`[Metrics] Disconnection recorded for company ${companyId}`);
  }

  // Загрузки файлов
  recordFileUpload(companyId: string, fileName: string, fileSize: number): void {
    this.uploadCount++;
    this.totalBytesTransferred += fileSize;
    fileUploadCounter.inc({ status: 'completed' });
    uploadedBytesCounter.inc(fileSize);
    logger.debug(`[Metrics] File upload recorded: ${fileName} (${fileSize} bytes) for company ${companyId}`);
  }

  recordFileProcessing(companyId: string, fileName: string, status: 'started' | 'completed' | 'failed'): void {
    if (status === 'failed') {
      this.errorCount++;
      fileUploadCounter.inc({ status: 'failed' });
    } else if (status === 'started') {
      fileUploadCounter.inc({ status: 'started' });
    }
    logger.debug(`[Metrics] File processing ${status}: ${fileName} for company ${companyId}`);
  }

  // Ошибки
  recordError(type: string, details?: Record<string, unknown>): void {
    this.errorCount++;
    errorCounter.inc({ type });
    logger.debug(`[Metrics] Error recorded: ${type}`, details);
  }

  recordInvalidUploadPath(reason: string): void {
    invalidUploadPathCounter.inc({ reason });
  }

  // Получение метрик
  getMetrics(): Record<string, unknown> {
    return {
      connections: {
        total: this.connectionCount,
        active: this.activeConnections
      },
      uploads: {
        total: this.uploadCount,
        totalBytes: this.totalBytesTransferred,
        totalMB: Math.round(this.totalBytesTransferred / 1024 / 1024 * 100) / 100
      },
      errors: {
        total: this.errorCount
      },
      timestamp: new Date().toISOString()
    };
  }

  // Сброс метрик
  reset(): void {
    this.connectionCount = 0;
    this.uploadCount = 0;
    this.errorCount = 0;
    this.activeConnections = 0;
    this.totalBytesTransferred = 0;
    activeConnectionsGauge.set(0);
    logger.info('[Metrics] Metrics reset');
  }

  // Логирование текущих метрик
  logCurrentMetrics(): void {
    const metrics = this.getMetrics();
    logger.info('[Metrics] Current FTP metrics:', metrics);
  }
}

export { register as metricsRegistry };