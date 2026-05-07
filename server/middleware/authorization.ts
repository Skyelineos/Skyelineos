import { Request, Response, NextFunction } from 'express';

export type UserRole = 'admin' | 'projectManager' | 'client' | 'subcontractor' | 'designer' | 'accountant';

export interface Permission {
  resource: string;
  action: string;
  condition?: (req: Request) => boolean;
}

/**
 * Role-based access control permissions matrix
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    // Admin has full access to everything
    { resource: '*', action: '*' }
  ],
  
  projectManager: [
    // Project management
    { resource: 'projects', action: 'create' },
    { resource: 'projects', action: 'read' },
    { resource: 'projects', action: 'update' },
    { resource: 'projects', action: 'delete' },
    
    // Estimates
    { resource: 'estimates', action: 'create' },
    { resource: 'estimates', action: 'read' },
    { resource: 'estimates', action: 'update' },
    { resource: 'estimates', action: 'approve' },
    
    // Bids
    { resource: 'bids', action: 'create' },
    { resource: 'bids', action: 'read' },
    { resource: 'bids', action: 'update' },
    { resource: 'bids', action: 'award' },
    
    // Tasks and scheduling
    { resource: 'tasks', action: 'create' },
    { resource: 'tasks', action: 'read' },
    { resource: 'tasks', action: 'update' },
    { resource: 'tasks', action: 'delete' },
    
    // Purchase orders
    { resource: 'purchase-orders', action: 'create' },
    { resource: 'purchase-orders', action: 'read' },
    { resource: 'purchase-orders', action: 'update' },
    
    // Contacts
    { resource: 'contacts', action: 'create' },
    { resource: 'contacts', action: 'read' },
    { resource: 'contacts', action: 'update' },
    { resource: 'contacts', action: 'delete' },
    
    // Messaging
    { resource: 'messaging', action: 'create' },
    { resource: 'messaging', action: 'read' },
    
    // Financial data
    { resource: 'financials', action: 'read' },
    { resource: 'financials', action: 'update' },
    
    // Invoices
    { resource: 'invoices', action: 'create' },
    { resource: 'invoices', action: 'read' },
    { resource: 'invoices', action: 'update' }
  ],
  
  client: [
    // Clients can only view their own projects and approve estimates
    { 
      resource: 'projects', 
      action: 'read',
      condition: (req) => req.user?.clientProjects?.includes(parseInt(req.params.projectId))
    },
    { 
      resource: 'estimates', 
      action: 'read',
      condition: (req) => req.user?.clientProjects?.includes(parseInt(req.params.projectId))
    },
    { 
      resource: 'estimates', 
      action: 'approve',
      condition: (req) => req.user?.clientProjects?.includes(parseInt(req.params.projectId))
    },
    { 
      resource: 'messaging', 
      action: 'create',
      condition: (req) => req.user?.clientProjects?.includes(parseInt(req.params.projectId))
    },
    { 
      resource: 'messaging', 
      action: 'read',
      condition: (req) => req.user?.clientProjects?.includes(parseInt(req.params.projectId))
    },
    {
      resource: 'documents',
      action: 'read',
      condition: (req) => req.user?.clientProjects?.includes(parseInt(req.params.projectId))
    }
  ],
  
  subcontractor: [
    // Subcontractors can bid and manage their work
    { resource: 'bids', action: 'create' },
    { resource: 'bids', action: 'read' },
    { resource: 'bids', action: 'update' },
    { resource: 'purchase-orders', action: 'read' },
    { resource: 'purchase-orders', action: 'sign' },
    { resource: 'invoices', action: 'create' },
    { resource: 'invoices', action: 'read' },
    { resource: 'messaging', action: 'create' },
    { resource: 'messaging', action: 'read' },
    { resource: 'tasks', action: 'read' },
    { resource: 'tasks', action: 'update' } // Only status updates
  ],
  
  designer: [
    // Designers can manage design-related content
    { resource: 'projects', action: 'read' },
    { resource: 'documents', action: 'create' },
    { resource: 'documents', action: 'read' },
    { resource: 'documents', action: 'update' },
    { resource: 'messaging', action: 'create' },
    { resource: 'messaging', action: 'read' }
  ],
  
  accountant: [
    // Accountants manage financial aspects
    { resource: 'financials', action: 'read' },
    { resource: 'financials', action: 'update' },
    { resource: 'invoices', action: 'create' },
    { resource: 'invoices', action: 'read' },
    { resource: 'invoices', action: 'update' },
    { resource: 'invoices', action: 'approve' },
    { resource: 'purchase-orders', action: 'read' },
    { resource: 'projects', action: 'read' },
    { resource: 'contacts', action: 'read' }
  ]
};

/**
 * Middleware to check if user has required permission for the endpoint
 */
export function requirePermission(resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user.role as UserRole;
    if (!userRole) {
      return res.status(403).json({ error: 'User role not defined' });
    }

    // Admin users bypass all permission checks
    if (userRole === 'admin') {
      // Success operation completed
      return next();
    }

    if (hasPermission(req.user, resource, action, req)) {
      // Success operation completed
      return next();
    }

    console.warn(`❌ Permission denied: ${userRole} cannot ${action} ${resource}`);
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      required: `${action} ${resource}`,
      userRole
    });
  };
}

/**
 * Check if user has specific permission
 */
export function hasPermission(user: any, resource: string, action: string, req?: Request): boolean {
  const userRole = user.role as UserRole;
  const permissions = ROLE_PERMISSIONS[userRole];
  
  if (!permissions) {
    return false;
  }

  // Check for wildcard admin permissions
  const adminPermission = permissions.find(p => p.resource === '*' && p.action === '*');
  if (adminPermission) {
    return true;
  }

  // Check for specific permission
  const permission = permissions.find(p => 
    (p.resource === resource || p.resource === '*') && 
    (p.action === action || p.action === '*')
  );

  if (!permission) {
    return false;
  }

  // Check condition if present
  if (permission.condition && req) {
    return permission.condition(req);
  }

  return true;
}

/**
 * Middleware to ensure user can only access their own client projects
 */
export function requireClientProjectAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Admin and PM have access to all projects
  if (['admin', 'projectManager'].includes(req.user.role)) {
    return next();
  }

  // For clients, check if they have access to this project
  if (req.user.role === 'client') {
    const projectId = parseInt(req.params.projectId || req.params.id || req.body?.projectId);
    
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID required' });
    }

    if (!req.user.clientProjects?.includes(projectId)) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }
  }

  return next();
}

/**
 * Middleware to ensure subcontractors can only access their own data
 */
export function requireSubcontractorAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Admin and PM have access to all subcontractor data
  if (['admin', 'projectManager'].includes(req.user.role)) {
    return next();
  }

  // For subcontractors, ensure they can only access their own data
  if (req.user.role === 'subcontractor') {
    const targetSubcontractorId = parseInt(req.params.subcontractorId || req.body?.subcontractorId);
    
    if (targetSubcontractorId && targetSubcontractorId !== req.user.contactId) {
      return res.status(403).json({ error: 'Access denied to other subcontractor data' });
    }
  }

  return next();
}

/**
 * Role-specific middleware generators
 */
export const requireAdmin = () => requirePermission('admin', 'access');
export const requireProjectManager = () => requirePermission('projects', 'manage');
export const requireClientAccess = () => requireClientProjectAccess;
export const requireSubcontractorSelfAccess = () => requireSubcontractorAccess;

/**
 * Check if user can perform action on specific project
 */
export function canAccessProject(user: any, projectId: number): boolean {
  // Admin and PM can access all projects
  if (['admin', 'projectManager'].includes(user.role)) {
    return true;
  }

  // Clients can only access their assigned projects
  if (user.role === 'client') {
    return user.clientProjects?.includes(projectId) || false;
  }

  // Subcontractors can access projects they're working on
  if (user.role === 'subcontractor') {
    return user.assignedProjects?.includes(projectId) || false;
  }

  // Designers can access projects they're assigned to
  if (user.role === 'designer') {
    return user.designProjects?.includes(projectId) || false;
  }

  return false;
}

/**
 * Get list of project IDs user can access
 */
export function getUserAccessibleProjects(user: any): number[] {
  // Admin and PM can access all projects
  if (['admin', 'projectManager'].includes(user.role)) {
    return []; // Empty array means all projects
  }

  // Return role-specific project lists
  switch (user.role) {
    case 'client':
      return user.clientProjects || [];
    case 'subcontractor':
      return user.assignedProjects || [];
    case 'designer':
      return user.designProjects || [];
    case 'accountant':
      return []; // Accountants can see financial data for all projects
    default:
      return [];
  }
}