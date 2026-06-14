// Firestore trigger that mirrors every contact (with an email) into a
// Firebase Auth account. When a contact is created or updated:
//   - If the contact already has a `linkedUserId`, do nothing.
//   - Otherwise look up the email in Firebase Auth.
//     - Match found → just link the existing UID onto the contact.
//     - No match:
//         • On a brand-new contact (a deliberate add) → create an Auth
//           account, email the person a portal invite (a password-set link),
//           and link it. This is the "invite to create a portal" flow.
//         • On an update/backfill of an existing contact → bail (we don't
//           bulk-invite the historical rolodex; they self-sign-up or get
//           linked when an account already exists).
//   - Write `linkedUserId` back onto the contact so this is idempotent.
//
// This runs as a Firestore trigger (not a callable) so the org IAM
// allUsers-invoker restriction that blocked our earlier delete-user
// function doesn't apply.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');
const SENDGRID_FROM_EMAIL = defineSecret('SENDGRID_FROM_EMAIL');
const APP_BASE_URL = defineSecret('APP_BASE_URL'); // e.g. https://skyelineos.web.app

function deriveUserRole(contactRole: string | undefined): string {
  switch ((contactRole || '').toLowerCase()) {
    case 'client':
    case 'homeowner':
      return 'client';
    case 'designer':
      return 'designer';
    case 'team':
    case 'employee':
      // Per docs/decisions.md §D-001 + ROLE_AUDIT.md: `pending_team` was a dead-letter
      // state — no UI ever recognized it, so anyone tagged `team` or `employee` got
      // stuck with no portal. Routing to `pending_gc` puts them on the existing
      // pending-approval screen, where the admin can promote them to `gc` or
      // `projectManager`.
      return 'pending_gc';
    case 'subcontractor':
    case 'sub':
    case 'vendor':
    case 'supplier':
    default:
      return 'sub';
  }
}

// Only these contact roles get a proactive portal invite when newly added (or
// when invited for bids — bid invitees are added as `subcontractor` contacts).
//
// Clients/homeowners are deliberately NOT auto-invited: many are early-stage
// leads who aren't ready for a portal yet. They're invited EXPLICITLY from the
// UI instead — the "Send portal invite" opt-in on contact creation and the
// "Invite to portal" button both send a templated SendGrid email via the
// /api/send-portal-invite route. Vendors, suppliers, and internal team are not
// auto-invited either.
const INVITE_ROLES = new Set(['subcontractor', 'sub', 'designer']);
function shouldInvite(contactRole: string | undefined): boolean {
  return INVITE_ROLES.has((contactRole || '').toLowerCase());
}

function inviteEmailHtml(name: string, link: string, base: string): string {
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #222;">
    <h2 style="color:#141414; margin:0 0 8px;">Welcome to the Skyeline Homes portal</h2>
    <p style="font-size:15px; line-height:1.5;">Hi ${name || 'there'}, you've been added to the Skyeline Homes portal. Set your password to activate your account and get access to your project.</p>
    <div style="margin: 24px 0;">
      <a href="${link}" style="background:#C9A96E;color:#141414;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;display:inline-block;font-size:15px;">Set your password</a>
    </div>
    <p style="font-size:13px; color:#666; line-height:1.5;">After setting your password, sign in any time at <a href="${base}/sign-in" style="color:#8a6a3a;">${base}/sign-in</a> — you'll land in your portal automatically.</p>
    <p style="font-size:12px; color:#999; margin-top:24px;">— Skyeline Homes</p>
  </div>`;
}

/** Create the Auth account for a brand-new contact and email them a portal invite. */
async function createAccountAndInvite(email: string, name: string): Promise<string | null> {
  const created = await admin.auth().createUser({
    email,
    emailVerified: false,
    displayName: name || undefined,
  });
  const uid = created.uid;

  // Send the invite (a working password-set link that lands them in the portal).
  try {
    const apiKey = SENDGRID_API_KEY.value();
    const fromEmail = SENDGRID_FROM_EMAIL.value();
    const base = APP_BASE_URL.value() || 'https://skyelineos.web.app';
    if (!apiKey || !fromEmail) {
      console.warn('[ensureContactAuth] SendGrid not configured — account created but invite not emailed for', email);
      return uid;
    }
    // Continue URL must be an authorized domain in Firebase Auth settings.
    const link = await admin.auth().generatePasswordResetLink(email, { url: `${base}/sign-in` });
    sgMail.setApiKey(apiKey);
    await sgMail.send({
      to: email,
      from: { email: fromEmail, name: 'Skyeline Homes' },
      subject: "You're invited to the Skyeline Homes portal",
      text: `Hi ${name || 'there'},\n\nYou've been added to the Skyeline Homes portal. Set your password to activate your account:\n${link}\n\nAfter that, sign in any time at ${base}/sign-in — you'll land in your portal automatically.\n\n— Skyeline Homes`,
      html: inviteEmailHtml(name, link, base),
    });
  } catch (err) {
    console.error('[ensureContactAuth] invite email failed for', email, err);
  }
  return uid;
}

export const ensureContactAuthAccount = onDocumentWritten(
  { document: 'contacts/{contactId}', secrets: [SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, APP_BASE_URL] },
  async (event) => {
    const after = event.data?.after?.data() as any;
    if (!after) return; // deleted
    if (after.linkedUserId) return; // already linked
    if (after.isActive === false) return; // skip disabled contacts
    const email = String(after.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return;

    const isCreate = !event.data?.before?.exists;

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
      // No Auth account yet. Only proactively create + invite for a brand-new
      // contact (a deliberate add). For updates / backfill of the historical
      // rolodex we don't bulk-invite — let them self-sign-up.
      if (!isCreate) return;
      // Only subs, clients, and designers get auto-invited — not vendors,
      // suppliers, or internal team.
      if (!shouldInvite(after.role)) return;
      try {
        uid = await createAccountAndInvite(email, after.name || '');
      } catch (err) {
        console.error('[ensureContactAuth] createUser failed:', err);
        return;
      }
      if (!uid) return;
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
