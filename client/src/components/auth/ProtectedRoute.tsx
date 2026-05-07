import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Redirect } from 'wouter';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
  requireAuth?: boolean;
}

export function ProtectedRoute({ 
  children, 
  allowedRoles = [],
  requireAuth = true 
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
    </div>;
  }

  // If authentication is required but no user, redirect to login
  if (requireAuth && !user) {
    return <Redirect to="/login" />;
  }

  // If specific roles are required, check user role
  if (allowedRoles.length > 0 && user) {
    const userRole = user.role;
    const hasPermission = allowedRoles.includes(userRole) || 
                         allowedRoles.includes('admin') && userRole === 'admin';
    
    if (!hasPermission) {
      return <Redirect to="/unauthorized" />;
    }
  }

  return <>{children}</>;
}

// Project-specific protected route
export function ProtectedProjectRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['admin', 'project_manager', 'projectManager']}>
      {children}
    </ProtectedRoute>
  );
}

// Other specific protected routes
export function AdminRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      {children}
    </ProtectedRoute>
  );
}

export function ClientRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['admin', 'client']}>
      {children}
    </ProtectedRoute>
  );
}

export function SubcontractorRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['admin', 'subcontractor']}>
      {children}
    </ProtectedRoute>
  );
}

export function DesignerRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['admin', 'designer']}>
      {children}
    </ProtectedRoute>
  );
}