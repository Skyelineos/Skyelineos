// RFI (Request For Information) — a structured question raised against a project
// by a subcontractor, designer, or GC, routed for an authoritative answer.
//
// Lives at: projects/{projectId}/rfis/{rfiId}
//
// This is the cross-portal gap the mind-map calls out in three places:
//   • GC Portal → Document & Compliance → RFIs
//   • Designer Portal → Contractor Coordination → RFI Responses / Clarifications
//   • Subcontractor Portal → Designer Coordination → Field Questions
// One collection backs all three surfaces; role gating happens in firestore.rules.

export type RFIStatus = 'open' | 'answered' | 'closed';
export type RFIPriority = 'low' | 'normal' | 'high';

export interface RFIAttachment {
  name: string;
  url: string;
  storagePath: string;
  /** MIME type captured at upload (e.g. "image/jpeg", "video/mp4") so the UI
   *  can render a photo thumbnail vs. an inline video player vs. a file link. */
  contentType?: string;
}

export interface RFI {
  id: string;
  projectId: string;
  /** Sequential, human-facing RFI number scoped to the project (RFI-001, 002…). */
  number: number;
  subject: string;
  question: string;
  /** Trade / discipline the question concerns, e.g. "Framing", "Electrical". */
  discipline?: string;
  /** Optional area/room reference, e.g. "Master Bath", "Grid C-4". */
  location?: string;
  priority: RFIPriority;
  status: RFIStatus;
  /** YYYY-MM-DD — when a response is needed by. */
  dueDate?: string;

  // Author (whoever raised the question)
  createdByUid: string;
  createdByName: string;
  createdByRole: string;
  createdAt?: any;
  updatedAt?: any;

  // Answer
  answer?: string;
  answeredByUid?: string;
  answeredByName?: string;
  answeredAt?: any;

  // Close-out
  closedByUid?: string;
  closedAt?: any;

  attachments?: RFIAttachment[];
}

export const RFI_PRIORITY_LABELS: Record<RFIPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

export const RFI_STATUS_LABELS: Record<RFIStatus, string> = {
  open: 'Open',
  answered: 'Answered',
  closed: 'Closed',
};
