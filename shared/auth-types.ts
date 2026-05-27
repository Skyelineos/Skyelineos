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

// Canonical UserRole. Per docs/decisions.md §D-001 + ROLE_AUDIT.md:
//   - `projectManager` is the canonical form (camelCase). Snake-case
//     `project_manager` was a historical artifact; normalizers map it forward.
//   - `accountant` was orphaned (no code wrote it) — removed; aliased to `gc`.
//   - `sub` is the canonical contractor role (matches Firestore rules); the
//     legacy `subcontractor` alias still normalizes to `sub`.
//   - `pending_gc` is the only pending state (no `pending_pm` per D-001-d).
//     The dead `pending_team` Cloud Function output is now mapped to `pending_gc`
//     so those users at least get the existing pending-approval screen.
export type UserRole =
  | 'admin'
  | 'gc'
  | 'projectManager'
  | 'pending_gc'
  | 'client'
  | 'sub'
  | 'designer';

/**
 * Normalize any legacy role string into the canonical UserRole.
 * Unknown inputs fall back to `client` (least-privileged role).
 *
 * Migration map (do not remove entries — these are historical aliases that
 * still appear on existing user docs and contact records):
 * - `project_manager`, `projectmanager`, `pm`           → `projectManager`
 * - `subcontractor`, `vendor`, `supplier`               → `sub`
 * - `homeowner`                                          → `client`
 * - `accountant`, `team`, `employee`                    → `gc` (closest meaningful role)
 * - `pending_team`                                       → `pending_gc`
 * - `other`                                              → `client` (fallback)
 */
export function normalizeRole(role: string): UserRole {
  const roleMap: Record<string, UserRole> = {
    'admin': 'admin',
    'gc': 'gc',
    // GC delegate
    'project_manager': 'projectManager',
    'projectmanager': 'projectManager',
    'projectManager': 'projectManager',
    'pm': 'projectManager',
    // Pending
    'pending_gc': 'pending_gc',
    'pending_team': 'pending_gc',
    // Client / homeowner
    'client': 'client',
    'homeowner': 'client',
    // Sub
    'sub': 'sub',
    'subcontractor': 'sub',
    'vendor': 'sub',
    'supplier': 'sub',
    // Designer
    'designer': 'designer',
    // Historical / orphaned — map to closest meaningful role
    'accountant': 'gc',
    'team': 'gc',
    'employee': 'gc',
    'other': 'client',
  };
  return roleMap[role.toLowerCase()] || 'client';
}

export function getRolePermissions(role: UserRole): string[] {
  const permissions: Record<UserRole, string[]> = {
    admin:          ['admin:*', 'project:*', 'user:*', 'financial:*'],
    gc:             ['project:*', 'user:read', 'financial:*'],
    // PM is GC's delegate for project-operational work — full project + sub + schedule,
    // read-only financial, NO write to billing/settings/role mgmt. Per docs/decisions.md §D-001.
    projectManager: ['project:read', 'project:write', 'task:*', 'schedule:*', 'sub:*', 'financial:read'],
    pending_gc:     [],
    client:         ['project:read', 'estimate:read', 'invoice:read'],
    sub:            ['project:read', 'bid:write', 'po:read'],
    designer:       ['project:read', 'design:*', 'document:write'],
  };
  return permissions[role] || [];
}
