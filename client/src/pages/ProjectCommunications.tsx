// Project-scoped Communication Center. Same panel as the global hub, filtered to
// this project's conversations only. Mirrors ProjectRFIs.tsx.

import { useRoute } from 'wouter';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { CommunicationPanel } from '@/components/communications/CommunicationPanel';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';

export default function ProjectCommunications() {
  const [, params] = useRoute('/projects/:id/communications');
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
      <div className="p-4 md:p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold font-heading text-brand-black">Communication</h1>
          <p className="text-sm text-brand-dark-gray-blue">Every conversation, call, and meeting for this project.</p>
        </div>
        <CommunicationPanel
          subjectFilter={{ type: 'project', id: projectId }}
          subjectLabel={project.name}
          height="h-[640px]"
        />
      </div>
    </ProjectLayout>
  );
}
