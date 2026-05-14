import Fastify from 'fastify';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import { canEditOrderStatus, canViewAllOrders, isSupplierRole, catalogSupplierIdForCompany } from '@stonee/shared-types';
import { Cart } from './models/Cart.js';
import { Order, IOrderItem, OrderStatus } from './models/Order.js';
import axios from 'axios';
import { finalizePaidOrder } from './finalizePaidOrder.js';
import { registerStripeWebhook } from './stripeWebhookPlugin.js';
import { assertKycForHighTicketOrder } from './kycGate.js';

/** Maps UI checkout keys (`street`, `postalCode`) to persisted Order schema (`addressLine1`, `zipCode`). */
function normalizeShippingAddress(raw: unknown): {
  fullName: string;
  addressLine1: string;
  city: string;
  country: string;
  zipCode: string;
} {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
  const addressLine1 = str('addressLine1') || str('street');
  const zipCode = str('zipCode') || str('postalCode');
  return {
    fullName: str('fullName'),
    addressLine1,
    city: str('city'),
    country: str('country'),
    zipCode,
  };
}

const fastify = Fastify({ logger: true });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongodb:27017/stonee_orders';
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://catalog-service:3000';
const INTERNAL = process.env.STONEE_INTERNAL_SECRET || '';
const PRICING_SERVICE_URL = process.env.PRICING_SERVICE_URL || 'http://pricing-service:3000';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3000';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const allowSimulatedPay =
  process.env.STRIPE_ALLOW_SIMULATED_PAY === 'true' || STRIPE_SECRET.length === 0;
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null;

// 1. GET /cart/:sessionId -> Get current cart
fastify.get<{ Params: { sessionId: string } }>('/cart/:sessionId', async (request, reply) => {
  try {
    const query = { sessionId: request.params.sessionId };
    
    // Find cart by sessionId
    const cart = await Cart.findOne(query);
    return { success: true, data: cart || { items: [], totalAmount: 0 } };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Failed to fetch cart' });
  }
});

// 1.1 GET /my-orders -> Get orders for current user
fastify.get('/my-orders', async (request, reply) => {
  try {
    const userId = request.headers['x-user-id'] as string;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const orders = await Order.find({ userId }).sort({ createdAt: -1 });
    return { success: true, data: orders };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Failed to fetch orders' });
  }
});

// 1.1b GET /my-orders/:id -> Single order (owner only)
fastify.get<{ Params: { id: string } }>('/my-orders/:id', async (request, reply) => {
  try {
    const userId = request.headers['x-user-id'] as string;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    if (!mongoose.Types.ObjectId.isValid(request.params.id)) {
      return reply.status(400).send({ success: false, error: 'Invalid order id' });
    }

    const order = await Order.findOne({ _id: request.params.id, userId });
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' });

    return { success: true, data: order };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Failed to fetch order' });
  }
});

// 1.1c GET /supplier/orders — orders that include at least one diamond from this supplier company (SKU → catalog supplierId).
fastify.get('/supplier/orders', async (request, reply) => {
  try {
    const role = request.headers['x-user-role'] as string | undefined;
    const companyId = request.headers['x-supplier-company-id'] as string | undefined;
    if (!isSupplierRole(role) || !companyId?.trim()) {
      return reply.status(403).send({ success: false, error: 'Supplier company scope required' });
    }
    const supplierId = catalogSupplierIdForCompany(companyId.trim());

    const orders = await Order.find({}).sort({ createdAt: -1 }).limit(500).lean();
    const skus = new Set<string>();
    for (const o of orders) {
      for (const it of o.items || []) {
        const item = it as IOrderItem;
        if (item.type === 'diamond') skus.add(item.productId);
        if (item.type === 'bespoke' && item.bespokePair?.diamondId) skus.add(item.bespokePair.diamondId);
      }
    }
    const skuList = [...skus];
    const headers: Record<string, string> = {};
    if (INTERNAL) headers['x-stonee-internal'] = INTERNAL;

    let map: Record<string, string> = {};
    if (skuList.length > 0) {
      const res = await axios.post(
        `${CATALOG_SERVICE_URL}/internal/sku-supplier-map`,
        { skus: skuList },
        { headers, timeout: 45_000 },
      );
      if (res.status >= 400 || !res.data?.success) {
        fastify.log.error({ status: res.status, data: res.data }, 'sku-supplier-map failed');
        return reply.status(502).send({ success: false, error: 'Catalog lookup failed' });
      }
      map = (res.data.data as Record<string, string>) || {};
    }

    const filtered = orders.filter(o => {
      for (const it of o.items || []) {
        const item = it as IOrderItem;
        if (item.type === 'diamond' && map[item.productId] === supplierId) return true;
        if (
          item.type === 'bespoke' &&
          item.bespokePair?.diamondId &&
          map[item.bespokePair.diamondId] === supplierId
        ) {
          return true;
        }
      }
      return false;
    });

    return { success: true, data: filtered };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to fetch supplier orders' });
  }
});

fastify.get<{ Params: { id: string } }>('/supplier/orders/:id', async (request, reply) => {
  try {
    const role = request.headers['x-user-role'] as string | undefined;
    const companyId = request.headers['x-supplier-company-id'] as string | undefined;
    if (!isSupplierRole(role) || !companyId?.trim()) {
      return reply.status(403).send({ success: false, error: 'Supplier company scope required' });
    }
    if (!mongoose.Types.ObjectId.isValid(request.params.id)) {
      return reply.status(400).send({ success: false, error: 'Invalid order id' });
    }
    const supplierId = catalogSupplierIdForCompany(companyId.trim());
    const order = await Order.findById(request.params.id).lean();
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' });

    const skus = new Set<string>();
    for (const it of order.items || []) {
      const item = it as IOrderItem;
      if (item.type === 'diamond') skus.add(item.productId);
      if (item.type === 'bespoke' && item.bespokePair?.diamondId) skus.add(item.bespokePair.diamondId);
    }
    const skuList = [...skus];
    const headers: Record<string, string> = {};
    if (INTERNAL) headers['x-stonee-internal'] = INTERNAL;
    let map: Record<string, string> = {};
    if (skuList.length > 0) {
      const res = await axios.post(
        `${CATALOG_SERVICE_URL}/internal/sku-supplier-map`,
        { skus: skuList },
        { headers, timeout: 45_000 },
      );
      if (res.status >= 400 || !res.data?.success) {
        return reply.status(502).send({ success: false, error: 'Catalog lookup failed' });
      }
      map = (res.data.data as Record<string, string>) || {};
    }
    const touches = (order.items || []).some((it: IOrderItem) => {
      if (it.type === 'diamond') return map[it.productId] === supplierId;
      if (it.type === 'bespoke' && it.bespokePair?.diamondId) return map[it.bespokePair.diamondId] === supplierId;
      return false;
    });
    if (!touches) return reply.status(403).send({ success: false, error: 'Order not visible for this supplier' });

    return { success: true, data: order };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to fetch order' });
  }
});

// 1.2 GET /admin/orders -> Get ALL orders for merchant
fastify.get('/admin/orders', async (request, reply) => {
  try {
    const userRole = request.headers['x-user-role'] as string;
    if (!canViewAllOrders(userRole)) return reply.status(403).send({ error: 'Forbidden' });

    const orders = await Order.find({}).sort({ createdAt: -1 });
    return { success: true, data: orders };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Failed to fetch admin orders' });
  }
});

// 1.3 PATCH /orders/:id/status -> Update order status
fastify.patch<{ Params: { id: string }, Body: { status: OrderStatus } }>('/orders/:id/status', async (request, reply) => {
  try {
    const userRole = request.headers['x-user-role'] as string;
    if (!canEditOrderStatus(userRole)) return reply.status(403).send({ error: 'Forbidden' });

    const { status } = request.body;
    const order = await Order.findByIdAndUpdate(request.params.id, { status }, { new: true });
    
    if (!order) return reply.status(404).send({ error: 'Order not found' });

    // If SHIPPED/CONFIRMED, update catalog availability
    if (status === 'SHIPPED' || status === 'CONFIRMED') {
      const diamondSkus = order.items
        .filter((item: IOrderItem) => item.type === 'diamond' || item.type === 'bespoke')
        .map((item: IOrderItem) => {
           if (item.type === 'diamond') return item.productId;
           if (item.type === 'bespoke') return item.bespokePair?.diamondId;
           return null;
        })
        .filter(Boolean);

      const tasks: Promise<unknown>[] = [];
      if (diamondSkus.length > 0) {
        tasks.push(
          axios
            .patch(
              'http://catalog-service:3000/status-bulk',
              {
                skus: diamondSkus,
                availability: 'sold',
              },
              { timeout: 15_000 }
            )
            .catch((err) => fastify.log.error({ err }, 'Failed to update catalog status'))
        );
      }
      tasks.push(
        axios
          .post(
            'http://notification-service:3000/notify',
            {
              type: 'ORDER_STATUS_UPDATE',
              orderId: order._id,
              status: order.status,
              userEmail: 'Customer',
            },
            { timeout: 8_000 }
          )
          .catch((err) => fastify.log.error({ err }, 'Failed to trigger notification'))
      );
      await Promise.all(tasks);
    }

    return { success: true, data: order };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Status update failed' });
  }
});

interface CartItem {
  id?: string;
  type: 'diamond' | 'jewelry' | 'bespoke';
  productId: string;
  price: number;
  quantity?: number;
  bespokePair?: {
    diamondId: string;
    settingId: string;
  };
}

// 2. POST /cart/:sessionId/add -> Add item (handling bespoke logic)
fastify.post<{ Params: { sessionId: string }, Body: CartItem }>('/cart/:sessionId/add', async (request, reply) => {
  try {
    const { sessionId } = request.params;
    const item = request.body;
    
    // Ensure item has an ID to satisfy ICartItem requirements
    if (!item.id) {
      item.id = new mongoose.Types.ObjectId().toString();
    }
    
    let cart = await Cart.findOne({ sessionId });
    if (!cart) {
      cart = new Cart({ sessionId, items: [], totalAmount: 0 });
    }

    cart.items.push(item as any);
    
    // Recalculate total
    cart.totalAmount = cart.items.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0);
    
    await cart.save();
    return { success: true, data: cart };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Failed to add to cart' });
  }
});

// 2.1 DELETE /cart/:sessionId/item/:productId -> Remove item from cart
fastify.delete<{ Params: { sessionId: string, productId: string } }>('/cart/:sessionId/item/:productId', async (request, reply) => {
  try {
    const { sessionId, productId } = request.params;
    
    let cart = await Cart.findOne({ sessionId });
    if (!cart) return reply.status(404).send({ error: 'Cart not found' });

    // Remove the first occurrence of the productId
    const index = cart.items.findIndex(i => i.productId === productId);
    if (index > -1) {
      cart.items.splice(index, 1);
      cart.totalAmount = cart.items.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0);
      await cart.save();
    }
    
    return { success: true, data: cart };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Failed to remove from cart' });
  }
});

// 3. POST /checkout -> Convert cart to order
fastify.post<{ Body: { sessionId: string, shippingAddress: any } }>('/checkout', async (request, reply) => {
  try {
    const { sessionId, shippingAddress } = request.body;
    const userId = request.headers['x-user-id'] as string; // From Gateway

    if (!userId) return reply.status(401).send({ error: 'Auth required for checkout' });

    const cart = await Cart.findOne({ sessionId });
    if (!cart || cart.items.length === 0) {
      return reply.status(400).send({ error: 'Cart is empty' });
    }

    // 1. Validate prices server-side (bounded latency)
    const priceRes = await axios.post(
      `${PRICING_SERVICE_URL}/validate-prices`,
      { items: cart.items },
      { timeout: 25_000 }
    );
    const { items: validatedItems, totalAmount } = priceRes.data;

    await assertKycForHighTicketOrder(fastify.log, userId, totalAmount);

    const shipping = normalizeShippingAddress(shippingAddress);

    // 2. Create Order
    const order = new Order({
      userId,
      items: validatedItems,
      totalAmount,
      shippingAddress: shipping,
      status: OrderStatus.PENDING
    });

    await order.save();

    // 3–4. Clear cart + notify in parallel (order already persisted)
    await Promise.all([
      Cart.deleteOne({ sessionId }),
      axios
        .post(
          `${NOTIFICATION_SERVICE_URL}/notify`,
          {
            type: 'ORDER_CREATED',
            orderId: order._id,
            userEmail: userId,
            totalAmount,
            items: validatedItems.length,
          },
          { timeout: 8_000 }
        )
        .catch((err) => {
          fastify.log.error({ err }, 'Failed to notify notification-service');
        }),
    ]);

    return { success: true, data: { orderId: String(order._id) } };
  } catch (err) {
    const e = err as { statusCode?: number; message?: string; code?: string };
    if (e.statusCode === 403 && e.code === 'kyc_required') {
      return reply.status(403).send({ error: e.message, code: 'kyc_required' });
    }
    if (e.statusCode === 503 && e.code === 'kyc_unavailable') {
      return reply.status(503).send({ error: e.message ?? 'KYC service unavailable', code: 'kyc_unavailable' });
    }
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Checkout failed' });
  }
});

// 3.05 POST /orders/:id/create-payment-intent -> Stripe (Payment Element)
fastify.post<{ Params: { id: string } }>('/orders/:id/create-payment-intent', async (request, reply) => {
  try {
    if (!stripe) {
      return reply.status(503).send({ error: 'Stripe is not configured (STRIPE_SECRET_KEY)' });
    }

    const userId = request.headers['x-user-id'] as string;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const order = await Order.findOne({ _id: request.params.id, userId });
    if (!order) return reply.status(404).send({ error: 'Order not found' });
    if (order.status !== OrderStatus.PENDING) {
      return reply.status(400).send({ error: 'Order is not awaiting payment' });
    }

    try {
      await assertKycForHighTicketOrder(fastify.log, userId, order.totalAmount);
    } catch (err) {
      const e = err as { statusCode?: number; message?: string; code?: string };
      if (e.statusCode === 403 && e.code === 'kyc_required') {
        return reply.status(403).send({ error: e.message, code: 'kyc_required' });
      }
      if (e.statusCode === 503) {
        return reply.status(503).send({ error: 'KYC service unavailable', code: 'kyc_unavailable' });
      }
      throw err;
    }

    const amountCents = Math.round(order.totalAmount * 100);
    if (amountCents < 50) {
      return reply.status(400).send({ error: 'Amount below Stripe minimum' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        orderId: String(order._id),
        userId,
      },
    });

    order.paymentIntentId = paymentIntent.id;
    await order.save();

    return {
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        amount: order.totalAmount,
        currency: 'usd',
      },
    };
  } catch (err) {
    const e = err as { statusCode?: number; message?: string; code?: string };
    if (e.statusCode === 403 && e.code === 'kyc_required') {
      return reply.status(403).send({ error: e.message, code: 'kyc_required' });
    }
    if (e.statusCode === 503 && e.code === 'kyc_unavailable') {
      return reply.status(503).send({ error: e.message ?? 'KYC service unavailable', code: 'kyc_unavailable' });
    }
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Could not start payment' });
  }
});

// 3.06 POST /orders/:id/confirm-stripe-payment -> Client-side confirmation (idempotent; webhook may also finalize)
fastify.post<{ Params: { id: string } }>('/orders/:id/confirm-stripe-payment', async (request, reply) => {
  try {
    if (!stripe) {
      return reply.status(503).send({ error: 'Stripe is not configured' });
    }
    const userId = request.headers['x-user-id'] as string;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const order = await Order.findOne({ _id: request.params.id, userId });
    if (!order) return reply.status(404).send({ error: 'Order not found' });
    if (order.status !== OrderStatus.PENDING) {
      return { success: true, alreadyConfirmed: true };
    }
    if (!order.paymentIntentId) {
      return reply.status(400).send({ error: 'No payment intent for this order' });
    }

    const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId);
    if (pi.status !== 'succeeded') {
      return reply.status(400).send({ error: `Payment not complete (${pi.status})` });
    }

    const expectedCents = Math.round(order.totalAmount * 100);
    if (pi.amount_received !== expectedCents && pi.amount !== expectedCents) {
      fastify.log.error({ orderId: order._id, expectedCents, pi: pi.id }, 'confirm-stripe amount mismatch');
      return reply.status(400).send({ error: 'amount_mismatch' });
    }

    const fin = await finalizePaidOrder(fastify.log, String(order._id), { paymentIntentId: pi.id });
    const fresh = await Order.findById(order._id);
    return {
      success: true,
      data: fresh,
      meta: { alreadyConfirmed: fin === 'already_paid' },
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Confirm payment failed' });
  }
});

// 3.1 POST /orders/:id/pay -> Dev / smoke simulated settlement (disabled when live Stripe + no override)
fastify.post<{ Params: { id: string } }>('/orders/:id/pay', async (request, reply) => {
  try {
    const userId = request.headers['x-user-id'] as string;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    if (!allowSimulatedPay) {
      return reply.status(400).send({
        error: 'Simulated pay is disabled. Complete checkout with Stripe or set STRIPE_ALLOW_SIMULATED_PAY=true.',
      });
    }

    const order = await Order.findOne({ _id: request.params.id, userId });
    if (!order) return reply.status(404).send({ error: 'Order not found' });

    const result = await finalizePaidOrder(fastify.log, String(order._id));
    if (result === 'already_paid') {
      return reply.status(400).send({ error: 'Order is already processed or paid' });
    }

    const fresh = await Order.findById(order._id);
    return { success: true, data: fresh };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Payment settlement failed' });
  }
});

// 4. Health check
fastify.get('/health', async () => ({ status: 'ok', service: 'order-service' }));

const start = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    fastify.log.info('Order Service connected to MongoDB');

    if (stripe && STRIPE_WEBHOOK_SECRET) {
      await fastify.register(registerStripeWebhook, {
        prefix: '/webhooks',
        stripe,
        webhookSecret: STRIPE_WEBHOOK_SECRET,
      });
      fastify.log.info('Stripe webhook listening on POST /webhooks/stripe');
    } else if (stripe && !STRIPE_WEBHOOK_SECRET) {
      fastify.log.warn('STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing — webhooks disabled');
    }

    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
