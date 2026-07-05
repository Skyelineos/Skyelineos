// Role-based access control middleware.
//
// Used by the legacy /api/** route block in index.ts (and any newly-added
// routes) to enforce role checks on top of the outer authMiddleware gate.
//
// The `req.userProfile.role` field is populated by `authMiddleware` in
// index.ts via `resolveUserProfile()` — that reads from users/{uid}.role in
// Firestore (with a fallback to token claims), matching the pattern used by
// firestore.rules `getUserRole()`. Firestore is the single source of truth
// for roles; custom claims can drift on stale sessions.
//
// Role vocabulary (from index.ts admin/users/:uid/role validation):
//   admin | gc | projectManager | client | sub | designer | pending_gc
//
// Common aliases:
//   requireStaff   → admin, gc, projectManager       (project-operational staff)
//   requireGcOnly  → admin, gc                       (billing/settings/admin — PM excluded)
//   requireAdmin   → admin                           (role management, destructive)
//   requireFinance → admin, gc, projectManager       (invoices/expenses/change orders)
//     [same as staff — accountant role not yet defined; treat as staff for now]
//   requireBidsStaff → admin, gc, projectManager     (bid management is staff-operational)
//
// See docs/decisions.md §D-001 for why projectManager is included in GC-level
// project-operational access but excluded from billing/settings/admin.

import type { Request, Response, NextFunction } from 'express';

// Normalize any raw role string the same way the client/useRoleAccess does.
// Handles legacy variants like 'project_manager' or 'PM'.
export function normalizeRole(raw: unknown): string {
  const r = String(raw || '')
    .toLowerCase()
    .replace(/_/g, '');
  if (r === 'admin') return 'admin';
  if (r === 'gc') return 'gc';
  if (r === 'projectmanager' || r === 'pm') return 'projectManager';
  if (r === 'client') return 'client';
  if (r === 'sub' || r === 'subcontractor') return 'sub';
  if (r === 'designer') return 'designer';
  if (r === 'pendinggc') return 'pending_gc';
  return r;
}

/**
 * Factory: return middleware that allows only the given roles.
 *
 * Usage: `app.delete('/api/projects/:id', requireRole('admin', 'gc'), handler)`
 *
 * Depends on `authMiddleware` running earlier so `req.userProfile.role` is
 * populated. Rejects with 401 if unauthenticated (defense-in-depth), 403 if
 * the role isn't in the allow-list.
 */
export function requireRole(
  ...allowedRoles: string[]
): (req: any, res: Response, next: NextFunction) => void {
  const normalized = new Set(allowedRoles.map((r) => normalizeRole(r)));
  return (req: any, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.uid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const role = normalizeRole(req.userProfile?.role);
    if (!normalized.has(role)) {
      res
        .status(403)
        .json({ error: 'Insufficient permissions', requiredAny: allowedRoles });
      return;
    }
    // Stash the normalized role for downstream handlers.
    (req as any).userRole = role;
    next();
  };
}

// ── Convenience aliases ─────────────────────────────────────────────────────
// Prefer these over ad-hoc requireRole(...) calls so intent is obvious in
// index.ts and the allow-list stays consistent across the codebase.

/** admin + gc + projectManager — the default staff carve-out. */
export const requireStaff = requireRole('admin', 'gc', 'projectManager');

/** admin + gc only — billing, settings, role management, lock-break. */
export const requireGcOnly = requireRole('admin', 'gc');

/** admin only — destructive or role-changing operations. */
export const requireAdmin = requireRole('admin');

/**
 * Finance-adjacent routes (invoices, expenses, change-order approval).
 * Per the audit recommendation this maps to admin/gc/projectManager today
 * (no dedicated 'accountant' role exists yet in the role vocab). If an
 * accountant role is added later, extend this list in one place.
 */
export const requireFinance = requireRole('admin', 'gc', 'projectManager');

/** Bid management (create/edit/delete, award, PO send). */
export const requireBidsStaff = requireRole('admin', 'gc', 'projectManager');
