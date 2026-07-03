// Communication Center — Client Decision Log (Phase 2 foundation).
//
// Durable record of decisions a client made ("Cabinet selection approved",
// "Pool finish approved"). Every decision links back to the communication it came
// from so it's always traceable to the source. Stored in its own `decisions`
// collection; relations to rooms / selections / trades are stored as ids now and
// can be deep-linked later. AI-created decisions (Phase 3) reuse this same shape.

import {
  addDoc, collection, doc, onSnapshot, orderBy, query, where,
  serverTimestamp, updateDoc, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SubjectRef } from './firestore';

// Extended shape for the Decision Log (v1).
// `kind` catalogs the class of decision so lists can be filtered without
// text-matching. `visibility` gates whether homeowners see it in the
// client portal (approvals/rejections that affect their build) vs. staff-
// only records (internal design or scope debate).
export type DecisionKind =
  | 'selection'          // homeowner picked / approved an item
  | 'change_order'       // a CO created or acted on
  | 'approval'           // client approved something (estimate, contract, etc.)
  | 'rejection'          // client declined
  | 'discussion'         // material discussion worth logging
  | 'scope_change'       // agreed-upon change to project scope
  | 'price_change';      // agreed-upon $ movement

export type DecisionVisibility = 'internal' | 'client-visible';

export interface ClientDecision {
  id: string;
  title: string;
  summary?: string;
  decidedOn?: string;              // YYYY-MM-DD (when the decision was made)
  projectId?: string;
  clientId?: string;
  // NEW — Decision Log v1
  kind?: DecisionKind;
  visibility?: DecisionVisibility; // default 'internal'
  subjectRef?: {                   // link back to the doc that produced it
    collection: string;            // 'estimates' | 'changeOrders' | 'bids' | 'projects/{id}/selections' | ...
    id: string;
    label?: string;                // denorm display (e.g. estimate title)
  };
  context?: Record<string, any>;   // freeform structured payload (before/after values, delta, etc.)
  attachments?: Array<{ name: string; url: string; storagePath?: string }>;
  // Legacy Comm-Center v1 helpers, kept for back-compat.
  relatedRoom?: string;
  relatedSelectionId?: string;
  relatedTradeId?: string;
  // Provenance.
  sourceThreadId?: string;
  sourceMessageId?: string;
  createdViaAi?: boolean;          // Phase-3 hook
  createdBy: string;
  createdByName?: string;
  createdAt?: any;
  updatedAt?: any;
}

const col = () => collection(db, 'decisions');

export async function createDecision(input: Omit<ClientDecision, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const clean: any = {
    title: input.title.trim(),
    createdBy: input.createdBy,
    createdViaAi: input.createdViaAi ?? false,
    visibility: input.visibility ?? 'internal',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  for (const k of [
    'summary', 'decidedOn', 'projectId', 'clientId',
    'kind', 'subjectRef', 'context', 'attachments',
    'relatedRoom', 'relatedSelectionId', 'relatedTradeId',
    'sourceThreadId', 'sourceMessageId', 'createdByName',
  ] as const) {
    if ((input as any)[k] !== undefined) clean[k] = (input as any)[k];
  }
  const ref = await addDoc(col(), clean);
  return ref.id;
}

export async function updateDecision(id: string, patch: Partial<Pick<ClientDecision,
  'title' | 'summary' | 'decidedOn' | 'relatedRoom' | 'relatedSelectionId' | 'relatedTradeId'>>): Promise<void> {
  await updateDoc(doc(db, 'decisions', id), { ...patch, updatedAt: serverTimestamp() } as any);
}

export function listenDecisionsForSubject(ref: SubjectRef, cb: (rows: ClientDecision[]) => void): Unsubscribe {
  const field = ref.type === 'project' ? 'projectId' : 'clientId';
  const q = query(col(), where(field, '==', ref.id), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))), () => cb([]));
}

export function listenDecisionsForThread(threadId: string, cb: (rows: ClientDecision[]) => void): Unsubscribe {
  const q = query(col(), where('sourceThreadId', '==', threadId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))), () => cb([]));
}
