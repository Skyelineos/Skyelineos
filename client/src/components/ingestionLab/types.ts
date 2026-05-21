// Shared types for the Ingestion Lab UI. These mirror the server-side
// shapes in functions/src/ingestionLab/ and docs/ingestion-lab-schema.md.

export type IngestionSource = 'gmail' | 'drive' | 'imessage' | 'icloud' | 'upload';
export type LabProjectId = 'giboney' | 'christensen';
export type Lane = 'auto_filed' | 'review_queue' | 'ask_queue';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'corrected';

export interface IngestionConfig {
  gmail?: { email?: string; connectedAt?: any; expiresAt?: any } | null;
  drive?: { email?: string; connectedAt?: any; expiresAt?: any } | null;
  dailyBudgetUsd?: number;
  spendTodayUsd?: number;
  spendDate?: string;
  lastGmailIngestAt?: any;
  lastDriveIngestAt?: any;
  lastUploadAt?: any;
  lastBrainPassAt?: any;
}

export interface RawItem {
  id: string;
  source: IngestionSource;
  sourceRef: string;
  sourceMeta?: any;
  projectHint?: LabProjectId | null;
  content?: string;
  contentMime?: string;
  attachmentRefs?: Array<{ filename: string; mime: string; size: number }>;
  ingestedAt?: any;
  ingestedByUid?: string;
  processedAt?: any;
  processedItemId?: string | null;
  brainErrors?: string[];
}

export interface ProcessedItem {
  id: string;
  rawItemId: string;
  source: IngestionSource;
  sourceRef: string;
  category: string;
  projectId: LabProjectId | null;
  structuredPayload?: any;
  confidence: number;
  confidenceReason?: string;
  needsClarification: boolean;
  clarificationQuestion?: string | null;
  clarificationAnswer?: string | null;
  lane: Lane;
  reviewStatus: ReviewStatus;
  reviewedAt?: any;
  reviewedByUid?: string;
  correction?: any;
  processedAt?: any;
  modelUsed?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}
