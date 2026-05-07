import { useQuery } from '@tanstack/react-query';
import { transformDbProject } from '@/lib/projectUtils';
import { queryCache, cacheKeys } from '@/lib/apiCache';
import { DatabaseProject, Contact, TransformedProject } from '@shared/types';

// Custom hook for optimized project data fetching
export function useProjects() {
  // Fetch project managers first (static data)
  const { data: projectManagers = [] } = useQuery<Contact[]>({
    queryKey: cacheKeys.projectManagers(),
    ...queryCache.staticData,
  });

  // Fetch projects with project managers dependency
  const { data: dbProjects = [], isLoading, error } = useQuery<DatabaseProject[]>({
    queryKey: cacheKeys.projects(),
    ...queryCache.dynamicData,
  });

  // Transform projects with project managers data - ensure safety
  const projects: TransformedProject[] = (dbProjects && projectManagers.length > 0) 
    ? dbProjects.map((project: DatabaseProject) => transformDbProject(project, projectManagers))
        .sort((a: TransformedProject, b: TransformedProject) => parseInt(b.id) - parseInt(a.id))
    : [];

  return {
    projects,
    projectManagers,
    isLoading: isLoading || (dbProjects.length > 0 && projectManagers.length === 0),
    error,
  };
}

// Custom hook for individual project data
export function useProject(projectId: string | undefined) {
  // Fetch project managers (static data)
  const { data: projectManagers = [] } = useQuery<Contact[]>({
    queryKey: cacheKeys.projectManagers(),
    ...queryCache.staticData,
  });

  // Fetch specific project data
  const { data: project, isLoading, error } = useQuery<DatabaseProject>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
    ...queryCache.dynamicData,
  });

  // Transform project with project managers data - ensure null safety
  const transformedProject: TransformedProject | null = project && projectManagers.length > 0 
    ? transformDbProject(project, projectManagers) 
    : null;

  return {
    project: transformedProject,
    rawProject: project,
    projectManagers,
    isLoading: isLoading || (!!project && projectManagers.length === 0),
    error,
  };
}