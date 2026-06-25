// Phase 3 notification dispatcher.
// Triggers on every new doc in `notifications/{notificationId}` and:
//   1. Looks up the recipient's user record for email + phone + opt-in flags
//   2. Sends email via SendGrid (if SENDGRID_API_KEY set + user has email + email opt-in)
//   3. Sends SMS via Twilio (if TWILIO_AUTH_TOKEN set + user has phone + sms opt-in)
//   4. Records the dispatch result back on the notification doc (emailSent, smsSent, errors)
//
// Secrets are read from Firebase Functions params (set via `firebase functions:secrets:set`).

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import { toE164, isSmsOptedOut } from './sms';
import { sendPushNotification } from './fcmService';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');
const SENDGRID_FROM_EMAIL = defineSecret('SENDGRID_FROM_EMAIL');
const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_FROM_NUMBER = defineSecret('TWILIO_FROM_NUMBER');
const APP_BASE_URL = defineSecret('APP_BASE_URL'); // e.g. https://skyelineos.web.app

interface NotificationDoc {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
  fromUserName?: string;
  /** When true, send the SMS regardless of the recipient's opt-in prefs.
   *  Used for high-signal alerts (e.g. a new lead) the operator always wants
   *  texted. Still requires the recipient to have a phone number. */
  forceSms?: boolean;
  /** Org-level channel eligibility set by the configurable trigger engine
   *  (fireTrigger). When a channel is explicitly false here it is suppressed
   *  even if the recipient's prefs would allow it; the recipient's prefs +
   *  SMS opt-out can still suppress a channel that is true here. Absent =
   *  legacy behavior (all channels considered per user prefs). */
  channels?: { inApp?: boolean; email?: boolean; sms?: boolean; push?: boolean };
  /** Rendered per-channel content from the admin's templates. Used verbatim
   *  when present; falls back to title/body otherwise. */
  emailSubject?: string;
  emailBody?: string;
  smsBody?: string;
  emailSent?: boolean;
  smsSent?: boolean;
  errors?: string[];
}

interface UserDoc {
  email?: string;
  phone?: string;
  name?: string;
  /** Device-registered FCM tokens for web push. Populated when the user
   *  opts in via the "Enable phone notifications" button on the client. */
  fcmTokens?: string[];
  notificationPrefs?: {
    email?: boolean;       // global opt-in (default: true)
    sms?: boolean;         // global opt-in (default: false unless explicitly set)
    push?: boolean;        // web push opt-in (default: true once tokens exist)
    kinds?: Record<string, { email?: boolean; sms?: boolean; push?: boolean }>;
  };
}

function shouldSendEmail(user: UserDoc, kind: string): boolean {
  const prefs = user.notificationPrefs;
  const perKind = prefs?.kinds?.[kind];
  if (perKind?.email !== undefined) return perKind.email;
  if (prefs?.email !== undefined) return prefs.email;
  return true; // default ON for email
}

function shouldSendSms(user: UserDoc, kind: string): boolean {
  const prefs = user.notificationPrefs;
  const perKind = prefs?.kinds?.[kind];
  if (perKind?.sms !== undefined) return perKind.sms;
  if (prefs?.sms !== undefined) return prefs.sms;
  return false; // default OFF for SMS — opt-in only
}

function shouldSendPush(user: UserDoc, kind: string): boolean {
  const prefs = user.notificationPrefs;
  const perKind = prefs?.kinds?.[kind];
  if (perKind?.push !== undefined) return perKind.push;
  if (prefs?.push !== undefined) return prefs.push;
  return true; // default ON once the user has opted in (which is what
                // creates an FCM token in the first place)
}

export const dispatchNotification = onDocumentCreated(
  {
    document: 'notifications/{notificationId}',
    secrets: [SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, APP_BASE_URL],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const notif = snap.data() as NotificationDoc;
    const errors: string[] = [];
    let emailSent = false;
    let smsSent = false;
    let pushSent = false;

    if (!notif.userId) {
      console.warn('[dispatch] notification missing userId', event.params.notificationId);
      return;
    }

    // Look up the recipient
    const userSnap = await db.collection('users').doc(notif.userId).get();
    if (!userSnap.exists) {
      // Try contacts collection (subs/clients added there)
      const contactSnap = await db.collection('contacts').doc(notif.userId).get();
      if (!contactSnap.exists) {
        console.warn('[dispatch] no user/contact found for', notif.userId);
        return;
      }
      const contact = contactSnap.data() as UserDoc;
      await sendAll(contact, notif, errors, (sent) => {
        emailSent = sent.email; smsSent = sent.sms; pushSent = sent.push;
      });
    } else {
      const user = userSnap.data() as UserDoc;
      await sendAll(user, notif, errors, (sent) => {
        emailSent = sent.email; smsSent = sent.sms; pushSent = sent.push;
      });
    }

    // Patch the notification with dispatch result
    try {
      await snap.ref.update({
        emailSent,
        smsSent,
        pushSent,
        errors: errors.length ? errors : admin.firestore.FieldValue.delete(),
        dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('[dispatch] failed to update notification', e);
    }
  },
);

async function sendAll(
  recipient: UserDoc,
  notif: NotificationDoc,
  errors: string[],
  onResult: (sent: { email: boolean; sms: boolean; push: boolean }) => void,
) {
  let emailSent = false;
  let smsSent = false;
  let pushSent = false;

  // Email via SendGrid. Org channel directive can suppress; otherwise per-user pref.
  const emailAllowedByOrg = notif.channels?.email !== false;
  if (recipient.email && emailAllowedByOrg && shouldSendEmail(recipient, notif.kind)) {
    try {
      const apiKey = SENDGRID_API_KEY.value();
      const fromEmail = SENDGRID_FROM_EMAIL.value();
      if (apiKey && fromEmail) {
        sgMail.setApiKey(apiKey);
        const link = notif.link
          ? `${APP_BASE_URL.value() || 'https://skyelineos.web.app'}${notif.link}`
          : undefined;
        const subject = notif.emailSubject || notif.title;
        const bodyText = notif.emailBody || notif.body || '';
        await sgMail.send({
          to: recipient.email,
          from: { email: fromEmail, name: 'Skyeline Homes' },
          subject,
          text: `${bodyText}${link ? `\n\nOpen: ${link}` : ''}\n\n— Skyeline Homes`,
          html: buildEmailHtml({ ...notif, title: subject, body: bodyText }, link),
        });
        emailSent = true;
      }
    } catch (e: any) {
      const msg = `Email failed: ${e.message || String(e)}`;
      console.error('[dispatch]', msg);
      errors.push(msg);
    }
  }

  // SMS via Twilio. `forceSms` overrides the opt-in check for alerts the
  // operator always wants texted (new leads), but a phone number is still
  // required.
  const smsAllowedByOrg = notif.channels?.sms !== false;
  if (recipient.phone && smsAllowedByOrg && (notif.forceSms === true || shouldSendSms(recipient, notif.kind))) {
    try {
      const sid = TWILIO_ACCOUNT_SID.value();
      const token = TWILIO_AUTH_TOKEN.value();
      const fromNumber = TWILIO_FROM_NUMBER.value();
      const toNumber = toE164(recipient.phone);
      if (!toNumber) {
        const msg = `SMS skipped: phone "${recipient.phone}" is not a valid E.164 number`;
        console.warn('[dispatch]', msg);
        errors.push(msg);
      } else if (await isSmsOptedOut(db, toNumber)) {
        // Recipient texted STOP — honor it even for forceSms alerts.
        console.log('[dispatch] SMS skipped: recipient opted out', toNumber);
      } else if (sid && token && fromNumber) {
        const client = twilio(sid, token);
        const link = notif.link
          ? ` ${APP_BASE_URL.value() || 'https://skyelineos.web.app'}${notif.link}`
          : '';
        // Prefer the admin's rendered SMS template; the link is already baked
        // into the template when desired, so only append the deep link if the
        // template didn't supply its own copy.
        const base = notif.smsBody || `${notif.title}${notif.body ? `: ${notif.body}` : ''}`;
        const message = `${base}${notif.smsBody ? '' : link}`.slice(0, 320);
        await client.messages.create({
          to: toNumber,
          from: fromNumber,
          body: message,
        });
        smsSent = true;
      }
    } catch (e: any) {
      const msg = `SMS failed: ${e.message || String(e)}`;
      console.error('[dispatch]', msg);
      errors.push(msg);
    }
  }

  // Web push via FCM
  const tokens = Array.isArray(recipient.fcmTokens)
    ? recipient.fcmTokens.filter(t => typeof t === 'string' && t.length > 0)
    : [];
  const pushAllowedByOrg = notif.channels?.push !== false;
  if (tokens.length > 0 && pushAllowedByOrg && shouldSendPush(recipient, notif.kind)) {
    try {
      const link = notif.link
        ? `${APP_BASE_URL.value() || 'https://skyelineos.web.app'}${notif.link}`
        : `${APP_BASE_URL.value() || 'https://skyelineos.web.app'}/`;
      const message = {
        tokens,
        notification: {
          title: notif.title,
          body: notif.body || '',
        },
        webpush: {
          notification: {
            icon: '/logos/logo-dark.png',
            badge: '/logos/logo-dark.png',
          },
          fcmOptions: { link },
        },
        data: {
          link,
          title: notif.title,
          body: notif.body || '',
        },
      };
      const result = await admin.messaging().sendEachForMulticast(message);
      pushSent = result.successCount > 0;
      // Prune dead tokens so a registered device that's been uninstalled
      // doesn't slow down future dispatches forever.
      const dead: string[] = [];
      result.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = (resp.error as any)?.code || '';
          if (
            code.includes('registration-token-not-registered')
            || code.includes('invalid-registration-token')
          ) {
            dead.push(tokens[idx]);
          } else if (resp.error) {
            errors.push(`FCM token ${idx} failed: ${resp.error.message}`);
          }
        }
      });
      if (dead.length > 0) {
        try {
          // Best-effort pruning — works whether the recipient lives in
          // users/ or contacts/.
          const userRef = db.collection('users').doc(notif.userId);
          const userSnap = await userRef.get();
          const ref = userSnap.exists
            ? userRef
            : db.collection('contacts').doc(notif.userId);
          await ref.update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...dead) });
        } catch (e: any) {
          console.warn('[dispatch] pruning dead tokens failed', e?.message);
        }
      }
    } catch (e: any) {
      const msg = `Push failed: ${e.message || String(e)}`;
      console.error('[dispatch]', msg);
      errors.push(msg);
    }
  }

  // Subcollection-schema push (users/{uid}/fcmTokens/{token}).
  // Additive to the array-based fan-out above so devices that registered
  // via the new useFcmToken hook still receive notifications. Best-effort —
  // failures here never block the primary channels.
  const pushAllowedByOrg2 = notif.channels?.push !== false;
  if (pushAllowedByOrg2 && shouldSendPush(recipient, notif.kind) && notif.userId) {
    try {
      const link = notif.link
        ? `${APP_BASE_URL.value() || 'https://skyelineos.web.app'}${notif.link}`
        : `${APP_BASE_URL.value() || 'https://skyelineos.web.app'}/`;
      await sendPushNotification(db, [notif.userId], {
        title: notif.title,
        body: notif.body || '',
        url: link,
      });
      // We don't flip pushSent here — the array path above already reports
      // success when at least one device received the message. The
      // subcollection path is purely additive.
    } catch (e: any) {
      const msg = `Push (subcollection) failed: ${e.message || String(e)}`;
      console.error('[dispatch]', msg);
      errors.push(msg);
    }
  }

  onResult({ email: emailSent, sms: smsSent, push: pushSent });
}

function buildEmailHtml(notif: NotificationDoc, link?: string): string {
  const buttonHtml = link ? `
    <p style="margin:24px 0;">
      <a href="${link}" style="background:#C9A96E;color:#141414;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;display:inline-block;">View in Skyeline OS</a>
    </p>` : '';
  const fromLine = notif.fromUserName ? `<p style="color:#666;font-size:13px;margin:0 0 16px 0;">From: ${notif.fromUserName}</p>` : '';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="border-bottom: 3px solid #C9A96E; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin:0;color:#141414;font-size:18px;">${notif.title}</h2>
      </div>
      ${fromLine}
      ${notif.body ? `<p style="color:#222;font-size:15px;line-height:1.5;">${notif.body}</p>` : ''}
      ${buttonHtml}
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0 12px 0;">
      <p style="font-size:11px;color:#999;text-align:center;margin:0;">Skyeline Homes · This is an automated notification.</p>
    </div>
  `;
}
