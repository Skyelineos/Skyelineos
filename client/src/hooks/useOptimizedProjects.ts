import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
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

  // Live subscription to the projects collection. onSnapshot serves cached
  // data instantly (from IndexedDB), then streams in any updates — second
  // visits feel immediate instead of waiting for a fresh network round-trip.
  const [dbProjects, setDbProjects] = useState<DatabaseProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      snap => {
        const rows: DatabaseProject[] = snap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name || '',
            description: data.description || '',
            clientName: data.clientName || '',
            clientEmail: data.clientEmail || '',
            clientPhone: data.clientPhone || '',
            address: data.address || '',
            status: data.status || 'planning',
            estimatedBudget: data.contractAmount ?? data.estimatedBudget ?? data.budget ?? 0,
            actualCost: data.actualCost ?? data.spent ?? 0,
            startDate: data.startDate || '',
            targetCompletion: data.targetCompletion || data.estimatedCompletion || '',
            squareFootage: data.squareFootage || 0,
            projectMetadata: data.projectMetadata || '',
            // carry through fields the project overview reads but list doesn't
            createdAt: data.createdAt,
            projectCode: data.projectCode,
            designerChoice: data.designerChoice,
            designerContactId: data.designerContactId,
            designerName: data.designerName,
            designerEmail: data.designerEmail,
            assignedProjectManager: data.assignedProjectManager,
            notes: data.notes,
          } as any;
        });
        setDbProjects(rows);
        setProjectsLoading(false);
        // Pre-warm React Query's per-project cache so opening any project
        // from the list resolves instantly — no second round-trip needed.
        rows.forEach(p => {
          queryClient.setQueryData([`/api/projects/${p.id}`], p);
        });
      },
      e => {
        setError(e as any);
        setProjectsLoading(false);
      },
    );
    return () => unsub();
  }, [queryClient]);
  const refetch = () => {/* live listener — re-render is automatic */};

  // Optimized transformation with memoization
  const projects = useMemo(() => {
    if (!dbProjects || !dbProjects.length) return [];
    
    return dbProjects
      .map((project: DatabaseProject) => transformDbProject(project, projectManagers || []))
      .sort((a: TransformedProject, b: TransformedProject) => 
        parseInt(b.id?.toString() || '0') - parseInt(a.id?.toString() || '0')
      );
  }, [dbProjects, projectManagers]);

  // Prefetch individual project data on hover so opening the project page
  // feels instant. Reads the project doc into React Query's cache; the
  // detail page will then resolve immediately on mount.
  const prefetchProject = useMemo(() => {
    return (projectId: string | number) => {
      const idStr = String(projectId || '');
      if (!idStr) return;
      // Don't refetch if we have it already and it's fresh.
      const cached = queryClient.getQueryData([`/api/projects/${idStr}`]);
      if (cached) return;
      queryClient.prefetchQuery({
        queryKey: [`/api/projects/${idStr}`],
        queryFn: async () => {
          const snap = await getDoc(doc(db, 'projects', idStr));
          if (!snap.exists()) return null;
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
        },
        staleTime: 60_000,
      });
    };
  }, [queryClient]);

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
      // Read from Firestore. The `/api/projects/{id}` fallback was removed
      // because the org IAM policy blocks the Cloud Run endpoint and the
      // failed fetch added ~1s of latency on every project open.
      const snap = await getDoc(doc(db, 'projects', projectId!));
      if (!snap.exists()) throw new Error('404');
      const d = snap.data();
      // Spread the raw doc first so any non-mapped fields (designerChoice,
      // designerName, designerEmail, designerContactId, projectCode, etc.)
      // pass through. Then override with safe normalized fallbacks.
      return {
        ...(d as any),
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
      } as any;
    },
    retry: (failureCount, error: Error) => failureCount < 1 && !error.message.includes('404'),
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