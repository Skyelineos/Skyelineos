import { useCallback, useEffect } from 'react';
import { queryClient } from '@/lib/queryClient';

// Performance optimization hook for faster app loading
export function usePerformanceOptimizations() {
  // Prefetch critical data on app initialization
  const prefetchCriticalData = useCallback(async () => {
    // Only prefetch if cache is empty to avoid unnecessary requests
    if (!queryClient.getQueryData(['/api/projects'])) {
      queryClient.prefetchQuery({
        queryKey: ['/api/projects'],
        staleTime: 10 * 60 * 1000, // 10 minutes
        gcTime: 20 * 60 * 1000,
      });
    }

    if (!queryClient.getQueryData(['/api/notifications'])) {
      queryClient.prefetchQuery({
        queryKey: ['/api/notifications'],
        staleTime: 2 * 60 * 1000, // 2 minutes
        gcTime: 5 * 60 * 1000,
      });
    }
  }, []);

  // Clean up stale cache entries periodically
  const optimizeCache = useCallback(() => {
    // Remove queries that haven't been used in 30 minutes
    queryClient.getQueryCache().getAll().forEach((query) => {
      const lastUsed = query.state.dataUpdatedAt;
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      
      if (lastUsed < thirtyMinutesAgo && !query.getObserversCount()) {
        queryClient.removeQueries({ queryKey: query.queryKey });
      }
    });
  }, []);

  useEffect(() => {
    // Initialize performance optimizations
    prefetchCriticalData();
    
    // Set up periodic cache optimization
    const cacheCleanup = setInterval(optimizeCache, 10 * 60 * 1000); // Every 10 minutes
    
    return () => {
      clearInterval(cacheCleanup);
    };
  }, [prefetchCriticalData, optimizeCache]);

  return {
    prefetchCriticalData,
    optimizeCache,
  };
}

// Global cache configuration for better performance
export const performanceQueryConfig = {
  // Static data that rarely changes
  staticData: {
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },
  
  // Dynamic data that changes occasionally
  dynamicData: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },
  
  // Frequently changing data
  liveData: {
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  },
};