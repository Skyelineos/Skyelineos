import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Link, 
  Unlink, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  CheckCircle,
  ArrowRight,
  Network,
  Target,
  Clock
} from 'lucide-react';
import { format, differenceInDays, addDays } from 'date-fns';

interface Task {
  id: string;
  title: string;
  trade: string;
  duration: number;
  startDate: Date;
  endDate: Date;
  dependencies: string[];
  dependents: string[];
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  isCriticalPath?: boolean;
}

interface DependencyRule {
  id: string;
  name: string;
  fromTrade: string;
  toTrade: string;
  description: string;
  minBuffer: number; // minimum days between tasks
  isHardRule: boolean; // cannot be overridden
}

interface DependencyConflict {
  type: 'circular' | 'impossible_date' | 'missing_buffer';
  taskIds: string[];
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
}

interface DependencyManagerProps {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  onDependencyChange?: (taskId: string, dependencies: string[]) => void;
  readonly?: boolean;
  getTaskDisplayName?: (task: Task) => string;
}

// Predefined construction dependency rules
const CONSTRUCTION_DEPENDENCY_RULES: DependencyRule[] = [
  {
    id: 'foundation-framing',
    name: 'Foundation before Framing',
    fromTrade: 'foundation',
    toTrade: 'framing',
    description: 'Concrete foundation must cure before framing can begin',
    minBuffer: 3,
    isHardRule: true
  },
  {
    id: 'framing-roofing',
    name: 'Framing before Roofing',
    fromTrade: 'framing',
    toTrade: 'roofing',
    description: 'Wall framing must be complete before roof installation',
    minBuffer: 1,
    isHardRule: true
  },
  {
    id: 'roofing-siding',
    name: 'Roofing before Siding',
    fromTrade: 'roofing',
    toTrade: 'siding',
    description: 'Roof should be complete to protect siding work',
    minBuffer: 1,
    isHardRule: false
  },
  {
    id: 'electrical-rough-drywall',
    name: 'Rough Electrical before Drywall',
    fromTrade: 'electrical',
    toTrade: 'drywall',
    description: 'Rough electrical must pass inspection before drywall',
    minBuffer: 1,
    isHardRule: true
  },
  {
    id: 'plumbing-rough-drywall',
    name: 'Rough Plumbing before Drywall',
    fromTrade: 'plumbing',
    toTrade: 'drywall',
    description: 'Rough plumbing must pass inspection before drywall',
    minBuffer: 1,
    isHardRule: true
  },
  {
    id: 'drywall-painting',
    name: 'Drywall before Painting',
    fromTrade: 'drywall',
    toTrade: 'painting',
    description: 'Drywall must be complete and primed before painting',
    minBuffer: 2,
    isHardRule: true
  },
  {
    id: 'painting-flooring',
    name: 'Painting before Flooring',
    fromTrade: 'painting',
    toTrade: 'flooring',
    description: 'Interior painting should be complete before flooring installation',
    minBuffer: 1,
    isHardRule: false
  }
];

export function DependencyManager({ 
  tasks, 
  onTasksChange, 
  onDependencyChange, 
  readonly = false,
  getTaskDisplayName
}: DependencyManagerProps) {
  const [showAddDependencyDialog, setShowAddDependencyDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedDependency, setSelectedDependency] = useState<string>('');
  const [showSuggestionsDialog, setShowSuggestionsDialog] = useState(false);

  // Detect dependency conflicts
  const detectConflicts = useCallback((taskList: Task[]): DependencyConflict[] => {
    const conflicts: DependencyConflict[] = [];
    const taskMap = new Map(taskList.map(task => [task.id, task]));

    // Check for circular dependencies
    const detectCircular = (taskId: string, visited: Set<string>, path: string[]): boolean => {
      if (path.includes(taskId)) {
        const circularPath = path.slice(path.indexOf(taskId));
        conflicts.push({
          type: 'circular',
          taskIds: circularPath,
          description: `Circular dependency detected: ${circularPath.map(id => taskMap.get(id)?.title).join(' → ')}`,
          severity: 'high',
          suggestion: 'Remove one of the dependencies to break the cycle'
        });
        return true;
      }

      if (visited.has(taskId)) return false;
      visited.add(taskId);

      const task = taskMap.get(taskId);
      if (!task) return false;

      const newPath = [...path, taskId];
      return task.dependencies.some(depId => detectCircular(depId, new Set(visited), newPath));
    };

    taskList.forEach(task => {
      detectCircular(task.id, new Set(), []);
    });

    // Check for impossible scheduling due to dependencies
    taskList.forEach(task => {
      task.dependencies.forEach(depId => {
        const depTask = taskMap.get(depId);
        if (depTask && depTask.endDate >= task.startDate) {
          conflicts.push({
            type: 'impossible_date',
            taskIds: [task.id, depId],
            description: `${task.title} starts before dependency ${depTask.title} ends`,
            severity: 'high',
            suggestion: `Reschedule ${task.title} to start after ${format(depTask.endDate, 'MMM d')}`
          });
        }
      });
    });

    // Check for missing construction logic dependencies
    CONSTRUCTION_DEPENDENCY_RULES.forEach(rule => {
      const fromTasks = taskList.filter(t => t.trade.toLowerCase().includes(rule.fromTrade));
      const toTasks = taskList.filter(t => t.trade.toLowerCase().includes(rule.toTrade));

      fromTasks.forEach(fromTask => {
        toTasks.forEach(toTask => {
          if (!toTask.dependencies.includes(fromTask.id)) {
            const timeDiff = differenceInDays(toTask.startDate, fromTask.endDate);
            if (timeDiff < rule.minBuffer && !rule.isHardRule) {
              conflicts.push({
                type: 'missing_buffer',
                taskIds: [fromTask.id, toTask.id],
                description: `${toTask.title} should depend on ${fromTask.title} (${rule.name})`,
                severity: 'medium',
                suggestion: `Add dependency or ensure ${rule.minBuffer} day buffer between tasks`
              });
            }
          }
        });
      });
    });

    return conflicts;
  }, []);

  // Generate smart dependency suggestions
  const generateSuggestions = useCallback((taskList: Task[]): {
    taskId: string;
    suggestedDependencies: string[];
    reason: string;
  }[] => {
    const suggestions = [];
    const taskMap = new Map(taskList.map(task => [task.id, task]));

    taskList.forEach(task => {
      const applicableRules = CONSTRUCTION_DEPENDENCY_RULES.filter(rule =>
        task.trade.toLowerCase().includes(rule.toTrade)
      );

      applicableRules.forEach(rule => {
        const candidateTasks = taskList.filter(t => 
          t.trade.toLowerCase().includes(rule.fromTrade) && 
          t.id !== task.id &&
          !task.dependencies.includes(t.id)
        );

        if (candidateTasks.length > 0) {
          suggestions.push({
            taskId: task.id,
            suggestedDependencies: candidateTasks.map(t => t.id),
            reason: rule.description
          });
        }
      });
    });

    return suggestions;
  }, []);

  const conflicts = useMemo(() => detectConflicts(tasks), [tasks, detectConflicts]);
  const suggestions = useMemo(() => generateSuggestions(tasks), [tasks, generateSuggestions]);

  // Add dependency
  const addDependency = useCallback((taskId: string, dependencyId: string) => {
    const updatedTasks = tasks.map(task => {
      if (task.id === taskId) {
        return {
          ...task,
          dependencies: [...new Set([...task.dependencies, dependencyId])]
        };
      }
      if (task.id === dependencyId) {
        return {
          ...task,
          dependents: [...new Set([...task.dependents, taskId])]
        };
      }
      return task;
    });

    onTasksChange(updatedTasks);
    onDependencyChange?.(taskId, updatedTasks.find(t => t.id === taskId)?.dependencies || []);
  }, [tasks, onTasksChange, onDependencyChange]);

  // Remove dependency
  const removeDependency = useCallback((taskId: string, dependencyId: string) => {
    const updatedTasks = tasks.map(task => {
      if (task.id === taskId) {
        return {
          ...task,
          dependencies: task.dependencies.filter(id => id !== dependencyId)
        };
      }
      if (task.id === dependencyId) {
        return {
          ...task,
          dependents: task.dependents.filter(id => id !== taskId)
        };
      }
      return task;
    });

    onTasksChange(updatedTasks);
    onDependencyChange?.(taskId, updatedTasks.find(t => t.id === taskId)?.dependencies || []);
  }, [tasks, onTasksChange, onDependencyChange]);

  // Auto-fix conflicts
  const autoFixConflicts = useCallback(() => {
    let updatedTasks = [...tasks];

    conflicts.forEach(conflict => {
      if (conflict.type === 'impossible_date' && conflict.taskIds.length === 2) {
        const [taskId, depId] = conflict.taskIds;
        const taskIndex = updatedTasks.findIndex(t => t.id === taskId);
        const depTask = updatedTasks.find(t => t.id === depId);

        if (taskIndex !== -1 && depTask) {
          const newStartDate = addDays(depTask.endDate, 1);
          updatedTasks[taskIndex] = {
            ...updatedTasks[taskIndex],
            startDate: newStartDate,
            endDate: addDays(newStartDate, updatedTasks[taskIndex].duration)
          };
        }
      }
    });

    onTasksChange(updatedTasks);
  }, [tasks, conflicts, onTasksChange]);

  // Apply suggested dependencies
  const applySuggestion = useCallback((taskId: string, dependencyIds: string[]) => {
    let updatedTasks = [...tasks];

    dependencyIds.forEach(depId => {
      updatedTasks = updatedTasks.map(task => {
        if (task.id === taskId) {
          return {
            ...task,
            dependencies: [...new Set([...task.dependencies, depId])]
          };
        }
        if (task.id === depId) {
          return {
            ...task,
            dependents: [...new Set([...task.dependents, taskId])]
          };
        }
        return task;
      });
    });

    onTasksChange(updatedTasks);
  }, [tasks, onTasksChange]);

  return (
    <div className="space-y-4">
      {/* Conflicts and warnings */}
      {conflicts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Dependency Issues ({conflicts.length})
              </CardTitle>
              <Button variant="outline" size="sm" onClick={autoFixConflicts}>
                Auto-Fix Issues
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {conflicts.map((conflict, index) => (
              <Alert key={index} className={`${
                conflict.severity === 'high' ? 'border-red-500 bg-red-50' :
                conflict.severity === 'medium' ? 'border-orange-500 bg-orange-50' :
                'border-yellow-500 bg-yellow-50'
              }`}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{conflict.description}</div>
                      <div className="text-sm mt-1">{conflict.suggestion}</div>
                      <div className="flex gap-1 mt-2">
                        {conflict.taskIds.map(taskId => {
                          const task = tasks.find(t => t.id === taskId);
                          return task ? (
                            <Badge key={taskId} variant="outline" className="text-xs">
                              {task.title}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </div>
                    <Badge variant={
                      conflict.severity === 'high' ? 'destructive' :
                      conflict.severity === 'medium' ? 'secondary' : 'default'
                    }>
                      {conflict.severity}
                    </Badge>
                  </div>
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Main dependency management interface */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Network className="w-5 h-5" />
              Task Dependencies
            </CardTitle>
            <div className="flex gap-2">
              {suggestions.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowSuggestionsDialog(true)}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700"
                >
                  <Target className="w-4 h-4 mr-2" />
                  {suggestions.length} Suggestions
                </Button>
              )}
              {!readonly && (
                <Button variant="outline" size="sm" onClick={() => setShowAddDependencyDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Dependency
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="list">
            <TabsList>
              <TabsTrigger value="list">List View</TabsTrigger>
              <TabsTrigger value="network">Network View</TabsTrigger>
            </TabsList>
            
            <TabsContent value="list" className="space-y-4 mt-4">
              {tasks.map(task => (
                <Card key={task.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{task.title}</h4>
                        <Badge variant="outline">{task.trade}</Badge>
                        {task.isCriticalPath && (
                          <Badge variant="destructive">Critical Path</Badge>
                        )}
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-3">
                        {format(task.startDate, 'MMM d')} - {format(task.endDate, 'MMM d')} ({task.duration} days)
                      </div>
                      
                      {/* Dependencies */}
                      <div className="space-y-2">
                        {task.dependencies.length > 0 && (
                          <div>
                            <Label className="text-xs font-medium text-gray-500">DEPENDS ON:</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {task.dependencies.map(depId => {
                                const depTask = tasks.find(t => t.id === depId);
                                return depTask ? (
                                  <Badge key={depId} variant="secondary" className="text-xs">
                                    {getTaskDisplayName ? getTaskDisplayName(depTask) : depTask.title}
                                    {!readonly && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="ml-1 h-auto p-0"
                                        onClick={() => removeDependency(task.id, depId)}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </Badge>
                                ) : null;
                              })}
                            </div>
                          </div>
                        )}
                        
                        {task.dependents.length > 0 && (
                          <div>
                            <Label className="text-xs font-medium text-gray-500">REQUIRED BY:</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {task.dependents.map(depId => {
                                const depTask = tasks.find(t => t.id === depId);
                                return depTask ? (
                                  <Badge key={depId} variant="outline" className="text-xs">
                                    {getTaskDisplayName ? getTaskDisplayName(depTask) : depTask.title}
                                  </Badge>
                                ) : null;
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {!readonly && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedTask(task);
                          setShowAddDependencyDialog(true);
                        }}
                      >
                        <Link className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </TabsContent>
            
            <TabsContent value="network" className="mt-4">
              <div className="text-center py-8 text-gray-500">
                <Network className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Interactive network diagram coming soon...</p>
                <p className="text-sm">This will show a visual dependency graph</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Add Dependency Dialog */}
      <Dialog open={showAddDependencyDialog} onOpenChange={setShowAddDependencyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add Dependency {selectedTask && `to ${selectedTask.title}`}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {!selectedTask && (
              <div>
                <Label>Select Task</Label>
                <Select onValueChange={(value) => setSelectedTask(tasks.find(t => t.id === value) || null)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a task..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tasks.map(task => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.title} ({task.trade})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {selectedTask && (
              <div>
                <Label>This task depends on</Label>
                <Select value={selectedDependency} onValueChange={setSelectedDependency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select dependency..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tasks
                      .filter(t => t.id !== selectedTask.id && !selectedTask.dependencies.includes(t.id))
                      .map(task => (
                        <SelectItem key={task.id} value={task.id}>
                          {task.title} ({task.trade})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddDependencyDialog(false);
              setSelectedTask(null);
              setSelectedDependency('');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedTask && selectedDependency) {
                  addDependency(selectedTask.id, selectedDependency);
                  setShowAddDependencyDialog(false);
                  setSelectedTask(null);
                  setSelectedDependency('');
                }
              }}
              disabled={!selectedTask || !selectedDependency}
            >
              Add Dependency
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suggestions Dialog */}
      <Dialog open={showSuggestionsDialog} onOpenChange={setShowSuggestionsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Smart Dependency Suggestions</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {suggestions.map((suggestion, index) => {
              const task = tasks.find(t => t.id === suggestion.taskId);
              return task ? (
                <Card key={index} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium mb-2">{task.title}</h4>
                      <p className="text-sm text-gray-600 mb-3">{suggestion.reason}</p>
                      
                      <div className="flex flex-wrap gap-1">
                        {suggestion.suggestedDependencies.map(depId => {
                          const depTask = tasks.find(t => t.id === depId);
                          return depTask ? (
                            <Badge key={depId} variant="outline" className="text-xs">
                              {depTask.title}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applySuggestion(suggestion.taskId, suggestion.suggestedDependencies)}
                    >
                      Apply
                    </Button>
                  </div>
                </Card>
              ) : null;
            })}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuggestionsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DependencyManager;