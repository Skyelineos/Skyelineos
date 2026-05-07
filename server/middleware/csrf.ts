/**
 * CSRF Protection Middleware
 * 
 * Prevents Cross-Site Request Forgery attacks by requiring CSRF tokens
 * for state-changing operations when cookies are present.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface CSRFRequest extends Request {
  csrfToken?: string;
}

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * CSRF validation middleware
 * 
 * For non-idempotent methods (POST, PUT, DELETE, PATCH), validates that:
 * 1. If cookies are present, x-csrf-token header must match csrfToken cookie
 * 2. Returns 403 Forbidden if validation fails
 * 
 * Bypasses validation in development mode if NODE_ENV !== 'production'
 */
export function csrfProtection(req: CSRFRequest, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  const path = req.path;
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Skip CSRF validation for safe methods (but log in production for monitoring)
  if (safeMethods.includes(method)) {
    if (isProduction && path.startsWith('/api/')) {
      console.log(`🔒 CSRF: Safe method ${method} ${path} - validation skipped`);
    }
    return next();
  }

  // Log all unsafe method attempts for security monitoring
  console.log(`🛡️  CSRF: Validating ${method} ${path}`);

  // Skip CSRF for specific endpoints that don't need protection
  const exemptEndpoints = ['/api/portal-login', '/api/auth/login', '/api/auth/register'];
  // Also exempt project deletion for Firebase production
  if (exemptEndpoints.includes(req.path) || req.path.match(/^\/api\/projects\/\d+$/)) {
    console.log(`🔒 CSRF: Endpoint ${path} is exempt from CSRF validation`);
    return next();
  }
  
  // Allow bypass in development mode only
  if (!isProduction) {
    const bypass = req.headers['x-bypass-csrf'] === 'development';
    if (bypass) {
      console.warn(`⚠️  CSRF: Protection bypassed for ${method} ${path} in development mode`);
      return next();
    }
  }
  
  // Check if any cookies are present
  const hasCookies = req.headers.cookie && req.headers.cookie.length > 0;
  
  if (hasCookies) {
    const csrfTokenFromHeader = req.headers['x-csrf-token'] as string;
    const csrfTokenFromCookie = req.cookies.csrfToken;
    
    // Enhanced logging for CSRF validation process
    const hasHeaderToken = !!csrfTokenFromHeader;
    const hasCookieToken = !!csrfTokenFromCookie;
    
    console.log(`🔍 CSRF: Tokens present - Header: ${hasHeaderToken}, Cookie: ${hasCookieToken}`);
    
    // Require CSRF token when cookies are present
    if (!csrfTokenFromHeader || !csrfTokenFromCookie) {
      console.error(`❌ CSRF: Token missing for ${method} ${path} - Header: ${hasHeaderToken}, Cookie: ${hasCookieToken}`);
      res.status(403).json({
        error: 'CSRF token required',
        code: 'CSRF_TOKEN_MISSING',
        message: 'Cross-site request forgery protection requires valid CSRF token'
      });
      return;
    }
    
    // Validate CSRF token matches exactly (double-submit cookie validation)
    if (csrfTokenFromHeader !== csrfTokenFromCookie) {
      console.error(`❌ CSRF: Token mismatch for ${method} ${path}`);
      console.error('Header token and cookie token do not match');
      res.status(403).json({
        error: 'Invalid CSRF token',
        code: 'CSRF_TOKEN_MISMATCH',
        message: 'CSRF token does not match expected value'
      });
      return;
    }
    
    // Success: CSRF validation passed
    console.log(`✅ CSRF: Validation successful for ${method} ${path}`);
    
    // Store valid token in request for potential use by routes
    req.csrfToken = csrfTokenFromCookie;
  } else {
    // No cookies present - CSRF validation not required
    console.log(`🔒 CSRF: No cookies present for ${method} ${path} - validation skipped`);
  }
  
  next();
}

/**
 * Middleware to set CSRF token cookie for new clients
 */
export function setCSRFToken(req: Request, res: Response, next: NextFunction): void {
  // Only set CSRF token if none exists
  if (!req.cookies.csrfToken) {
    const csrfToken = generateCSRFToken();
    
    res.cookie('csrfToken', csrfToken, {
      httpOnly: false, // Must be readable by JavaScript for header inclusion
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    // Development logging removed
  }
  
  next();
}

/**
 * Route handler to get CSRF token for client-side use
 */
export function getCSRFToken(req: Request, res: Response): void {
  let csrfToken = req.cookies.csrfToken;
  
  // Generate new token if none exists
  if (!csrfToken) {
    csrfToken = generateCSRFToken();
    
    res.cookie('csrfToken', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });
  }
  
  res.json({
    csrfToken,
    message: 'CSRF token provided'
  });
}