// eslint-disable-next-line no-restricted-imports
import axios, { AxiosResponse, InternalAxiosRequestConfig, isAxiosError } from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config/environment';
import { getCookie } from '../utils/cookies';

const api = axios.create({
  baseURL: config.apiUrl,
  withCredentials: true,
});


api.interceptors.request.use(
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

api.interceptors.response.use(
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
  // Log API requests in development
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`, {
      method: config.method,
      url: config.url,
      usingCookies: true
    });
  }
}

const logRequestError = (error: unknown) => {
  logger.error('API Request Interceptor Error', error instanceof Error ? error : new Error(String(error)));
}

const logResponse = (response: AxiosResponse) => {
  // Log successful responses in development
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`API Response: ${response.config.method?.toUpperCase()} ${response.config.url}`, {
      status: response.status,
      statusText: response.statusText
    });
  }
}

const logResponseError = (error: unknown) => {
  const axiosErr = isAxiosError(error) ? error : null;
  const endpoint = axiosErr?.config?.url ?? 'unknown';
  const method = axiosErr?.config?.method ?? 'unknown';
  const status = axiosErr?.response?.status;

  // 401 on GET /auth/me is expected for anonymous users — do not log as error
  const isAuthCheckUnauthorized =
    status === 401 &&
    (method === 'get' || method === 'GET') &&
    (endpoint === '/auth/me' || endpoint?.endsWith('/auth/me'));

  if (isAuthCheckUnauthorized) {
    return;
  }

  logger.apiError(`${method.toUpperCase()} ${endpoint}`, error instanceof Error ? error : new Error(String(error)), {
    status,
    statusText: axiosErr?.response?.statusText,
    data: axiosErr?.response?.data
  });
}

export default api; 