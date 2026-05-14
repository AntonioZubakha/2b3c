// @ts-nocheck — Jest mock typings (jest.fn / mockResolvedValue) infer as `never` under strict ts-jest
jest.mock('../shared/httpClient', () => ({
  __esModule: true,
  default: {
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  },
}));

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { runSpecificApiSync } from '../syncLogic';
import { createMockProduct, createMockCompany } from './setup';

// Mock dependencies
jest.mock('../shared/syncUtils');
jest.mock('../shared/telegramBot');
jest.mock('../models/Product');
jest.mock('../models/CompanyApiConfig');
jest.mock('../sync-strategies', () => ({
  selectFetchProductsStrategy: () =>
    jest.fn().mockResolvedValue({ products: [], statsUpdates: undefined }),
}));
jest.mock('../shared/syncReportUtils', () => ({
  generateSyncReports: jest.fn().mockResolvedValue({ xlsx: null, csv: null }),
}));

describe('Sync Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    require('../models/Product').default = {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    };
  });

  describe('runSpecificApiSync', () => {
    it('should successfully sync products from API', async () => {
      // Mock successful API response
      const mockProducts = [
        createMockProduct({ certificateNumber: 'API001' }),
        createMockProduct({ certificateNumber: 'API002' })
      ];

      const mockCompany = createMockCompany();

      // Mock the sync process
      const mockSyncUtils = require('../shared/syncUtils') as { handleProductSync: jest.Mock };
      mockSyncUtils.handleProductSync = jest.fn().mockResolvedValue({
        success: true,
        stats: {
          created: 2,
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
        }
      });

      const doc = {
        ...mockCompany,
        company: mockCompany,
        config: { url: 'https://example.com/api', requestType: 'get', headers: {}, params: {}, baseBodyPayload: {}, dataKey: 'data', filter: {} },
        syncStrategy: 'Test API',
        save: jest.fn().mockResolvedValue(undefined),
      };
      const mockCompanyApiConfig = {
        findById: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(doc),
        }),
      };

      require('../models/CompanyApiConfig').default = mockCompanyApiConfig;

      await runSpecificApiSync('507f1f77bcf86cd799439011');

      expect(mockCompanyApiConfig.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('should handle API sync errors gracefully (swallows error, sets sync status)', async () => {
      const mockCompany = createMockCompany();
      const doc = {
        ...mockCompany,
        company: mockCompany,
        config: { url: 'https://example.com/api', requestType: 'get', headers: {}, params: {}, baseBodyPayload: {}, dataKey: 'data', filter: {} },
        syncStrategy: 'Test API',
        save: jest.fn().mockResolvedValue(undefined),
      };
      const mockCompanyApiConfig = {
        findById: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(doc),
        }),
      };
      require('../models/CompanyApiConfig').default = mockCompanyApiConfig;

      const mockSyncUtils = require('../shared/syncUtils') as { handleProductSync: jest.Mock };
      mockSyncUtils.handleProductSync = jest.fn().mockRejectedValue(new Error('API connection failed'));

      await runSpecificApiSync('507f1f77bcf86cd799439011');
      expect(doc.save).toHaveBeenCalled();
    });

    it('should handle missing company configuration', async () => {
      const mockCompanyApiConfig = {
        findById: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(null),
        }),
      };
      require('../models/CompanyApiConfig').default = mockCompanyApiConfig;

      await expect(runSpecificApiSync('507f1f77bcf86cd799439011')).resolves.toBeUndefined();
    });
  });
});
