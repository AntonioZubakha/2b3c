import request from 'supertest';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { describe, it, expect } from '@jest/globals';

// Mock app for testing file import security
const createFileImportTestApp = () => {
  const app = express();
  
  // Configure multer with security limits
  const storage = multer.memoryStorage();
  const upload = multer({
    storage,
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB - allow large files for testing
      files: 1
    },
    fileFilter: (req, file, cb) => {
      // Block zip files
      if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
        return cb(new Error('ZIP files are not allowed for security reasons'));
      }
      
      // Allow only specific file types
      const allowedTypes = [
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
        'application/vnd.ms-excel' // XLS
      ];
      
      if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('File type not allowed'));
      }
      
      cb(null, true);
    }
  });
  
  // Test endpoints
  app.post('/api/test-import', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }
      
      // Simulate file processing with row/byte limits
      const maxRows = parseInt(process.env.MAX_IMPORT_ROWS || '20000');
      const maxBytes = parseInt(process.env.MAX_IMPORT_BYTES || '52428800'); // 50MB
      
      // Ensure we have valid numbers
      if (isNaN(maxRows) || isNaN(maxBytes)) {
        res.status(500).json({ error: 'Invalid configuration' });
        return;
      }
      
      // Check file size
      if (req.file.size > maxBytes) {
        res.status(413).json({ 
          error: 'File too large',
          maxBytes,
          actualBytes: req.file.size
        });
        return;
      }
      
      // Simulate row counting (in real app, this would parse the file)
      const estimatedRows = Math.ceil(req.file.size / 100); // Rough estimate
      if (estimatedRows > maxRows) {
        res.status(413).json({ 
          error: 'Too many rows',
          maxRows,
          estimatedRows
        });
        return;
      }
      
      res.json({ 
        message: 'File processed successfully',
        filename: req.file.originalname || 'unknown',
        size: req.file.size,
        estimatedRows
      });
      
    } catch (error) {
      res.status(500).json({ error: 'Processing failed' });
    }
  });
  
  // Error handling middleware
  app.use((error: any, req: any, res: any, next: any) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large' });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }
    
    if (error.message === 'ZIP files are not allowed for security reasons') {
      res.status(415).json({ error: 'ZIP files are not allowed for security reasons' });
      return;
    }
    
    if (error.message === 'File type not allowed') {
      res.status(415).json({ error: 'File type not allowed' });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  });
  
  return app;
};

describe('File Import Security Tests', () => {
  const app = createFileImportTestApp();
  
  describe('ZIP Bomb Protection', () => {
    it('should reject ZIP files', async () => {
      const response = await request(app)
        .post('/api/test-import')
        .attach('file', Buffer.from('fake zip content'), 'test.zip')
        .expect(415);
      
      expect(response.body.error).toBe('ZIP files are not allowed for security reasons');
    });
    
    it('should reject ZIP files with different MIME types', async () => {
      const response = await request(app)
        .post('/api/test-import')
        .attach('file', Buffer.from('fake content'), 'test.zip')
        .expect(415);
      
      expect(response.body.error).toBe('ZIP files are not allowed for security reasons');
    });
  });
  
  describe('File Size Limits', () => {
    it('should reject files exceeding size limit', async () => {
      // Create a file larger than 50MB
      const largeBuffer = Buffer.alloc(60 * 1024 * 1024); // 60MB
      
      const response = await request(app)
        .post('/api/test-import')
        .attach('file', largeBuffer, 'large.csv')
        .expect(413);
      
      expect(response.body.error).toBe('File too large');
      expect(response.body.maxBytes).toBe(52428800);
      expect(response.body.actualBytes).toBe(60 * 1024 * 1024);
    });
    
    it('should accept files within size limit', async () => {
      const normalBuffer = Buffer.alloc(1024 * 1024); // 1MB
      
      const response = await request(app)
        .post('/api/test-import')
        .attach('file', normalBuffer, 'normal.csv')
        .expect(200);
      
      expect(response.body.message).toBe('File processed successfully');
      expect(response.body.size).toBe(1024 * 1024);
    });
  });
  
  describe('Row Count Limits', () => {
    it('should reject files with too many estimated rows', async () => {
      // Create a file that would exceed row limit
      // With our estimation of 100 bytes per row, we need >2MB to exceed 20000 rows
      const largeBuffer = Buffer.alloc(3 * 1024 * 1024); // 3MB
      
      const response = await request(app)
        .post('/api/test-import')
        .attach('file', largeBuffer, 'many-rows.csv')
        .expect(413);
      
      expect(response.body.error).toBe('Too many rows');
      expect(response.body.maxRows).toBe(20000);
      expect(response.body.estimatedRows).toBeGreaterThan(20000);
    });
    
    it('should accept files with acceptable row count', async () => {
      const normalBuffer = Buffer.alloc(500 * 1024); // 500KB
      
      const response = await request(app)
        .post('/api/test-import')
        .attach('file', normalBuffer, 'acceptable-rows.csv')
        .expect(200);
      
      expect(response.body.estimatedRows).toBeLessThanOrEqual(20000);
    });
  });
  
  describe('File Type Validation', () => {
    it('should accept CSV files', async () => {
      const csvBuffer = Buffer.from('header1,header2\nvalue1,value2');
      
      const response = await request(app)
        .post('/api/test-import')
        .attach('file', csvBuffer, 'test.csv')
        .expect(200);
      
      expect(response.body.message).toBe('File processed successfully');
    });
    
    it('should accept XLSX files', async () => {
      const xlsxBuffer = Buffer.from('fake xlsx content');
      
      const response = await request(app)
        .post('/api/test-import')
        .attach('file', xlsxBuffer, 'test.xlsx')
        .expect(200);
      
      expect(response.body.message).toBe('File processed successfully');
    });
    
    it('should reject unsupported file types', async () => {
      const txtBuffer = Buffer.from('plain text content');
      
      const response = await request(app)
        .post('/api/test-import')
        .attach('file', txtBuffer, 'test.txt')
        .expect(415);
      
      expect(response.body.error).toBe('File type not allowed');
    });
  });
  
  describe('Environment Variable Configuration', () => {
    it('should respect MAX_IMPORT_ROWS environment variable', async () => {
      const originalMaxRows = process.env.MAX_IMPORT_ROWS;
      
      try {
        process.env.MAX_IMPORT_ROWS = '1000';
        const app2 = createFileImportTestApp();
        
        // Test with a file that would exceed 1000 rows
        // With our estimation of 100 bytes per row, we need >100KB to exceed 1000 rows
        const buffer = Buffer.alloc(150 * 1024); // 150KB
        
        const response = await request(app2)
          .post('/api/test-import')
          .attach('file', buffer, 'test.csv')
          .expect(413);
        
        expect(response.body.maxRows).toBe(1000);
      } finally {
        if (originalMaxRows) {
          process.env.MAX_IMPORT_ROWS = originalMaxRows;
        } else {
          delete process.env.MAX_IMPORT_ROWS;
        }
      }
    });
    
    it('should respect MAX_IMPORT_BYTES environment variable', async () => {
      const originalMaxBytes = process.env.MAX_IMPORT_BYTES;
      
      try {
        process.env.MAX_IMPORT_BYTES = '1048576'; // 1MB
        
        const app2 = createFileImportTestApp();
        
        // Test with a file larger than 1MB
        const buffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
        
        const response = await request(app2)
          .post('/api/test-import')
          .attach('file', buffer, 'test.csv')
          .expect(413);
        
        expect(response.body.maxBytes).toBe(1048576);
      } finally {
        if (originalMaxBytes) {
          process.env.MAX_IMPORT_BYTES = originalMaxBytes;
        } else {
          delete process.env.MAX_IMPORT_BYTES;
        }
      }
    });
  });
});
