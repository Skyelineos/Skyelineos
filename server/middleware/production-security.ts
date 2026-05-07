import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';

// Simple production security middleware without circular dependencies
export function createProductionSecurityMiddleware() {
  // Basic rate limiting with higher limits for development
  const rateLimitMiddleware = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 
         parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100') : 
         1000, // Much higher limit for development
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests from this IP, please try again later.',
    },
    skip: (req: Request) => {
      // Skip rate limiting for health checks and in development for certain paths
      if (req.path === '/api/health' || req.path === '/health') return true;
      if (process.env.NODE_ENV !== 'production' && req.path.startsWith('/src/')) return true;
      return false;
    },
  });

  // CORS middleware
  const corsMiddleware = cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      
      const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'];
      
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
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

  // Security headers
  const securityHeaders = helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
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
    } : false,
    
    hsts: process.env.NODE_ENV === 'production' ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    } : false,
    
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  return {
    rateLimitMiddleware,
    corsMiddleware,
    securityHeaders,
  };
}

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