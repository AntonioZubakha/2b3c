import api from './index';
import { Company, User, UserDto } from '../types';

// Extended company type for API configurations page
export interface CompanyWithApiConfig extends Omit<Company, 'apiConfig'> {
  apiConfig?: {
    syncStatus?: 'SYNCING' | 'SUCCESS' | 'ERROR' | 'PENDING' | string;
    lastSync?: string;
    lastSyncError?: string;
  };
}

/**
 * Fetches all companies with their API configuration details.
 */
export const getCompaniesWithApiConfig = async (): Promise<CompanyWithApiConfig[]> => {
  const response = await api.get<CompanyWithApiConfig[]>('/admin/companies');
  return response.data;
};

/**
 * Triggers a manual sync for a specific company's API.
 * @param companyId The ID of the company to sync.
 */
export const syncCompanyNow = async (companyId: string): Promise<void> => {
  await api.post(`/admin/company-api/${companyId}/sync`);
};

/**
 * Resets sync status and clears last error for a company's API config (e.g. after a hung sync).
 * @param companyId The ID of the company whose API config status should be reset.
 */
export const resetSyncStatus = async (companyId: string): Promise<void> => {
  await api.put(`/admin/company-api/${companyId}/reset-sync`);
};

/**
 * Deletes the API configuration for a specific company.
 * @param companyId The ID of the company whose API config should be deleted.
 */
export const deleteApiConfig = async (companyId: string): Promise<void> => {
  await api.delete(`/admin/company-api/${companyId}`);
};

/**
 * Triggers a sync for all active company API configurations.
 */
export const syncAllActiveApis = async (): Promise<{ message: string; queuedCount: number; errors: string[] }> => {
    const response = await api.post<{ message: string; queuedCount: number; errors: string[] }>('/admin/sync-all-active-apis');
    return response.data;
};

export const replayApiSyncDlq = async (
  limit = 500,
  dedupeByCompany = true
): Promise<{
  message: string;
  moved: number;
  dropped: number;
  queued: number;
  dlqQueued: number;
}> => {
  const response = await api.post<{
    message: string;
    moved: number;
    dropped: number;
    queued: number;
    dlqQueued: number;
  }>('/admin/api-sync-dlq/replay', { limit, dedupeByCompany });
  return response.data;
};

// --- Companies & Users Management ---

// Extended company interface with users fully populated
export interface CompanyWithUsers extends Company {
  users?: Array<{
    user: User | string;
    role: string;
    isActive: boolean;
    _id?: string;
  }>;
}

/**
 * Fetches all companies and their associated users.
 */
export const getCompaniesAndUsers = async (status?: string): Promise<CompanyWithUsers[]> => {
  const params = status ? { status, _t: Date.now() } : { _t: Date.now() };
  const response = await api.get<CompanyWithUsers[]>('/admin/companies', {
    params,
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  return response.data;
};

/**
 * Creates a new company with a user (email and phone pre-verified).
 */
export interface CreateCompanyWithUserData {
  name: string;
  description?: string;
  userEmail: string;
  userPhone: string;
  userFirstName: string;
  userLastName: string;
  userPassword: string;
  userRole?: 'manager' | 'supervisor';
  companyRoles?: string[];
}

export interface CreateCompanyWithUserResponse {
  company: CompanyWithUsers;
  user: {
    _id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    role: string;
    emailVerified: boolean;
    phoneVerified: boolean;
  };
}

export const createCompanyWithUser = async (data: CreateCompanyWithUserData): Promise<CreateCompanyWithUserResponse> => {
  const response = await api.post<CreateCompanyWithUserResponse>('/admin/companies', data);
  return response.data;
};

/**
 * Permanently deletes a company and all its users from the database (hard delete).
 * @param companyId The ID of the company to permanently delete.
 */
export const hardDeleteCompany = async (companyId: string): Promise<{ deletedUsersCount: number }> => {
  const response = await api.delete<{ message: string; deletedUsersCount: number }>(`/admin/companies/${companyId}/hard`);
  return { deletedUsersCount: response.data.deletedUsersCount };
};

/**
 * Generates an impersonation token for a user.
 * @param userIdToImpersonate The ID of the user to log in as.
 * @returns The impersonation token and user object.
 */
export const impersonateUser = async (userIdToImpersonate: string): Promise<{ token: string; user: UserDto }> => {
    const response = await api.get<{ token: string; user: UserDto }>(`/admin/impersonate/${userIdToImpersonate}`);
    try {
      // Notify app-level auth context to update immediately
      window.dispatchEvent(new CustomEvent('lgdeal:impersonated', { detail: response.data }));
    } catch (error) {
      // Event dispatch may fail in some environments, ignore silently
    }
    return response.data;
};

/**
 * Transfers a user to a different company.
 * @param userId The ID of the user to transfer.
 * @param newCompanyId The ID of the target company.
 */
export const transferUser = async (userId: string, newCompanyId: string): Promise<void> => {
    await api.put(`/admin/users/${userId}/company`, { companyId: newCompanyId });
};

/**
 * Changes a user's role.
 * @param userId The ID of the user to change role for.
 * @param role The new role to assign.
 */
export const changeUserRole = async (userId: string, role: string): Promise<void> => {
    await api.put(`/admin/users/${userId}/role`, { role });
};

/**
 * Deletes a user from the system (soft delete - marks as inactive).
 * @param userId The ID of the user to delete.
 */
export const deleteUser = async (userId: string): Promise<void> => {
    await api.delete(`/admin/users/${userId}`);
};

/**
 * Activates or deactivates a user.
 * @param userId The ID of the user to activate/deactivate.
 * @param activate Whether to activate (true) or deactivate (false) the user.
 */
export const activateUser = async (userId: string, activate: boolean): Promise<void> => {
    await api.put(`/admin/users/${userId}/activate`, { activate });
};

/**
 * Permanently deletes a user from the database (hard delete).
 * @param userId The ID of the user to permanently delete.
 */
export const hardDeleteUser = async (userId: string): Promise<void> => {
    await api.delete(`/admin/users/${userId}/hard`);
};

// --- Onboarding Management ---

/**
 * Approves a company's onboarding request.
 * @param companyId The ID of the company to approve.
 */
export const approveOnboardingRequest = async (companyId: string): Promise<void> => {
    await api.put(
      `/admin/companies/${companyId}/approve`,
      {},
      {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        params: {
          _t: Date.now(),
        },
      }
    );
};

/**
 * Rejects a company's onboarding request.
 * @param companyId The ID of the company to reject.
 */
export const rejectOnboardingRequest = async (companyId: string): Promise<void> => {
    await api.put(
      `/admin/companies/${companyId}/reject`,
      {},
      {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        params: {
          _t: Date.now(),
        },
      }
    );
};

// --- User Management ---

// User with company details, for the main user management table
export interface UserWithCompany extends Omit<User, 'company'> {
  company?: Company | string | null;
}

// Edit form data interface
export interface EditFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  newPassword?: string; // Optional password change
}

// Phone verification management


export const forceVerifyPhone = async (userId: string): Promise<void> => {
  await api.post(`/admin/users/${userId}/force-verify-phone`);
};

export const forceVerifyEmail = async (userId: string): Promise<void> => {
  await api.post(`/admin/users/${userId}/force-verify-email`);
};

/**
 * Fetches all users with their company details.
 */
export const getUsers = async (): Promise<UserWithCompany[]> => {
    const response = await api.get<UserWithCompany[]>('/admin/users');
    return response.data;
};

/**
 * Updates the details for a specific user.
 * @param userId The ID of the user to update.
 * @param userData The user data to update.
 */
export const updateUserDetails = async (userId: string, userData: EditFormData): Promise<void> => {
    await api.put(`/admin/users/${userId}/details`, userData);
}; 