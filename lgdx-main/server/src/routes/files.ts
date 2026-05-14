import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import authMiddleware from '../middleware/auth';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// Do NOT include 'invoices' here: invoices must be served via deal-scoped endpoint with participant checks.
// Do NOT include 'root': never serve arbitrary files from uploads root.
const ALLOWED_CATEGORIES = new Set(['shipping', 'company_logos', 'market_news']);

// Resolve unified uploads root (shared volume)
const uploadsRoot = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(process.cwd(), 'uploads');

// GET /api/files/:category/:filename
router.get('/:category/:filename', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { category, filename } = req.params as { category: string; filename: string };

    if (!ALLOWED_CATEGORIES.has(category)) {
      res.status(400).json({ message: 'Invalid category' });
      return;
    }

    // Prevent path traversal by normalizing and using basename only
    const safeFilename = path.basename(filename);

    const uploadsBase = uploadsRoot;
    const targetDir = category === 'root' ? uploadsBase : path.join(uploadsBase, category);
    const resolved = path.join(targetDir, safeFilename);

    // Ensure the resolved path stays within uploads directory
    const normalizedUploads = path.resolve(uploadsBase);
    const normalizedResolved = path.resolve(resolved);
    if (!normalizedResolved.startsWith(normalizedUploads)) {
      res.status(400).json({ message: 'Invalid path' });
      return;
    }

    if (!fs.existsSync(normalizedResolved) || !fs.statSync(normalizedResolved).isFile()) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    res.sendFile(normalizedResolved);
  } catch (err: unknown) {
    res.status(500).json({ message: 'Failed to serve file' });
  }
});

export default router;


