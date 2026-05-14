import { Router } from 'express';
import { 
  createStripePaymentIntent,
  getPaymentIntentStatus,
  cancelPaymentIntent,
  createRefund,
  getStripePublishableKey,
  checkPaymentStatus
} from '../controllers/stripeController';
import { handleStripeWebhook } from '../controllers/stripeWebhookController';
import auth, { fullAccessMiddleware, lgdealSupervisorOnly as supervisorAuth } from '../middleware/auth';

const router = Router();

// Публичный endpoint для получения публичного ключа
router.get('/publishable-key', getStripePublishableKey);

// Webhook endpoint (не требует аутентификации, но проверяет подпись)
router.post('/webhook', handleStripeWebhook);

// Защищенные endpoints
router.use(auth);

// Создание Payment Intent
router.post('/payment-intent/:dealId', fullAccessMiddleware, createStripePaymentIntent);

// Получение статуса Payment Intent
router.get('/payment-intent/:dealId/status', fullAccessMiddleware, getPaymentIntentStatus);

// Проверка статуса платежа и обновление статуса сделки
router.post('/payment-intent/:dealId/check-status', fullAccessMiddleware, checkPaymentStatus);

// Отмена Payment Intent
router.post('/payment-intent/:dealId/cancel', fullAccessMiddleware, cancelPaymentIntent);

// Создание возврата (только для администраторов)
router.post('/refund/:dealId', supervisorAuth, createRefund);

export default router;
