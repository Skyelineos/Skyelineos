import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server as IOServer } from "socket.io";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
// Security middleware will be imported dynamically
import { getCorsOrigin } from "./middleware/requireEnv";
import cors from 'cors';
import { initializeScheduleOrchestrator } from "./events/handlers/scheduleOrchestrator";
import { initializeTracing, tracingMiddleware, getTracingHealth } from "./middleware/tracing";
import redisClient, { closeRedisConnection, cacheService } from "./utils/redisClient";
import { auditLogger } from "./middleware/auditLogger";
import rateLimit from "express-rate-limit";
import requestId from "express-request-id";
import { logger, loggerMiddleware } from "./logger";
import { errorHandler, notFoundHandler, setupGlobalErrorHandlers } from "./middleware/errorHandler";
import { initializeProductionServices } from "./config";
import { metricsMiddleware, metricsHandler } from "./monitoring/metrics";
import { validateEnvironment } from "./middleware/requireEnv";
import { csrfProtection } from "./middleware/csrf";
import cookieParser from "cookie-parser";

// CRITICAL SECURITY: Production Startup Hard Guard
function validateProductionSecurity(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const devBypassEnabled = process.env.ENABLE_DEV_AUTH_BYPASS === 'true';
  
  // FATAL: Prevent development auth bypass in production
  if (isProduction && devBypassEnabled) {
    console.error('🚨🚨🚨 CRITICAL SECURITY VIOLATION 🚨🚨🚨');
    console.error('');
    console.error('❌ FATAL: Development auth bypass is enabled in production environment!');
    console.error('');
    console.error('   NODE_ENV=production');
    console.error('   ENABLE_DEV_AUTH_BYPASS=true');
    console.error('');
    console.error('This is a severe security vulnerability that would allow');
    console.error('unauthorized access to production systems.');
    console.error('');
    console.error('REQUIRED ACTIONS:');
    console.error('  1. Set ENABLE_DEV_AUTH_BYPASS=false in production');
    console.error('  2. Ensure proper Firebase authentication is configured');
    console.error('  3. Review deployment configuration for security');
    console.error('');
    console.error('🚨 SERVER STARTUP TERMINATED FOR SECURITY PROTECTION 🚨');
    
    // CRITICAL: Terminate server immediately
    process.exit(1);
  }

  // Log development auth bypass status for visibility
  if (devBypassEnabled && !isProduction) {
    console.warn('⚠️⚠️⚠️ DEVELOPMENT AUTH BYPASS ACTIVE ⚠️⚠️⚠️');
    console.warn('');
    console.warn('🔓 Authentication will be bypassed in development mode');
    console.warn('🔓 All requests will be treated as admin user');
    console.warn('🔓 THIS MUST BE DISABLED IN PRODUCTION');
    console.warn('');
    console.warn('To disable: Set ENABLE_DEV_AUTH_BYPASS=false');
    console.warn('');
  }

  // Log security status for production
  if (isProduction) {
    console.log('🔒 PRODUCTION SECURITY STATUS:');
    console.log('✅ Development auth bypass: DISABLED');
    console.log('✅ Production environment: CONFIRMED');
    console.log('✅ Security guards: ACTIVE');
  }
}

// Initialize production services (async IIFE)
(async () => {
  // STEP 1: Critical security validation FIRST
  console.log('🛡️  Validating production security configuration...');
  validateProductionSecurity();

  // STEP 2: Validate environment variables
  validateEnvironment();

  // STEP 3: Initialize production services
  await initializeProductionServices();
})();

const app = express();

// Trust proxy for accurate IP addresses (critical for rate limiting)
app.set('trust proxy', true);

// Sentry will be initialized in routes setup
// Remove Sentry handler for now to fix LSP errors

// Prometheus metrics middleware
app.use(metricsMiddleware());

// Security middleware - applied in order of priority
// CORS configuration will be applied later after Socket.IO setup

// Rate limiting disabled for development - preventing "Too many requests" errors
// app.use(rateLimits.global);

// Authentication endpoints rate limiting (5 requests per minute per IP)
const authRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per window
  message: {
    error: 'Too many authentication attempts',
    code: 'RATE_LIMIT_AUTH',
    resetTime: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development' // Skip in development
});

// Bidding endpoints rate limiting (5 requests per minute per IP) 
const biddingRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per window
  message: {
    error: 'Too many bid requests',
    code: 'RATE_LIMIT_BIDS',
    resetTime: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development' // Skip in development
});

// Add compression middleware for better performance (moved to after initialization)

// Cookie parsing for JWT refresh tokens and CSRF protection (required before CSRF middleware)
app.use(cookieParser());

// CSRF protection middleware (must be after cookie parser, before routes)
app.use(csrfProtection);

// Body parsing middleware with security limits
app.use(express.json({ 
  limit: '10mb',
  strict: true, // Only parse arrays and objects
  type: 'application/json'
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 1000 // Limit number of parameters
}));

// API rate limiting disabled for development
// app.use('/api', rateLimits.api);

// Apply tracing middleware to all routes
app.use(tracingMiddleware());

// Apply audit logging to all write operations  
app.use(auditLogger);

// Note: Authentication middleware is applied per route in routes.ts
// This allows for more granular control over which endpoints require auth

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize OpenTelemetry tracing first
  log("🔍 Initializing OpenTelemetry tracing...");
  initializeTracing();
  log("✅ OpenTelemetry tracing initialized");

  // Node.js only mode - no Python FastAPI
  log("Running Node.js only with memory storage");

  // Initialize event bus handlers
  log("🎭 Initializing event bus system...");
  initializeScheduleOrchestrator();
  log("✅ Event bus system initialized");

  // Create HTTP server and Socket.IO
  const httpServer = createServer(app);
  const io = new IOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_ORIGIN || "*",
      methods: ["GET", "POST"]
    }
  });

  // Add Socket.IO authentication middleware (Firebase-compatible)
  io.use(async (socket, next) => {
    try {
      // Development auth bypass check
      const enableDevBypass = process.env.ENABLE_DEV_AUTH_BYPASS === 'true';
      const isProduction = process.env.NODE_ENV === 'production';
      
      // Use development bypass if enabled and not in production
      if (enableDevBypass && !isProduction) {
        console.warn('⚠️  Socket.IO using development auth bypass');
        socket.data.user = {
          id: 1,
          email: 'info@skyelinehomes.com',
          role: 'admin',
          permissions: ['all']
        };
        return next();
      }

      // Extract Firebase ID token from connection
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer /i,'');
      if (!token) {
        return next(new Error('Authentication required - Firebase ID token expected'));
      }
      
      // Verify Firebase ID token using Firebase Admin SDK
      const { auth } = await import('./firebaseAdmin');
      const decodedToken = await auth.verifyIdToken(token);
      if (!decodedToken) {
        return next(new Error('Invalid Firebase ID token'));
      }
      
      // For Socket.IO, use simplified user data (avoid database lookup for real-time connections)
      socket.data.user = {
        id: 1, // Simplified for Socket.IO
        email: decodedToken.email || 'unknown',
        role: 'authenticated', // Simplified role for Socket.IO
        permissions: ['socket:connect'],
        firebaseUid: decodedToken.uid
      };
      
      return next();
    } catch (error) {
      console.warn('Socket connection rejected: Firebase authentication failed', (error as Error).message);
      return next(new Error('Authentication failed'));
    }
  });

  // Make Socket.IO available to routes
  app.set('io', io);

  // Add security middleware BEFORE all other middleware and routes
  const { createProductionSecurityMiddleware, requestLoggingMiddleware } = await import('./middleware/production-security');
  const { rateLimitMiddleware, corsMiddleware, securityHeaders } = createProductionSecurityMiddleware();
  
  app.use(securityHeaders);
  app.use(corsMiddleware);
  
  // Only apply rate limiting in production
  if (process.env.NODE_ENV === 'production') {
    app.use(rateLimitMiddleware);
  }
  
  app.use(requestLoggingMiddleware);

  // Add compression middleware for better performance
  const { compressionMiddleware, cacheHeaders } = await import('./middleware/compression');
  app.use(compressionMiddleware);
  app.use(cacheHeaders);

  // Add request ID middleware
  app.use(requestId());
  
  // Add logging middleware
  app.use(loggerMiddleware);

  // Setup API routes first (includes /metrics)
  await registerRoutes(app);
  
  // CRITICAL SECURITY FIX: Server-side route protection middleware
  // Must be AFTER API routes but BEFORE setupVite to intercept protected HTML routes
  const { serverSideAuthMiddleware } = await import('./middleware/serverSideAuth');
  app.use(serverSideAuthMiddleware);
  log("🛡️  Server-side route protection middleware enabled");
  
  // Setup Vite for React frontend (handles frontend routes and 404s)
  const vite = await setupVite(app, httpServer);

  // Initialize Socket.IO handlers
  const { initChatSocket } = await import('./events/chatSocket');
  initChatSocket(io);

  // Error handling middleware setup

  // Error handling middleware (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);
  
  // Setup global error handlers
  setupGlobalErrorHandlers();

  // Start server
  const port = parseInt(process.env.PORT || '5000', 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`Node.js server running on port ${port} with memory storage and Socket.IO`);
    
    logger.info('Server started successfully', {
      port,
      env: process.env.NODE_ENV || 'development',
      features: ['express', 'socket.io', 'logging', 'error-handling', 'validation']
    });
  });
})();