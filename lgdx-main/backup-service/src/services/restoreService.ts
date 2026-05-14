import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import { RestoreResult } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { backupService } from './backupService';

export class RestoreService {
  async restoreFromBackup(filename: string): Promise<RestoreResult> {
    const startTime = Date.now();
    
    logger.info(`Starting MongoDB restore from backup`, { filename });

    try {
      // Get backup info
      const backupInfo = await backupService.getBackupInfo(filename);
      if (!backupInfo) {
        throw new Error(`Backup file not found: ${filename}`);
      }

      // Verify backup file exists
      if (!await fs.pathExists(backupInfo.path)) {
        throw new Error(`Backup file does not exist: ${backupInfo.path}`);
      }

      // Execute MongoDB restore
      await this.executeMongoRestore(backupInfo.path);
      
      const result: RestoreResult = {
        success: true,
        timestamp: new Date().toISOString(),
        filename,
        duration: Date.now() - startTime
      };

      logger.info(`MongoDB restore completed successfully`, {
        filename,
        duration: result.duration
      });
      
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const result: RestoreResult = {
        success: false,
        timestamp: new Date().toISOString(),
        filename,
        duration: Date.now() - startTime,
        error: errorMessage
      };

      logger.error(`MongoDB restore failed`, {
        filename,
        error: errorMessage,
        duration: result.duration
      });
      
      return result;
    }
  }

  private async executeMongoRestore(backupPath: string): Promise<void> {
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
        '--archive=' + backupPath,
        '--drop' // Drop existing collections before restore
      ];

      // Add authentication if provided
      if (username && password) {
        args.push('--username', username);
        args.push('--password', password);
        args.push('--authenticationDatabase', authSource);
      }

      logger.debug(`Executing mongorestore with args:`, { args: args.filter(arg => !arg.includes('password')) });

      const mongorestore = spawn('mongorestore', args);
      
      let stdout = '';
      let stderr = '';

      mongorestore.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      mongorestore.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      mongorestore.on('close', (code) => {
        if (code === 0) {
          logger.debug('mongorestore completed successfully', { stdout });
          resolve();
        } else {
          logger.error('mongorestore failed', { code, stderr });
          reject(new Error(`mongorestore failed with code ${code}: ${stderr}`));
        }
      });

      mongorestore.on('error', (error) => {
        logger.error('Failed to start mongorestore', { error: error.message });
        reject(error);
      });
    });
  }

  async testRestore(filename: string): Promise<RestoreResult> {
    const startTime = Date.now();
    
    logger.info(`Starting test restore from backup`, { filename });

    try {
      // Get backup info
      const backupInfo = await backupService.getBackupInfo(filename);
      if (!backupInfo) {
        throw new Error(`Backup file not found: ${filename}`);
      }

      // Create temporary database for test restore
      const testDatabase = `test_restore_${Date.now()}`;
      
      // Execute test restore to temporary database
      await this.executeTestRestore(backupInfo.path, testDatabase);
      
      // Clean up test database
      await this.cleanupTestDatabase(testDatabase);
      
      const result: RestoreResult = {
        success: true,
        timestamp: new Date().toISOString(),
        filename,
        duration: Date.now() - startTime
      };

      logger.info(`Test restore completed successfully`, {
        filename,
        testDatabase,
        duration: result.duration
      });
      
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const result: RestoreResult = {
        success: false,
        timestamp: new Date().toISOString(),
        filename,
        duration: Date.now() - startTime,
        error: errorMessage
      };

      logger.error(`Test restore failed`, {
        filename,
        error: errorMessage,
        duration: result.duration
      });
      
      return result;
    }
  }

  private async executeTestRestore(backupPath: string, testDatabase: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Parse MongoDB URI to extract connection details
      const uri = new URL(config.mongodbUri);
      const host = uri.hostname;
      const port = uri.port || '27017';
      const username = uri.username;
      const password = uri.password;
      const authSource = uri.searchParams.get('authSource') || 'admin';

      const args = [
        '--host', host,
        '--port', port,
        '--db', testDatabase,
        '--gzip',
        '--archive=' + backupPath
      ];

      // Add authentication if provided
      if (username && password) {
        args.push('--username', username);
        args.push('--password', password);
        args.push('--authenticationDatabase', authSource);
      }

      logger.debug(`Executing test mongorestore with args:`, { args: args.filter(arg => !arg.includes('password')) });

      const mongorestore = spawn('mongorestore', args);
      
      let stdout = '';
      let stderr = '';

      mongorestore.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      mongorestore.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      mongorestore.on('close', (code) => {
        if (code === 0) {
          logger.debug('Test mongorestore completed successfully', { stdout });
          resolve();
        } else {
          logger.error('Test mongorestore failed', { code, stderr });
          reject(new Error(`Test mongorestore failed with code ${code}: ${stderr}`));
        }
      });

      mongorestore.on('error', (error) => {
        logger.error('Failed to start test mongorestore', { error: error.message });
        reject(error);
      });
    });
  }

  private async cleanupTestDatabase(testDatabase: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Parse MongoDB URI to extract connection details
      const uri = new URL(config.mongodbUri);
      const host = uri.hostname;
      const port = uri.port || '27017';
      const username = uri.username;
      const password = uri.password;
      const authSource = uri.searchParams.get('authSource') || 'admin';

      const args = [
        '--host', host,
        '--port', port,
        '--eval', `db.dropDatabase()`,
        testDatabase
      ];

      // Add authentication if provided
      if (username && password) {
        args.push('--username', username);
        args.push('--password', password);
        args.push('--authenticationDatabase', authSource);
      }

      logger.debug(`Executing cleanup with args:`, { args: args.filter(arg => !arg.includes('password')) });

      const mongo = spawn('mongosh', args);
      
      let stdout = '';
      let stderr = '';

      mongo.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      mongo.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      mongo.on('close', (code) => {
        if (code === 0) {
          logger.debug('Test database cleanup completed successfully', { stdout });
          resolve();
        } else {
          logger.error('Test database cleanup failed', { code, stderr });
          reject(new Error(`Test database cleanup failed with code ${code}: ${stderr}`));
        }
      });

      mongo.on('error', (error) => {
        logger.error('Failed to start test database cleanup', { error: error.message });
        reject(error);
      });
    });
  }
}

export const restoreService = new RestoreService(); 