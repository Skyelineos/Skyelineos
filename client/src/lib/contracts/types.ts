// Contracts module — the legal/financial spine that ties projects to
// payments, draws, profit, change orders, and portal visibility.
//
// A single Firestore collection `contracts` holds every contract type
// (client build agreement, sub agreement, designer agreement, employee
// agreement). Each portal user only sees the contracts they're a party to.

export type ContractType =
  | 'client_build'      // GC ↔ Homeowner (the master build agreement)
  | 'subcontractor'     // GC ↔ Sub for a specific scope on a project
  | 'designer'          // GC ↔ Designer for design services
  | 'employee';         // GC ↔ Employee (employment agreement)

export type ContractStatus =
  | 'draft'             // Being authored
  | 'sent'              // Sent to other party, awaiting signature
  | 'signed'            // Both parties signed — active
  | 'active'            // Work in progress under this contract
  | 'completed'         // Work done, all draws paid
  | 'closed'            // Archived
  | 'cancelled';        // Voided

export type BudgetMode = 'soft' | 'finalized';

export interface AllowanceItem {
  id: string;
  category: string;          // "Appliances", "Lighting", "Flooring", etc.
  description: string;
  amount: number;             // Budgeted allowance
  resolvedAmount?: number;    // Actual once selected
  resolvedAt?: string;        // ISO date when selection finalized
  resolved: boolean;
  dueDate?: string;          // ISO — when does the client need to pick this?
  notes?: string;
}

// Initial bid breakdown — every trade/category that contributed to the
// contract total, with its dollar amount. Client sees this in their
// portal so they understand exactly how the bid was assembled. Each
// line item also acts as the source-of-truth budget when a sub
// requests a change order against it.
export interface BidLineItem {
  id: string;
  category: string;          // "Framing", "HVAC", "Cabinets", etc.
  description?: string;       // e.g. "Includes all rough + finish carpentry"
  amount: number;
  awardedSubContactId?: string; // Sub awarded this scope (if any)
  awardedSubName?: string;    // Snapshot for display
  notes?: string;
}

export type MilestoneStatus =
  | 'upcoming'
  | 'ready_to_invoice'
  | 'invoiced'
  | 'paid';

export interface DrawMilestone {
  id: string;
  label: string;              // "Foundation Complete", "Frame Inspection", etc.
  pctOfContract?: number;     // 0..100 — for percentage-based draws
  amount?: number;            // Or explicit dollar amount
  dueDate?: string;           // ISO date target
  triggeringTaskIds?: string[]; // Gantt tasks whose completion fires this draw
  status: MilestoneStatus;
  invoiceId?: string;
  invoicedAt?: string;
  paidAt?: string;
  paidAmount?: number;
  notes?: string;
}

export interface ContractChangeOrder {
  id: string;
  number: number;              // CO #1, CO #2…
  description: string;
  amount: number;              // + or –
  status: 'pending' | 'approved' | 'rejected' | 'voided';
  // Workflow: sub → admin → client
  source: 'admin' | 'sub';     // who initiated
  submittedByContactId?: string;
  submittedByName?: string;
  submittedAt?: string;
  // Admin gates: did Tyler approve forwarding to client?
  adminReviewedAt?: string;
  adminReviewedBy?: string;
  adminAcceptedForClient?: boolean;
  // Which bid line item this affects (so revenue/cost recalc per line)
  affectsLineItemId?: string;
  // Sub-side context
  trade?: string;
  // Client gates
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
}

export interface ContractParty {
  // Snapshot at signing time — survives later edits to the contact doc.
  contactId?: string;
  userId?: string;            // Firebase Auth uid if signed-in user
  name: string;
  email?: string;
  company?: string;
  role: 'gc' | 'client' | 'subcontractor' | 'designer' | 'employee';
}

// Top-level contract doc. Path: contracts/{contractId}
export interface Contract {
  id: string;
  type: ContractType;
  status: ContractStatus;

  // Scope binding
  projectId?: string;          // Required for client_build, sub, designer
  projectName?: string;        // Denormalized for display

  // Parties
  gc: ContractParty;           // Always Skyeline Homes
  other: ContractParty;        // Client / Sub / Designer / Employee

  // Money
  budgetMode: BudgetMode;      // 'soft' until design @ 100% AND subs updated
  contractAmount: number;      // Base amount (soft or finalized) — falls back to sum(lineItems) if 0
  lineItems: BidLineItem[];    // Initial bid breakdown by trade/category
  allowances: AllowanceItem[]; // Selection allowance buckets
  drawSchedule: DrawMilestone[];
  changeOrders: ContractChangeOrder[];

  // Sub-specific: trade + scope from awarded bid
  trade?: string;
  scope?: string;
  retainagePct?: number;       // e.g. 10 = hold 10% until punch list done

  // Designer-specific
  designerFeeModel?: 'hourly' | 'fixed' | 'pct_of_construction';
  designerHourlyRate?: number;
  designerPctOfConstruction?: number;

  // Employee-specific (kept on the user profile primarily but mirrored here
  // for parity)
  employmentTitle?: string;
  employmentStartDate?: string;
  employmentComp?: string;     // free-form: "$X/yr + $Y/mo car allowance"

  // Documents
  signedDocumentUrl?: string;  // Firebase Storage URL for the signed PDF
  documentName?: string;

  // Lifecycle
  createdAt: string;           // ISO
  createdBy: string;           // Firebase uid
  signedAt?: string;
  effectiveDate?: string;
  endDate?: string;
  updatedAt?: string;
  updatedBy?: string;
}

// Helpers — computed off the contract doc

export function lineItemsTotal(c: Contract): number {
  return (c.lineItems || []).reduce((s, l) => s + (l.amount || 0), 0);
}

export function contractTotal(c: Contract): number {
  // Prefer explicit contractAmount; fall back to sum of line items so a
  // contract built bottom-up (line by line) still totals correctly even
  // before someone manually enters contractAmount.
  const base = c.contractAmount && c.contractAmount > 0 ? c.contractAmount : lineItemsTotal(c);
  const cos = (c.changeOrders || [])
    .filter(co => co.status === 'approved')
    .reduce((s, co) => s + (co.amount || 0), 0);
  return base + cos;
}

export function contractInvoiced(c: Contract): number {
  return (c.drawSchedule || [])
    .filter(m => m.status === 'invoiced' || m.status === 'paid')
    .reduce((s, m) => s + (m.amount || (m.pctOfContract ? (contractTotal(c) * m.pctOfContract) / 100 : 0)), 0);
}

export function contractPaid(c: Contract): number {
  return (c.drawSchedule || [])
    .filter(m => m.status === 'paid')
    .reduce((s, m) => s + (m.paidAmount || m.amount || (m.pctOfContract ? (contractTotal(c) * m.pctOfContract) / 100 : 0)), 0);
}

export function contractOutstanding(c: Contract): number {
  return contractTotal(c) - contractPaid(c);
}

export function canFinalizeBudget(params: {
  selectionsCompletePct: number;
  unresolvedAllowances: number;
  subEstimatesAllRefreshed: boolean;
}): boolean {
  return (
    params.selectionsCompletePct >= 100 &&
    params.unresolvedAllowances === 0 &&
    params.subEstimatesAllRefreshed
  );
}

// Pretty labels for UI
export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  client_build: 'Client Build Agreement',
  subcontractor: 'Subcontractor Agreement',
  designer: 'Designer Agreement',
  employee: 'Employment Agreement',
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: 'Draft',
  sent: 'Sent for signature',
  signed: 'Signed',
  active: 'Active',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};
