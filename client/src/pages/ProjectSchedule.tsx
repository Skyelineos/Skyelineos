import { useRoute } from 'wouter';
import { useEffect, useState } from 'react';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';
import { BuildTrackerPro } from '@/modules/gantt/ui/BuildTrackerPro';
import { useGantt } from '@/modules/gantt/state';
import { sampleWbs } from '@/modules/gantt/demo/sampleWbs';
import { loadSchedule } from '@/modules/gantt/useSchedulePersistence';
import { ScheduleSignoffBanner } from '@/components/schedule/ScheduleSignoffBanner';

function GanttScheduleWrapper({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { setProjectId, setProjectName, setTasks, setLinks } = useGantt();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    setProjectId(projectId);
    setProjectName(projectName);
  }, [projectId, projectName, setProjectId, setProjectName]);

  // Load saved schedule from Firestore; fall back to sample data if none exists
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    loadSchedule(projectId).then(saved => {
      if (saved && saved.tasks.length > 0) {
        setTasks(saved.tasks);
        setLinks(saved.links);
      } else {
        setTasks(sampleWbs);
        setLinks([]);
      }
    }).catch(() => {
      setTasks(sampleWbs);
      setLinks([]);
    });
  }, [projectId, initialized, setTasks, setLinks]);

  return <BuildTrackerPro />;
}

export default function ProjectSchedule() {
  const [, params] = useRoute('/projects/:id/schedule');
  const projectId = params?.id;

  const { project: transformedProject, isLoading, error } = useOptimizedProject(projectId);

  if (isLoading) {
    return (
      <ProjectLayout projectId={projectId!} projectName="Loading...">
        <div className="p-6"><ProjectDetailSkeleton /></div>
      </ProjectLayout>
    );
  }

  if (error || !transformedProject) {
    return (
      <ProjectLayout projectId={projectId!} projectName="Project Not Found">
        <div className="p-6 text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">Project Not Found</h2>
          <p className="text-gray-600">The project you're looking for doesn't exist or may have been deleted.</p>
        </div>
      </ProjectLayout>
    );
  }

  return (
    <ProjectLayout projectId={projectId!} projectName={transformedProject.name}>
      <div className="h-full flex flex-col overflow-hidden">
        <ScheduleSignoffBanner projectId={projectId!} />
        <div className="flex-1 overflow-hidden">
          <GanttScheduleWrapper projectId={projectId!} projectName={transformedProject.name} />
        </div>
      </div>
    </ProjectLayout>
  );
}
