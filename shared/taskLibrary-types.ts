// ─────────────────────────────────────────────────────────────────────────────
// Master Task Library & Project Task Template — shared types
//
// Skyeline OS treats the home-building process as an operating system, not a
// static checklist. There is ONE editable Master Task Library that the company
// maintains. When a project is created, the active master tasks are *copied*
// into that project as an independent project task list. Project edits never
// touch the master. At closeout, lessons learned can be promoted back into the
// master so the company's process improves with every home built.
//
// This file is the single source of truth for the data shapes and enums used by
// both the client (`@shared/taskLibrary-types`) and — mirrored — the Cloud
// Functions backend (`functions/src/taskLibrary/`). The functions build cannot
// import from `shared/` (its tsconfig only includes `src`), so the backend keeps
// a small parallel copy of the enums; keep the two in sync when editing.
//
// Firestore collections (all top-level, see firestore.rules):
//   masterTasks       — the library (templates). Admin-managed.
//   projectTasks      — per-project copies (independent). `projectId` field.
//   taskImprovements  — closeout suggestions awaiting admin approval. `projectId`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build phases, in lifecycle order. The numeric order drives grouping/sorting in
 * every board view. Adding a phase? Append it and bump callers that hardcode the
 * count — never reorder existing values (project tasks store the phase string).
 */
export const TASK_PHASES = [
  'Lead Capture & Qualification',
  'Preconstruction',
  'Procurement, Scheduling & Project Controls',
  'Site Prep & Foundation',
  'Framing & Dry-In',
  'MEP Rough, Inspections, Insulation & Drywall',
  'Finishes & Commissioning',
  'Punchlist, Closeout & Warranty',
] as const;

export type TaskPhase = (typeof TASK_PHASES)[number];

/** Stable phase ordering helper — used for grouped board sorts. */
export const PHASE_ORDER: Record<TaskPhase, number> = TASK_PHASES.reduce(
  (acc, phase, i) => {
    acc[phase] = i;
    return acc;
  },
  {} as Record<TaskPhase, number>,
);

/**
 * Roles a task can recommend / be assigned to. These intentionally extend the
 * app's auth roles with construction-operational roles (estimator,
 * superintendent, inspector, vendor) that aren't login roles but describe *who
 * does the work*. Stored as plain strings so the list can grow without a
 * migration.
 */
export const TASK_ROLES = [
  'admin',
  'gc',
  'projectManager',
  'estimator',
  'superintendent',
  'designer',
  'client',
  'subcontractor',
  'inspector',
  'vendor',
] as const;

export type TaskRole = (typeof TASK_ROLES)[number] | string;

/** Project task lifecycle states (spec §2). */
export const PROJECT_TASK_STATUSES = [
  'Not Started',
  'Ready',
  'Blocked',
  'In Progress',
  'Waiting on Client',
  'Waiting on Subcontractor',
  'Waiting on Inspection',
  'Complete',
  'Skipped',
  'Needs Review',
] as const;

export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUSES)[number];

/** Statuses that count as "open" (not done / not skipped) for progress math. */
export const OPEN_TASK_STATUSES: ProjectTaskStatus[] = [
  'Not Started',
  'Ready',
  'Blocked',
  'In Progress',
  'Waiting on Client',
  'Waiting on Subcontractor',
  'Waiting on Inspection',
  'Needs Review',
];

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export type RiskLevel = 'low' | 'medium' | 'high';
export const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high'];

export type InspectionStatus =
  | 'not_required'
  | 'not_scheduled'
  | 'scheduled'
  | 'passed'
  | 'failed';

export const INSPECTION_STATUSES: InspectionStatus[] = [
  'not_required',
  'not_scheduled',
  'scheduled',
  'passed',
  'failed',
];

/**
 * Curated tag vocabulary. Tags drive the "optional task group selector" at
 * generation time and the master filters. Free-form tags are allowed too, but
 * these are the first-class, suggested ones for a custom-home builder.
 */
export const SUGGESTED_TAGS = [
  'hillside',
  'basement',
  'pool',
  'septic',
  'well',
  'HOA',
  'ADU',
  'luxury finishes',
  'elevator',
  'detached garage',
  'complex excavation',
  'retaining wall',
  'long-lead custom windows',
  'solar',
  'radon',
  'smart home',
  'snow load',
  'fire sprinklers',
] as const;

export type SuggestedTag = (typeof SUGGESTED_TAGS)[number];

// ── A single acceptance-criterion item ──────────────────────────────────────
// On master tasks `done` is always false (it's a template). On project tasks it
// tracks completion. Quality-gate tasks require every criterion `done` before
// the task may be marked Complete.
export interface AcceptanceCriterion {
  id: string;
  text: string;
  done: boolean;
}

// ── Master Task (template) ───────────────────────────────────────────────────
export interface MasterTask {
  id: string;
  taskCode: string; // stable, human-readable key e.g. "PRE-010". Unique in library.
  title: string;
  description: string;
  phase: TaskPhase;
  recommendedRole: TaskRole;
  defaultAssigneeRole: TaskRole;
  defaultDurationDays: number;
  /** Days after phase/project start this task is suggested to begin. */
  suggestedStartOffset: number;
  /** taskCodes this task depends on (must finish first). */
  dependencies: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  requiredPhotos: number;
  requiredDocuments: string[];
  inspectionRequired: boolean;
  drawMilestoneRelevant: boolean;
  clientVisible: boolean;
  subcontractorVisible: boolean;
  isRequired: boolean;
  isOptional: boolean;
  tags: string[];
  /** Free-text condition describing when this task applies (e.g. "basement homes"). */
  appliesWhen: string;
  riskLevel: RiskLevel;
  /** Quality gate: completion requires acceptance-criteria confirmation. */
  qualityGate: boolean;
  /** Sort order within its phase. */
  order: number;
  createdAt: any;
  updatedAt: any;
  /** Soft-delete. Archived tasks are NEVER copied into new projects. */
  archivedAt: any | null;
  /** Bumped on every edit; project copies record the version they used. */
  version: number;
  /** If this task originated from a project's lessons-learned, the source project. */
  sourceProjectId: string | null;
  /** Admin notes captured when promoting an improvement into the library. */
  improvementNotes: string;
}

// ── Project Task (independent copy) ──────────────────────────────────────────
export interface ProjectTask {
  id: string;
  projectId: string;
  /** Origin master task. null for tasks added custom on the project. */
  masterTaskId: string | null;
  /** Master `version` at copy time (provenance / future "apply master update"). */
  masterVersionUsed: number | null;
  taskCode: string;
  title: string;
  description: string;
  phase: TaskPhase;
  assignedRole: TaskRole;
  assignedUserId: string | null;
  assignedSubcontractorId: string | null;
  status: ProjectTaskStatus;
  priority: TaskPriority;
  startDate: string | null; // ISO date
  dueDate: string | null; // ISO date
  completedAt: any | null;
  dependencies: string[]; // taskCodes within this project
  acceptanceCriteria: AcceptanceCriterion[];
  requiredPhotos: number;
  uploadedPhotos: TaskAttachment[];
  requiredDocuments: string[];
  uploadedDocuments: TaskAttachment[];
  inspectionRequired: boolean;
  inspectionStatus: InspectionStatus;
  drawMilestoneRelevant: boolean;
  clientVisible: boolean;
  subcontractorVisible: boolean;
  projectSpecificNotes: string;
  /** Required when a (required) task is skipped or materially changed. */
  changeReason: string;
  /** True if added directly on the project (no master origin). */
  isCustomTask: boolean;
  qualityGate: boolean;
  riskLevel: RiskLevel;
  tags: string[];
  order: number;

  // ── Future-integration link fields (see spec §3 + §9) ──────────────────────
  // These let a task reference other modules without a migration when those
  // modules wire in. Null until connected.
  inspectionId?: string | null; // → inspections module
  drawRequestId?: string | null; // → draw / payment module
  changeOrderId?: string | null; // → change order module
  clientSelectionId?: string | null; // → designer selection portal
  subcontractorId?: string | null; // → subcontractor portal (assigned sub)
  warrantyItemId?: string | null; // → warranty module
  scheduleTaskId?: string | null; // → Gantt schedule

  createdAt: any;
  updatedAt: any;
}

export interface TaskAttachment {
  name: string;
  url: string;
  uploadedAt?: any;
  uploadedBy?: string;
}

// ── Closeout improvement suggestion ──────────────────────────────────────────
// Generated by the closeout analysis pass; reviewed by an admin who chooses an
// action. NEVER auto-applied to the master.
export type ImprovementKind =
  | 'custom_task_added'
  | 'frequently_skipped'
  | 'delayed'
  | 'caused_change_order'
  | 'blocked'
  | 'missing_acceptance_criteria'
  | 'extra_photos_docs'
  | 'warranty_issue';

export type ImprovementStatus = 'pending' | 'approved' | 'rejected' | 'deferred';

export type ImprovementAction =
  | 'add_new_master_task'
  | 'update_existing_master_task'
  | 'add_tag'
  | 'add_acceptance_criteria'
  | 'add_required_photo_doc'
  | 'mark_optional'
  | 'mark_required'
  | 'reject'
  | 'note_for_review';

export interface TaskImprovement {
  id: string;
  projectId: string;
  projectName?: string;
  kind: ImprovementKind;
  /** The project task that triggered this suggestion (if any). */
  projectTaskId: string | null;
  /** The master task this suggestion would update (if any). */
  masterTaskId: string | null;
  taskCode: string | null;
  title: string;
  /** Human-readable explanation of what was observed. */
  summary: string;
  /** Structured payload the admin can apply (tag string, criterion text, etc.). */
  suggestedData?: Record<string, any>;
  status: ImprovementStatus;
  /** Chosen action when approved/rejected. */
  resolutionAction?: ImprovementAction | null;
  adminNote?: string;
  resolvedAt?: any | null;
  resolvedByUid?: string | null;
  createdAt: any;
  updatedAt: any;
}

// ── Generation request (client → API) ───────────────────────────────────────
export interface GenerateTasksRequest {
  /** Optional tag groups to INCLUDE. Optional tasks whose tags don't intersect
   *  this set are skipped. Required tasks are always included. Empty = required
   *  tasks + untagged optional tasks only. */
  includeTags?: string[];
  /** Include ALL optional tasks regardless of tags. */
  includeAllOptional?: boolean;
}

export interface GeneratePreview {
  masterVersionLabel: string; // e.g. "library snapshot @ 2026-06-14"
  totalActive: number;
  byPhase: { phase: TaskPhase; required: number; optional: number; selected: number }[];
  selectedTotal: number;
  alreadyGenerated: boolean;
  existingCount: number;
}

// ── UI helper maps ───────────────────────────────────────────────────────────
export const STATUS_BADGE_CLASS: Record<ProjectTaskStatus, string> = {
  'Not Started': 'bg-gray-100 text-gray-700 border-gray-200',
  Ready: 'bg-blue-100 text-blue-700 border-blue-200',
  Blocked: 'bg-red-100 text-red-700 border-red-200',
  'In Progress': 'bg-amber-100 text-amber-800 border-amber-200',
  'Waiting on Client': 'bg-purple-100 text-purple-700 border-purple-200',
  'Waiting on Subcontractor': 'bg-orange-100 text-orange-700 border-orange-200',
  'Waiting on Inspection': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  Complete: 'bg-green-100 text-green-700 border-green-200',
  Skipped: 'bg-gray-200 text-gray-500 border-gray-300 line-through',
  'Needs Review': 'bg-yellow-100 text-yellow-800 border-yellow-200',
};

export const PRIORITY_BADGE_CLASS: Record<TaskPriority, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

/** Statuses that require a `changeReason` to enter. */
export const STATUSES_REQUIRING_REASON: ProjectTaskStatus[] = ['Skipped'];

export function isPhase(value: string): value is TaskPhase {
  return (TASK_PHASES as readonly string[]).includes(value);
}
