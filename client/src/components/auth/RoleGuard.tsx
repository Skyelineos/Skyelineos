import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAdminView } from '@/contexts/AdminViewContext';
import { Redirect } from 'wouter';

export type UserRole = 'admin' | 'projectManager' | 'client' | 'subcontractor' | 'designer';

// Role normalization function - same logic as useRoleAccess
function getUserRole(userRole: string): UserRole {
  const normalizedRole = userRole.toLowerCase().replace('_', '');
  
  switch (normalizedRole) {
    case 'admin':
      return 'admin';
    case 'projectmanager':
    case 'project_manager':
      return 'projectManager';
    case 'client':
      return 'client';
    case 'subcontractor':
      return 'subcontractor';
    case 'designer':
      return 'designer';
    default:
      return 'client';
  }
}

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  showNotAuthorized?: boolean;
  fallback?: ReactNode;
}

export function RoleGuard({ 
  children, 
  allowedRoles, 
  showNotAuthorized = false,
  fallback
}: RoleGuardProps) {
  const { user, isLoading } = useAuth();
  const { isAdminView } = useAdminView();

  // Show loading state while checking auth
  if (isLoading) {
    return null;
  }

  // If no user, they should be redirected to login by ProtectedRoute
  if (!user) {
    return null;
  }

  // Normalize user role consistently with useRoleAccess
  const normalizedRole = getUserRole(user.role);

  // Admin view override - admins can access any portal when in admin mode
  if (isAdminView && normalizedRole === 'admin') {
    return <>{children}</>;
  }

  // Check if user's normalized role is in the allowed roles
  const hasPermission = allowedRoles.includes(normalizedRole);

  if (!hasPermission) {
    if (showNotAuthorized) {
      return <Redirect to="/not-authorized" />;
    }
    return fallback || null;
  }

  return <>{children}</>;
}

// Convenience components for common role checks
export const AdminOnly = ({ children }: { children: ReactNode }) => (
  <RoleGuard allowedRoles={['admin']}>{children}</RoleGuard>
);

export const ProjectManagerOnly = ({ children }: { children: ReactNode }) => (
  <RoleGuard allowedRoles={['admin', 'projectManager']}>{children}</RoleGuard>
);

export const ClientOnly = ({ children }: { children: ReactNode }) => (
  <RoleGuard allowedRoles={['client']}>{children}</RoleGuard>
);

export const SubcontractorOnly = ({ children }: { children: ReactNode }) => (
  <RoleGuard allowedRoles={['subcontractor']}>{children}</RoleGuard>
);

export const DesignerOnly = ({ children }: { children: ReactNode }) => (
  <RoleGuard allowedRoles={['designer']}>{children}</RoleGuard>
);