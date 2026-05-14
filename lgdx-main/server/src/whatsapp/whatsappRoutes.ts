import { Router } from 'express';
import { whatsAppWebhookPost, whatsAppWebhookVerify } from './whatsappWebhook.controller';

const router = Router();

router.get('/webhook', whatsAppWebhookVerify);
router.post('/webhook', whatsAppWebhookPost);

export default router;
