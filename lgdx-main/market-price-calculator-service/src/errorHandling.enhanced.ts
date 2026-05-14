import winston from 'winston';

/**
 * Улучшенная система обработки ошибок и защитных механизмов
 * для микросервиса расчета маркетпрайсов
 */

export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CALCULATION_ERROR = 'CALCULATION_ERROR',
  DATA_QUALITY_ERROR = 'DATA_QUALITY_ERROR',
  BUSINESS_LOGIC_ERROR = 'BUSINESS_LOGIC_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface IErrorContext {
  operation: string;
  categoryKey?: string;
  productId?: string;
  inputData?: Record<string, unknown>;
  expectedRange?: [number, number];
  actualValue?: number | string | boolean | null;
  timestamp: Date;
  recoveryAction?: string;
}

export interface IEnhancedError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  context: IErrorContext;
  originalError?: Error | undefined;
  recoverable: boolean;
  suggestedAction: string;
}

/**
 * Центральный обработчик ошибок с контекстной информацией
 */
export class EnhancedErrorHandler {
  private readonly logger: winston.Logger;
  private errorStats: Map<ErrorType, number> = new Map();
  private recentErrors: IEnhancedError[] = [];
  private readonly MAX_RECENT_ERRORS = 100;

  constructor(logger: winston.Logger) {
    this.logger = logger;
    this.initializeErrorStats();
  }

  /**
   * Обработка ошибки с контекстом
   */
  public handleError(
    type: ErrorType,
    severity: ErrorSeverity,
    message: string,
    context: IErrorContext,
    originalError?: Error
  ): IEnhancedError {
    
    const enhancedError: IEnhancedError = {
      type,
      severity,
      message,
      context,
      originalError,
      recoverable: this.isRecoverable(type, severity),
      suggestedAction: this.getSuggestedAction(type, context)
    };

    this.logError(enhancedError);
    this.updateErrorStats(type);
    this.addToRecentErrors(enhancedError);

    return enhancedError;
  }

  /**
   * Валидация входных данных с детальной диагностикой
   */
  public validateInputData(data: Record<string, unknown>, _context: IErrorContext): IValidationResult {
    const issues: IValidationIssue[] = [];

    if (data === null || data === undefined) {
      issues.push({
        field: 'data',
        issue: 'null_or_undefined',
        severity: ErrorSeverity.CRITICAL,
        message: 'Input data is null or undefined'
      });
    }

    if (Array.isArray(data) && data.length === 0) {
      issues.push({
        field: 'data',
        issue: 'empty_array',
        severity: ErrorSeverity.HIGH,
        message: 'Input data array is empty'
      });
    }

    return {
      isValid: issues.length === 0,
      issues,
      canProceed: issues.filter(i => i.severity === ErrorSeverity.CRITICAL).length === 0
    };
  }

  /**
   * Валидация цены с контекстом
   */
  public validatePrice(
    price: number, 
    _context: IErrorContext,
    minPrice: number = 1,
    maxPrice: number = 1000000
  ): IValidationResult {
    const issues: IValidationIssue[] = [];

    if (typeof price !== 'number') {
      issues.push({
        field: 'price',
        issue: 'invalid_type',
        severity: ErrorSeverity.CRITICAL,
        message: `Price must be a number, got ${typeof price}`
      });
    } else {
      if (isNaN(price)) {
        issues.push({
          field: 'price',
          issue: 'nan_value',
          severity: ErrorSeverity.CRITICAL,
          message: 'Price is NaN'
        });
      }

      if (!isFinite(price)) {
        issues.push({
          field: 'price',
          issue: 'infinite_value',
          severity: ErrorSeverity.CRITICAL,
          message: 'Price is infinite'
        });
      }

      if (price <= 0) {
        issues.push({
          field: 'price',
          issue: 'non_positive',
          severity: ErrorSeverity.HIGH,
          message: `Price must be positive, got ${price}`
        });
      }

      if (price < minPrice) {
        issues.push({
          field: 'price',
          issue: 'below_minimum',
          severity: ErrorSeverity.MEDIUM,
          message: `Price ${price} is below minimum ${minPrice}`
        });
      }

      if (price > maxPrice) {
        issues.push({
          field: 'price',
          issue: 'above_maximum',
          severity: ErrorSeverity.MEDIUM,
          message: `Price ${price} is above maximum ${maxPrice}`
        });
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      canProceed: issues.filter(i => i.severity === ErrorSeverity.CRITICAL).length === 0
    };
  }

  /**
   * Валидация коэффициента
   */
  public validateCoefficient(
    coefficient: number,
    _context: IErrorContext,
    minCoeff: number = 1.0,
    maxCoeff: number = 10.0
  ): IValidationResult {
    return this.validatePrice(coefficient, _context, minCoeff, maxCoeff);
  }

  /**
   * Создание безопасного fallback значения
   */
  public createSafeFallback<T>(
    operation: string,
    fallbackValue: T,
    reason: string,
    context: IErrorContext
  ): ISafeFallback<T> {
    
    this.logger.warn(`Using fallback value for ${operation}: ${reason}`, {
      operation,
      fallbackValue,
      reason,
      context
    });

    return {
      value: fallbackValue,
      isFallback: true,
      reason,
      context,
      timestamp: new Date()
    };
  }

  /**
   * Попытка восстановления после ошибки
   */
  public async attemptRecovery<T>(
    operation: () => Promise<T>,
    recoveryStrategies: IRecoveryStrategy<T>[],
    context: IErrorContext,
    maxAttempts: number = 3
  ): Promise<IRecoveryResult<T>> {
    
    let lastError: Error | null = null;
    let attempt = 0;

    // Попытка основной операции
    try {
      const result = await operation();
      return {
        success: true,
        result,
        attemptsUsed: 1,
        recoveryStrategy: null
      };
    } catch (error) {
      lastError = error as Error;
      this.logger.warn(`Primary operation failed: ${error}`, { context });
    }

    // Попытки восстановления
    for (const strategy of recoveryStrategies) {
      if (attempt >= maxAttempts) break;
      
      try {
        attempt++;
        this.logger.info(`Attempting recovery strategy: ${strategy.name}`, { attempt, context });
        
        const result = await strategy.execute(context, lastError);
        
        this.logger.info(`Recovery successful with strategy: ${strategy.name}`, { context });
        
        return {
          success: true,
          result,
          attemptsUsed: attempt + 1,
          recoveryStrategy: strategy.name
        };
      } catch (recoveryError) {
        lastError = recoveryError as Error;
        this.logger.warn(`Recovery strategy ${strategy.name} failed: ${recoveryError}`, { context });
      }
    }

    // Все попытки провалились
    const enhancedError = this.handleError(
      ErrorType.SYSTEM_ERROR,
      ErrorSeverity.HIGH,
      `All recovery attempts failed for operation: ${context.operation}`,
      context,
      lastError || undefined
    );

    return {
      success: false,
      error: enhancedError,
      attemptsUsed: attempt + 1,
      recoveryStrategy: null
    };
  }

  /**
   * Монитор состояния системы
   */
  public getSystemHealth(): ISystemHealth {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const recentErrors = this.recentErrors.filter(err => err.context.timestamp > oneHourAgo);
    const criticalErrors = recentErrors.filter(err => err.severity === ErrorSeverity.CRITICAL);
    // const highErrors = recentErrors.filter(err => err.severity === ErrorSeverity.HIGH);

    const errorRate = recentErrors.length;
    const criticalErrorRate = criticalErrors.length;

    let healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
    
    if (criticalErrorRate > 0) {
      healthStatus = 'CRITICAL';
    } else if (errorRate > 20) {
      healthStatus = 'UNHEALTHY';
    } else if (errorRate > 5) {
      healthStatus = 'DEGRADED';
    } else {
      healthStatus = 'HEALTHY';
    }

    return {
      status: healthStatus,
      errorRate,
      criticalErrorRate,
      recentErrorsByType: this.groupErrorsByType(recentErrors),
      systemRecommendations: this.generateSystemRecommendations(healthStatus, recentErrors),
      lastCheckTime: now
    };
  }

  /**
   * Получение статистики ошибок
   */
  public getErrorStats(): IErrorStats {
    return {
      totalErrors: Array.from(this.errorStats.values()).reduce((sum, count) => sum + count, 0),
      errorsByType: Object.fromEntries(this.errorStats),
      recentErrorsCount: this.recentErrors.length,
      criticalErrorsCount: this.recentErrors.filter(err => err.severity === ErrorSeverity.CRITICAL).length
    };
  }

  // Приватные методы

  private initializeErrorStats(): void {
    Object.values(ErrorType).forEach(type => {
      this.errorStats.set(type, 0);
    });
  }

  private isRecoverable(type: ErrorType, severity: ErrorSeverity): boolean {
    if (severity === ErrorSeverity.CRITICAL) return false;
    
    const recoverableTypes = [
      ErrorType.EXTERNAL_API_ERROR,
      ErrorType.DATA_QUALITY_ERROR,
      ErrorType.VALIDATION_ERROR
    ];
    
    return recoverableTypes.includes(type);
  }

  private getSuggestedAction(type: ErrorType, _context: IErrorContext): string {
    switch (type) {
      case ErrorType.VALIDATION_ERROR:
        return 'Check input data format and validate required fields';
      case ErrorType.DATA_QUALITY_ERROR:
        return 'Review data quality and consider applying data cleaning procedures';
      case ErrorType.CALCULATION_ERROR:
        return 'Verify calculation parameters and input values';
      case ErrorType.BUSINESS_LOGIC_ERROR:
        return 'Review business rules and logic implementation';
      case ErrorType.EXTERNAL_API_ERROR:
        return 'Check external API availability and implement retry logic';
      case ErrorType.SYSTEM_ERROR:
        return 'Check system resources and logs for underlying issues';
      default:
        return 'Review error details and implement appropriate handling';
    }
  }

  private logError(error: IEnhancedError): void {
    const logLevel = this.getLogLevel(error.severity);
    
    this.logger[logLevel](`[${error.type}] ${error.message}`, {
      type: error.type,
      severity: error.severity,
      context: error.context,
      recoverable: error.recoverable,
      suggestedAction: error.suggestedAction,
      originalError: error.originalError?.message
    });
  }

  private getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'warn';
    }
  }

  private updateErrorStats(type: ErrorType): void {
    const current = this.errorStats.get(type) || 0;
    this.errorStats.set(type, current + 1);
  }

  private addToRecentErrors(error: IEnhancedError): void {
    this.recentErrors.push(error);
    
    if (this.recentErrors.length > this.MAX_RECENT_ERRORS) {
      this.recentErrors.shift();
    }
  }

  private groupErrorsByType(errors: IEnhancedError[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    
    errors.forEach(error => {
      grouped[error.type] = (grouped[error.type] || 0) + 1;
    });
    
    return grouped;
  }

  private generateSystemRecommendations(
    status: string, 
    recentErrors: IEnhancedError[]
  ): string[] {
    const recommendations: string[] = [];
    
    if (status === 'CRITICAL') {
      recommendations.push('Immediate attention required - critical errors detected');
      recommendations.push('Consider stopping operation until issues are resolved');
    }
    
    if (status === 'UNHEALTHY') {
      recommendations.push('High error rate detected - investigate system health');
      recommendations.push('Consider reducing processing load');
    }
    
    const errorsByType = this.groupErrorsByType(recentErrors);
    
    if ((errorsByType[ErrorType.EXTERNAL_API_ERROR] || 0) > 3) {
      recommendations.push('Multiple external API errors - check API availability');
    }
    
    if ((errorsByType[ErrorType.DATA_QUALITY_ERROR] || 0) > 5) {
      recommendations.push('Data quality issues detected - review input data sources');
    }
    
    return recommendations;
  }
}

// Интерфейсы для системы обработки ошибок

export interface IValidationIssue {
  field: string;
  issue: string;
  severity: ErrorSeverity;
  message: string;
}

export interface IValidationResult {
  isValid: boolean;
  issues: IValidationIssue[];
  canProceed: boolean;
}

export interface ISafeFallback<T> {
  value: T;
  isFallback: boolean;
  reason: string;
  context: IErrorContext;
  timestamp: Date;
}

export interface IRecoveryStrategy<T> {
  name: string;
  canHandle: (error: Error) => boolean;
  execute: (context: IErrorContext, error: Error | null) => Promise<T>;
}

export interface IRecoveryResult<T> {
  success: boolean;
  result?: T;
  error?: IEnhancedError;
  attemptsUsed: number;
  recoveryStrategy: string | null;
}

export interface ISystemHealth {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
  errorRate: number;
  criticalErrorRate: number;
  recentErrorsByType: Record<string, number>;
  systemRecommendations: string[];
  lastCheckTime: Date;
}

export interface IErrorStats {
  totalErrors: number;
  errorsByType: Record<string, number>;
  recentErrorsCount: number;
  criticalErrorsCount: number;
}

/**
 * Утилитарные функции для безопасных операций
 */
export class SafeOperations {
  
  /**
   * Безопасное деление с проверкой на ноль
   */
  static safeDivide(
    numerator: number, 
    denominator: number, 
    fallback: number = 0,
    _context?: IErrorContext
  ): number {
    if (denominator === 0 || !isFinite(denominator)) {
      return fallback;
    }
    
    const result = numerator / denominator;
    
    if (!isFinite(result) || isNaN(result)) {
      return fallback;
    }
    
    return result;
  }

  /**
   * Безопасный логарифм
   */
  static safeLog(
    value: number, 
    fallback: number = 0,
    _context?: IErrorContext
  ): number {
    if (value <= 0 || !isFinite(value) || isNaN(value)) {
      return fallback;
    }
    
    const result = Math.log(value);
    
    if (!isFinite(result) || isNaN(result)) {
      return fallback;
    }
    
    return result;
  }

  /**
   * Безопасное извлечение квадратного корня
   */
  static safeSqrt(
    value: number, 
    fallback: number = 0,
    _context?: IErrorContext
  ): number {
    if (value < 0 || !isFinite(value) || isNaN(value)) {
      return fallback;
    }
    
    const result = Math.sqrt(value);
    
    if (!isFinite(result) || isNaN(result)) {
      return fallback;
    }
    
    return result;
  }

  /**
   * Безопасное ограничение значения в пределах диапазона
   */
  static safeClamp(
    value: number, 
    min: number, 
    max: number,
    fallback?: number
  ): number {
    if (!isFinite(value) || isNaN(value)) {
      return fallback !== undefined ? fallback : min;
    }
    
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Безопасное округление с заданной точностью
   */
  static safeRound(
    value: number, 
    decimals: number = 2,
    fallback: number = 0
  ): number {
    if (!isFinite(value) || isNaN(value)) {
      return fallback;
    }
    
    const multiplier = Math.pow(10, decimals);
    return Math.round(value * multiplier) / multiplier;
  }
}

/**
 * Декораторы для автоматической обработки ошибок
 */
export function withErrorHandling(
  errorHandler: EnhancedErrorHandler,
  errorType: ErrorType,
  operation: string
) {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: unknown[]) {
      const context: IErrorContext = {
        operation: `${String(target)}.${propertyKey}`,
        timestamp: new Date()
      };
      
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const enhancedError = errorHandler.handleError(
          errorType,
          ErrorSeverity.HIGH,
          `Error in ${operation}`,
          context,
          error as Error
        );
        
        if (!enhancedError.recoverable) {
          throw enhancedError;
        }
        
        // Попытка предоставить fallback значение
        return null;
      }
    };
    
    return descriptor;
  };
}
