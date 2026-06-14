import { useRoute } from 'wouter';
import { useEffect, useState } from 'react';
import { format, parseISO, differenceInCalendarDays, addDays } from 'date-fns';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';
import { BuildTrackerPro } from '@/modules/gantt/ui/BuildTrackerPro';
import { CreateScheduleScreen } from '@/modules/gantt/ui/CreateScheduleScreen';
import { useGantt } from '@/modules/gantt/state';
import { loadSchedule, saveSchedule, type ScheduleTemplate } from '@/modules/gantt/useSchedulePersistence';
import type { WbsTask } from '@/modules/gantt/types';
import { ScheduleSignoffBanner } from '@/components/schedule/ScheduleSignoffBanner';
import { PublishScheduleButton } from '@/components/schedule/PublishScheduleButton';

// Re-anchor a template's tasks so the earliest activity starts on `startISO`.
function anchorTasks(tasks: WbsTask[], startISO: string): WbsTask[] {
  let earliest: string | null = null;
  const scan = (ns: WbsTask[]) => ns.forEach((n) => {
    if (!earliest || n.startDate < earliest) earliest = n.startDate;
    n.children && scan(n.children);
  });
  scan(tasks);
  if (!earliest) return tasks;
  const delta = differenceInCalendarDays(parseISO(startISO), parseISO(earliest));
  if (delta === 0) return tasks;
  const shift = (ns: WbsTask[]): WbsTask[] =>
    ns.map((n) => ({
      ...n,
      startDate: format(addDays(parseISO(n.startDate), delta), 'yyyy-MM-dd'),
      endDate: format(addDays(parseISO(n.endDate), delta), 'yyyy-MM-dd'),
      children: n.children ? shift(n.children) : undefined,
    }));
  return shift(tasks);
}

function GanttScheduleWrapper({
  projectId, projectName, projectType, startDate,
}: { projectId: string; projectName: string; projectType?: string; startDate?: string }) {
  const { setProjectId, setProjectName, setTasks, setLinks } = useGantt();
  const [mode, setMode] = useState<'loading' | 'create' | 'gantt'>('loading');

  useEffect(() => {
    setProjectId(projectId);
    setProjectName(projectName);
  }, [projectId, projectName, setProjectId, setProjectName]);

  // Load the saved schedule. If there isn't one yet, show the create screen
  // instead of seeding demo data.
  useEffect(() => {
    let cancelled = false;
    setMode('loading');
    loadSchedule(projectId)
      .then((saved) => {
        if (cancelled) return;
        if (saved && saved.tasks.length > 0) {
          setTasks(saved.tasks);
          setLinks(saved.links);
          setMode('gantt');
        } else {
          setMode('create');
        }
      })
      .catch(() => !cancelled && setMode('create'));
    return () => { cancelled = true; };
  }, [projectId, setTasks, setLinks]);

  const anchor = startDate || format(new Date(), 'yyyy-MM-dd');

  const startFromTemplate = async (t: ScheduleTemplate) => {
    const tasks = anchorTasks(t.tasks || [], anchor);
    setTasks(tasks);
    setLinks(t.links || []);
    setMode('gantt');
    // Persist immediately so the schedule "sticks" for this project.
    saveSchedule(projectId, tasks, t.links || []).catch(() => {});
  };

  const startBlank = () => {
    setTasks([]);
    setLinks([]);
    setMode('gantt');
  };

  if (mode === 'loading') return <div className="p-6"><ProjectDetailSkeleton /></div>;
  if (mode === 'create') {
    return (
      <CreateScheduleScreen
        projectType={projectType}
        onPickTemplate={startFromTemplate}
        onStartBlank={startBlank}
      />
    );
  }
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

  const raw = transformedProject as any;

  return (
    <ProjectLayout projectId={projectId!} projectName={transformedProject.name}>
      <div className="h-full flex flex-col overflow-hidden">
        <ScheduleSignoffBanner projectId={projectId!} />
        <PublishScheduleButton projectId={projectId!} />
        <div className="flex-1 overflow-auto">
          <GanttScheduleWrapper
            projectId={projectId!}
            projectName={transformedProject.name}
            projectType={raw.projectType}
            startDate={raw.startDate}
          />
        </div>
      </div>
    </ProjectLayout>
  );
}
