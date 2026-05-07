import { Request, Response, NextFunction } from 'express';

// Extended Request interface to include user
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
    email: string;
    name: string;
  };
}

// Valid roles in the system
type UserRole = 'admin' | 'client' | 'designer' | 'subcontractor' | 'projectManager' | 'accountant';

/**
 * Middleware to require specific roles for route access
 * @param allowedRoles - Array of roles that can access this route
 * @param options - Additional options for role checking
 */
export function requireRole(
  allowedRoles: UserRole[],
  options: {
    requireAll?: boolean; // Require all roles instead of any
    allowOwnership?: boolean; // Allow resource owners even if role doesn't match
  } = {}
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userRole = req.user.role as UserRole;

      // Admin always has access unless explicitly excluded
      if (userRole === 'admin' && !options.requireAll) {
        return next();
      }

      // Check role permissions
      const hasRole = options.requireAll
        ? allowedRoles.every(role => userRole === role)
        : allowedRoles.includes(userRole);

      if (!hasRole) {
        return res.status(403).json({
          error: 'Access denied - insufficient role permissions',
          code: 'INSUFFICIENT_ROLE',
          required: allowedRoles,
          current: userRole
        });
      }

      next();
    } catch (error) {
      console.error('Role authorization error:', error);
      res.status(500).json({
        error: 'Internal server error during role authorization',
        code: 'ROLE_AUTHORIZATION_ERROR'
      });
    }
  };
}

/**
 * Middleware for routes that require admin privileges
 */
export const requireAdmin = requireRole(['admin']);

/**
 * Middleware for routes accessible to project managers and admins
 */
export const requireProjectManager = requireRole(['admin', 'projectManager']);

/**
 * Middleware for routes accessible to clients
 */
export const requireClient = requireRole(['admin', 'client', 'projectManager']);

/**
 * Middleware for routes accessible to subcontractors
 */
export const requireSubcontractor = requireRole(['admin', 'subcontractor', 'projectManager']);

/**
 * Middleware for routes accessible to designers
 */
export const requireDesigner = requireRole(['admin', 'designer', 'projectManager']);

/**
 * Middleware for routes accessible to accountants
 */
export const requireAccountant = requireRole(['admin', 'accountant', 'projectManager']);

/**
 * Middleware for bidding-related routes (subcontractors only)
 */
export const requireBiddingAccess = requireRole(['subcontractor', 'admin', 'projectManager']);

/**
 * Middleware for financial routes (admins and accountants only)
 */
export const requireFinancialAccess = requireRole(['admin', 'accountant']);

/**
 * Middleware for scheduling routes (project managers and admins only)
 */
export const requireSchedulingAccess = requireRole(['admin', 'projectManager']);

/**
 * Helper function to check if user has any of the specified roles
 * @param user - User object
 * @param roles - Array of roles to check
 */
export function hasAnyRole(user: AuthenticatedRequest['user'], roles: UserRole[]): boolean {
  if (!user) return false;
  return roles.includes(user.role as UserRole) || user.role === 'admin';
}

/**
 * Helper function to check if user has all of the specified roles
 * @param user - User object
 * @param roles - Array of roles to check
 */
export function hasAllRoles(user: AuthenticatedRequest['user'], roles: UserRole[]): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return roles.every(role => user.role === role);
}