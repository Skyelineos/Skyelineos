import { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../shared/auth-types';

interface AuditEvent {
  timestamp: string;
  userId?: number;
  userEmail?: string;
  userRole?: string;
  method: string;
  path: string;
  ip: string;
  userAgent?: string;
  statusCode?: number;
  responseTime?: number;
}

// In-memory audit log (in production, this would go to a proper logging service)
const auditLog: AuditEvent[] = [];
const MAX_LOG_SIZE = 10000; // Keep last 10k events in memory

export function auditLogger(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Only log write operations and important read operations
  const isAuditableOperation = 
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ||
    req.path.includes('/auth') ||
    req.path.includes('/admin');

  if (!isAuditableOperation) {
    return next();
  }

  // Capture original res.end to log when response completes
  const originalEnd = res.end;
  
  res.end = function(...args: any[]): Response {
    const responseTime = Date.now() - startTime;
    
    const auditEvent: AuditEvent = {
      timestamp: new Date().toISOString(),
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      responseTime
    };

    // Add to audit log
    auditLog.push(auditEvent);
    
    // Trim log if it gets too large
    if (auditLog.length > MAX_LOG_SIZE) {
      auditLog.splice(0, auditLog.length - MAX_LOG_SIZE);
    }

    // Log to console for development
    if (process.env.NODE_ENV === 'development') {
      // Development logging removed
    }

    // In production, send to logging service
    // await logService.sendAuditEvent(auditEvent);

    return (originalEnd as any).apply(this, args);
  };

  next();
}

// Function to get audit logs (for admin interface)
export function getAuditLogs(limit = 100, offset = 0): AuditEvent[] {
  return auditLog
    .slice(-limit - offset, offset > 0 ? -offset : undefined)
    .reverse();
}

// Function to get audit logs for a specific user
export function getUserAuditLogs(userId: number, limit = 100): AuditEvent[] {
  return auditLog
    .filter(event => event.userId === userId)
    .slice(-limit)
    .reverse();
}