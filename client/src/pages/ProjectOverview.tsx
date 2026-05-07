import { useQuery } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getStatusLabel, getStatusColor } from '@/lib/projectUtils';
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



export default function ProjectOverview() {
  const [, params] = useRoute('/projects/:id/overview');
  const projectId = params?.id;
  const [editDialogOpen, setEditDialogOpen] = useState(false);

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

  return (
    <ProjectLayout projectId={projectId!} projectName={transformedProject.name}>
        <div className="p-6 space-y-6">
        {/* Project Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{transformedProject.name}</h1>
            <p className="text-gray-600 mt-1">Project ID: PRJ-{String(transformedProject.id).padStart(4, '0')}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge 
              variant="secondary" 
              className={`${getStatusColor(transformedProject.status)} text-white font-medium px-3 py-1`}
            >
              {getStatusLabel(transformedProject.status)}
            </Badge>
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
                <p className="text-sm">{transformedProject.address}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Start Date</label>
                <p className="text-sm">{new Date(transformedProject.startDate).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Target Completion</label>
                <p className="text-sm">{new Date(transformedProject.targetCompletion).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>

          {/* Client Information */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Name</label>
                <p className="text-sm">{transformedProject.client}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Email</label>
                <div className="flex items-center">
                  <Mail className="mr-2 h-4 w-4 text-gray-400" />
                  <a href={`mailto:${transformedProject.clientEmail}`} className="text-sm text-theme-primary hover:underline">
                    {transformedProject.clientEmail}
                  </a>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Phone</label>
                <div className="flex items-center">
                  <Phone className="mr-2 h-4 w-4 text-gray-400" />
                  <a href={`tel:${transformedProject.clientPhone}`} className="text-sm text-theme-primary hover:underline">
                    {transformedProject.clientPhone}
                  </a>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Project Manager</label>
                <p className="text-sm">{transformedProject.projectManager}</p>
              </div>
            </CardContent>
          </Card>
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