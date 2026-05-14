import request from 'supertest';
import express from 'express';
import { describe, it, expect } from '@jest/globals';

// Mock app for testing auth endpoints without real models
const createAuthTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock auth endpoints
  app.post('/api/auth/register', (req: any, res: any) => {
    const { email, password, firstName, lastName, companyName } = req.body;
    
    // Basic validation
    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }
    
    if (!email.includes('@')) {
      res.status(400).json({ message: 'Invalid email format' });
      return;
    }
    
    if (password.length < 8) {
      res.status(400).json({ message: 'Password too short' });
      return;
    }
    
    // Mock successful registration
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        email,
        firstName,
        lastName,
        companyName,
        id: 'mock-user-id'
      }
    });
  });
  
  app.post('/api/auth/login', (req: any, res: any) => {
    const { login, password } = req.body;
    const email = login === 'test@example.com' || login === '+15551234567' ? 'test@example.com' : login;
    if ((login === 'test@example.com' || login === '+15551234567') && password === 'TestPassword123!') {
      res.status(200).json({
        token: 'mock-jwt-token',
        user: {
          email,
          id: 'mock-user-id',
          role: 'user'
        }
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  });
  
  app.get('/api/auth/me', (req: any, res: any) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'No token provided' });
      return;
    }
    
    const token = authHeader.substring(7);
    
    if (token === 'mock-jwt-token') {
      res.status(200).json({
        user: {
          email: 'test@example.com',
          id: 'mock-user-id',
          role: 'user'
        }
      });
    } else {
      res.status(401).json({ message: 'Invalid token' });
    }
  });
  
  return app;
};

describe('Authentication Endpoints', () => {
  const app = createAuthTestApp();
  
  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User',
        companyName: 'Test Company'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', userData.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject registration with weak password', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123',
        firstName: 'Test',
        lastName: 'User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials (email)', async () => {
      const loginData = {
        login: 'test@example.com',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
    });

    it('should reject login with invalid credentials', async () => {
      const loginData = {
        login: 'test@example.com',
        password: 'WrongPassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body).toHaveProperty('message', 'Invalid credentials');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user profile with valid token', async () => {
      // First login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          login: 'test@example.com',
          password: 'TestPassword123!'
        });

      const token = loginResponse.body.token;

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('message', 'No token provided');
    });
  });
}); 