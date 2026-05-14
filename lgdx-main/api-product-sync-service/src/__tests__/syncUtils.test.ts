// @ts-nocheck — Jest mock typings infer as `never` under strict ts-jest
jest.mock('../shared/marketPriceCacheClient', () => ({
  ensureFreshMarketPriceCache: jest.fn().mockResolvedValue(undefined),
  getSharedMarketPriceCache: jest.fn().mockReturnValue(new Map<string, number>()),
  getMarketPriceCacheStatus: jest.fn().mockReturnValue({
    version: 1,
    generatedAt: new Date().toISOString(),
    size: 0,
    lastSource: 'test',
    lastLoadedAt: new Date().toISOString(),
    lastError: null,
    redisConfigured: false,
    httpEndpoint: null,
  }),
}));

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handleProductSync } from '../shared/syncUtils';
import { createMockProduct, createMockCompany } from './setup';

// Mock dependencies
jest.mock('mongoose');
jest.mock('../models/Product');
jest.mock('../shared/telegramBot');

describe('Sync Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleProductSync', () => {
    it('should process products and update database', async () => {
      const mockProducts = [
        createMockProduct({ certificateNumber: 'SYNC001' }),
        createMockProduct({ certificateNumber: 'SYNC002' })
      ];

      const mockStats = {
        created: 0,
        updated: 0,
        deleted: 0,
        errors: 0,
        skippedInvalidStatus: 0,
        skippedInvalidColor: 0,
        skippedInvalidClarity: 0,
        skippedInvalidPrice: 0,
        skippedInvalidCarat: 0,
        skippedInvalidShape: 0,
        skippedInvalidCut: 0,
        skippedDuplicate: 0,
        skippedBlacklisted: 0,
        skippedInvalidCompany: 0,
        skippedInvalidCertificate: 0,
        skippedInvalidDate: 0,
        skippedInvalidDimensions: 0,
        skippedInvalidWeight: 0,
        skippedInvalidFluorescence: 0,
        skippedInvalidPolish: 0,
        skippedInvalidSymmetry: 0
      };

      const mockAllProcessedProducts: any[] = [];

      const companyOid = '507f1f77bcf86cd799439011';

      const mockProduct = {
        find: jest.fn().mockImplementation((query: Record<string, unknown>) => {
          if (query?.status === 'Sold') {
            return { lean: jest.fn().mockResolvedValue([]) };
          }
          return {
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          };
        }),
        bulkWrite: jest.fn().mockResolvedValue({}),
      };

      require('../models/Product').default = mockProduct;

      await handleProductSync(
        mockProducts,
        companyOid,
        mockStats as any,
        mockAllProcessedProducts
      );

      expect(mockProduct.find).toHaveBeenCalled();
    });

    it('should filter out products whose certificate is already Sold', async () => {
      const mockProducts = [
        createMockProduct({ certificateNumber: 'SOLD001' }),
        createMockProduct({ certificateNumber: 'VALID001' })
      ];

      const mockStats = {
        created: 0,
        updated: 0,
        deleted: 0,
        errors: 0,
        skippedByBlacklist: 0
      };

      const mockAllProcessedProducts: any[] = [];

      const companyOid = '507f1f77bcf86cd799439012';

      const mockProduct = {
        find: jest.fn().mockImplementation((query: Record<string, unknown>) => {
          if (query?.status === 'Sold') {
            return {
              lean: jest.fn().mockResolvedValue([{ certificateNumber: 'SOLD001' }]),
            };
          }
          return {
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          };
        }),
        bulkWrite: jest.fn().mockResolvedValue({}),
      };

      require('../models/Product').default = mockProduct;

      await handleProductSync(
        mockProducts,
        companyOid,
        mockStats as any,
        mockAllProcessedProducts
      );

      // Should filter out sold cert (SOLD001)
      expect(mockStats.skippedByBlacklist).toBe(1);
    });

    it('should handle database errors gracefully', async () => {
      const mockProducts = [createMockProduct()];
      const mockStats = { created: 0, updated: 0, deleted: 0, errors: 0 };
      const mockAllProcessedProducts: any[] = [];
      const companyOid = '507f1f77bcf86cd799439013';

      const mockProduct = {
        find: jest.fn().mockImplementation((query: Record<string, unknown>) => {
          if (query?.status === 'Sold') {
            return {
              lean: jest.fn().mockRejectedValue(new Error('Database connection failed')),
            };
          }
          return {
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          };
        }),
        bulkWrite: jest.fn().mockResolvedValue({}),
      };

      require('../models/Product').default = mockProduct;

      await expect(
        handleProductSync(mockProducts, companyOid, mockStats as any, mockAllProcessedProducts),
      ).rejects.toThrow('Database connection failed');
    });
  });
});
