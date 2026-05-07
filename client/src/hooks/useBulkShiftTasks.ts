import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import type { TaskShift } from '../utils/cascadeShift';

interface BulkShiftTasksRequest {
  shifts: Array<{
    id: number;
    start: string;
    end: string;
  }>;
}

interface BulkShiftTasksResponse {
  success: boolean;
  message: string;
  data: {
    updatedTasks: Array<{
      id: number;
      start: string;
      end: string;
    }>;
    cascadeEffects: number;
    totalUpdated: number;
  };
}

/**
 * React Query mutation hook for bulk shifting multiple tasks
 * Used for cascade updates when a task is moved and affects dependent tasks
 */
export function useBulkShiftTasks(projectId: number) {
  return useMutation<BulkShiftTasksResponse, Error, BulkShiftTasksRequest>({
    mutationFn: async ({ shifts }) => {
      // Development logging removed for production
      
      const response = await apiRequest(`/api/projects/${projectId}/tasks/bulkShift`, 'POST', {
        shifts
      });

      return response;
    },
    onSuccess: (data) => {
      // Bulk shift completed successfully
    },
    onError: (error) => {
      console.error('❌ Failed to bulk shift tasks:', error);
    }
  });
}