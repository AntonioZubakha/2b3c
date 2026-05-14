import mongoose, { Types } from "mongoose";
import {
  IDeal,
  DealStage,
  DealStatus,
  IActivityLog,
  IShippingDetails,
  IUser,
  IDealProduct,
  IProduct,
  INegotiationDetails,
  IProposedTerm,
} from "../../../types";
import { isValidStageTransition, processProductsOnDealEnd } from "../helpers";
import Deal from "../../../models/Deal";
import { ICommand, ActionRequest, ActionError } from "./command.interface";
import { UserRole } from "../helpers";
import { DEAL_STAGES, DEAL_STATUSES } from "../../../types/constants";
import { logger } from "../../../utils/logger";
import { notificationService } from "../../../services/notificationService";

export class ApproveRequestCommand implements ICommand {
  public async execute(
    deal: IDeal,
    req: ActionRequest,
    currentUserRole: UserRole,
  ): Promise<{ activityLogDetails: string }> {
    logger.info("[ApproveRequestCommand] Starting execution for deal", {
      dealId: deal._id,
      userRole: currentUserRole,
    });

    if (deal.stage !== "request" || deal.status !== "pending") {
      throw new ActionError(
        "Request can only be approved if deal is in request stage and pending status.",
      );
    }

    if (
      currentUserRole !== "seller" &&
      currentUserRole !== "LGDEAL seller" &&
      currentUserRole !== "LGDEAL dual-role"
    ) {
      throw new ActionError(
        "Only a seller role can approve this request.",
        403,
      );
    }

    // The validation should apply to the deal being directly actioned upon.
    // If a seller is approving their end of the deal (the lgdeal-to-seller part),
    // the shipping cost must be set on *that* deal.
    // The responsibility for ensuring shipping cost is set before this action is enabled
    // now lies with the frontend logic and the `getAllowedActions` helper.
    // The command itself will simply transition the status and stage.

    deal.stage = DEAL_STAGES.PAYMENT_DELIVERY;
    deal.status = DEAL_STATUSES.AWAITING_INVOICE;

    // The command doesn't need to add to the activity log itself.
    // The controller will do that with the returned details.

    // 🔒 REMOVED: await deal.save() - actionController now saves with optimistic locking

    // Notify buyer that their request was approved
    try {
      logger.info("[ApproveRequestCommand] Attempting to notify counterparty", {
        dealId: deal._id,
        dealNumber: deal.dealNumber,
        dealType: deal.dealType,
        buyerId: deal.buyerId?.toString(),
        sellerId: deal.sellerId?.toString(),
        actionPerformedBy: req.user!.userId,
      });

      await notificationService.notifyCounterparty(
        deal,
        req.user!.userId,
        "request_approved",
        "Request Approved",
        `Your request for deal #${deal.dealNumber} has been approved by the seller. Please wait for the invoice.`,
        "high",
      );
    } catch (error) {
      logger.error("[ApproveRequestCommand] Failed to send notification", {
        error,
      });
      // Don't fail the command if notification fails
    }

    const activityLogDetails = `Seller approved the request. Deal moved to payment stage.`;
    return { activityLogDetails };
  }
}
