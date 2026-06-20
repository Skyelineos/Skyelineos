// AI Inbox — shared types, category taxonomy, and QBO mapping.
//
// This is the PRODUCTION evolution of the Ingestion Lab spike. It lives in its
// own namespace (`ai_inbox_items` collection, `aiInbox/` functions) and never
// touches the `ingestion_lab/` namespace — the spike keeps running untouched.
//
// Focus is finance intake: vendor invoices, receipts (incl. Home Depot), bank
// alerts, and subcontractor / client email — each classified, project-matched,
// and given a QuickBooks categorization suggestion that a human approves before
// anything is written to QBO.

// The categories the brain may assign. Finance-shaped, not the spike's
// decision/design taxonomy.
export const AI_INBOX_CATEGORIES = [
  'vendor_invoice',        // a bill from a vendor/sub — A/P, pay later
  'receipt',               // a paid receipt (generic)
  'home_depot_receipt',    // paid receipt, Home Depot specifically (common enough to split out)
  'bank_alert',            // bank/credit-card transaction alert or statement
  'subcontractor_email',   // correspondence from a sub (scheduling, questions, docs)
  'client_email',          // correspondence from a homeowner/client
  'general',               // anything else / informational but plausibly relevant
  'not_relevant',          // spam / marketing / nothing to do with the business → Ignored lane
] as const;

export type AiInboxCategory = (typeof AI_INBOX_CATEGORIES)[number];

// Which categories represent money that can flow to QuickBooks. Only these are
// ever eligible for a QBO write — and only after human approval.
export const FINANCIAL_CATEGORIES: ReadonlySet<string> = new Set([
  'vendor_invoice',
  'receipt',
  'home_depot_receipt',
  'bank_alert',
]);

// Per Tyler's decision: vendor invoices become A/P Bills (paid later);
// receipts / Home Depot / bank charges become Purchases/Expenses (already paid).
export type QboEntityType = 'Bill' | 'Purchase' | 'none';

export function qboEntityForCategory(category: string): QboEntityType {
  if (category === 'vendor_invoice') return 'Bill';
  if (category === 'receipt' || category === 'home_depot_receipt' || category === 'bank_alert') {
    return 'Purchase';
  }
  return 'none';
}

// Review lanes — mirrors the spike's three-lane idea but tuned for finance.
// Money ALWAYS needs review; non-financial high-confidence mail can auto-file
// (it is never synced to QBO, so auto-filing it is safe); clearly-irrelevant
// mail (spam/marketing) is triaged to the Ignored lane so the catch-all
// accounting@ feed doesn't bury real invoices.
export type AiInboxLane = 'needs_review' | 'auto_filed' | 'ask' | 'ignored';

// One configured intake mailbox. Up to MAX_INTAKE_MAILBOXES are stored on
// ai_inbox_config/global.mailboxes; n8n runs one Gmail trigger per address and
// stamps the `mailbox` field so items are filterable by which inbox they hit.
export const MAX_INTAKE_MAILBOXES = 3;
export interface IntakeMailbox {
  address: string;     // e.g. accounting@skyelinehomes.com
  label: string;       // human label e.g. "Accounting"
  enabled: boolean;
}

export type AiInboxReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'corrected';

export type AiInboxQboSyncStatus =
  | 'not_synced'   // default; nothing written to QBO
  | 'synced'       // a Bill/Purchase was created
  | 'skipped'      // approved but no financial entity to create
  | 'error';       // a sync attempt failed (see qboSyncError)

// The structured extraction the brain produces and the UI lets a human correct.
export interface AiInboxExtraction {
  category: AiInboxCategory | string;
  vendorName: string | null;
  amountUsd: number | null;
  currency: string;            // 'USD' default
  documentDate: string | null; // ISO yyyy-mm-dd if parseable
  dueDate: string | null;      // ISO yyyy-mm-dd for invoices
  invoiceNumber: string | null;
  // Suggested QBO expense account NAME (resolved to an account id at sync time).
  qboAccountSuggestion: string | null;
  // Recommended Gmail label so the n8n flow can file the thread back in Gmail.
  gmailLabelRecommendation: string | null;
  // Project match (against live `projects`). projectId is the Firestore doc id.
  projectId: string | null;
  projectName: string | null;
  // "Invoice is behind a login link" — common with vendor portals (Bill.com,
  // Home Depot Pro). We never auto-fetch authenticated portals; instead we flag
  // it so a human opens the link, downloads the PDF, and attaches it.
  hasInvoiceLink: boolean;
  invoiceLinkUrl: string | null;
  summary: string;
  confidence: number;          // 0..1
  confidenceReason: string;
  needsClarification: boolean;
  clarificationQuestion: string | null;
}

// Resolve the review lane from an extraction. Financial items always go to
// review; ambiguity goes to ask; otherwise high-confidence informational mail
// auto-files.
export const AUTO_FILE_CONFIDENCE_THRESHOLD = 0.85;

export function resolveAiInboxLane(x: {
  category: string;
  confidence: number;
  needsClarification: boolean;
}): AiInboxLane {
  // Clearly-irrelevant mail (spam/marketing) is triaged out of the review
  // queue entirely. High confidence → silently ignored; low confidence →
  // still ignored but a human can find it in the Ignored tab if needed.
  if (x.category === 'not_relevant' && x.confidence >= 0.7) return 'ignored';
  if (x.needsClarification) return 'ask';
  if (x.confidence < 0.5) return 'ask';
  if (x.category === 'not_relevant') return 'ignored';
  // Money is never auto-filed — a human approves before QBO.
  if (FINANCIAL_CATEGORIES.has(x.category)) return 'needs_review';
  if (x.confidence >= AUTO_FILE_CONFIDENCE_THRESHOLD) return 'auto_filed';
  return 'needs_review';
}
