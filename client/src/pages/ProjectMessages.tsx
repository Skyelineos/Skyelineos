import { useRoute } from 'wouter';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';
import { MessagingModule } from '@/components/messaging/MessagingModule';
import { useAuth } from '@/hooks/use-auth';

export default function ProjectMessages() {
  const [, params] = useRoute('/projects/:id/messages');
  const projectId = params?.id;
  const { user } = useAuth();

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
      <ProjectLayout projectId={projectId!} projectName="Error">
        <div className="p-6">
          <div className="text-center py-12">
            <p className="text-gray-500">Failed to load project details</p>
          </div>
        </div>
      </ProjectLayout>
    );
  }

  return (
    <ProjectLayout projectId={projectId!} projectName={transformedProject.name}>
      <div className="h-full">
        <MessagingModule
          projectId={parseInt(projectId!)}
          currentUser={{
            id: user?.id?.toString() || '1',
            name: `${user?.firstName || 'Demo'} ${user?.lastName || 'User'}`,
            role: user?.role || 'admin'
          }}
        />
      </div>
    </ProjectLayout>
  );
}