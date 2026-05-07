import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

export interface Task {
  id: number;
  projectId: number;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  duration: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'on_hold';
  assignedTo?: string;
  progress: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
}

export interface Dependency {
  id: string;
  fromTaskId: number;
  toTaskId: number;
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF';
  lag?: number;
}

export interface ScheduleData {
  tasks: Task[];
  dependencies: Dependency[];
}

/**
 * Enhanced hook for project schedule management with advanced caching and prefetching
 * Fetches both tasks and dependencies in a single API call with optimized performance
 */
export function useProjectSchedule(projectId: string | number) {
  const queryClient = useQueryClient();

  // Prefetch function for proactive data loading
  const prefetchSchedule = useCallback(async (targetProjectId: string | number) => {
    try {
      await queryClient.prefetchQuery({
        queryKey: ['project-schedule', targetProjectId],
        queryFn: async (): Promise<ScheduleData> => {
          const response = await fetch(`/api/projects/${targetProjectId}/schedule`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
            },
          });

          if (!response.ok) {
            throw new Error('Failed to prefetch schedule data');
          }

          return response.json();
        },
        staleTime: 30000,
        gcTime: 300000, // 5 minutes cache for prefetched data
      });
    } catch (error) {
      console.warn('Schedule prefetch failed:', error);
    }
  }, [queryClient]);

  // Auto-prefetch related projects on mount
  useEffect(() => {
    if (projectId) {
      // Prefetch cache warming for current project if not already cached
      const currentData = queryClient.getQueryData(['project-schedule', projectId]);
      if (!currentData) {
        prefetchSchedule(projectId);
      }
    }
  }, [projectId, prefetchSchedule, queryClient]);

  // Main query with advanced caching and stale-while-revalidate
  const {
    data: scheduleData,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    isFetching
  } = useQuery({
    queryKey: ['project-schedule', projectId],
    queryFn: async (): Promise<ScheduleData> => {
      // Processing operation
      const response = await fetch(`/api/projects/${projectId}/schedule`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch schedule data');
      }

      const data = await response.json();
      // Success operation completed
      return data;
    },
    enabled: !!projectId,
    staleTime: 30000, // 30 seconds - aggressive caching for quick navigation
    gcTime: 300000, // 5 minutes cache time for background retention
    refetchOnWindowFocus: false, // Prevent excessive refetches
    refetchOnMount: 'always', // Always check for fresh data on mount
    // Stale-while-revalidate behavior: show cached data immediately, update in background
    placeholderData: (previousData) => previousData,
  });

  // Mutations for schedule operations
  const createTaskMutation = useMutation({
    mutationFn: async (taskData: Partial<Task>) => {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify(taskData),
      });

      if (!response.ok) {
        throw new Error('Failed to create task');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-schedule', projectId] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: number; updates: Partial<Task> }) => {
      const response = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update task');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-schedule', projectId] });
    },
  });

  const generateScheduleMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/schedule/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate schedule');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-schedule', projectId] });
    },
  });

  const createDependencyMutation = useMutation({
    mutationFn: async (depData: Omit<Dependency, 'id'>) => {
      const response = await fetch(`/api/projects/${projectId}/dependencies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify(depData),
      });

      if (!response.ok) {
        throw new Error('Failed to create dependency');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-schedule', projectId] });
    },
  });

  const deleteDependencyMutation = useMutation({
    mutationFn: async (depId: string) => {
      const response = await fetch(`/api/projects/${projectId}/dependencies/${depId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete dependency');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-schedule', projectId] });
    },
  });

  return {
    // Data
    tasks: scheduleData?.tasks || [],
    dependencies: scheduleData?.dependencies || [],
    
    // Status - enhanced with more granular loading states
    isLoading,
    isError,
    error,
    isRefetching,
    isFetching,
    hasData: !!scheduleData,
    
    // Operations
    refetch,
    prefetchSchedule, // Exposed for external prefetching
    createTask: createTaskMutation.mutateAsync,
    updateTask: updateTaskMutation.mutateAsync,
    generateSchedule: generateScheduleMutation.mutateAsync,
    createDependency: createDependencyMutation.mutateAsync,
    deleteDependency: deleteDependencyMutation.mutateAsync,
    
    // Mutation status
    isCreatingTask: createTaskMutation.isPending,
    isUpdatingTask: updateTaskMutation.isPending,
    isGenerating: generateScheduleMutation.isPending,
    
    // Cache management
    invalidateCache: () => queryClient.invalidateQueries({ queryKey: ['project-schedule', projectId] }),
    removeFromCache: () => queryClient.removeQueries({ queryKey: ['project-schedule', projectId] }),
  };
}

// Export query key utilities for cache invalidation
export const scheduleKeys = {
  all: ['project-schedule'] as const,
  project: (projectId: string | number) => ['project-schedule', projectId] as const,
  tasks: (projectId: string | number) => ['project-schedule', projectId, 'tasks'] as const,
  dependencies: (projectId: string | number) => ['project-schedule', projectId, 'dependencies'] as const,
};