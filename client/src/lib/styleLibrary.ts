// Style Discovery — curated image library + blind preference capture.
//
// The vision: a global, vetted library of renderings (the GC inputs them, tagged
// by named style + room) that clients react to with simple Like / Pass buttons.
// Crucially, the style NAME is never shown to the client during the flow — people
// talk themselves out of what they visually love to fit a label. We reveal the
// style only at the very end, derived from what they actually picked.
//
// Scoping: reactions + the computed profile are keyed by the client's CONTACT id
// (not a project), so a lead can run Design Discovery before a project exists.
// This mirrors how /inspiration is keyed (see InspirationBoard).
//
// Collections:
//   styleLibrary/{imageId}          — global, admin-curated image pool
//   styleReactions/{contactId__img} — one like/pass per image per contact
//   styleProfiles/{contactId}       — computed top styles + per-room lean

import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { STYLE_PROFILES, type StyleProfileSeed } from '@/lib/styleDiscovery';

// ── Canonical named styles (ids match STYLE_PROFILES keys) ───────────────────
export interface StyleDef {
  id: string;
  label: string;
}
export const STYLES: StyleDef[] = [
  { id: 'organic-modern', label: 'Organic Modern' },
  { id: 'mountain-modern', label: 'Mountain Modern' },
  { id: 'japandi', label: 'Japandi' },
  { id: 'transitional', label: 'Transitional' },
  { id: 'modern-farmhouse', label: 'Modern Farmhouse' },
  { id: 'scandinavian', label: 'Scandinavian' },
  { id: 'european-heritage', label: 'European Heritage' },
  { id: 'contemporary', label: 'Contemporary' },
  { id: 'mid-century-modern', label: 'Mid-Century Modern' },
  { id: 'traditional', label: 'Traditional' },
];
export const styleLabel = (id: string) =>
  STYLES.find((s) => s.id === id)?.label || id;
export const styleSeed = (id: string): StyleProfileSeed =>
  STYLE_PROFILES[id] || {
    materials: [],
    colors: [],
    mood: [],
    recommended: [],
  };

// ── Discovery rooms, in flow order: exterior FIRST, then interiors ───────────
export interface RoomDef {
  id: string;
  label: string;
}
export const DISCOVERY_ROOMS: RoomDef[] = [
  { id: 'exterior', label: 'Exterior' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'great-room', label: 'Great Room / Living' },
  { id: 'dining', label: 'Dining' },
  { id: 'primary-bed', label: 'Primary Bedroom' },
  { id: 'primary-bath', label: 'Primary Bath' },
  { id: 'office', label: 'Office / Study' },
  { id: 'outdoor', label: 'Outdoor Living' },
];
export const roomLabel = (id: string) =>
  DISCOVERY_ROOMS.find((r) => r.id === id)?.label || id;
export const roomOrder = (id: string) => {
  const i = DISCOVERY_ROOMS.findIndex((r) => r.id === id);
  return i === -1 ? 999 : i;
};

// ── Curated library image ────────────────────────────────────────────────────
export interface StyleLibraryImage {
  id: string;
  imageUrl: string;
  storagePath: string;
  styleId: string;
  styleLabel: string; // denormalized for admin/designer convenience
  room: string;
  roomLabel: string;
  title?: string | null;
  notes?: string | null;
  active: boolean;
  createdAt?: any;
  createdBy?: string;
}

export function subscribeStyleLibrary(
  cb: (imgs: StyleLibraryImage[]) => void,
  onErr?: (e: unknown) => void
) {
  return onSnapshot(
    collection(db, 'styleLibrary'),
    (snap) =>
      cb(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StyleLibraryImage)
      ),
    onErr
  );
}

export async function addStyleLibraryImage(
  data: Omit<StyleLibraryImage, 'id' | 'createdAt'>
) {
  const ref = await addDoc(collection(db, 'styleLibrary'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function setStyleLibraryActive(id: string, active: boolean) {
  await updateDoc(doc(db, 'styleLibrary', id), { active });
}

export async function deleteStyleLibraryImage(id: string) {
  await deleteDoc(doc(db, 'styleLibrary', id));
}

// ── Reactions (contact-scoped) ───────────────────────────────────────────────
export type Reaction = 'like' | 'pass';

export interface StyleReaction {
  id: string;
  clientContactId: string;
  clientUid: string;
  imageId: string;
  styleId: string;
  room: string;
  reaction: Reaction;
  createdAt?: any;
}

// Deterministic id => one reaction per image per contact (re-choosing overwrites).
export const reactionDocId = (contactId: string, imageId: string) =>
  `${contactId}__${imageId}`;

export async function saveReaction(
  contactId: string,
  uid: string,
  img: Pick<StyleLibraryImage, 'id' | 'styleId' | 'room'>,
  reaction: Reaction
) {
  await setDoc(
    doc(db, 'styleReactions', reactionDocId(contactId, img.id)),
    {
      clientContactId: contactId,
      clientUid: uid,
      imageId: img.id,
      styleId: img.styleId,
      room: img.room,
      reaction,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function subscribeReactions(
  contactId: string,
  cb: (rs: StyleReaction[]) => void,
  onErr?: (e: unknown) => void
) {
  return onSnapshot(
    query(
      collection(db, 'styleReactions'),
      where('clientContactId', '==', contactId)
    ),
    (snap) =>
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StyleReaction)),
    onErr
  );
}

// ── Profile computation ──────────────────────────────────────────────────────
export interface StyleTally {
  styleId: string;
  label: string;
  likes: number;
}

export interface StyleProfile {
  clientContactId: string;
  clientUid: string;
  top: StyleTally[]; // overall ranked styles by likes
  byRoom: Record<string, StyleTally[]>;
  totalLikes: number;
  totalSeen: number;
  completedAt?: any;
  updatedAt?: any;
}

export function computeProfile(reactions: StyleReaction[]): {
  top: StyleTally[];
  byRoom: Record<string, StyleTally[]>;
  totalLikes: number;
  totalSeen: number;
} {
  const likes = reactions.filter((r) => r.reaction === 'like');
  const tally = (rs: StyleReaction[]): StyleTally[] => {
    const counts: Record<string, number> = {};
    rs.forEach((r) => {
      counts[r.styleId] = (counts[r.styleId] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([styleId, n]) => ({
        styleId,
        label: styleLabel(styleId),
        likes: n,
      }))
      .sort((a, b) => b.likes - a.likes);
  };
  const byRoom: Record<string, StyleTally[]> = {};
  for (const room of DISCOVERY_ROOMS.map((r) => r.id)) {
    const roomLikes = likes.filter((r) => r.room === room);
    if (roomLikes.length) byRoom[room] = tally(roomLikes);
  }
  return {
    top: tally(likes),
    byRoom,
    totalLikes: likes.length,
    totalSeen: reactions.length,
  };
}

export async function saveStyleProfile(
  contactId: string,
  uid: string,
  computed: ReturnType<typeof computeProfile>
) {
  await setDoc(
    doc(db, 'styleProfiles', contactId),
    {
      clientContactId: contactId,
      clientUid: uid,
      ...computed,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function subscribeStyleProfile(
  contactId: string,
  cb: (p: StyleProfile | null) => void,
  onErr?: (e: unknown) => void
) {
  return onSnapshot(
    doc(db, 'styleProfiles', contactId),
    (d) => cb(d.exists() ? { ...(d.data() as StyleProfile) } : null),
    onErr
  );
}
