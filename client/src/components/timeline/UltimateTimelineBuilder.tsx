import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Calendar,
  Brain,
  Users,
  Cloud,
  Network,
  Target,
  Zap,
  Settings,
  Info
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// Import all the enhanced components
import { EnhancedTimelineBuilder } from './EnhancedTimelineBuilder';
import { WeatherService } from './WeatherService';
import { DependencyManager } from './DependencyManager';
import { ResourceConflictDetector } from './ResourceConflictDetector';
import { SmartSchedulingAssistant } from './SmartSchedulingAssistant';

// Import transformation utilities
import { 
  transformDatabaseTaskToTimeline, 
  transformTimelineTaskToDatabase,
  invalidateTaskQueries,
  type TimelineTask,
  type DatabaseTask
} from '@/utils/taskTransformations';

interface UltimateTimelineBuilderProps {
  projectId: number;
  readonly?: boolean;
}

// Enhanced Task interface that combines all features
interface EnhancedTask extends TimelineTask {
  dependencies: string[];
  dependents: string[];
  assignedSubcontractor?: string;
  weatherDependent?: boolean;
  resourceConflicts?: string[];
  isCriticalPath?: boolean;
  bufferDays?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  materialDeliveryDate?: Date;
  permitRequired?: boolean;
  permitStatus?: 'not_required' | 'pending' | 'approved' | 'rejected';
}

export function UltimateTimelineBuilder({ projectId, readonly = false }: UltimateTimelineBuilderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('timeline');
  const [tasks, setTasks] = useState<EnhancedTask[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Fetch project data
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: [`/api/projects/${projectId}`],
    select: (data: any[]) => data.find((p: any) => p.id === projectId),
    enabled: !!projectId
  });

  // Fetch tasks for this project
  const { data: dbTasks = [], isLoading: tasksLoading, refetch: refetchTasks } = useQuery({
    queryKey: [`/api/projects/${projectId}/tasks`],
    enabled: !!projectId
  });

  // Fetch estimates for task display names
  const { data: estimates = [] } = useQuery<any[]>({
    queryKey: [`/api/estimates`],
  });

  // Transform database tasks to enhanced tasks
  const enhancedTasks = useMemo((): EnhancedTask[] => {
    if (!dbTasks || !Array.isArray(dbTasks) || dbTasks.length === 0) return [];
    
    return dbTasks.map((dbTask: DatabaseTask): EnhancedTask => {
      const baseTask = transformDatabaseTaskToTimeline(dbTask);
      
      // Add enhanced properties
      return {
        ...baseTask,
        dependencies: dbTask.dependencies ? JSON.parse(dbTask.dependencies) : [],
        dependents: dbTask.dependents ? JSON.parse(dbTask.dependents) : [],
        assignedSubcontractor: dbTask.assignedSubcontractor,
        weatherDependent: dbTask.weatherDependent || false,
        resourceConflicts: [],
        isCriticalPath: false,
        bufferDays: dbTask.bufferDays || 0,
        riskLevel: dbTask.riskLevel as 'low' | 'medium' | 'high' || 'low',
        materialDeliveryDate: dbTask.materialDeliveryDate ? new Date(dbTask.materialDeliveryDate) : undefined,
        permitRequired: dbTask.permitRequired || false,
        permitStatus: dbTask.permitStatus as any || 'not_required'
      };
    });
  }, [dbTasks]);

  // Update tasks when database changes
  React.useEffect(() => {
    if (enhancedTasks.length > 0) {
      setTasks(enhancedTasks);
    }
  }, [enhancedTasks]);

  // Available estimate items for display mapping (filtered by current project)
  const availableEstimates = useMemo(() => {
    const items: any[] = [];
    // Filter estimates to only include those for the current project
    const projectEstimates = estimates.filter((estimate: any) => 
      estimate.projectId === parseInt(projectId.toString()) || estimate.projectId === projectId
    );
    
    projectEstimates.forEach((estimate: any) => {
      if (estimate.categories && Array.isArray(estimate.categories)) {
        estimate.categories.forEach((category: any) => {
          if (category.items && Array.isArray(category.items)) {
            category.items.forEach((item: any) => {
              if (item.title && item.id) {
                items.push({
                  id: item.id,
                  name: item.title,
                  trade: category.name || 'General',
                  category: category.name
                });
              }
            });
          }
        });
      }
    });
    return items;
  }, [estimates, projectId]);

  // Create a lookup map for estimate items by ID
  const estimateItemsMap = useMemo(() => {
    const map = new Map<string, { name: string; trade: string }>();
    availableEstimates.forEach(item => {
      map.set(item.id, { name: item.name, trade: item.trade });
    });
    return map;
  }, [availableEstimates]);

  // Helper function to get display name for task dependencies
  const getTaskDisplayName = useCallback((task: EnhancedTask) => {
    if (task.estimateItemId) {
      const estimateItem = estimateItemsMap.get(task.estimateItemId);
      if (estimateItem) {
        return `${estimateItem.name} - ${estimateItem.trade}`;
      }
    }
    // Fallback to task title and trade if estimate item not found
    return `${task.title} - ${task.trade}`;
  }, [estimateItemsMap]);

  // Save tasks mutation
  const saveTasksMutation = useMutation({
    mutationFn: async (tasksToSave: EnhancedTask[]) => {
      const databaseTasks = tasksToSave.map(task => {
        const baseDbTask = transformTimelineTaskToDatabase(task);
        return {
          ...baseDbTask,
          dependencies: JSON.stringify(task.dependencies),
          dependents: JSON.stringify(task.dependents),
          assignedSubcontractor: task.assignedSubcontractor,
          weatherDependent: task.weatherDependent,
          bufferDays: task.bufferDays,
          riskLevel: task.riskLevel,
          materialDeliveryDate: task.materialDeliveryDate,
          permitRequired: task.permitRequired,
          permitStatus: task.permitStatus
        };
      });

      return apiRequest('PUT', `/api/projects/${projectId}/tasks/bulk`, {
        tasks: databaseTasks
      });
    },
    onSuccess: () => {
      setHasUnsavedChanges(false);
      invalidateTaskQueries(queryClient, projectId);
      refetchTasks();
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save timeline changes.",
        variant: "destructive",
      });
    }
  });

  // Fix missing trade information
  const fixTaskTrades = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/projects/${projectId}/fix-task-trades`);
    },
    onSuccess: (data: any) => {
      toast({ 
        title: 'Trade Information Updated', 
        description: `Updated ${data.updatedCount} tasks with missing trade information`
      });
      invalidateTaskQueries(queryClient, projectId);
      refetchTasks();
    },
    onError: () => {
      toast({ title: 'Failed to fix trade information', variant: 'destructive' });
    }
  });

  // Handle task changes
  const handleTasksChange = useCallback((updatedTasks: EnhancedTask[]) => {
    setTasks(updatedTasks);
    setHasUnsavedChanges(true);
  }, []);

  // Handle dependency changes
  const handleDependencyChange = useCallback((taskId: string, dependencies: string[]) => {
    setTasks(prevTasks => 
      prevTasks.map(task => 
        task.id === taskId ? { ...task, dependencies } : task
      )
    );
    setHasUnsavedChanges(true);
  }, []);

  // Handle task rescheduling from conflict resolution
  const handleTaskReschedule = useCallback((taskId: string, newStartDate: Date) => {
    setTasks(prevTasks => 
      prevTasks.map(task => {
        if (task.id === taskId) {
          const newEndDate = new Date(newStartDate);
          newEndDate.setDate(newStartDate.getDate() + task.duration);
          return {
            ...task,
            startDate: newStartDate,
            endDate: newEndDate
          };
        }
        return task;
      })
    );
    setHasUnsavedChanges(true);
  }, []);

  // Save current changes
  const handleSave = useCallback(() => {
    if (tasks.length > 0) {
      saveTasksMutation.mutate(tasks);
    }
  }, [tasks, saveTasksMutation]);

  // Generate project statistics
  const projectStats = useMemo(() => {
    if (tasks.length === 0) return null;

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const criticalTasks = tasks.filter(t => t.isCriticalPath).length;
    const weatherDependentTasks = tasks.filter(t => t.weatherDependent).length;
    const tasksWithConflicts = tasks.filter(t => t.resourceConflicts && t.resourceConflicts.length > 0).length;
    
    const startDate = new Date(Math.min(...tasks.map(t => t.startDate.getTime())));
    const endDate = new Date(Math.max(...tasks.map(t => t.endDate.getTime())));
    const totalDuration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const estimatedCost = tasks.reduce((sum, t) => sum + (t.estimatedCost || 0), 0);

    return {
      totalTasks,
      completedTasks,
      criticalTasks,
      weatherDependentTasks,
      tasksWithConflicts,
      totalDuration,
      estimatedCost,
      progressPercentage: Math.round((completedTasks / totalTasks) * 100)
    };
  }, [tasks]);

  if (projectLoading || tasksLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <div className="text-gray-500">Loading timeline builder...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with project info and stats */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-6 h-6" />
                Ultimate Timeline Builder
                {project && <span className="text-lg">- {project.name}</span>}
              </CardTitle>
              {projectStats && (
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                  <span>{projectStats.totalTasks} tasks</span>
                  <span>{projectStats.totalDuration} days</span>
                  <span>{projectStats.progressPercentage}% complete</span>
                  <span>${(projectStats.estimatedCost / 1000).toFixed(0)}K budget</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {hasUnsavedChanges && (
                <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                  Unsaved Changes
                </Badge>
              )}
              
              {projectStats && (
                <div className="flex gap-1">
                  {projectStats.criticalTasks > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {projectStats.criticalTasks} Critical
                    </Badge>
                  )}
                  {projectStats.tasksWithConflicts > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {projectStats.tasksWithConflicts} Conflicts
                    </Badge>
                  )}
                  {projectStats.weatherDependentTasks > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {projectStats.weatherDependentTasks} Weather-Dependent
                    </Badge>
                  )}
                </div>
              )}
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => fixTaskTrades.mutate()}
                disabled={fixTaskTrades.isPending || readonly}
                className="flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                {fixTaskTrades.isPending ? 'Fixing...' : 'Fix Trade Info'}
              </Button>

              <Button
                onClick={handleSave}
                disabled={!hasUnsavedChanges || saveTasksMutation.isPending || readonly}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saveTasksMutation.isPending ? 'Saving...' : 'Save Timeline'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main tabbed interface */}
      <Card className="min-h-[600px]">
        <CardHeader className="pb-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="timeline" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Timeline
              </TabsTrigger>
              <TabsTrigger value="dependencies" className="flex items-center gap-2">
                <Network className="w-4 h-4" />
                Dependencies
              </TabsTrigger>
              <TabsTrigger value="resources" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Resources
              </TabsTrigger>
              <TabsTrigger value="weather" className="flex items-center gap-2">
                <Cloud className="w-4 h-4" />
                Weather
              </TabsTrigger>
              <TabsTrigger value="ai-assistant" className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                AI Assistant
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                Analytics
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* Main Timeline View */}
            <TabsContent value="timeline" className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Interactive timeline with drag-and-drop scheduling, critical path analysis, and real-time conflict detection.
                  Use the controls above to toggle different view modes and features.
                </AlertDescription>
              </Alert>
              
              <EnhancedTimelineBuilder
                projectId={projectId}
                readonly={readonly}
              />
            </TabsContent>

            {/* Dependency Management */}
            <TabsContent value="dependencies" className="space-y-4">
              <Alert>
                <Network className="h-4 w-4" />
                <AlertDescription>
                  Manage task dependencies with intelligent construction logic suggestions and circular dependency detection.
                </AlertDescription>
              </Alert>
              
              <DependencyManager
                tasks={tasks}
                onTasksChange={handleTasksChange}
                onDependencyChange={handleDependencyChange}
                readonly={readonly}
                getTaskDisplayName={getTaskDisplayName}
              />
            </TabsContent>

            {/* Resource Conflict Detection */}
            <TabsContent value="resources" className="space-y-4">
              <Alert>
                <Users className="h-4 w-4" />
                <AlertDescription>
                  Automatically detect and resolve resource conflicts, subcontractor double-booking, and crew overallocation.
                </AlertDescription>
              </Alert>
              
              <ResourceConflictDetector
                tasks={tasks}
                onConflictResolution={(conflicts, resolutions) => {
                  // Development logging removed
                }}
                onTaskReschedule={handleTaskReschedule}
                readonly={readonly}
              />
            </TabsContent>

            {/* Weather Integration */}
            <TabsContent value="weather" className="space-y-4">
              <Alert>
                <Cloud className="h-4 w-4" />
                <AlertDescription>
                  Weather-aware scheduling with impact analysis for weather-dependent construction tasks.
                </AlertDescription>
              </Alert>
              
              {tasks.length > 0 && (
                <WeatherService
                  projectId={projectId}
                  startDate={new Date(Math.min(...tasks.map(t => t.startDate.getTime())))}
                  endDate={new Date(Math.max(...tasks.map(t => t.endDate.getTime())))}
                  onWeatherImpact={(impacts) => {
                    // Development logging removed
                  }}
                />
              )}
            </TabsContent>

            {/* AI-Powered Assistant */}
            <TabsContent value="ai-assistant" className="space-y-4">
              <Alert>
                <Brain className="h-4 w-4" />
                <AlertDescription>
                  Smart scheduling recommendations with optimization suggestions, risk analysis, and automated improvements.
                </AlertDescription>
              </Alert>
              
              <SmartSchedulingAssistant
                tasks={tasks}
                onTasksChange={handleTasksChange}
                onOptimizationApplied={(optimizations) => {
                  toast({
                    title: "Optimizations Applied",
                    description: `${optimizations.length} scheduling optimizations have been applied.`,
                  });
                }}
                projectBudget={project?.budget}
                targetCompletionDate={project?.targetCompletion ? new Date(project.targetCompletion) : undefined}
                readonly={readonly}
              />
            </TabsContent>

            {/* Analytics Dashboard */}
            <TabsContent value="analytics" className="space-y-4">
              <Alert>
                <Target className="h-4 w-4" />
                <AlertDescription>
                  Comprehensive project analytics with performance metrics, trend analysis, and forecasting.
                </AlertDescription>
              </Alert>
              
              {projectStats && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="p-4">
                    <div className="text-2xl font-bold text-blue-600">{projectStats.totalTasks}</div>
                    <div className="text-sm text-gray-500">Total Tasks</div>
                  </Card>
                  
                  <Card className="p-4">
                    <div className="text-2xl font-bold text-green-600">{projectStats.progressPercentage}%</div>
                    <div className="text-sm text-gray-500">Progress</div>
                  </Card>
                  
                  <Card className="p-4">
                    <div className="text-2xl font-bold text-orange-600">{projectStats.criticalTasks}</div>
                    <div className="text-sm text-gray-500">Critical Tasks</div>
                  </Card>
                  
                  <Card className="p-4">
                    <div className="text-2xl font-bold text-purple-600">{projectStats.totalDuration}</div>
                    <div className="text-sm text-gray-500">Days Duration</div>
                  </Card>
                </div>
              )}
              
              <Card className="p-6">
                <h3 className="text-lg font-medium mb-4">Advanced Analytics Coming Soon</h3>
                <div className="text-gray-500 space-y-2">
                  <p>• Schedule variance analysis</p>
                  <p>• Resource utilization trends</p>
                  <p>• Cost performance indexing</p>
                  <p>• Risk probability matrices</p>
                  <p>• Weather impact forecasting</p>
                  <p>• Productivity benchmarking</p>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default UltimateTimelineBuilder;