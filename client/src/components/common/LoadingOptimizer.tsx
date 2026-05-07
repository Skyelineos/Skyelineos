import { useEffect, useState, ReactNode } from 'react';
import { queryClient } from '@/lib/queryClient';

interface LoadingOptimizerProps {
  children: ReactNode;
  criticalRoutes?: string[];
}

export function LoadingOptimizer({ 
  children, 
  criticalRoutes = ['/api/projects', '/api/contacts', '/api/notifications'] 
}: LoadingOptimizerProps) {
  const [isOptimizing, setIsOptimizing] = useState(true);

  useEffect(() => {
    const optimizeApp = async () => {
      try {
        // Prefetch critical data only if cache is empty
        const prefetchPromises = criticalRoutes.map(async (route) => {
          const cachedData = queryClient.getQueryData([route]);
          
          if (!cachedData) {
            return queryClient.prefetchQuery({
              queryKey: [route],
              staleTime: 10 * 60 * 1000, // 10 minutes
              gcTime: 20 * 60 * 1000, // 20 minutes
            });
          }
          return Promise.resolve();
        });

        // Wait for prefetch with timeout to avoid blocking
        await Promise.allSettled(prefetchPromises.map(p => 
          Promise.race([p, new Promise(resolve => setTimeout(resolve, 2000))])
        ));

        // Configure performance settings
        const configureCache = () => {
          // Set up periodic cache cleanup
          const cleanupInterval = setInterval(() => {
            const allQueries = queryClient.getQueryCache().getAll();
            const now = Date.now();
            const maxAge = 30 * 60 * 1000; // 30 minutes

            allQueries.forEach((query) => {
              const age = now - query.state.dataUpdatedAt;
              if (age > maxAge && !query.getObserversCount()) {
                queryClient.removeQueries({ queryKey: query.queryKey });
              }
            });
          }, 10 * 60 * 1000); // Every 10 minutes

          return cleanupInterval;
        };

        const cleanup = configureCache();

        // Cleanup function
        return () => {
          if (cleanup) {
            clearInterval(cleanup);
          }
        };
      } finally {
        setIsOptimizing(false);
      }
    };

    optimizeApp();
  }, [criticalRoutes]);

  // Show optimized loading state briefly
  if (isOptimizing) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">Optimizing performance...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}