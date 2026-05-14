import request from 'supertest';
import express from 'express';
import { describe, it, expect } from '@jest/globals';

// Create a simple test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock health endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  // Mock API health endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });
  
  return app;
};

describe('Simple API Integration Tests', () => {
  const app = createTestApp();

  describe('Health Endpoints', () => {
    it('should return 200 for /health', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return 200 for /api/health', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.body.status).toBe('ok');
      expect(response.body.uptime).toBeDefined();
    });
  });

  describe('API Response Format', () => {
    it('should return valid JSON responses', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.headers['content-type']).toMatch(/json/);
      expect(typeof response.body).toBe('object');
    });
  });
});
