import dotenv from 'dotenv';
import { jest, beforeAll, afterAll, afterEach } from '@jest/globals';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock external services - simplified to avoid TypeScript issues
jest.mock('../services/messageBroker');
jest.mock('mongoose');

// Global test setup
beforeAll(async () => {
  // Setup test database connection if needed
});

afterAll(async () => {
  // Cleanup test database connection if needed
});

// Global test teardown
afterEach(() => {
  jest.clearAllMocks();
});

// Test utilities
export const createMockUser = (overrides = {}) => ({
  _id: 'test-user-id',
  email: 'test@example.com',
  password: 'hashedPassword',
  firstName: 'Test',
  lastName: 'User',
  role: 'user',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockProduct = (overrides = {}) => ({
  _id: 'test-product-id',
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
  createdAt: new Date(),
  updatedAt: new Date(),
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