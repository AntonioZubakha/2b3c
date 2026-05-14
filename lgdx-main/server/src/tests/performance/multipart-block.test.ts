import express, { Request, Response } from 'express';
import request from 'supertest';
import { describe, it, expect } from '@jest/globals';

// Reuse the same middleware logic as in server/src/index.ts (simplified harness)
const app = express();

// Minimal middleware under test
app.use((req: Request, res: Response, next) => {
  const ct = req.headers['content-type'] || '';
  const isMultipart = typeof ct === 'string' && ct.toLowerCase().startsWith('multipart/');
  if (isMultipart && !req.path.startsWith('/api/company/logo') && !req.path.startsWith('/api/inventory') && !req.path.includes('/action/upload_invoice')) {
    res.status(415).json({ message: 'Unsupported Media Type' });
    return;
  }
  next();
});

app.post('/api/other', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});
app.post('/api/company/logo', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});
app.post('/api/inventory/upload', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

app.post('/api/deal/:dealId/action/:actionName', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

describe('Unexpected multipart blocker', () => {
  it('blocks multipart on non-upload routes', async () => {
    await request(app)
      .post('/api/other')
      .set('Content-Type', 'multipart/form-data; boundary=----test')
      .send('------test\r\nContent-Disposition: form-data; name="f"; filename="a.txt"\r\n\r\nX\r\n------test--')
      .expect(415);
  });

  it('allows multipart on /api/company/logo', async () => {
    await request(app)
      .post('/api/company/logo')
      .set('Content-Type', 'multipart/form-data; boundary=----test')
      .send('------test--')
      .expect(200);
  });

  it('allows multipart on /api/inventory/upload', async () => {
    await request(app)
      .post('/api/inventory/upload')
      .set('Content-Type', 'multipart/form-data; boundary=----test')
      .send('------test--')
      .expect(200);
  });

  it('allows multipart on /api/deal/123/action/upload_invoice', async () => {
    await request(app)
      .post('/api/deal/123/action/upload_invoice')
      .set('Content-Type', 'multipart/form-data; boundary=----test')
      .send('------test--')
      .expect(200);
  });

  it('blocks multipart on other deal actions', async () => {
    await request(app)
      .post('/api/deal/123/action/other_action')
      .set('Content-Type', 'multipart/form-data; boundary=----test')
      .send('------test--')
      .expect(415);
  });
});


