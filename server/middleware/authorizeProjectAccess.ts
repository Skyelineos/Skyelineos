import { Response, NextFunction } from 'express';
import { storage } from '../storage';
import type { AuthenticatedRequest, ProjectParticipant, UserRole } from '../../shared/auth-types';
import { normalizeRole, getRolePermissions } from '../../shared/auth-types';

// In-memory cache for project participants (60 second TTL)
interface CacheEntry {
  participants: ProjectParticipant[];
  timestamp: number;
}

const participantCache = new Map<string | number, CacheEntry>();
const CACHE_TTL = 60 * 1000; // 60 seconds

export async function getProjectParticipants(projectId: string | number): Promise<ProjectParticipant[]> {
  const cacheKey = projectId;
  const now = Date.now();
  
  // Check cache first
  const cached = participantCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    console.warn(`📋 Using cached participants for project ${projectId}`);
    return cached.participants;
  }

  const numericProjectId = typeof projectId === 'string' ? parseInt(projectId) : projectId;
  
  try {
    // Search/lookup operation
    
    // Get project data
    const project = await storage.getProject(numericProjectId);
    if (!project) {
      console.warn(`❌ Project ${projectId} not found`);
      return [];
    }

    const participants: ProjectParticipant[] = [];

    // Add project manager(s) - can access GC and admin portals
    if (project.projectManagerId) {
      const normalizedRole = normalizeRole('project_manager');
      participants.push({
        userId: project.projectManagerId,
        role: normalizedRole,
        permissions: getRolePermissions(normalizedRole)
      });
    }

    // Add client(s) - can only access client portal
    if (project.clientIds) {
      // Handle multiple client IDs stored as comma-separated string
      const clientIds = project.clientIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      for (const clientId of clientIds) {
        const normalizedRole = normalizeRole('client');
        participants.push({
          userId: clientId,
          role: normalizedRole,
          permissions: getRolePermissions(normalizedRole)
        });
      }
    }

    // Add assigned contacts based on their roles
    const allContacts = await storage.getAllContacts();
    const projectContacts = allContacts.filter((contact: any) => {
      // Check if contact is assigned to this project
      return contact.assignedProjects && contact.assignedProjects.includes(numericProjectId);
    });

    for (const contact of projectContacts) {
      const normalizedRole = normalizeRole(contact.role || 'client');
      participants.push({
        userId: contact.id,
        role: normalizedRole,
        permissions: getRolePermissions(normalizedRole)
      });
    }

    // Success operation completed
    
    // Cache the results
    participantCache.set(cacheKey, {
      participants,
      timestamp: now
    });
    
    return participants;
  } catch (error) {
    console.error('Error getting project participants:', error);
    return [];
  }
}

// Clear cache for a specific project (call when project participants change)
export function clearProjectParticipantCache(projectId: string | number): void {
  participantCache.delete(projectId);
  console.warn(`🗑️ Cleared participant cache for project ${projectId}`);
}

// Clear all cache (call on user role changes)
export function clearAllParticipantCache(): void {
  participantCache.clear();
  // Development logging removed
}

export async function authorizeProjectAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const user = req.user; // User is guaranteed to exist due to authenticateToken middleware
    
    // Admin users bypass all project-level restrictions
    if (user.role === 'admin') {
      // Success operation completed
      return next();
    }
    
    const projectId = req.params.projectId;
    
    if (!projectId) {
      // Development logging removed
      return res.status(400).json({ 
        error: 'Project ID required',
        code: 'MISSING_PROJECT_ID' 
      });
    }

    console.warn(`🔐 Checking project access for user ${user.id} (${user.role}) on project ${projectId}`);

    // Project Manager have access to all projects
    if (user.role === 'projectManager') {
      // Success operation completed
      // Add a synthetic project participant for consistency
      (req as any).projectParticipant = {
        userId: user.id,
        role: user.role,
        permissions: ['admin_portal', 'client_portal', 'subcontractor_portal', 'designer_portal']
      };
      return next();
    }

    // Get project participants (with caching) for other roles
    const participants = await getProjectParticipants(projectId);
    
    // Check if user has access to this project
    const userParticipant = participants.find(p => p.userId === user.id);
    
    if (!userParticipant) {
      console.warn(`🚫 Access denied: User ${user.id} (${user.role}) not authorized for project ${projectId}`);
      return res.status(403).json({ 
        error: 'Access denied: You are not authorized to access this project',
        code: 'PROJECT_ACCESS_DENIED',
        projectId,
        userId: user.id,
        userRole: user.role
      });
    }

    // Check portal-specific permissions if specified in request
    const requestedPortal = req.headers['x-portal-type'] as string;
    if (requestedPortal && !userParticipant.permissions.includes(requestedPortal)) {
      console.warn(`🚫 Portal access denied: User ${user.id} cannot access ${requestedPortal} for project ${projectId}`);
      return res.status(403).json({ 
        error: `Access denied: You are not authorized to access the ${requestedPortal}`,
        code: 'PORTAL_ACCESS_DENIED',
        requestedPortal,
        allowedPortals: userParticipant.permissions
      });
    }

    // Add project participant info to request for downstream use
    (req as any).projectParticipant = userParticipant;
    
    // Success operation completed
    next();
  } catch (error) {
    console.error('❌ Error in authorizeProjectAccess middleware:', error);
    res.status(500).json({ 
      error: 'Internal server error during authorization',
      code: 'AUTHORIZATION_ERROR'
    });
  }
}

// Middleware for specific portal access
export function requirePortalAccess(portalType: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Admin users bypass all portal access restrictions
    if (req.user.role === 'admin') {
      // Success operation completed
      return next();
    }
    
    const participant = (req as any).projectParticipant as ProjectParticipant | undefined;
    
    if (!participant || !participant.permissions.includes(portalType)) {
      console.warn(`🚫 Portal access denied: ${portalType} access required for user ${req.user.id}`);
      return res.status(403).json({ 
        error: `Access denied: ${portalType} access required`,
        code: 'PORTAL_ACCESS_REQUIRED',
        requiredPortal: portalType,
        allowedPortals: participant?.permissions || []
      });
    }
    
    // Success operation completed
    next();
  };
}

// Extend Express Request interface for project participant
declare global {
  namespace Express {
    interface Request {
      projectParticipant?: ProjectParticipant;
    }
  }
}