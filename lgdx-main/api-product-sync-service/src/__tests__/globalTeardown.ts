import { jest } from '@jest/globals';

// Global teardown for API Product Sync Service tests
export default async function globalTeardown() {
  console.log('Cleaning up API Product Sync Service test environment...');
  
  // Clear all mocks
  jest.clearAllMocks();
  jest.resetAllMocks();
  
  console.log('API Product Sync Service test environment cleanup complete');
}
