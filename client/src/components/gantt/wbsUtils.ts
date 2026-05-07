// WBS (Work Breakdown Structure) utility functions
import type { WbsTask, Link, LinkType } from '@/types/wbs';
import type { Trade } from '@/types/gantt';
import { parseISO, addDays, format, differenceInDays, isAfter, isBefore } from 'date-fns';

/**
 * Flatten hierarchical WBS tasks into a flat array for Gantt display
 */
export function flattenTasks(tasks: WbsTask[], level: number = 0): WbsTask[] {
  const flattened: WbsTask[] = [];
  
  for (const task of tasks) {
    // Add current task with level info
    const flatTask = {
      ...task,
      _isSummary: Boolean(task.children && task.children.length > 0),
      _level: level
    } as WbsTask & { _level: number };
    
    flattened.push(flatTask);
    
    // Recursively add children
    if (task.children && task.children.length > 0) {
      flattened.push(...flattenTasks(task.children, level + 1));
    }
  }
  
  return flattened;
}

/**
 * Calculate summary task dates from children
 */
export function calculateSummaryDates(task: WbsTask): void {
  if (!task.children || task.children.length === 0) {
    return; // Leaf task, dates are already set
  }
  
  // First calculate all child summary dates
  task.children.forEach(calculateSummaryDates);
  
  // Find earliest start date and latest end date among children
  const childStartDates = task.children.map(child => parseISO(child.startDate));
  const childEndDates = task.children.map(child => parseISO(child.endDate));
  
  const earliestStart = new Date(Math.min(...childStartDates.map(d => d.getTime())));
  const latestEnd = new Date(Math.max(...childEndDates.map(d => d.getTime())));
  
  task.startDate = format(earliestStart, 'yyyy-MM-dd');
  task.endDate = format(latestEnd, 'yyyy-MM-dd');
  
  // Calculate summary progress as average of children
  if (task.children.every(child => typeof child.percent === 'number')) {
    const totalProgress = task.children.reduce((sum, child) => sum + (child.percent || 0), 0);
    task.percent = Math.round(totalProgress / task.children.length);
  }
}

/**
 * Resolve start date for a task based on its predecessors
 */
export function resolvePredecessorDate(task: WbsTask, allTasks: WbsTask[]): Date {
  if (!task.predecessors || task.predecessors.length === 0) {
    return parseISO(task.startDate);
  }
  
  let calculatedStartDate = parseISO(task.startDate);
  
  for (const pred of task.predecessors) {
    const predecessorTask = allTasks.find(t => t.id === pred.taskId);
    if (!predecessorTask) continue;
    
    const predEndDate = parseISO(predecessorTask.endDate);
    const predStartDate = parseISO(predecessorTask.startDate);
    const lagDays = pred.lagDays || 0;
    
    let requiredStartDate: Date;
    
    switch (pred.type) {
      case 'FS': // Finish-to-Start (most common)
        requiredStartDate = addDays(predEndDate, lagDays + 1);
        break;
      case 'SS': // Start-to-Start
        requiredStartDate = addDays(predStartDate, lagDays);
        break;
      case 'FF': // Finish-to-Finish
        const taskDuration = differenceInDays(parseISO(task.endDate), parseISO(task.startDate));
        requiredStartDate = addDays(predEndDate, lagDays - taskDuration);
        break;
      case 'SF': // Start-to-Finish (rare)
        requiredStartDate = addDays(predStartDate, lagDays);
        break;
      default:
        requiredStartDate = parseISO(task.startDate);
    }
    
    // Take the latest required start date
    if (isAfter(requiredStartDate, calculatedStartDate)) {
      calculatedStartDate = requiredStartDate;
    }
  }
  
  return calculatedStartDate;
}

/**
 * Validate that all dependencies exist and don't create circular references
 */
export function validateDependencies(tasks: WbsTask[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const taskIds = new Set(tasks.map(t => t.id));
  
  // Check all predecessor references exist
  for (const task of tasks) {
    if (task.predecessors) {
      for (const pred of task.predecessors) {
        if (!taskIds.has(pred.taskId)) {
          errors.push(`Task "${task.name}" references non-existent predecessor "${pred.taskId}"`);
        }
      }
    }
  }
  
  // Check for circular dependencies using DFS
  function hasCircularDependency(taskId: string, visited: Set<string>, path: Set<string>): boolean {
    if (path.has(taskId)) return true;
    if (visited.has(taskId)) return false;
    
    visited.add(taskId);
    path.add(taskId);
    
    const task = tasks.find(t => t.id === taskId);
    if (task?.predecessors) {
      for (const pred of task.predecessors) {
        if (hasCircularDependency(pred.taskId, visited, path)) {
          return true;
        }
      }
    }
    
    path.delete(taskId);
    return false;
  }
  
  const visited = new Set<string>();
  for (const task of tasks) {
    if (!visited.has(task.id)) {
      if (hasCircularDependency(task.id, visited, new Set())) {
        errors.push(`Circular dependency detected involving task "${task.name}"`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Convert WBS task to Trade for backward compatibility
 */
export function wbsTaskToTrade(wbsTask: WbsTask): Trade {
  return {
    id: wbsTask.id,
    name: wbsTask.name,
    phase: 'rough', // Default phase
    startDate: wbsTask.startDate,
    endDate: wbsTask.endDate,
    status: 'on_track', // Default status
    dependencies: wbsTask.predecessors?.map(p => p.taskId) || [],
    wbsId: wbsTask.id,
    parentId: undefined, // Will be set by hierarchy processing
    predecessors: wbsTask.predecessors,
    percent: wbsTask.percent,
    _isSummary: wbsTask._isSummary
  };
}

/**
 * Convert Trade to WBS task 
 */
export function tradeToWbsTask(trade: Trade): WbsTask {
  return {
    id: trade.id,
    name: trade.name,
    startDate: trade.startDate,
    endDate: trade.endDate,
    percent: trade.percent,
    predecessors: trade.predecessors,
    _isSummary: trade._isSummary
  };
}

/**
 * Build hierarchical structure from flat WBS tasks
 */
export function buildHierarchy(flatTasks: WbsTask[]): WbsTask[] {
  const taskMap = new Map<string, WbsTask>();
  const rootTasks: WbsTask[] = [];
  
  // Create task map
  flatTasks.forEach(task => {
    taskMap.set(task.id, { ...task, children: [] });
  });
  
  // Build parent-child relationships based on WBS numbering or explicit parent IDs
  flatTasks.forEach(task => {
    const taskWithChildren = taskMap.get(task.id)!;
    
    // Simple approach: if task ID contains dots, parent is everything before last dot
    if (task.id.includes('.')) {
      const parentId = task.id.substring(0, task.id.lastIndexOf('.'));
      const parent = taskMap.get(parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(taskWithChildren);
      } else {
        rootTasks.push(taskWithChildren);
      }
    } else {
      rootTasks.push(taskWithChildren);
    }
  });
  
  return rootTasks;
}

/**
 * Calculate critical path through the project
 */
export function calculateCriticalPath(tasks: WbsTask[]): string[] {
  // Simplified critical path calculation
  // In a full implementation, this would use forward/backward pass
  const criticalTasks: string[] = [];
  
  // For now, just mark tasks with zero float as critical
  // This would need proper CPM algorithm for full accuracy
  
  return criticalTasks;
}