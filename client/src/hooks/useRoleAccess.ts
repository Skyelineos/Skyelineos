import { useAuth } from '@/hooks/use-auth';
import { useAdminView } from '@/contexts/AdminViewContext';

export type UserRole = 'client' | 'subcontractor' | 'designer' | 'projectManager' | 'admin';

/**
 * Hook for checking role-based access permissions
 * Includes admin view override functionality
 */
export function useRoleAccess() {
  const { user, isAuthenticated } = useAuth();
  const { isAdminView } = useAdminView();

  const getUserRole = (userRole: string): UserRole => {
    // Normalize role names for consistent handling across frontend/backend
    const normalizedRole = userRole.toLowerCase().replace('_', '');
    
    switch (normalizedRole) {
      case 'admin':
        return 'admin';
      case 'gc':                  // Skyeline Team
      case 'projectmanager':
      case 'project_manager':
        return 'projectManager';
      case 'client':
        return 'client';
      case 'sub':                 // Subcontractor short form
      case 'subcontractor':
        return 'subcontractor';
      case 'designer':
        return 'designer';
      default:
        return 'client';
    }
  };

  const currentRole = user ? getUserRole(user.role) : null;

  const hasRole = (allowedRoles: UserRole | UserRole[]): boolean => {
    if (!isAuthenticated || !user || !currentRole) {
      return false;
    }

    // Admin view override - admins can access any portal when in admin mode
    if (isAdminView && currentRole === 'admin') {
      return true;
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return roles.includes(currentRole);
  };

  const canAccessDashboard = (): boolean => {
    return hasRole(['admin']);
  };

  const canAccessProjects = (): boolean => {
    return hasRole(['admin', 'projectManager']);
  };

  const canAccessContacts = (): boolean => {
    return hasRole(['admin', 'projectManager']);
  };

  const canAccessFinancials = (): boolean => {
    return hasRole(['admin', 'projectManager']);
  };

  const canAccessSettings = (): boolean => {
    return hasRole(['admin', 'projectManager']);
  };

  const canAccessAccounting = (): boolean => {
    return hasRole(['admin']);
  };

  const canAccessMessages = (): boolean => {
    return hasRole(['admin', 'projectManager']);
  };

  const canAccessSchedule = (): boolean => {
    return hasRole(['admin', 'projectManager']);
  };

  const canAccessClientPortal = (clientId?: string): boolean => {
    // Admin in admin view mode can access any client portal
    if (isAdminView && currentRole === 'admin') {
      return true;
    }
    
    // Regular clients can only access their own portal
    if (currentRole === 'client') {
      return !clientId || clientId === user?.id.toString();
    }
    
    return false;
  };

  const canAccessSubcontractorPortal = (subcontractorId?: string): boolean => {
    // Admin in admin view mode can access any subcontractor portal
    if (isAdminView && currentRole === 'admin') {
      return true;
    }
    
    // Regular subcontractors can only access their own portal
    if (currentRole === 'subcontractor') {
      return !subcontractorId || subcontractorId === user?.id.toString();
    }
    
    return false;
  };

  const canAccessDesignerPortal = (designerId?: string): boolean => {
    // Admin in admin view mode can access any designer portal
    if (isAdminView && currentRole === 'admin') {
      return true;
    }
    
    // Regular designers can only access their own portal
    if (currentRole === 'designer') {
      return !designerId || designerId === user?.id.toString();
    }
    
    return false;
  };

  const getHomeRoute = (): string => {
    if (!currentRole) return '/login';
    
    switch (currentRole) {
      case 'admin':
        return '/dashboard';
      case 'projectManager':
        return '/projects';
      case 'client':
        return '/client-portal';
      case 'subcontractor':
        return '/subcontractor-portal';
      case 'designer':
        return '/designer-portal';
      default:
        return '/login';
    }
  };

  return {
    currentRole,
    hasRole,
    canAccessDashboard,
    canAccessProjects,
    canAccessContacts,
    canAccessFinancials,
    canAccessSettings,
    canAccessAccounting,
    canAccessMessages,
    canAccessSchedule,
    canAccessClientPortal,
    canAccessSubcontractorPortal,
    canAccessDesignerPortal,
    getHomeRoute,
    isAdminView,
    isAuthenticated,
  };
}