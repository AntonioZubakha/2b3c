import dotenv from 'dotenv';
import { jest, beforeAll, afterAll, afterEach } from '@jest/globals';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock external dependencies
jest.mock('mongoose');
jest.mock('axios');
jest.mock('node-schedule');
jest.mock('winston');

// Global test setup
beforeAll(async () => {
  console.log('Setting up Market Price Calculator Service tests...');
});

afterAll(async () => {
  console.log('Cleaning up Market Price Calculator Service tests...');
});

// Global test teardown
afterEach(() => {
  jest.clearAllMocks();
});

// Test utilities
export const createMockProduct = (overrides = {}) => ({
  _id: 'test-product-id',
  certificateNumber: 'CALC001',
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

export const createMockMarketData = () => ({
  oilPrice: 80.50,
  goldPrice: 2000.00,
  inrRate: 0.012
});

export const createMockCalculationResult = () => ({
  productId: 'test-product-id',
  originalPrice: 10000,
  calculatedPrice: 10500,
  adjustmentFactor: 1.05,
  marketFactors: {
    oil: 0.02,
    gold: 0.01,
    inr: 0.02
  }
});
