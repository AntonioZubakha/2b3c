import { IDeal } from '../../../types';
import { UserRole } from '../helpers';
import { Request } from 'express';

// This request interface is tailored for the data needed by deal actions.
export interface ActionRequest extends Request {
  user?: {
    userId: string;
    role: string;
    companyId?: string;
    isLgdealSupervisor?: boolean;
    isLgdealAdmin?: boolean;
  };
  params: {
    dealId: string;
    actionName: string;
  };
  body: ActionPayload;
}

// Defines the expected payload structure for deal actions.
export interface ActionPayload {
  shippingCost?: number;
  importTariff?: number;
  rejectionReason?: string;
  deliveryTerms?: string;
  additionalTerms?: string;
  price?: number;
  trackingNumber?: string;
  carrier?: string;
  deliveryDate?: string;
  notes?: string;
  // Fields for selecting an alternative product
  originalProductId?: string;
  alternativeProductId?: string;
  // LGDEAL Internal Workflow fields
  managerId?: string; // ID manager'а для назначения
  logistId?: string; // ID logist'а для назначения
  newManagerId?: string; // ID нового manager'а при переназначении
  reason?: string; // Причина (для reject_quality, reassign, etc.)
  reassignmentReason?: string; // Причина переназначения
}

/**
 * Custom error class for actions to provide specific status codes.
 */
export class ActionError extends Error {
    constructor(message: string, public statusCode: number = 400) {
        super(message);
        this.name = 'ActionError';
    }
}

/**
 * The Command interface that all deal actions must implement.
 */
export interface ICommand {
    /**
     * Executes the specific deal action.
     * @param deal The deal document to be modified.
     * @param req The express request object, containing user and payload data.
     * @param currentUserRole The role of the user performing the action.
     * @returns A promise resolving to an object with details for the activity log.
     * @throws {ActionError} if the action cannot be performed due to business logic or permissions.
     */
    execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole): Promise<{
        activityLogDetails: string;
    }>;
} 