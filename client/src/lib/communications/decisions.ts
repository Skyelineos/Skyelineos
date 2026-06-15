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

export interface ClientDecision {
  id: string;
  title: string;
  summary?: string;
  decidedOn?: string;              // YYYY-MM-DD (when the decision was made)
  projectId?: string;
  clientId?: string;
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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  for (const k of ['summary', 'decidedOn', 'projectId', 'clientId', 'relatedRoom', 'relatedSelectionId', 'relatedTradeId', 'sourceThreadId', 'sourceMessageId', 'createdByName'] as const) {
    if ((input as any)[k]) clean[k] = (input as any)[k];
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
