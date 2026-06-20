// AI Inbox — client-side types. Mirrors functions/src/aiInbox/types.ts.

export type AiInboxCategory =
  | 'vendor_invoice'
  | 'receipt'
  | 'home_depot_receipt'
  | 'bank_alert'
  | 'subcontractor_email'
  | 'client_email'
  | 'general';

export const CATEGORY_LABELS: Record<string, string> = {
  vendor_invoice: 'Vendor Invoice',
  receipt: 'Receipt',
  home_depot_receipt: 'Home Depot Receipt',
  bank_alert: 'Bank Alert',
  subcontractor_email: 'Subcontractor Email',
  client_email: 'Client Email',
  general: 'General',
};

export const CATEGORY_OPTIONS: AiInboxCategory[] = [
  'vendor_invoice',
  'receipt',
  'home_depot_receipt',
  'bank_alert',
  'subcontractor_email',
  'client_email',
  'general',
];

export const FINANCIAL_CATEGORIES = new Set([
  'vendor_invoice',
  'receipt',
  'home_depot_receipt',
  'bank_alert',
]);

export type AiInboxLane = 'needs_review' | 'auto_filed' | 'ask';
export type AiInboxReviewStatus = 'pending' | 'approved' | 'rejected' | 'corrected';
export type AiInboxQboSyncStatus = 'not_synced' | 'synced' | 'skipped' | 'error';

export interface AiInboxExtraction {
  category: string;
  vendorName: string | null;
  amountUsd: number | null;
  currency: string;
  documentDate: string | null;
  dueDate: string | null;
  invoiceNumber: string | null;
  qboAccountSuggestion: string | null;
  gmailLabelRecommendation: string | null;
  projectId: string | null;
  projectName: string | null;
  summary: string;
  confidence: number;
  confidenceReason: string;
  needsClarification: boolean;
  clarificationQuestion: string | null;
}

export interface AiInboxItem {
  id: string;
  source: string;
  messageId: string | null;
  threadId: string | null;
  from: { email: string | null; name: string | null };
  subject: string | null;
  bodyText?: string;
  gmailLabels?: string[];
  attachments?: Array<{ filename?: string; mimeType?: string; size?: number } | string>;
  status?: string;
  extraction?: AiInboxExtraction;
  category?: string;
  projectId?: string | null;
  projectName?: string | null;
  amountUsd?: number | null;
  vendorName?: string | null;
  gmailLabelRecommendation?: string | null;
  confidence?: number;
  lane?: AiInboxLane;
  reviewStatus?: AiInboxReviewStatus;
  qboSyncStatus?: AiInboxQboSyncStatus;
  qboEntityType?: string;
  qboEntityId?: string;
  qboSyncError?: string;
  processingError?: string;
  costUsd?: number;
  ingestedAt?: any;
  receivedAt?: any;
}

export interface AiInboxConfig {
  dailyBudgetUsd?: number;
  spendTodayUsd?: number;
  spendDate?: string;
  lastBrainPassAt?: any;
}
