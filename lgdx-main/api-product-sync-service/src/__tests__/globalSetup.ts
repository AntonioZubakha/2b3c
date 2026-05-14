import { jest } from '@jest/globals';

// Global setup for API Product Sync Service tests
export default async function globalSetup() {
  console.log('Setting up API Product Sync Service test environment...');
  
  // Mock external services
  jest.mock('mongoose', () => ({
    connect: jest.fn().mockResolvedValue({}),
    connection: {
      readyState: 1,
      close: jest.fn().mockResolvedValue({})
    }
  }));

  jest.mock('amqplib', () => ({
    connect: jest.fn().mockResolvedValue({
      createChannel: jest.fn().mockResolvedValue({
        assertQueue: jest.fn().mockResolvedValue({}),
        consume: jest.fn(),
        sendToQueue: jest.fn(),
        close: jest.fn().mockResolvedValue({})
      }),
      close: jest.fn().mockResolvedValue({})
    })
  }));

  jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  }));

  jest.mock('winston', () => ({
    createLogger: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    })
  }));

  console.log('API Product Sync Service test environment setup complete');
}
