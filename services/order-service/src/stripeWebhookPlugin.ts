import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { Order } from './models/Order.js';
import { ProcessedStripeEvent } from './models/ProcessedStripeEvent.js';
import { finalizePaidOrder } from './finalizePaidOrder.js';

function isMongoDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000;
}

export async function registerStripeWebhook(fastify: FastifyInstance, opts: { stripe: Stripe; webhookSecret: string }) {
  const { stripe, webhookSecret } = opts;

  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  fastify.post('/stripe', async (request, reply) => {
    const sig = request.headers['stripe-signature'];
    if (typeof sig !== 'string') {
      return reply.status(400).send({ error: 'Missing stripe-signature' });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(request.body as Buffer, sig, webhookSecret);
    } catch (err) {
      fastify.log.warn({ err }, 'Stripe webhook signature verification failed');
      return reply.status(400).send({ error: 'Invalid signature' });
    }

    if (event.type !== 'payment_intent.succeeded') {
      return reply.status(200).send({ received: true });
    }

    let lockInserted = false;
    try {
      await ProcessedStripeEvent.create({ eventId: event.id, eventType: event.type });
      lockInserted = true;
    } catch (err) {
      if (isMongoDuplicateKey(err)) {
        fastify.log.info({ eventId: event.id }, 'Stripe webhook duplicate event.id, ack without reprocessing');
        return reply.status(200).send({ received: true, duplicate: true });
      }
      throw err;
    }

    try {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.orderId;
      const userId = pi.metadata?.userId;
      if (!orderId || !userId) {
        fastify.log.warn({ pi: pi.id }, 'payment_intent.succeeded missing metadata');
        await ProcessedStripeEvent.deleteOne({ eventId: event.id }).catch(() => {});
        return reply.status(200).send({ received: true });
      }

      const order = await Order.findOne({ _id: orderId, userId });
      if (!order) {
        fastify.log.error({ orderId }, 'Webhook: order not found');
        await ProcessedStripeEvent.deleteOne({ eventId: event.id }).catch(() => {});
        return reply.status(200).send({ received: true });
      }

      const expectedCents = Math.round(order.totalAmount * 100);
      if (pi.amount_received !== expectedCents && pi.amount !== expectedCents) {
        fastify.log.error(
          { orderId, expectedCents, amount: pi.amount, received: pi.amount_received },
          'Webhook: amount mismatch'
        );
        await ProcessedStripeEvent.deleteOne({ eventId: event.id }).catch(() => {});
        return reply.status(200).send({ received: true, ignored: 'amount_mismatch' });
      }

      await finalizePaidOrder(fastify.log, String(order._id), { paymentIntentId: pi.id });
      return reply.status(200).send({ received: true });
    } catch (err) {
      if (lockInserted) {
        await ProcessedStripeEvent.deleteOne({ eventId: event.id }).catch(() => {});
      }
      throw err;
    }
  });
}
