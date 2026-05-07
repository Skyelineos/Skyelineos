import type { ScheduleDependency } from '../hooks/useProjectSchedule';

/**
 * Detect if adding a new dependency would create a cycle
 * Uses depth-first search to detect cycles in the dependency graph
 */
export function detectCycle(
  newDep: { fromTaskId: number; toTaskId: number },
  existingDeps: ScheduleDependency[]
): boolean {
  const allDeps = [...existingDeps, { 
    id: 999999, 
    projectId: 0, 
    fromTaskId: newDep.fromTaskId, 
    toTaskId: newDep.toTaskId, 
    type: 'finish_to_start' as const 
  }];
  const visited = new Set<number>();
  const inStack = new Set<number>();

  function dfs(node: number): boolean {
    if (inStack.has(node)) return true; // Cycle detected
    if (visited.has(node)) return false;

    visited.add(node);
    inStack.add(node);

    // Find all dependencies where this node is the source
    const dependents = allDeps.filter(dep => dep.fromTaskId === node);
    for (const dep of dependents) {
      if (dfs(dep.toTaskId)) return true;
    }

    inStack.delete(node);
    return false;
  }

  // Start DFS from the new dependency's source
  return dfs(newDep.fromTaskId);
}

/**
 * Validate if a dependency can be added without creating cycles
 */
export function validateDependency(
  newDep: { fromTaskId: number | string; toTaskId: number | string },
  existingDeps: ScheduleDependency[]
): boolean {
  const fromTaskId = typeof newDep.fromTaskId === 'string' ? parseInt(newDep.fromTaskId) : newDep.fromTaskId;
  const toTaskId = typeof newDep.toTaskId === 'string' ? parseInt(newDep.toTaskId) : newDep.toTaskId;

  // Can't depend on itself
  if (fromTaskId === toTaskId) return false;

  // Check for cycles
  return !detectCycle({ fromTaskId, toTaskId }, existingDeps);
}

/**
 * Calculate the delta in days between two date strings
 */
export function calculateDateDelta(newDate: string, oldDate: string): number {
  const newDateObj = new Date(newDate);
  const oldDateObj = new Date(oldDate);
  const diffTime = newDateObj.getTime() - oldDateObj.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Validate if a task shift is valid (doesn't violate dependencies)
 */
export function validateTaskShift(
  taskId: number,
  deltaDays: number,
  dependencies: ScheduleDependency[],
  gantt?: any
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check if the task has predecessors that would be violated
  const predecessors = dependencies.filter(dep => dep.toTaskId === taskId);
  
  for (const pred of predecessors) {
    if (gantt) {
      try {
        const sourceTask = gantt.getTask(pred.fromTaskId.toString());
        const targetTask = gantt.getTask(taskId.toString());
        
        if (sourceTask && targetTask) {
          const sourceEnd = new Date(sourceTask.end_date);
          const targetStart = new Date(targetTask.start_date);
          
          // Add the delta to target start date
          const newTargetStart = new Date(targetStart);
          newTargetStart.setDate(newTargetStart.getDate() + deltaDays);
          
          // Check if new start date violates the dependency
          const gap = Math.floor((newTargetStart.getTime() - sourceEnd.getTime()) / (1000 * 60 * 60 * 24));
          const requiredGap = 1; // FS requires at least 1 day gap by default
          
          if (gap < requiredGap) {
            warnings.push(`Moving this task would violate dependency with "${sourceTask.text}"`);
          }
        }
      } catch (error) {
        console.warn('Error validating task shift:', error);
      }
    }
  }

  return {
    valid: warnings.length === 0,
    warnings
  };
}