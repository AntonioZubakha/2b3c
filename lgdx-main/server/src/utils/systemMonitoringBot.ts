import { Telegraf } from 'telegraf';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { logger } from './logger';
import { getErrorMessage } from './errorHelpers';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Helper function to read secrets from files or environment variables
const getSecretFromFile = (envVar: string): string | undefined => {
    const filePath = process.env[`${envVar}_FILE`];
    if (filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8').trim();
        } catch (e) {
            logger.error(`[SystemMonitoringBot] Failed to read ${envVar}_FILE:`, { error: e });
        }
    }
    return process.env[envVar];
};

// --- System Monitoring Bot Configuration ---
const systemMonitoringBotToken = getSecretFromFile('SYSTEM_MONITORING_BOT_TOKEN');
const systemMonitoringChatId = getSecretFromFile('SYSTEM_MONITORING_CHAT_ID');
let systemMonitoringBot: Telegraf<any> | null = null;

if (systemMonitoringBotToken && systemMonitoringChatId) {
    systemMonitoringBot = new Telegraf(systemMonitoringBotToken);
    logger.info(`[SystemMonitoringBot] System Monitoring Bot initialized for chat ID: ${systemMonitoringChatId}`);
} else {
    logger.info('[SystemMonitoringBot] System Monitoring Bot not initialized (missing SYSTEM_MONITORING_BOT_TOKEN or SYSTEM_MONITORING_CHAT_ID)');
}

// --- Helper Functions ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const _sendSystemAlert = async (text: string, options: any = {}): Promise<void> => {
    if (!systemMonitoringBot || !systemMonitoringChatId) {
        logger.warn(`[SystemMonitoringBot] SKIPPED (bot not initialized): ${text.substring(0, 100)}...`);
        return;
    }
    
    try {
        await systemMonitoringBot.telegram.sendMessage(systemMonitoringChatId, text, { 
            parse_mode: options.parse_mode || 'HTML', 
            ...options 
        });
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 429 && 'parameters' in error && typeof error.parameters === 'object' && error.parameters && 'retry_after' in error.parameters) {
            const retryAfter = (error.parameters as { retry_after: number }).retry_after;
            logger.warn(`[SystemMonitoringBot] Rate limited. Retrying in ${retryAfter}s...`);
            await delay(retryAfter * 1000 + 500);
            await systemMonitoringBot.telegram.sendMessage(systemMonitoringChatId, text, { 
                parse_mode: options.parse_mode || 'HTML', 
                ...options 
            });
        } else {
            logger.error(`[SystemMonitoringBot] Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};

// --- System Alert Functions ---

/**
 * Latency / performance warning — service is still responding (do not use "Service Down" wording).
 */
export const sendResponseTimeAnomalyAlert = async (
    serviceName: string,
    issue: string,
    additionalInfo?: Record<string, unknown>
): Promise<void> => {
    const timestamp = new Date().toISOString();
    const message = `
🟡 <b>PERFORMANCE WARNING: Slow responses</b>

<b>Service:</b> ${serviceName}
<b>Issue:</b> ${issue}
<b>Time:</b> ${timestamp}
${additionalInfo ? `<b>Details:</b> ${JSON.stringify(additionalInfo, null, 2)}` : ''}

<i>Health checks succeeded; this is not an outage. Investigate if sustained.</i>
    `.trim();

    await _sendSystemAlert(message);
};

export const sendServiceDownAlert = async (
    serviceName: string, 
    error: string, 
    additionalInfo?: Record<string, any>
): Promise<void> => {
    const timestamp = new Date().toISOString();
    const message = `
🔴 <b>SYSTEM ALERT: Service Down</b>

<b>Service:</b> ${serviceName}
<b>Error:</b> ${error}
<b>Time:</b> ${timestamp}
${additionalInfo ? `<b>Additional Info:</b> ${JSON.stringify(additionalInfo, null, 2)}` : ''}

⚠️ <b>IMMEDIATE ACTION REQUIRED</b>
    `.trim();
    
    await _sendSystemAlert(message);
};

export const sendServiceRecoveryAlert = async (
    serviceName: string, 
    downtime: string
): Promise<void> => {
    const timestamp = new Date().toISOString();
    const message = `
🟢 <b>SYSTEM RECOVERY: Service Restored</b>

<b>Service:</b> ${serviceName}
<b>Downtime:</b> ${downtime}
<b>Recovery Time:</b> ${timestamp}

✅ <b>Service is back online</b>
    `.trim();
    
    await _sendSystemAlert(message);
};

export const sendHighErrorRateAlert = async (
    serviceName: string, 
    errorRate: number, 
    threshold: number
): Promise<void> => {
    const timestamp = new Date().toISOString();
    const message = `
⚠️ <b>SYSTEM WARNING: High Error Rate</b>

<b>Service:</b> ${serviceName}
<b>Current Error Rate:</b> ${errorRate}%
<b>Threshold:</b> ${threshold}%
<b>Time:</b> ${timestamp}

🔍 <b>Investigation Required</b>
    `.trim();
    
    await _sendSystemAlert(message);
};

export const sendDatabaseConnectionAlert = async (
    database: string, 
    error: string
): Promise<void> => {
    const timestamp = new Date().toISOString();
    const message = `
🔴 <b>DATABASE ALERT: Connection Failed</b>

<b>Database:</b> ${database}
<b>Error:</b> ${error}
<b>Time:</b> ${timestamp}

⚠️ <b>CRITICAL - Database connectivity issue</b>
    `.trim();
    
    await _sendSystemAlert(message);
};

export const sendMemoryUsageAlert = async (
    serviceName: string, 
    memoryUsage: number, 
    threshold: number
): Promise<void> => {
    const timestamp = new Date().toISOString();
    const message = `
⚠️ <b>SYSTEM WARNING: High Memory Usage</b>

<b>Service:</b> ${serviceName}
<b>Memory Usage:</b> ${memoryUsage}%
<b>Threshold:</b> ${threshold}%
<b>Time:</b> ${timestamp}

🔍 <b>Memory optimization may be needed</b>
    `.trim();
    
    await _sendSystemAlert(message);
};

export const sendQueueBacklogAlert = async (
    queueName: string, 
    backlogSize: number, 
    threshold: number
): Promise<void> => {
    const timestamp = new Date().toISOString();
    const message = `
⚠️ <b>QUEUE ALERT: Backlog Detected</b>

<b>Queue:</b> ${queueName}
<b>Backlog Size:</b> ${backlogSize}
<b>Threshold:</b> ${threshold}
<b>Time:</b> ${timestamp}

🔍 <b>Queue processing may be slow</b>
    `.trim();
    
    await _sendSystemAlert(message);
};

export const sendDeploymentAlert = async (
    serviceName: string, 
    version: string, 
    status: 'started' | 'completed' | 'failed'
): Promise<void> => {
    const timestamp = new Date().toISOString();
    const emoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '🚀';
    const statusText = status === 'completed' ? 'COMPLETED' : status === 'failed' ? 'FAILED' : 'STARTED';
    
    const message = `
${emoji} <b>DEPLOYMENT ALERT: ${statusText}</b>

<b>Service:</b> ${serviceName}
<b>Version:</b> ${version}
<b>Status:</b> ${statusText}
<b>Time:</b> ${timestamp}
    `.trim();
    
    await _sendSystemAlert(message);
};

export const sendHealthCheckAlert = async (
    serviceName: string, 
    healthStatus: string, 
    responseTime?: number
): Promise<void> => {
    const timestamp = new Date().toISOString();
    const isHealthy = healthStatus === 'healthy';
    const emoji = isHealthy ? '🟢' : '🔴';
    
    const message = `
${emoji} <b>HEALTH CHECK: ${healthStatus.toUpperCase()}</b>

<b>Service:</b> ${serviceName}
<b>Status:</b> ${healthStatus}
${responseTime ? `<b>Response Time:</b> ${responseTime}ms` : ''}
<b>Time:</b> ${timestamp}
    `.trim();
    
    await _sendSystemAlert(message);
};

// --- System Status Summary ---
export const sendSystemStatusSummary = async (
    services: Array<{
        name: string;
        status: 'healthy' | 'unhealthy' | 'down';
        responseTime?: number;
        errorRate?: number;
        avgResponseTime?: number;
        maxResponseTime?: number;
        successRate?: number;
    }>
): Promise<void> => {
    const timestamp = new Date().toISOString();
    const healthyCount = services.filter(s => s.status === 'healthy').length;
    const totalCount = services.length;
    
    // Calculate overall system metrics
    const avgResponseTime = services
        .filter(s => s.avgResponseTime !== undefined)
        .reduce((sum, s) => sum + (s.avgResponseTime || 0), 0) / services.filter(s => s.avgResponseTime !== undefined).length;
    
    const avgSuccessRate = services
        .filter(s => s.successRate !== undefined)
        .reduce((sum, s) => sum + (s.successRate || 0), 0) / services.filter(s => s.successRate !== undefined).length;
    
    const servicesList = services.map(service => {
        const emoji = service.status === 'healthy' ? '🟢' : service.status === 'unhealthy' ? '🟡' : '🔴';
        const responseTimeInfo = service.responseTime ? ` (${service.responseTime}ms)` : '';
        const avgTimeInfo = service.avgResponseTime ? ` [avg: ${service.avgResponseTime.toFixed(0)}ms]` : '';
        const successInfo = service.successRate ? ` [${service.successRate.toFixed(1)}%]` : '';
        
        return `${emoji} <b>${service.name}:</b> ${service.status}${responseTimeInfo}${avgTimeInfo}${successInfo}`;
    }).join('\n');
    
    const message = `
📊 <b>SYSTEM STATUS SUMMARY</b>

<b>Overall Health:</b> ${healthyCount}/${totalCount} services healthy
<b>System Avg Response:</b> ${avgResponseTime ? avgResponseTime.toFixed(0) : 'N/A'}ms
<b>System Success Rate:</b> ${avgSuccessRate ? avgSuccessRate.toFixed(1) : 'N/A'}%
<b>Time:</b> ${timestamp}

<b>Services:</b>
${servicesList}
    `.trim();
    
    await _sendSystemAlert(message);
};

// --- Test function ---
export const testSystemMonitoringBot = async (): Promise<void> => {
    const testMessage = `
🧪 <b>SYSTEM MONITORING BOT TEST</b>

<b>Status:</b> Bot is working correctly
<b>Time:</b> ${new Date().toISOString()}

✅ <b>Test message sent successfully</b>
    `.trim();
    
    await _sendSystemAlert(testMessage);
}; 