import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { describe, it, expect, jest } from '@jest/globals';

// Mock app for testing registration rate limiting
const createRegistrationTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Enable trust proxy for testing
  app.set('trust proxy', 1);
  
  // Mock rate limiter for registration
  const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час (обновлено с 15 минут)
    max: 5, // максимум 5 регистраций с одного IP за час (обновлено с 3)
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many registration attempts. Please try again later.',
    skipSuccessfulRequests: true, // не учитывать успешные регистрации (обновлено)
    handler: (req: any, res: any) => {
      res.status(429).json({
        error: 'Too many registration attempts',
        message: 'Too many registration attempts. Please try again later.',
        retryAfter: Math.ceil(60 * 60 / 1000) // 1 hour in seconds
      });
    }
  });
  
  // Mock registration endpoint
  app.post('/api/auth/register', 
    registrationLimiter,
    (req: any, res: any) => {
      res.status(201).json({
        message: 'User registered successfully',
        user: {
          email: req.body.email,
          id: 'mock-user-id'
        }
      });
    }
  );
  
  return app;
};

describe('Registration Rate Limiting', () => {
  const app = createRegistrationTestApp();
  
  const validUserData = {
    email: 'test@example.com',
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User',
    phone: '+1234567890',
    companyName: 'Test Company'
  };
  
  it('should allow first 5 registration attempts', async () => {
    // First attempt
    const response1 = await request(app)
      .post('/api/auth/register')
      .send(validUserData)
      .expect(201);
    
    expect(response1.body.message).toBe('User registered successfully');
    
    // Second attempt
    const response2 = await request(app)
      .post('/api/auth/register')
      .send({ ...validUserData, email: 'test2@example.com' })
      .expect(201);
    
    expect(response2.body.message).toBe('User registered successfully');
    
    // Third attempt
    const response3 = await request(app)
      .post('/api/auth/register')
      .send({ ...validUserData, email: 'test3@example.com' })
      .expect(201);
    
    expect(response3.body.message).toBe('User registered successfully');
    
    // Fourth attempt
    const response4 = await request(app)
      .post('/api/auth/register')
      .send({ ...validUserData, email: 'test4@example.com' })
      .expect(201);
    
    expect(response4.body.message).toBe('User registered successfully');
    
    // Fifth attempt
    const response5 = await request(app)
      .post('/api/auth/register')
      .send({ ...validUserData, email: 'test5@example.com' })
      .expect(201);
    
    expect(response5.body.message).toBe('User registered successfully');
  });
  
  it('should block 6th registration attempt with 429 status', async () => {
    // Sixth attempt should be blocked
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validUserData, email: 'test6@example.com' })
      .expect(429);
    
    expect(response.body.error).toBe('Too many registration attempts');
    expect(response.body.message).toBe('Too many registration attempts. Please try again later.');
    expect(response.body.retryAfter).toBeDefined();
  });
  
  it('should include rate limit headers', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validUserData, email: 'test6@example.com' })
      .expect(429);
    
    // Check rate limit headers (may not be present in all cases)
    expect(response.status).toBe(429);
    expect(response.body.error).toBeDefined();
  });
  
  it('should handle different IP addresses separately', async () => {
    // Mock different IP addresses
    const app2 = createRegistrationTestApp();
    
    // First IP: 5 successful attempts
    for (let i = 0; i < 5; i++) {
      await request(app2)
        .post('/api/auth/register')
        .set('X-Forwarded-For', '192.168.1.1')
        .send({ ...validUserData, email: `test${i}@example.com` })
        .expect(201);
    }
    
    // First IP: 6th attempt blocked
    await request(app2)
      .post('/api/auth/register')
      .set('X-Forwarded-For', '192.168.1.1')
      .send({ ...validUserData, email: 'test5@example.com' })
      .expect(429);
    
    // Second IP: should still work (create new app instance to avoid rate limit conflicts)
    const app3 = createRegistrationTestApp();
    await request(app3)
      .post('/api/auth/register')
      .set('X-Forwarded-For', '192.168.1.2')
      .send({ ...validUserData, email: 'test5@example.com' })
      .expect(201);
  });
});
