import api from '.';
import type {
  DealActionPostSuccessBody,
  DealDetailFromApi,
  DealDetailGetResponseBody,
  DealJsonActionName,
} from './dealContractTypes';
import { isAxiosError } from 'axios';

export type { DealDetailFromApi, DealJsonActionName, DealDetailPageDealAction } from './dealContractTypes';
export { DEAL_JSON_ACTION_NAMES, isDealJsonActionName } from './dealContractTypes';

// Types for LGDEAL Helper endpoints
export interface LgdealUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  fullName: string;
}

export interface LgdealManagersResponse {
  success: boolean;
  managers: LgdealUser[];
}

export interface LgdealLogistsResponse {
  success: boolean;
  logists: LgdealUser[];
}

/**
 * Fetches the complete details for a single deal.
 * @param dealId The ID of the deal to fetch.
 * @returns Deal with viewer fields (userRole, allowedActions, dealState, isDirectLgdealDeal) as returned by GET /deal/:id.
 */
export const getDealDetails = async (dealId: string): Promise<DealDetailFromApi> => {
  // Important: prevent browser/proxy caching from returning stale deal state
  // (which can "roll back" UI after a real-time update).
  const response = await api.get<DealDetailGetResponseBody>(`/deal/${dealId}`, {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    params: {
      _t: Date.now(),
    },
  });
  return response.data.deal;
};

/**
 * Performs a state-changing action on a deal.
 * @param dealId The ID of the deal.
 * @param actionName The name of the action to perform (e.g., 'approve_request').
 * @param payload Additional data for the action.
 * @returns Updated deal with the same viewer merge shape as GET detail.
 */
export const performDealAction = async (
  dealId: string,
  actionName: DealJsonActionName,
  payload: Record<string, unknown> = {}
): Promise<DealDetailFromApi> => {
  const response = await api.post<DealActionPostSuccessBody>(`/deal/${dealId}/action/${actionName}`, payload);
  return response.data.deal;
};

export const uploadInvoice = async (dealId: string, file: File): Promise<DealDetailFromApi> => {
  const formData = new FormData();
  formData.append('invoice', file);

  try {
    // Do not set Content-Type: Axios must add multipart/form-data with the boundary.
    // A bare "multipart/form-data" breaks parsing and often yields 500 on the server.
    const { data } = await api.post<DealActionPostSuccessBody>(
      `/deal/${dealId}/action/upload_invoice`,
      formData,
    );
    return data.deal;
  } catch (error: unknown) {
    // Check if it's an axios error
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message;
      
      // Provide specific error messages based on status codes
      if (status === 415) {
        throw new Error(`File type not supported: ${message || 'Please upload a PDF, DOC, DOCX, JPG, or PNG file.'}`);
      } else if (status === 413) {
        throw new Error('File size too large. Maximum size is 5MB.');
      } else if (status === 400) {
        throw new Error(message || 'Invalid request. Please check your file and try again.');
      } else if (status === 403) {
        throw new Error('You are not authorized to upload invoices for this deal.');
      } else if (status === 404) {
        throw new Error('Deal not found.');
      } else {
        throw new Error(message || 'Failed to upload invoice. Please try again.');
      }
    }
    throw new Error('An unknown error occurred during invoice upload.');
  }
};

export const downloadInvoice = async (dealId: string): Promise<Blob> => {
  const response = await api.get<Blob>(`/deal/${dealId}/invoice/download`, {
    responseType: 'blob',
  });
  return response.data;
};

/**
 * LGDEAL Helper Endpoints
 */

/**
 * Get list of LGDEAL managers for assignment
 * Only accessible by LGDEAL supervisors
 */
export const getLgdealManagers = async (): Promise<LgdealUser[]> => {
  const response = await api.get<LgdealManagersResponse>('/deal/lgdeal/managers');
  return response.data.managers;
};

/**
 * Get list of LGDEAL logists for assignment
 * Accessible by LGDEAL managers and supervisors
 */
export const getLgdealLogists = async (): Promise<LgdealUser[]> => {
  const response = await api.get<LgdealLogistsResponse>('/deal/lgdeal/logists');
  return response.data.logists;
};
