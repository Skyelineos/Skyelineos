import { Request, Response } from 'express';
import { cacheService } from '../utils/redisClient';
import { projects } from '../../shared/schema';
import { storage } from '../storage';

export class ScheduleController {
  /**
   * Get project schedule with Redis caching
   */
  static async getProjectSchedule(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const cacheKey = `schedule:${projectId}`;
      
      // Try to get from cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        // Development logging removed
        return res.json(cached);
      }

      // Search/lookup operation

      // Fetch from database with optimized queries
      const [projectTasks, projectDependencies] = await Promise.all([
        storage.getTasks({ projectId: parseInt(projectId) }),
        storage.getDependencies({ projectId: parseInt(projectId) })
      ]);

      const result = {
        tasks: projectTasks,
        dependencies: projectDependencies
      };

      // Cache the result for 60 seconds
      await cacheService.set(cacheKey, result, 60);
      // Development logging removed

      res.json(result);
    } catch (error) {
      console.error('Error fetching project schedule:', error);
      res.status(500).json({ 
        error: 'Failed to fetch project schedule',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Invalidate schedule cache when data changes
   */
  static async invalidateScheduleCache(projectId: string | number) {
    const cacheKey = `schedule:${projectId}`;
    await cacheService.del(cacheKey);
    // Development logging removed
  }

  /**
   * Prefetch schedule data for likely next requests
   */
  static async prefetchSchedule(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      
      // Trigger a background fetch but don't wait for it
      ScheduleController.getProjectSchedule(req, res).catch(error => {
        console.warn('Background prefetch failed:', error);
      });
      
      res.status(202).json({ message: 'Prefetch initiated' });
    } catch (error) {
      console.error('Error prefetching schedule:', error);
      res.status(500).json({ error: 'Failed to prefetch schedule' });
    }
  }

  /**
   * Update task status
   */
  static async updateTaskStatus(req: Request, res: Response) {
    try {
      const { projectId, taskId } = req.params;
      const { status } = req.body;

      // Validate status
      const validStatuses = ['Scheduled', 'In Progress', 'Completed', 'Cancelled', 'Delayed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: 'Invalid status', 
          validStatuses 
        });
      }

      // Update task status
      const updatedTask = await storage.updateTaskStatus(parseInt(taskId), status);
      
      if (!updatedTask) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Invalidate cache
      await ScheduleController.invalidateScheduleCache(projectId);

      res.json(updatedTask);
    } catch (error) {
      console.error('Error updating task status:', error);
      res.status(500).json({ 
        error: 'Failed to update task status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Bulk update task statuses
   */
  static async bulkUpdateTaskStatus(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const { taskIds, status } = req.body;

      // Validate status
      const validStatuses = ['Scheduled', 'In Progress', 'Completed', 'Cancelled', 'Delayed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: 'Invalid status', 
          validStatuses 
        });
      }

      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'taskIds must be a non-empty array' });
      }

      // Update multiple task statuses
      const updates = await Promise.all(
        taskIds.map(taskId => storage.updateTaskStatus(parseInt(taskId), status))
      );

      // Filter out null results (tasks not found)
      const updatedTasks = updates.filter(task => task !== null);

      // Invalidate cache
      await ScheduleController.invalidateScheduleCache(projectId);

      res.json({
        updatedCount: updatedTasks.length,
        tasks: updatedTasks
      });
    } catch (error) {
      console.error('Error bulk updating task statuses:', error);
      res.status(500).json({ 
        error: 'Failed to bulk update task statuses',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}