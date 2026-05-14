import Fastify from 'fastify';
import { isStoneeStaffRole } from '@stonee/shared-types';

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => ({ status: 'ok', service: 'notification-service' }));

// Helper: Simulate Telegram Message Dispatch
const sendTelegramMessage = async (message: string) => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (BOT_TOKEN && CHAT_ID) {
    // Real integration would use fetch/axios here
    console.log(`[TELEGRAM PUSH] Sending to ${CHAT_ID} via Bot...`);
  }

  // Visual simulation in logs for the USER
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║            💎 STONEE NEW ORDER ALERT 💎                ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(message);
  console.log('╚════════════════════════════════════════════════════════════╝\n');
};

// Operational Log Buffer
const NOTIFICATION_LOG: any[] = [];
const LOG_LIMIT = 50;

// 1. Unified Notification Endpoint
fastify.post('/notify', async (request, reply) => {
  const payload = request.body as any;
  const { type, orderId, status, totalAmount, items, userEmail } = payload;
  
  let telegramMessage = '';

  // Add to operational buffer
  NOTIFICATION_LOG.unshift({
    ...payload,
    receivedAt: new Date().toISOString(),
    id: Math.random().toString(36).substring(7)
  });
  if (NOTIFICATION_LOG.length > LOG_LIMIT) NOTIFICATION_LOG.pop();

  if (type === 'ORDER_CREATED') {
    telegramMessage = 
      ` 📦 ORDER RECEIVED: #${orderId.toString().substring(0, 8)}\n` +
      ` 👤 CUSTOMER: ${userEmail || 'New Client'}\n` +
      ` 💰 TOTAL: $${totalAmount?.toLocaleString()}\n` +
      ` 💍 ITEMS: ${items}\n\n` +
      ` Action: Review in Merchant Portal.`;
  } else if (type === 'ORDER_STATUS_UPDATE') {
    telegramMessage = 
      ` 🚚 STATUS UPDATE: #${orderId.toString().substring(0, 8)}\n` +
      ` 🔄 NEW STATUS: ${status}\n` +
      ` 👤 NOTIFIED: ${userEmail}\n\n` +
      ` Logistics: Fulfillment in progress.`;
  }

  if (telegramMessage) {
    await sendTelegramMessage(telegramMessage);
  }

  return { success: true };
});

fastify.get('/logs', async (request, reply) => {
    const role = request.headers['x-user-role'] as string | undefined;
    if (!isStoneeStaffRole(role)) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }
    return { success: true, data: NOTIFICATION_LOG };
  });

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
