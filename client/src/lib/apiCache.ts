import { QueryClient } from '@tanstack/react-query';

// Enhanced cache configuration with optimization for construction management app
export const queryCache = {
  // Static data - cache for longer periods (30 minutes)
  staticData: {
    staleTime: 30 * 60 * 1000, // 30 minutes
    cacheTime: 60 * 60 * 1000, // 1 hour
  },
  
  // Dynamic data - cache for shorter periods (5 minutes)
  dynamicData: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 15 * 60 * 1000, // 15 minutes
  },
  
  // Real-time data - cache for very short periods (30 seconds)
  realTimeData: {
    staleTime: 30 * 1000, // 30 seconds
    cacheTime: 2 * 60 * 1000, // 2 minutes
  },
};

// Cache keys for different data types
export const cacheKeys = {
  // Static reference data
  projectManagers: () => ['/api/project-managers'],
  contacts: () => ['/api/contacts'],
  
  // Project-specific data
  projects: () => ['/api/projects'],
  project: (id: string | undefined) => id ? ['/api/projects', id] : ['/api/projects'],
  
  // Project sub-resources
  estimates: (projectId: string) => ['/api/estimates', projectId],
  bids: (projectId: string) => ['/api/bids', projectId],
  photos: (projectId: string) => ['/api/projects', projectId, 'photos'],
  documents: (projectId: string) => ['/api/documents', projectId],
  tasks: (projectId: string) => ['/api/projects', projectId, 'tasks'],
};

// Prefetch utility for frequently accessed data
export function prefetchProjectData(queryClient: QueryClient, projectId: string) {
  const projectDataQueries = [
    cacheKeys.project(projectId),
    cacheKeys.estimates(projectId),
    cacheKeys.bids(projectId),
    cacheKeys.photos(projectId),
    cacheKeys.documents(projectId),
    cacheKeys.tasks(projectId),
  ];

  // Prefetch all project-related data
  projectDataQueries.forEach((queryKey) => {
    queryClient.prefetchQuery({
      queryKey,
      staleTime: queryCache.dynamicData.staleTime,
    });
  });
}

// Cache invalidation utilities
export const invalidateQueries = {
  // Invalidate all project-related data
  allProjects: (queryClient: QueryClient) => {
    queryClient.invalidateQueries({ queryKey: cacheKeys.projects() });
  },
  
  // Invalidate specific project and its sub-resources
  project: (queryClient: QueryClient, projectId: string) => {
    queryClient.invalidateQueries({ queryKey: cacheKeys.project(projectId) });
    queryClient.invalidateQueries({ queryKey: cacheKeys.estimates(projectId) });
    queryClient.invalidateQueries({ queryKey: cacheKeys.bids(projectId) });
    queryClient.invalidateQueries({ queryKey: cacheKeys.photos(projectId) });
    queryClient.invalidateQueries({ queryKey: cacheKeys.documents(projectId) });
    queryClient.invalidateQueries({ queryKey: cacheKeys.tasks(projectId) });
  },
  
  // Invalidate static reference data
  staticData: (queryClient: QueryClient) => {
    queryClient.invalidateQueries({ queryKey: cacheKeys.projectManagers() });
    queryClient.invalidateQueries({ queryKey: cacheKeys.contacts() });
  },
};