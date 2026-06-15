// Communication Center — the lifecycle-spanning conversation store (Phase 1).
//
// A conversation begins when someone becomes a lead and continues, as the same
// thread, through design → estimate → contract → construction → warranty. To do
// that, a thread is NOT nested under a project. It is a top-level document keyed
// by a `subjectRef` ({ type: 'lead' | 'client' | 'project', id }) that gets
// re-pointed (not copied) when a lead converts — the full trail is preserved in
// `subjectChain` so history is never lost.
//
//   communications/{threadId}
//   communications/{threadId}/messages/{messageId}
//   communications/{threadId}/extractions/{extractionId}   (AI output — P3; CF-write-only)
//
// This intentionally mirrors the proven project-channels model
// (lib/messaging/firestore.ts): membership-based visibility (`memberUids`),
// @mention tagging that reuses the notifications/{id} → dispatch fan-out, and a
// denormalized last-message preview for fast list rendering.

import {
  addDoc, collection, doc, onSnapshot, orderBy, query, where, limit as qlimit,
  serverTimestamp, updateDoc, getDoc, arrayUnion, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Taxonomy ─────────────────────────────────────────────────────────────────

export type SubjectType = 'lead' | 'client' | 'project';

export interface SubjectRef {
  type: SubjectType;
  id: string;
}

/** Conversation categories — the spine of how comms are organized + filtered. */
export const COMM_CATEGORIES = [
  'general', 'sales', 'design', 'selections', 'budget', 'schedule',
  'construction', 'trade', 'change_orders', 'issues', 'warranty', 'internal',
] as const;
export type CommCategory = (typeof COMM_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CommCategory, string> = {
  general: 'General', sales: 'Sales', design: 'Design', selections: 'Selections',
  budget: 'Budget', schedule: 'Schedule', construction: 'Construction',
  trade: 'Trade Coordination', change_orders: 'Change Orders', issues: 'Issues',
  warranty: 'Warranty', internal: 'Internal',
};

/** A thread is the container; an item posted into it carries its own `type`. */
export type CommThreadKind = 'thread' | 'phone_call' | 'meeting' | 'voice_memo';

export type CommMessageType =
  | 'text' | 'file' | 'photo' | 'video' | 'audio'
  | 'call_log' | 'meeting_record' | 'system' | 'ai_note';

/** Who is allowed to see a thread. Enforced in firestore.rules, mirrored here. */
export type Visibility = 'internal' | 'client' | 'trade' | 'restricted';

export type CommStatus = 'open' | 'resolved' | 'archived';
export type CommPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface CommAttachment {
  name: string;
  url: string;
  storagePath?: string;
  contentType?: string;
  size?: number;
}

export interface CommThread {
  id: string;
  subjectRef: SubjectRef;
  subjectChain: string[];       // ['lead:abc', 'project:xyz'] — full lifecycle trail
  subjectLabel?: string;        // denormalized name for list display
  title: string;
  category: CommCategory;
  kind: CommThreadKind;
  memberUids: string[];
  visibility: Visibility;
  tradeIds: string[];
  status: CommStatus;
  priority?: CommPriority;
  lastMessageAt?: any;
  lastMessageText?: string;
  createdAt?: any;
  createdBy?: string;
  createdByName?: string;
}

export interface CommMessage {
  id: string;
  type: CommMessageType;
  text: string;
  authorUid: string;
  authorName: string;
  authorRole?: string;
  mentions?: string[];          // uids @-tagged → notified
  tradeIds?: string[];
  attachments?: CommAttachment[];
  parentId?: string;            // threaded replies
  visibility?: Visibility;      // inherits the thread's unless overridden
  source?: 'app' | 'phone' | 'meeting' | 'ingestion' | 'ai';
  createdAt?: any;
}

// ── Collection refs ──────────────────────────────────────────────────────────

const threadsCol = () => collection(db, 'communications');
const messagesCol = (threadId: string) =>
  collection(db, 'communications', threadId, 'messages');

export const subjectKey = (ref: SubjectRef) => `${ref.type}:${ref.id}`;

// ── Threads ──────────────────────────────────────────────────────────────────

/**
 * Listen to the most recently-active threads (newest first). The hub filters by
 * category / trade / visibility / text client-side over this set; rules still
 * gate what a non-staff user can actually read.
 */
export function listenThreads(cb: (rows: CommThread[]) => void, max = 200): Unsubscribe {
  const q = query(threadsCol(), orderBy('lastMessageAt', 'desc'), qlimit(max));
  return onSnapshot(
    q,
    snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
    () => cb([]),
  );
}

/** Listen to every thread attached to one subject (lead, client, or project). */
export function listenThreadsForSubject(ref: SubjectRef, cb: (rows: CommThread[]) => void): Unsubscribe {
  const q = query(
    threadsCol(),
    where('subjectRef.type', '==', ref.type),
    where('subjectRef.id', '==', ref.id),
    orderBy('lastMessageAt', 'desc'),
  );
  return onSnapshot(
    q,
    snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
    () => cb([]),
  );
}

export async function createThread(input: {
  subjectRef: SubjectRef;
  subjectLabel?: string;
  title: string;
  category: CommCategory;
  kind?: CommThreadKind;
  memberUids: string[];
  visibility?: Visibility;
  tradeIds?: string[];
  priority?: CommPriority;
  createdBy: string;
  createdByName?: string;
}): Promise<string> {
  const ref = await addDoc(threadsCol(), {
    subjectRef: input.subjectRef,
    subjectChain: [subjectKey(input.subjectRef)],
    ...(input.subjectLabel ? { subjectLabel: input.subjectLabel } : {}),
    title: input.title.trim() || 'Untitled',
    category: input.category,
    kind: input.kind ?? 'thread',
    memberUids: Array.from(new Set(input.memberUids.filter(Boolean))),
    visibility: input.visibility ?? 'internal',
    tradeIds: Array.from(new Set((input.tradeIds ?? []).filter(Boolean))),
    status: 'open' as CommStatus,
    ...(input.priority ? { priority: input.priority } : {}),
    lastMessageAt: serverTimestamp(),
    lastMessageText: '',
    createdAt: serverTimestamp(),
    createdBy: input.createdBy,
    ...(input.createdByName ? { createdByName: input.createdByName } : {}),
  });
  return ref.id;
}

/**
 * Re-point a thread to a new subject as the lead progresses through the
 * lifecycle (e.g. lead → project on conversion). The current subject becomes the
 * head and the full history is preserved in `subjectChain`, so the conversation
 * carries forward intact rather than being copied or orphaned.
 */
export async function repointThreadSubject(threadId: string, newRef: SubjectRef, newLabel?: string): Promise<void> {
  await updateDoc(doc(db, 'communications', threadId), {
    subjectRef: newRef,
    subjectChain: arrayUnion(subjectKey(newRef)),
    ...(newLabel ? { subjectLabel: newLabel } : {}),
  });
}

export async function updateThread(threadId: string, patch: Partial<Pick<CommThread,
  'title' | 'category' | 'visibility' | 'tradeIds' | 'status' | 'priority'>>): Promise<void> {
  await updateDoc(doc(db, 'communications', threadId), patch as any);
}

export async function addThreadMembers(threadId: string, uids: string[]): Promise<void> {
  const clean = uids.filter(Boolean);
  if (!clean.length) return;
  await updateDoc(doc(db, 'communications', threadId), { memberUids: arrayUnion(...clean) });
}

// ── Messages ─────────────────────────────────────────────────────────────────

export function listenMessages(threadId: string, cb: (rows: CommMessage[]) => void): Unsubscribe {
  const q = query(messagesCol(threadId), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
    () => cb([]),
  );
}

export async function postMessage(threadId: string, msg: {
  text: string;
  authorUid: string;
  authorName: string;
  authorRole?: string;
  type?: CommMessageType;
  mentions?: string[];
  tradeIds?: string[];
  attachments?: CommAttachment[];
  parentId?: string;
  source?: CommMessage['source'];
}): Promise<void> {
  const text = (msg.text || '').trim();
  const attachments = msg.attachments ?? [];
  if (!text && attachments.length === 0) return;
  await addDoc(messagesCol(threadId), {
    type: msg.type ?? (attachments.length && !text ? 'file' : 'text'),
    text,
    authorUid: msg.authorUid,
    authorName: msg.authorName,
    ...(msg.authorRole ? { authorRole: msg.authorRole } : {}),
    ...(msg.mentions?.length ? { mentions: msg.mentions } : {}),
    ...(msg.tradeIds?.length ? { tradeIds: msg.tradeIds } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(msg.parentId ? { parentId: msg.parentId } : {}),
    source: msg.source ?? 'app',
    createdAt: serverTimestamp(),
  });
  // Denormalize the last-message preview onto the thread for the list view.
  await updateDoc(doc(db, 'communications', threadId), {
    lastMessageAt: serverTimestamp(),
    lastMessageText: (text || `📎 ${attachments[0]?.name ?? 'attachment'}`).slice(0, 140),
  }).catch(() => {});
}

/**
 * Pull @-tagged people into the thread and notify them — and only them — by
 * reusing the existing notifications/{id} → dispatch fan-out (email/SMS/push).
 * Same contract as lib/messaging/firestore.ts notifyMentions.
 */
export async function notifyThreadMentions(opts: {
  threadId: string; threadTitle: string;
  mentionUids: string[]; fromUid: string; fromName: string; text: string;
}): Promise<void> {
  const targets = Array.from(new Set(opts.mentionUids.filter(u => u && u !== opts.fromUid)));
  if (!targets.length) return;
  await addThreadMembers(opts.threadId, targets).catch(() => {});
  await Promise.all(targets.map(uid => addDoc(collection(db, 'notifications'), {
    userId: uid,
    kind: 'message_mention',
    title: `${opts.fromName} mentioned you in "${opts.threadTitle}"`,
    body: opts.text.slice(0, 140),
    fromUserName: opts.fromName,
    link: `/communications?thread=${opts.threadId}`,
    read: false,
    createdAt: serverTimestamp(),
  }).catch(() => {})));
}

// ── Members / @mention resolution ────────────────────────────────────────────

export interface CommMember { uid: string; name: string; role?: string; trade?: string }

/**
 * Resolve a subject (lead/client/project) to the people who can be @-mentioned.
 * For a project this is the assigned team + client; for a lead/client it's the
 * internal team plus the linked contact. Names come from the contacts directory.
 */
export async function loadSubjectMembers(ref: SubjectRef): Promise<CommMember[]> {
  const { getDocs } = await import('firebase/firestore');
  const members: CommMember[] = [];
  const seen = new Set<string>();
  const push = (m: CommMember) => { if (m.uid && !seen.has(m.uid)) { seen.add(m.uid); members.push(m); } };

  try {
    if (ref.type === 'project') {
      const proj = (await getDoc(doc(db, 'projects', ref.id))).data() as any || {};
      const uids = new Set<string>([proj.clientId, ...(Array.isArray(proj.assignedUserIds) ? proj.assignedUserIds : [])].filter(Boolean));
      const contacts = await getDocs(collection(db, 'contacts'));
      contacts.forEach(d => {
        const c = d.data() as any;
        if (c.linkedUserId && uids.has(c.linkedUserId)) {
          push({ uid: c.linkedUserId, name: c.name || c.displayName || 'Contact', role: c.role, trade: c.trade || c.tradeCategory });
        }
      });
    } else {
      // lead/client: the linked contact (if any) + internal team members.
      const contacts = await getDocs(collection(db, 'contacts'));
      contacts.forEach(d => {
        const c = d.data() as any;
        const isTeam = /gc|admin|projectmanager|designer|estimator/i.test(c.role || '');
        const isThisContact = d.id === ref.id || c.linkedUserId === ref.id;
        if (c.linkedUserId && (isTeam || isThisContact)) {
          push({ uid: c.linkedUserId, name: c.name || c.displayName || 'Contact', role: c.role, trade: c.trade || c.tradeCategory });
        }
      });
    }
  } catch { /* ignore — names degrade gracefully */ }

  members.sort((a, b) => a.name.localeCompare(b.name));
  return members;
}
