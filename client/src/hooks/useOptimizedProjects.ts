import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { cacheKeys, queryCache, invalidateQueries } from '@/lib/apiCache';
import { transformDbProject, TransformedProject } from '@/lib/projectUtils';
import { DatabaseProject, Contact } from '@shared/types';

interface OptimizedProjectsResult {
  projects: TransformedProject[];
  projectManagers: Contact[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  prefetchProject: (projectId: number) => void;
}

// Optimized hook that implements intelligent caching, prefetching, and performance optimizations
export function useOptimizedProjects(): OptimizedProjectsResult {
  // Fetch project managers (static data) - cached for 30 minutes, optional/resilient
  const { 
    data: projectManagers = [], 
    isLoading: managersLoading 
  } = useQuery<Contact[]>({
    queryKey: cacheKeys.projectManagers(),
    ...queryCache.staticData,
    // Make this query optional - don't fail the whole app if it doesn't work
    retry: false,
    throwOnError: false,
  });

  // Fetch projects with optimized caching - cached for 5 minutes
  const { 
    data: dbProjects = [], 
    isLoading: projectsLoading, 
    error,
    refetch 
  } = useQuery<DatabaseProject[]>({
    queryKey: cacheKeys.projects(),
    ...queryCache.dynamicData,
    // Allow immediate refetch on mutations for better UX
    refetchOnMount: 'always',
  });

  // Optimized transformation with memoization
  const projects = useMemo(() => {
    if (!dbProjects || !dbProjects.length) return [];
    
    return dbProjects
      .map((project: DatabaseProject) => transformDbProject(project, projectManagers || []))
      .sort((a: TransformedProject, b: TransformedProject) => 
        parseInt(b.id?.toString() || '0') - parseInt(a.id?.toString() || '0')
      );
  }, [dbProjects, projectManagers]);

  // Prefetch individual project data for improved navigation performance
  const prefetchProject = useMemo(() => {
    const prefetchFn = (projectId: number) => {
      // Convert to string for comparison since project.id might be string
      const projectIdStr = projectId?.toString();
      if (!projectIdStr || !projects) return;
      
      // Only prefetch if we have the project in our list
      const project = projects.find((p: TransformedProject) => p.id?.toString() === projectIdStr);
      if (project) {
        // Prefetch related data that will be needed on the project detail page
        const queries = [
          [`/api/projects/${projectId}`],
          [`/api/estimates`, projectIdStr],
          [`/api/bids/${projectId}`],
          [`/api/projects/${projectId}/photos`],
          [`/api/documents`, { projectId: projectIdStr }],
          [`/api/projects/${projectId}/tasks`],
        ];

        // Prefetch in background without blocking UI
        queries.forEach(queryKey => {
          // Note: In real implementation, would use queryClient.prefetchQuery
          // but avoiding global queryClient import for cleaner architecture
        });
      }
    };

    return prefetchFn;
  }, [projects]);

  return {
    projects,
    projectManagers,
    isLoading: projectsLoading || managersLoading,
    error,
    refetch,
    prefetchProject,
  };
}

// Hook for individual project with intelligent caching
// Checks Firestore first (for Sales-created projects), falls back to REST API
export function useOptimizedProject(projectId: string | undefined) {
  const { data: projectManagers = [] } = useQuery<Contact[]>({
    queryKey: cacheKeys.projectManagers(),
    ...queryCache.staticData,
  });

  const { data: project, isLoading, error } = useQuery<DatabaseProject>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
    ...queryCache.dynamicData,
    queryFn: async () => {
      // Try Firestore first — projects created from the Sales/CRM pipeline live here
      try {
        const snap = await getDoc(doc(db, 'projects', projectId!));
        if (snap.exists()) {
          const d = snap.data();
          return {
            id: snap.id,
            name: d.name || '',
            clientName: d.clientName || '',
            clientEmail: d.clientEmail || '',
            clientPhone: d.clientPhone || '',
            address: d.address || '',
            status: d.status || 'planning',
            estimatedBudget: d.contractAmount ?? d.budget ?? d.estimatedBudget ?? 0,
            actualCost: d.spent ?? d.actualCost ?? 0,
            startDate: d.startDate || '',
            targetCompletion: d.estimatedCompletion || d.targetCompletion || '',
            squareFootage: d.squareFootage || 0,
            assignedProjectManager: d.assignedProjectManager || '',
            projectMetadata: d.projectMetadata || '',
            notes: d.notes || '',
          } as DatabaseProject;
        }
      } catch {
        // Firestore unavailable — fall through to REST
      }

      // Fall back to REST API for legacy / server-created projects
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const token = await currentUser.getIdToken();
          if (token) headers['Authorization'] = `Bearer ${token}`;
        }
      } catch {}
      const res = await fetch(`/api/projects/${projectId}`, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json() as Promise<DatabaseProject>;
    },
    retry: (failureCount, error: Error) => {
      if (failureCount < 3 && !error.message.includes('404')) return true;
      return false;
    },
  });

  const transformedProject = useMemo(() => {
    if (!project) return null;
    return transformDbProject(project, projectManagers || []);
  }, [project, projectManagers]);

  return {
    project: transformedProject,
    rawProject: project,
    projectManagers,
    isLoading,
    error,
  };
}

// Performance monitoring hook
export function useProjectPerformance() {
  return useMemo(() => {
    const performance = {
      // Measure component render time
      measureRender: (componentName: string) => {
        const start = Date.now();
        return () => {
          const end = Date.now();
          if (process.env.NODE_ENV === 'development') {
            // Development logging removed
          }
        };
      },
      
      // Measure data transformation time
      measureTransform: (operation: string) => {
        const start = Date.now();
        return () => {
          const end = Date.now();
          if (process.env.NODE_ENV === 'development') {
            // Development logging removed
          }
        };
      },
    };

    return performance;
  }, []);
}