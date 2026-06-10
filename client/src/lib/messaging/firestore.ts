// Project messaging on Firestore (replacing the dead /api/messaging system).
// Slack-like: per-project channels with real-time messages. Visibility is by
// channel membership (memberUids) — the client sees the channels they're in
// (their one centralized place); subs only see channels they've been added to.
//
//   projects/{projectId}/channels/{channelId}
//   projects/{projectId}/channels/{channelId}/messages/{messageId}

import {
  addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp,
  updateDoc, getDocs, arrayUnion,
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

export interface ChatMessage {
  id: string;
  text: string;
  authorUid: string;
  authorName: string;
  authorRole?: string;
  mentions?: string[];     // uids/tradeIds @-tagged (Phase 2 notifications)
  attachments?: { name: string; url: string }[];
  createdAt?: any;
}

const channelsCol = (projectId: string) => collection(db, 'projects', projectId, 'channels');
const messagesCol = (projectId: string, channelId: string) =>
  collection(db, 'projects', projectId, 'channels', channelId, 'messages');

// Default channels seeded per project. `client` = visible to the homeowner too.
const DEFAULT_CHANNELS: { name: string; kind: ChannelKind; client: boolean }[] = [
  { name: 'general', kind: 'general', client: true },
  { name: 'design',  kind: 'design',  client: true },
  { name: 'budget',  kind: 'budget',  client: true },
  { name: 'field',   kind: 'field',   client: false }, // internal team coordination
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
  msg: { text: string; authorUid: string; authorName: string; authorRole?: string; mentions?: string[] },
): Promise<void> {
  const text = msg.text.trim();
  if (!text) return;
  await addDoc(messagesCol(projectId, channelId), {
    text,
    authorUid: msg.authorUid,
    authorName: msg.authorName,
    ...(msg.authorRole ? { authorRole: msg.authorRole } : {}),
    ...(msg.mentions?.length ? { mentions: msg.mentions } : {}),
    createdAt: serverTimestamp(),
  });
  // Denormalize last-message onto the channel for the list preview.
  await updateDoc(doc(db, 'projects', projectId, 'channels', channelId), {
    lastMessageAt: serverTimestamp(),
    lastMessageText: text.slice(0, 140),
  }).catch(() => {});
}
