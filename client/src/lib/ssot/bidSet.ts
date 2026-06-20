// Pre-bid client-approval gate (design §5b): the bid set (plans + approved
// design + addenda) must clear the Approval Quorum before any sub is invited.
// Modeled as a quorum on the project doc, reusing the addenda quorum helpers.
//
// Approvals are recorded staff-side for now (same as AddendaManager); a
// client-portal approval surface with its own rule carve-out comes later.

import { doc, getDoc, updateDoc, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { quorumMet, requiredRoles } from './addenda';
import type { AddendumApproval, ApprovalRole } from './types';

export interface BidSetGate {
  approvals: AddendumApproval[];
  designerAssigned: boolean;
  approved: boolean;
}

function designerAssignedFrom(data: any): boolean {
  return !!(data?.designerId || data?.assignedDesignerId || data?.designerName);
}

/** Read the current bid-set approval state for a project. */
export async function getBidSetGate(projectId: string): Promise<BidSetGate> {
  const snap = await getDoc(doc(db, 'projects', projectId));
  const data = snap.data() as any | undefined;
  const approvals: AddendumApproval[] = data?.bidSetApproval ?? [];
  const designerAssigned = designerAssignedFrom(data);
  return { approvals, designerAssigned, approved: quorumMet({ approvals }, designerAssigned) };
}

/** Record one quorum approval on the bid set (idempotent per role). */
export async function recordBidSetApproval(
  projectId: string,
  approval: Omit<AddendumApproval, 'approvedAt'>,
): Promise<void> {
  const ref = doc(db, 'projects', projectId);
  const snap = await getDoc(ref);
  const data = snap.data() as any | undefined;
  const existing: AddendumApproval[] = (data?.bidSetApproval ?? []).filter((a: AddendumApproval) => a.role !== approval.role);
  const next = [...existing, { ...approval, approvedAt: serverTimestamp() as unknown as Timestamp }];
  const approved = quorumMet({ approvals: next }, designerAssignedFrom(data));
  await updateDoc(ref, {
    bidSetApproval: next,
    bidSetApprovedAt: approved ? serverTimestamp() : null,
  });
}

/** The roles still missing from the quorum — for a clear "blocked because" message. */
export function missingApprovals(gate: BidSetGate): ApprovalRole[] {
  const have = new Set(gate.approvals.map(a => a.role));
  return requiredRoles(gate.designerAssigned).filter(r => !have.has(r));
}
