import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { Request, Response, NextFunction } from 'express';

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Patterns for redacting sensitive information
const SENSITIVE_PATTERNS = {
  // Authorization headers and tokens
  authorization: /authorization:\s*bearer\s+[^\s,}]+/gi,
  cookie: /cookie:\s*[^,}]+/gi,
  setCookie: /set-cookie:\s*[^,}]+/gi,
  token: /(["\']?(?:access_?token|refresh_?token|api_?key|secret|password)["\']?\s*:\s*)[^,}\s"']+/gi,
  jwt: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  
  // PII patterns
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
};

/**
 * Redacts sensitive information from logs
 */
function redactSensitiveInfo(input: any): any {
  if (typeof input === 'string') {
    let redacted = input;
    
    // Redact authorization headers and tokens
    redacted = redacted.replace(SENSITIVE_PATTERNS.authorization, 'authorization: [REDACTED]');
    redacted = redacted.replace(SENSITIVE_PATTERNS.cookie, 'cookie: [REDACTED]');
    redacted = redacted.replace(SENSITIVE_PATTERNS.setCookie, 'set-cookie: [REDACTED]');
    redacted = redacted.replace(SENSITIVE_PATTERNS.token, '$1[REDACTED]');
    redacted = redacted.replace(SENSITIVE_PATTERNS.jwt, '[JWT_TOKEN_REDACTED]');
    
    // Redact PII
    redacted = redacted.replace(SENSITIVE_PATTERNS.email, '[EMAIL_REDACTED]');
    redacted = redacted.replace(SENSITIVE_PATTERNS.phone, '[PHONE_REDACTED]');
    redacted = redacted.replace(SENSITIVE_PATTERNS.ssn, '[SSN_REDACTED]');
    redacted = redacted.replace(SENSITIVE_PATTERNS.creditCard, '[CARD_REDACTED]');
    
    return redacted;
  }
  
  if (Array.isArray(input)) {
    return input.map(item => redactSensitiveInfo(item));
  }
  
  if (typeof input === 'object' && input !== null) {
    const redacted: any = {};
    
    for (const [key, value] of Object.entries(input)) {
      const lowerKey = key.toLowerCase();
      
      // Redact sensitive headers and fields
      if (lowerKey.includes('authorization') || 
          lowerKey.includes('token') || 
          lowerKey.includes('secret') || 
          lowerKey.includes('password') ||
          lowerKey.includes('cookie')) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitiveInfo(value);
      }
    }
    
    return redacted;
  }
  
  return input;
}

/**
 * Safely truncates large objects for logging
 */
function truncateForLogging(obj: any, maxLength: number = 1000): any {
  if (typeof obj === 'string') {
    return obj.length > maxLength ? `${obj.substring(0, maxLength)}...` : obj;
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const str = JSON.stringify(obj);
    if (str.length > maxLength) {
      return `[LARGE_OBJECT: ${str.length} chars, truncated: ${str.substring(0, maxLength)}...]`;
    }
    return obj;
  }
  
  return obj;
}

// Define log levels with priorities
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Custom colors for log levels
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to winston
winston.addColors(logColors);

// Custom format for structured logging with redaction
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, requestId, ...meta } = info;
    
    let logEntry: any = {
      timestamp,
      level,
      message: redactSensitiveInfo(message),
    };
    
    if (requestId) {
      logEntry.requestId = requestId;
    }
    
    if (Object.keys(meta).length > 0) {
      // Apply redaction and truncation to metadata
      const sanitizedMeta = redactSensitiveInfo(meta);
      const truncatedMeta = isProduction ? truncateForLogging(sanitizedMeta, 500) : sanitizedMeta;
      logEntry = { ...logEntry, ...truncatedMeta };
    }
    
    return JSON.stringify(logEntry);
  })
);

// Console format for development with redaction
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, requestId, ...meta } = info;
    const sanitizedMeta = redactSensitiveInfo(meta);
    const metaString = Object.keys(sanitizedMeta).length ? ` ${JSON.stringify(sanitizedMeta, null, 2)}` : '';
    const reqId = requestId ? `[${requestId}] ` : '';
    const redactedMessage = redactSensitiveInfo(message);
    return `${timestamp} ${level}: ${reqId}${redactedMessage}${metaString}`;
  })
);

// Create transports array
const transports: winston.transport[] = [];

// Console transport (always enabled in development)
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'debug',
      format: consoleFormat,
    })
  );
}

// File transports for production and development
const logDir = process.env.LOG_DIR || './logs';

// Error logs - separate file for errors only
transports.push(
  new DailyRotateFile({
    filename: `${logDir}/error-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true,
  })
);

// Combined logs - all levels
transports.push(
  new DailyRotateFile({
    filename: `${logDir}/combined-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '30d',
    zippedArchive: true,
  })
);

// HTTP request logs
transports.push(
  new DailyRotateFile({
    filename: `${logDir}/http-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    level: 'http',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '7d',
    zippedArchive: true,
  })
);

// Create the main logger
export const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transports,
  exitOnError: false,
  // Prevent winston from catching and handling uncaught exceptions
  handleExceptions: false,
  handleRejections: false,
});

// Helper function to create child logger with request context (redacted)
export function createRequestLogger(req: Request & { id?: string }): winston.Logger {
  const userAgent = req.get('User-Agent');
  return logger.child({
    requestId: req.id,
    method: req.method,
    url: req.url,
    userAgent: userAgent ? redactSensitiveInfo(userAgent) : undefined,
    ip: req.ip || req.connection.remoteAddress,
    userId: (req as any).user?.id,
  });
}

// Express middleware for request logging with sensitive data redaction
export function loggerMiddleware(req: Request & { id?: string }, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const reqLogger = createRequestLogger(req);
  
  // Attach logger to request object
  (req as any).logger = reqLogger;
  
  // Prepare request body for logging (redacted and truncated)
  let logBody = undefined;
  if (req.method !== 'GET' && req.body) {
    const redactedBody = redactSensitiveInfo(req.body);
    logBody = isProduction ? truncateForLogging(redactedBody, 200) : redactedBody;
  }
  
  // Prepare query params for logging (redacted)
  let logQuery = undefined;
  if (Object.keys(req.query).length) {
    logQuery = redactSensitiveInfo(req.query);
  }
  
  // Log incoming request
  reqLogger.http('Incoming request', {
    body: logBody,
    query: logQuery,
    headers: isProduction ? '[HEADERS_REDACTED]' : redactSensitiveInfo({
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      origin: req.get('Origin'),
      referer: req.get('Referer')
    })
  });
  
  // Capture original res.json to log responses
  const originalJson = res.json;
  res.json = function(body: any) {
    const duration = Date.now() - startTime;
    
    // In production, don't log full response bodies
    let responseInfo: any = {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      success: res.statusCode < 400,
    };
    
    if (!isProduction) {
      // In development, log response size and truncated body for debugging
      responseInfo.responseSize = JSON.stringify(body).length;
      if (res.statusCode >= 400) {
        responseInfo.responseBody = truncateForLogging(redactSensitiveInfo(body), 300);
      }
    } else {
      // In production, only log response size
      responseInfo.responseSize = body ? JSON.stringify(body).length : 0;
    }
    
    // Log response
    reqLogger.http('Request completed', responseInfo);
    
    return originalJson.call(this, body);
  };
  
  // Handle response finish for cases where res.json isn't called
  res.on('finish', () => {
    if (!res.headersSent) return;
    
    const duration = Date.now() - startTime;
    
    // Only log if we haven't already logged via res.json
    if (res.statusCode >= 400) {
      reqLogger.warn('Request completed with error', {
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      });
    }
  });
  
  next();
}

// Utility functions for structured logging
export const logUtils = {
  // Database operations
  logDbOperation: (operation: string, table: string, duration?: number, error?: Error) => {
    const logData = {
      operation,
      table,
      ...(duration && { duration: `${duration}ms` }),
      ...(error && { error: error.message, stack: error.stack }),
    };
    
    if (error) {
      logger.error('Database operation failed', logData);
    } else {
      logger.debug('Database operation completed', logData);
    }
  },
  
  // Authentication events (with email redaction)
  logAuthEvent: (event: string, userId?: string | number, email?: string, success: boolean = true) => {
    const logData = {
      event,
      ...(userId && { userId: userId.toString() }),
      ...(email && { email: isProduction ? '[EMAIL_REDACTED]' : email }),
      success,
    };
    
    if (success) {
      logger.info('Authentication event', logData);
    } else {
      logger.warn('Authentication failed', logData);
    }
  },
  
  // Business logic events (with sensitive data redaction)
  logBusinessEvent: (event: string, context: Record<string, any> = {}) => {
    const redactedContext = redactSensitiveInfo(context);
    const truncatedContext = isProduction ? truncateForLogging(redactedContext, 300) : redactedContext;
    logger.info('Business event', { event, ...truncatedContext });
  },
  
  // External API calls (with URL redaction if contains sensitive info)
  logApiCall: (url: string, method: string, status?: number, duration?: number, error?: Error) => {
    const logData = {
      url: redactSensitiveInfo(url),
      method,
      ...(status && { status }),
      ...(duration && { duration: `${duration}ms` }),
      ...(error && { error: redactSensitiveInfo(error.message) }),
    };
    
    if (error || (status && status >= 400)) {
      logger.error('External API call failed', logData);
    } else {
      logger.debug('External API call completed', logData);
    }
  },
  
  // Utility function to redact sensitive info in user data
  redactUserData: (userData: any): any => {
    if (!userData) return userData;
    return redactSensitiveInfo(userData);
  },
};

// Create logs directory if it doesn't exist
import fs from 'fs';
import path from 'path';

const logsDir = path.resolve(logDir);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Export default logger
export default logger;