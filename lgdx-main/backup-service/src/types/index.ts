export interface BackupConfig {
  mongodbUri: string;
  backupSchedule: string;
  retentionCount: number;
  backupPath: string;
  reportsPath: string;
  /** Used when reportsRetentionHours is 0 */
  reportsRetentionDays: number;
  /** If > 0, takes precedence over reportsRetentionDays (precise 24h-style retention) */
  reportsRetentionHours: number;
  /** Cron for reports-only cleanup (independent of backup success); minimal I/O */
  reportsCleanupSchedule: string;
}

export interface BackupResult {
  success: boolean;
  timestamp: string;
  filename: string;
  size: number;
  duration: number;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  timestamp: string;
  filename: string;
  duration: number;
  error?: string;
}

export interface BackupInfo {
  filename: string;
  timestamp: string;
  size: number;
  path: string;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  lastBackup?: BackupResult | undefined;
  diskUsage: {
    total: number;
    used: number;
    available: number;
    percentage: number;
  };
  mongodbConnection: boolean;
} 