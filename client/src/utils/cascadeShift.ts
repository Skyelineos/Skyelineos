import type { Task as ScheduleTask, Dependency as ScheduleDependency } from '../hooks/useProjectSchedule';
import { differenceInDays, parseISO } from 'date-fns';

interface CascadeShiftOptions {
  tasks: ScheduleTask[];
  dependencies: ScheduleDependency[];
  rootTaskId: number;
  deltaDays: number;
}

export interface TaskShift {
  taskId: number;
  deltaDays: number;
}

// Calculate the difference in days between two dates
export function calculateDateDelta(newDate: Date | string, originalDate: string): number {
  const originalDateObj = typeof originalDate === 'string' ? parseISO(originalDate) : originalDate;
  const newDateObj = typeof newDate === 'string' ? parseISO(newDate) : newDate;
  
  return differenceInDays(newDateObj, originalDateObj);
}

export function cascadeShift({ tasks, dependencies, rootTaskId, deltaDays }: CascadeShiftOptions): TaskShift[] {
  const visited = new Set<number>();
  const tasksToShift: TaskShift[] = [];

  function dfsShift(taskId: number, currentDelta: number) {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    
    // Add this task to shift list if delta is non-zero
    if (currentDelta !== 0) {
      tasksToShift.push({ taskId, deltaDays: currentDelta });
    }

    // Find dependent tasks (tasks that depend on this one)
    const dependentLinks = dependencies.filter(dep => dep.fromTaskId === taskId);
    
    for (const link of dependentLinks) {
      const dependentTask = tasks.find(t => t.id === link.toTaskId);
      if (!dependentTask) continue;

      // Calculate cascade delta based on dependency type
      let cascadeDelta = currentDelta;
      
      // For finish-to-start dependencies, dependent tasks shift by the same amount
      // For other dependency types, we can add more sophisticated logic later
      switch (link.dependencyType) {
        case 'FS': // Finish-to-Start
          cascadeDelta = currentDelta;
          break;
        case 'SS': // Start-to-Start
          cascadeDelta = currentDelta;
          break;
        case 'FF': // Finish-to-Finish
          cascadeDelta = currentDelta;
          break;
        case 'SF': // Start-to-Finish
          cascadeDelta = currentDelta;
          break;
        default:
          cascadeDelta = currentDelta;
      }
      
      dfsShift(link.toTaskId, cascadeDelta);
    }
  }

  // Start cascade from the root task
  dfsShift(rootTaskId, deltaDays);
  
  return tasksToShift;
}

export function detectCycle(dependencies: ScheduleDependency[], newLink: { fromTaskId: number; toTaskId: number }): boolean {
  const graph = new Map<number, number[]>();
  
  // Build adjacency list from existing dependencies
  dependencies.forEach(dep => {
    if (!graph.has(dep.fromTaskId)) {
      graph.set(dep.fromTaskId, []);
    }
    graph.get(dep.fromTaskId)!.push(dep.toTaskId);
  });

  // Add the proposed new link
  if (!graph.has(newLink.fromTaskId)) {
    graph.set(newLink.fromTaskId, []);
  }
  graph.get(newLink.fromTaskId)!.push(newLink.toTaskId);

  // DFS to detect cycle
  const visited = new Set<number>();
  const recursionStack = new Set<number>();

  function hasCycleDFS(node: number): boolean {
    if (recursionStack.has(node)) return true;
    if (visited.has(node)) return false;

    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (hasCycleDFS(neighbor)) return true;
    }

    recursionStack.delete(node);
    return false;
  }

  // Check all nodes for cycles
  const nodeArray = Array.from(graph.keys());
  for (const node of nodeArray) {
    if (!visited.has(node)) {
      if (hasCycleDFS(node)) return true;
    }
  }

  return false;
}