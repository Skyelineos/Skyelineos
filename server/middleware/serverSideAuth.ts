import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../auth/tokens';

// Protected route patterns - comprehensive list of routes requiring authentication
const protectedPaths = [
  /^\/dashboard(\/.*)?$/,
  /^\/projects(\/.*)?$/,
  /^\/financials(\/.*)?$/,
  /^\/client-portal(\/.*)?$/,
  /^\/subcontractor-portal(\/.*)?$/,
  /^\/designer-portal(\/.*)?$/,
  /^\/contacts(\/.*)?$/,
  /^\/schedule(\/.*)?$/,
  /^\/messages(\/.*)?$/,
  /^\/settings(\/.*)?$/,
  /^\/admin-portal(\/.*)?$/,
  /^\/accounting(\/.*)?$/,
  /^\/global-schedule(\/.*)?$/,
  /^\/project-detail(\/.*)?$/,
  /^\/project-overview(\/.*)?$/,
  /^\/project-estimates(\/.*)?$/,
  /^\/project-bids(\/.*)?$/,
  /^\/project-budget(\/.*)?$/,
  /^\/project-schedule(\/.*)?$/,
  /^\/project-documents(\/.*)?$/,
  /^\/project-photos(\/.*)?$/,
  /^\/project-messages(\/.*)?$/,
  /^\/project-financials(\/.*)?$/,
  /^\/trades(\/.*)?$/,
];

// Static asset patterns that should never be authenticated
const staticAssetPaths = [
  /^\/assets\//,
  /^\/@vite\//,
  /^\/favicon\./,
  /^\/manifest\./,
  /^\/sockjs/,
  /^\/node_modules/,
  /^\/src\//,  // Vite dev assets
  /^\/public\//,
  /^\/api\//,  // API routes have their own authentication
  /^\/static\//,
];

// Role-based path restrictions (optional enhancement)
const roleRestrictedPaths = [
  { pattern: /^\/admin-portal(\/.*)?$/, allowedRoles: ['admin'] },
  { pattern: /^\/financials(\/.*)?$/, allowedRoles: ['admin', 'accountant'] },
  { pattern: /^\/accounting(\/.*)?$/, allowedRoles: ['admin', 'accountant'] },
];

/**
 * Server-side authentication middleware for HTML routes
 * Prevents unauthenticated users from receiving 200 OK responses on protected routes
 */
export function serverSideAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip non-GET requests (they're handled by API routes)
  if (req.method !== 'GET') {
    return next();
  }

  // Skip API routes (they have their own authentication)
  if (req.path.startsWith('/api/')) {
    return next();
  }

  // Skip static assets and development resources
  const isStaticAsset = staticAssetPaths.some(pattern => pattern.test(req.path));
  if (isStaticAsset) {
    return next();
  }

  // Check if the request is for HTML content
  const acceptsHtml = req.headers.accept?.includes('text/html');
  const isXHR = req.headers['x-requested-with'] === 'XMLHttpRequest';
  
  // Only protect HTML requests (not JSON/API requests)
  if (!acceptsHtml || isXHR) {
    return next();
  }

  // Check if path requires authentication
  const isProtectedPath = protectedPaths.some(pattern => pattern.test(req.path));
  if (!isProtectedPath) {
    return next();
  }

  // Development auth bypass (if enabled)
  const enableDevBypass = process.env.ENABLE_DEV_AUTH_BYPASS === 'true';
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (enableDevBypass && !isProduction) {
    console.warn('⚠️ Server-side auth bypass active for development');
    return next();
  }

  // Extract token from Authorization header or cookies
  let token: string | undefined;
  
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    // Fall back to cookies
    token = req.cookies?.accessToken;
  }

  // If no token, redirect to sign-in
  if (!token) {
    console.log(`🚫 Server-side auth: No token found for ${req.path}`);
    
    // Add security headers to prevent caching and indexing
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Robots-Tag': 'noindex, nofollow'
    });
    
    // Redirect to sign-in with return path
    const encodedReturnPath = encodeURIComponent(req.originalUrl);
    return res.redirect(302, `/sign-in?redirect=${encodedReturnPath}`);
  }

  // Verify the token
  const payload = verifyAccessToken(token);
  if (!payload) {
    console.log(`🚫 Server-side auth: Invalid token for ${req.path}`);
    
    // Add security headers
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache', 
      'Expires': '0',
      'X-Robots-Tag': 'noindex, nofollow'
    });
    
    // Redirect to sign-in with return path
    const encodedReturnPath = encodeURIComponent(req.originalUrl);
    return res.redirect(302, `/sign-in?redirect=${encodedReturnPath}`);
  }

  // Check role-based restrictions
  const roleRestriction = roleRestrictedPaths.find(restriction => 
    restriction.pattern.test(req.path)
  );
  
  if (roleRestriction && !roleRestriction.allowedRoles.includes(payload.role)) {
    console.log(`🚫 Server-side auth: Insufficient role '${payload.role}' for ${req.path}`);
    
    // Add security headers
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0', 
      'X-Robots-Tag': 'noindex, nofollow'
    });
    
    // Redirect to not-authorized page
    return res.redirect(302, '/not-authorized');
  }

  // Authentication successful - continue to serve the route
  console.log(`✅ Server-side auth: Authenticated ${payload.email} (${payload.role}) for ${req.path}`);
  
  // Add user info to request (though Vite won't use it, it's good for consistency)
  (req as any).user = {
    id: payload.id,
    email: payload.email,
    role: payload.role,
    permissions: payload.permissions
  };
  
  next();
}