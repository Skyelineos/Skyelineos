// Designer Portal — shared types + constants.
//
// Project-scoped, room-by-room design collaboration. Built on the existing
// Firestore conventions used by `rooms`, `selections`, `channels`, and `rfis`
// subcollections under `projects/{projectId}/...`. New collaboration data lives
// in two NEW subcollections — `moodBoards` and `designDecisions` — plus a
// `designFiles` library; selections REUSE the existing `selections` collection
// (the new spec fields are additive/optional so the client portal keeps working).

import type { Timestamp } from 'firebase/firestore';

// ── Project-level design status ──────────────────────────────────────────────
export const DESIGN_STATUSES = [
  'Not Started',
  'In Progress',
  'Client Review',
  'Revision Required',
  'Approved',
] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

// ── Default room navigation ──────────────────────────────────────────────────
// "General Design" is a virtual room (id GENERAL_ROOM_ID) that is never stored —
// it holds project-wide design content not tied to a physical room. The rest are
// seeded on demand into the existing `projects/{id}/rooms` subcollection via the
// "Add standard design rooms" action, so we never auto-pollute a project's rooms.
export const GENERAL_ROOM_ID = 'general';
export const GENERAL_ROOM_NAME = 'General Design';

export const DEFAULT_ROOMS: string[] = [
  'Kitchen',
  'Pantry',
  'Great Room',
  'Dining Room',
  'Primary Bedroom',
  'Primary Bath',
  'Powder Bath',
  'Secondary Bedrooms',
  'Secondary Baths',
  'Laundry',
  'Mudroom',
  'Office',
  'Basement',
  'Exterior',
  'Landscaping',
  'Lighting',
  'Flooring',
  'Paint',
];

// Mirrors the existing Room shape in `client/src/lib/estimates/selections.ts`.
export interface DesignerRoom {
  id: string;
  projectId?: string;
  name: string;
  floor?: string;
  roomType?: string;
  sqft?: number | null;
  notes?: string | null;
  order: number;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
  /** Stamped on rooms created by the Designer Portal "standard rooms" seeder. */
  designerSeeded?: boolean;
}

// ── Mood boards ──────────────────────────────────────────────────────────────
export const MOODBOARD_CATEGORIES = [
  'Flooring',
  'Tile',
  'Cabinetry',
  'Countertops',
  'Lighting',
  'Plumbing Fixtures',
  'Appliances',
  'Hardware',
  'Paint',
  'Millwork',
  'Furniture',
  'Decor',
  'Exterior Materials',
  'Landscaping',
  'Custom',
] as const;
export type MoodBoardCategory = (typeof MOODBOARD_CATEGORIES)[number];

export const MOODBOARD_STATUSES = [
  'Draft',
  'Ready For Review',
  'Client Review',
  'Approved',
  'Revision Requested',
] as const;
export type MoodBoardStatus = (typeof MOODBOARD_STATUSES)[number];

export const ITEM_APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'needsRevision',
] as const;
export type ItemApprovalStatus = (typeof ITEM_APPROVAL_STATUSES)[number];

export interface MoodBoardItem {
  id: string;
  category: MoodBoardCategory | string;
  title: string;
  imageUrl?: string;
  productUrl?: string;
  vendorUrl?: string;
  specSheetUrl?: string;
  vendor?: string;
  manufacturer?: string;
  sku?: string;
  price?: number;
  notes?: string;
  linkedSelectionId?: string;
  approvalStatus: ItemApprovalStatus;
}

export interface MoodBoard {
  id: string;
  projectId: string;
  roomId: string;
  roomName?: string;
  title: string;
  designDirection?: string;
  status: MoodBoardStatus;
  items: MoodBoardItem[];
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: Timestamp | any;
  revisionNotes?: string;
}

// ── Selections (additive extension of the existing `selections` model) ───────
export const SELECTION_DESIGN_STATUSES = [
  'notStarted',
  'inReview',
  'approved',
  'ordered',
  'installed',
] as const;
export type SelectionDesignStatus = (typeof SELECTION_DESIGN_STATUSES)[number];

// Future schedule milestones a selection can gate (data hook only — schedule
// logic is intentionally NOT rebuilt here).
export const SELECTION_MILESTONES = [
  'Cabinets Ordered',
  'Tile Selection Complete',
  'Flooring Selection Complete',
  'Lighting Selection Complete',
  'Plumbing Fixture Selection Complete',
] as const;

// Only the fields the Designer Portal reads/writes. The underlying doc carries
// the full legacy Selection shape too; these are additive optional fields.
export interface DesignSelection {
  id: string;
  projectId?: string;
  roomId?: string;
  room?: string;
  category?: string;
  itemName?: string;
  vendor?: string;
  productUrl?: string;
  vendorUrl?: string;
  specSheetUrl?: string;
  imageUrl?: string;
  allowanceAmount?: number;
  selectedAmount?: number;
  varianceAmount?: number;
  /** Designer-portal status taxonomy. Legacy clientApprovalStatus is kept in sync. */
  designStatus?: SelectionDesignStatus;
  clientApprovalStatus?: string; // legacy field, kept in sync for the client portal
  clientApprovalRequired?: boolean;
  designerApprovalRequired?: boolean;
  dueDate?: Timestamp | any;
  approvedAt?: Timestamp | any;
  approvedBy?: string;
  notes?: string;
  isCustom?: boolean;
  isTBD?: boolean;
  isNotApplicable?: boolean;
  linkVerified?: boolean;
  lastVerifiedAt?: Timestamp | any;
  timelineImpact?: string;
  requiredBeforeTrade?: string;
  linkedScheduleMilestone?: string;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

/** A selection may advance to inReview/approved only when it has a real spec hook. */
export function selectionHasRequiredLink(s: Partial<DesignSelection>): boolean {
  return Boolean(
    s.productUrl || s.specSheetUrl || s.isCustom || s.isTBD || s.isNotApplicable
  );
}

export function computeVariance(s: Partial<DesignSelection>): number {
  return (Number(s.selectedAmount) || 0) - (Number(s.allowanceAmount) || 0);
}

// ── Decisions ────────────────────────────────────────────────────────────────
export const DECISION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'needsRevision',
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export interface DesignDecision {
  id: string;
  projectId: string;
  roomId: string;
  roomName?: string;
  title: string;
  description?: string;
  status: DecisionStatus;
  requestedBy?: string;
  requestedByName?: string;
  assignedTo?: string;
  dueDate?: Timestamp | any;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: Timestamp | any;
  relatedFiles?: string[];
  relatedMessages?: string[];
  timelineImpact?: string;
  budgetImpact?: number;
  notes?: string;
  revisionNotes?: string;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

// ── File library ─────────────────────────────────────────────────────────────
export interface DesignFile {
  id: string;
  projectId: string;
  roomId: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  storagePath?: string;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt?: Timestamp | any;
  tags?: string[];
  linkedSelectionId?: string;
  linkedDecisionId?: string;
  linkedMoodBoardItemId?: string;
  /** External product/vendor link saved as a "file" reference (no upload). */
  isLink?: boolean;
}

// ── Role helpers (mirrors RoleGuard's canonical taxonomy) ────────────────────
export type PortalRole =
  | 'admin'
  | 'gc'
  | 'projectManager'
  | 'designer'
  | 'client'
  | 'subcontractor';

export function normalizeRole(raw?: string): PortalRole {
  const r = (raw || '').toLowerCase().replace(/_/g, '');
  if (r === 'admin') return 'admin';
  if (r === 'gc') return 'gc';
  if (r === 'projectmanager' || r === 'pm') return 'projectManager';
  if (r === 'designer') return 'designer';
  if (r === 'sub' || r === 'subcontractor') return 'subcontractor';
  if (r === 'client' || r === 'homeowner') return 'client';
  return 'client';
}

/** Full design-edit access (mood boards, selections, decisions, rooms). */
export function canEditDesign(role: PortalRole): boolean {
  return (
    role === 'admin' ||
    role === 'gc' ||
    role === 'projectManager' ||
    role === 'designer'
  );
}

/** Client-style review access: view, comment, upload, approve/reject. */
export function canReviewAsClient(role: PortalRole): boolean {
  return role === 'client';
}

export function hasPortalAccess(role: PortalRole): boolean {
  return canEditDesign(role) || role === 'client';
}
