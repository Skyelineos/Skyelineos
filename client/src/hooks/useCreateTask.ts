import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface CreateTaskData {
  text: string;
  start: string;
  end: string;
  duration?: number;
  category?: string;
  description?: string;
  // Additional fields for enhanced task creation
  trade?: string;
  contactId?: number;
  status?: string;
  notes?: string;
  color?: string;
}

export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (task: CreateTaskData) => {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify(task),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create task');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule`] });
    },
  });
}