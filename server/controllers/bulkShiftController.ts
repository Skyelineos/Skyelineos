import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { projectTasks, taskDependencies } from '../../shared/schema';
import { parseISO, formatISO, addDays, differenceInDays } from 'date-fns';

// Validation schema for bulk shift request
const bulkShiftSchema = z.object({
  shifts: z.array(z.object({
    id: z.number().int().positive(),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format')
  })).min(1, 'At least one task shift is required')
});

export type BulkShiftRequest = z.infer<typeof bulkShiftSchema>;

interface TaskShift {
  taskId: number;
  newStartDate: string;
  newEndDate: string;
}

interface DependencyInfo {
  id: number;
  fromTaskId: number;
  toTaskId: number;
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

interface TaskInfo {
  id: number;
  projectId: number;
  startDate: string;
  endDate: string;
  duration: number;
}

/**
 * Calculate cascade effects for dependent tasks
 */
function calculateCascadeEffects(
  updatedTasks: Map<number, { start: string; end: string }>,
  dependencies: DependencyInfo[],
  allTasks: TaskInfo[]
): TaskShift[] {
  const cascadeEffects: TaskShift[] = [];
  const processed = new Set<number>();
  
  function processTask(taskId: number) {
    if (processed.has(taskId)) return;
    processed.add(taskId);
    
    // Find all tasks that depend on this task
    const dependentTaskIds = dependencies
      .filter(dep => dep.fromTaskId === taskId)
      .map(dep => dep.toTaskId);
      
    dependentTaskIds.forEach(dependentTaskId => {
      const dependency = dependencies.find(dep => 
        dep.fromTaskId === taskId && dep.toTaskId === dependentTaskId
      );
      if (!dependency) return;
      
      const dependentTask = allTasks.find(t => t.id === dependentTaskId);
      if (!dependentTask) return;
      
      // Get the current dates for the predecessor task (either updated or original)
      const predecessorDates = updatedTasks.get(taskId) || {
        start: allTasks.find(t => t.id === taskId)?.startDate || '',
        end: allTasks.find(t => t.id === taskId)?.endDate || ''
      };
      
      if (!predecessorDates.start || !predecessorDates.end) return;
      
      const predecessorStart = parseISO(predecessorDates.start);
      const predecessorEnd = parseISO(predecessorDates.end);
      const taskDuration = dependentTask.duration;
      
      let newDepStartDate: Date;
      let newDepEndDate: Date;
      
      // Calculate new dates based on dependency type
      switch (dependency.dependencyType) {
        case 'FS': // Finish-to-Start
          newDepStartDate = addDays(predecessorEnd, dependency.lagDays + 1);
          newDepEndDate = addDays(newDepStartDate, taskDuration - 1);
          break;
        case 'SS': // Start-to-Start
          newDepStartDate = addDays(predecessorStart, dependency.lagDays);
          newDepEndDate = addDays(newDepStartDate, taskDuration - 1);
          break;
        case 'FF': // Finish-to-Finish
          newDepEndDate = addDays(predecessorEnd, dependency.lagDays);
          newDepStartDate = addDays(newDepEndDate, -(taskDuration - 1));
          break;
        case 'SF': // Start-to-Finish
          newDepEndDate = addDays(predecessorStart, dependency.lagDays);
          newDepStartDate = addDays(newDepEndDate, -(taskDuration - 1));
          break;
        default:
          return;
      }
      
      const newStartStr = formatISO(newDepStartDate, { representation: 'date' });
      const newEndStr = formatISO(newDepEndDate, { representation: 'date' });
      
      // Only add to cascade if dates actually changed
      if (newStartStr !== dependentTask.startDate || newEndStr !== dependentTask.endDate) {
        cascadeEffects.push({
          taskId: dependentTaskId,
          newStartDate: newStartStr,
          newEndDate: newEndStr
        });
        
        // Update the map for further cascade calculations
        updatedTasks.set(dependentTaskId, {
          start: newStartStr,
          end: newEndStr
        });
        
        // Recursively process tasks that depend on this dependent task
        processTask(dependentTaskId);
      }
    });
  }
  
  // Process all initially updated tasks
  for (const taskId of Array.from(updatedTasks.keys())) {
    processTask(taskId);
  }
  
  return cascadeEffects;
}

/**
 * Bulk shift tasks endpoint with transactional updates and cascade calculations
 */
export async function bulkShiftTasks(req: Request, res: Response) {
  try {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ 
        error: 'Invalid project ID',
        details: 'Project ID must be a valid number'
      });
    }
    
    // Validate request body
    const validationResult = bulkShiftSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.errors
      });
    }
    
    const { shifts } = validationResult.data;
    
    // Validate that end dates are not before start dates
    for (const shift of shifts) {
      const startDate = parseISO(shift.start);
      const endDate = parseISO(shift.end);
      if (endDate < startDate) {
        return res.status(400).json({
          error: 'Invalid date range',
          details: `Task ${shift.id}: end date cannot be before start date`
        });
      }
    }
    
    // Start database transaction
    const result = await db!.transaction(async (tx) => {
      // Fetch all tasks and dependencies for the project
      const [allTasks, dependencies] = await Promise.all([
        tx.select({
          id: projectTasks.id,
          projectId: projectTasks.projectId,
          startDate: projectTasks.startDate,
          endDate: projectTasks.endDate,
          duration: projectTasks.duration
        }).from(projectTasks)
          .where(eq(projectTasks.projectId, projectId)),
        
        tx.select({
          id: taskDependencies.id,
          fromTaskId: taskDependencies.fromTaskId,
          toTaskId: taskDependencies.toTaskId,
          dependencyType: taskDependencies.dependencyType,
          lagDays: taskDependencies.lagDays
        }).from(taskDependencies)
          .where(eq(taskDependencies.projectId, projectId))
      ]);
      
      // Convert database results to proper types
      const tasksInfo: TaskInfo[] = allTasks.map(task => ({
        id: task.id,
        projectId: task.projectId,
        startDate: formatISO(task.startDate, { representation: 'date' }),
        endDate: formatISO(task.endDate, { representation: 'date' }),
        duration: task.duration
      }));
      
      const dependenciesInfo: DependencyInfo[] = dependencies.map(dep => ({
        id: dep.id,
        fromTaskId: dep.fromTaskId,
        toTaskId: dep.toTaskId,
        dependencyType: dep.dependencyType as 'FS' | 'SS' | 'FF' | 'SF',
        lagDays: dep.lagDays || 0
      }));
      
      // Verify all shifted tasks exist and belong to the project
      const taskIds = shifts.map(shift => shift.id);
      const existingTasks = tasksInfo.filter(task => taskIds.includes(task.id));
      
      if (existingTasks.length !== shifts.length) {
        const missingTaskIds = taskIds.filter(id => 
          !existingTasks.some(task => task.id === id)
        );
        throw new Error(`Tasks not found in project ${projectId}: ${missingTaskIds.join(', ')}`);
      }
      
      // Create a map of task updates
      const updatedTasks = new Map<number, { start: string; end: string }>();
      shifts.forEach(shift => {
        updatedTasks.set(shift.id, {
          start: shift.start,
          end: shift.end
        });
      });
      
      // Calculate cascade effects for dependent tasks
      const cascadeEffects = calculateCascadeEffects(updatedTasks, dependenciesInfo, tasksInfo);
      
      // Add cascade effects to the update map
      cascadeEffects.forEach(effect => {
        updatedTasks.set(effect.taskId, {
          start: effect.newStartDate,
          end: effect.newEndDate
        });
      });
      
      // Perform bulk updates
      const updatePromises: Promise<any>[] = [];
      
      for (const [taskId, dates] of Array.from(updatedTasks.entries())) {
        const startDate = parseISO(dates.start);
        const endDate = parseISO(dates.end);
        const duration = differenceInDays(endDate, startDate) + 1;
        
        updatePromises.push(
          tx.update(projectTasks)
            .set({
              startDate: startDate,
              endDate: endDate,
              duration: duration,
              updatedAt: new Date()
            })
            .where(and(
              eq(projectTasks.id, taskId),
              eq(projectTasks.projectId, projectId)
            ))
        );
      }
      
      // Execute all updates
      await Promise.all(updatePromises);
      
      return {
        updatedTasks: Array.from(updatedTasks.entries()).map(([taskId, dates]) => ({
          id: taskId,
          start: dates.start,
          end: dates.end
        })),
        cascadeEffects: cascadeEffects.length,
        totalUpdated: updatedTasks.size
      };
    });
    
    res.status(200).json({
      success: true,
      message: `Successfully updated ${result.totalUpdated} tasks`,
      data: result
    });
    
  } catch (error) {
    console.error('Bulk shift error:', error);
    
    if (error instanceof Error) {
      return res.status(500).json({
        error: 'Failed to update tasks',
        details: error.message
      });
    }
    
    res.status(500).json({
      error: 'An unexpected error occurred during bulk shift operation'
    });
  }
}