import api from './index';

export interface PerfectPairStageConfig {
  caratTolerancePct: number;
  clarityStepsAllowed: number;
  cutMaxDowngrade: number;
  polishMaxDowngrade: number;
  symmetryMaxDowngrade: number;
  maxCandidatesPerStage: number;
}

export interface PerfectPairWeightsConfig {
  carat: number;
  clarity: number;
  cut: number;
  polish: number;
  symmetry: number;
  bonusFullGia: number;
  pricePenaltyK: number;
}

export interface PerfectPairSettingsResponse {
  enableProgressiveRelaxation: boolean;
  maxStage: number;
  stages: PerfectPairStageConfig[];
  weights: PerfectPairWeightsConfig;
  updatedBy?: { _id: string; firstName: string; lastName: string; email: string };
  updatedAt: string;
  reason: string;
  createdAt: string;
}

export interface UpdatePerfectPairSettingsRequest {
  enableProgressiveRelaxation?: boolean;
  maxStage?: number;
  stages?: PerfectPairStageConfig[];
  weights?: PerfectPairWeightsConfig;
  reason: string;
}

export const getPerfectPairSettings = () => api.get<PerfectPairSettingsResponse>('/admin/perfect-pair-settings').then(({ data }) => data)
export const updatePerfectPairSettings = (data: UpdatePerfectPairSettingsRequest) => api.put<PerfectPairSettingsResponse>('/admin/perfect-pair-settings', data).then(({ data }) => data)


