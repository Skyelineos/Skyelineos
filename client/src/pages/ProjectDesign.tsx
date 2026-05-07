import { useRoute } from 'wouter';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import GCDesignSnapshot from '@/components/gc/GCDesignSnapshot';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';

export default function ProjectDesign() {
  const [, params] = useRoute('/projects/:id/design');
  const projectId = params?.id;
  const { rawProject: project } = useOptimizedProject(projectId);

  return (
    <ProjectLayout projectId={projectId!} projectName={project?.name || 'Project'}>
      <GCDesignSnapshot projectId={projectId!} projectName={project?.name} />
    </ProjectLayout>
  );
}
