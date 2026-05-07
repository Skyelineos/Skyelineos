import { Request, Response, NextFunction } from 'express';
import { logger, createRequestLogger } from '../logger';

/**
 * Custom error class for application-specific errors
 */
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;
  public details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Predefined error types for common scenarios
 */
export const ErrorTypes = {
  VALIDATION_ERROR: (message: string, details?: any) => 
    new AppError(message, 400, 'VALIDATION_ERROR', details),
  
  AUTHENTICATION_ERROR: (message: string = 'Authentication required') => 
    new AppError(message, 401, 'AUTHENTICATION_ERROR'),
  
  AUTHORIZATION_ERROR: (message: string = 'Insufficient permissions') => 
    new AppError(message, 403, 'AUTHORIZATION_ERROR'),
  
  NOT_FOUND: (resource: string = 'Resource') => 
    new AppError(`${resource} not found`, 404, 'NOT_FOUND'),
  
  CONFLICT: (message: string) => 
    new AppError(message, 409, 'CONFLICT'),
  
  RATE_LIMIT: (message: string = 'Rate limit exceeded') => 
    new AppError(message, 429, 'RATE_LIMIT_EXCEEDED'),
  
  EXTERNAL_SERVICE_ERROR: (service: string, message?: string) => 
    new AppError(message || `${service} service unavailable`, 503, 'EXTERNAL_SERVICE_ERROR'),
  
  DATABASE_ERROR: (message: string = 'Database operation failed') => 
    new AppError(message, 500, 'DATABASE_ERROR'),
};

/**
 * Interface for standardized error responses
 */
interface ErrorResponse {
  error: string;
  code: string;
  timestamp: string;
  requestId?: string;
  details?: any;
  stack?: string;
}

/**
 * Determine if an error should expose details to the client
 */
function isOperationalError(error: any): boolean {
  return error instanceof AppError && error.isOperational;
}

/**
 * Sanitize error message for client response
 */
function sanitizeErrorMessage(error: any, isProduction: boolean): string {
  // Always show operational error messages
  if (isOperationalError(error)) {
    return error.message;
  }
  
  // In development, show all error messages
  if (!isProduction) {
    return error.message || 'An error occurred';
  }
  
  // In production, hide internal error details
  return 'Internal server error';
}

/**
 * Get appropriate status code from error
 */
function getStatusCode(error: any): number {
  if (error.statusCode && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  
  if (error.status && typeof error.status === 'number') {
    return error.status;
  }
  
  // Handle specific error types
  if (error.name === 'ValidationError') return 400;
  if (error.name === 'UnauthorizedError') return 401;
  if (error.name === 'CastError') return 400;
  if (error.name === 'MongoError' && error.code === 11000) return 409;
  
  return 500;
}

/**
 * Main error handling middleware
 */
export function errorHandler(
  error: any,
  req: Request & { id?: string },
  res: Response,
  next: NextFunction
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = getStatusCode(error);
  const requestLogger = (req as any).logger || createRequestLogger(req);
  
  // Log the error with appropriate level
  const errorLogData = {
    message: error.message,
    stack: error.stack,
    code: error.code,
    statusCode,
    url: req.url,
    method: req.method,
    body: req.body,
    query: req.query,
    userId: (req as any).user?.id,
  };
  
  if (statusCode >= 500) {
    requestLogger.error('Server error occurred', errorLogData);
  } else if (statusCode >= 400) {
    requestLogger.warn('Client error occurred', errorLogData);
  }
  
  // Prepare error response
  const errorResponse: ErrorResponse = {
    error: sanitizeErrorMessage(error, isProduction),
    code: error.code || 'UNKNOWN_ERROR',
    timestamp: new Date().toISOString(),
    requestId: req.id,
  };
  
  // Add details only for operational errors in production, or any error in development
  if (!isProduction) {
    if (error.details) {
      errorResponse.details = error.details;
    }
  } else if (isOperationalError(error) && error.details) {
    // In production, sanitize operational error details
    errorResponse.details = typeof error.details === 'string' 
      ? error.details
      : 'Additional error information available';
  }
  
  // Add stack trace in development
  if (!isProduction && error.stack) {
    errorResponse.stack = error.stack;
  }
  
  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Middleware to handle 404 errors
 */
export function notFoundHandler(req: Request & { id?: string }, res: Response, next: NextFunction): void {
  const error = new AppError(`Route ${req.method} ${req.url} not found`, 404, 'ROUTE_NOT_FOUND');
  next(error);
}

/**
 * Async wrapper to catch errors in async route handlers
 */
export function catchAsync(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Wrapper for handling promise rejections in middleware
 */
export function asyncMiddleware(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = fn(req, res, next);
    
    if (result && typeof result.catch === 'function') {
      result.catch(next);
    }
    
    return result;
  };
}

/**
 * Global exception handlers
 */
export function setupGlobalErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      message: error.message,
      stack: error.stack,
    });
    
    // Gracefully shutdown
    process.exit(1);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise: promise.toString(),
    });
    
    // Don't exit immediately, but consider graceful shutdown in production
    if (process.env.NODE_ENV === 'production') {
      setTimeout(() => process.exit(1), 1000);
    }
  });
  
  // Handle SIGTERM gracefully
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Starting graceful shutdown...');
    process.exit(0);
  });
  
  // Handle SIGINT gracefully (Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('SIGINT received. Starting graceful shutdown...');
    process.exit(0);
  });
}

// Helper function to create standardized API responses
export function createApiResponse(data: any, message?: string, meta?: any) {
  return {
    success: true,
    data,
    ...(message && { message }),
    ...(meta && { meta }),
    timestamp: new Date().toISOString(),
  };
}

// Helper function to create error responses (for controllers)
export function createErrorResponse(message: string, code: string, details?: any) {
  throw new AppError(message, 400, code, details);
}