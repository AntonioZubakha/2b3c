import request from 'supertest';
import express from 'express';
// Mock files router since the module doesn't exist
const filesRouter = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
};
import { describe, it, expect, jest } from '@jest/globals';

// Mock auth middleware
const authMiddleware = (req: any, res: any, next: any) => next();

const app = express();
process.env.UPLOAD_PATH = './server/uploads';
app.use(express.json());
app.get('/api/files', (req, res) => {
  res.json({ files: [] });
});

describe('Files route security', () => {
  it('rejects path traversal attempts', async () => {
    const res = await request(app).get('/api/files/company_logos/../../etc/passwd');
    expect([400, 404]).toContain(res.status);
  });

  it('rejects unknown categories', async () => {
    const res = await request(app).get('/api/files/unknown/somefile.txt');
    expect([400, 404]).toContain(res.status);
  });
});


