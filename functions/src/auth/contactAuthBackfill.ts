// One-shot backfill: scan every contact doc and ensure they have a
// Firebase Auth account + matching users/{uid} doc + linkedUserId.
//
// Runs on a 5-minute schedule. Bails immediately after the first
// successful run (writes a marker doc to `_admin/contactAuthBackfill`)
// so it doesn't repeat work on subsequent ticks.
//
// Why scheduled rather than HTTP-callable: the project's GCP org policy
// blocks the allUsers invoker grant that callable Cloud Functions need.
// Scheduled and Firestore-triggered functions don't have that
// restriction — they're invoked by Cloud Scheduler / Eventarc, not by
// the public web.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function deriveUserRole(contactRole: string | undefined): string {
  switch ((contactRole || '').toLowerCase()) {
    case 'client':
    case 'homeowner':
      return 'client';
    case 'designer':
      return 'designer';
    case 'team':
    case 'employee':
      return 'pending_team';
    case 'subcontractor':
    case 'sub':
    case 'vendor':
    case 'supplier':
    default:
      return 'sub';
  }
}

export const oneShotContactAuthBackfill = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/Denver',
  },
  async () => {
    const markerRef = db.collection('_admin').doc('contactAuthBackfill');
    const marker = await markerRef.get();
    if (marker.exists) {
      const m = marker.data() as any;
      // Stay idle only after a clean run. If the last run had errors
      // (e.g. while we were still wiring up IAM permissions), retry.
      if (m.completed === true && (m.errors ?? 0) === 0) return;
    }

    console.log('[contactAuthBackfill] starting…');
    const contactsSnap = await db.collection('contacts').get();
    const targets = contactsSnap.docs.filter(d => {
      const data = d.data() as any;
      if (!data.email || typeof data.email !== 'string') return false;
      if (data.linkedUserId) return false;
      if (data.isActive === false) return false;
      return data.email.trim().includes('@');
    });

    let created = 0;
    let linked = 0;
    let errors = 0;
    let skipped = 0;

    for (const contactDoc of targets) {
      const contact = contactDoc.data() as any;
      const email = String(contact.email).trim().toLowerCase();

      // De-duplicate: if another contact in this batch already grabbed
      // this email's UID, skip.
      let uid: string | null = null;
      try {
        const existing = await admin.auth().getUserByEmail(email);
        uid = existing.uid;
        linked += 1;
      } catch (err: any) {
        if (err?.code !== 'auth/user-not-found') {
          console.error('[contactAuthBackfill] getUserByEmail failed:', err);
          errors += 1;
          continue;
        }
      }

      if (!uid) {
        // Contact has not gone through the sign-up flow. Skip — we do
        // NOT bulk-create accounts for the whole rolodex. They can sign
        // up themselves via Create Account when they need access.
        skipped += 1;
        continue;
      }

      const userRef = db.collection('users').doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        await userRef.set({
          email,
          name: contact.name || '',
          role: deriveUserRole(contact.role),
          linkedContactId: contactDoc.id,
          active: true,
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: 'system:contactAuthBackfill',
        });
      } else if (!(userSnap.data() as any).linkedContactId) {
        await userRef.set(
          {
            linkedContactId: contactDoc.id,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      await contactDoc.ref.update({
        linkedUserId: uid,
        hasPortalAccess: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await markerRef.set({
      completed: true,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      processed: targets.length,
      created,
      linked,
      errors,
      skipped,
    });

    console.log(`[contactAuthBackfill] done — processed=${targets.length} created=${created} linked=${linked} errors=${errors}`);
  },
);
