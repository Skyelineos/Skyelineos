// Communication Center — Action Items (Phase 2 foundation).
//
// Lightweight, manually-created action items that capture "someone needs to do
// X" out of a conversation. They deliberately live in their OWN collection
// (not the tasks system) so Phase 2 doesn't touch Scheduling/Tasks — the link to
// a real task/schedule item is a reserved hook (`linkedTaskId`) for Phase 3, when
// AI extraction can also create these. Each item points back to the originating
// communication so it's always traceable to the source.

import {
  addDoc, collection, doc, onSnapshot, orderBy, query, where,
  serverTimestamp, updateDoc, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SubjectRef } from './firestore';

export type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'dismissed';

export interface ActionItem {
  id: string;
  title: string;
  description?: string;
  assignedToUid?: string;
  assignedToName?: string;
  dueDate?: string;                // YYYY-MM-DD
  projectId?: string;
  clientId?: string;
  // Provenance — always traceable to the conversation it came from.
  sourceThreadId?: string;
  sourceMessageId?: string;
  status: ActionItemStatus;
  // Phase-3 hooks (reserved; not wired in Phase 2).
  linkedTaskId?: string | null;
  createdViaAi?: boolean;
  createdBy: string;
  createdByName?: string;
  createdAt?: any;
  updatedAt?: any;
}

const col = () => collection(db, 'actionItems');

export async function createActionItem(input: Omit<ActionItem, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
  status?: ActionItemStatus;
}): Promise<string> {
  const clean: any = {
    title: input.title.trim(),
    status: input.status ?? 'open',
    createdBy: input.createdBy,
    linkedTaskId: null,
    createdViaAi: input.createdViaAi ?? false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  for (const k of ['description', 'assignedToUid', 'assignedToName', 'dueDate', 'projectId', 'clientId', 'sourceThreadId', 'sourceMessageId', 'createdByName'] as const) {
    if ((input as any)[k]) clean[k] = (input as any)[k];
  }
  const ref = await addDoc(col(), clean);
  return ref.id;
}

export async function updateActionItem(id: string, patch: Partial<Pick<ActionItem,
  'title' | 'description' | 'assignedToUid' | 'assignedToName' | 'dueDate' | 'status' | 'linkedTaskId'>>): Promise<void> {
  await updateDoc(doc(db, 'actionItems', id), { ...patch, updatedAt: serverTimestamp() } as any);
}

/** Action items for a given subject (project/client). */
export function listenActionItemsForSubject(ref: SubjectRef, cb: (rows: ActionItem[]) => void): Unsubscribe {
  const field = ref.type === 'project' ? 'projectId' : 'clientId';
  const q = query(col(), where(field, '==', ref.id), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))), () => cb([]));
}

/** Action items attached to one thread (shown inline in the thread view). */
export function listenActionItemsForThread(threadId: string, cb: (rows: ActionItem[]) => void): Unsubscribe {
  const q = query(col(), where('sourceThreadId', '==', threadId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))), () => cb([]));
}

/**
 * Push an action item into the real Schedule/Tasks system. This is the Phase-3
 * deep-link that closes the loop: a conversation → action item → an actual task
 * the team works. It is purely ADDITIVE — it writes a new doc into the existing
 * `tasks` collection (the shape applyJobTemplate uses) and stamps the action
 * item's `linkedTaskId`. It never modifies the Tasks system's own code/logic.
 * Requires a project-scoped action item (tasks belong to a project). Idempotent.
 */
export async function pushActionItemToTasks(item: ActionItem, byUid: string): Promise<string> {
  if (item.linkedTaskId) return item.linkedTaskId;
  if (!item.projectId) throw new Error('This action item is not tied to a project, so it can\'t become a schedule task.');
  const ref = await addDoc(collection(db, 'tasks'), {
    title: item.title,
    name: item.title,
    description: item.description || '',
    projectId: item.projectId,
    category: 'Communication',
    assigneeRole: '',
    tags: ['communication'],
    ...(item.dueDate ? { dueDate: item.dueDate } : {}),
    status: 'todo',
    priority: 'medium',
    checklist: [],
    visibleToClient: false,
    // Provenance — traceable back to the conversation it came from.
    source: 'communication',
    sourceActionItemId: item.id,
    ...(item.sourceThreadId ? { sourceThreadId: item.sourceThreadId } : {}),
    createdAt: serverTimestamp(),
    createdBy: byUid,
  });
  await updateActionItem(item.id, { linkedTaskId: ref.id });
  return ref.id;
}
