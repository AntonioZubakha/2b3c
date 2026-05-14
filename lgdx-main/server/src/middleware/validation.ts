import { Request, Response, NextFunction } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { AnyZodObject, ZodError, ZodSchema, z } from 'zod';
import { ValidationError } from './errorHandler';
import { logger } from '../utils/logger';

// ---- Validation Middleware Types ----

export interface ValidationSchemas {
    body?: AnyZodObject;
    params?: AnyZodObject;
    query?: AnyZodObject;
}

export interface ValidatedRequest<
    TBody = any,
    TParams = any,
    TQuery = any
> extends Omit<Request, 'body' | 'params' | 'query'> {
    body: TBody;
    params: TParams;
    query: TQuery;
    user?: {
        userId: string;
        role: string;
        companyId?: string;
    isLgdealSupervisor?: boolean;
    isLgdealIncStaff?: boolean;
    isLgdealAdmin?: boolean;
        isImpersonation?: boolean;
        originalUserId?: string;
        emailVerified?: boolean;
    };
}

// ---- Main Validation Middleware ----

export function validate(schemas: ValidationSchemas) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Validate request body
            if (schemas.body) {
                req.body = await schemas.body.parseAsync(req.body);
            }

            // Validate route parameters
            if (schemas.params) {
                const validatedParams = await schemas.params.parseAsync(req.params);
                // Create a new request object with validated params
                Object.defineProperty(req, 'params', {
                    value: validatedParams,
                    writable: true,
                    configurable: true
                });
            }

            // Validate query parameters
            if (schemas.query) {
                const validatedQuery = await schemas.query.parseAsync(req.query);
                // Instead of modifying req.query directly, we'll pass the validated data to the controller
                (req as Request & { validatedQuery?: Record<string, unknown> }).validatedQuery = validatedQuery;
            }

            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const errorMessage = formatZodError(error);
                // Детальное логирование ошибок валидации
                logger.error('[Validation] Validation failed', {
                    path: req.path,
                    method: req.method,
                    body: JSON.stringify(req.body, null, 2),
                    errors: error.errors.map(err => ({
                        path: err.path.join('.'),
                        message: err.message,
                        code: err.code
                    }))
                });
                next(new ValidationError(errorMessage));
            } else {
                next(error);
            }
        }
    };
}

// ---- Individual Validation Functions ----

export function validateBody<T>(schema: ZodSchema<T>) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            req.body = await schema.parseAsync(req.body);
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const errorMessage = formatZodError(error);
                logger.error('[Validation] Body validation failed', {
                    path: req.path,
                    method: req.method,
                    body: JSON.stringify(req.body, null, 2),
                    errors: error.errors.map(err => ({
                        path: err.path.join('.'),
                        message: err.message,
                        code: err.code
                    }))
                });
                next(new ValidationError(errorMessage));
            } else {
                next(error);
            }
        }
    };
}

export function validateParams<T>(schema: ZodSchema<T>) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const validatedParams = await schema.parseAsync(req.params);
            Object.defineProperty(req, 'params', {
                value: validatedParams,
                writable: true,
                configurable: true
            });
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const errorMessage = formatZodError(error);
                next(new ValidationError(errorMessage));
            } else {
                next(error);
            }
        }
    };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            req.query = await schema.parseAsync(req.query) as ParsedQs;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const errorMessage = formatZodError(error);
                next(new ValidationError(errorMessage));
            } else {
                next(error);
            }
        }
    };
}

// ---- Validation Helpers ----

export function formatZodError(error: ZodError): string {
    const errors = error.errors.map(err => {
        const path = err.path.join('.');
        return path ? `${path}: ${err.message}` : err.message;
    });

    return `Validation failed: ${errors.join('; ')}`;
}

export function validateSync<T>(schema: ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data);
    if (!result.success) {
        throw new ValidationError(formatZodError(result.error));
    }
    return result.data;
}

export async function validateAsync<T>(schema: ZodSchema<T>, data: unknown): Promise<T> {
    try {
        return await schema.parseAsync(data);
    } catch (error) {
        if (error instanceof ZodError) {
            throw new ValidationError(formatZodError(error));
        }
        throw error;
    }
}

// ---- File Upload Validation ----

export function validateFileUpload(
    allowedMimeTypes: string[],
    maxSizeBytes: number = 10 * 1024 * 1024 // 10MB default
) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.file) {
            next(new ValidationError('File is required'));
            return;
        }

        const file = req.file;

        // Check file size
        if (file.size > maxSizeBytes) {
            const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024));
            next(new ValidationError(`File size exceeds ${maxSizeMB}MB limit`));
            return;
        }

        // Check MIME type
        if (!allowedMimeTypes.includes(file.mimetype)) {
            next(new ValidationError(`File type ${file.mimetype} not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`));
            return;
        }

        next();
    };
}

// ---- Multiple Files Upload Validation ----

export function validateMultipleFileUpload(
    allowedMimeTypes: string[],
    maxSizeBytes: number = 10 * 1024 * 1024, // 10MB default
    maxFiles: number = 5
) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
            next(new ValidationError('At least one file is required'));
            return;
        }

        const files = req.files as Express.Multer.File[];

        // Check number of files
        if (files.length > maxFiles) {
            next(new ValidationError(`Too many files. Maximum allowed: ${maxFiles}`));
            return;
        }

        // Validate each file
        for (const file of files) {
            // Check file size
            if (file.size > maxSizeBytes) {
                const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024));
                next(new ValidationError(`File ${file.originalname} exceeds ${maxSizeMB}MB limit`));
                return;
            }

            // Check MIME type
            if (!allowedMimeTypes.includes(file.mimetype)) {
                next(new ValidationError(`File type ${file.mimetype} not allowed for ${file.originalname}. Allowed types: ${allowedMimeTypes.join(', ')}`));
                return;
            }
        }

        next();
    };
}

// ---- Conditional Validation ----

export function validateIf(
    condition: (req: Request) => boolean,
    schemas: ValidationSchemas
) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (condition(req)) {
            await validate(schemas)(req, res, next);
        } else {
            next();
        }
    };
}

// ---- Array Validation ----

export function validateArray<T>(
    schema: ZodSchema<T>,
    path: string = 'body'
) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const data = path === 'body' ? req.body : 
                        path === 'query' ? req.query : 
                        req.params;

            if (!Array.isArray(data)) {
                next(new ValidationError(`${path} must be an array`));
                return;
            }

            // Validate each item in the array
            const validatedArray = [];
            for (let i = 0; i < data.length; i++) {
                try {
                    const validatedItem = await schema.parseAsync(data[i]);
                    validatedArray.push(validatedItem);
                } catch (error) {
                    if (error instanceof ZodError) {
                        const errorMessage = `Item ${i}: ${formatZodError(error)}`;
                        next(new ValidationError(errorMessage));
                        return;
                    }
                    throw error;
                }
            }

            // Replace the original data with validated data
            if (path === 'body') {
                req.body = validatedArray;
            } else if (path === 'query') {
                // Query and params are complex Express types, use unknown assertion
                req.query = validatedArray as unknown as ParsedQs;
            } else {
                req.params = validatedArray as unknown as ParamsDictionary;
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

// ---- Export commonly used validation middleware combinations ----

export const validateObjectId = validateParams(z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format')
}));

export const validatePagination = validateQuery(z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
}));

// z is already imported at the top 