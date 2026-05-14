import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import { BackupResult, BackupInfo } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { recordBackupMetrics } from '../metrics';

export class BackupService {
  private lastBackup: BackupResult | null = null;

  async createBackup(): Promise<BackupResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `mongodb-backup-${timestamp}.gz`;
    
    // Simple backup directory
    const backupDir = path.join(config.backupPath, 'mongodb');
    await fs.ensureDir(backupDir);
    
    const backupPath = path.join(backupDir, filename);
    
          logger.info(`Starting MongoDB backup`, { filename, backupPath });

    try {
      // Create MongoDB backup using mongodump
      await this.executeMongoDump(backupPath);
      
      // Get file size
      const stats = await fs.stat(backupPath);
      const size = stats.size;
      
      const result: BackupResult = {
        success: true,
        timestamp: new Date().toISOString(),
        filename,
        size,
        duration: Date.now() - startTime
      };

      this.lastBackup = result;
      
      logger.info(`MongoDB backup completed successfully`, {
        filename,
        size: this.formatBytes(size),
        duration: result.duration
      });
      recordBackupMetrics(result.duration, 'success');
      
      // Clean up old backups
      await this.cleanupOldBackups();
      
      // Clean up old reports
      await this.cleanupOldReports();
      
      return result
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const result: BackupResult = {
        success: false,
        timestamp: new Date().toISOString(),
        filename,
        size: 0,
        duration: Date.now() - startTime,
        error: errorMessage
      };

      logger.error(`MongoDB backup failed`, {
        filename,
        error: errorMessage,
        duration: result.duration
      });
      recordBackupMetrics(result.duration, 'error');
      
      return result;
    }
  }

  private async executeMongoDump(outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Parse MongoDB URI to extract connection details
      const uri = new URL(config.mongodbUri);
      const host = uri.hostname;
      const port = uri.port || '27017';
      const database = uri.pathname.slice(1) || 'lgdx';
      const username = uri.username;
      const password = uri.password;
      const authSource = uri.searchParams.get('authSource') || 'admin';

      const args = [
        '--host', host,
        '--port', port,
        '--db', database,
        '--gzip',
        '--archive=' + outputPath
      ];

      // Add authentication if provided
      if (username && password) {
        args.push('--username', username);
        args.push('--password', password);
        args.push('--authenticationDatabase', authSource);
      }

      logger.debug(`Executing mongodump with args:`, { args: args.filter(arg => !arg.includes('password')) });

      const mongodump = spawn('mongodump', args);
      
      let stdout = '';
      let stderr = '';

      mongodump.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      mongodump.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      mongodump.on('close', (code) => {
        if (code === 0) {
          logger.debug('mongodump completed successfully', { stdout });
          resolve();
        } else {
          logger.error('mongodump failed', { code, stderr });
          reject(new Error(`mongodump failed with code ${code}: ${stderr}`));
        }
      });

      mongodump.on('error', (error) => {
        logger.error('Failed to start mongodump', { error: error.message });
        reject(error);
      });
    });
  }

  async cleanupOldBackups(): Promise<void> {
    try {
      const backupDir = path.join(config.backupPath, 'mongodb');
      const files = await fs.readdir(backupDir);
      
      // Get all backup files
      const backupFiles = files
        .filter(file => file.endsWith('.gz'))
        .map(file => ({ name: file, path: path.join(backupDir, file) }));

      // Sort by modification time (newest first)
      const sortedFiles = await Promise.all(
        backupFiles.map(async (file) => {
          const stats = await fs.stat(file.path);
          return { ...file, mtime: stats.mtime };
        })
      );
      sortedFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Keep only the latest N files
      if (sortedFiles.length > config.retentionCount) {
        const filesToDelete = sortedFiles.slice(config.retentionCount);
        
        for (const file of filesToDelete) {
          await fs.remove(file.path);
          logger.info(`Deleted old backup file`, { file: file.name });
        }
        
        logger.info(`Cleanup completed`, { deletedCount: filesToDelete.length });
      }
      
    } catch (error) {
      logger.error('Failed to cleanup old backups', { error: error instanceof Error ? error.message : error });
    }
  }

  async listBackups(): Promise<BackupInfo[]> {
    const backups: BackupInfo[] = [];
    const backupDir = path.join(config.backupPath, 'mongodb');
    
    try {
      const files = await fs.readdir(backupDir);
      
      for (const file of files) {
        if (!file.endsWith('.gz')) continue;
        
        const filePath = path.join(backupDir, file);
        const stats = await fs.stat(filePath);
        
        backups.push({
          filename: file,
          timestamp: stats.mtime.toISOString(),
          size: stats.size,
          path: filePath
        });
      }
    } catch (error) {
      logger.error('Failed to list backups', { error: error instanceof Error ? error.message : error });
    }
    
    // Sort by timestamp (newest first)
    return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async getBackupInfo(filename: string): Promise<BackupInfo | null> {
    const backups = await this.listBackups();
    return backups.find(backup => backup.filename === filename) || null;
  }

  async deleteBackup(filename: string): Promise<boolean> {
    try {
      const backupInfo = await this.getBackupInfo(filename);
      if (!backupInfo) {
        throw new Error(`Backup file not found: ${filename}`);
      }
      
      await fs.remove(backupInfo.path);
      logger.info(`Backup file deleted`, { filename });
      return true;
      
    } catch (error) {
      logger.error('Failed to delete backup', { filename, error: error instanceof Error ? error.message : error });
      return false;
    }
  }

  getLastBackup(): BackupResult | null {
    return this.lastBackup;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async cleanupOldReports(): Promise<void> {
    try {
      const reportsDir = config.reportsPath;
      
      // Check if reports directory exists
      if (!await fs.pathExists(reportsDir)) {
        logger.info(`Reports directory does not exist, skipping cleanup`, { reportsDir });
        return;
      }

      const files = await fs.readdir(reportsDir);
      const cutoffDate = new Date();
      if (config.reportsRetentionHours > 0) {
        cutoffDate.setTime(cutoffDate.getTime() - config.reportsRetentionHours * 60 * 60 * 1000);
      } else {
        cutoffDate.setDate(cutoffDate.getDate() - config.reportsRetentionDays);
      }
      
      let deletedCount = 0;
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(reportsDir, file);
        const stats = await fs.stat(filePath);
        
        // Skip directories
        if (stats.isDirectory()) continue;
        
        // Check if file is older than retention period
        if (stats.mtime < cutoffDate) {
          const fileSize = stats.size;
          await fs.remove(filePath);
          deletedCount++;
          totalSize += fileSize;
          
          const ageMs = Date.now() - stats.mtime.getTime();
          logger.info(`Deleted old report file`, { 
            file, 
            ageHours: Math.floor(ageMs / (1000 * 60 * 60)),
            ageDays: Math.floor(ageMs / (1000 * 60 * 60 * 24)),
            size: this.formatBytes(fileSize)
          });
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`Reports cleanup completed`, { 
          deletedCount, 
          totalSize: this.formatBytes(totalSize),
          retentionHours: config.reportsRetentionHours > 0 ? config.reportsRetentionHours : undefined,
          retentionDays: config.reportsRetentionHours > 0 ? undefined : config.reportsRetentionDays
        });
      } else {
        logger.info(`No old report files to clean up`, { 
          retentionHours: config.reportsRetentionHours > 0 ? config.reportsRetentionHours : undefined,
          retentionDays: config.reportsRetentionHours > 0 ? undefined : config.reportsRetentionDays
        });
      }
      
    } catch (error) {
      logger.error('Failed to cleanup old reports', { error: error instanceof Error ? error.message : error });
    }
  }
}

export const backupService = new BackupService(); 