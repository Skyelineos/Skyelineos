// Additive extensions to the existing Selection model in client/src/types/selections.ts
// Merge these fields into your `Selection` interface (and optionally CatalogItem).
//
// All fields optional so existing à la carte selections keep working unchanged.

import type { BuildPhase, DecisionOwner } from '@/data/selectionsTemplate';

/**
 * Lifecycle status across the full design + bid + approval + install timeline.
 *
 * Designer-Curating  designer is still putting options together; nothing for client to see yet
 * Client-Reviewing   designer presented options; client + designer are picking together
 * Awaiting-Bids      a pick has been made (or is close); vendor(s) are quoting on the spec
 * Bids-Received      vendor bids are in; ready for contractor to review cost + design
 * GC-Approved        contractor signed off on both cost and design; can be ordered
 * Ordered            PO sent
 * Received           on site
 * Installed          done
 */
export type SelectionLifecycle =
  | 'Not Started'
  | 'Designer-Curating'
  | 'Client-Reviewing'
  | 'Awaiting-Bids'
  | 'Bids-Received'
  | 'GC-Approved'
  | 'Ordered'
  | 'Received'
  | 'Installed';

/**
 * A bid from a single vendor on a single selection.
 * Vendors initially submit a ROUGH bid based on plans alone (no detailed selection yet).
 * When selections are locked, the vendor is prompted to submit a FINAL bid against actual specs.
 */
export interface SelectionBid {
  id: string;
  vendorId?: string;            // links to vendors collection if present
  vendorName: string;           // free text fallback if not in vendor list
  vendorEmail?: string;
  vendorPhone?: string;
  stage: 'rough' | 'final';     // rough = plans-only; final = against locked specs
  amount: number;               // bid total
  unit?: string;                // 'lump sum' | 'per sqft' | etc.
  leadTimeDays?: number;
  notes?: string;
  submittedAt: any;             // serverTimestamp
  submittedBy?: string;         // who logged it (designer/GC/vendor)
  requestedAt?: any;            // when we asked for this bid
  status: 'pending' | 'received' | 'declined' | 'expired' | 'accepted';
}

export interface SelectionTemplateFields {
  // Template metadata
  templateItemId?: string;
  templateVersion?: string;

  // Classification (from spreadsheet)
  subcategory?: string;
  item?: string;
  phase?: BuildPhase;
  decisionOwner?: DecisionOwner;

  // Lifecycle (richer than the existing clientApprovalStatus / orderStatus)
  lifecycle?: SelectionLifecycle;
  /** Legacy / parallel — kept for compatibility with existing code */
  status?: string;

  // Budget
  allowanceAmount?: number | null;
  actualCost?: number | null;

  // Bids — two-stage: rough then final
  bids?: SelectionBid[];
  /** Vendors the contractor recommends for this category (vendor IDs) */
  preferredVendorIds?: string[];
  /** The accepted bid id, set when contractor signs off */
  acceptedBidId?: string;

  // Selection
  selectedOptionId?: string;

  // Sign-offs — captured separately for cost and design
  designSignoff?: { by: string; at: any; note?: string };
  costSignoff?: { by: string; at: any; note?: string };
  /** True only when BOTH cost + design are signed off — used as the "ready to order" gate */
  gcApproved?: boolean;
  gcApprovedAt?: any;
  gcApprovedBy?: string;

  // Audit
  seededBy?: string;
  seededAt?: any;
  /** Latest client feedback / pick — non-binding; informs designer */
  clientPreference?: { optionId?: string; note?: string; at: any; by: string };
}

export const LIFECYCLE_ORDER: Record<SelectionLifecycle, number> = {
  'Not Started': 0,
  'Designer-Curating': 1,
  'Client-Reviewing': 2,
  'Awaiting-Bids': 3,
  'Bids-Received': 4,
  'GC-Approved': 5,
  'Ordered': 6,
  'Received': 7,
  'Installed': 8,
};

export const LIFECYCLE_LABEL: Record<SelectionLifecycle, string> = {
  'Not Started': 'Not Started',
  'Designer-Curating': 'Designer Curating',
  'Client-Reviewing': 'Client Reviewing',
  'Awaiting-Bids': 'Awaiting Bids',
  'Bids-Received': 'Bids In — Needs Sign-Off',
  'GC-Approved': 'Approved',
  'Ordered': 'Ordered',
  'Received': 'Received',
  'Installed': 'Installed',
};
