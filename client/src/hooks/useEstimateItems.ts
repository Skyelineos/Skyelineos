import { useQuery } from '@tanstack/react-query';

export interface EstimateItem {
  id: string;
  estimateId: number;
  trade: string;
  description: string;
  vendor: string;
  duration: number;
  status: string;
  defaultDuration?: number; // For backward compatibility
  predecessorTaskId?: number;
  category?: string;
}

export function useEstimateItems(projectId: string) {
  return useQuery({
    queryKey: [`/api/projects/${projectId}/estimates/approved`],
    enabled: !!projectId,
  });
}