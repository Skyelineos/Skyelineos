#!/usr/bin/env tsx

/**
 * Production server entry point
 * This file provides production-specific optimizations and configurations
 */

import express from 'express';
import { createServer } from 'http';
import { initializeProductionServices, productionConfig } from './config';
import { 
  corsMiddleware, 
  rateLimitMiddleware, 
  authRateLimitMiddleware,
  securityHeadersMiddleware,
  fileUploadSecurityMiddleware,
  requestLoggingMiddleware,
  apiSecurityMiddleware
} from './middleware/security';
import { 
  shortCache, 
  mediumCache, 
  userCache 
} from './middleware/caching';
import { registerRoutes } from './routes';
import { validateEnvironment } from './middleware/requireEnv';
import { logger } from './logger';

async function startProductionServer() {
  try {
    // Validate environment variables
    validateEnvironment();
    
    // Initialize production services
    await initializeProductionServices();
    
    const app = express();
    const port = process.env.PORT || 5000;

    // Trust proxy for accurate IP addresses
    app.set('trust proxy', true);

    // Security middleware - order matters!
    app.use(securityHeadersMiddleware);
    app.use(corsMiddleware);
    app.use(rateLimitMiddleware);
    app.use(requestLoggingMiddleware);

    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // API security for all API routes
    app.use('/api', apiSecurityMiddleware);
    
    // Auth endpoints get stricter rate limiting
    app.use('/api/auth', authRateLimitMiddleware);
    
    // File upload security
    app.use('/api/upload', fileUploadSecurityMiddleware);

    // Caching strategies for different endpoints
    app.use('/api/projects', userCache(300)); // 5 min cache for projects
    app.use('/api/public', mediumCache(1800)); // 30 min cache for public data
    app.use('/api/health', shortCache(60)); // 1 min cache for health

    // Register application routes
    const server = await registerRoutes(app);

    // Start server
    server.listen(port, '0.0.0.0', () => {
      logger.info(`🚀 Production server running on port ${port}`);
      logger.info(`🔒 Security features enabled: CORS, Rate Limiting, Security Headers`);
      
      if (productionConfig.redis.url) {
        logger.info(`⚡ Redis caching enabled`);
      }
      
      if (productionConfig.monitoring.sentryDsn) {
        logger.info(`📊 Sentry error monitoring enabled`);
      }
    });

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start production server:', error);
    process.exit(1);
  }
}

// Start the server
startProductionServer();