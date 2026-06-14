// Firestore access layer for the RFI module. Mirrors the "read Firestore
// directly, no API round-trips" pattern used by the bidding module
// (client/src/components/bidding/PortalBidsPanel.tsx).
//
// Collection: projects/{projectId}/rfis/{rfiId}

import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '../firebase';
import { createNotification } from '../notifications';
import type { RFI, RFIAttachment, RFIPriority } from '@/types/rfi';

const rfiCollection = (projectId: string) =>
  collection(db, 'projects', projectId, 'rfis');

/**
 * Live subscription to a project's RFIs, newest number first.
 * Ordering by `number` is a single-field index (auto-created), so this needs
 * no composite index. Status filtering is done client-side in the panel to
 * keep the query index-free.
 */
export function subscribeProjectRFIs(
  projectId: string,
  onData: (rfis: RFI[]) => void,
  onError?: (err: FirestoreError) => void,
) {
  const q = query(rfiCollection(projectId), orderBy('number', 'desc'));
  return onSnapshot(
    q,
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() } as RFI))),
    err => {
      console.error('[rfi] subscribe error:', err);
      onError?.(err);
    },
  );
}

export interface CreateRFIInput {
  subject: string;
  question: string;
  discipline?: string;
  location?: string;
  priority: RFIPriority;
  dueDate?: string;
  attachments?: RFIAttachment[];
}

export interface RFIAuthor {
  uid: string;
  name: string;
  role: string;
}

/**
 * Create an RFI. The sequential `number` is computed from the highest existing
 * number passed in by the caller (the panel already has the live list in
 * memory). Single-tenant, low write volume — a transactional counter would be
 * over-engineering here; a brief comment marks the trade-off.
 */
export async function createRFI(
  projectId: string,
  input: CreateRFIInput,
  author: RFIAuthor,
  nextNumber: number,
): Promise<string> {
  const payload: Omit<RFI, 'id'> = {
    projectId,
    number: nextNumber,
    subject: input.subject.trim(),
    question: input.question.trim(),
    discipline: input.discipline?.trim() || undefined,
    location: input.location?.trim() || undefined,
    priority: input.priority,
    status: 'open',
    dueDate: input.dueDate || undefined,
    createdByUid: author.uid,
    createdByName: author.name,
    createdByRole: author.role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    attachments: input.attachments?.length ? input.attachments : undefined,
  };
  // Strip undefineds — Firestore rejects them.
  const clean = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined),
  );
  const ref = await addDoc(rfiCollection(projectId), clean);
  return ref.id;
}

/**
 * Answer an RFI. Notifies the original author (the person waiting on the
 * answer) via the shared notifications pipeline — the high-value alert in the
 * RFI loop. Best-effort; never blocks the write.
 */
export async function answerRFI(
  projectId: string,
  rfi: RFI,
  answer: string,
  answerer: RFIAuthor,
): Promise<void> {
  await updateDoc(doc(db, 'projects', projectId, 'rfis', rfi.id), {
    answer: answer.trim(),
    answeredByUid: answerer.uid,
    answeredByName: answerer.name,
    answeredAt: serverTimestamp(),
    status: 'answered',
    updatedAt: serverTimestamp(),
  });

  // Notify the author that their question was answered.
  if (rfi.createdByUid && rfi.createdByUid !== answerer.uid) {
    await createNotification({
      userId: rfi.createdByUid,
      kind: 'rfi_answered',
      title: `RFI-${String(rfi.number).padStart(3, '0')} answered`,
      body: `${answerer.name} answered "${rfi.subject}".`,
      projectId,
      refType: 'rfi',
      refId: rfi.id,
      fromUserId: answerer.uid,
      fromUserName: answerer.name,
    });
  }
}

export async function closeRFI(
  projectId: string,
  rfiId: string,
  closer: RFIAuthor,
): Promise<void> {
  await updateDoc(doc(db, 'projects', projectId, 'rfis', rfiId), {
    status: 'closed',
    closedByUid: closer.uid,
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Re-open a previously answered/closed RFI back to `open`. */
export async function reopenRFI(projectId: string, rfiId: string): Promise<void> {
  await updateDoc(doc(db, 'projects', projectId, 'rfis', rfiId), {
    status: 'open',
    updatedAt: serverTimestamp(),
  });
}

export async function deleteRFI(projectId: string, rfiId: string): Promise<void> {
  await deleteDoc(doc(db, 'projects', projectId, 'rfis', rfiId));
}

/** Next sequential RFI number given the current live list. */
export function nextRFINumber(rfis: RFI[]): number {
  return rfis.reduce((max, r) => Math.max(max, r.number || 0), 0) + 1;
}
