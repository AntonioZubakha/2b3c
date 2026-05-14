import Stripe from 'stripe';
import fs from 'fs';
import { logger } from '../utils/logger';

// Helper function to read secrets from files or environment variables
const getSecretFromFile = (envVar: string): string | undefined => {
  const filePath = process.env[`${envVar}_FILE`];
  if (filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (e) {
      logger.error(`[StripeService] Failed to read ${envVar}_FILE:`, { error: e });
    }
  }
  return process.env[envVar];
};

export class StripeService {
  private stripe: Stripe;

  constructor() {
    const stripeSecretKey = getSecretFromFile('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });
  }

  /**
   * Создает Payment Intent для оплаты сделки
   */
  async createPaymentIntent(dealId: string, amount: number, currency: string = 'usd'): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe использует центы
        currency: currency.toLowerCase(),
        metadata: {
          dealId: dealId,
          type: 'deal_payment'
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      logger.info(`[StripeService] Created payment intent for deal ${dealId}: ${paymentIntent.id}`);
      return paymentIntent;
    } catch (error) {
      logger.error(`[StripeService] Failed to create payment intent for deal ${dealId}:`, error);
      throw error;
    }
  }

  /**
   * Получает Payment Intent по ID
   */
  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      logger.error(`[StripeService] Failed to retrieve payment intent ${paymentIntentId}:`, error);
      throw error;
    }
  }

  /**
   * Подтверждает Payment Intent
   */
  async confirmPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.confirm(paymentIntentId);
    } catch (error) {
      logger.error(`[StripeService] Failed to confirm payment intent ${paymentIntentId}:`, error);
      throw error;
    }
  }

  /**
   * Отменяет Payment Intent
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.cancel(paymentIntentId);
    } catch (error) {
      logger.error(`[StripeService] Failed to cancel payment intent ${paymentIntentId}:`, error);
      throw error;
    }
  }

  /**
   * Создает Refund для возврата средств
   */
  async createRefund(paymentIntentId: string, amount?: number, reason?: string): Promise<Stripe.Refund> {
    try {
      const refundData: Stripe.RefundCreateParams = {
        payment_intent: paymentIntentId,
      };

      if (amount) {
        refundData.amount = Math.round(amount * 100);
      }

      if (reason) {
        refundData.reason = reason as Stripe.RefundCreateParams.Reason;
      }

      return await this.stripe.refunds.create(refundData);
    } catch (error) {
      logger.error(`[StripeService] Failed to create refund for payment intent ${paymentIntentId}:`, error);
      throw error;
    }
  }

  /**
   * Верифицирует webhook подпись
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string, webhookSecret: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      logger.error('[StripeService] Webhook signature verification failed:', error);
      throw error;
    }
  }

  /**
   * Получает публичный ключ для фронтенда
   */
  getPublishableKey(): string {
    const publishableKey = getSecretFromFile('STRIPE_PUBLISHABLE_KEY');
    if (!publishableKey) {
      throw new Error('STRIPE_PUBLISHABLE_KEY environment variable is required');
    }
    return publishableKey;
  }
}

// Экспортируем singleton instance
export const stripeService = new StripeService();
