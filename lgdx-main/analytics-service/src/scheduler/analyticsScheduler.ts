import schedule from 'node-schedule';
import { AnalyticsDataService } from '../services/analyticsDataService';
import { logger } from '../utils/logger';
import { sendAnalyticsStartNotification, sendAnalyticsCompleteNotification, sendAnalyticsErrorNotification } from '../shared/telegramBot';
import { analyticsJobCounter, analyticsJobDuration } from '../utils/metrics';
import { getServiceCoordinator } from '../utils/serviceCoordinator';
import { createClient, type RedisClientType } from 'redis';

const GLOBAL_SYNC_LOCK_KEY = process.env['GLOBAL_SYNC_LOCK_KEY'] || 'sync:lock:global';
let globalLockClient: RedisClientType | null = null;

async function getGlobalLockClient(): Promise<RedisClientType | null> {
  const redisUrl = process.env['REDIS_URL_FILE']
    ? require('fs').readFileSync(process.env['REDIS_URL_FILE'], 'utf8').trim()
    : process.env['REDIS_URL'];
  if (!redisUrl) return null;

  if (globalLockClient) return globalLockClient;
  globalLockClient = createClient({ url: redisUrl });
  globalLockClient.on('error', (err: Error) => logger.error('[GlobalLock] Redis error', { error: err.message }));
  await globalLockClient.connect();
  return globalLockClient;
}

async function acquireGlobalLock(lockValue: string, ttlSeconds: number): Promise<boolean> {
  const client = await getGlobalLockClient();
  if (!client) return true; // fail-open if Redis not configured
  const result = await client.set(GLOBAL_SYNC_LOCK_KEY, lockValue, { EX: ttlSeconds, NX: true });
  return result === 'OK';
}

async function extendGlobalLock(lockValue: string, ttlSeconds: number): Promise<void> {
  const client = await getGlobalLockClient();
  if (!client) return;
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("expire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;
  await client.eval(script, { keys: [GLOBAL_SYNC_LOCK_KEY], arguments: [lockValue, ttlSeconds.toString()] });
}

async function releaseGlobalLock(lockValue: string): Promise<void> {
  const client = await getGlobalLockClient();
  if (!client) return;
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await client.eval(script, { keys: [GLOBAL_SYNC_LOCK_KEY], arguments: [lockValue] });
}

async function waitForGlobalTurn(jobLabel: string): Promise<{ lockValue: string; release: () => Promise<void> }> {
  const lockValue = `analytics-${jobLabel}-${Date.now()}`;
  const ttl = 300;

  // "Queue": just wait until we can acquire the single global lock.
  // This keeps strict serialization across services.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ok = await acquireGlobalLock(lockValue, ttl);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 30_000));
  }

  const heartbeat = setInterval(() => {
    void extendGlobalLock(lockValue, 5 * 60);
  }, 2 * 60 * 1000);

  return {
    lockValue,
    release: async () => {
      clearInterval(heartbeat);
      await releaseGlobalLock(lockValue);
    },
  };
}

export class AnalyticsScheduler {
  private static instance: AnalyticsScheduler;
  private jobs: Map<string, schedule.Job> = new Map();

  private constructor() {
    // No dependencies needed
  }

  public static getInstance(): AnalyticsScheduler {
    if (!AnalyticsScheduler.instance) {
      AnalyticsScheduler.instance = new AnalyticsScheduler();
    }
    return AnalyticsScheduler.instance;
  }

  /**
   * Start the analytics scheduler
   */
  public start(): void {
    logger.info('🚀 Starting Analytics Scheduler...');

    // Schedule daily analytics generation at 00:00 UTC
    this.scheduleDailyAnalytics();

    logger.info('✅ Analytics Scheduler started successfully');
  }

  /**
   * Stop the analytics scheduler
   */
  public stop(): void {
    logger.info('🛑 Stopping Analytics Scheduler...');
    
    this.jobs.forEach((job, name) => {
      job.cancel();
      logger.info(`📅 Cancelled job: ${name}`);
    });
    
    this.jobs.clear();
    logger.info('✅ Analytics Scheduler stopped');
  }

  /**
   * Schedule daily analytics generation
   */
  private scheduleDailyAnalytics(): void {
    const jobName = 'daily-analytics';

    // Get schedule from environment variable or use default
    const schedulePattern = process.env['ANALYTICS_SCHEDULE'] || '0 0 * * *';
    logger.info(`📅 Using analytics schedule pattern: ${schedulePattern}`);

    const job = schedule.scheduleJob(schedulePattern, async () => {
      await this.generateDailyAnalytics();
    });

    if (job) {
      this.jobs.set(jobName, job);
      logger.info(`📅 Scheduled daily analytics generation with pattern: ${schedulePattern}`);
    } else {
      logger.error('❌ Failed to schedule daily analytics generation');
    }
  }

  /**
   * Generate daily analytics for all periods
   */
  private async generateDailyAnalytics(): Promise<void> {
    const startTime = Date.now();
    const timer = analyticsJobDuration.startTimer({ job: 'daily-analytics' });
    logger.info('🔄 Starting daily analytics generation...');

    const globalTurn = await waitForGlobalTurn('daily-analytics');

    // Get coordinator instance
    const coordinator = getServiceCoordinator(logger);

    // Set our status to 'running'
    await coordinator.setStatus('analytics', {
      status: 'running',
      startedAt: new Date(),
      metadata: { trigger: 'scheduled' }
    });

    // Wait for Market Price Calculator to complete (if enabled)
    if (coordinator.isEnabled()) {
      logger.info('⏳ Waiting for Market Price Calculator to complete...');
      const waitSuccess = await coordinator.waitForCompletion('market-price-calculator', 3600000); // 1 hour timeout
      
      if (!waitSuccess) {
        logger.warn('⚠️ Market Price Calculator did not complete in time, proceeding anyway');
      } else {
        logger.info('✅ Market Price Calculator completed, starting analytics');
      }
    }

    // Send start notification
    await sendAnalyticsStartNotification('Analytics Service (Scheduled)');

    try {
      const periods: ('day' | 'week' | 'month')[] = ['day', 'week', 'month'];
      const results = await Promise.allSettled(
        periods.map(async (period) => {
          logger.info(`📊 Generating analytics for period: ${period}`);
          // Recalculate and save to database
          await AnalyticsDataService.recalculateAnalytics(period);
          logger.info(`✅ Analytics generated for period: ${period}`);
        })
      );

      // Check results and send appropriate notifications
      const successfulPeriods = results.filter((result, index) => {
        const period = periods[index];
        if (result.status === 'fulfilled') {
          logger.info(`✅ Successfully generated analytics for ${period}`);
          return true;
        } else {
          logger.error(`❌ Failed to generate analytics for ${period}:`, result.reason);
          return false;
        }
      });

      const duration = Date.now() - startTime;
      const allSuccessful = successfulPeriods.length === periods.length;

      if (allSuccessful) {
        // Set status to 'completed'
        await coordinator.setStatus('analytics', {
          status: 'completed',
          startedAt: new Date(startTime),
          completedAt: new Date(),
          metadata: { 
            trigger: 'scheduled',
            duration,
            periodsGenerated: periods.length
          }
        });

        analyticsJobCounter.inc({ job: 'daily-analytics', status: 'success' });
        timer({ job: 'daily-analytics', status: 'success' });
        await sendAnalyticsCompleteNotification('Analytics Service', duration, true, `Generated analytics for ${periods.length} periods`);
        logger.info(`🎉 Daily analytics generation completed successfully in ${duration}ms`);
      } else {
        const failedPeriods = periods.length - successfulPeriods.length;

        // Set status to 'completed' with warning
        await coordinator.setStatus('analytics', {
          status: 'completed',
          startedAt: new Date(startTime),
          completedAt: new Date(),
          metadata: { 
            trigger: 'scheduled',
            duration,
            periodsGenerated: successfulPeriods.length,
            periodsFailed: failedPeriods
          }
        });

        analyticsJobCounter.inc({ job: 'daily-analytics', status: 'partial' });
        timer({ job: 'daily-analytics', status: 'partial' });
        await sendAnalyticsCompleteNotification('Analytics Service', duration, false, `Failed to generate ${failedPeriods}/${periods.length} periods`);
        logger.warn(`⚠️ Daily analytics generation completed with errors in ${duration}ms`);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Set status to 'failed'
      await coordinator.setStatus('analytics', {
        status: 'failed',
        startedAt: new Date(startTime),
        completedAt: new Date(),
        error: errorMessage,
        metadata: { trigger: 'scheduled', duration }
      });

      analyticsJobCounter.inc({ job: 'daily-analytics', status: 'error' });
      timer({ job: 'daily-analytics', status: 'error' });
      await sendAnalyticsErrorNotification('Analytics Service', errorMessage);
      logger.error('❌ Error in daily analytics generation:', error);
    } finally {
      await globalTurn.release();
    }
  }

  /**
   * Manually trigger analytics generation
   */
  public async triggerAnalyticsGeneration(period?: 'day' | 'week' | 'month'): Promise<void> {
    const startTime = Date.now();
    const startDate = new Date(startTime);
    const jobLabel = period ? `manual-${period}` : 'manual-all';
    const timer = analyticsJobDuration.startTimer({ job: jobLabel });

    const globalTurn = await waitForGlobalTurn(jobLabel);

    // Get coordinator instance
    const coordinator = getServiceCoordinator(logger);

    try {
      // Set status to 'running'
      await coordinator.setStatus('analytics', {
        status: 'running',
        startedAt: startDate,
        metadata: { trigger: 'manual', period: period || 'all' }
      });

      if (period) {
        logger.info(`🔧 Manual trigger: Recalculating analytics for ${period}`);
        logger.info('📱 Sending Telegram notification about manual start...');
        await sendAnalyticsStartNotification('Analytics Service (Manual)');
        await AnalyticsDataService.recalculateAnalytics(period);

        const duration = Date.now() - startTime;

        // Set status to 'completed'
        await coordinator.setStatus('analytics', {
          status: 'completed',
          startedAt: startDate,
          completedAt: new Date(),
          metadata: { trigger: 'manual', period, duration }
        });

        analyticsJobCounter.inc({ job: jobLabel, status: 'success' });
        timer({ job: jobLabel, status: 'success' });
        logger.info(`📱 Sending Telegram notification about manual completion in ${duration}ms...`);
        await sendAnalyticsCompleteNotification('Analytics Service (Manual)', duration, true, `Manual recalculation for ${period} period`);
        logger.info(`✅ Manual recalculation completed for ${period} in ${duration}ms`);
      } else {
        logger.info('🔧 Manual trigger: Recalculating analytics for all periods');
        logger.info('📱 Sending Telegram notification about manual start (all periods)...');
        await sendAnalyticsStartNotification('Analytics Service (Manual - All Periods)');
        await this.generateDailyAnalytics();
        timer({ job: jobLabel, status: 'success' });
        analyticsJobCounter.inc({ job: jobLabel, status: 'success' });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Set status to 'failed'
      await coordinator.setStatus('analytics', {
        status: 'failed',
        startedAt: startDate,
        completedAt: new Date(),
        error: errorMessage,
        metadata: { trigger: 'manual', period: period || 'all', duration }
      });

      logger.error(`📱 Sending Telegram notification about manual error in ${duration}ms...`);
      await sendAnalyticsErrorNotification('Analytics Service (Manual)', errorMessage);
      logger.error('❌ Error in manual recalculation:', error);
      analyticsJobCounter.inc({ job: jobLabel, status: 'error' });
      timer({ job: jobLabel, status: 'error' });
      throw error;
    } finally {
      await globalTurn.release();
    }
  }

  /**
   * Get scheduler status
   */
  public getStatus(): {
    isRunning: boolean;
    scheduledJobs: string[];
    nextRunTimes: Record<string, Date | null>;
  } {
    const scheduledJobs = Array.from(this.jobs.keys());
    const nextRunTimes: Record<string, Date | null> = {};

    this.jobs.forEach((job, name) => {
      nextRunTimes[name] = job.nextInvocation();
    });

    return {
      isRunning: this.jobs.size > 0,
      scheduledJobs,
      nextRunTimes
    };
  }
}
