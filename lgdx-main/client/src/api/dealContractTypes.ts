/**
 * HTTP contract for deal detail + JSON deal actions.
 * Mirrors server: retrievalController getDealById (GET /deal/:id) and
 * actionController handleDealAction (POST /deal/:id/action/:actionName).
 *
 * Multipart upload_invoice uses uploadInvoice() in dealApi.ts — same merged `deal` shape on success.
 */
import type { Deal, DealStateInfo } from '../types';

/** Actions sent as JSON to POST /deal/:id/action/:name (not multipart upload_invoice). */
export const DEAL_JSON_ACTION_NAMES = [
  'approve_request',
  'reject_request',
  'cancel_deal',
  'reject_invoice',
  'accept_invoice',
  'recall_invoice',
  'confirm_payment',
  'confirm_delivery',
  'add_tracking_number',
  'select_alternative_product',
  'accept_alternative_product',
  'reject_alternative_product',
  'set_shipping_cost',
  'set_import_tariff',
  'assign_to_manager',
  'stone_received',
  'approve_quality',
  'reject_quality',
  'assign_to_logist',
  'reassign_manager',
] as const;

export type DealJsonActionName = (typeof DEAL_JSON_ACTION_NAMES)[number];

/** Includes upload_invoice for DealDetailPage-local routing (multipart uses uploadInvoice). */
export type DealDetailPageDealAction = DealJsonActionName | 'upload_invoice';

export function isDealJsonActionName(name: string): name is DealJsonActionName {
  return (DEAL_JSON_ACTION_NAMES as readonly string[]).includes(name);
}

/**
 * Deal document plus viewer-specific fields always merged by the detail GET and action POST handlers.
 */
export type DealDetailFromApi = Deal & {
  userRole: string;
  allowedActions: string[];
  isDirectLgdealDeal: boolean;
  dealState: DealStateInfo;
};

/** GET /deal/:dealId */
export interface DealDetailGetResponseBody {
  deal: DealDetailFromApi;
}

/** POST /deal/:dealId/action/:actionName (JSON body) and upload_invoice multipart success body */
export interface DealActionPostSuccessBody {
  message: string;
  deal: DealDetailFromApi;
}
