import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Request, Response } from 'express';
import MarketNews from '../models/MarketNews';
import { logger } from '../utils/logger';

const UPLOAD_ROOT = process.env.UPLOAD_PATH ? path.resolve(process.env.UPLOAD_PATH) : path.join(process.cwd(), 'uploads');
const MARKET_NEWS_IMAGES_DIR = path.join(UPLOAD_ROOT, 'market_news');

if (!fs.existsSync(MARKET_NEWS_IMAGES_DIR)) {
  fs.mkdirSync(MARKET_NEWS_IMAGES_DIR, { recursive: true });
}

const normalizeMarketNewsImageUrl = (value?: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('/uploads/market_news/')) {
    return trimmed.replace('/uploads/market_news/', '/api/files/market_news/');
  }
  return trimmed;
};

const marketNewsStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MARKET_NEWS_IMAGES_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safe = (path.basename(file.originalname, path.extname(file.originalname)) || 'image').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80);
    cb(null, `market_news_${Date.now()}_${safe}${ext}`);
  }
});

const imageFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  const allowed = /^image\/(jpeg|jpg|png|gif|webp)$/;
  if (allowed.test(file.mimetype)) return cb(null, true);
  cb(new Error('Only images (JPEG, PNG, GIF, WebP) are allowed'));
};

export const multerUploadMarketNewsImage = multer({
  storage: marketNewsStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter
}).single('image');

/** POST /api/market-news/upload-image — upload image for news (supervisor only); returns { url } */
export const uploadImage = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'No image file uploaded' });
      return;
    }

    const isValidImage = (() => {
      try {
        const fd = fs.openSync(req.file.path, 'r');
        const header = Buffer.alloc(8);
        fs.readSync(fd, header, 0, 8, 0);
        fs.closeSync(fd);
        if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return true; // JPEG
        if (
          header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47 &&
          header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a
        ) return true; // PNG
        if (header.slice(0, 3).toString() === 'GIF') return true; // GIF
        if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) return true; // WebP (RIFF)
        return false;
      } catch {
        return false;
      }
    })();

    if (!isValidImage) {
      try { fs.unlinkSync(req.file.path); } catch {}
      res.status(400).json({ message: 'Invalid image file (magic bytes mismatch).' });
      return;
    }

    const url = `/api/files/market_news/${req.file.filename}`;
    res.status(201).json({ url });
  } catch (err) {
    logger.error('[MarketNews] uploadImage error', { error: err });
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({ message: 'Failed to upload image' });
  }
};

const VALID_CATEGORIES = ['Market Growth', 'Product Trends', 'Operations', 'Pricing', 'Consumer Behavior'];
const VALID_IMPACTS = ['positive', 'negative', 'neutral'] as const;

/** GET /api/market-news — list all news (public) */
export const getList = async (req: Request, res: Response): Promise<void> => {
  try {
    const items = await MarketNews.find()
      .sort({ order: 1, createdAt: -1 })
      .lean();
    const list = items.map((doc) => ({
      id: doc._id.toString(),
      _id: doc._id.toString(),
      title: doc.title,
      summary: doc.summary,
      body: doc.body,
      imageUrl: normalizeMarketNewsImageUrl(doc.imageUrl),
      imageCredit: doc.imageCredit,
      date: doc.date instanceof Date ? doc.date.toISOString().split('T')[0] : String(doc.date).split('T')[0],
      category: doc.category,
      impact: doc.impact
    }));
    res.json(list);
  } catch (err) {
    logger.error('[MarketNews] getList error', { error: err });
    res.status(500).json({ message: 'Failed to fetch market news' });
  }
};

/** POST /api/market-news — create (supervisor only, via admin middleware on route) */
export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, summary, body, imageUrl, imageCredit, date, category, impact } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ message: 'Title is required' });
      return;
    }
    if (!summary || typeof summary !== 'string' || !summary.trim()) {
      res.status(400).json({ message: 'Summary is required' });
      return;
    }
    if (!VALID_CATEGORIES.includes(category)) {
      res.status(400).json({ message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` });
      return;
    }
    if (!VALID_IMPACTS.includes(impact)) {
      res.status(400).json({ message: 'Impact must be positive, negative, or neutral' });
      return;
    }
    const count = await MarketNews.countDocuments();
    const doc = await MarketNews.create({
      title: title.trim(),
      summary: summary.trim(),
      body: typeof body === 'string' ? body.trim() : undefined,
      imageUrl: normalizeMarketNewsImageUrl(imageUrl),
      imageCredit: typeof imageCredit === 'string' ? imageCredit.trim() || undefined : undefined,
      date: date ? new Date(date) : new Date(),
      category: category.trim(),
      impact,
      order: count
    });
    res.status(201).json({
      id: doc._id.toString(),
      _id: doc._id.toString(),
      title: doc.title,
      summary: doc.summary,
      body: doc.body,
      imageUrl: doc.imageUrl,
      imageCredit: doc.imageCredit,
      date: doc.date.toISOString().split('T')[0],
      category: doc.category,
      impact: doc.impact
    });
  } catch (err) {
    logger.error('[MarketNews] create error', { error: err });
    res.status(500).json({ message: 'Failed to create market news' });
  }
};

/** PUT /api/market-news/:id — update (supervisor only) */
export const update = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, summary, body, imageUrl, imageCredit, date, category, impact } = req.body;
    const doc = await MarketNews.findById(id);
    if (!doc) {
      res.status(404).json({ message: 'Market news item not found' });
      return;
    }
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ message: 'Title cannot be empty' });
        return;
      }
      doc.title = title.trim();
    }
    if (summary !== undefined) {
      if (typeof summary !== 'string' || !summary.trim()) {
        res.status(400).json({ message: 'Summary cannot be empty' });
        return;
      }
      doc.summary = summary.trim();
    }
    if (body !== undefined) doc.body = typeof body === 'string' ? body.trim() || undefined : undefined;
    if (imageUrl !== undefined) doc.imageUrl = normalizeMarketNewsImageUrl(imageUrl);
    if (imageCredit !== undefined) doc.imageCredit = typeof imageCredit === 'string' ? imageCredit.trim() || undefined : undefined;
    if (date !== undefined) doc.date = new Date(date);
    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        res.status(400).json({ message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` });
        return;
      }
      doc.category = category.trim();
    }
    if (impact !== undefined) {
      if (!VALID_IMPACTS.includes(impact)) {
        res.status(400).json({ message: 'Impact must be positive, negative, or neutral' });
        return;
      }
      doc.impact = impact;
    }
    await doc.save();
    res.json({
      id: doc._id.toString(),
      _id: doc._id.toString(),
      title: doc.title,
      summary: doc.summary,
      body: doc.body,
      imageUrl: doc.imageUrl,
      imageCredit: doc.imageCredit,
      date: doc.date.toISOString().split('T')[0],
      category: doc.category,
      impact: doc.impact
    });
  } catch (err) {
    logger.error('[MarketNews] update error', { error: err });
    res.status(500).json({ message: 'Failed to update market news' });
  }
};

/** DELETE /api/market-news/:id — delete (supervisor only) */
export const remove = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const doc = await MarketNews.findByIdAndDelete(id);
    if (!doc) {
      res.status(404).json({ message: 'Market news item not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    logger.error('[MarketNews] remove error', { error: err });
    res.status(500).json({ message: 'Failed to delete market news' });
  }
};
