import api from './index';

export interface ConstantsSettingsResponse {
  minSupplierPrice: number;
  measurementRatioGeometryTolerancePct: number;
  alternativesCaratTolerance: number;
  updatedBy?: { _id: string; firstName: string; lastName: string; email: string };
  updatedAt: string;
  reason: string;
  createdAt: string;
}

export interface UpdateConstantsSettingsRequest {
  minSupplierPrice?: number;
  measurementRatioGeometryTolerancePct?: number;
  alternativesCaratTolerance?: number;
  reason: string;
}

export const getConstantsSettings = () =>
  api.get<ConstantsSettingsResponse>('/admin/constants-settings').then(({ data }) => data);

export const updateConstantsSettings = (data: UpdateConstantsSettingsRequest) =>
  api.put<ConstantsSettingsResponse>('/admin/constants-settings', data).then(({ data }) => data);
