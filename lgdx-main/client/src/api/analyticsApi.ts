// eslint-disable-next-line no-restricted-imports
import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config/environment';
import { getCookie } from '../utils/cookies';

// Analytics Service API client
const analyticsApi = axios.create({
  baseURL: config.analyticsServiceUrl || '/analytics/',
  withCredentials: true,
  timeout: 240000, // 4 minutes timeout for analytics requests (recalculate can take up to 90 seconds)
});

// Request interceptor
analyticsApi.interceptors.request.use(
  (config) => {
    setCsrfToken(config)
    logRequest(config);
    return config;
  },
  (error) => {
    logRequestError(error)
    return Promise.reject(error);
  }
);

// Response interceptor
analyticsApi.interceptors.response.use(
  (response) => {
    logResponse(response);
    return response;
  },
  (error) => {
    logResponseError(error);
    return Promise.reject(error);
  }
);

const setCsrfToken = (config: InternalAxiosRequestConfig) => {
  if (isUnsafeMethod(config.method)) {
    const csrf = getCookie('csrfToken');
    if (csrf) config.headers['x-csrf-token'] = csrf;
  }
};

const isUnsafeMethod = (method: string | undefined): boolean => {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes((method ?? 'get').toUpperCase());
};

const logRequest = (config: InternalAxiosRequestConfig) => {
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`Analytics API Request: ${config.method?.toUpperCase()} ${config.url}`, {
      method: config.method,
      url: config.url,
    });
  }
}

const logRequestError = (error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error('Analytics API Request Interceptor Error', err);
}

const logResponse = (response: AxiosResponse) => {
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`Analytics API Response: ${response.config.method?.toUpperCase()} ${response.config.url}`, {
      status: response.status,
      statusText: response.statusText
    });
  }
}

const logResponseError = (error: unknown) => {
  const err = error as { config?: { url?: string; method?: string }; response?: { status?: number; statusText?: string; data?: unknown } };
  const endpoint = err.config?.url || 'unknown';
  const method = err.config?.method || 'unknown';

  // Error details are logged by logger below

  logger.apiError(`Analytics API: ${method.toUpperCase()} ${endpoint}`, error instanceof Error ? error : new Error(String(error)), {
    status: err.response?.status,
    statusText: err.response?.statusText,
    data: err.response?.data
  });
}

export default analyticsApi;
