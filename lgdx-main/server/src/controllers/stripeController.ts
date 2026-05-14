import { Request, Response } from "express";
import { AuthenticatedRequest } from "../types/api";
import { stripeService } from "../services/stripeService";
import Deal from "../models/Deal";
import Company from "../models/Company";
import { DEAL_STATUSES } from "../types/constants";
import { logger } from "../utils/logger";
import { getErrorMessage, getErrorStatusCode } from "../utils/errorHelpers";
import {
  ValidationError as BadRequestError,
  NotFoundError,
  ForbiddenError,
  asyncHandler,
} from "../middleware/errorHandler";
import { sendDealChangeNotification } from "../utils/telegramBot";
import { toObjectIdString } from "../types/mongoose-helpers";

/**
 * Создает Payment Intent для оплаты сделки через Stripe
 */
export const createStripePaymentIntent = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dealId } = req.params;
      const { amount, currency = "usd" } = req.body;
      const authReq = req as AuthenticatedRequest;

      if (!authReq.user) {
        throw new ForbiddenError("User not authenticated");
      }

      // Получаем сделку
      const deal = await Deal.findById(dealId);
      if (!deal) {
        throw new NotFoundError("Deal not found");
      }

      // Проверяем права доступа - только покупатель может оплачивать
      const buyerIdString = toObjectIdString(deal.buyerId);
      const userIsBuyer = buyerIdString === authReq.user.userId;
      const isLgdealBuyer =
        authReq.user.isLgdealSupervisor && deal.dealType === "buyer-to-lgdeal";

      if (!userIsBuyer && !isLgdealBuyer) {
        throw new ForbiddenError(
          "Only the buyer can initiate payment for this deal",
        );
      }

      // Проверяем статус сделки - должен быть awaiting_payment (после принятия инвойса)
      if (deal.status !== DEAL_STATUSES.AWAITING_PAYMENT) {
        throw new BadRequestError(
          "Payment can only be initiated when deal status is awaiting_payment",
        );
      }

      // Проверяем, что продавец на этой сделке принимает Stripe-платежи.
      // Для buyer-to-lgdeal сделок sellerCompanyId — это LGDeal INC,
      // и если у неё в настройках выключен Stripe, платёж создавать нельзя.
      if (deal.sellerCompanyId) {
        const sellerCompany = await Company.findById(deal.sellerCompanyId)
          .select("paymentSettings name")
          .lean();
        if (sellerCompany?.paymentSettings?.stripeEnabled === false) {
          logger.info(
            `[StripeController] Stripe payments are disabled for seller company ${sellerCompany.name} (deal ${dealId}) — rejecting payment intent creation`,
          );
          throw new BadRequestError(
            "Stripe payments are currently unavailable for this deal. Please use bank transfer.",
          );
        }
      }

      // Проверяем, что инвойс был загружен
      if (!deal.paymentDetails?.invoiceFilename) {
        throw new BadRequestError(
          "Invoice must be uploaded before payment can be initiated",
        );
      }

      // Проверяем, что сумма соответствует сумме сделки
      if (amount && Math.abs(amount - deal.amount) > 0.01) {
        throw new BadRequestError("Payment amount does not match deal amount");
      }

      const paymentAmount = amount || deal.amount;

      // Reuse existing Payment Intent if still in a confirmable state (Stripe best practice: avoid orphan PIs)
      let paymentIntent: Awaited<
        ReturnType<typeof stripeService.getPaymentIntent>
      >;
      const existingPiId = deal.paymentDetails?.stripePaymentIntentId;
      if (existingPiId) {
        try {
          const existing = await stripeService.getPaymentIntent(existingPiId);
          const reusable = [
            "requires_payment_method",
            "requires_confirmation",
            "requires_action",
          ].includes(existing.status);
          if (
            reusable &&
            existing.amount === Math.round(paymentAmount * 100) &&
            existing.currency === currency.toLowerCase()
          ) {
            paymentIntent = existing;
          } else {
            paymentIntent = await stripeService.createPaymentIntent(
              dealId,
              paymentAmount,
              currency,
            );
          }
        } catch {
          paymentIntent = await stripeService.createPaymentIntent(
            dealId,
            paymentAmount,
            currency,
          );
        }
      } else {
        paymentIntent = await stripeService.createPaymentIntent(
          dealId,
          paymentAmount,
          currency,
        );
      }

      // Обновляем детали платежа в сделке
      if (!deal.paymentDetails) {
        deal.paymentDetails = {};
      }

      deal.paymentDetails.stripePaymentIntentId = paymentIntent.id;
      deal.paymentDetails.stripeClientSecret =
        paymentIntent.client_secret || undefined;
      deal.paymentDetails.stripeStatus = paymentIntent.status;
      deal.paymentDetails.method = "stripe";

      await deal.save();

      logger.info(
        `[StripeController] Created payment intent for deal ${dealId}: ${paymentIntent.id}`,
      );

      res.json({
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
        },
      });
    } catch (error: any) {
      logger.error("[StripeController] Error creating payment intent:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to create payment intent",
      });
    }
  },
);

/**
 * Получает статус Payment Intent
 */
export const getPaymentIntentStatus = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dealId } = req.params;
      const authReq = req as AuthenticatedRequest;

      if (!authReq.user) {
        throw new ForbiddenError("User not authenticated");
      }

      const deal = await Deal.findById(dealId);
      if (!deal) {
        throw new NotFoundError("Deal not found");
      }

      if (!deal.paymentDetails?.stripePaymentIntentId) {
        throw new BadRequestError(
          "No Stripe payment intent found for this deal",
        );
      }

      const paymentIntent = await stripeService.getPaymentIntent(
        deal.paymentDetails.stripePaymentIntentId,
      );

      res.json({
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          charges: (paymentIntent as { charges?: { data?: unknown } }).charges
            ?.data,
        },
      });
    } catch (error: unknown) {
      logger.error(
        "[StripeController] Error getting payment intent status:",
        error,
      );
      res.status(getErrorStatusCode(error)).json({
        success: false,
        message: getErrorMessage(error, "Failed to get payment intent status"),
      });
    }
  },
);

/**
 * Отменяет Payment Intent
 */
export const cancelPaymentIntent = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dealId } = req.params;
      const authReq = req as AuthenticatedRequest;

      if (!authReq.user) {
        throw new ForbiddenError("User not authenticated");
      }

      const deal = await Deal.findById(dealId);
      if (!deal) {
        throw new NotFoundError("Deal not found");
      }

      if (!deal.paymentDetails?.stripePaymentIntentId) {
        throw new BadRequestError(
          "No Stripe payment intent found for this deal",
        );
      }

      const paymentIntent = await stripeService.cancelPaymentIntent(
        deal.paymentDetails.stripePaymentIntentId,
      );

      // Обновляем статус в сделке
      deal.paymentDetails.stripeStatus = paymentIntent.status;
      await deal.save();

      logger.info(
        `[StripeController] Cancelled payment intent for deal ${dealId}: ${paymentIntent.id}`,
      );

      res.json({
        success: true,
        message: "Payment intent cancelled successfully",
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
        },
      });
    } catch (error: unknown) {
      logger.error(
        "[StripeController] Error cancelling payment intent:",
        error,
      );
      res.status(getErrorStatusCode(error)).json({
        success: false,
        message: getErrorMessage(error, "Failed to cancel payment intent"),
      });
    }
  },
);

/**
 * Создает возврат средств
 */
export const createRefund = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dealId } = req.params;
      const { amount, reason } = req.body;
      const authReq = req as AuthenticatedRequest;

      if (!authReq.user) {
        throw new ForbiddenError("User not authenticated");
      }

      // Проверяем права администратора
      if (!authReq.user.isLgdealSupervisor) {
        throw new ForbiddenError("Only administrators can create refunds");
      }

      const deal = await Deal.findById(dealId);
      if (!deal) {
        throw new NotFoundError("Deal not found");
      }

      if (!deal.paymentDetails?.stripePaymentIntentId) {
        throw new BadRequestError(
          "No Stripe payment intent found for this deal",
        );
      }

      // Validate partial refund amount (Stripe expects cents; we receive dollars from client)
      const amountPaidCents =
        deal.paymentDetails.amountPaid != null
          ? Math.round(deal.paymentDetails.amountPaid * 100)
          : null;
      if (amount != null) {
        if (amount <= 0)
          throw new BadRequestError("Refund amount must be positive");
        if (
          amountPaidCents != null &&
          Math.round(amount * 100) > amountPaidCents
        ) {
          throw new BadRequestError("Refund amount cannot exceed amount paid");
        }
      }

      const refund = await stripeService.createRefund(
        deal.paymentDetails.stripePaymentIntentId,
        amount,
        reason,
      );

      // Обновляем детали платежа
      deal.paymentDetails.stripeRefundId = refund.id;
      deal.paymentDetails.stripeStatus = "refunded";
      await deal.save();

      logger.info(
        `[StripeController] Created refund for deal ${dealId}: ${refund.id}`,
      );

      res.json({
        success: true,
        message: "Refund created successfully",
        refund: {
          id: refund.id,
          amount: refund.amount,
          status: refund.status,
          reason: refund.reason,
        },
      });
    } catch (error: unknown) {
      logger.error("[StripeController] Error creating refund:", error);
      res.status(getErrorStatusCode(error)).json({
        success: false,
        message: getErrorMessage(error, "Failed to create refund"),
      });
    }
  },
);

/**
 * Проверяет статус платежа и обновляет статус сделки при необходимости
 */
export const checkPaymentStatus = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dealId } = req.params;
      const authReq = req as AuthenticatedRequest;

      if (!authReq.user) {
        throw new ForbiddenError("User not authenticated");
      }

      const deal = await Deal.findById(dealId);
      if (!deal) {
        throw new NotFoundError("Deal not found");
      }

      if (!deal.paymentDetails?.stripePaymentIntentId) {
        throw new BadRequestError(
          "No Stripe payment intent found for this deal",
        );
      }

      const paymentIntent = await stripeService.getPaymentIntent(
        deal.paymentDetails.stripePaymentIntentId,
      );

      // Track the status we'll return to the client
      let currentDealStatus = deal.status;

      if (paymentIntent.status === "succeeded") {
        // Atomic update: only transitions the deal if it is still in awaiting_payment.
        // This prevents a double-write race between this polling call and the Stripe webhook
        // (both would otherwise do findById → mutate → save independently).
        const updated = await Deal.findOneAndUpdate(
          { _id: dealId, status: DEAL_STATUSES.AWAITING_PAYMENT },
          {
            $set: {
              status: DEAL_STATUSES.PAYMENT_RECEIVED,
              "paymentDetails.stripeStatus": paymentIntent.status,
              "paymentDetails.status": "paid",
              "paymentDetails.paymentDate": new Date(),
              "paymentDetails.amountPaid": paymentIntent.amount / 100,
              "paymentDetails.transactionId": paymentIntent.id,
            },
            $push: {
              activityLog: {
                action: "payment_verified",
                timestamp: new Date(),
                // performedBy intentionally absent — automated Stripe polling event
                details: `[System] Payment confirmed via Stripe polling (${paymentIntent.id})`,
              },
            },
          },
          { new: true },
        );

        if (updated) {
          // We won the race — notify and log
          currentDealStatus = updated.status;
          try {
            sendDealChangeNotification({
              dealNumber: updated.dealNumber,
              dealId: updated._id.toString(),
              oldStatus: DEAL_STATUSES.AWAITING_PAYMENT,
              newStatus: updated.status,
              changedBy: "System (Stripe Payment)",
              changeType: "status",
              additionalInfo: `Payment amount: $${(paymentIntent.amount / 100).toFixed(2)}`,
            });
          } catch (error) {
            console.error("Failed to send payment notification:", error);
          }
          logger.info(
            `[StripeController] Deal ${dealId} payment confirmed and status updated to payment_received`,
          );
        } else {
          // findOneAndUpdate returned null — deal was already transitioned by the webhook
          // (or was cancelled/rejected). Fetch the current status to return to the client.
          const refreshed = await Deal.findById(dealId).select("status").lean();
          if (refreshed) currentDealStatus = (refreshed as any).status;
          logger.info(
            `[StripeController] Deal ${dealId} already processed by webhook (current: ${currentDealStatus}), skipping duplicate update`,
          );
        }
      } else {
        // Payment not yet succeeded — just sync the stripeStatus field (non-state-changing)
        await Deal.updateOne(
          { _id: dealId },
          { $set: { "paymentDetails.stripeStatus": paymentIntent.status } },
        );
      }

      res.json({
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
        },
        dealStatus: currentDealStatus,
      });
    } catch (error: unknown) {
      logger.error("[StripeController] Error checking payment status:", error);
      res.status(getErrorStatusCode(error)).json({
        success: false,
        message: getErrorMessage(error, "Failed to check payment status"),
      });
    }
  },
);

/**
 * Получает публичный ключ Stripe для фронтенда
 */
export const getStripePublishableKey = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const publishableKey = stripeService.getPublishableKey();

      res.json({
        success: true,
        publishableKey,
      });
    } catch (error) {
      logger.error("[StripeController] Error getting publishable key:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get Stripe publishable key",
      });
    }
  },
);
