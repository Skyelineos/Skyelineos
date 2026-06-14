// ─────────────────────────────────────────────────────────────────────────────
// Closeout Lessons Learned — admin page (/projects/:id/closeout)
//
// Reviews how the project's tasks performed (custom/skipped/delayed/blocked),
// runs the analysis pass to generate improvement suggestions, and lets the admin
// promote each one into the Master Task Library. Nothing is auto-applied.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { useRoute } from 'wouter';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  GraduationCap,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Plus,
  Clock,
  Ban,
  AlertTriangle,
  Camera,
  ShieldQuestion,
  Wrench,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ProjectTask, TaskImprovement, ImprovementKind } from '@shared/taskLibrary-types';
import { analyzeCloseout, resolveImprovement } from '@/lib/taskLibrary/api';
import { PromoteImprovementsModal } from '@/components/taskLibrary/PromoteImprovementsModal';

const KIND_META: Record<ImprovementKind, { label: string; icon: any; color: string }> = {
  custom_task_added: { label: 'Custom tasks added', icon: Plus, color: 'text-amber-600' },
  frequently_skipped: { label: 'Skipped tasks', icon: XCircle, color: 'text-gray-500' },
  delayed: { label: 'Delayed tasks', icon: Clock, color: 'text-orange-600' },
  caused_change_order: { label: 'Caused change orders', icon: Wrench, color: 'text-blue-600' },
  blocked: { label: 'Blocked tasks', icon: Ban, color: 'text-red-600' },
  missing_acceptance_criteria: { label: 'Missing acceptance criteria', icon: ShieldQuestion, color: 'text-purple-600' },
  extra_photos_docs: { label: 'Needed extra photos/docs', icon: Camera, color: 'text-cyan-600' },
  warranty_issue: { label: 'Warranty issues', icon: AlertTriangle, color: 'text-red-700' },
};

export default function ProjectCloseout() {
  const [, params] = useRoute('/projects/:id/closeout');
  const projectId = params?.id;
  const { project, isLoading, error } = useOptimizedProject(projectId);
  const { toast } = useToast();

  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [improvements, setImprovements] = useState<TaskImprovement[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [selected, setSelected] = useState<TaskImprovement | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const unsubTasks = onSnapshot(
      query(collection(db, 'projectTasks'), where('projectId', '==', projectId)),
      (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ProjectTask[]),
    );
    const unsubImp = onSnapshot(
      query(collection(db, 'taskImprovements'), where('projectId', '==', projectId)),
      (snap) => setImprovements(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TaskImprovement[]),
    );
    return () => {
      unsubTasks();
      unsubImp();
    };
  }, [projectId]);

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: tasks.length,
      complete: tasks.filter((t) => t.status === 'Complete').length,
      custom: tasks.filter((t) => t.isCustomTask).length,
      skipped: tasks.filter((t) => t.status === 'Skipped').length,
      blocked: tasks.filter((t) => t.status === 'Blocked').length,
      delayed: tasks.filter(
        (t) => t.dueDate && new Date(t.dueDate).getTime() < now && !['Complete', 'Skipped'].includes(t.status),
      ).length,
    };
  }, [tasks]);

  const pending = improvements.filter((i) => i.status === 'pending');
  const resolved = improvements.filter((i) => i.status !== 'pending');

  const grouped = useMemo(() => {
    const map = new Map<ImprovementKind, TaskImprovement[]>();
    for (const i of pending) {
      const arr = map.get(i.kind) || [];
      arr.push(i);
      map.set(i.kind, arr);
    }
    return Array.from(map.entries());
  }, [pending]);

  const handleAnalyze = async () => {
    if (!projectId) return;
    setAnalyzing(true);
    try {
      const r = await analyzeCloseout(projectId);
      toast({ title: 'Analysis complete', description: `${r.written} suggestion(s) ready for review.` });
    } catch (e: any) {
      toast({ title: 'Analysis failed', description: e.message, variant: 'destructive' });
    } finally {
      setAnalyzing(false);
    }
  };

  const quickReject = async (imp: TaskImprovement) => {
    try {
      await resolveImprovement(imp.id, 'reject');
      toast({ title: 'Suggestion rejected' });
    } catch (e: any) {
      toast({ title: 'Action failed', description: e.message, variant: 'destructive' });
    }
  };

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
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-[#C9A96E]" /> Closeout Lessons Learned
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              Review this project's task performance and promote improvements into the Master Task Library so the next
              home is built better.
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} className="bg-[#C9A96E] hover:bg-[#b8975c]">
            {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Analyze Project
          </Button>
        </div>

        {/* Performance summary */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Complete" value={stats.complete} color="text-green-600" />
          <StatCard label="Custom" value={stats.custom} color="text-amber-600" />
          <StatCard label="Skipped" value={stats.skipped} color="text-gray-500" />
          <StatCard label="Delayed" value={stats.delayed} color="text-orange-600" />
          <StatCard label="Blocked" value={stats.blocked} color="text-red-600" />
        </div>

        {/* Suggested improvements */}
        <div>
          <h2 className="text-lg font-semibold mb-3">
            Suggested Improvements{' '}
            <span className="text-sm font-normal text-gray-500">({pending.length} pending)</span>
          </h2>

          {tasks.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border-2 border-dashed rounded-lg">
              This project has no generated tasks yet.
            </div>
          ) : pending.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border-2 border-dashed rounded-lg">
              <CheckCircle2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              No pending suggestions. Run <span className="font-medium">Analyze Project</span> to generate them.
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(([kind, items]) => {
                const meta = KIND_META[kind];
                const Icon = meta.icon;
                return (
                  <div key={kind} className="bg-white border rounded-lg overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                      <span className="font-medium text-sm">{meta.label}</span>
                      <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
                    </div>
                    <div className="divide-y">
                      {items.map((imp) => (
                        <div key={imp.id} className="px-4 py-3 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {imp.taskCode && <code className="text-[11px] text-gray-400">{imp.taskCode}</code>}
                              <span className="font-medium text-sm">{imp.title}</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-0.5">{imp.summary}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-[#C9A96E] hover:bg-[#b8975c]"
                              onClick={() => {
                                setSelected(imp);
                                setModalOpen(true);
                              }}
                            >
                              Review
                            </Button>
                            <Button size="sm" variant="ghost" className="text-gray-400" onClick={() => quickReject(imp)}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Resolved log */}
        {resolved.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Resolved ({resolved.length})</h2>
            <div className="bg-white border rounded-lg divide-y">
              {resolved.map((imp) => (
                <div key={imp.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                  <span className="flex-1 text-gray-600 truncate">{imp.title || imp.summary}</span>
                  <Badge
                    variant="outline"
                    className={
                      imp.status === 'approved'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : imp.status === 'rejected'
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                    }
                  >
                    {imp.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <PromoteImprovementsModal improvement={selected} open={modalOpen} onClose={() => setModalOpen(false)} />
    </ProjectLayout>
  );
}

function StatCard({ label, value, color = 'text-gray-800' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white border rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
