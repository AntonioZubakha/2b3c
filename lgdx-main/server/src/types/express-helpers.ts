/**
 * Express Type Helpers
 * 
 * Утилитные типы для правильной типизации Express контроллеров и middleware
 * без использования 'as any'
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';

/**
 * Async Request Handler
 * 
 * Тип для async контроллеров, который совместим с Express.RequestHandler
 * Поддерживает Promise<void | Response> возвращаемое значение
 * 
 * Использует any для req чтобы поддерживать расширенные типы Request (AuthenticatedRequest и т.д.)
 */
export type AsyncRequestHandler<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = ParsedQs,
  Locals extends Record<string, any> = Record<string, any>
> = (
  req: any, // Используем any чтобы принимать AuthenticatedRequest и другие расширения
  res: Response<ResBody, Locals>,
  next: NextFunction
) => Promise<void | Response<ResBody, Locals>> | void | Response<ResBody, Locals>;

/**
 * Wrapper для преобразования async handler в стандартный RequestHandler
 * 
 * Автоматически ловит ошибки из async функций и передает их в next()
 * Использует any для поддержки расширенных типов Request
 */
export const asyncHandler = (
  fn: (req: any, res: any, next: NextFunction) => Promise<any> | any
): RequestHandler => {
  return ((req, res, next) => {
    const result = fn(req, res, next);
    if (result && typeof result.then === 'function') {
      result.catch(next);
    }
  }) as RequestHandler;
};

/**
 * Type assertion helper для Express middleware
 * 
 * Используется для приведения middleware к правильному типу без 'as any'
 * Например: asMiddleware(authMiddleware) вместо authMiddleware as any
 */
export const asMiddleware = <T extends RequestHandler>(middleware: T): RequestHandler => {
  return middleware as RequestHandler;
};

/**
 * Type-safe wrapper для rate limiter middleware
 * 
 * Express-rate-limit имеет свой тип, который не всегда совместим с RequestHandler
 */
export const asRateLimiter = (limiter: any): RequestHandler => {
  return limiter as RequestHandler;
};

