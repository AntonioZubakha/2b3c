// ==========================================================================
// ERROR HANDLING UTILITIES
// Утилиты для типобезопасной обработки ошибок
// ==========================================================================

import { AppError, isAppError, isError, isAxiosError, isMongooseError } from '../types/errors';

// Re-export для удобства использования в других модулях
export { isAxiosError } from '../types/errors';

/**
 * Извлекает сообщение об ошибке из unknown типа
 * @param error - Ошибка любого типа
 * @param defaultMessage - Сообщение по умолчанию
 * @returns Строка с описанием ошибки
 */
export function getErrorMessage(error: unknown, defaultMessage: string = 'An error occurred'): string {
  if (isError(error)) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  
  return defaultMessage;
}

/**
 * Извлекает HTTP статус код из ошибки
 * @param error - Ошибка любого типа
 * @param defaultStatus - Статус по умолчанию
 * @returns HTTP статус код
 */
export function getErrorStatusCode(error: unknown, defaultStatus: number = 500): number {
  if (isAppError(error)) {
    return error.statusCode;
  }
  
  if (isAxiosError(error) && error.response?.status) {
    return error.response.status;
  }
  
  if (isMongooseError(error)) {
    // Mongoose validation errors - 400
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return 400;
    }
    // Duplicate key error - 409
    if (error.code === 11000) {
      return 409;
    }
  }
  
  return defaultStatus;
}

/**
 * Преобразует любую ошибку в AppError
 * @param error - Ошибка любого типа
 * @param defaultMessage - Сообщение по умолчанию
 * @param defaultStatus - Статус по умолчанию
 * @returns Типизированная AppError
 */
export function toAppError(
  error: unknown,
  defaultMessage: string = 'An error occurred',
  defaultStatus: number = 500
): AppError {
  // Уже AppError - возвращаем как есть
  if (isAppError(error)) {
    return error;
  }
  
  const message = getErrorMessage(error, defaultMessage);
  const statusCode = getErrorStatusCode(error, defaultStatus);
  
  // Извлекаем code если есть
  let code: string | undefined;
  if (error && typeof error === 'object' && 'code' in error) {
    code = String(error.code);
  }
  
  return new AppError(message, statusCode, code);
}

/**
 * Безопасное извлечение stack trace
 * @param error - Ошибка любого типа
 * @returns Stack trace или undefined
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack;
  }
  
  if (error && typeof error === 'object' && 'stack' in error && typeof error.stack === 'string') {
    return error.stack;
  }
  
  return undefined;
}

/**
 * Проверяет является ли ошибка operational (обрабатываемой)
 * @param error - Ошибка любого типа
 * @returns true если ошибка operational
 */
export function isOperationalError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.isOperational;
  }
  
  // Axios errors обычно operational
  if (isAxiosError(error)) {
    return true;
  }
  
  // Mongoose validation errors - operational
  if (isMongooseError(error)) {
    return true;
  }
  
  // Неизвестные ошибки считаем non-operational
  return false;
}

/**
 * Форматирует ошибку для логирования
 * @param error - Ошибка любого типа
 * @returns Объект с деталями ошибки
 */
export function formatErrorForLogging(error: unknown): {
  message: string;
  stack?: string;
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  details?: unknown;
} {
  return {
    message: getErrorMessage(error),
    stack: getErrorStack(error),
    statusCode: isAppError(error) ? error.statusCode : undefined,
    code: isAppError(error) ? error.code : undefined,
    isOperational: isOperationalError(error),
    details: isAxiosError(error) ? error.response?.data : undefined
  };
}

/**
 * Безопасный wrapper для async функций с типизированной обработкой ошибок
 * @param fn - Async функция
 * @param errorMessage - Сообщение об ошибке по умолчанию
 * @returns Результат или AppError
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorMessage?: string
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    throw toAppError(error, errorMessage);
  }
}

