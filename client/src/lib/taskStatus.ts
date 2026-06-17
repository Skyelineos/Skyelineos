/**
 * Task status — single source of truth.
 *
 * Two-phase signoff flow (per docs/Skyelineos_CTO_Audit_2026-06-16.md §7):
 *
 *   pending/todo  →  in_progress  →  awaiting_signoff  →  done
 *                                          │
 *                                          └─ (reject) →  in_progress
 *
 * - 'todo'              — assigned, not started
 * - 'in_progress'       — sub is actively working it
 * - 'awaiting_signoff'  — sub submitted "ready for review"; GC/PM/admin must approve
 * - 'done'              — GC/PM/admin approved; sign-off recorded in subcollection
 * - 'blocked'           — orthogonal flag, not part of the linear flow
 *
 * BACKWARD COMPATIBILITY:
 *   Tasks already at 'done' before this rollout stay 'done' — no migration.
 *   The signoff flow only applies to tasks transitioning FORWARD from now on.
 *
 * NOTE: the canonical Firestore collection for tasks the live UI reads/writes
 * is `tasks/` (see Tasks.tsx, SubcontractorPortal.tsx, FastDashboardCards,
 * GCTodayFeed, etc.). The legacy `projectTasks/` collection is used only by
 * ProjectBuildPlan + ProjectCloseout and is NOT touched by this flow.
 * The dual-store ambiguity is called out in audit §6.3; not in scope today.
 */

export type TaskStatus = 'todo' | 'in_progress' | 'awaiting_signoff' | 'done' | 'blocked';

export const ALL_TASK_STATUSES: TaskStatus[] = [
  'todo',
  'in_progress',
  'awaiting_signoff',
  'done',
  'blocked',
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  awaiting_signoff: 'Awaiting sign-off',
  done: 'Done',
  blocked: 'Blocked',
};

// Tailwind classes for status badges. Amber for awaiting_signoff signals
// "needs your attention" without being alarming.
export const TASK_STATUS_BADGE_CLASSES: Record<TaskStatus, string> = {
  todo: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  awaiting_signoff: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
};

export function statusBadgeClass(status: TaskStatus | string): string {
  return TASK_STATUS_BADGE_CLASSES[status as TaskStatus] || 'bg-gray-100 text-gray-700';
}

export function statusLabel(status: TaskStatus | string): string {
  return TASK_STATUS_LABELS[status as TaskStatus] || String(status).replace(/_/g, ' ');
}

/** Normalize legacy status spellings ('complete' / 'completed' / 'Scheduled') into the new enum. */
export function normalizeTaskStatus(raw: string | undefined | null): TaskStatus {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'complete' || s === 'completed' || s === 'done') return 'done';
  if (s === 'awaiting_signoff' || s === 'awaiting-signoff' || s === 'awaiting signoff') return 'awaiting_signoff';
  if (s === 'in_progress' || s === 'in progress') return 'in_progress';
  if (s === 'blocked') return 'blocked';
  if (s === 'todo' || s === 'pending' || s === 'scheduled' || s === '') return 'todo';
  return 'todo';
}
