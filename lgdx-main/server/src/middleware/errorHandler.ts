import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Кастомные классы ошибок
export class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;
    public code?: string;

    constructor(message: string, statusCode: number, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message: string) {
        super(message, 400);
        this.code = 'VALIDATION_ERROR';
    }
}

export class NotFoundError extends AppError {
    constructor(message: string = 'Resource not found') {
        super(message, 404);
        this.code = 'NOT_FOUND';
    }
}

export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized') {
        super(message, 401);
        this.code = 'UNAUTHORIZED';
    }
}

export class ForbiddenError extends AppError {
    constructor(message: string = 'Forbidden') {
        super(message, 403);
        this.code = 'FORBIDDEN';
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 409);
        this.code = 'CONFLICT';
    }
}

// Интерфейс для структурированного ответа об ошибке
interface ErrorResponse {
    success: false;
    error: {
        message: string;
        code?: string;
        details?: any;
        stack?: string;
    };
    timestamp: string;
    path: string;
    method: string;
}

const noisy404PathPatterns: RegExp[] = [
    /^\/api\/v1(\/|$)/i,
    /^\/api\/(?:auth|users|data|webhook|serverless)(?:\/\*|\/$)/i,
    /^\/api\/(?:user|login|credentials)$/i,
    /^\/\.well-known\/acme-challenge\/.*\.(?:php|asp|aspx|jsp|cgi)$/i,
    /^\/(?:wp-admin|wp-login\.php|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma|cgi-bin|HNAP1|boaform)/i,
    /^\/\.(?:env|git|svn)/i,
];

const isNoisy404Probe = (url: string): boolean =>
    noisy404PathPatterns.some((pattern) => pattern.test(url));

// Основной обработчик ошибок
export const globalErrorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const isDevelopment = process.env.NODE_ENV === 'development';

    let statusCode = 500;
    let message = 'Internal Server Error';
    let code = 'INTERNAL_ERROR';

    // Обработка известных типов ошибок
    if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
        code = err.code || 'APP_ERROR';
    } else if (err.name === 'ValidationError') {
        // Mongoose validation error
        statusCode = 400;
        message = 'Validation failed';
        code = 'VALIDATION_ERROR';
    } else if (err.name === 'CastError') {
        // Mongoose cast error (invalid ObjectId)
        statusCode = 400;
        message = 'Invalid ID format';
        code = 'INVALID_ID';
    } else if (err.name === 'MongoError' && 'code' in err && (err as { code: number }).code === 11000) {
        // Duplicate key error
        statusCode = 409;
        message = 'Duplicate entry';
        code = 'DUPLICATE_ENTRY';
    } else if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token';
        code = 'INVALID_TOKEN';
    } else if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired';
        code = 'TOKEN_EXPIRED';
    }

    const isNotFound = statusCode === 404;
    const requestUrl = req.originalUrl || req.url;
    const logPayload = {
        message: err.message,
        ...(isDevelopment && !isNotFound ? { stack: err.stack } : {}),
        method: req.method,
        url: requestUrl,
        timestamp: new Date().toISOString(),
        statusCode
    };

    // 404 probes are expected internet noise — keep them out of error alert streams.
    if (isNotFound && isNoisy404Probe(requestUrl)) {
        logger.info('[HTTP 404 PROBE]', logPayload);
    } else if (isNotFound) {
        logger.warn('[HTTP 404]', logPayload);
    } else {
        logger.error('[ERROR]', logPayload);
    }

    const errorResponse: ErrorResponse = {
        success: false,
        error: {
            message,
            code,
            ...(isDevelopment && { details: err.message }),
            ...(isDevelopment && { stack: err.stack })
        },
        timestamp: new Date().toISOString(),
        path: req.url,
        method: req.method
    };

    res.status(statusCode).json(errorResponse);
};

// Обработчик для маршрутов, которые не найдены
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
    const error = new NotFoundError(`Route ${req.method} ${req.url} not found`);
    next(error);
};

// Async wrapper для контроллеров
export const asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}; 