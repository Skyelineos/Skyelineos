import { useRoute } from 'wouter';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { WalkthroughCapture } from '@/components/walkthrough/WalkthroughCapture';
import { WalkthroughList } from '@/components/walkthrough/WalkthroughList';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';
import { ClipboardCheck } from 'lucide-react';

export default function ProjectWalkthroughs() {
  const [, params] = useRoute('/projects/:id/walkthroughs');
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
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-6 h-6 text-[#C9A96E]" />
            <h1 className="text-2xl font-bold text-gray-900">Walkthroughs</h1>
          </div>
          <WalkthroughCapture projectId={projectId} projectName={project.name} />
        </div>
        <WalkthroughList projectId={projectId} />
      </div>
    </ProjectLayout>
  );
}
