import { useEffect, ReactNode } from 'react';
import { queryClient } from '@/lib/queryClient';

interface PerformanceProviderProps {
  children: ReactNode;
}

export function PerformanceProvider({ children }: PerformanceProviderProps) {
  useEffect(() => {
    // Configure global performance settings
    const configurePerformance = async () => {
      // Preload critical app data
      const criticalQueries = [
        '/api/projects',
        '/api/notifications',
      ];

      // Only prefetch if not already cached
      criticalQueries.forEach((query) => {
        if (!queryClient.getQueryData([query])) {
          queryClient.prefetchQuery({
            queryKey: [query],
            staleTime: 10 * 60 * 1000, // 10 minutes
            gcTime: 20 * 60 * 1000,
          });
        }
      });

      // Set up periodic cache optimization
      const optimizeCache = () => {
        const allQueries = queryClient.getQueryCache().getAll();
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes

        allQueries.forEach((query) => {
          const age = now - query.state.dataUpdatedAt;
          if (age > maxAge && !query.getObserversCount()) {
            queryClient.removeQueries({ queryKey: query.queryKey });
          }
        });
      };

      // Run cache optimization every 10 minutes
      const interval = setInterval(optimizeCache, 10 * 60 * 1000);

      return () => clearInterval(interval);
    };

    const cleanup = configurePerformance();
    return cleanup;
  }, []);

  return <>{children}</>;
}