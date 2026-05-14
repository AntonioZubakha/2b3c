// ==========================================================================
// API RESPONSE TYPES
// Стандартизированные типы для API ответов
// ==========================================================================

/**
 * Базовый успешный ответ API
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Базовый ответ с ошибкой
 */
export interface ApiErrorResponse {
  success: false;
  message: string;
  error?: string;
  code?: string;
  details?: unknown;
}

/**
 * Универсальный API ответ
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Пагинированный ответ
 */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Ответ со списком (без пагинации)
 */
export interface ListResponse<T> {
  success: true;
  data: T[];
  total?: number;
}

/**
 * Простой ответ с сообщением
 */
export interface MessageResponse {
  success: boolean;
  message: string;
}

// ==========================================================================
// SPECIFIC RESPONSE TYPES
// ==========================================================================

/**
 * Ответ с данными пользователя
 */
export interface UserResponse {
  success: true;
  user: unknown; // Заменить на IUserDocument когда будет typed
  token?: string;
}

/**
 * Ответ с данными компании
 */
export interface CompanyResponse {
  success: true;
  company: unknown; // Заменить на ICompanyDocument когда будет typed
}

/**
 * Ответ с данными продукта
 */
export interface ProductResponse {
  success: true;
  product: unknown; // Заменить на IProduct когда будет typed
}

/**
 * Ответ со списком продуктов
 */
export interface ProductsResponse {
  success: true;
  products: unknown[]; // Заменить на IProduct[] когда будет typed
  total?: number;
}

/**
 * Ответ с данными сделки
 */
export interface DealResponse {
  success: true;
  deal: unknown; // Заменить на IDeal когда будет typed
}

// ==========================================================================
// HELPER FUNCTIONS
// ==========================================================================

/**
 * Создает успешный ответ
 */
export function successResponse<T>(data: T, message?: string): ApiSuccessResponse<T> {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data
  };
  
  if (message) response.message = message;
  
  return response;
}

/**
 * Создает ответ с ошибкой
 */
export function errorResponse(
  message: string,
  error?: string,
  code?: string,
  details?: unknown
): ApiErrorResponse {
  const response: ApiErrorResponse = {
    success: false,
    message
  };
  
  if (error) response.error = error;
  if (code) response.code = code;
  if (details) response.details = details;
  
  return response;
}

/**
 * Создает пагинированный ответ
 */
export function paginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): PaginatedResponse<T> {
  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

/**
 * Создает простой ответ с сообщением
 */
export function messageResponse(success: boolean, message: string): MessageResponse {
  return { success, message };
}

