import React from 'react';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, AlertTriangle } from 'lucide-react';

interface ProtectedProjectRouteProps {
  children: React.ReactNode;
  projectId: string | number;
  requiredPermission?: 'read' | 'write' | 'admin';
  fallback?: React.ReactNode;
}

export function ProtectedProjectRoute({ 
  children, 
  projectId, 
  requiredPermission = 'read',
  fallback 
}: ProtectedProjectRouteProps) {
  const { user, isAuthenticated } = useAuth();
  const { hasPermission, isLoading, error } = useProjectPermissions(projectId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground mt-2">Checking permissions...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return fallback || (
      <Card className="max-w-md mx-auto mt-8">
        <CardHeader className="text-center">
          <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
          <CardTitle>Authentication Required</CardTitle>
          <CardDescription>
            Please log in to access this project.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-md mx-auto mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Error checking project permissions: {error.message || 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  // Check if user has required permission for this project
  const hasRequiredPermission = hasPermission(requiredPermission);

  if (!hasRequiredPermission) {
    return fallback || (
      <Card className="max-w-md mx-auto mt-8">
        <CardHeader className="text-center">
          <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>
            You don't have permission to access this project.
            Required permission: {requiredPermission}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <>{children}</>;
}

// Default export for compatibility
export default ProtectedProjectRoute;