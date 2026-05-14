import express, { Router } from 'express';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import * as marketNewsController from '../controllers/marketNewsController';

const router: Router = express.Router();

router.get('/', marketNewsController.getList);
router.post('/', adminAuthMiddleware, marketNewsController.create);
router.post('/upload-image', adminAuthMiddleware, marketNewsController.multerUploadMarketNewsImage, marketNewsController.uploadImage);
router.put('/:id', adminAuthMiddleware, marketNewsController.update);
router.delete('/:id', adminAuthMiddleware, marketNewsController.remove);

export default router;
