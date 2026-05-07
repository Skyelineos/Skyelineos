import { useRoute } from 'wouter';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import BudgetTab from '@/components/budget/BudgetTab';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';

export default function ProjectBudget() {
  const [, params] = useRoute('/projects/:id/budget');
  const projectId = params?.id;

  const { project: transformedProject, isLoading, error } = useOptimizedProject(projectId);

  if (isLoading) {
    return (
      <ProjectLayout projectId={projectId!} projectName="Loading...">
        <div className="p-6">
          <ProjectDetailSkeleton />
        </div>
      </ProjectLayout>
    );
  }

  if (error || !transformedProject) {
    return (
      <ProjectLayout projectId={projectId!} projectName="Project Not Found">
        <div className="p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-2">Project Not Found</h2>
            <p className="text-gray-600 mb-4">
              The project you're looking for doesn't exist or may have been deleted.
            </p>
          </div>
        </div>
      </ProjectLayout>
    );
  }

  return (
    <ProjectLayout projectId={projectId!} projectName={transformedProject.name}>
      <div className="p-6">
        <BudgetTab projectId={parseInt(projectId!)} />
      </div>
    </ProjectLayout>
  );
}