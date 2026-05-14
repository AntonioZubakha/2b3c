import { logger } from '../utils/logger';

// Sync scheduler - placeholder for future sync operations
// This scheduler was moved to api-sync-service
export function initSyncScheduler() {
  logger.info('[SyncScheduler] Sync operations moved to api-sync-service');
}

// Export for backward compatibility
export default initSyncScheduler;
