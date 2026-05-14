// @ts-nocheck — Jest automocks + strict jest.Mock generics produce spurious "never" errors here.
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { processFileUploadTask } from '../worker';
import { createMockFileUploadTask, createMockCSVData } from './setup';

// Mock dependencies
jest.mock('../metrics', () => {
  const stub = () => ({
    inc: jest.fn(),
    observe: jest.fn(),
    set: jest.fn(),
    startTimer: jest.fn(() => ({ end: jest.fn() })),
  });
  return {
    filesProcessedCounter: stub(),
    fileProcessingDurationHistogram: stub(),
    fileProcessingErrorsCounter: stub(),
    marketPriceCacheDurationHistogram: stub(),
    marketPriceCacheCategoriesGauge: stub(),
    importDuplicatesCounter: stub(),
    marketPriceCacheVersionAgeGauge: stub(),
    startMetricsServer: jest.fn(),
  };
});
jest.mock('../shared/syncUtils');
jest.mock('fs-extra');
jest.mock('csv-parser');
jest.mock('exceljs');
jest.mock('path');

// Skipped: processFileUploadTask uses Redis global locks and real side effects; these cases need
// redisLock + mongoose mocks (or integration env). Un-skip when that harness exists.
describe.skip('File Import Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processFileUploadTask', () => {
    it('should process CSV file successfully', async () => {
      const mockTask = createMockFileUploadTask({
        filePath: '/test/path/file.csv',
        originalFileName: 'test-file.csv'
      });

      // Mock file system operations (Jest automock strips concrete types)
      const mockFs = require('fs-extra') as any;
      mockFs.pathExists = jest.fn().mockResolvedValue(true);
      mockFs.readFile = jest.fn().mockResolvedValue('mock csv content');

      // Mock CSV parser
      const mockCsvParser = require('csv-parser') as any;
      const mockStream: { on: jest.Mock } = {
        on: jest.fn().mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
          if (event === 'data') {
            // Simulate CSV data
            setTimeout(() => {
              createMockCSVData().forEach(row => callback(row));
            }, 10);
          } else if (event === 'end') {
            setTimeout(() => callback(), 20);
          }
          return mockStream;
        })
      };
      mockCsvParser.mockReturnValue(mockStream);

      // Mock sync utils
      const mockSyncUtils = require('../shared/syncUtils') as any;
      mockSyncUtils.handleProductSync = jest.fn().mockResolvedValue({
        success: true,
        stats: { created: 2, updated: 0, deleted: 0, errors: 0 }
      });

      await processFileUploadTask(mockTask);

      expect(mockFs.pathExists).toHaveBeenCalledWith(mockTask.filePath);
      expect(mockSyncUtils.handleProductSync).toHaveBeenCalled();
    });

    it('should process Excel file successfully', async () => {
      const mockTask = createMockFileUploadTask({
        filePath: '/test/path/file.xlsx',
        originalFileName: 'test-file.xlsx'
      });

      const mockFs = require('fs-extra') as any;
      mockFs.pathExists = jest.fn().mockResolvedValue(true);

      // Mock Excel.js
      const mockWorkbook = {
        xlsx: {
          readFile: jest.fn().mockResolvedValue(undefined)
        },
        getWorksheet: jest.fn().mockReturnValue({
          getRow: jest.fn().mockReturnValue({
            values: ['Certificate Number', 'Shape', 'Carat', 'Color', 'Clarity', 'Cut', 'Price']
          }),
          rowCount: 3,
          eachRow: jest.fn().mockImplementation((callback: (row: { values: unknown[] }, rowNumber: number) => void) => {
            // Simulate Excel rows
            callback({ values: ['EXCEL001', 'Round', 1.0, 'D', 'FL', 'Excellent', 10000] }, 2);
            callback({ values: ['EXCEL002', 'Princess', 1.5, 'E', 'VVS1', 'Very Good', 15000] }, 3);
          })
        })
      };

      const mockExcel = require('exceljs') as any;
      mockExcel.Workbook = jest.fn().mockReturnValue(mockWorkbook);

      const mockSyncUtils = require('../shared/syncUtils') as any;
      mockSyncUtils.handleProductSync = jest.fn().mockResolvedValue({
        success: true,
        stats: { created: 2, updated: 0, deleted: 0, errors: 0 }
      });

      await processFileUploadTask(mockTask);

      expect(mockFs.pathExists).toHaveBeenCalledWith(mockTask.filePath);
      expect(mockSyncUtils.handleProductSync).toHaveBeenCalled();
    });

    it('should handle file not found error', async () => {
      const mockTask = createMockFileUploadTask();

      // Mock file not found
      const mockFs = require('fs-extra') as any;
      mockFs.pathExists = jest.fn().mockResolvedValue(false);

      await expect(processFileUploadTask(mockTask)).rejects.toThrow();
    });

    it('should handle unsupported file format', async () => {
      const mockTask = createMockFileUploadTask({
        filePath: '/test/path/file.pdf',
        originalFileName: 'test-file.pdf'
      });

      // Mock file exists
      const mockFs = require('fs-extra') as any;
      mockFs.pathExists = jest.fn().mockResolvedValue(true);

      await expect(processFileUploadTask(mockTask)).rejects.toThrow();
    });

    it('should handle processing errors gracefully', async () => {
      const mockTask = createMockFileUploadTask();

      // Mock file system error
      const mockFs = require('fs-extra') as any;
      mockFs.pathExists = jest.fn().mockRejectedValue(new Error('File system error'));

      await expect(processFileUploadTask(mockTask)).rejects.toThrow('File system error');
    });
  });
});
