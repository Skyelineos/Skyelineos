import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Brain, 
  Target, 
  TrendingUp, 
  Calendar, 
  DollarSign,
  Clock,
  Users,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Zap,
  BarChart3,
  Settings,
  RefreshCw
} from 'lucide-react';
import { format, addDays, differenceInDays } from 'date-fns';

interface Task {
  id: string;
  title: string;
  trade: string;
  duration: number;
  startDate: Date;
  endDate: Date;
  dependencies: string[];
  assignedSubcontractor?: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedCost?: number;
  actualCost?: number;
  weatherDependent?: boolean;
  isCriticalPath?: boolean;
  bufferDays?: number;
  resourceConflicts?: string[];
}

interface OptimizationSuggestion {
  id: string;
  type: 'schedule' | 'resource' | 'cost' | 'risk';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: {
    timeReduction?: number;
    costSavings?: number;
    riskReduction?: number;
    efficiencyGain?: number;
  };
  implementation: {
    difficulty: 'easy' | 'medium' | 'hard';
    timeRequired: string;
    resources: string[];
  };
  action: () => void;
}

interface ProjectMetrics {
  totalDuration: number;
  criticalPathLength: number;
  scheduleEfficiency: number;
  resourceUtilization: number;
  riskScore: number;
  bufferUtilization: number;
  estimatedCost: number;
  costVariance: number;
}

interface SmartSchedulingAssistantProps {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  onOptimizationApplied?: (optimizations: OptimizationSuggestion[]) => void;
  projectBudget?: number;
  targetCompletionDate?: Date;
  readonly?: boolean;
}

export function SmartSchedulingAssistant({
  tasks,
  onTasksChange,
  onOptimizationApplied,
  projectBudget,
  targetCompletionDate,
  readonly = false
}: SmartSchedulingAssistantProps) {
  const [showOptimizationDialog, setShowOptimizationDialog] = useState(false);
  const [selectedOptimizations, setSelectedOptimizations] = useState<Set<string>>(new Set());
  const [analysisMode, setAnalysisMode] = useState<'schedule' | 'cost' | 'risk' | 'overall'>('overall');

  // Calculate project metrics
  const projectMetrics = useMemo((): ProjectMetrics => {
    if (tasks.length === 0) {
      return {
        totalDuration: 0,
        criticalPathLength: 0,
        scheduleEfficiency: 100,
        resourceUtilization: 0,
        riskScore: 0,
        bufferUtilization: 0,
        estimatedCost: 0,
        costVariance: 0
      };
    }

    const startDate = new Date(Math.min(...tasks.map(t => t.startDate.getTime())));
    const endDate = new Date(Math.max(...tasks.map(t => t.endDate.getTime())));
    const totalDuration = differenceInDays(endDate, startDate);
    
    const criticalTasks = tasks.filter(t => t.isCriticalPath);
    const criticalPathLength = criticalTasks.length > 0 ? 
      criticalTasks.reduce((sum, t) => sum + t.duration, 0) : 0;
    
    const scheduleEfficiency = totalDuration > 0 ? 
      Math.min(100, (criticalPathLength / totalDuration) * 100) : 100;
    
    const resourceConflicts = tasks.filter(t => t.resourceConflicts?.length > 0).length;
    const resourceUtilization = Math.max(0, 100 - (resourceConflicts / tasks.length) * 100);
    
    const highRiskTasks = tasks.filter(t => 
      t.weatherDependent || t.priority === 'critical' || t.resourceConflicts?.length > 0
    ).length;
    const riskScore = (highRiskTasks / tasks.length) * 100;
    
    const tasksWithBuffer = tasks.filter(t => (t.bufferDays || 0) > 0).length;
    const bufferUtilization = (tasksWithBuffer / tasks.length) * 100;
    
    const estimatedCost = tasks.reduce((sum, t) => sum + (t.estimatedCost || 0), 0);
    const actualCost = tasks.reduce((sum, t) => sum + (t.actualCost || 0), 0);
    const costVariance = estimatedCost > 0 ? 
      ((actualCost - estimatedCost) / estimatedCost) * 100 : 0;

    return {
      totalDuration,
      criticalPathLength,
      scheduleEfficiency,
      resourceUtilization,
      riskScore,
      bufferUtilization,
      estimatedCost,
      costVariance
    };
  }, [tasks]);

  // Generate optimization suggestions
  const optimizationSuggestions = useMemo((): OptimizationSuggestion[] => {
    const suggestions: OptimizationSuggestion[] = [];

    // Schedule optimization suggestions
    if (projectMetrics.scheduleEfficiency < 80) {
      suggestions.push({
        id: 'parallel-tasks',
        type: 'schedule',
        priority: 'high',
        title: 'Parallelize Independent Tasks',
        description: 'Several tasks can run in parallel to reduce overall project duration.',
        impact: {
          timeReduction: Math.floor(projectMetrics.totalDuration * 0.15),
          efficiencyGain: 15
        },
        implementation: {
          difficulty: 'medium',
          timeRequired: '2-3 hours',
          resources: ['Project Manager', 'Schedule Coordinator']
        },
        action: () => parallelizeTasks()
      });
    }

    // Critical path optimization
    const criticalTasks = tasks.filter(t => t.isCriticalPath);
    if (criticalTasks.length > 0 && criticalTasks.some(t => (t.bufferDays || 0) === 0)) {
      suggestions.push({
        id: 'critical-path-buffer',
        type: 'risk',
        priority: 'critical',
        title: 'Add Buffer to Critical Path',
        description: 'Critical path tasks lack buffer time, creating high risk of delays.',
        impact: {
          riskReduction: 30,
          timeReduction: -2 // May add time but reduces risk
        },
        implementation: {
          difficulty: 'easy',
          timeRequired: '30 minutes',
          resources: ['Project Manager']
        },
        action: () => addCriticalPathBuffer()
      });
    }

    // Resource conflict resolution
    const conflictTasks = tasks.filter(t => t.resourceConflicts?.length > 0);
    if (conflictTasks.length > 0) {
      suggestions.push({
        id: 'resolve-conflicts',
        type: 'resource',
        priority: 'high',
        title: 'Resolve Resource Conflicts',
        description: `${conflictTasks.length} tasks have resource conflicts that could cause delays.`,
        impact: {
          timeReduction: conflictTasks.length * 2,
          costSavings: conflictTasks.length * 500
        },
        implementation: {
          difficulty: 'medium',
          timeRequired: '1-2 hours',
          resources: ['Project Manager', 'Resource Coordinator']
        },
        action: () => resolveResourceConflicts()
      });
    }

    // Cost optimization
    if (projectBudget && projectMetrics.estimatedCost > projectBudget * 0.95) {
      suggestions.push({
        id: 'cost-optimization',
        type: 'cost',
        priority: 'high',
        title: 'Optimize Project Costs',
        description: 'Project is approaching budget limits. Consider cost-saving measures.',
        impact: {
          costSavings: projectMetrics.estimatedCost * 0.1
        },
        implementation: {
          difficulty: 'hard',
          timeRequired: '4-6 hours',
          resources: ['Project Manager', 'Cost Analyst', 'Procurement']
        },
        action: () => optimizeCosts()
      });
    }

    // Weather-dependent task optimization
    const weatherTasks = tasks.filter(t => t.weatherDependent);
    if (weatherTasks.length > 0) {
      suggestions.push({
        id: 'weather-optimization',
        type: 'risk',
        priority: 'medium',
        title: 'Optimize Weather-Dependent Tasks',
        description: 'Schedule weather-sensitive work during favorable conditions.',
        impact: {
          riskReduction: 20,
          timeReduction: Math.floor(weatherTasks.length * 0.5)
        },
        implementation: {
          difficulty: 'medium',
          timeRequired: '1-2 hours',
          resources: ['Project Manager', 'Weather Data']
        },
        action: () => optimizeWeatherTasks()
      });
    }

    // Target date optimization
    if (targetCompletionDate) {
      const projectEndDate = new Date(Math.max(...tasks.map(t => t.endDate.getTime())));
      const daysFromTarget = differenceInDays(projectEndDate, targetCompletionDate);
      
      if (daysFromTarget > 0) {
        suggestions.push({
          id: 'meet-target-date',
          type: 'schedule',
          priority: 'critical',
          title: 'Accelerate to Meet Target Date',
          description: `Project is ${daysFromTarget} days behind target completion date.`,
          impact: {
            timeReduction: daysFromTarget
          },
          implementation: {
            difficulty: 'hard',
            timeRequired: '4-8 hours',
            resources: ['Project Manager', 'All Teams']
          },
          action: () => accelerateSchedule()
        });
      }
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }, [tasks, projectMetrics, projectBudget, targetCompletionDate]);

  // Optimization action implementations (simplified for demo)
  const parallelizeTasks = useCallback(() => {
    // Implementation would analyze dependencies and parallelize independent tasks
    // Development logging removed
  }, []);

  const addCriticalPathBuffer = useCallback(() => {
    const updatedTasks = tasks.map(task => {
      if (task.isCriticalPath && (task.bufferDays || 0) === 0) {
        return {
          ...task,
          bufferDays: Math.max(1, Math.floor(task.duration * 0.1)),
          endDate: addDays(task.endDate, Math.max(1, Math.floor(task.duration * 0.1)))
        };
      }
      return task;
    });
    onTasksChange(updatedTasks);
  }, [tasks, onTasksChange]);

  const resolveResourceConflicts = useCallback(() => {
    // Implementation would resolve resource conflicts by rescheduling
    // Development logging removed
  }, []);

  const optimizeCosts = useCallback(() => {
    // Implementation would analyze and optimize costs
    // Development logging removed
  }, []);

  const optimizeWeatherTasks = useCallback(() => {
    // Implementation would reschedule weather-dependent tasks
    // Development logging removed
  }, []);

  const accelerateSchedule = useCallback(() => {
    // Implementation would compress schedule to meet target date
    // Development logging removed
  }, []);

  // Apply selected optimizations
  const applyOptimizations = useCallback(() => {
    const selectedSuggestions = optimizationSuggestions.filter(s => 
      selectedOptimizations.has(s.id)
    );
    
    selectedSuggestions.forEach(suggestion => {
      suggestion.action();
    });
    
    onOptimizationApplied?.(selectedSuggestions);
    setShowOptimizationDialog(false);
    setSelectedOptimizations(new Set());
  }, [optimizationSuggestions, selectedOptimizations, onOptimizationApplied]);

  const getMetricColor = (value: number, reverse = false) => {
    if (reverse) {
      return value < 30 ? 'text-green-600' : value < 60 ? 'text-yellow-600' : 'text-red-600';
    }
    return value > 80 ? 'text-green-600' : value > 60 ? 'text-yellow-600' : 'text-red-600';
  };

  const getMetricBgColor = (value: number, reverse = false) => {
    if (reverse) {
      return value < 30 ? 'bg-green-100' : value < 60 ? 'bg-yellow-100' : 'bg-red-100';
    }
    return value > 80 ? 'bg-green-100' : value > 60 ? 'bg-yellow-100' : 'bg-red-100';
  };

  return (
    <div className="space-y-6">
      {/* AI Assistant Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-blue-500" />
              Smart Scheduling Assistant
              {optimizationSuggestions.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {optimizationSuggestions.length} Suggestions
                </Badge>
              )}
            </CardTitle>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowOptimizationDialog(true)}
                disabled={readonly || optimizationSuggestions.length === 0}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700"
              >
                <Lightbulb className="w-4 h-4 mr-2" />
                View Suggestions
              </Button>
              
              <Button variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Re-analyze
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Project Health Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Project Health Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Schedule Efficiency */}
            <div className="text-center">
              <div className="mb-2">
                <Clock className="w-8 h-8 mx-auto text-blue-500" />
              </div>
              <div className={`text-2xl font-bold ${getMetricColor(projectMetrics.scheduleEfficiency)}`}>
                {Math.round(projectMetrics.scheduleEfficiency)}%
              </div>
              <div className="text-sm text-gray-500">Schedule Efficiency</div>
              <Progress 
                value={projectMetrics.scheduleEfficiency} 
                className="mt-2 h-2" 
              />
            </div>

            {/* Resource Utilization */}
            <div className="text-center">
              <div className="mb-2">
                <Users className="w-8 h-8 mx-auto text-green-500" />
              </div>
              <div className={`text-2xl font-bold ${getMetricColor(projectMetrics.resourceUtilization)}`}>
                {Math.round(projectMetrics.resourceUtilization)}%
              </div>
              <div className="text-sm text-gray-500">Resource Utilization</div>
              <Progress 
                value={projectMetrics.resourceUtilization} 
                className="mt-2 h-2" 
              />
            </div>

            {/* Risk Score */}
            <div className="text-center">
              <div className="mb-2">
                <AlertTriangle className="w-8 h-8 mx-auto text-orange-500" />
              </div>
              <div className={`text-2xl font-bold ${getMetricColor(projectMetrics.riskScore, true)}`}>
                {Math.round(projectMetrics.riskScore)}%
              </div>
              <div className="text-sm text-gray-500">Risk Score</div>
              <Progress 
                value={projectMetrics.riskScore} 
                className="mt-2 h-2" 
              />
            </div>

            {/* Budget Health */}
            <div className="text-center">
              <div className="mb-2">
                <DollarSign className="w-8 h-8 mx-auto text-purple-500" />
              </div>
              <div className="text-2xl font-bold text-purple-600">
                ${(projectMetrics.estimatedCost / 1000).toFixed(0)}K
              </div>
              <div className="text-sm text-gray-500">Estimated Cost</div>
              {projectBudget && (
                <Progress 
                  value={(projectMetrics.estimatedCost / projectBudget) * 100} 
                  className="mt-2 h-2" 
                />
              )}
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6 pt-6 border-t">
            <div className="text-center">
              <div className="text-lg font-medium">{projectMetrics.totalDuration}</div>
              <div className="text-sm text-gray-500">Total Duration (days)</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-medium">{projectMetrics.criticalPathLength}</div>
              <div className="text-sm text-gray-500">Critical Path (days)</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-medium">{Math.round(projectMetrics.bufferUtilization)}%</div>
              <div className="text-sm text-gray-500">Buffer Utilization</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Optimization Suggestions Preview */}
      {optimizationSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Top Optimization Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {optimizationSuggestions.slice(0, 3).map(suggestion => (
                <Alert key={suggestion.id} className={`${
                  suggestion.priority === 'critical' ? 'border-red-200 bg-red-50' :
                  suggestion.priority === 'high' ? 'border-orange-200 bg-orange-50' :
                  'border-blue-200 bg-blue-50'
                }`}>
                  <Lightbulb className="h-4 w-4" />
                  <AlertDescription>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{suggestion.title}</div>
                        <div className="text-sm mt-1">{suggestion.description}</div>
                        <div className="flex gap-4 mt-2 text-xs text-gray-600">
                          {suggestion.impact.timeReduction && (
                            <span>⏱️ -{suggestion.impact.timeReduction} days</span>
                          )}
                          {suggestion.impact.costSavings && (
                            <span>💰 ${suggestion.impact.costSavings.toLocaleString()} saved</span>
                          )}
                          {suggestion.impact.riskReduction && (
                            <span>⚠️ -{suggestion.impact.riskReduction}% risk</span>
                          )}
                        </div>
                      </div>
                      <Badge variant={
                        suggestion.priority === 'critical' ? 'destructive' :
                        suggestion.priority === 'high' ? 'secondary' : 'outline'
                      }>
                        {suggestion.priority}
                      </Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
              
              {optimizationSuggestions.length > 3 && (
                <div className="text-center pt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowOptimizationDialog(true)}
                  >
                    View All {optimizationSuggestions.length} Suggestions
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Optimization Dialog */}
      <Dialog open={showOptimizationDialog} onOpenChange={setShowOptimizationDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Smart Optimization Suggestions
            </DialogTitle>
          </DialogHeader>
          
          <Tabs value={analysisMode} onValueChange={(value: any) => setAnalysisMode(value)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overall">Overall</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="cost">Cost</TabsTrigger>
              <TabsTrigger value="risk">Risk</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overall" className="space-y-4 mt-4">
              {optimizationSuggestions.map(suggestion => (
                <Card key={suggestion.id} className="p-4 cursor-pointer hover:bg-gray-50"
                      onClick={() => {
                        const newSelected = new Set(selectedOptimizations);
                        if (newSelected.has(suggestion.id)) {
                          newSelected.delete(suggestion.id);
                        } else {
                          newSelected.add(suggestion.id);
                        }
                        setSelectedOptimizations(newSelected);
                      }}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={selectedOptimizations.has(suggestion.id)}
                        onChange={() => {}}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium">{suggestion.title}</h4>
                          <Badge variant={
                            suggestion.priority === 'critical' ? 'destructive' :
                            suggestion.priority === 'high' ? 'secondary' : 'outline'
                          }>
                            {suggestion.priority}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-3">{suggestion.description}</p>
                        
                        {/* Impact metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 text-sm">
                          {suggestion.impact.timeReduction && (
                            <div>
                              <div className="font-medium text-green-600">
                                -{suggestion.impact.timeReduction} days
                              </div>
                              <div className="text-gray-500">Time Saved</div>
                            </div>
                          )}
                          {suggestion.impact.costSavings && (
                            <div>
                              <div className="font-medium text-green-600">
                                ${suggestion.impact.costSavings.toLocaleString()}
                              </div>
                              <div className="text-gray-500">Cost Savings</div>
                            </div>
                          )}
                          {suggestion.impact.riskReduction && (
                            <div>
                              <div className="font-medium text-green-600">
                                -{suggestion.impact.riskReduction}%
                              </div>
                              <div className="text-gray-500">Risk Reduction</div>
                            </div>
                          )}
                          {suggestion.impact.efficiencyGain && (
                            <div>
                              <div className="font-medium text-green-600">
                                +{suggestion.impact.efficiencyGain}%
                              </div>
                              <div className="text-gray-500">Efficiency Gain</div>
                            </div>
                          )}
                        </div>
                        
                        {/* Implementation details */}
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Difficulty: {suggestion.implementation.difficulty}</span>
                          <span>Time: {suggestion.implementation.timeRequired}</span>
                          <span>Resources: {suggestion.implementation.resources.join(', ')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </TabsContent>
            
            {/* Other tab contents would filter suggestions by type */}
            <TabsContent value="schedule">
              {optimizationSuggestions
                .filter(s => s.type === 'schedule')
                .map(suggestion => (
                  <div key={suggestion.id} className="p-4 border rounded">
                    {suggestion.title}
                  </div>
                ))}
            </TabsContent>
            
            <TabsContent value="cost">
              {optimizationSuggestions
                .filter(s => s.type === 'cost')
                .map(suggestion => (
                  <div key={suggestion.id} className="p-4 border rounded">
                    {suggestion.title}
                  </div>
                ))}
            </TabsContent>
            
            <TabsContent value="risk">
              {optimizationSuggestions
                .filter(s => s.type === 'risk')
                .map(suggestion => (
                  <div key={suggestion.id} className="p-4 border rounded">
                    {suggestion.title}
                  </div>
                ))}
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {selectedOptimizations.size} optimizations selected
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowOptimizationDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={applyOptimizations}
                disabled={selectedOptimizations.size === 0 || readonly}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Zap className="w-4 h-4 mr-2" />
                Apply Selected ({selectedOptimizations.size})
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SmartSchedulingAssistant;