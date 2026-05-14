import cron from 'node-cron';
import axios from 'axios';
import {
    sendServiceDownAlert,
    sendServiceRecoveryAlert,
    sendResponseTimeAnomalyAlert,
    sendSystemStatusSummary,
    testSystemMonitoringBot
} from '../utils/systemMonitoringBot';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';

interface ServiceHealth {
    name: string;
    url: string;
    status: 'healthy' | 'unhealthy' | 'down';
    lastCheck: Date;
    responseTime?: number;
    errorRate?: number;
    consecutiveFailures: number;
    lastFailure?: Date;
    // Enhanced monitoring fields
    responseTimeHistory: number[];
    maxResponseTime?: number;
    avgResponseTime?: number;
    totalChecks: number;
    successfulChecks: number;
    lastAlertSent?: Date;
    /** Consecutive checks that matched "slow" criteria (per service) */
    slowResponseStreak: number;
}

class SystemHealthMonitor {
    private services: Map<string, ServiceHealth> = new Map();
    private isMonitoring = false;
    private checkInterval = 30000; // 30 seconds
    private maxConsecutiveFailures = 3;
    // Enhanced monitoring settings
    private maxResponseTimeHistory = 120; // Keep last 120 checks (1 hour at 30s intervals)
    /** Hard cap (ms) before alerting — only for sustained slowness, see checkResponseTimeAnomalies */
    private responseTimeAlertThreshold = 2000;
    /** Ratio vs rolling average (only used together with minSlowMs and sustained checks) */
    private responseTimeAnomalyMultiplier = 8;
    /** Ignore anomaly ratio noise when absolute latency is still acceptable */
    private responseTimeAnomalyMinSlowMs = 1200;
    /** Consecutive slow checks required (30s interval → 3 = ~90s sustained) */
    private responseTimeSlowStreakRequired = 3;
    /** Min interval between performance/latency Telegram alerts (same service) */
    private responseTimeAlertCooldownMs = 45 * 60 * 1000;

    constructor() {
        this.initializeServices();
    }

    private initializeServices(): void {
        const isProduction = process.env.NODE_ENV === 'production';
        // Production: use nginx /health (tiny static 200) — not "/", which proxies the full SPA HTML
        // and produces noisy latency spikes unrelated to user-facing availability.
        // Dev: CRA dev server has no /health; "/" is fine for a coarse check.
        const clientUrl = isProduction ? 'http://nginx:80/health' : 'http://localhost:3001';
        
        // Add services to monitor
        this.addService('lgdx-server', 'http://localhost:5000/health');
        this.addService('lgdx-client', clientUrl);
        this.addService('api-sync-service', 'http://localhost:5000/health/sync');
        this.addService('file-import-service', 'http://localhost:5000/health/import');
        this.addService('market-price-calculator', 'http://localhost:5000/health/calculator');
        this.addService('mongodb', 'http://localhost:5000/health/db');
        this.addService('redis', 'http://localhost:5000/health/redis');
        this.addService('rabbitmq', 'http://localhost:5000/health/queue');
        
        logger.info(`[SystemHealthMonitor] Initialized with client URL: ${clientUrl} (${isProduction ? 'production' : 'development'} mode)`);
    }

    public addService(name: string, healthUrl: string): void {
        this.services.set(name, {
            name,
            url: healthUrl,
            status: 'healthy',
            lastCheck: new Date(),
            consecutiveFailures: 0,
            responseTimeHistory: [],
            totalChecks: 0,
            successfulChecks: 0,
            slowResponseStreak: 0
        });
    }

    public async startMonitoring(): Promise<void> {
        if (this.isMonitoring) {
            logger.info('[SystemHealthMonitor] Monitoring already started');
            return;
        }

        logger.info('[SystemHealthMonitor] Starting system health monitoring...');
        this.isMonitoring = true;

        // Test the monitoring bot
        await testSystemMonitoringBot();

        // Start cron job for health checks
        cron.schedule('*/30 * * * * *', async () => {
            await this.performHealthChecks();
        });

        // Send status summary every hour
        cron.schedule('0 * * * *', async () => {
            await this.sendStatusSummary();
        });

        logger.info('[SystemHealthMonitor] System health monitoring started');
    }

    public async stopMonitoring(): Promise<void> {
        this.isMonitoring = false;
        logger.info('[SystemHealthMonitor] System health monitoring stopped');
    }

    private async performHealthChecks(): Promise<void> {
        const checkPromises = Array.from(this.services.values()).map(service => 
            this.checkServiceHealth(service)
        );

        await Promise.allSettled(checkPromises);
    }

    private async checkServiceHealth(service: ServiceHealth): Promise<void> {
        const startTime = Date.now();
        let isHealthy = false;
        let responseTime: number | undefined;

        try {
            const response = await axios.get(service.url, {
                timeout: 10000, // 10 second timeout
                validateStatus: (status) => status < 500 // Consider 4xx as healthy (service is responding)
            });

            responseTime = Date.now() - startTime;
            isHealthy = response.status < 500;

        } catch (error: unknown) {
            responseTime = Date.now() - startTime;
            isHealthy = false;
            logger.error(`[SystemHealthMonitor] Health check failed for ${service.name}: ${getErrorMessage(error)}`);
        }

        // Update service status and metrics
        const previousStatus = service.status;
        service.lastCheck = new Date();
        service.responseTime = responseTime;
        service.totalChecks++;

        if (isHealthy) {
            service.successfulChecks++;
            
            // Update response time history
            if (responseTime !== undefined) {
                service.responseTimeHistory.push(responseTime);
                
                // Keep only recent history
                if (service.responseTimeHistory.length > this.maxResponseTimeHistory) {
                    service.responseTimeHistory = service.responseTimeHistory.slice(-this.maxResponseTimeHistory);
                }
                
                // Calculate statistics
                service.maxResponseTime = Math.max(service.maxResponseTime || 0, responseTime);
                service.avgResponseTime = service.responseTimeHistory.reduce((sum, time) => sum + time, 0) / service.responseTimeHistory.length;
            }

            if (service.consecutiveFailures > 0) {
                // Service recovered
                const downtime = this.calculateDowntime(service.lastFailure!);
                await sendServiceRecoveryAlert(service.name, downtime);
                logger.info(`[SystemHealthMonitor] Service ${service.name} recovered after ${downtime}`);
            }
            
            service.status = 'healthy';
            service.consecutiveFailures = 0;
            service.lastFailure = undefined;

            // Check for response time anomalies
            await this.checkResponseTimeAnomalies(service);
        } else {
            service.consecutiveFailures++;
            
            if (service.consecutiveFailures >= this.maxConsecutiveFailures) {
                service.status = 'down';
                
                // Only send alert if status changed to down
                if (previousStatus !== 'down') {
                    await sendServiceDownAlert(service.name, `Health check failed after ${service.consecutiveFailures} consecutive failures`, {
                        responseTime,
                        url: service.url,
                        consecutiveFailures: service.consecutiveFailures
                    });
                    logger.warn(`[SystemHealthMonitor] Service ${service.name} is down`);
                }
            } else {
                service.status = 'unhealthy';
                service.lastFailure = new Date();
            }
        }

        // Update service in map
        this.services.set(service.name, service);
    }

    private calculateDowntime(lastFailure: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - lastFailure.getTime();
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        
        if (diffMinutes < 60) {
            return `${diffMinutes} minutes`;
        } else {
            const hours = Math.floor(diffMinutes / 60);
            const minutes = diffMinutes % 60;
            return `${hours}h ${minutes}m`;
        }
    }

    private async checkResponseTimeAnomalies(service: ServiceHealth): Promise<void> {
        if (!service.responseTime || !service.avgResponseTime || service.responseTimeHistory.length < 10) {
            return; // Not enough data for anomaly detection
        }

        const now = new Date();
        const lastAlert = service.lastAlertSent;

        if (lastAlert && now.getTime() - lastAlert.getTime() < this.responseTimeAlertCooldownMs) {
            return;
        }

        const rt = service.responseTime;
        const avg = service.avgResponseTime;

        const exceedsHardCap = rt > this.responseTimeAlertThreshold;
        const exceedsRatio =
            rt > avg * this.responseTimeAnomalyMultiplier && rt > this.responseTimeAnomalyMinSlowMs;

        if (exceedsHardCap || exceedsRatio) {
            service.slowResponseStreak++;
        } else {
            service.slowResponseStreak = 0;
        }

        if (service.slowResponseStreak < this.responseTimeSlowStreakRequired) {
            return;
        }

        const ratio = rt / avg;
        const alertMessage = exceedsHardCap
            ? `Response time ${rt}ms exceeds threshold ${this.responseTimeAlertThreshold}ms (sustained ${this.responseTimeSlowStreakRequired} checks)`
            : `Response time ${rt}ms is ${ratio.toFixed(1)}× rolling average ${avg.toFixed(0)}ms (sustained; min absolute ${this.responseTimeAnomalyMinSlowMs}ms)`;

        await sendResponseTimeAnomalyAlert(service.name, alertMessage, {
            responseTime: rt,
            avgResponseTime: avg,
            maxResponseTime: service.maxResponseTime,
            successRate: (service.successfulChecks / service.totalChecks) * 100,
            monitoredUrl: service.url
        });

        service.lastAlertSent = now;
        service.slowResponseStreak = 0;
        logger.warn(`[SystemHealthMonitor] Response time anomaly (after sustained checks) for ${service.name}: ${alertMessage}`);
    }

    private async sendStatusSummary(): Promise<void> {
        const servicesList = Array.from(this.services.values()).map(service => ({
            name: service.name,
            status: service.status,
            responseTime: service.responseTime,
            errorRate: service.errorRate,
            avgResponseTime: service.avgResponseTime,
            maxResponseTime: service.maxResponseTime,
            successRate: service.totalChecks > 0 ? (service.successfulChecks / service.totalChecks) * 100 : 100
        }));

        await sendSystemStatusSummary(servicesList);
    }

    public async manualHealthCheck(): Promise<void> {
        logger.info('[SystemHealthMonitor] Performing manual health check...');
        await this.performHealthChecks();
        await this.sendStatusSummary();
    }

    public getServiceStatus(serviceName: string): ServiceHealth | undefined {
        return this.services.get(serviceName);
    }

    public getAllServicesStatus(): ServiceHealth[] {
        return Array.from(this.services.values());
    }

    public async testMonitoringBot(): Promise<void> {
        await testSystemMonitoringBot();
    }
}

// Create singleton instance
const systemHealthMonitor = new SystemHealthMonitor();

export default systemHealthMonitor; 