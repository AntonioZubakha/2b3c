import dotenv from 'dotenv';
import type { Types } from 'mongoose';
import { jest, beforeAll, afterAll, afterEach } from '@jest/globals';
import type { FileUploadTaskPayload } from '../worker';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock external dependencies
jest.mock('mongoose');
jest.mock('amqplib');
jest.mock('fs-extra');
jest.mock('exceljs');

// Global test setup
beforeAll(async () => {
  console.log('Setting up File Product Import Service tests...');
});

afterAll(async () => {
  console.log('Cleaning up File Product Import Service tests...');
});

// Global test teardown
afterEach(() => {
  jest.clearAllMocks();
});

const testCompanyObjectId = {
  toString: () => '507f1f77bcf86cd799439011',
} as unknown as Types.ObjectId;

// Test utilities
export const createMockFileUploadTask = (
  overrides: Partial<FileUploadTaskPayload> = {},
): FileUploadTaskPayload => ({
  filePath: '/test/path/file.xlsx',
  userId: 'test-user-id',
  companyDoc: {
    _id: testCompanyObjectId,
    name: 'Test Company',
  },
  companyName: 'Test Company',
  originalFileName: 'test-file.xlsx',
  uploadMode: 'add',
  ...overrides,
});

export const createMockProduct = (overrides = {}) => ({
  certificateNumber: 'FILE001',
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

export const createMockCSVData = () => [
  {
    'Certificate Number': 'CSV001',
    'Shape': 'Round',
    'Carat': '1.0',
    'Color': 'D',
    'Clarity': 'FL',
    'Cut': 'Excellent',
    'Price': '10000'
  },
  {
    'Certificate Number': 'CSV002',
    'Shape': 'Princess',
    'Carat': '1.5',
    'Color': 'E',
    'Clarity': 'VVS1',
    'Cut': 'Very Good',
    'Price': '15000'
  }
];
