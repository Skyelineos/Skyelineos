import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';

import { useIsMobile } from '@/hooks/use-mobile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GlobalScheduleCalendar } from '@/components/schedule/GlobalScheduleCalendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, User, Building2, Wrench, Users, TrendingUp, Clock, AlertTriangle, BarChart3, ChevronRight } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { collection, getDocs, query as fsQuery, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';



export default function Schedule() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('schedule');
  const [tradesOpen, setTradesOpen] = useState(false);
  const isMobile = useIsMobile();

  // Fetch active projects directly from Firestore (org IAM blocks /api/projects)
  const { data: activeProjects = [], error: projectsError } = useQuery({
    queryKey: ['/api/projects'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'projects'));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    },
    select: (data: any[]) => data.filter(project => project.status === 'active'),
    retry: 2,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch all tasks for statistics directly from Firestore.
  const { data: allTasks = [], error: tasksError } = useQuery<any[]>({
    queryKey: ['/api/tasks/all-active'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'tasks'));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    },
    retry: 2,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: false,
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

  // Per-trade rollup: how many tasks per trade, and which projects they touch.
  const tradeBreakdown = useMemo(() => {
    const map = new Map<string, { taskCount: number; projects: Set<string> }>();
    allTasks.forEach((t: any) => {
      if (!t.trade) return;
      const entry = map.get(t.trade) || { taskCount: 0, projects: new Set<string>() };
      entry.taskCount += 1;
      if (t.projectName) entry.projects.add(t.projectName);
      map.set(t.trade, entry);
    });
    return Array.from(map.entries())
      .map(([trade, v]) => ({ trade, taskCount: v.taskCount, projects: Array.from(v.projects) }))
      .sort((a, b) => b.taskCount - a.taskCount);
  }, [allTasks]);

  // Show error state if queries fail
  if (projectsError || tasksError) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Error loading schedule data
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

        {/* Schedule Overview Cards — each tile drills into its detail view */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => setLocation('/projects')}
            className="text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#C9A96E] rounded-lg"
          >
            <Card className="bg-gray-50 hover:bg-white transition-colors">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 flex items-center gap-1">
                      Active Projects <ChevronRight className="h-3 w-3 opacity-50" />
                    </p>
                    <p className="text-2xl font-bold text-gray-900">{scheduleStats.activeProjects}</p>
                  </div>
                  <Building2 className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
          </button>

          <button
            type="button"
            onClick={() => setTradesOpen(true)}
            className="text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#C9A96E] rounded-lg"
          >
            <Card className="bg-gray-50 hover:bg-white transition-colors">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 flex items-center gap-1">
                      Active Trades <ChevronRight className="h-3 w-3 opacity-50" />
                    </p>
                    <p className="text-2xl font-bold text-gray-900">{scheduleStats.uniqueTrades}</p>
                  </div>
                  <Wrench className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </button>

          <button
            type="button"
            onClick={() => setLocation('/tasks')}
            className="text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#C9A96E] rounded-lg"
          >
            <Card className="bg-gray-50 hover:bg-white transition-colors">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 flex items-center gap-1">
                      In Progress <ChevronRight className="h-3 w-3 opacity-50" />
                    </p>
                    <p className="text-2xl font-bold text-gray-900">{scheduleStats.inProgressTasks}</p>
                  </div>
                  <Clock className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </button>

          <button
            type="button"
            onClick={() => setLocation('/reports')}
            className="text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#C9A96E] rounded-lg"
          >
            <Card className="bg-gray-50 hover:bg-white transition-colors">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 flex items-center gap-1">
                      {scheduleStats.overdueTasks > 0 ? 'Overdue' : 'Completion Rate'}
                      <ChevronRight className="h-3 w-3 opacity-50" />
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
          </button>
        </div>

        {/* Trades drill-down dialog */}
        <Dialog open={tradesOpen} onOpenChange={setTradesOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-purple-500" />
                Active Trades — {tradeBreakdown.length}
              </DialogTitle>
              <DialogDescription>
                Trades currently in use across all open tasks.
              </DialogDescription>
            </DialogHeader>
            {tradeBreakdown.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                No trades tagged on any current tasks. Set a trade on a task to see it here.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {tradeBreakdown.map(t => (
                  <div key={t.trade} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">{t.trade}</p>
                      {t.projects.length > 0 && (
                        <p className="text-xs text-gray-500 truncate">
                          {t.projects.join(' · ')}
                        </p>
                      )}
                    </div>
                    <Badge className="bg-purple-100 text-purple-700 border-purple-200 flex-shrink-0">
                      {t.taskCount} task{t.taskCount === 1 ? '' : 's'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

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