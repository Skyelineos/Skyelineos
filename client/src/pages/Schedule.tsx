import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';

import { useIsMobile } from '@/hooks/use-mobile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GlobalScheduleCalendar } from '@/components/schedule/GlobalScheduleCalendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, User, Building2, Wrench, Users, TrendingUp, Clock, AlertTriangle, BarChart3 } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';



export default function Schedule() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('schedule');
  const isMobile = useIsMobile();

  // Fetch active projects with optimized caching for better navigation performance
  const { data: activeProjects = [], error: projectsError } = useQuery({
    queryKey: ['/api/projects'],
    select: (data: any[]) => data.filter(project => project.status === 'active'),
    retry: 2,
    staleTime: 2 * 60 * 1000, // 2 minutes - longer cache for navigation performance
    refetchInterval: 60 * 1000, // Auto-refresh every minute (reduced frequency)
    refetchOnWindowFocus: false, // Disable to prevent navigation interference
  });

  // Fetch all tasks for statistics with optimized caching
  const { data: allTasks = [], error: tasksError } = useQuery<any[]>({
    queryKey: ['/api/tasks/all-active'],
    retry: 2,
    staleTime: 2 * 60 * 1000, // 2 minutes for better navigation performance
    refetchInterval: 60 * 1000, // Auto-refresh every minute (reduced frequency)
    refetchOnWindowFocus: false, // Disable to prevent navigation interference
  });

  // Calculate schedule statistics
  const scheduleStats = {
    totalTasks: allTasks.length,
    completedTasks: allTasks.filter(task => task.status === 'Complete').length,
    inProgressTasks: allTasks.filter(task => task.status === 'In Progress').length,
    overdueTasks: allTasks.filter(task => {
      const endDate = new Date(task.endDate);
      const today = new Date();
      return endDate < today && task.status !== 'Complete';
    }).length,
    uniqueTrades: Array.from(new Set(allTasks.map((task: any) => task.trade).filter(Boolean))).length,
    activeProjects: activeProjects.length,
  };

  const completionRate = scheduleStats.totalTasks > 0 
    ? Math.round((scheduleStats.completedTasks / scheduleStats.totalTasks) * 100)
    : 0;

  // Show error state if queries fail
  if (projectsError || tasksError) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Error Loading Schedule Data
            </h2>
            <p className="text-gray-600 mb-4">
              There was a problem loading the schedule information. Please try refreshing the page.
            </p>
            <Button onClick={() => window.location.reload()} variant="outline">
              <Clock className="h-4 w-4 mr-2" />
              Refresh Page
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const scheduleContent = (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Global Schedule</h1>
            <p className="mt-2 text-gray-600">
              Unified calendar view across all active construction projects
            </p>
          </div>
          
          {/* Quick Stats */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-theme-primary">{scheduleStats.totalTasks}</div>
              <div className="text-sm text-gray-500">Total Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{completionRate}%</div>
              <div className="text-sm text-gray-500">Complete</div>
            </div>
            {scheduleStats.overdueTasks > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{scheduleStats.overdueTasks}</div>
                <div className="text-sm text-gray-500">Overdue</div>
              </div>
            )}
          </div>
        </div>

        {/* Schedule Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gray-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Projects</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {scheduleStats.activeProjects}
                  </p>
                </div>
                <Building2 className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Trades</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {scheduleStats.uniqueTrades}
                  </p>
                </div>
                <Wrench className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">In Progress</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {scheduleStats.inProgressTasks}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    {scheduleStats.overdueTasks > 0 ? 'Overdue' : 'Completion Rate'}
                  </p>
                  <p className={`text-2xl font-bold ${scheduleStats.overdueTasks > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {scheduleStats.overdueTasks > 0 ? scheduleStats.overdueTasks : `${completionRate}%`}
                  </p>
                </div>
                {scheduleStats.overdueTasks > 0 ? (
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                ) : (
                  <TrendingUp className="h-8 w-8 text-green-500" />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Schedule Views */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:w-fit">
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Project Schedules
            </TabsTrigger>
            {user && (user.role === 'Subcontractor' || user.role === 'subcontractor') && (
              <TabsTrigger value="myTasks" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                My Tasks
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="schedule" className="mt-6">
            <GlobalScheduleCalendar />
          </TabsContent>

          {user && (user.role === 'Subcontractor' || user.role === 'subcontractor') && (
            <TabsContent value="myTasks" className="mt-6">
              <GlobalScheduleCalendar />
            </TabsContent>
          )}
        </Tabs>
    </div>
  );

  return (
    <ErrorBoundary>
      <AppLayout>
        <div className="mb-6">
          <h1 className="text-3xl font-bold font-heading text-brand-black">Global Schedule</h1>
          <p className="text-brand-dark-gray-blue">Unified calendar view across all active construction projects</p>
        </div>
        {scheduleContent}
      </AppLayout>
    </ErrorBoundary>
  );
}