import { Request } from 'express';

export interface User {
  id: number;
  email: string;
  role: string;
  name?: string;
  permissions?: string[];
  projectIds?: number[];
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export type UserRole = 'admin' | 'project_manager' | 'client' | 'subcontractor' | 'designer' | 'accountant';

export function normalizeRole(role: string): UserRole {
  const roleMap: Record<string, UserRole> = {
    'admin': 'admin',
    'project_manager': 'project_manager',
    'projectManager': 'project_manager',
    'pm': 'project_manager',
    'client': 'client',
    'subcontractor': 'subcontractor',
    'sub': 'subcontractor',
    'designer': 'designer',
    'accountant': 'accountant'
  };
  
  return roleMap[role.toLowerCase()] || 'client';
}

export function getRolePermissions(role: UserRole): string[] {
  const permissions: Record<UserRole, string[]> = {
    admin: ['admin:*', 'project:*', 'user:*', 'financial:*'],
    project_manager: ['project:read', 'project:write', 'task:*', 'schedule:*'],
    client: ['project:read', 'estimate:read', 'invoice:read'],
    subcontractor: ['project:read', 'bid:write', 'po:read'],
    designer: ['project:read', 'design:*', 'document:write'],
    accountant: ['financial:*', 'invoice:*', 'report:*']
  };
  
  return permissions[role] || [];
}