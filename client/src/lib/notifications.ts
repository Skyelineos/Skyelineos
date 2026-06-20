import { collection, addDoc, getDocs, query, serverTimestamp, doc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

// Spouse fan-out: when a notification targets a contact's linked user, find
// the contact's spouse (if any) and mirror the notification to them too so
// both halves of a household stay in sync. Best-effort; never throws.
async function resolveSpouseRecipientUid(targetUserId: string): Promise<string | null> {
  if (!targetUserId) return null;
  try {
    // Find the contact whose linkedUserId matches the original recipient.
    const snap = await getDocs(query(
      collection(db, 'contacts'),
      where('linkedUserId', '==', targetUserId),
    ));
    if (snap.empty) return null;
    const contact = snap.docs[0].data() as any;
    const spouseContactId = String(contact.spouseContactId || '');
    if (!spouseContactId) return null;
    // Look up the spouse contact to find their linkedUserId (if they have a portal account).
    const spouseSnap = await getDocs(query(
      collection(db, 'contacts'),
      where('__name__', '==', spouseContactId),
    ));
    if (spouseSnap.empty) return null;
    const spouse = spouseSnap.docs[0].data() as any;
    const spouseUid = String(spouse.linkedUserId || '');
    return spouseUid || null;
  } catch {
    return null;
  }
}

// Firestore-only notification system. Each notification is a document in
// `notifications/{notifId}` with a `userId` for the recipient. The recipient's
// app subscribes via onSnapshot scoped by userId. No backend required.
//
// Email/SMS firing is a future Phase 3 — needs Blaze plan + Cloud Functions or
// a 3rd-party trigger service.

export type NotificationKind =
  | 'task_assigned'
  | 'task_due'
  | 'task_completed'
  | 'walkthrough_assigned'
  | 'change_order_submitted'
  | 'change_order_approved'
  | 'estimate_accepted'
  | 'invoice_overdue'
  | 'rfi_created'
  | 'rfi_answered'
  | 'message'
  | 'system';

export interface NotificationPayload {
  userId: string;       // recipient
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;        // in-app route to open on click
  projectId?: string;
  // Optional context — useful for grouping/dedup
  refType?: 'task' | 'walkthrough' | 'changeOrder' | 'estimate' | 'invoice' | 'rfi' | 'message';
  refId?: string;
  // Sender context
  fromUserId?: string;
  fromUserName?: string;
}

export async function createNotification(p: NotificationPayload) {
  if (!p.userId) return; // unassigned tasks shouldn't blow up
  try {
    await addDoc(collection(db, 'notifications'), {
      ...p,
      read: false,
      createdAt: serverTimestamp(),
    });
    // Mirror to spouse if the recipient is part of a household.
    const spouseUid = await resolveSpouseRecipientUid(p.userId);
    if (spouseUid && spouseUid !== p.userId) {
      await addDoc(collection(db, 'notifications'), {
        ...p,
        userId: spouseUid,
        read: false,
        createdAt: serverTimestamp(),
        mirroredFromSpouseUid: p.userId,
      });
    }
  } catch (e) {
    // Notifications are best-effort — never break the calling flow
    console.warn('[notifications] create failed', e);
  }
}

// Bulk create — used when applying a job template to a project (one notification
// per assigned task can hit Firestore write limits if done sequentially).
// Each payload is also mirrored to the recipient's spouse if one exists.
export async function createNotificationsBatch(payloads: NotificationPayload[]) {
  if (payloads.length === 0) return;
  try {
    // Resolve spouse mirrors first (parallel reads) so we can commit in one batch.
    const mirrors = await Promise.all(payloads.map(async p => {
      if (!p.userId) return null;
      const spouseUid = await resolveSpouseRecipientUid(p.userId);
      return spouseUid && spouseUid !== p.userId
        ? { ...p, userId: spouseUid, mirroredFromSpouseUid: p.userId }
        : null;
    }));
    const all = [
      ...payloads,
      ...mirrors.filter((m): m is NotificationPayload & { mirroredFromSpouseUid: string } => !!m),
    ];
    const batch = writeBatch(db);
    const col = collection(db, 'notifications');
    for (const p of all) {
      if (!p.userId) continue;
      const ref = doc(col);
      batch.set(ref, { ...p, read: false, createdAt: serverTimestamp() });
    }
    await batch.commit();
  } catch (e) {
    console.warn('[notifications] batch create failed', e);
  }
}

export async function markNotificationRead(notificationId: string) {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (e) {
    console.warn('[notifications] mark read failed', e);
  }
}


// ── Wave-2: route through fireTrigger ───────────────────────────────────────
// Every notification-producing event in the client should call fireTrigger
// instead of createNotification so audience resolution + per-user prefs +
// SMS/email/push fan-out run server-side. See shared/notifications-catalog.ts
// for the list of kinds and `POST /api/notifications/fire` (functions side)
// for the auth-gated endpoint that actually fans out.
import { auth } from './firebase';
import type { TriggerKind } from '@shared/notifications-catalog';

export interface FireTriggerOptions {
  /** Catalog trigger kind (e.g. 'walkthrough_assigned'). */
  kind: TriggerKind;
  /** Project context for audience resolution (server expands to recipients). */
  projectId?: string;
  /** Per-kind template variables: server renders title/body/email/sms. */
  payload?: Record<string, any>;
  /** For single_uid kinds: pin the recipient explicitly. */
  targetUserIds?: string[];
}

/**
 * Fire a notification trigger through the server pipeline.
 * Best-effort: never throws into the caller, so a failure here doesn't break
 * the surrounding business action (e.g. the doc still gets saved).
 */
export async function fireTrigger(opts: FireTriggerOptions): Promise<{ ok: boolean; recipientsCount?: number; error?: string }> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { ok: false, error: 'not signed in' };
    const res = await fetch('/api/notifications/fire', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        kind: opts.kind,
        projectId: opts.projectId,
        payload: opts.payload || {},
        overrides: opts.targetUserIds && opts.targetUserIds.length
          ? { targetUserIds: opts.targetUserIds }
          : undefined,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[fireTrigger] non-200', res.status, text);
      return { ok: false, error: `http ${res.status}` };
    }
    const json = await res.json().catch(() => ({}));
    return { ok: true, recipientsCount: json?.recipientsCount };
  } catch (e: any) {
    console.warn('[fireTrigger] failed', e);
    return { ok: false, error: e?.message || 'fetch failed' };
  }
}
