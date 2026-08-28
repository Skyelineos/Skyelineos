// Project messaging on Firestore (replacing the dead /api/messaging system).
// Slack-like: per-project channels with real-time messages. Visibility is by
// channel membership (memberUids) — the client sees the channels they're in
// (their one centralized place); subs only see channels they've been added to.
//
//   projects/{projectId}/channels/{channelId}
//   projects/{projectId}/channels/{channelId}/messages/{messageId}

import {
  addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp,
  updateDoc, getDocs, getDoc, arrayUnion,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type ChannelKind = 'general' | 'design' | 'budget' | 'field' | 'trade' | 'custom';

export interface Channel {
  id: string;
  projectId: string;
  name: string;            // e.g. "general", "design", "electrical"
  kind: ChannelKind;
  tradeId?: string;        // for per-trade channels
  memberUids: string[];    // who can see this channel
  createdAt?: any;
  createdBy?: string;
  lastMessageAt?: any;
  lastMessageText?: string;
}

export interface ChatAttachment {
  url: string;
  type: 'image' | 'video';
  name: string;
  size?: number;
}

export interface ChatMessage {
  id: string;
  text: string;
  authorUid: string;
  authorName: string;
  authorRole?: string;
  mentions?: string[];     // uids/tradeIds @-tagged (Phase 2 notifications)
  attachments?: ChatAttachment[];
  createdAt?: any;
}

const channelsCol = (projectId: string) => collection(db, 'projects', projectId, 'channels');
const messagesCol = (projectId: string, channelId: string) =>
  collection(db, 'projects', projectId, 'channels', channelId, 'messages');

// Default channels seeded per project. `client` = visible to the homeowner too.
const DEFAULT_CHANNELS: { name: string; kind: ChannelKind; client: boolean }[] = [
  { name: 'general',  kind: 'general', client: true },
  { name: 'design',   kind: 'design',  client: true },
  { name: 'budget',   kind: 'budget',  client: true },
  { name: 'field',    kind: 'field',   client: false }, // internal team coordination
  { name: 'internal', kind: 'custom',  client: false }, // team-only back-channel
];

export function listenChannels(projectId: string, cb: (rows: Channel[]) => void) {
  const q = query(channelsCol(projectId), orderBy('createdAt', 'asc'));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
}

export function listenMessages(projectId: string, channelId: string, cb: (rows: ChatMessage[]) => void) {
  const q = query(messagesCol(projectId, channelId), orderBy('createdAt', 'asc'));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
}

/**
 * Create the default channels for a project if none exist yet. `teamUids` are
 * the GC/designer members (see everything); `clientUids` also get the
 * client-facing channels.
 */
export async function ensureDefaultChannels(
  projectId: string,
  teamUids: string[],
  clientUids: string[],
  createdBy?: string,
): Promise<void> {
  const existing = await getDocs(channelsCol(projectId));
  if (!existing.empty) return;
  const team = Array.from(new Set(teamUids.filter(Boolean)));
  const clients = Array.from(new Set(clientUids.filter(Boolean)));
  for (const c of DEFAULT_CHANNELS) {
    await addDoc(channelsCol(projectId), {
      projectId,
      name: c.name,
      kind: c.kind,
      memberUids: c.client ? Array.from(new Set([...team, ...clients])) : team,
      createdBy: createdBy ?? null,
      createdAt: serverTimestamp(),
    });
  }
}

/** Create (or return) a per-trade channel, with the awarded sub added. */
export async function createChannel(
  projectId: string,
  name: string,
  memberUids: string[],
  opts?: { kind?: ChannelKind; tradeId?: string; createdBy?: string },
): Promise<string> {
  const ref = await addDoc(channelsCol(projectId), {
    projectId,
    name: name.trim().toLowerCase().replace(/\s+/g, '-'),
    kind: opts?.kind ?? 'custom',
    ...(opts?.tradeId ? { tradeId: opts.tradeId } : {}),
    memberUids: Array.from(new Set(memberUids.filter(Boolean))),
    createdBy: opts?.createdBy ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Add members to a channel (e.g. tag a trade → pull its sub in). */
export async function addChannelMembers(projectId: string, channelId: string, uids: string[]): Promise<void> {
  if (!uids.length) return;
  await updateDoc(doc(db, 'projects', projectId, 'channels', channelId), {
    memberUids: arrayUnion(...uids.filter(Boolean)),
  });
}

export async function sendMessage(
  projectId: string,
  channelId: string,
  msg: {
    text: string;
    authorUid: string;
    authorName: string;
    authorRole?: string;
    mentions?: string[];
    attachments?: ChatAttachment[];
  },
): Promise<void> {
  const text = msg.text.trim();
  // Allow send if there's text OR attachments.
  if (!text && !msg.attachments?.length) return;
  await addDoc(messagesCol(projectId, channelId), {
    text,
    authorUid: msg.authorUid,
    authorName: msg.authorName,
    ...(msg.authorRole ? { authorRole: msg.authorRole } : {}),
    ...(msg.mentions?.length ? { mentions: msg.mentions } : {}),
    ...(msg.attachments?.length ? { attachments: msg.attachments } : {}),
    createdAt: serverTimestamp(),
  });
  // Denormalize last-message onto the channel for the list preview.
  const preview = text || (msg.attachments?.length ? `📎 ${msg.attachments[0].name}` : '');
  await updateDoc(doc(db, 'projects', projectId, 'channels', channelId), {
    lastMessageAt: serverTimestamp(),
    lastMessageText: preview.slice(0, 140),
  }).catch(() => {});
}

// ── Members + @mention tagging ───────────────────────────────────────────────

export interface Member { uid: string; name: string; role?: string; trade?: string }

// Cache the project→members resolution (single-tenant, small contacts set).
const memberCache = new Map<string, Member[]>();

/**
 * The people on a project (client + assigned team/subs/designer), resolved to
 * display names via the contacts directory. Used to drive @mention tagging.
 */
export async function loadProjectMembers(projectId: string): Promise<Member[]> {
  if (memberCache.has(projectId)) return memberCache.get(projectId)!;
  const proj = (await getDoc(doc(db, 'projects', projectId))).data() as any || {};
  const uids = new Set<string>([proj.clientId, ...(Array.isArray(proj.assignedUserIds) ? proj.assignedUserIds : [])].filter(Boolean));
  const members: Member[] = [];
  const seen = new Set<string>();
  try {
    const contacts = await getDocs(collection(db, 'contacts'));
    contacts.forEach(d => {
      const c = d.data() as any;
      const uid = c.linkedUserId;
      if (uid && uids.has(uid) && !seen.has(uid)) {
        seen.add(uid);
        members.push({ uid, name: c.name || c.displayName || 'Contact', role: c.role, trade: c.trade || c.tradeCategory });
      }
    });
  } catch { /* ignore */ }
  uids.forEach(uid => { if (!seen.has(uid)) members.push({ uid, name: 'Team member', role: 'team' }); });
  members.sort((a, b) => a.name.localeCompare(b.name));
  memberCache.set(projectId, members);
  return members;
}

/**
 * Pull tagged people into the channel and notify them — and only them. This is
 * what makes subs get pinged only when @-tagged (never on general chatter).
 * Reuses the notifications/{id} → dispatch fan-out (email/SMS/push).
 */
export async function notifyMentions(opts: {
  projectId: string; channelId: string; channelName: string;
  mentionUids: string[]; fromUid: string; fromName: string; text: string;
}): Promise<void> {
  const targets = Array.from(new Set(opts.mentionUids.filter(u => u && u !== opts.fromUid)));
  if (!targets.length) return;
  // Make sure tagged people can actually see the channel.
  await addChannelMembers(opts.projectId, opts.channelId, targets).catch(() => {});
  await Promise.all(targets.map(uid => addDoc(collection(db, 'notifications'), {
    userId: uid,
    kind: 'message_mention',
    title: `${opts.fromName} mentioned you in #${opts.channelName}`,
    body: opts.text.slice(0, 140),
    fromUserName: opts.fromName,
    link: '/',
    read: false,
    createdAt: serverTimestamp(),
  }).catch(() => {})));
}
