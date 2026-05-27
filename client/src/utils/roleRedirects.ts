import { UserRole } from '@/hooks/useRoleAccess';

/**
 * Utility functions for role-based redirects and route access
 */

export function getDefaultRouteForRole(role: UserRole | string, userId?: string): string {
  // Normalize role string — Firestore docs store some legacy shortforms
  // ("sub", "gc", "project_manager") that should route the same as their
  // canonical equivalents. Without this, a sub signing up with role="sub"
  // falls through and gets stuck on a redirect loop.
  const normalized = String(role || '').toLowerCase().replace(/_/g, '');
  switch (normalized) {
    case 'admin':
      return '/dashboard';
    case 'gc':
    case 'projectmanager':
      return '/projects';
    case 'client':
    case 'homeowner':
      return '/client-portal';
    case 'sub':
    case 'subcontractor':
    case 'vendor':
      return '/subcontractor-portal';
    case 'designer':
      return '/designer-portal';
    default:
      return '/sign-in';
  }
}

export function isPortalRoute(path: string): boolean {
  return path.startsWith('/client-portal') || 
         path.startsWith('/subcontractor-portal') || 
         path.startsWith('/designer-portal');
}

export function getPortalTypeFromRoute(path: string): 'client' | 'subcontractor' | 'designer' | null {
  if (path.startsWith('/client-portal')) return 'client';
  if (path.startsWith('/subcontractor-portal')) return 'subcontractor';
  if (path.startsWith('/designer-portal')) return 'designer';
  return null;
}

export function isAdminOnlyRoute(path: string): boolean {
  // '/accounting' was a phantom route — never registered in App.tsx (the
  // canonical page is '/financials'). Keeping it here previously routed
  // any admin who landed on /accounting to a 404.
  const adminOnlyRoutes = [
    '/dashboard',
  ];
  
  return adminOnlyRoutes.some(route => path.startsWith(route));
}

export function isProjectManagementRoute(path: string): boolean {
  const projectManagementRoutes = [
    '/projects',
    '/contacts',
    '/schedule',
    '/financials',
    '/messages',
    '/settings'
  ];
  
  return projectManagementRoutes.some(route => path.startsWith(route));
}

export function isManagementRoute(path: string): boolean {
  return isAdminOnlyRoute(path) || isProjectManagementRoute(path);
}

/**
 * Check if a user with given role should be redirected from current path
 */
export function shouldRedirectUser(currentPath: string, userRole: UserRole, userId: string): string | null {
  // Don't redirect on auth routes
  if (currentPath === '/login' || currentPath === '/not-authorized') {
    return null;
  }

  // Admin-only routes — also accessible by gc/projectManager
  if (isAdminOnlyRoute(currentPath)) {
    if (userRole !== 'admin' && userRole !== 'projectManager') {
      return getDefaultRouteForRole(userRole, userId);
    }
    return null;
  }

  // Project management routes - admin and project managers
  if (isProjectManagementRoute(currentPath)) {
    if (userRole !== 'admin' && userRole !== 'projectManager') {
      return getDefaultRouteForRole(userRole, userId);
    }
    return null;
  }

  // Portal routes - check specific access
  if (isPortalRoute(currentPath)) {
    const portalType = getPortalTypeFromRoute(currentPath);
    
    // Users can only access their own portal type
    if (portalType && portalType !== userRole) {
      // Exception: admin can access any portal (handled by RoleGuard with admin view)
      if (userRole !== 'admin') {
        return getDefaultRouteForRole(userRole, userId);
      }
    }
    
    return null;
  }

  // Root redirect
  if (currentPath === '/') {
    return getDefaultRouteForRole(userRole, userId);
  }

  return null;
}