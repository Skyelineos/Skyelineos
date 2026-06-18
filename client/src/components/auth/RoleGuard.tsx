import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { PageLoader } from '@/components/common/PageLoader';
import { useAdminView } from '@/contexts/AdminViewContext';
import { Redirect } from 'wouter';
import { getDefaultRouteForRole } from '@/utils/roleRedirects';

export type UserRole = 'admin' | 'gc' | 'projectManager' | 'client' | 'subcontractor' | 'designer';

// Role normalization function - same logic as useRoleAccess.
// BUGFIX 2026-06: `gc` was being collapsed into `projectManager`, which
// meant every PM had full GC access at the route-guard level. Keep them
// distinct so financial routes can gate on ['admin', 'gc'] only.
function getUserRole(userRole: string): UserRole {
  const normalizedRole = (userRole || '').toLowerCase().replace(/_/g, '');

  switch (normalizedRole) {
    case 'admin':
      return 'admin';
    case 'gc':                  // Skyeline Team — full GC access (Tyler)
      return 'gc';
    case 'projectmanager':      // PM — operational delegate, NO financials
    case 'pm':
      return 'projectManager';
    case 'client':
    case 'homeowner':
      return 'client';
    case 'sub':                 // Subcontractor short form
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

  // Show loading state while checking auth — was returning null which
  // produced a literal blank screen until the auth context settled. Now
  // we render a full-viewport loader so the user always sees that work is
  // happening.
  if (isLoading) {
    return <PageLoader title="Verifying access" />;
  }

  // If no user, ProtectedRoute will redirect to /sign-in. While that redirect
  // commits we render the same loader instead of null so there is no blank
  // gap between the role check failing and the redirect resolving.
  if (!user) {
    return <PageLoader title="Redirecting" />;
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
      // Bounce to the user's natural home (their portal) instead of dumping
      // them on a generic "Access Denied" page. A sub landing on /dashboard
      // via a stale bookmark belongs on /subcontractor-portal, not a brick
      // wall. Only fall through to /not-authorized if their role has no
      // default home defined.
      const home = getDefaultRouteForRole(normalizedRole as any);
      return <Redirect to={home && home !== '/sign-in' ? home : '/not-authorized'} />;
    }
    return (fallback as ReactNode) ?? <PageLoader title="Checking permissions" />;
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