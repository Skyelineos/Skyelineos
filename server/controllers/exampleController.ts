import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { AppError, ErrorTypes, catchAsync, createApiResponse } from '../middleware/errorHandler';

/**
 * Example controller demonstrating proper error handling and logging
 */

// Example of async controller with error handling
export const getProjects = catchAsync(async (req: Request & { id?: string }, res: Response, next: NextFunction) => {
  const requestLogger = (req as any).logger || logger;
  
  try {
    requestLogger.info('Fetching projects', { 
      userId: (req as any).user?.id,
      filters: req.query 
    });
    
    // Simulate database operation
    const projects = [
      { id: 1, name: 'Project A', status: 'active' },
      { id: 2, name: 'Project B', status: 'completed' }
    ];
    
    requestLogger.debug('Projects fetched successfully', { 
      count: projects.length 
    });
    
    res.json(createApiResponse(projects, 'Projects fetched successfully', {
      total: projects.length,
      page: 1
    }));
    
  } catch (error) {
    requestLogger.error('Failed to fetch projects', { 
      error: (error as Error).message,
      ...(process.env.NODE_ENV !== 'production' && { stack: (error as Error).stack })
    });
    
    // Pass error to error handler middleware
    next(ErrorTypes.DATABASE_ERROR('Failed to fetch projects from database'));
  }
});

// Example of validation error
export const createProject = catchAsync(async (req: Request & { id?: string }, res: Response, next: NextFunction) => {
  const requestLogger = (req as any).logger || logger;
  const { name, description, budget } = req.body;
  
  // Manual validation example (normally handled by express-validator)
  if (!name || name.length < 3) {
    requestLogger.warn('Project creation failed - invalid name', { 
      providedName: name,
      userId: (req as any).user?.id 
    });
    
    return next(ErrorTypes.VALIDATION_ERROR('Project name must be at least 3 characters long', {
      field: 'name',
      value: name,
      requirement: 'min_length_3'
    }));
  }
  
  if (budget && (isNaN(budget) || budget < 0)) {
    return next(ErrorTypes.VALIDATION_ERROR('Budget must be a positive number', {
      field: 'budget',
      value: budget
    }));
  }
  
  try {
    requestLogger.info('Creating new project', { 
      name, 
      description,
      budget,
      userId: (req as any).user?.id 
    });
    
    // Simulate project creation
    const newProject = {
      id: Date.now(),
      name,
      description,
      budget,
      status: 'planning',
      createdAt: new Date().toISOString()
    };
    
    requestLogger.info('Project created successfully', { 
      projectId: newProject.id,
      name: newProject.name 
    });
    
    res.status(201).json(createApiResponse(newProject, 'Project created successfully'));
    
  } catch (error) {
    requestLogger.error('Project creation failed', { 
      error: (error as Error).message,
      projectData: { name, description, budget }
    });
    
    next(ErrorTypes.DATABASE_ERROR('Failed to create project'));
  }
});

// Example of authorization error
export const deleteProject = catchAsync(async (req: Request & { id?: string }, res: Response, next: NextFunction) => {
  const requestLogger = (req as any).logger || logger;
  const projectId = parseInt(req.params.id);
  
  // Check if user has permission (example)
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    requestLogger.warn('Unauthorized project deletion attempt', { 
      projectId,
      userId: user?.id,
      userRole: user?.role 
    });
    
    return next(ErrorTypes.AUTHORIZATION_ERROR('Only administrators can delete projects'));
  }
  
  if (isNaN(projectId)) {
    return next(ErrorTypes.VALIDATION_ERROR('Invalid project ID', {
      field: 'id',
      value: req.params.id
    }));
  }
  
  try {
    requestLogger.info('Deleting project', { 
      projectId,
      userId: user.id 
    });
    
    // Simulate project deletion
    const deleted = true; // await projectService.delete(projectId);
    
    if (!deleted) {
      return next(ErrorTypes.NOT_FOUND('Project'));
    }
    
    requestLogger.info('Project deleted successfully', { projectId });
    
    res.json(createApiResponse(null, 'Project deleted successfully'));
    
  } catch (error) {
    requestLogger.error('Project deletion failed', { 
      error: (error as Error).message,
      projectId 
    });
    
    next(ErrorTypes.DATABASE_ERROR('Failed to delete project'));
  }
});

// Example of external service error
export const syncProjectData = catchAsync(async (req: Request & { id?: string }, res: Response, next: NextFunction) => {
  const requestLogger = (req as any).logger || logger;
  const projectId = parseInt(req.params.id);
  
  try {
    requestLogger.info('Starting project data sync', { projectId });
    
    // Simulate external API call
    const startTime = Date.now();
    
    // Simulate external service failure
    if (Math.random() > 0.7) {
      const duration = Date.now() - startTime;
      requestLogger.error('External service call failed', {
        service: 'project-sync-api',
        projectId,
        duration: `${duration}ms`,
        error: 'Connection timeout'
      });
      
      return next(ErrorTypes.EXTERNAL_SERVICE_ERROR('Project Sync API', 'Service temporarily unavailable'));
    }
    
    const duration = Date.now() - startTime;
    requestLogger.debug('External service call completed', {
      service: 'project-sync-api',
      projectId,
      duration: `${duration}ms`,
      status: 'success'
    });
    
    res.json(createApiResponse({ synced: true }, 'Project data synchronized successfully'));
    
  } catch (error) {
    requestLogger.error('Project sync failed', { 
      error: (error as Error).message,
      projectId 
    });
    
    next(ErrorTypes.EXTERNAL_SERVICE_ERROR('Project Sync API'));
  }
});

// Example of manual error throwing
export const processProjectData = catchAsync(async (req: Request & { id?: string }, res: Response, next: NextFunction) => {
  const requestLogger = (req as any).logger || logger;
  
  try {
    // Business logic that might fail
    const data = req.body;
    
    if (!data || Object.keys(data).length === 0) {
      throw new AppError('No data provided for processing', 400, 'NO_DATA');
    }
    
    // Simulate processing
    requestLogger.info('Processing project data', { 
      dataKeys: Object.keys(data),
      userId: (req as any).user?.id 
    });
    
    // Success response
    res.json(createApiResponse({ processed: true }, 'Data processed successfully'));
    
  } catch (error) {
    // Custom errors are automatically handled by error middleware
    if (error instanceof AppError) {
      return next(error);
    }
    
    // Unexpected errors
    requestLogger.error('Unexpected error in data processing', { 
      error: (error as Error).message,
      ...(process.env.NODE_ENV !== 'production' && { stack: (error as Error).stack })
    });
    
    next(new AppError('Data processing failed', 500, 'PROCESSING_ERROR'));
  }
});