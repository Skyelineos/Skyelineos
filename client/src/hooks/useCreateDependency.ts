import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface CreateDependencyData {
  predecessorId: number;
  successorId: number;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

export function useCreateDependency(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (dependency: CreateDependencyData) => {
      const response = await fetch(`/api/projects/${projectId}/dependencies`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify(dependency),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create dependency');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule`] });
    },
  });
}