import helmet from 'helmet';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { Request, Response, NextFunction } from 'express';
import { productionConfig, isProduction } from '../config/production';

// Enhanced CORS configuration
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = productionConfig.security.corsOrigins;
    
    if (allowedOrigins.includes(origin) || !isProduction) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token'
  ],
});

// Enhanced rate limiting
export const rateLimitMiddleware: RateLimitRequestHandler = rateLimit({
  windowMs: productionConfig.rateLimiting.windowMs,
  max: productionConfig.rateLimiting.max,
  standardHeaders: productionConfig.rateLimiting.standardHeaders,
  legacyHeaders: productionConfig.rateLimiting.legacyHeaders,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(productionConfig.rateLimiting.windowMs / 1000),
  },
  skip: (req: Request) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health' || req.path === '/health';
  },
});

// Strict rate limiting for auth endpoints
export const authRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 900, // 15 minutes
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security headers configuration
export const securityHeadersMiddleware = helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      connectSrc: ["'self'", "wss:", "https:"],
    },
  } : false, // Disable CSP in development for easier debugging
  
  hsts: isProduction ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  } : false,
  
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

// File upload security middleware
export const fileUploadSecurityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Check file size
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > productionConfig.fileUpload.maxSize) {
    return res.status(413).json({
      error: 'File too large',
      maxSize: productionConfig.fileUpload.maxSize,
    });
  }

  // Check content type if provided
  const contentType = req.headers['content-type'];
  if (contentType && !productionConfig.fileUpload.allowedTypes.includes(contentType.split(';')[0])) {
    return res.status(415).json({
      error: 'Unsupported file type',
      allowedTypes: productionConfig.fileUpload.allowedTypes,
    });
  }

  next();
};

// IP whitelist middleware (for admin endpoints)
export const ipWhitelistMiddleware = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIP = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) || req.ip || 'unknown';
    
    if (isProduction && !allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        error: 'Access denied: IP not whitelisted',
      });
    }
    
    next();
  };
};

// Request logging middleware
export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for'] || req.ip,
    };
    
    if (res.statusCode >= 400) {
      console.error('Request failed:', logData);
    } else if (duration > 1000) {
      console.warn('Slow request:', logData);
    }
  });
  
  next();
};

// Security headers for API responses
export const apiSecurityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Prevent caching of sensitive API responses
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  
  next();
};