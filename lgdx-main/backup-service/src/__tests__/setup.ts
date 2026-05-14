import dotenv from 'dotenv';
import { jest, beforeAll, afterAll, afterEach } from '@jest/globals';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock external dependencies
jest.mock('mongoose');
jest.mock('fs-extra');
jest.mock('archiver');
jest.mock('winston');

// Global test setup
beforeAll(async () => {
  console.log('Setting up Backup Service tests...');
});

afterAll(async () => {
  console.log('Cleaning up Backup Service tests...');
});

// Global test teardown
afterEach(() => {
  jest.clearAllMocks();
});

// Test utilities
export const createMockBackupConfig = (overrides = {}) => ({
  schedule: '0 2 * * *',
  retentionCount: 7,
  backupPath: '/test/backups',
  reportsPath: '/test/reports',
  reportsRetentionDays: 7,
  reportsRetentionHours: 0,
  reportsCleanupSchedule: '0 */6 * * *',
  ...overrides
});

export const createMockBackupResult = () => ({
  success: true,
  backupPath: '/test/backups/backup-2024-01-01.zip',
  size: 1024000,
  timestamp: new Date().toISOString(),
  collections: ['products', 'users', 'companies']
});

export const createMockDatabaseStats = () => ({
  products: { count: 1000, size: 500000 },
  users: { count: 100, size: 50000 },
  companies: { count: 50, size: 25000 }
});
