import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import multer from 'multer';
import { describe, it, expect } from '@jest/globals';

// Test harness for oversize upload guard using multer
const app = express();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 1024 }, // 1KB limit for the test
  fileFilter: (req, file, cb) => {
    // Accept CSV or Excel-like names
    if (/\.(csv|xlsx|xls)$/i.test(file.originalname)) return cb(null, true);
    cb(new Error('Invalid file type'));
  }
});

app.post('/test/upload', upload.single('file'), (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

// Minimal error handler to map multer oversize to 413
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ message: 'File too large' });
    return;
  }
  res.status(400).json({ message: 'Upload error' });
});

describe('Inventory upload oversize guard', () => {
  it('returns 413 for files exceeding limit', async () => {
    const big = Buffer.alloc(2048, 0x61); // 2KB
    await request(app)
      .post('/test/upload')
      .attach('file', big, { filename: 'big.csv', contentType: 'text/csv' })
      .expect(413);
  });

  it('allows small files under the limit', async () => {
    const small = Buffer.alloc(256, 0x61);
    await request(app)
      .post('/test/upload')
      .attach('file', small, { filename: 'small.csv', contentType: 'text/csv' })
      .expect(200);
  });
});


