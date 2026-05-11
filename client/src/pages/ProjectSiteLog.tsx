import { useRoute } from 'wouter';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { SiteLogContent } from './SiteLog';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';

export default function ProjectSiteLog() {
  const [, params] = useRoute('/projects/:id/site-log');
  const projectId = params?.id;
  const { project, isLoading, error } = useOptimizedProject(projectId);

  if (!projectId) return null;
  if (isLoading) {
    return (
      <ProjectLayout projectId={projectId} projectName="Loading...">
        <div className="p-6"><ProjectDetailSkeleton /></div>
      </ProjectLayout>
    );
  }
  if (error || !project) {
    return (
      <ProjectLayout projectId={projectId} projectName="Project Not Found">
        <div className="p-6 text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">Project Not Found</h2>
        </div>
      </ProjectLayout>
    );
  }
  return (
    <ProjectLayout projectId={projectId} projectName={project.name}>
      <SiteLogContent projectId={projectId} />
    </ProjectLayout>
  );
}
