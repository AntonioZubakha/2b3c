import type { FastifyBaseLogger } from 'fastify';
import axios from 'axios';
import { Order, OrderStatus } from './models/Order.js';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://catalog-service:3000';
const NOTIFY_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3000';

/** Sets order status to **CONFIRMED** in one step from **PENDING** (no intermediate **PAID** in Stripe/simulated/webhook flows). */

export async function finalizePaidOrder(
  log: FastifyBaseLogger,
  orderId: string,
  opts?: { paymentIntentId?: string }
): Promise<'ok' | 'already_paid'> {
  const set: Record<string, unknown> = { status: OrderStatus.CONFIRMED };
  if (opts?.paymentIntentId) set.paymentIntentId = opts.paymentIntentId;

  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: OrderStatus.PENDING },
    { $set: set },
    { new: true }
  );

  if (!order) {
    return 'already_paid';
  }

  const diamondSkus = order.items
    .filter((item: { type: string }) => item.type === 'diamond' || item.type === 'bespoke')
    .map((item: { type: string; productId: string; bespokePair?: { diamondId?: string } }) => {
      if (item.type === 'diamond') return item.productId;
      if (item.type === 'bespoke') return item.bespokePair?.diamondId;
      return null;
    })
    .filter(Boolean) as string[];

  const tasks: Promise<unknown>[] = [];
  if (diamondSkus.length > 0) {
    tasks.push(
      axios
        .patch(
          `${CATALOG_URL}/status-bulk`,
          { skus: diamondSkus, availability: 'sold' },
          { timeout: 15_000 }
        )
        .catch((err) => log.error({ err }, 'Failed to lockdown inventory on payment'))
    );
  }
  tasks.push(
    axios
      .post(
        `${NOTIFY_URL}/notify`,
        {
          type: 'ORDER_STATUS_UPDATE',
          orderId: order._id,
          status: 'CONFIRMED',
          userEmail: order.userId,
        },
        { timeout: 8_000 }
      )
      .catch((err) => log.error({ err }, 'Failed to trigger payment success notification'))
  );
  await Promise.all(tasks);

  return 'ok';
}
