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
  serverTimestamp, updateDoc, getDoc, getDocs, arrayUnion, type Unsubscribe,
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
  updatedAt?: any;
  createdBy?: string;
  createdByName?: string;
  // Structured metadata for phone_call / meeting threads. The narrative notes
  // live as the thread's first message; these are the record's facts.
  participants?: string[];      // free-text names of who was on the call/meeting
  occurredAt?: any;             // when the call/meeting happened (vs createdAt)
  summary?: string;            // human summary (NOT an AI summary — see aiSummary)
  followUp?: string;           // follow-up note for phone calls
  // Phase-3 AI placeholders (reserved; never written by Phase 2 UI). Kept on the
  // thread so meeting records have a home for transcription output later.
  transcriptStatus?: 'none' | 'pending' | 'ready';
  aiSummary?: string | null;
}

/** Who sent a message — drives display + (future) AI provenance. */
export type SenderType = 'internal' | 'client' | 'trade' | 'system' | 'ai';

/** Where a message originated. Mirrors the Phase 2 spec's sourceType list. */
export type SourceType =
  | 'message' | 'phone_call' | 'meeting_note' | 'uploaded_file' | 'ai_summary';

export interface CommMessage {
  id: string;
  type: CommMessageType;
  text: string;
  authorUid: string;
  authorName: string;
  authorRole?: string;
  senderType?: SenderType;
  sourceType?: SourceType;
  mentions?: string[];          // uids @-tagged → notified
  tradeIds?: string[];
  attachments?: CommAttachment[];
  parentId?: string;            // threaded replies
  visibility?: Visibility;      // inherits the thread's unless overridden
  source?: 'app' | 'phone' | 'meeting' | 'ingestion' | 'ai';
  editedAt?: any;
  createdAt?: any;
}

/** Map an app role to a Communication Center sender type. */
export function senderTypeForRole(role?: string): SenderType {
  const r = (role || '').toLowerCase();
  if (/admin|gc|projectmanager|designer|estimator|staff/.test(r)) return 'internal';
  if (/client|owner|home/.test(r)) return 'client';
  if (/sub|trade|vendor/.test(r)) return 'trade';
  return 'internal';
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
  senderType?: SenderType;
  sourceType?: SourceType;
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
  const senderType = msg.senderType ?? senderTypeForRole(msg.authorRole);
  await addDoc(messagesCol(threadId), {
    type: msg.type ?? (attachments.length && !text ? 'file' : 'text'),
    text,
    authorUid: msg.authorUid,
    authorName: msg.authorName,
    ...(msg.authorRole ? { authorRole: msg.authorRole } : {}),
    senderType,
    sourceType: msg.sourceType ?? (attachments.length && !text ? 'uploaded_file' : 'message'),
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
    updatedAt: serverTimestamp(),
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

// ── Get-or-create the default thread (powers the simple client messenger) ─────

/**
 * Find — or create — the General conversation for a subject. This is what makes
 * the client messaging experience one-tap: the homeowner never picks a thread,
 * they just type and send into their project's General thread, which is created
 * on first use if it doesn't exist yet.
 *
 * `seedMemberUids` are added to the thread; `visibility` defaults to
 * 'client' so the homeowner can see it. Returns the thread id.
 */
export async function ensureSubjectThread(opts: {
  subjectRef: SubjectRef;
  subjectLabel?: string;
  category?: CommCategory;
  visibility?: Visibility;
  seedMemberUids: string[];
  createdBy: string;
  createdByName?: string;
}): Promise<string> {
  const category = opts.category ?? 'general';
  // Look for an existing matching thread on this subject.
  try {
    const q = query(
      threadsCol(),
      where('subjectRef.type', '==', opts.subjectRef.type),
      where('subjectRef.id', '==', opts.subjectRef.id),
      where('category', '==', category),
      where('kind', '==', 'thread'),
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const existing = snap.docs[0];
      // Make sure the caller is a member so they can read their own thread.
      await addThreadMembers(existing.id, opts.seedMemberUids).catch(() => {});
      return existing.id;
    }
  } catch { /* fall through to create */ }
  return createThread({
    subjectRef: opts.subjectRef,
    subjectLabel: opts.subjectLabel,
    title: category === 'general' ? 'General' : CATEGORY_LABELS[category],
    category,
    kind: 'thread',
    memberUids: opts.seedMemberUids,
    visibility: opts.visibility ?? 'client',
    createdBy: opts.createdBy,
    createdByName: opts.createdByName,
  });
}

// ── Phone call + meeting records (live in the Center as typed threads) ────────

/**
 * Log a phone call as a thread (kind 'phone_call'). The structured facts live on
 * the thread; the narrative notes become its first message so the call is fully
 * searchable alongside every other conversation. Internal-only by default.
 */
export async function createPhoneCallThread(input: {
  subjectRef: SubjectRef; subjectLabel?: string;
  title: string; participants?: string[]; occurredAt?: Date;
  notes?: string; summary?: string; followUp?: string;
  visibility?: Visibility; createdBy: string; createdByName?: string;
}): Promise<string> {
  const id = await addDoc(threadsCol(), {
    subjectRef: input.subjectRef,
    subjectChain: [subjectKey(input.subjectRef)],
    ...(input.subjectLabel ? { subjectLabel: input.subjectLabel } : {}),
    title: input.title.trim() || 'Phone call',
    category: 'general' as CommCategory,
    kind: 'phone_call' as CommThreadKind,
    memberUids: [input.createdBy],
    visibility: input.visibility ?? 'internal',
    tradeIds: [],
    status: 'open' as CommStatus,
    ...(input.participants?.length ? { participants: input.participants } : {}),
    occurredAt: input.occurredAt ?? serverTimestamp(),
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.followUp ? { followUp: input.followUp } : {}),
    lastMessageAt: serverTimestamp(),
    lastMessageText: (input.notes || input.summary || 'Phone call logged').slice(0, 140),
    createdAt: serverTimestamp(),
    createdBy: input.createdBy,
    ...(input.createdByName ? { createdByName: input.createdByName } : {}),
  });
  if (input.notes?.trim()) {
    await postMessage(id.id, {
      text: input.notes, authorUid: input.createdBy, authorName: input.createdByName ?? 'Staff',
      type: 'call_log', sourceType: 'phone_call', source: 'phone', senderType: 'internal',
    }).catch(() => {});
  }
  return id.id;
}

/**
 * Create a meeting record (kind 'meeting'). Audio/video are attached to the
 * first message; transcript / AI-summary / decisions / action-items are left as
 * reserved placeholders for Phase 3 — the architecture is here, not the AI.
 */
export async function createMeetingThread(input: {
  subjectRef: SubjectRef; subjectLabel?: string;
  title: string; participants?: string[]; occurredAt?: Date;
  notes?: string; attachments?: CommAttachment[];
  visibility?: Visibility; createdBy: string; createdByName?: string;
}): Promise<string> {
  const id = await addDoc(threadsCol(), {
    subjectRef: input.subjectRef,
    subjectChain: [subjectKey(input.subjectRef)],
    ...(input.subjectLabel ? { subjectLabel: input.subjectLabel } : {}),
    title: input.title.trim() || 'Meeting',
    category: 'general' as CommCategory,
    kind: 'meeting' as CommThreadKind,
    memberUids: [input.createdBy],
    visibility: input.visibility ?? 'internal',
    tradeIds: [],
    status: 'open' as CommStatus,
    ...(input.participants?.length ? { participants: input.participants } : {}),
    occurredAt: input.occurredAt ?? serverTimestamp(),
    transcriptStatus: 'none' as const,   // Phase 3 placeholder
    aiSummary: null,                      // Phase 3 placeholder
    lastMessageAt: serverTimestamp(),
    lastMessageText: (input.notes || 'Meeting record').slice(0, 140),
    createdAt: serverTimestamp(),
    createdBy: input.createdBy,
    ...(input.createdByName ? { createdByName: input.createdByName } : {}),
  });
  if (input.notes?.trim() || input.attachments?.length) {
    await postMessage(id.id, {
      text: input.notes ?? '', authorUid: input.createdBy, authorName: input.createdByName ?? 'Staff',
      type: 'meeting_record', sourceType: 'meeting_note', source: 'meeting', senderType: 'internal',
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    }).catch(() => {});
  }
  return id.id;
}

// ── Trade tagging ─────────────────────────────────────────────────────────────

/** Set the trade/vendor tags on a thread (contact ids of subs/vendors). */
export async function setThreadTrades(threadId: string, tradeIds: string[]): Promise<void> {
  await updateDoc(doc(db, 'communications', threadId), {
    tradeIds: Array.from(new Set(tradeIds.filter(Boolean))),
    updatedAt: serverTimestamp(),
  });
}

// ── Subject options (shared by the create/log modals) ────────────────────────

export interface SubjectOption { key: string; type: SubjectType; id: string; label: string }

/** Load all leads/clients/projects as pickable subjects for the modals. */
export async function loadSubjectOptions(): Promise<SubjectOption[]> {
  const opts: SubjectOption[] = [];
  try {
    const projs = await getDocs(collection(db, 'projects'));
    projs.forEach(d => {
      const p = d.data() as any;
      opts.push({ key: `project:${d.id}`, type: 'project', id: d.id, label: `📁 ${p.name || p.clientName || 'Untitled project'}` });
    });
  } catch { /* ignore */ }
  try {
    // Leads + clients both live in the `clients` collection (lead intake → clients).
    const clients = await getDocs(collection(db, 'clients'));
    clients.forEach(d => {
      const c = d.data() as any;
      const isLead = (c.status || c.stage || '').toString().toLowerCase().includes('lead') || c.isLead;
      const t: SubjectType = isLead ? 'lead' : 'client';
      const name = c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Contact';
      opts.push({ key: `${t}:${d.id}`, type: t, id: d.id, label: `${isLead ? '🌱' : '👤'} ${name}` });
    });
  } catch { /* ignore */ }
  return opts;
}

export interface VendorOption { id: string; name: string; trade?: string; company?: string }

/** Load taggable vendors/subs/designers from the contacts directory. */
export async function loadTaggableVendors(): Promise<VendorOption[]> {
  const out: VendorOption[] = [];
  try {
    const contacts = await getDocs(collection(db, 'contacts'));
    contacts.forEach(d => {
      const c = d.data() as any;
      const role = (c.role || c.type || '').toLowerCase();
      if (/sub|trade|vendor|designer/.test(role)) {
        const trade = c.trade || c.tradeCategory || (Array.isArray(c.trades) ? c.trades[0] : undefined);
        out.push({ id: d.id, name: c.name || c.displayName || c.company || 'Vendor', trade, company: c.company });
      }
    });
  } catch { /* ignore */ }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
