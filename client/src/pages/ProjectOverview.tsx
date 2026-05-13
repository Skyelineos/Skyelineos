import { useQuery } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getStatusLabel, getStatusColor, LIFECYCLE_PHASES, nextPhase, getStatusBadgeClass, computeScheduleSlip } from '@/lib/projectUtils';
import { collection, doc, getDocs, query as fsQuery, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { ChevronRight, CheckCircle2, Wrench } from 'lucide-react';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';
import { WorkingEditProjectForm } from '@/components/projects/WorkingEditProjectForm';
import { calculateLiveProgress, getProgressDescription, type ProgressCalculation } from '@/lib/progressUtils';
import { useState } from 'react';
import {
  Calendar,
  DollarSign,
  MapPin,
  Users,
  Phone,
  Mail,
  Edit,
  MessageSquare
} from 'lucide-react';
import { ChatThread } from '@/components/ui/ChatThread';
import { WalkthroughCapture } from '@/components/walkthrough/WalkthroughCapture';
import { WalkthroughList } from '@/components/walkthrough/WalkthroughList';
import { ProjectFinancialsCard } from '@/components/projects/ProjectFinancialsCard';
import { ProjectStageTracker, deriveStageFromProject } from '@/components/projects/ProjectStageTracker';
import { SoftBudgetBadge } from '@/components/projects/SoftBudgetBadge';
import { ContractProfitCard } from '@/components/projects/ContractProfitCard';



export default function ProjectOverview() {
  const [, params] = useRoute('/projects/:id/overview');
  const projectId = params?.id;
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const { toast } = useToast();

  const { project: transformedProject, rawProject: project, isLoading, error } = useOptimizedProject(projectId);

  // Optimized progress calculation for better navigation performance
  const { data: liveProgress, isLoading: progressLoading } = useQuery({
    queryKey: ['project-live-progress', projectId],
    queryFn: () => calculateLiveProgress(projectId!),
    enabled: !!projectId && projectId !== 'undefined',
    staleTime: 2 * 60 * 1000, // 2 minutes cache for navigation performance
    refetchInterval: 2 * 60 * 1000, // Reduced frequency to 2 minutes
    refetchOnWindowFocus: false, // Disable to prevent navigation interference
  });

  // Trades on this project — derived from tasks scoped to the project.
  // Must run BEFORE any early returns so React's hook order stays stable
  // across renders.
  const { data: projectTrades = [] } = useQuery({
    queryKey: ['project-trades', projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async () => {
      const snap = await getDocs(fsQuery(collection(db, 'tasks'), where('projectId', '==', projectId!)));
      const map = new Map<string, number>();
      snap.docs.forEach(d => {
        const t = (d.data() as any).trade as string | undefined;
        if (!t) return;
        map.set(t, (map.get(t) || 0) + 1);
      });
      return Array.from(map.entries())
        .map(([trade, taskCount]) => ({ trade, taskCount }))
        .sort((a, b) => b.taskCount - a.taskCount);
    },
  });

  // Fallback client lookup. Legacy projects (created from Sales lead conversion)
  // sometimes only store the linked contact/client ID without copying the
  // email + phone onto the project doc. Resolve them on demand.
  const { data: linkedClient } = useQuery({
    queryKey: ['project-linked-client', projectId, (project as any)?.clientIds?.[0]],
    enabled: !!projectId && !!project,
    staleTime: 60_000,
    queryFn: async () => {
      const raw = project as any;
      // Try contact ID first (clientIds[0] from NewProjectForm), then salesClientId.
      const contactId = Array.isArray(raw?.clientIds) && raw.clientIds[0]
        ? String(raw.clientIds[0])
        : '';
      if (contactId) {
        try {
          const snap = await getDocs(fsQuery(collection(db, 'contacts'), where('__name__', '==', contactId)));
          if (!snap.empty) {
            const d = snap.docs[0].data() as any;
            return { email: d.email || '', phone: d.phone || '' };
          }
        } catch {}
      }
      // Fall back to clients collection via salesClientId.
      const salesClientId = raw?.salesClientId ? String(raw.salesClientId) : '';
      if (salesClientId) {
        try {
          const snap = await getDocs(fsQuery(collection(db, 'clients'), where('__name__', '==', salesClientId)));
          if (!snap.empty) {
            const d = snap.docs[0].data() as any;
            return { email: d.email || '', phone: d.phone || '' };
          }
        } catch {}
      }
      return null;
    },
  });

  if (isLoading) {
    return (
      <ProjectLayout projectId={projectId!} projectName="Loading...">
        <div className="p-6">
          <ProjectDetailSkeleton />
        </div>
      </ProjectLayout>
    );
  }

  if (error || !project || !transformedProject) {
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

  const advanceToPhase = async (phase: string) => {
    if (!projectId) return;
    setAdvancing(true);
    try {
      await updateDoc(doc(db, 'projects', projectId), {
        status: phase,
        updatedAt: serverTimestamp(),
      });
      toast({ title: `Moved to ${getStatusLabel(phase)}` });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setAdvancing(false);
    }
  };

  const next = nextPhase(transformedProject.status);

  const slip = computeScheduleSlip(
    transformedProject.targetCompletion,
    transformedProject.status,
    liveProgress?.completionPercentage ?? 0,
  );
  const slipToneClass = slip
    ? slip.tone === 'red'
      ? 'bg-red-100 text-red-700 border-red-200'
      : slip.tone === 'amber'
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : slip.tone === 'green'
      ? 'bg-green-100 text-green-700 border-green-200'
      : 'bg-gray-100 text-gray-700 border-gray-200'
    : '';

  return (
    <ProjectLayout projectId={projectId!} projectName={transformedProject.name}>
        <div className="p-6 space-y-6">
        {/* Lifecycle "what's next?" callout (full version with action link).
            ProjectLayout already shows a compact step bar above every
            project page — this adds the per-stage next-action prompt. */}
        <ProjectStageTracker
          projectId={projectId!}
          stage={deriveStageFromProject(project)}
        />
        {/* Project Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{transformedProject.name}</h1>
            <p className="text-gray-600 mt-1">Project ID: {transformedProject.projectId}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={`${getStatusBadgeClass(transformedProject.status)} font-medium px-3 py-1`}>
              {getStatusLabel(transformedProject.status)}
            </Badge>
            <SoftBudgetBadge projectId={projectId!} lastDesignChangeAt={(project as any)?.lastDesignChangeAt} />
            {slip && (
              <Badge className={`${slipToneClass} font-medium px-3 py-1 gap-1`}>
                <Calendar className="w-3 h-3" />
                {slip.label}
              </Badge>
            )}
            {next && (
              <Button
                size="sm"
                disabled={advancing}
                onClick={() => advanceToPhase(next)}
                className="gap-1 text-white"
                style={{ backgroundColor: '#C9A96E' }}
              >
                Move to {getStatusLabel(next)}
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditDialogOpen(true)}
              className="gap-2"
            >
              <Edit className="w-4 h-4" />
              Edit Project
            </Button>
          </div>
        </div>

        {/* Lifecycle pill bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 flex-wrap">
              {LIFECYCLE_PHASES.map((phase, i) => {
                const currentIdx = LIFECYCLE_PHASES.indexOf(transformedProject.status as any);
                const isActive = phase === transformedProject.status;
                const isPast = currentIdx > i;
                return (
                  <div key={phase} className="flex items-center gap-2">
                    <button
                      onClick={() => advanceToPhase(phase)}
                      disabled={advancing || isActive}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors border ${
                        isActive
                          ? getStatusBadgeClass(phase)
                          : isPast
                          ? 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                      } ${isActive ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      {isPast && <CheckCircle2 className="inline w-3 h-3 mr-1" />}
                      {getStatusLabel(phase)}
                    </button>
                    {i < LIFECYCLE_PHASES.length - 1 && (
                      <ChevronRight className="w-3 h-3 text-gray-300" />
                    )}
                  </div>
                );
              })}
              {(transformedProject.status === 'on_hold' || transformedProject.status === 'cancelled' || transformedProject.status === 'archived') && (
                <Badge className={`${getStatusBadgeClass(transformedProject.status)} ml-2`}>
                  {getStatusLabel(transformedProject.status)}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Profit vs. contracts — revenue from client contracts, costs from
            sub + designer contracts, cash on hand from paid milestones. */}
        <ContractProfitCard projectId={projectId!} />

        {/* Estimate-side financials — pre-contract estimating + COs. */}
        <ProjectFinancialsCard
          projectId={projectId!}
          projectName={transformedProject.name}
          spent={transformedProject.spent || 0}
        />

        {/* Trades on this project — derived from task data. */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4 text-purple-500" />
              Trades on this Project
              {projectTrades.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {projectTrades.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {projectTrades.length === 0 ? (
              <p className="text-sm text-gray-400">
                No trades tagged on this project yet. Set the trade on individual tasks (Tasks tab) and they'll show up here.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {projectTrades.map(t => (
                  <span
                    key={t.trade}
                    className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-xs px-2.5 py-1"
                  >
                    {t.trade}
                    <span className="text-purple-400">·</span>
                    <span className="font-semibold">{t.taskCount}</span>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Communication & Progress Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Project Communication */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-theme-primary" />
                Project Communication
              </CardTitle>
              <CardDescription>
                Live updates and project discussions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="h-80 border rounded-lg bg-white">
                  <ChatThread 
                    threadId={`project-${parseInt(projectId || '0')}`}
                    threadTitle={`${transformedProject.name} - General`}
                    className="h-full"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Project Progress Card */}
          <Card className="bg-gray-50 lg:col-span-2">
            <CardHeader>
              <CardTitle>Project Progress</CardTitle>
              <CardDescription>
                {progressLoading ? 'Calculating live progress...' : 
                 liveProgress ? getProgressDescription(liveProgress) : 'Overall completion status and budget tracking'}
              </CardDescription>
            </CardHeader>
            <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Live Completion Progress */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Completion Progress</span>
                  <span className="text-sm text-gray-600">
                    {progressLoading ? '...' : `${liveProgress?.completionPercentage || 0}%`}
                  </span>
                </div>
                <Progress 
                  value={progressLoading ? 0 : (liveProgress?.completionPercentage || 0)} 
                  className="h-3 mb-2" 
                />
                <p className="text-xs text-gray-500">
                  {progressLoading ? 'Loading progress data...' : 
                   `${liveProgress?.completedTasks || 0} of ${liveProgress?.totalTasks || 0} tasks completed`}
                </p>
                {liveProgress && liveProgress.details.overdueTasks.length > 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    {liveProgress.details.overdueTasks.length} overdue tasks
                  </p>
                )}
              </div>

              {/* Live Budget Utilization */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Budget Utilization</span>
                  <span className="text-sm text-gray-600">
                    {progressLoading ? '...' : `${liveProgress?.budgetUtilization || 0}%`}
                  </span>
                </div>
                <Progress 
                  value={progressLoading ? 0 : (liveProgress?.budgetUtilization || 0)} 
                  className={`h-3 mb-2 ${
                    liveProgress && liveProgress.budgetUtilization > 100 ? '[&>div]:bg-red-500' :
                    liveProgress && liveProgress.budgetUtilization > 85 ? '[&>div]:bg-yellow-500' : ''
                  }`}
                />
                <p className="text-xs text-gray-500">
                  ${transformedProject.spent.toLocaleString()} spent of ${transformedProject.budget.toLocaleString()} budget
                </p>
                {liveProgress && liveProgress.budgetUtilization > 90 && (
                  <p className="text-xs text-yellow-600 mt-1">
                    Approaching budget limit
                  </p>
                )}
              </div>
            </div>

            {/* Progress Breakdown */}
            {liveProgress && !progressLoading && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-600">Estimate Progress:</span>
                    <span className="ml-2">{liveProgress.estimateProgress}%</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Timeline Progress:</span>
                    <span className="ml-2">{liveProgress.timelineProgress}%</span>
                  </div>
                </div>
                {liveProgress.details.upcomingMilestones.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs font-medium text-blue-600">
                      Upcoming: {liveProgress.details.upcomingMilestones.slice(0, 2).join(', ')}
                      {liveProgress.details.upcomingMilestones.length > 2 && ` +${liveProgress.details.upcomingMilestones.length - 2} more`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Project Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Project Details */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Address</label>
                <p className="text-sm">{transformedProject.address || <span className="text-gray-400 italic">Not set</span>}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Start Date</label>
                <p className="text-sm">{(() => {
                  const d = new Date(transformedProject.startDate);
                  return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : <span className="text-gray-400 italic">Not set</span>;
                })()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Target Completion</label>
                <p className="text-sm">{(() => {
                  const d = new Date(transformedProject.targetCompletion);
                  return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : <span className="text-gray-400 italic">Not set</span>;
                })()}</p>
              </div>
            </CardContent>
          </Card>

          {/* Client Information — prefer project doc, fall back to the linked
              contact/client when the project was created without these fields. */}
          {(() => {
            const email = transformedProject.clientEmail || linkedClient?.email || '';
            const phone = transformedProject.clientPhone || linkedClient?.phone || '';
            const pm = transformedProject.projectManager;
            const raw = project as any;
            const designerChoice = String(raw?.designerChoice || '');
            const designerName = String(raw?.designerName || '');
            const designerEmail = String(raw?.designerEmail || '');
            const designerCompany = String(raw?.designerCompany || '');
            const designerLabel = (() => {
              if (designerChoice === 'select') return designerName || 'Selected (no name on file)';
              if (designerChoice === 'none') return 'No designer needed';
              if (designerChoice === 'client_self') return 'Client doing design themselves';
              if (designerChoice === 'later') return 'To be decided';
              return designerName || '';
            })();
            return (
              <Card className="bg-gray-50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle>Client Information</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditDialogOpen(true)}
                    className="gap-1.5"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Name</label>
                    <p className="text-sm">{transformedProject.client || <span className="text-gray-400 italic">No client linked</span>}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Email</label>
                    <div className="flex items-center">
                      <Mail className="mr-2 h-4 w-4 text-gray-400" />
                      {email ? (
                        <a href={`mailto:${email}`} className="text-sm text-theme-primary hover:underline">
                          {email}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400 italic">No email on file</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Phone</label>
                    <div className="flex items-center">
                      <Phone className="mr-2 h-4 w-4 text-gray-400" />
                      {phone ? (
                        <a href={`tel:${phone}`} className="text-sm text-theme-primary hover:underline">
                          {phone}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400 italic">No phone on file</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Project Manager</label>
                    <p className="text-sm">{pm || <span className="text-gray-400 italic">Unassigned</span>}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Designer</label>
                    {designerLabel ? (
                      <div className="text-sm">
                        <p>{designerLabel}</p>
                        {designerChoice === 'select' && designerCompany && (
                          <p className="text-xs text-gray-500">{designerCompany}</p>
                        )}
                        {designerChoice === 'select' && designerEmail && (
                          <a
                            href={`mailto:${designerEmail}`}
                            className="text-xs text-theme-primary hover:underline"
                          >
                            {designerEmail}
                          </a>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Not set</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* Milestones */}
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Project Milestones</CardTitle>
            <CardDescription>Key project phases and completion status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {transformedProject.milestones?.map((milestone) => (
                <div
                  key={milestone.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    milestone.completed ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded-full ${
                      milestone.completed ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                    <span className={`font-medium ${
                      milestone.completed ? 'text-green-900' : 'text-gray-700'
                    }`}>
                      {milestone.name}
                    </span>
                  </div>
                  <span className={`text-sm ${
                    milestone.completed ? 'text-green-700' : 'text-gray-500'
                  }`}>
                    {new Date(milestone.date).toLocaleDateString()}
                  </span>
                </div>
              )) || (
                <p className="text-gray-500 text-center py-4">No milestones defined for this project</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Site walkthroughs */}
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span>Site Walkthroughs</span>
              </CardTitle>
              <CardDescription>Photo + video issues captured on site, assigned to subs</CardDescription>
            </div>
            <WalkthroughCapture
              projectId={projectId!}
              projectName={transformedProject?.name}
              compact
              buttonLabel="Capture"
            />
          </CardHeader>
          <CardContent>
            <WalkthroughList projectId={projectId!} />
          </CardContent>
        </Card>

        {/* Edit Project Dialog */}
        {project && (
          <WorkingEditProjectForm
            project={project}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
          />
        )}
        </div>

        {/* Floating capture button (mobile-friendly, persists across scroll) */}
        <WalkthroughCapture
          projectId={projectId!}
          projectName={transformedProject?.name}
        />
    </ProjectLayout>
  );
}