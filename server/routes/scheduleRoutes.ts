import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { storage } from '../storage';

const router = Router();

/**
 * GET /api/schedules - Get global schedule across all projects
 */
router.get('/', async (req, res) => {
  try {
    // Get all tasks across all projects from memory storage
    const projects = await storage.getAllProjects();
    const allTasks = [];
    
    for (const project of projects) {
      if (['planning', 'active', 'on_hold'].includes(project.status)) {
        const tasks = await storage.getProjectTasks(project.id);
        const projectTasks = tasks.map(task => ({
          ...task,
          projectId: project.id,
          projectName: project.name,
          dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
        }));
        allTasks.push(...projectTasks);
      }
    }

    // Sort by start date
    allTasks.sort((a, b) => new Date(a.startDate || a.start_date).getTime() - new Date(b.startDate || b.start_date).getTime());

    // Development logging removed
    res.json(allTasks);
  } catch (error) {
    console.error('❌ Error fetching global schedule:', error);
    res.status(500).json({ error: 'Failed to fetch global schedule' });
  }
});

/**
 * GET /api/projects/:projectId/tasks - Get tasks for a specific project
 */
router.get('/projects/:projectId/tasks', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const tasks = await storage.getProjectTasks(parseInt(projectId));
    
    // Transform tasks to match expected format
    const formattedTasks = tasks.map(task => ({
      ...task,
      projectId: parseInt(projectId),
      dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
    }));

    // Development logging removed
    res.json(formattedTasks);
  } catch (error) {
    console.error('❌ Error fetching project tasks:', error);
    res.status(500).json({ error: 'Failed to fetch project tasks' });
  }
});

/**
 * PATCH /api/projects/:projectId/tasks/:taskId - Update a specific task
 */
router.patch('/projects/:projectId/tasks/:taskId', async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const updates = req.body;

    const updatedTask = await storage.updateTask(parseInt(taskId), updates);
    
    if (!updatedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Success operation completed
    res.json(updatedTask);
  } catch (error) {
    console.error('❌ Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * POST /api/projects/:projectId/tasks/bulk-shift - Bulk shift multiple tasks
 */
router.post('/projects/:projectId/tasks/bulk-shift', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { taskIds, dayShift } = req.body;

    const updatedTasks = [];
    for (const taskId of taskIds) {
      const task = await storage.getTask(taskId);
      if (task) {
        const startDate = new Date(task.startDate || task.start_date);
        const endDate = new Date(task.endDate || task.end_date);
        
        startDate.setDate(startDate.getDate() + dayShift);
        endDate.setDate(endDate.getDate() + dayShift);
        
        const updatedTask = await storage.updateTask(taskId, {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });
        updatedTasks.push(updatedTask);
      }
    }
    
    // Development logging removed
    res.json({ 
      message: `Successfully shifted ${updatedTasks.length} tasks by ${dayShift} days`,
      updatedTasks 
    });
  } catch (error) {
    console.error('❌ Error bulk shifting tasks:', error);
    res.status(500).json({ error: 'Failed to bulk shift tasks' });
  }
});

/**
 * GET /api/projects/:projectId/dependencies - Get dependencies for a project
 */
router.get('/projects/:projectId/dependencies', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // For now, return empty array as dependency system is not implemented in memory storage
    const dependencies = [];
    
    // Development logging removed
    res.json(dependencies);
  } catch (error) {
    console.error('❌ Error fetching dependencies:', error);
    res.status(500).json({ error: 'Failed to fetch dependencies' });
  }
});

/**
 * POST /api/projects/:projectId/dependencies - Create a new dependency
 */
router.post('/projects/:projectId/dependencies', async (req, res) => {
  try {
    // For now, return placeholder as dependency system is not implemented in memory storage
    const dependency = {
      id: Date.now(),
      projectId: parseInt(req.params.projectId),
      ...req.body,
    };
    
    // Development logging removed
    res.status(201).json(dependency);
  } catch (error) {
    console.error('❌ Error creating dependency:', error);
    res.status(500).json({ error: 'Failed to create dependency' });
  }
});

/**
 * DELETE /api/projects/:projectId/dependencies/:dependencyId - Delete a dependency
 */
router.delete('/projects/:projectId/dependencies/:dependencyId', async (req, res) => {
  try {
    // For now, return success as dependency system is not implemented in memory storage
    // Development logging removed
    res.json({ message: 'Dependency deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting dependency:', error);
    res.status(500).json({ error: 'Failed to delete dependency' });
  }
});

/**
 * POST /api/projects/:projectId/tasks - Create a new task
 */
router.post('/projects/:projectId/tasks', async (req, res) => {
  try {
    const { projectId } = req.params;
    const taskData = {
      status: 'not_started',
      priority: 'medium',
      progress: 0,
      dependencies: [],
      ...req.body,
    };

    const newTask = await storage.createTask(parseInt(projectId), taskData);
    
    // Development logging removed
    res.status(201).json(newTask);
  } catch (error) {
    console.error('❌ Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

export default router;