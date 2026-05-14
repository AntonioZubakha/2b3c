import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createBackup, cleanupOldBackups } from '../src/backupService';
import { createMockBackupConfig, createMockBackupResult } from './setup';

// Mock dependencies
jest.mock('fs-extra');
jest.mock('archiver');
jest.mock('mongoose');

describe('Backup Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createBackup', () => {
    it('should create database backup successfully', async () => {
      const mockConfig = createMockBackupConfig();
      const mockResult = createMockBackupResult();

      // Mock file system operations
      const mockFs = require('fs-extra');
      mockFs.ensureDir = jest.fn().mockResolvedValue(undefined);
      mockFs.writeFile = jest.fn().mockResolvedValue(undefined);
      mockFs.stat = jest.fn().mockResolvedValue({ size: mockResult.size });

      // Mock archiver
      const mockArchiver = require('archiver');
      const mockArchive = {
        append: jest.fn(),
        finalize: jest.fn().mockResolvedValue(undefined),
        on: jest.fn()
      };
      mockArchiver.create = jest.fn().mockReturnValue(mockArchive);

      // Mock mongoose
      const mockMongoose = require('mongoose');
      mockMongoose.connection = {
        db: {
          listCollections: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([
              { name: 'products' },
              { name: 'users' },
              { name: 'companies' }
            ])
          }),
          collection: jest.fn().mockReturnValue({
            find: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue([])
            })
          })
        }
      };

      const result = await createBackup(mockConfig);

      expect(mockFs.ensureDir).toHaveBeenCalledWith(mockConfig.backupPath);
      expect(mockArchiver.create).toHaveBeenCalledWith('zip');
      expect(result).toBeDefined();
    });

    it('should handle backup creation errors gracefully', async () => {
      const mockConfig = createMockBackupConfig();

      // Mock file system error
      const mockFs = require('fs-extra');
      mockFs.ensureDir = jest.fn().mockRejectedValue(new Error('Permission denied'));

      await expect(createBackup(mockConfig)).rejects.toThrow('Permission denied');
    });

    it('should handle database connection errors', async () => {
      const mockConfig = createMockBackupConfig();

      // Mock file system
      const mockFs = require('fs-extra');
      mockFs.ensureDir = jest.fn().mockResolvedValue(undefined);

      // Mock mongoose error
      const mockMongoose = require('mongoose');
      mockMongoose.connection = {
        db: null // Simulate no database connection
      };

      await expect(createBackup(mockConfig)).rejects.toThrow();
    });
  });

  describe('cleanupOldBackups', () => {
    it('should remove old backups based on retention policy', async () => {
      const mockConfig = createMockBackupConfig({
        retentionCount: 3
      });

      // Mock file system operations
      const mockFs = require('fs-extra');
      mockFs.readdir = jest.fn().mockResolvedValue([
        'backup-2024-01-01.zip',
        'backup-2024-01-02.zip',
        'backup-2024-01-03.zip',
        'backup-2024-01-04.zip',
        'backup-2024-01-05.zip'
      ]);
      mockFs.stat = jest.fn().mockImplementation((file) => {
        const date = file.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
        return Promise.resolve({
          mtime: new Date(date || '2024-01-01'),
          isFile: () => true
        });
      });
      mockFs.remove = jest.fn().mockResolvedValue(undefined);

      await cleanupOldBackups(mockConfig);

      // Should remove 2 oldest backups (keep 3 most recent)
      expect(mockFs.remove).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup errors gracefully', async () => {
      const mockConfig = createMockBackupConfig();

      // Mock file system error
      const mockFs = require('fs-extra');
      mockFs.readdir = jest.fn().mockRejectedValue(new Error('Directory not found'));

      await expect(cleanupOldBackups(mockConfig)).rejects.toThrow('Directory not found');
    });

    it('should not remove backups if count is within retention limit', async () => {
      const mockConfig = createMockBackupConfig({
        retentionCount: 10
      });

      // Mock file system operations
      const mockFs = require('fs-extra');
      mockFs.readdir = jest.fn().mockResolvedValue([
        'backup-2024-01-01.zip',
        'backup-2024-01-02.zip'
      ]);
      mockFs.stat = jest.fn().mockResolvedValue({
        mtime: new Date('2024-01-01'),
        isFile: () => true
      });
      mockFs.remove = jest.fn().mockResolvedValue(undefined);

      await cleanupOldBackups(mockConfig);

      // Should not remove any backups
      expect(mockFs.remove).not.toHaveBeenCalled();
    });
  });
});
