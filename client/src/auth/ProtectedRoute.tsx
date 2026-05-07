import { ReactNode } from 'react';
import { Redirect } from "wouter";
import { useAuth } from "./AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
  requireAuth?: boolean;
  fallbackComponent?: ReactNode;
}

export default function ProtectedRoute({ 
  children, 
  allowedRoles = [],
  requireAuth = true,
  fallbackComponent
}: ProtectedRouteProps) {
  const { user, loading, isAuthenticated, hasRole } = useAuth();
  
  // Check for test mode directly from localStorage (synchronous check)
  const isTestMode = typeof window !== 'undefined' && localStorage.getItem('testMode') === 'true';

  // Show loading state while checking auth (skip if test mode)
  if (loading && !isTestMode) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div className="text-sm text-muted-foreground">Verifying authentication...</div>
        </div>
      </div>
    );
  }

  // If authentication is required but no user (and not in test mode), redirect to sign-in
  if (requireAuth && !isAuthenticated && !isTestMode) {
    console.debug('ProtectedRoute: Redirecting unauthenticated user to /sign-in');
    return <Redirect to="/sign-in" />;
  }

  // Block pending team members until an admin approves them
  if (user?.role === 'pending_gc' && !isTestMode) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center space-y-4">
          <div className="text-4xl">⏳</div>
          <h2 className="text-xl font-semibold text-gray-800">Access Pending Approval</h2>
          <p className="text-gray-500 text-sm">
            Your Skyeline Team Member account is awaiting admin review. You'll receive access once a team admin approves your request.
          </p>
          <p className="text-gray-400 text-xs">Signed in as {user.email}</p>
        </div>
      </div>
    );
  }

  // If specific roles are required, check user role
  if (allowedRoles.length > 0 && user) {
    const hasPermission = allowedRoles.some(role => hasRole(role));
    
    if (!hasPermission) {
      console.debug(`ProtectedRoute: User role '${user.role}' not in allowed roles [${allowedRoles.join(', ')}]`);
      return fallbackComponent || <Redirect to="/not-authorized" />;
    }
  }

  // All checks passed, render children
  console.debug('ProtectedRoute: Auth checks passed, rendering children');
  return <>{children}</>;
}