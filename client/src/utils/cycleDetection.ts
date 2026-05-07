import { Dependency } from '../hooks/useProjectSchedule';

/**
 * Detects if adding a dependency from fromId to toId would create a cycle
 * @param fromId - Source task ID
 * @param toId - Target task ID  
 * @param dependencies - Current dependency array
 * @returns true if cycle would be created
 */
export function hasPath(
  fromId: number, 
  toId: number, 
  dependencies: Dependency[], 
  visited = new Set<number>()
): boolean {
  if (fromId === toId) return true;
  if (visited.has(fromId)) return false;
  
  visited.add(fromId);
  
  // Find all dependencies where fromId is the source
  const outgoingDeps = dependencies.filter(dep => dep.source === fromId);
  
  return outgoingDeps.some(dep => hasPath(dep.target, toId, dependencies, visited));
}

/**
 * Performs a depth-first search to detect cycles in the dependency graph
 * @param dependencies - Array of dependencies
 * @returns Array of task IDs involved in cycles
 */
export function detectCycles(dependencies: Dependency[]): number[][] {
  const cycles: number[][] = [];
  const visited = new Set<number>();
  const recursionStack = new Set<number>();
  const path: number[] = [];

  // Get all unique task IDs
  const taskIds = Array.from(new Set([
    ...dependencies.map(d => d.source),
    ...dependencies.map(d => d.target)
  ]));

  function dfs(taskId: number): boolean {
    if (recursionStack.has(taskId)) {
      // Found a cycle - extract the cycle from path
      const cycleStart = path.indexOf(taskId);
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart));
      }
      return true;
    }

    if (visited.has(taskId)) {
      return false;
    }

    visited.add(taskId);
    recursionStack.add(taskId);
    path.push(taskId);

    // Visit all dependent tasks
    const dependents = dependencies
      .filter(dep => dep.source === taskId)
      .map(dep => dep.target);

    for (const dependent of dependents) {
      if (dfs(dependent)) {
        return true;
      }
    }

    recursionStack.delete(taskId);
    path.pop();
    return false;
  }

  // Check each unvisited task
  for (const taskId of taskIds) {
    if (!visited.has(taskId)) {
      dfs(taskId);
    }
  }

  return cycles;
}

/**
 * Validates if a new dependency would create a cycle
 * @param newDep - New dependency to validate
 * @param existingDeps - Current dependencies
 * @returns true if valid (no cycle), false if cycle detected
 */
export function validateDependency(
  newDep: { source: number; target: number },
  existingDeps: Dependency[]
): boolean {
  return !hasPath(newDep.target, newDep.source, existingDeps);
}