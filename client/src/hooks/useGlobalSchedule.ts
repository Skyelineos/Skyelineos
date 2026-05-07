import { useQuery } from '@tanstack/react-query';

interface GlobalScheduleTask {
  id: string;
  projectId: string;
  projectName: string;
  projectColor?: string;
  text: string;
  start: string;
  end: string;
  status?: string;
  assignedTo?: string;
  trade?: string;
}

interface GlobalScheduleResponse {
  tasks: GlobalScheduleTask[];
}

export function useGlobalSchedule() {
  return useQuery({
    queryKey: ['schedule', 'allProjects'],
    queryFn: async (): Promise<GlobalScheduleResponse> => {
      const response = await fetch('/api/schedule/global');
      if (!response.ok) {
        throw new Error('Failed to load global schedule');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchInterval: 1000 * 60 * 10, // 10 minutes
  });
}

export type { GlobalScheduleTask, GlobalScheduleResponse };