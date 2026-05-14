import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Jest globals are available in test environment
declare global {
  var jest: any;
  var beforeAll: any;
  var afterAll: any;
  var afterEach: any;
}

// Mock external dependencies
jest.mock('mongoose');
jest.mock('amqplib');
jest.mock('axios');
jest.mock('winston');

// Global test setup
beforeAll(async () => {
  // Setup test database connection if needed
  console.log('Setting up API Product Sync Service tests...');
});

afterAll(async () => {
  // Cleanup test database connection if needed
  console.log('Cleaning up API Product Sync Service tests...');
});

// Global test teardown
afterEach(() => {
  jest.clearAllMocks();
});

// Test utilities
export const createMockProduct = (overrides = {}) => ({
  certificateNumber: 'TEST123456',
  shape: 'Round',
  carat: 1.0,
  color: 'D',
  clarity: 'FL',
  cut: 'Excellent',
  price: 10000,
  pricePerCarat: 10000,
  company: 'test-company-id',
  status: 'available',
  ...overrides
});

export const createMockCompany = (overrides = {}) => ({
  _id: 'test-company-id',
  name: 'Test Company',
  apiConfig: {
    enabled: true,
    url: 'https://api.test.com',
    apiKey: 'test-key'
  },
  ...overrides
});
