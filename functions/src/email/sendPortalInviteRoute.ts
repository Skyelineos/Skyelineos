import type { Express } from 'express';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import { toE164, isSmsOptedOut } from '../notifications/sms';

// POST /api/send-portal-invite
// Sends a portal-invitation email to a client's documented address via SendGrid,
// rendering one of the selectable templates stored in the `emailTemplates`
// Firestore collection (built-in or GC-uploaded). Replaces the old `mailto:`
// draft flow — the message now goes out automatically from the app.
//
// Body: { token, email, firstName?, templateId, contactId? }
//   token      — the portalInvites token created client-side (becomes the link)
//   email      — recipient (the client's documented email)
//   templateId — id of the emailTemplates doc to render

const LOGO_URL =
  'https://skyelineos.web.app/logos/logo-transparent-cropped.png';

const ALLOWED_ROLES = new Set(['admin', 'gc', 'projectManager']);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render(
  template: string,
  vars: { firstName: string; inviteLink: string },
): string {
  return template
    .replace(/\{\{\s*firstName\s*\}\}/g, vars.firstName)
    .replace(/\{\{\s*inviteLink\s*\}\}/g, vars.inviteLink)
    .replace(/\{\{\s*logoUrl\s*\}\}/g, LOGO_URL);
}

export function registerSendPortalInviteRoute(
  app: Express,
  db: admin.firestore.Firestore,
) {
  app.post('/api/send-portal-invite', async (req: any, res: any) => {
    try {
      // 1. Auth — must be a signed-in staff member (admin / gc / PM).
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const profile = await db.collection('users').doc(decoded.uid).get();
      const role = profile.exists ? (profile.data() || {}).role : null;
      if (!ALLOWED_ROLES.has(role)) {
        return res.status(403).json({ error: 'Not authorized to send invites' });
      }

      // 2. Validate input.
      const { token, email, firstName, templateId, contactId } = req.body || {};
      const to = String(email || '').trim().toLowerCase();
      if (!to || !/.+@.+\..+/.test(to)) {
        return res.status(400).json({ error: 'A valid recipient email is required' });
      }
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing invite token' });
      }
      if (!templateId || typeof templateId !== 'string') {
        return res.status(400).json({ error: 'Missing templateId' });
      }

      // 3. Load the chosen template (built-in or uploaded — same path).
      const tplSnap = await db.collection('emailTemplates').doc(templateId).get();
      if (!tplSnap.exists) {
        return res.status(404).json({ error: 'Template not found' });
      }
      const tpl = tplSnap.data() || {};
      const rawSubject = String(tpl.subject || 'Your Skyeline Homes portal invitation');
      const rawHtml = String(tpl.html || '');
      if (!rawHtml) {
        return res.status(422).json({ error: 'Template has no body' });
      }

      // 4. SendGrid config.
      const apiKey = process.env.SENDGRID_API_KEY;
      const fromEmail = process.env.SENDGRID_FROM_EMAIL;
      if (!apiKey || !fromEmail) {
        return res.status(503).json({ error: 'Email sending is not configured' });
      }

      // 5. Build the sign-up link from the token + render placeholders.
      const base = process.env.APP_BASE_URL || 'https://skyelineos.web.app';
      const inviteLink = `${base}/sign-in?invite=${encodeURIComponent(token)}`;
      const safeName = escapeHtml(String(firstName || '').trim()) || 'there';
      const subject = render(rawSubject, { firstName: safeName, inviteLink })
        // subject is plain text — strip any stray tags from name substitution
        .replace(/<[^>]*>/g, '');
      const html = render(rawHtml, { firstName: safeName, inviteLink });
      const text =
        `Hi ${String(firstName || '').trim() || 'there'},\n\n` +
        `You're invited to the Skyeline Homes portal. Set up your account here:\n${inviteLink}\n\n` +
        `This invitation is valid for 30 days.\n— The Skyeline Homes Team`;

      // 6. Send.
      sgMail.setApiKey(apiKey);
      await sgMail.send({
        to,
        from: { email: fromEmail, name: 'Skyeline Homes' },
        subject,
        text,
        html,
      });

      // 7. Best-effort audit on the invite token doc.
      try {
        const q = await db
          .collection('portalInvites')
          .where('token', '==', token)
          .limit(1)
          .get();
        if (!q.empty) {
          await q.docs[0].ref.set(
            {
              emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
              emailTemplateId: templateId,
              emailSentBy: decoded.email || decoded.uid,
            },
            { merge: true },
          );
        }
      } catch (auditErr) {
        console.warn('[send-portal-invite] audit write failed', auditErr);
      }

      return res.json({ ok: true, sent: true, to, contactId: contactId || null });
    } catch (err: any) {
      console.error('[send-portal-invite] failed', err?.response?.body || err);
      return res
        .status(500)
        .json({ error: err?.message || 'Failed to send invitation email' });
    }
  });

  // POST /api/send-portal-invite-sms
  // Texts the same portal-invite link via Twilio — for clients we only have a
  // phone number for. The link is identical (/sign-in?invite=<token>); signup
  // links the contact by phone. Honors the SMS opt-out (STOP) ledger.
  app.post('/api/send-portal-invite-sms', async (req: any, res: any) => {
    try {
      // 1. Auth — staff only.
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const profile = await db.collection('users').doc(decoded.uid).get();
      const role = profile.exists ? (profile.data() || {}).role : null;
      if (!ALLOWED_ROLES.has(role)) {
        return res.status(403).json({ error: 'Not authorized to send invites' });
      }

      // 2. Validate input.
      const { token, phone, firstName, contactId } = req.body || {};
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing invite token' });
      }
      const toNumber = toE164(phone);
      if (!toNumber) {
        return res.status(400).json({ error: 'A valid mobile number is required' });
      }
      if (await isSmsOptedOut(db, toNumber)) {
        return res.status(409).json({ error: 'This number has opted out of texts (replied STOP)' });
      }

      // 3. Twilio config.
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_FROM_NUMBER;
      if (!sid || !authToken || !from) {
        return res.status(503).json({ error: 'Text messaging is not configured' });
      }

      // 4. Build link + message.
      const base = process.env.APP_BASE_URL || 'https://skyelineos.web.app';
      const inviteLink = `${base}/sign-in?invite=${encodeURIComponent(token)}`;
      const hi = String(firstName || '').trim();
      const body =
        `${hi ? hi + ', you' : 'You'}'re invited to the Skyeline Homes portal. ` +
        `Create your account here: ${inviteLink}\n\nReply STOP to opt out.`;

      // 5. Send.
      const client = twilio(sid, authToken);
      await client.messages.create({ to: toNumber, from, body });

      // 6. Best-effort audit on the invite token doc.
      try {
        const q = await db
          .collection('portalInvites')
          .where('token', '==', token)
          .limit(1)
          .get();
        if (!q.empty) {
          await q.docs[0].ref.set(
            {
              smsSentAt: admin.firestore.FieldValue.serverTimestamp(),
              smsSentBy: decoded.email || decoded.uid,
            },
            { merge: true },
          );
        }
      } catch (auditErr) {
        console.warn('[send-portal-invite-sms] audit write failed', auditErr);
      }

      return res.json({ ok: true, sent: true, to: toNumber, contactId: contactId || null });
    } catch (err: any) {
      console.error('[send-portal-invite-sms] failed', err?.message || err);
      return res
        .status(500)
        .json({ error: err?.message || 'Failed to send invitation text' });
    }
  });
}
