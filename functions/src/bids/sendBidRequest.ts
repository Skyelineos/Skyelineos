// Cloud Function: sendBidRequest
//
// Callable HTTPS function that sends a bid request to external vendor emails
// via SendGrid and optionally SMS via Twilio.
//
// Vendors are external contacts (not Skyelineos users), so we send directly
// via SendGrid rather than through the existing notifications dispatcher
// (which keys on userId).
//
// Secrets (set via `firebase functions:secrets:set <NAME>`):
//   SENDGRID_API_KEY      — required for email
//   SENDGRID_FROM_EMAIL   — required for email
//   TWILIO_ACCOUNT_SID    — optional, for SMS
//   TWILIO_AUTH_TOKEN     — optional, for SMS
//   TWILIO_FROM_NUMBER    — optional, for SMS
//   APP_BASE_URL          — optional, for "Submit your bid" links

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';

if (!admin.apps.length) admin.initializeApp();

const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');
const SENDGRID_FROM_EMAIL = defineSecret('SENDGRID_FROM_EMAIL');
const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_FROM_NUMBER = defineSecret('TWILIO_FROM_NUMBER');
const APP_BASE_URL = defineSecret('APP_BASE_URL');

interface VendorRecipient {
  contactId?: string;
  vendorName: string;
  email?: string;
  phone?: string;
}

interface RequestPayload {
  projectId: string;
  projectName?: string;
  selectionId: string;
  selectionTitle: string;
  selectionSpecs?: string;
  stage: 'rough' | 'final';
  vendors: VendorRecipient[];
  customMessage?: string;
  dueDays?: number;
  requesterName?: string;
}

export const sendBidRequest = onCall(
  {
    secrets: [SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, APP_BASE_URL],
    region: 'us-central1',
  },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    const data = req.data as RequestPayload;
    if (!data?.projectId || !data?.selectionId || !data?.vendors?.length) {
      throw new HttpsError('invalid-argument', 'Missing projectId, selectionId, or vendors.');
    }

    const db = admin.firestore();
    const dueDays = data.dueDays ?? (data.stage === 'rough' ? 7 : 5);
    const replyByDate = new Date(Date.now() + dueDays * 86400000);

    const subject = data.stage === 'rough'
      ? `Rough bid request — ${data.selectionTitle} — ${data.projectName || 'Skyeline project'}`
      : `Updated bid request — ${data.selectionTitle} (specs locked) — ${data.projectName || 'Skyeline project'}`;

    const buildBody = (vendorName: string) => {
      const opener = data.stage === 'rough'
        ? `We're working up early numbers for ${data.projectName || 'a Skyeline project'}. Could you send a rough bid based on the plans?`
        : `The specs on ${data.selectionTitle} are now locked. Could you update your previous rough bid with final pricing?`;
      return [
        `Hi ${vendorName},`,
        '',
        opener,
        '',
        `Item: ${data.selectionTitle}`,
        data.selectionSpecs ? `Specs:\n${data.selectionSpecs}` : '',
        data.customMessage ? `\nNotes: ${data.customMessage}` : '',
        '',
        `Please reply with your bid amount, lead time, and any clarifying questions by ${replyByDate.toLocaleDateString()}.`,
        '',
        `Thanks,`,
        data.requesterName || 'Skyeline Homes',
      ].filter(Boolean).join('\n');
    };

    const buildSms = (vendorName: string) =>
      `Hi ${vendorName}, ${data.stage === 'rough' ? 'rough bid' : 'updated bid'} request on ${data.selectionTitle}. Reply with bid + lead time by ${replyByDate.toLocaleDateString()}. — ${data.requesterName || 'Skyeline'}`;

    // Configure SendGrid if available
    const sendgridReady = !!(SENDGRID_API_KEY.value() && SENDGRID_FROM_EMAIL.value());
    if (sendgridReady) sgMail.setApiKey(SENDGRID_API_KEY.value());

    // Configure Twilio if available
    const twilioReady = !!(TWILIO_ACCOUNT_SID.value() && TWILIO_AUTH_TOKEN.value() && TWILIO_FROM_NUMBER.value());
    const twilioClient = twilioReady ? twilio(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value()) : null;

    const results: Array<{ vendorName: string; email?: { sent: boolean; error?: string }; sms?: { sent: boolean; error?: string } }> = [];

    for (const v of data.vendors) {
      const r: any = { vendorName: v.vendorName };
      // Email
      if (v.email) {
        if (!sendgridReady) {
          r.email = { sent: false, error: 'SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL missing)' };
        } else {
          try {
            await sgMail.send({
              to: v.email,
              from: SENDGRID_FROM_EMAIL.value(),
              subject,
              text: buildBody(v.vendorName),
            });
            r.email = { sent: true };
          } catch (e: any) {
            r.email = { sent: false, error: e?.message || String(e) };
          }
        }
      }
      // SMS (only if no email or as backup)
      if (v.phone && twilioClient) {
        try {
          await twilioClient.messages.create({
            from: TWILIO_FROM_NUMBER.value(),
            to: v.phone,
            body: buildSms(v.vendorName),
          });
          r.sms = { sent: true };
        } catch (e: any) {
          r.sms = { sent: false, error: e?.message || String(e) };
        }
      }
      results.push(r);
    }

    // Log to projects/{id}/bidRequests/{auto} for audit + reply tracking
    await db.collection('projects').doc(data.projectId).collection('bidRequests').add({
      selectionId: data.selectionId,
      selectionTitle: data.selectionTitle,
      stage: data.stage,
      vendors: data.vendors,
      customMessage: data.customMessage || null,
      dueByDate: admin.firestore.Timestamp.fromDate(replyByDate),
      requestedBy: req.auth.uid,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      results,
    });

    return {
      ok: true,
      sentEmails: results.filter(r => r.email?.sent).length,
      sentSms: results.filter(r => r.sms?.sent).length,
      total: data.vendors.length,
      results,
    };
  }
);
