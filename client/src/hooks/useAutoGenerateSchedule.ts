import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useAutoGenerateSchedule(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/schedule/generate`, { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to auto-generate schedule');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule`] });
    },
  });
}