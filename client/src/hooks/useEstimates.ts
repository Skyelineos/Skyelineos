import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Estimate, EstimateItem } from '@shared/types';

export function useEstimates() {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['/api/estimates'],
    staleTime: 2 * 60 * 1000, // 2 minutes cache for navigation performance
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    refetchOnMount: true, // Only refetch on mount, not always
    refetchOnWindowFocus: false, // Reduce API calls for navigation
    refetchOnReconnect: true,
    queryFn: async () => {
      // Development logging removed
      const response = await fetch('/api/estimates');
      if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
      const data = await response.json();
      // Development logging removed
      if (data.length > 0 && data[0].categories) {
        // Development logging removed => `${item.trade}:${item.status}`));
      }
      return data;
    },
  });

  const forceRefresh = async () => {
    // Processing operation
    // Clear ALL estimates queries regardless of key variation
    await queryClient.removeQueries({ 
      predicate: (query) => query.queryKey[0] === '/api/estimates'
    });
    await queryClient.invalidateQueries({ 
      predicate: (query) => query.queryKey[0] === '/api/estimates'
    });
    // Force immediate refetch
    await query.refetch();
    // Success operation completed
  };

  const getProjectEstimates = (projectId: string | number) => {
    const allEstimates = query.data as Estimate[] || [];
    return allEstimates.filter((estimate: Estimate) => 
      estimate.projectId === parseInt(projectId.toString())
    );
  };

  return {
    ...query,
    estimates: query.data || [],
    forceRefresh,
    getProjectEstimates,
  };
}