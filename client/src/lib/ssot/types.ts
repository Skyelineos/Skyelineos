// Single Source of Truth (SSOT) — shared client types.
// See docs/single-source-of-truth-design.md for the full design.
//
// The SSOT is a curated *view* over existing collections (documents, moodBoards,
// selections) promoted via an `inSsot` flag, plus a new per-project `addenda`
// subcollection that records deviations from the base plans. Nothing official
// for a build lives outside this set.

import type { Timestamp } from 'firebase/firestore';

// Fixed top-level folders — identical on every project (decided, §5a).
export const SSOT_CATEGORIES = [
  'Plans',
  'Design',
  'Selections',
  'Permits',
  'Addenda',
  'Scopes',
] as const;
export type SsotCategory = (typeof SSOT_CATEGORIES)[number];

// ── Addenda (deviation tracking — the core, §5) ───────────────────────────────

// draft → pending_approval → published. Subs only ever see `published`.
export type AddendumStatus = 'draft' | 'pending_approval' | 'published';

// Approval Quorum = client + gc, plus designer IF one is assigned (§2).
export type ApprovalRole = 'client' | 'gc' | 'designer';

export interface AddendumApproval {
  role: ApprovalRole;
  uid: string;
  name?: string;
  approvedAt?: Timestamp;
}

export interface Addendum {
  id: string;
  projectId: string;
  number: number;               // sequential per project — "Addendum 3"
  title: string;
  description: string;
  // Targeting is BY TRADE (decided). Only subs invited for one of these trades
  // are affected / notified / must acknowledge.
  affectsTrades: string[];
  status: AddendumStatus;
  pricingImpact: boolean;       // true => an affected sub must re-acknowledge + may re-price
  // GC escape hatch: push to affected awarded subs immediately mid-design instead
  // of batching to the final-bid milestone (decided, §6a).
  notifyNow?: boolean;
  // What in the SSOT this change is tied to (any subset).
  linkedMoodBoardId?: string;
  linkedSelectionId?: string;
  supersedesPlanDocId?: string;
  // Quorum sign-off captured here; publishApproved() checks completeness.
  approvals?: AddendumApproval[];
  createdByUid?: string;
  createdByName?: string;
  createdAt?: Timestamp;
  publishedAt?: Timestamp;
}

// Recorded on a sub's bid when they acknowledge a deviation before submitting (§5).
export interface AddendumAcknowledgement {
  addendumId: string;
  number: number;
  acknowledgedAt: Timestamp;
}

// ── SSOT item view (promoted documents / boards / selections) ─────────────────

export type SsotItemSource = 'document' | 'moodBoard' | 'selection';

// A normalized row for the read-only "Project Files" browser. Each maps back to
// its home collection doc so we never copy the underlying Storage object.
export interface SsotItem {
  id: string;
  source: SsotItemSource;
  category: SsotCategory;
  title: string;
  fileUrl?: string;
  fileType?: string;
  updatedAt?: Timestamp;
}
