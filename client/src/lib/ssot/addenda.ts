// Addenda CRUD + approval-quorum helpers.
// Path: projects/{projectId}/addenda/{addendumId}
//
// Lifecycle (see docs/single-source-of-truth-design.md §5/§6a):
//   draft → pending_approval → published   (subs only ever see `published`)
// Approval Quorum = client + gc, plus designer IF one is assigned to the project.

import {
  collection, doc, addDoc, getDocs, getDoc, updateDoc, query, where, orderBy,
  serverTimestamp, arrayUnion, type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Addendum, AddendumApproval, ApprovalRole } from './types';

function addendaCol(projectId: string) {
  return collection(db, 'projects', projectId, 'addenda');
}

/** Next sequential addendum number for a project (max existing + 1). */
async function nextNumber(projectId: string): Promise<number> {
  const snap = await getDocs(query(addendaCol(projectId), orderBy('number', 'desc')));
  const top = snap.docs[0]?.data() as Addendum | undefined;
  return (top?.number ?? 0) + 1;
}

export interface CreateAddendumInput {
  projectId: string;
  title: string;
  description: string;
  affectsTrades: string[];
  pricingImpact: boolean;
  notifyNow?: boolean;
  linkedMoodBoardId?: string;
  linkedSelectionId?: string;
  supersedesPlanDocId?: string;
  createdByUid?: string;
  createdByName?: string;
}

/** Create an addendum in `draft`. It is NOT visible to subs until published. */
export async function createAddendum(input: CreateAddendumInput): Promise<string> {
  const number = await nextNumber(input.projectId);
  const ref = await addDoc(addendaCol(input.projectId), {
    projectId: input.projectId,
    number,
    title: input.title.trim(),
    description: input.description.trim(),
    affectsTrades: input.affectsTrades.filter(Boolean),
    pricingImpact: !!input.pricingImpact,
    notifyNow: !!input.notifyNow,
    linkedMoodBoardId: input.linkedMoodBoardId ?? null,
    linkedSelectionId: input.linkedSelectionId ?? null,
    supersedesPlanDocId: input.supersedesPlanDocId ?? null,
    status: 'draft',
    approvals: [],
    createdByUid: input.createdByUid ?? null,
    createdByName: input.createdByName ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Record one quorum approval (client / gc / designer). Idempotent per role. */
export async function addApproval(
  projectId: string,
  addendumId: string,
  approval: Omit<AddendumApproval, 'approvedAt'>,
): Promise<void> {
  const ref = doc(addendaCol(projectId), addendumId);
  const snap = await getDoc(ref);
  const data = snap.data() as Addendum | undefined;
  const existing = (data?.approvals ?? []).filter(a => a.role !== approval.role);
  await updateDoc(ref, {
    status: 'pending_approval',
    approvals: [...existing, { ...approval, approvedAt: serverTimestamp() as unknown as Timestamp }],
  });
}

/**
 * Required approval roles for the quorum. Designer is only required when one is
 * assigned to the project (early builds often have none — then it's client+gc).
 */
export function requiredRoles(designerAssigned: boolean): ApprovalRole[] {
  return designerAssigned ? ['client', 'gc', 'designer'] : ['client', 'gc'];
}

/** True once every required role has signed off. */
export function quorumMet(addendum: Pick<Addendum, 'approvals'>, designerAssigned: boolean): boolean {
  const have = new Set((addendum.approvals ?? []).map(a => a.role));
  return requiredRoles(designerAssigned).every(r => have.has(r));
}

/**
 * Publish to subs — only allowed once the quorum is met. Returns false (no-op)
 * if the quorum isn't satisfied yet, so callers can surface a clear reason.
 */
export async function publishIfApproved(
  projectId: string,
  addendumId: string,
  designerAssigned: boolean,
): Promise<boolean> {
  const ref = doc(addendaCol(projectId), addendumId);
  const snap = await getDoc(ref);
  const data = snap.data() as Addendum | undefined;
  if (!data || !quorumMet(data, designerAssigned)) return false;
  await updateDoc(ref, { status: 'published', publishedAt: serverTimestamp() });
  return true;
}

/** All addenda for a project (GC/designer/client view). */
export async function listAddenda(projectId: string): Promise<Addendum[]> {
  const snap = await getDocs(query(addendaCol(projectId), orderBy('number', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Addendum, 'id'>) }));
}

/**
 * Published addenda affecting any of the given trades — the deviation list a
 * bidding/awarded sub sees and must acknowledge. Firestore allows one
 * array-contains-any per query, so we filter status client-side.
 */
export async function publishedAddendaForTrades(
  projectId: string,
  trades: string[],
): Promise<Addendum[]> {
  const clean = trades.filter(Boolean).slice(0, 10);
  if (clean.length === 0) return [];
  const snap = await getDocs(query(
    addendaCol(projectId),
    where('affectsTrades', 'array-contains-any', clean),
  ));
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as Omit<Addendum, 'id'>) }))
    .filter(a => a.status === 'published')
    .sort((a, b) => b.number - a.number);
}
