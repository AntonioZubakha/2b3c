import { jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';

// Integration test setup
beforeAll(async () => {
  // Connect to test database
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/lgdx_test';
  
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }
  
  console.log('Connected to test database');
});

afterAll(async () => {
  // Close database connection
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  
  console.log('Disconnected from test database');
});

beforeEach(async () => {
  // Clean up collections before each test
  const collections = await mongoose.connection.db?.collections();
  if (collections) {
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
});

// Mock external services for integration tests
jest.mock('../../services/messageBroker', () => ({
  publishMessage: jest.fn().mockResolvedValue(undefined),
  consumeMessages: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../services/telegramBot', () => ({
  sendMessage: jest.fn().mockResolvedValue(undefined),
  sendErrorNotification: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined)
}));
