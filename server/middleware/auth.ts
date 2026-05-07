import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

// REMOVED: Legacy JWT imports (now using Firebase ID tokens exclusively)

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    permissions: string[];
    fullName?: string;
    firebaseUid?: string; // Firebase UID for token verification
  };
}

// Role-based permissions system
export const PERMISSIONS = {
  // Project permissions
  PROJECT_CREATE: 'project:create',
  PROJECT_READ: 'project:read',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  
  // Contact permissions
  CONTACT_CREATE: 'contact:create',
  CONTACT_READ: 'contact:read',
  CONTACT_UPDATE: 'contact:update',
  CONTACT_DELETE: 'contact:delete',
  
  // Financial permissions
  FINANCIAL_READ: 'financial:read',
  FINANCIAL_UPDATE: 'financial:update',
  FINANCIAL_APPROVE: 'financial:approve',
  
  // Portal access management
  PORTAL_MANAGE: 'portal:manage',
  
  // System administration
  ADMIN_READ: 'admin:read',
  ADMIN_WRITE: 'admin:write',
  
  // Bid management
  BID_CREATE: 'bid:create',
  BID_READ: 'bid:read',
  BID_APPROVE: 'bid:approve',
  
  // Estimate management
  ESTIMATE_CREATE: 'estimate:create',
  ESTIMATE_READ: 'estimate:read',
  ESTIMATE_UPDATE: 'estimate:update',
  ESTIMATE_DELETE: 'estimate:delete',
} as const;

export const ROLE_PERMISSIONS = {
  admin: [
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.CONTACT_CREATE,
    PERMISSIONS.CONTACT_READ,
    PERMISSIONS.CONTACT_UPDATE,
    PERMISSIONS.CONTACT_DELETE,
    PERMISSIONS.FINANCIAL_READ,
    PERMISSIONS.FINANCIAL_UPDATE,
    PERMISSIONS.FINANCIAL_APPROVE,
    PERMISSIONS.PORTAL_MANAGE,
    PERMISSIONS.ADMIN_READ,
    PERMISSIONS.ADMIN_WRITE,
    PERMISSIONS.BID_CREATE,
    PERMISSIONS.BID_READ,
    PERMISSIONS.BID_APPROVE,
    PERMISSIONS.ESTIMATE_CREATE,
    PERMISSIONS.ESTIMATE_READ,
    PERMISSIONS.ESTIMATE_UPDATE,
    PERMISSIONS.ESTIMATE_DELETE,
  ],
  project_manager: [
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.CONTACT_CREATE,
    PERMISSIONS.CONTACT_READ,
    PERMISSIONS.CONTACT_UPDATE,
    PERMISSIONS.FINANCIAL_READ,
    PERMISSIONS.FINANCIAL_UPDATE,
    PERMISSIONS.PORTAL_MANAGE,
    PERMISSIONS.BID_CREATE,
    PERMISSIONS.BID_READ,
    PERMISSIONS.BID_APPROVE,
    PERMISSIONS.ESTIMATE_CREATE,
    PERMISSIONS.ESTIMATE_READ,
    PERMISSIONS.ESTIMATE_UPDATE,
    PERMISSIONS.ESTIMATE_DELETE,
  ],
  accountant: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.CONTACT_READ,
    PERMISSIONS.FINANCIAL_READ,
    PERMISSIONS.FINANCIAL_UPDATE,
  ],
  client: [
    PERMISSIONS.PROJECT_READ, // Only their own projects
  ],
  subcontractor: [
    PERMISSIONS.PROJECT_READ, // Only assigned projects
    PERMISSIONS.BID_CREATE,
    PERMISSIONS.BID_READ, // Only their own bids
  ],
} as const;

// REMOVED: Legacy JWT token functions (using Firebase ID tokens exclusively)

// Firebase-compatible authentication middleware using Firebase Admin SDK
export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    // Development auth bypass with explicit opt-in and production safeguards
    const enableDevBypass = process.env.ENABLE_DEV_AUTH_BYPASS === 'true';
    const isProduction = process.env.NODE_ENV === 'production';
    
    // CRITICAL: Fail hard in production if bypass is enabled
    if (isProduction && enableDevBypass) {
      console.error('🚨 SECURITY VIOLATION: Development auth bypass cannot be enabled in production!');
      throw new Error('SECURITY VIOLATION: Development auth bypass enabled in production environment');
    }
    
    // Development bypass only if explicitly enabled and not in production
    if (enableDevBypass && !isProduction) {
      console.warn('⚠️  DEVELOPMENT AUTH BYPASS ACTIVE - This should NEVER happen in production!');
      console.warn('⚠️  Set ENABLE_DEV_AUTH_BYPASS=false to disable this bypass');
      
      // Attach mock admin user to request for development
      req.user = {
        id: 1,
        email: 'info@skyelinehomes.com',
        role: 'admin',
        permissions: Object.values(PERMISSIONS) // All permissions for admin
      };
      return next();
    }

    // Extract Firebase ID token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Debug logging for troubleshooting authentication issues
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Authentication failed - Debug info:', {
          hasAuthHeader: !!authHeader,
          authHeaderFormat: authHeader ? 'invalid format' : 'missing',
          userAgent: req.get('User-Agent')?.includes('Mozilla') ? 'Browser' : 'Other'
        });
      }

      return res.status(401).json({
        error: 'Authentication required - Firebase ID token expected',
        code: 'MISSING_FIREBASE_TOKEN'
      });
    }

    const idToken = authHeader.substring(7);
    
    // Import Firebase Admin SDK for token verification
    const { auth } = await import('../firebaseAdmin');
    
    // Verify Firebase ID token using Firebase Admin SDK
    const decodedToken = await auth.verifyIdToken(idToken);
    if (!decodedToken) {
      return res.status(401).json({
        error: 'Invalid or expired Firebase ID token',
        code: 'INVALID_FIREBASE_TOKEN'
      });
    }

    // Get user profile from Firestore to determine role and permissions
    const userProfile = await getUserProfileFromFirestore(decodedToken.uid, decodedToken.email);
    if (!userProfile) {
      return res.status(401).json({
        error: 'User profile not found',
        code: 'USER_PROFILE_MISSING'
      });
    }

    // Get permissions for the user's role
    const permissions = ROLE_PERMISSIONS[userProfile.role as keyof typeof ROLE_PERMISSIONS] || [];
    
    // Attach user to request with Firebase UID and profile data
    req.user = {
      id: userProfile.id,
      email: decodedToken.email || userProfile.email,
      role: userProfile.role,
      permissions: [...permissions],
      fullName: userProfile.fullName,
      firebaseUid: decodedToken.uid
    };
    
    next();
  } catch (error) {
    console.error('Firebase authentication error:', error);
    return res.status(401).json({
      error: 'Firebase authentication failed',
      code: 'FIREBASE_AUTH_FAILED'
    });
  }
}

// Get user profile from Firestore
async function getUserProfileFromFirestore(firebaseUid: string, email?: string) {
  try {
    // Import Firestore admin
    const admin = await import('firebase-admin');
    const db = admin.firestore();
    
    // First try to find user by Firebase UID
    const userSnapshot = await db.collection('users').where('firebaseUid', '==', firebaseUid).limit(1).get();
    
    if (!userSnapshot.empty) {
      const userData = userSnapshot.docs[0].data();
      
      // CRITICAL: Reject if role is missing - never default to admin
      if (!userData.role) {
        console.error('🚨 SECURITY: User profile missing role field:', { email: userData.email, firebaseUid });
        throw new Error('User profile missing required role field');
      }
      
      // Validate role is allowlisted
      const allowedRoles = ['admin', 'project_manager', 'accountant', 'client', 'subcontractor'];
      if (!allowedRoles.includes(userData.role)) {
        console.error('🚨 SECURITY: Invalid role in user profile:', { role: userData.role, email: userData.email });
        throw new Error('Invalid role in user profile');
      }
      
      return {
        id: userData.id || parseInt(userSnapshot.docs[0].id, 10),
        email: userData.email || email,
        role: userData.role,
        fullName: userData.fullName || userData.name,
        firebaseUid: userData.firebaseUid
      };
    }
    
    // If not found by UID, try by email (for existing users)
    if (email) {
      const emailSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();
      
      if (!emailSnapshot.empty) {
        const userData = emailSnapshot.docs[0].data();
        
        // CRITICAL: Reject if role is missing - never default to admin
        if (!userData.role) {
          console.error('🚨 SECURITY: User profile missing role field:', { email: userData.email });
          throw new Error('User profile missing required role field');
        }
        
        // Validate role is allowlisted
        const allowedRoles = ['admin', 'project_manager', 'accountant', 'client', 'subcontractor'];
        if (!allowedRoles.includes(userData.role)) {
          console.error('🚨 SECURITY: Invalid role in user profile:', { role: userData.role, email: userData.email });
          throw new Error('Invalid role in user profile');
        }
        
        // Update the document with Firebase UID
        await emailSnapshot.docs[0].ref.update({ firebaseUid });
        
        return {
          id: userData.id || parseInt(emailSnapshot.docs[0].id, 10),
          email: userData.email || email,
          role: userData.role,
          fullName: userData.fullName || userData.name,
          firebaseUid
        };
      }
    }
    
    // REMOVED: Hard-coded admin bootstrap (create admin users manually through Firebase Console)
    // Auto-creation of admin users is a security risk and should be done explicitly
    
    return null;
  } catch (error) {
    console.error('Error getting user profile from Firestore:', error);
    return null;
  }
}

// Permission-based authorization middleware
export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Development logging removed
      
      if (!req.user) {
        // Development logging removed
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!req.user.permissions.includes(permission)) {
        // Development logging removed
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: permission,
          userRole: req.user.role
        });
      }

      // Success operation completed
      next();
    } catch (error) {
      console.error('❌ Error in permission middleware:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

// Role-based authorization middleware
export function requireRole(roles: string | string[]) {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admin users have access to everything unless explicitly excluded
    if (req.user.role === 'admin' && !roleArray.includes('!admin')) {
      return next();
    }

    if (!roleArray.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient role permissions',
        required: roleArray,
        current: req.user.role
      });
    }

    next();
  };
}

// Predefined role guards for common use cases
export const requireAdmin = requireRole(['admin']);
export const requireClient = requireRole(['admin', 'client', 'projectManager']);
export const requireSubcontractor = requireRole(['admin', 'subcontractor', 'projectManager']);
export const requireDesigner = requireRole(['admin', 'designer', 'projectManager']);
export const requireProjectManager = requireRole(['admin', 'projectManager']);
export const requireAccountant = requireRole(['admin', 'accountant', 'projectManager']);

// Specialized role guards
export const requireBiddingAccess = requireRole(['subcontractor', 'admin', 'projectManager']);
export const requireFinancialAccess = requireRole(['admin', 'accountant']);
export const requireSchedulingAccess = requireRole(['admin', 'projectManager']);

// Rate limiting middleware
export const createRateLimit = (windowMs: number, max: number, message?: string) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message || 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Common rate limits with trust proxy configuration
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 50, // Higher limit for development
  message: { error: 'Too many authentication attempts' },
  standardHeaders: true,
  legacyHeaders: false,
  // trustProxy: false, // Removed - not supported in this version
});

export const apiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute (reduced window)
  max: process.env.NODE_ENV === 'production' ? 500 : 2000, // Much higher limit for development
  message: { error: 'API rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
  // trustProxy: false, // Removed - not supported in this version
});

// Special rate limit for messaging endpoints with higher limits
export const messagingRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // High limit for messaging real-time features
  message: { error: 'Messaging rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
  // trustProxy: false, // Removed - not supported in this version
});

export const heavyApiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Heavy operation rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
  // trustProxy: false, // Removed - not supported in this version
});

// Input validation helpers
export function sanitizeInput(input: unknown): unknown {
  if (typeof input === 'string') {
    return input.trim().replace(/[<>]/g, '');
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized: Record<string, unknown> = {};
    const obj = input as Record<string, unknown>;
    for (const key in obj) {
      sanitized[key] = sanitizeInput(obj[key]);
    }
    return sanitized;
  }
  return input;
}

// CSRF token generation and validation
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function validateCSRFToken(token: string, expectedToken: string): boolean {
  if (!token || !expectedToken) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
}