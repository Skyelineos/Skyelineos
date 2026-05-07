import { useMutation, useQueryClient } from '@tanstack/react-query';

// Task status options with colors for visual display


export function useUpdateTaskStatus(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const response = await fetch(`/api/projects/${projectId}/tasks/${taskId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update task status');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all relevant queries to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectCalendar', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectList', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/all-active'] });
    },
  });
}

export function useBulkUpdateTaskStatus(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskIds, status }: { taskIds: string[]; status: string }) => {
      const response = await fetch(`/api/projects/${projectId}/tasks/bulk-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskIds, status }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to bulk update task statuses');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectCalendar', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectList', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
    },
  });
}

// Export status options and helpers
export const TASK_STATUS_OPTIONS = [
  { value: 'Scheduled', label: 'Scheduled', color: 'bg-gray-200' },
  { value: 'In Progress', label: 'In Progress', color: 'bg-yellow-200' },
  { value: 'Completed', label: 'Completed', color: 'bg-green-200' },
  { value: 'Delayed', label: 'Delayed', color: 'bg-red-200' },
  { value: 'Cancelled', label: 'Cancelled', color: 'bg-gray-400' },
] as const;

export const getTaskStatusColor = (status: string): string => {
  const statusOption = TASK_STATUS_OPTIONS.find(option => option.value === status);
  return statusOption?.color || 'bg-gray-200';
};

export const getTaskStatusBadgeClass = (status: string): string => {
  switch (status) {
    case 'In Progress':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'Completed':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'Delayed':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'Cancelled':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-blue-100 text-blue-800 border-blue-200';
  }
};