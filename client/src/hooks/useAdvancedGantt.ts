import { useState, useCallback, useMemo } from 'react';
import { addDays, format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';

export interface GanttTask {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  progress: number;
  dependencies?: string[];
  assignee?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  color?: string;
}

export interface GanttViewConfig {
  viewMode: 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
  showWeekends: boolean;
  showCriticalPath: boolean;
}

export function useAdvancedGantt(initialTasks: GanttTask[] = []) {
  const [tasks, setTasks] = useState<GanttTask[]>(initialTasks);
  const [viewConfig, setViewConfig] = useState<GanttViewConfig>({
    viewMode: 'week',
    startDate: startOfWeek(new Date()),
    endDate: endOfWeek(addDays(new Date(), 90)),
    showWeekends: true,
    showCriticalPath: false
  });
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);

  // Generate timeline columns based on view mode
  const timelineColumns = useMemo(() => {
    const { startDate, endDate, viewMode, showWeekends } = viewConfig;
    const interval = eachDayOfInterval({ start: startDate, end: endDate });
    
    return interval.filter(date => {
      if (!showWeekends && (date.getDay() === 0 || date.getDay() === 6)) {
        return false;
      }
      return true;
    }).map(date => ({
      date,
      label: format(date, viewMode === 'day' ? 'MMM dd' : viewMode === 'week' ? 'MMM dd' : 'MMM yyyy'),
      isWeekend: date.getDay() === 0 || date.getDay() === 6
    }));
  }, [viewConfig]);

  // Calculate critical path
  const criticalPath = useMemo(() => {
    if (!viewConfig.showCriticalPath) return [];
    
    // Simple critical path calculation
    // In a real implementation, this would use proper critical path method (CPM)
    const taskMap = new Map(tasks.map(task => [task.id, task]));
    const visited = new Set<string>();
    const criticalTasks = new Set<string>();
    
    const findLongestPath = (taskId: string, currentPath: string[]): number => {
      if (visited.has(taskId)) return 0;
      visited.add(taskId);
      
      const task = taskMap.get(taskId);
      if (!task) return 0;
      
      const taskDuration = Math.ceil((task.endDate.getTime() - task.startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (!task.dependencies || task.dependencies.length === 0) {
        return taskDuration;
      }
      
      let maxDependencyPath = 0;
      for (const depId of task.dependencies) {
        const depPath = findLongestPath(depId, [...currentPath, taskId]);
        maxDependencyPath = Math.max(maxDependencyPath, depPath);
      }
      
      return taskDuration + maxDependencyPath;
    };
    
    // Find the longest path for each task
    tasks.forEach(task => {
      visited.clear();
      const pathLength = findLongestPath(task.id, []);
      if (pathLength > 0) {
        criticalTasks.add(task.id);
      }
    });
    
    return Array.from(criticalTasks);
  }, [tasks, viewConfig.showCriticalPath]);

  const updateTask = useCallback((taskId: string, updates: Partial<GanttTask>) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, ...updates } : task
    ));
  }, []);

  const addTask = useCallback((task: Omit<GanttTask, 'id'>) => {
    const newTask: GanttTask = {
      ...task,
      id: `task-${Date.now()}`
    };
    setTasks(prev => [...prev, newTask]);
    return newTask.id;
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
    // Also remove dependencies referencing this task
    setTasks(prev => prev.map(task => ({
      ...task,
      dependencies: task.dependencies?.filter(dep => dep !== taskId)
    })));
  }, []);

  const updateViewConfig = useCallback((updates: Partial<GanttViewConfig>) => {
    setViewConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const getTaskPosition = useCallback((task: GanttTask) => {
    const { startDate } = viewConfig;
    const taskStart = Math.max(0, Math.ceil((task.startDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const taskDuration = Math.ceil((task.endDate.getTime() - task.startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      left: taskStart,
      width: Math.max(1, taskDuration),
      isCritical: criticalPath.includes(task.id)
    };
  }, [viewConfig, criticalPath]);

  const handleTaskDrag = useCallback((taskId: string, newStartDate: Date) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const duration = task.endDate.getTime() - task.startDate.getTime();
    const newEndDate = new Date(newStartDate.getTime() + duration);
    
    updateTask(taskId, {
      startDate: newStartDate,
      endDate: newEndDate
    });
  }, [tasks, updateTask]);

  const handleTaskResize = useCallback((taskId: string, newEndDate: Date) => {
    updateTask(taskId, { endDate: newEndDate });
  }, [updateTask]);

  return {
    tasks,
    viewConfig,
    timelineColumns,
    criticalPath,
    selectedTask,
    draggedTask,
    updateTask,
    addTask,
    deleteTask,
    updateViewConfig,
    getTaskPosition,
    handleTaskDrag,
    handleTaskResize,
    setSelectedTask,
    setDraggedTask
  };
}