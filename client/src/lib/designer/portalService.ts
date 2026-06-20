// Designer Portal — Firestore service layer.
//
// Reuses existing conventions/infrastructure:
//   - rooms:       projects/{id}/rooms          (shared with RoomManager)
//   - selections:  projects/{id}/selections     (shared with the client portal)
//   - discussion:  projects/{id}/channels/*      (the messaging module)
//   - uploads:     uploadRFIAttachment()         (Firebase Storage helper)
// New collaboration collections:
//   - moodBoards:      projects/{id}/moodBoards
//   - designDecisions: projects/{id}/designDecisions
//   - designFiles:     projects/{id}/designFiles

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  createChannel,
  listenMessages,
  sendMessage,
  type Channel,
  type ChatMessage,
} from '@/lib/messaging/firestore';
import { uploadRFIAttachment } from '@/lib/rfi/upload';
import { fireTrigger } from '@/lib/notifications';
import {
  DEFAULT_ROOMS,
  GENERAL_ROOM_ID,
  GENERAL_ROOM_NAME,
  computeVariance,
  type DesignDecision,
  type DesignFile,
  type DesignSelection,
  type DesignerRoom,
  type DecisionStatus,
  type MoodBoard,
  type MoodBoardItem,
  type MoodBoardStatus,
  type SelectionDesignStatus,
} from './portalTypes';

function uid(): string {
  return auth.currentUser?.uid || '';
}
function actorName(): string {
  return (
    auth.currentUser?.displayName || auth.currentUser?.email || 'Team member'
  );
}
function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Rooms ────────────────────────────────────────────────────────────────────
const roomsCol = (pid: string) => collection(db, 'projects', pid, 'rooms');

export function listenRooms(
  pid: string,
  cb: (rows: DesignerRoom[]) => void,
  onErr?: (e: any) => void
) {
  return onSnapshot(
    query(roomsCol(pid), orderBy('order', 'asc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    onErr
  );
}

/** Seed any of the spec's standard design rooms that don't already exist. */
export async function seedStandardRooms(
  pid: string,
  existing: DesignerRoom[]
): Promise<number> {
  const have = new Set(existing.map((r) => r.name.trim().toLowerCase()));
  const missing = DEFAULT_ROOMS.filter((n) => !have.has(n.toLowerCase()));
  if (!missing.length) return 0;
  const batch = writeBatch(db);
  let order = existing.length;
  for (const name of missing) {
    const ref = doc(roomsCol(pid));
    batch.set(ref, {
      projectId: pid,
      name,
      floor: 'Main Floor',
      roomType: 'general',
      order: order++,
      designerSeeded: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return missing.length;
}

export async function createCustomRoom(
  pid: string,
  name: string,
  order: number
): Promise<string> {
  const ref = await addDoc(roomsCol(pid), {
    projectId: pid,
    name: name.trim(),
    floor: 'Main Floor',
    roomType: 'custom',
    order,
    designerSeeded: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ── Mood boards ──────────────────────────────────────────────────────────────
const moodBoardsCol = (pid: string) =>
  collection(db, 'projects', pid, 'moodBoards');

export function listenMoodBoards(
  pid: string,
  cb: (rows: MoodBoard[]) => void,
  onErr?: (e: any) => void
) {
  return onSnapshot(
    moodBoardsCol(pid),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    onErr
  );
}

export async function createMoodBoard(
  pid: string,
  input: {
    roomId: string;
    roomName?: string;
    title: string;
    designDirection?: string;
  }
): Promise<string> {
  const ref = await addDoc(moodBoardsCol(pid), {
    projectId: pid,
    roomId: input.roomId,
    roomName: input.roomName ?? null,
    title: input.title.trim(),
    designDirection: input.designDirection?.trim() ?? null,
    status: 'Draft' as MoodBoardStatus,
    items: [],
    createdBy: uid(),
    createdByName: actorName(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateMoodBoard(
  pid: string,
  boardId: string,
  patch: Partial<MoodBoard>
): Promise<void> {
  await updateDoc(doc(db, 'projects', pid, 'moodBoards', boardId), {
    ...patch,
    updatedBy: uid(),
    updatedAt: serverTimestamp(),
  } as any);
}

export async function setMoodBoardStatus(
  pid: string,
  boardId: string,
  status: MoodBoardStatus,
  revisionNotes?: string
): Promise<void> {
  const patch: any = { status };
  if (status === 'Approved') {
    patch.approvedBy = uid();
    patch.approvedByName = actorName();
    patch.approvedAt = serverTimestamp();
  }
  if (status === 'Revision Requested' && revisionNotes)
    patch.revisionNotes = revisionNotes;
  await updateMoodBoard(pid, boardId, patch);
}

export async function addMoodBoardItem(
  pid: string,
  board: MoodBoard,
  item: Omit<MoodBoardItem, 'id' | 'approvalStatus'>
): Promise<void> {
  const clean: MoodBoardItem = {
    id: rid(),
    approvalStatus: 'pending',
    category: item.category,
    title: item.title.trim(),
    ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    ...(item.productUrl ? { productUrl: item.productUrl } : {}),
    ...(item.vendorUrl ? { vendorUrl: item.vendorUrl } : {}),
    ...(item.specSheetUrl ? { specSheetUrl: item.specSheetUrl } : {}),
    ...(item.vendor ? { vendor: item.vendor } : {}),
    ...(item.manufacturer ? { manufacturer: item.manufacturer } : {}),
    ...(item.sku ? { sku: item.sku } : {}),
    ...(item.price != null ? { price: item.price } : {}),
    ...(item.notes ? { notes: item.notes } : {}),
    ...(item.linkedSelectionId
      ? { linkedSelectionId: item.linkedSelectionId }
      : {}),
  };
  await updateMoodBoard(pid, board.id, {
    items: [...(board.items || []), clean],
  });
}

export async function updateMoodBoardItem(
  pid: string,
  board: MoodBoard,
  itemId: string,
  patch: Partial<MoodBoardItem>
): Promise<void> {
  const items = (board.items || []).map((it) =>
    it.id === itemId ? { ...it, ...patch } : it
  );
  await updateMoodBoard(pid, board.id, { items });
}

export async function removeMoodBoardItem(
  pid: string,
  board: MoodBoard,
  itemId: string
): Promise<void> {
  await updateMoodBoard(pid, board.id, {
    items: (board.items || []).filter((it) => it.id !== itemId),
  });
}

export async function deleteMoodBoard(
  pid: string,
  boardId: string
): Promise<void> {
  await deleteDoc(doc(db, 'projects', pid, 'moodBoards', boardId));
}

// ── Budget link: estimate allowance lines (server-stripped) ──────────────────
export interface AllowanceLine {
  estimateId: string;
  estimateTitle: string;
  lineId: string;
  trade: string;
  description: string;
  amount: number;
}

/**
 * The project's estimate "allowance" lines, via GET /api/projects/:id/allowances.
 * The server strips internal cost/margin data, so this is safe for designers
 * (who can't read `estimates` directly). Best-effort: returns [] on any failure.
 */
export async function fetchProjectAllowances(
  projectId: string
): Promise<AllowanceLine[]> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return [];
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/allowances`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    return Array.isArray(json?.allowances) ? json.allowances : [];
  } catch {
    return [];
  }
}

// ── Schedule link: project tasks (reference-only) ────────────────────────────
export interface ScheduleTaskRef {
  id: string;
  name: string;
  status?: string;
  isMilestone?: boolean;
}

/** The project's schedule tasks from the top-level `tasks` collection. */
export async function fetchProjectTasks(
  projectId: string
): Promise<ScheduleTaskRef[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'tasks'), where('projectId', '==', projectId))
    );
    return snap.docs
      .map((d) => {
        const t = d.data() as any;
        return {
          id: d.id,
          name: t.name || t.title || 'Task',
          status: t.status,
          isMilestone: !!t.isMilestone,
        } as ScheduleTaskRef;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

// ── Selections (reuse existing collection, additive writes) ──────────────────
const selectionsCol = (pid: string) =>
  collection(db, 'projects', pid, 'selections');

export function listenSelections(
  pid: string,
  cb: (rows: DesignSelection[]) => void,
  onErr?: (e: any) => void
) {
  return onSnapshot(
    selectionsCol(pid),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    onErr
  );
}

export async function createSelection(
  pid: string,
  input: Partial<DesignSelection>
): Promise<string> {
  const variance = computeVariance(input);
  const ref = await addDoc(selectionsCol(pid), {
    projectId: pid,
    roomId: input.roomId ?? null,
    room: input.room ?? null,
    category: input.category ?? 'Other',
    itemName: input.itemName ?? '',
    vendor: input.vendor ?? null,
    productUrl: input.productUrl ?? null,
    vendorUrl: input.vendorUrl ?? null,
    specSheetUrl: input.specSheetUrl ?? null,
    imageUrl: input.imageUrl ?? null,
    allowanceAmount: Number(input.allowanceAmount) || 0,
    selectedAmount: Number(input.selectedAmount) || 0,
    varianceAmount: variance,
    designStatus: (input.designStatus ?? 'notStarted') as SelectionDesignStatus,
    clientApprovalStatus: 'Pending Options',
    clientApprovalRequired: input.clientApprovalRequired ?? true,
    designerApprovalRequired: input.designerApprovalRequired ?? false,
    isCustom: input.isCustom ?? false,
    isTBD: input.isTBD ?? false,
    isNotApplicable: input.isNotApplicable ?? false,
    linkVerified: false,
    dueDate: input.dueDate ?? null,
    timelineImpact: input.timelineImpact ?? null,
    requiredBeforeTrade: input.requiredBeforeTrade ?? null,
    linkedScheduleMilestone: input.linkedScheduleMilestone ?? null,
    linkedScheduleTaskId: input.linkedScheduleTaskId ?? null,
    linkedEstimateId: input.linkedEstimateId ?? null,
    linkedEstimateLineId: input.linkedEstimateLineId ?? null,
    notes: input.notes ?? null,
    // legacy fields the existing SelectionsManager expects
    items: [],
    designerFiles: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSelection(
  pid: string,
  selId: string,
  patch: Partial<DesignSelection>
): Promise<void> {
  const next: any = { ...patch, updatedAt: serverTimestamp() };
  if ('selectedAmount' in patch || 'allowanceAmount' in patch) {
    next.varianceAmount = computeVariance(patch);
  }
  await updateDoc(doc(db, 'projects', pid, 'selections', selId), next);
}

/** Advance a selection's design status, keeping the legacy approval field in sync. */
export async function setSelectionStatus(
  pid: string,
  sel: DesignSelection,
  status: SelectionDesignStatus
): Promise<void> {
  const patch: any = { designStatus: status, updatedAt: serverTimestamp() };
  if (status === 'approved') {
    patch.clientApprovalStatus = 'Approved';
    patch.approvedAt = serverTimestamp();
    patch.approvedBy = uid();
  } else if (status === 'inReview') {
    patch.clientApprovalStatus = 'Checking w/ Client';
  } else if (status === 'notStarted') {
    patch.clientApprovalStatus = 'Pending Options';
  }
  await updateDoc(doc(db, 'projects', pid, 'selections', sel.id), patch);
}

export async function verifySelectionLink(
  pid: string,
  selId: string,
  verified: boolean
): Promise<void> {
  await updateDoc(doc(db, 'projects', pid, 'selections', selId), {
    linkVerified: verified,
    lastVerifiedAt: verified ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}

// ── Decisions ────────────────────────────────────────────────────────────────
const decisionsCol = (pid: string) =>
  collection(db, 'projects', pid, 'designDecisions');

export function listenDecisions(
  pid: string,
  cb: (rows: DesignDecision[]) => void,
  onErr?: (e: any) => void
) {
  return onSnapshot(
    decisionsCol(pid),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    onErr
  );
}

export async function createDecision(
  pid: string,
  input: {
    roomId: string;
    roomName?: string;
    title: string;
    description?: string;
    assignedTo?: string;
    dueDate?: any;
    timelineImpact?: string;
    budgetImpact?: number;
  }
): Promise<string> {
  const ref = await addDoc(decisionsCol(pid), {
    projectId: pid,
    roomId: input.roomId,
    roomName: input.roomName ?? null,
    title: input.title.trim(),
    description: input.description?.trim() ?? null,
    status: 'pending' as DecisionStatus,
    requestedBy: uid(),
    requestedByName: actorName(),
    assignedTo: input.assignedTo ?? null,
    dueDate: input.dueDate ?? null,
    timelineImpact: input.timelineImpact ?? null,
    budgetImpact: input.budgetImpact ?? null,
    relatedFiles: [],
    relatedMessages: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function setDecisionStatus(
  pid: string,
  decId: string,
  status: DecisionStatus,
  revisionNotes?: string
): Promise<void> {
  const patch: any = { status, updatedAt: serverTimestamp() };
  if (status === 'approved') {
    patch.approvedBy = uid();
    patch.approvedByName = actorName();
    patch.approvedAt = serverTimestamp();
  }
  if (status === 'needsRevision' && revisionNotes)
    patch.revisionNotes = revisionNotes;
  await updateDoc(doc(db, 'projects', pid, 'designDecisions', decId), patch);
}

export async function deleteDecision(
  pid: string,
  decId: string
): Promise<void> {
  await deleteDoc(doc(db, 'projects', pid, 'designDecisions', decId));
}

// ── File library ─────────────────────────────────────────────────────────────
const filesCol = (pid: string) =>
  collection(db, 'projects', pid, 'designFiles');

export function listenFiles(
  pid: string,
  cb: (rows: DesignFile[]) => void,
  onErr?: (e: any) => void
) {
  return onSnapshot(
    filesCol(pid),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    onErr
  );
}

/** Upload a file to Storage (reuses uploadRFIAttachment) + record metadata. */
export async function uploadDesignFile(
  pid: string,
  roomId: string,
  file: File,
  meta?: {
    tags?: string[];
    linkedSelectionId?: string;
    linkedDecisionId?: string;
  },
  onProgress?: (pct: number) => void
): Promise<string> {
  const att = await uploadRFIAttachment(pid, file, onProgress);
  const ref = await addDoc(filesCol(pid), {
    projectId: pid,
    roomId,
    fileName: att.name,
    fileType: att.contentType || file.type || 'application/octet-stream',
    fileUrl: att.url,
    storagePath: att.storagePath,
    uploadedBy: uid(),
    uploadedByName: actorName(),
    uploadedAt: serverTimestamp(),
    tags: meta?.tags ?? [],
    linkedSelectionId: meta?.linkedSelectionId ?? null,
    linkedDecisionId: meta?.linkedDecisionId ?? null,
    isLink: false,
  });
  return ref.id;
}

/** Save an external product/vendor link as a "file" reference (no upload). */
export async function addDesignLink(
  pid: string,
  roomId: string,
  name: string,
  url: string,
  tags?: string[]
): Promise<string> {
  const ref = await addDoc(filesCol(pid), {
    projectId: pid,
    roomId,
    fileName: name.trim() || url,
    fileType: 'link',
    fileUrl: url.trim(),
    uploadedBy: uid(),
    uploadedByName: actorName(),
    uploadedAt: serverTimestamp(),
    tags: tags ?? [],
    isLink: true,
  });
  return ref.id;
}

export async function deleteDesignFile(
  pid: string,
  fileId: string
): Promise<void> {
  await deleteDoc(doc(db, 'projects', pid, 'designFiles', fileId));
}

// ── Discussion (reuse messaging channels) ────────────────────────────────────
// One channel per room (kind 'design'), named designdesign-<roomId>. The General
// Design thread uses the GENERAL_ROOM_ID channel. Members = current user + the
// project's assigned team + client, so designers/clients pass the membership rule.
const designChannelName = (roomId: string) => `design-${roomId}`.toLowerCase();

async function projectMemberUids(pid: string): Promise<string[]> {
  const snap = await getDoc(doc(db, 'projects', pid));
  const d = (snap.data() as any) || {};
  const ids = new Set<string>(
    [
      d.clientId,
      ...(Array.isArray(d.assignedUserIds) ? d.assignedUserIds : []),
    ].filter(Boolean)
  );
  if (uid()) ids.add(uid());
  return Array.from(ids);
}

/** Find-or-create the design channel for a room and return its id. */
export async function ensureRoomChannel(
  pid: string,
  roomId: string,
  _roomName: string
): Promise<string> {
  const wanted = designChannelName(roomId);
  const existing = await getDocs(
    query(
      collection(db, 'projects', pid, 'channels'),
      where('name', '==', wanted)
    )
  );
  if (!existing.empty) return existing.docs[0].id;
  const members = await projectMemberUids(pid);
  return createChannel(pid, wanted, members, {
    kind: 'design',
    createdBy: uid(),
  });
}

export function listenRoomMessages(
  pid: string,
  channelId: string,
  cb: (rows: ChatMessage[]) => void
) {
  return listenMessages(pid, channelId, cb);
}

export async function postRoomMessage(
  pid: string,
  channelId: string,
  text: string,
  opts?: { authorRole?: string }
): Promise<void> {
  await sendMessage(pid, channelId, {
    text,
    authorUid: uid(),
    authorName: actorName(),
    authorRole: opts?.authorRole,
  });
}

/**
 * Move/copy a message into a room thread. We create a NEW message in the target
 * room channel carrying the routing provenance the spec requires. (Firestore
 * message rules permit create-by-author; a true cross-author move would need a
 * Cloud Function, so we copy with attribution.)
 */
export async function copyMessageToRoom(
  pid: string,
  source: { channelId: string; message: ChatMessage; roomId: string },
  targetChannelId: string
): Promise<void> {
  const provenance = `↪︎ moved from General Design (${source.message.authorName}): `;
  await addDoc(
    collection(db, 'projects', pid, 'channels', targetChannelId, 'messages'),
    {
      text: provenance + source.message.text,
      authorUid: uid(),
      authorName: actorName(),
      createdAt: serverTimestamp(),
      originalMessageId: source.message.id,
      originalRoomId: source.roomId,
      movedBy: uid(),
      movedAt: serverTimestamp(),
    }
  );
}

// ── Notifications (reuse the catalog fire pipeline) ──────────────────────────
// Best-effort: fireTrigger never throws, so a notification failure never blocks
// the underlying design action. Audience is resolved server-side from projectId.

/** Designer/staff asked the client to review a mood board or selection. */
export async function notifyDesignReviewRequested(
  projectId: string,
  vars: { itemName: string; room: string; projectName: string }
): Promise<void> {
  await fireTrigger({
    kind: 'design_review_requested',
    projectId,
    payload: { ...vars, designerName: actorName() },
  });
}

/** The client approved / rejected / requested a revision on a design item. */
export async function notifyClientDecided(
  projectId: string,
  vars: {
    itemName: string;
    room: string;
    projectName: string;
    decision: string;
  }
): Promise<void> {
  await fireTrigger({
    kind: 'design_client_decided',
    projectId,
    payload: { ...vars, clientName: actorName() },
  });
}

export { GENERAL_ROOM_ID, GENERAL_ROOM_NAME };
export type { Channel, ChatMessage };
