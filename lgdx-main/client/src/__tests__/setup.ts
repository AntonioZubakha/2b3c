import '@testing-library/jest-dom';
import { jest, beforeAll, afterAll, afterEach } from '@jest/globals';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock fetch
global.fetch = jest.fn();

// Global test setup
beforeAll(async () => {
  // Test setup
});

afterAll(async () => {
  // Test cleanup
});

// Global test teardown
afterEach(() => {
  jest.clearAllMocks();
});

// Test utilities
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  companyName: 'Test Company',
  role: 'user',
  ...overrides
});

export const createMockProduct = (overrides = {}) => ({
  _id: 'test-product-id',
  certificateNumber: 'TEST001',
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
