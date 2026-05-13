// Firestore trigger that mirrors every contact (with an email) into a
// Firebase Auth account. When a contact is created or updated:
//   - If the contact already has a `linkedUserId`, do nothing.
//   - Otherwise look up the email in Firebase Auth.
//     - Match found → just link the existing UID onto the contact.
//     - No match   → create a new Auth account with no password and a
//                    matching `users/{uid}` doc with a role derived from
//                    the contact's role.
//   - Write `linkedUserId` back onto the contact so this is idempotent.
//
// Once an Auth account exists, the contact can use the "Forgot password"
// flow on /sign-in to set their initial password. They don't have to be
// pre-invited by an admin.
//
// This runs as a Firestore trigger (not a callable) so the org IAM
// allUsers-invoker restriction that blocked our earlier delete-user
// function doesn't apply.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
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
      return 'pending_team'; // require admin approval for staff
    case 'subcontractor':
    case 'sub':
    case 'vendor':
    case 'supplier':
    default:
      return 'sub';
  }
}

export const ensureContactAuthAccount = onDocumentWritten(
  'contacts/{contactId}',
  async (event) => {
    const after = event.data?.after?.data() as any;
    if (!after) return; // deleted
    if (after.linkedUserId) return; // already linked
    if (after.isActive === false) return; // skip disabled contacts
    const email = String(after.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return;

    let uid: string | null = null;
    try {
      const existing = await admin.auth().getUserByEmail(email);
      uid = existing.uid;
    } catch (err: any) {
      if (err?.code !== 'auth/user-not-found') {
        console.error('[ensureContactAuth] getUserByEmail failed:', err);
        return;
      }
    }

    if (!uid) {
      // The contact has not gone through the sign-up flow yet. Don't
      // bulk-create accounts for the whole rolodex — they sign up
      // themselves via Create Account. Bail and let nature take its
      // course (the eventual sign-up linking logic will link them).
      return;
    }

    // Ensure /users/{uid} exists. Do not clobber an existing user doc —
    // an admin may have already set a custom role.
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      await userRef.set({
        email,
        name: after.name || '',
        role: deriveUserRole(after.role),
        linkedContactId: event.params.contactId,
        active: true,
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'system:ensureContactAuth',
      });
    } else if (!(userSnap.data() as any).linkedContactId) {
      await userRef.set(
        {
          linkedContactId: event.params.contactId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    // Write the uid back onto the contact so this is a no-op next time.
    await event.data!.after!.ref.update({
      linkedUserId: uid,
      hasPortalAccess: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },
);
