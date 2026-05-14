import { Request, Response } from "express";
import fs from "fs";
import { stripeService } from "../services/stripeService";
import Deal from "../models/Deal";
import { DEAL_STATUSES, ACTIVITY_LOG_ACTIONS } from "../types/constants";
import { logger } from "../utils/logger";
import { sendDealChangeNotification } from "../utils/telegramBot";

// Helper function to read secrets from files or environment variables
const getSecretFromFile = (envVar: string): string | undefined => {
  const filePath = process.env[`${envVar}_FILE`];
  if (filePath) {
    try {
      return fs.readFileSync(filePath, "utf8").trim();
    } catch (e) {
      logger.error(`[StripeWebhook] Failed to read ${envVar}_FILE:`, {
        error: e,
      });
    }
  }
  return process.env[envVar];
};

/**
 * Обрабатывает webhook события от Stripe
 */
export const handleStripeWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = getSecretFromFile("STRIPE_WEBHOOK_SECRET");

  if (!webhookSecret) {
    logger.error("[StripeWebhook] STRIPE_WEBHOOK_SECRET not configured");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  let event;

  try {
    event = stripeService.verifyWebhookSignature(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error("[StripeWebhook] Webhook signature verification failed:", err);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  logger.info(`[StripeWebhook] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object);
        break;

      case "payment_intent.canceled":
        await handlePaymentIntentCanceled(event.data.object);
        break;

      case "charge.dispute.created":
        await handleChargeDisputeCreated(event.data.object);
        break;

      default:
        logger.info(`[StripeWebhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error("[StripeWebhook] Error processing webhook:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
};

/**
 * Обрабатывает успешный платеж
 *
 * Uses atomic findOneAndUpdate with stage+status condition to:
 *  1. Prevent duplicate processing (idempotency) — Stripe may fire the same event multiple times.
 *  2. Prevent race condition with the checkPaymentStatus polling endpoint.
 *  3. Guard against applying payment to a deal in an unexpected state.
 */
async function handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
  const dealId = paymentIntent.metadata?.dealId;

  if (!dealId) {
    logger.warn(
      "[StripeWebhook] Payment intent succeeded but no dealId in metadata",
    );
    return;
  }

  try {
    // Atomic update: only transitions the deal if it is still awaiting payment.
    // If the webhook fires twice, or races with checkPaymentStatus, only one write wins.
    const deal = await Deal.findOneAndUpdate(
      {
        _id: dealId,
        stage: "payment_delivery",
        status: DEAL_STATUSES.AWAITING_PAYMENT,
      },
      {
        $set: {
          status: DEAL_STATUSES.PAYMENT_RECEIVED,
          "paymentDetails.stripeStatus": paymentIntent.status,
          "paymentDetails.stripeChargeId": paymentIntent.latest_charge,
          "paymentDetails.status": "paid",
          "paymentDetails.method": "stripe",
          "paymentDetails.paymentDate": new Date(),
          "paymentDetails.amountPaid": paymentIntent.amount / 100,
          "paymentDetails.transactionId": paymentIntent.id,
        },
        $push: {
          activityLog: {
            action: ACTIVITY_LOG_ACTIONS.PAYMENT_VERIFIED,
            timestamp: new Date(),
            // performedBy intentionally absent — automated Stripe webhook event
            details: `[System] Payment received via Stripe (${paymentIntent.id})`,
          },
        },
      },
      { new: true },
    );

    if (!deal) {
      // Atomic condition did not match — investigate why
      const existing = await Deal.findById(dealId)
        .select("status stage")
        .lean();
      if (!existing) {
        logger.error(
          `[StripeWebhook] Deal ${dealId} not found for payment intent ${paymentIntent.id}`,
        );
      } else if (existing.status === DEAL_STATUSES.PAYMENT_RECEIVED) {
        logger.info(
          `[StripeWebhook] Deal ${dealId} already in payment_received — duplicate event, skipping`,
        );
      } else {
        logger.warn(
          `[StripeWebhook] Deal ${dealId} in unexpected state (${existing.stage}/${existing.status}), skipping payment update`,
        );
      }
      return;
    }

    // Send Telegram notification for payment received
    try {
      sendDealChangeNotification({
        dealNumber: deal.dealNumber,
        dealId: deal._id.toString(),
        oldStatus: DEAL_STATUSES.AWAITING_PAYMENT,
        newStatus: deal.status,
        changedBy: "System (Stripe Webhook)",
        changeType: "status",
        additionalInfo: `Payment amount: $${(paymentIntent.amount / 100).toFixed(2)}`,
      });
    } catch (error) {
      console.error("Failed to send payment webhook notification:", error);
    }

    logger.info(
      `[StripeWebhook] Deal ${dealId} payment confirmed via Stripe: ${paymentIntent.id}`,
    );
  } catch (error) {
    logger.error(
      `[StripeWebhook] Error processing payment success for deal ${dealId}:`,
      error,
    );
  }
}

/**
 * Обрабатывает неудачный платеж
 */
async function handlePaymentIntentFailed(paymentIntent: any): Promise<void> {
  const dealId = paymentIntent.metadata?.dealId;

  if (!dealId) {
    logger.warn(
      "[StripeWebhook] Payment intent failed but no dealId in metadata",
    );
    return;
  }

  try {
    const deal = await Deal.findById(dealId);
    if (!deal) {
      logger.error(
        `[StripeWebhook] Deal ${dealId} not found for failed payment intent ${paymentIntent.id}`,
      );
      return;
    }

    // Обновляем статус платежа
    if (!deal.paymentDetails) {
      deal.paymentDetails = {};
    }

    deal.paymentDetails.stripeStatus = paymentIntent.status;
    deal.paymentDetails.status = "failed";

    // Добавляем запись в лог активности
    deal.activityLog.push({
      action: "payment_failed",
      timestamp: new Date(),
      details: `Payment failed via Stripe (${paymentIntent.id}): ${paymentIntent.last_payment_error?.message || "Unknown error"}`,
    });

    await deal.save();

    logger.info(
      `[StripeWebhook] Deal ${dealId} payment failed via Stripe: ${paymentIntent.id}`,
    );
  } catch (error) {
    logger.error(
      `[StripeWebhook] Error processing payment failure for deal ${dealId}:`,
      error,
    );
  }
}

/**
 * Обрабатывает отмененный платеж
 */
async function handlePaymentIntentCanceled(paymentIntent: any): Promise<void> {
  const dealId = paymentIntent.metadata?.dealId;

  if (!dealId) {
    logger.warn(
      "[StripeWebhook] Payment intent canceled but no dealId in metadata",
    );
    return;
  }

  try {
    const deal = await Deal.findById(dealId);
    if (!deal) {
      logger.error(
        `[StripeWebhook] Deal ${dealId} not found for canceled payment intent ${paymentIntent.id}`,
      );
      return;
    }

    // Обновляем статус платежа
    if (!deal.paymentDetails) {
      deal.paymentDetails = {};
    }

    deal.paymentDetails.stripeStatus = paymentIntent.status;
    deal.paymentDetails.status = "canceled";

    // Добавляем запись в лог активности
    deal.activityLog.push({
      action: "payment_canceled",
      timestamp: new Date(),
      details: `Payment canceled via Stripe (${paymentIntent.id})`,
    });

    await deal.save();

    logger.info(
      `[StripeWebhook] Deal ${dealId} payment canceled via Stripe: ${paymentIntent.id}`,
    );
  } catch (error) {
    logger.error(
      `[StripeWebhook] Error processing payment cancellation for deal ${dealId}:`,
      error,
    );
  }
}

/**
 * Обрабатывает спор по платежу
 */
async function handleChargeDisputeCreated(dispute: any): Promise<void> {
  const paymentIntentId = dispute.payment_intent;

  if (!paymentIntentId) {
    logger.warn(
      "[StripeWebhook] Dispute created but no payment_intent in dispute object",
    );
    return;
  }

  try {
    // Находим сделку по Payment Intent ID
    const deal = await Deal.findOne({
      "paymentDetails.stripePaymentIntentId": paymentIntentId,
    });

    if (!deal) {
      logger.error(
        `[StripeWebhook] Deal not found for dispute on payment intent ${paymentIntentId}`,
      );
      return;
    }

    // Добавляем запись в лог активности
    deal.activityLog.push({
      action: "payment_disputed",
      timestamp: new Date(),
      details: `Payment disputed via Stripe (${dispute.id}): ${dispute.reason}`,
    });

    await deal.save();

    logger.info(
      `[StripeWebhook] Deal ${deal._id} payment disputed via Stripe: ${dispute.id}`,
    );
  } catch (error) {
    logger.error(
      `[StripeWebhook] Error processing dispute for payment intent ${paymentIntentId}:`,
      error,
    );
  }
}
