/**
 * Prometheus-compatible metrics for SSL Renewal Service
 */

export interface SSLMetrics {
  lastRenewalTimestamp: number;
  lastRenewalDuration: number;
  lastRenewalStatus: 'success' | 'failed' | 'pending';
  certificateExpiryDays: number;
  totalRenewals: number;
  failedRenewals: number;
  lastDowntimeSeconds: number;
}

class MetricsCollector {
  private metrics: SSLMetrics = {
    lastRenewalTimestamp: 0,
    lastRenewalDuration: 0,
    lastRenewalStatus: 'pending',
    certificateExpiryDays: 0,
    totalRenewals: 0,
    failedRenewals: 0,
    lastDowntimeSeconds: 0
  };

  updateRenewalSuccess(duration: number, downtime: number, expiryDays: number): void {
    this.metrics.lastRenewalTimestamp = Date.now();
    this.metrics.lastRenewalDuration = duration;
    this.metrics.lastRenewalStatus = 'success';
    this.metrics.certificateExpiryDays = expiryDays;
    this.metrics.totalRenewals++;
    this.metrics.lastDowntimeSeconds = downtime;
  }

  updateRenewalFailure(): void {
    this.metrics.lastRenewalTimestamp = Date.now();
    this.metrics.lastRenewalStatus = 'failed';
    this.metrics.failedRenewals++;
  }

  updateCertificateExpiry(days: number): void {
    this.metrics.certificateExpiryDays = days;
  }

  getMetrics(): SSLMetrics {
    return { ...this.metrics };
  }

  /**
   * Generate Prometheus-format metrics
   */
  generatePrometheusMetrics(): string {
    const lines: string[] = [];
    
    // Certificate expiry
    lines.push('# HELP ssl_certificate_expiry_days Days until SSL certificate expires');
    lines.push('# TYPE ssl_certificate_expiry_days gauge');
    lines.push(`ssl_certificate_expiry_days ${this.metrics.certificateExpiryDays}`);
    lines.push('');
    
    // Last renewal timestamp
    lines.push('# HELP ssl_last_renewal_timestamp_seconds Unix timestamp of last renewal attempt');
    lines.push('# TYPE ssl_last_renewal_timestamp_seconds gauge');
    lines.push(`ssl_last_renewal_timestamp_seconds ${Math.floor(this.metrics.lastRenewalTimestamp / 1000)}`);
    lines.push('');
    
    // Last renewal duration
    lines.push('# HELP ssl_last_renewal_duration_seconds Duration of last renewal in seconds');
    lines.push('# TYPE ssl_last_renewal_duration_seconds gauge');
    lines.push(`ssl_last_renewal_duration_seconds ${this.metrics.lastRenewalDuration / 1000}`);
    lines.push('');
    
    // Last downtime
    lines.push('# HELP ssl_last_downtime_seconds Downtime during last renewal in seconds');
    lines.push('# TYPE ssl_last_downtime_seconds gauge');
    lines.push(`ssl_last_downtime_seconds ${this.metrics.lastDowntimeSeconds}`);
    lines.push('');
    
    // Renewal status (1 = success, 0 = failed)
    lines.push('# HELP ssl_last_renewal_success Last renewal success status (1=success, 0=failed)');
    lines.push('# TYPE ssl_last_renewal_success gauge');
    lines.push(`ssl_last_renewal_success ${this.metrics.lastRenewalStatus === 'success' ? 1 : 0}`);
    lines.push('');
    
    // Total renewals
    lines.push('# HELP ssl_total_renewals_total Total number of successful renewals');
    lines.push('# TYPE ssl_total_renewals_total counter');
    lines.push(`ssl_total_renewals_total ${this.metrics.totalRenewals}`);
    lines.push('');
    
    // Failed renewals
    lines.push('# HELP ssl_failed_renewals_total Total number of failed renewals');
    lines.push('# TYPE ssl_failed_renewals_total counter');
    lines.push(`ssl_failed_renewals_total ${this.metrics.failedRenewals}`);
    lines.push('');
    
    return lines.join('\n');
  }
}

export const metricsCollector = new MetricsCollector();

