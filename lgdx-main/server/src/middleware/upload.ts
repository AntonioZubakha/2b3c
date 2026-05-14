import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { logger } from '../utils/logger';

const storage = multer.diskStorage({
    destination: function (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
        try {
            const uploadsRoot = process.env.UPLOAD_PATH
                ? path.resolve(process.env.UPLOAD_PATH)
                : path.join(process.cwd(), 'uploads');
            const dest = path.join(uploadsRoot, 'invoices');

            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
                // Avoid world-writable permissions; Docker/container user should own this directory.
                try { fs.chmodSync(dest, 0o777); } catch {}
                logger.info('Created invoices upload directory');
            }

            cb(null, dest);
        } catch (e) {
            cb(e as Error, '');
        }
    },
    filename: function (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
        const dealId = (req.params as { dealId?: string }).dealId; // Type assertion for dealId
        const fileExt = path.extname(file.originalname);
        const dealIdPart = dealId ? `invoice-${dealId}-` : 'invoice-'; // Handle if dealId is not present
        const fileName = `${dealIdPart}${Date.now()}${fileExt}`;
        cb(null, fileName);
    }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Allow PDF, DOC, DOCX, and common image formats for invoices
    const allowedMimeTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/jpg',
        'image/png'
    ];
    const allowedExt = /\.(pdf|doc|docx|jpe?g|png)$/i;
    
    if (allowedMimeTypes.includes(file.mimetype) && allowedExt.test(file.originalname || '')) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${file.mimetype} not allowed. Only PDF, DOC, DOCX, JPG, and PNG files are accepted.`));
    }
};

export const uploadMiddleware = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

export default uploadMiddleware; 