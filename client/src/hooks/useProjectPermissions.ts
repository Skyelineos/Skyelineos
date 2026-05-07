import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';

export interface ProjectPermissions {
  canRead: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  role?: string;
}

export function useProjectPermissions(projectId: string | number) {
  const { user, isAuthenticated } = useAuth();

  const { data: permissions, isLoading, error } = useQuery({
    queryKey: ['project-permissions', projectId, user?.id],
    queryFn: async (): Promise<ProjectPermissions> => {
      if (!isAuthenticated || !user) {
        return { canRead: false, canWrite: false, canAdmin: false };
      }

      try {
        // For now, return permissive permissions during development
        // In production, this would call the actual permissions API
        const response = await apiRequest(`/api/projects/${projectId}/permissions`, 'GET');
        return response;
      } catch (error) {
        // Fallback to basic read permissions for authenticated users
        // This prevents the app from breaking during development
        console.warn('Error fetching project permissions, using fallback:', error);
        return { 
          canRead: true, 
          canWrite: user.role === 'admin' || user.role === 'project_manager',
          canAdmin: user.role === 'admin',
          role: user.role 
        };
      }
    },
    enabled: !!projectId && isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1 // Only retry once to avoid excessive API calls
  });

  const hasPermission = (requiredPermission: 'read' | 'write' | 'admin') => {
    if (!permissions) return false;
    
    switch (requiredPermission) {
      case 'read':
        return permissions.canRead;
      case 'write':
        return permissions.canWrite;
      case 'admin':
        return permissions.canAdmin;
      default:
        return false;
    }
  };

  return {
    permissions,
    hasPermission,
    isLoading,
    error
  };
}