import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';

// CSV Upload Hook
export function useCreateScheduleFromCSV(projectId: number) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('csvFile', file);
      
      const response = await fetch(`/api/projects/${projectId}/schedule/csv-upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload CSV');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule`] });
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId.toString()] });
    },
  });
}

// Auto-Generate from Estimates Hook (Updated)
export function useAutoGenerateSchedule(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/projects/${projectId}/schedule/generate-from-estimates`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule`] });
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId] });
    },
  });
}

// Copy from Project Hook
export function useCopySchedule(projectId: number) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ sourceProjectId }: { sourceProjectId: number }) => {
      return apiRequest(`/api/projects/${projectId}/schedule/copy`, 'POST', {
        sourceProjectId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule`] });
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId.toString()] });
    },
  });
}

// Apply Template Hook
export function useApplyTemplate(projectId: number) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ templateId }: { templateId: string }) => {
      return apiRequest(`/api/projects/${projectId}/schedule/apply-template`, 'POST', {
        templateId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule`] });
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId.toString()] });
    },
  });
}