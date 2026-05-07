import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { projects, estimates } from '../../shared/schema';
import { eq } from 'drizzle-orm';

// Extended Request interface to include user
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
    email: string;
  };
}

// Resource type mapping for database queries
const resourceQueries = {
  Project: {
    table: projects,
    idField: projects.id,
    ownerField: projects.clientId
  },
  Estimate: {
    table: estimates,
    idField: estimates.id,
    ownerField: estimates.projectId // Will need to join with projects
  }
};

/**
 * Middleware to authorize resource access based on ownership
 * @param resourceType - The type of resource (Project, Estimate, Schedule, Bid)
 * @param paramName - The URL parameter name containing the resource ID (defaults to 'id')
 */
export function authorizeResource(
  resourceType: keyof typeof resourceQueries,
  paramName: string = 'id'
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // Admin users have access to all resources
      if (req.user.role === 'admin') {
        return next();
      }

      const resourceId = parseInt(req.params[paramName]);
      if (isNaN(resourceId)) {
        return res.status(400).json({
          error: 'Invalid resource ID',
          code: 'INVALID_RESOURCE_ID'
        });
      }

      const query = resourceQueries[resourceType];
      if (!query) {
        return res.status(500).json({
          error: 'Unknown resource type',
          code: 'UNKNOWN_RESOURCE_TYPE'
        });
      }

      // For other resource types that don't require special handling
      if (resourceType !== 'Project' && resourceType !== 'Estimate') {
        // For now, allow access based on user role
        if (req.user.role === 'admin' || req.user.role === 'projectManager') {
          return next();
        }
        
        return res.status(403).json({
          error: 'Access denied - insufficient permissions',
          code: 'ACCESS_DENIED'
        });
      }

      // Special handling for Estimate resources (need to check project ownership)
      if (resourceType === 'Estimate') {
        const [estimate] = await db
          .select({
            projectId: estimates.projectId,
            clientId: projects.clientId
          })
          .from(estimates)
          .innerJoin(projects, eq(estimates.projectId, projects.id))
          .where(eq(estimates.id, resourceId));

        if (!estimate) {
          return res.status(404).json({
            error: 'Estimate not found',
            code: 'RESOURCE_NOT_FOUND'
          });
        }

        // Check if user owns the project or is project manager
        if (estimate.clientId !== req.user.id && req.user.role !== 'projectManager') {
          return res.status(403).json({
            error: 'Access denied - insufficient permissions',
            code: 'ACCESS_DENIED'
          });
        }

        return next();
      }

      // Standard resource ownership check
      const [resource] = await db
        .select()
        .from(query.table)
        .where(eq(query.idField, resourceId));

      if (!resource) {
        return res.status(404).json({
          error: `${resourceType} not found`,
          code: 'RESOURCE_NOT_FOUND'
        });
      }

      // Check ownership based on resource type
      let hasAccess = false;
      
      switch (resourceType) {
        case 'Project':
        case 'Estimate':
          hasAccess = resource.clientId === req.user.id || req.user.role === 'projectManager';
          break;
        case 'Bid':
          hasAccess = resource.subcontractorId === req.user.id || 
                     req.user.role === 'projectManager' || 
                     req.user.role === 'admin';
          break;
      }

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied - insufficient permissions',
          code: 'ACCESS_DENIED'
        });
      }

      next();
    } catch (error) {
      console.error(`Resource authorization error for ${resourceType}:`, error);
      res.status(500).json({
        error: 'Internal server error during authorization',
        code: 'AUTHORIZATION_ERROR'
      });
    }
  };
}

/**
 * Middleware to check if user can create resources of a specific type
 * @param resourceType - The type of resource being created
 */
export function authorizeResourceCreation(resourceType: keyof typeof resourceQueries) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // Admin can create anything
      if (req.user.role === 'admin') {
        return next();
      }

      // Role-based creation permissions
      const canCreate = {
        Project: ['admin', 'projectManager'].includes(req.user.role),
        Estimate: ['admin', 'projectManager'].includes(req.user.role),
        Schedule: ['admin', 'projectManager'].includes(req.user.role),
        Bid: ['subcontractor', 'admin', 'projectManager'].includes(req.user.role)
      };

      if (!canCreate[resourceType]) {
        return res.status(403).json({
          error: `Access denied - cannot create ${resourceType}`,
          code: 'CREATION_DENIED'
        });
      }

      next();
    } catch (error) {
      console.error(`Resource creation authorization error:`, error);
      res.status(500).json({
        error: 'Internal server error during creation authorization',
        code: 'CREATION_AUTHORIZATION_ERROR'
      });
    }
  };
}