import { collection, addDoc, serverTimestamp, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

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
  refType?: 'task' | 'walkthrough' | 'changeOrder' | 'estimate' | 'invoice' | 'message';
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
  } catch (e) {
    // Notifications are best-effort — never break the calling flow
    console.warn('[notifications] create failed', e);
  }
}

// Bulk create — used when applying a job template to a project (one notification
// per assigned task can hit Firestore write limits if done sequentially).
export async function createNotificationsBatch(payloads: NotificationPayload[]) {
  if (payloads.length === 0) return;
  try {
    const batch = writeBatch(db);
    const col = collection(db, 'notifications');
    for (const p of payloads) {
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
