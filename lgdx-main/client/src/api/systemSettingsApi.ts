import api from './index';

export interface SystemSettings {
  registrationsEnabled: boolean;
  registrationIpBlacklist: string[];
  registrationBlockedCountryCodes: string[];
  updatedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  updatedAt: string;
  reason: string;
  status: 'enabled' | 'disabled';
}

export interface UpdateSystemSettingsRequest {
  registrationsEnabled: boolean;
  reason: string;
  registrationIpBlacklist?: string[];
  registrationBlockedCountryCodes?: string[];
}

export interface ToggleRegistrationsRequest {
  enabled: boolean;
  reason: string;
  registrationIpBlacklist?: string[];
  registrationBlockedCountryCodes?: string[];
}

export interface SystemSettingsHistoryItem {
  _id: string;
  registrationsEnabled: boolean;
  registrationIpBlacklist?: string[];
  registrationBlockedCountryCodes?: string[];
  updatedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  updatedAt: string;
  reason: string;
  createdAt: string;
}

export const getCurrentSettings = () => api.get<SystemSettings>('/admin/system-settings').then(({ data }) => data)
export const updateSettings = (data: UpdateSystemSettingsRequest) => api.put<SystemSettings>('/admin/system-settings', data).then(({ data }) => data)
export const toggleRegistrations = (data: ToggleRegistrationsRequest) => api.post<SystemSettings>('/admin/system-settings/registrations/toggle', data).then(({ data }) => data)
export const getSettingsHistory = (limit = 10): Promise<SystemSettingsHistoryItem[]> => api.get(`/admin/system-settings/history?limit=${limit}`).then(({ data }) => data)
export const areRegistrationsEnabled = async () => {
  try {
    // Use public endpoint that doesn't require authentication
    const response = await api.get<{ registrationsEnabled: boolean }>('/auth/registrations-enabled');
    return response.data.registrationsEnabled;
  } catch (error) {
    // В случае ошибки разрешаем регистрации по умолчанию
    return true;
  }
}
