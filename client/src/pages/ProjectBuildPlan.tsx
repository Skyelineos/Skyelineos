// ─────────────────────────────────────────────────────────────────────────────
// Project Build Plan — the project's task list generated from the Master Library
// Route: /projects/:id/build-plan
//
// Empty state → prompt to generate tasks from the master. Once generated, shows
// the phase-grouped task board. This is the project-side counterpart to the
// admin Master Task Library.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';
import { Button } from '@/components/ui/button';
import { Sparkles, ListChecks, Loader2 } from 'lucide-react';
import { ProjectTaskBoard } from '@/components/taskLibrary/ProjectTaskBoard';
import { GenerateTasksModal } from '@/components/taskLibrary/GenerateTasksModal';

export default function ProjectBuildPlan() {
  const [, params] = useRoute('/projects/:id/build-plan');
  const projectId = params?.id;
  const { project, isLoading, error } = useOptimizedProject(projectId);

  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const q = query(collection(db, 'projectTasks'), where('projectId', '==', projectId));
    const unsub = onSnapshot(
      q,
      (snap) => setTaskCount(snap.size),
      () => setTaskCount(0),
    );
    return unsub;
  }, [projectId]);

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
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-5">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-[#C9A96E]" /> Build Plan
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            This project's task list — an independent copy of the master template. Edits here never affect the
            master library.
          </p>
        </div>

        {taskCount === null ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
          </div>
        ) : taskCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg">
            <Sparkles className="h-14 w-14 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">No tasks yet</h3>
            <p className="text-sm text-gray-500 mb-5 max-w-md">
              Generate this project's build plan from the current Master Task Library. You'll choose which optional
              task groups apply to this home.
            </p>
            <Button className="bg-[#C9A96E] hover:bg-[#b8975c]" onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-4 w-4 mr-2" /> Generate Tasks from Master
            </Button>
          </div>
        ) : (
          <ProjectTaskBoard projectId={projectId} onRequestGenerate={() => setGenerateOpen(true)} />
        )}
      </div>

      <GenerateTasksModal projectId={projectId} open={generateOpen} onClose={() => setGenerateOpen(false)} />
    </ProjectLayout>
  );
}
