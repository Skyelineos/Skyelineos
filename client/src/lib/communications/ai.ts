// Communication Center AI (Phase 3) — client side. Calls the staff-only backend
// routes (Claude runs server-side; the API key never reaches the browser) and
// manages the review queue: AI suggestions land as `extractions` with status
// 'open', and a human confirms (→ real action item / decision) or dismisses.

import {
  collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { authFetch } from '@/lib/authFetch';
import { createActionItem } from './actionItems';
import { createDecision } from './decisions';
import type { CommThread } from './firestore';

export type ExtractionEntityType =
  | 'action_item' | 'decision_made' | 'decision_needed' | 'commitment'
  | 'change_order_signal' | 'issue' | 'schedule_change' | 'vendor_mention';

export interface AiExtraction {
  id: string;
  entityType: ExtractionEntityType;
  payload: { summary: string; ownerName?: string | null; dueDate?: string | null; priority?: string | null; sourceQuote?: string | null };
  tradeMentions?: string[];
  projectId?: string | null;
  clientId?: string | null;
  confidence: number;
  needsClarification?: boolean;
  clarificationQuestion?: string | null;
  status: 'open' | 'linked' | 'dismissed';
  createdViaAi?: boolean;
  createdAt?: any;
}

const DECISION_TYPES = new Set<ExtractionEntityType>(['decision_made', 'decision_needed']);

// ── Backend calls ─────────────────────────────────────────────────────────────

async function post(path: string, body?: any): Promise<any> {
  const r = await authFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.error || `Request failed (${r.status})`);
  return json;
}

export const analyzeThread = (threadId: string) =>
  post(`/api/communications/threads/${threadId}/analyze`) as Promise<{ created: number; skipped: number }>;

export const summarizeThread = (threadId: string) =>
  post(`/api/communications/threads/${threadId}/summarize`) as Promise<{ summary: string }>;

export const summarizeProject = (projectId: string) =>
  post(`/api/communications/summarize-project`, { projectId }) as Promise<{ summary: string }>;

// ── Review queue ──────────────────────────────────────────────────────────────

/** Listen to pending AI suggestions on a thread (status 'open'). */
export function listenOpenExtractions(threadId: string, cb: (rows: AiExtraction[]) => void): Unsubscribe {
  const q = query(collection(db, 'communications', threadId, 'extractions'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).filter(x => x.status === 'open')),
    () => cb([]),
  );
}

/**
 * Confirm a suggestion → create the real record (decision or action item),
 * then mark the extraction linked. This is the human-approval gate; nothing is
 * "real" until this runs.
 */
export async function confirmExtraction(thread: CommThread, x: AiExtraction, uid: string, byName?: string): Promise<void> {
  const projectId = thread.subjectRef.type === 'project' ? thread.subjectRef.id : undefined;
  const clientId = thread.subjectRef.type !== 'project' ? thread.subjectRef.id : undefined;
  let linkedRef: { type: string; id: string };

  if (DECISION_TYPES.has(x.entityType)) {
    const id = await createDecision({
      title: x.payload.summary,
      projectId, clientId,
      sourceThreadId: thread.id,
      createdViaAi: true,
      createdBy: uid, createdByName: byName,
    });
    linkedRef = { type: 'decision', id };
  } else {
    const id = await createActionItem({
      title: x.payload.summary,
      dueDate: x.payload.dueDate || undefined,
      projectId, clientId,
      sourceThreadId: thread.id,
      createdViaAi: true,
      createdBy: uid, createdByName: byName,
    });
    linkedRef = { type: 'actionItem', id };
  }

  await updateDoc(doc(db, 'communications', thread.id, 'extractions', x.id), {
    status: 'linked',
    linkedRef,
    reviewedAt: serverTimestamp(),
    reviewedByUid: uid,
  });
}

export async function dismissExtraction(threadId: string, extractionId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'communications', threadId, 'extractions', extractionId), {
    status: 'dismissed',
    reviewedAt: serverTimestamp(),
    reviewedByUid: uid,
  });
}
