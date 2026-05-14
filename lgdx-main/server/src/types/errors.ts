// ==========================================================================
// TYPED ERROR CLASSES
// Централизованная система типизированных ошибок
// ==========================================================================

/**
 * Базовый класс для всех ошибок приложения
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Ошибка валидации данных (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, code?: string) {
    super(message, 400, code);
  }
}

/**
 * Ошибка аутентификации (401)
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', code?: string) {
    super(message, 401, code);
  }
}

/**
 * Ошибка авторизации (403)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', code?: string) {
    super(message, 403, code);
  }
}

/**
 * Ошибка "не найдено" (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, code?: string) {
    super(`${resource} not found`, 404, code);
  }
}

/**
 * Ошибка конфликта (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, code?: string) {
    super(message, 409, code);
  }
}

/**
 * Ошибка внешнего сервиса (502)
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, originalError?: Error) {
    super(
      `External service error: ${service}${originalError ? ` - ${originalError.message}` : ''}`,
      502,
      'EXTERNAL_SERVICE_ERROR'
    );
  }
}

/**
 * Ошибка базы данных
 */
export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(
      `Database error: ${message}${originalError ? ` - ${originalError.message}` : ''}`,
      500,
      'DATABASE_ERROR',
      false // Не operational - требует внимания
    );
  }
}

// ==========================================================================
// TYPE GUARDS
// ==========================================================================

/**
 * Type guard для проверки что ошибка является AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard для проверки что это Error
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard для проверки что это Axios error
 */
export function isAxiosError(error: unknown): error is { response?: { status: number; data?: unknown }; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as { isAxiosError: unknown }).isAxiosError === true
  );
}

/**
 * Type guard для проверки что это Mongoose error
 */
export function isMongooseError(error: unknown): error is { name: string; message: string; code?: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as { name: unknown }).name === 'string' &&
    ['ValidationError', 'CastError', 'MongoError', 'MongoServerError'].includes((error as { name: string }).name)
  );
}

