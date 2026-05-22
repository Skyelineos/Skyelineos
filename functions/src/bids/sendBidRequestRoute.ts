// Express route version of sendBidRequest — folded into the api app
// to avoid the org IAM block that prevents new standalone functions from
// being made publicly invokable.
//
// Auth: Bearer token (Firebase ID token) verified against admin SDK.
// Email: SendGrid via process.env SENDGRID_API_KEY + SENDGRID_FROM_EMAIL
// SMS:   Twilio  via process.env TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER
//
// Both are optional — if a credential isn't set, that channel is skipped
// gracefully. The client falls back to mailto: when nothing was sent.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';

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

export function registerBidRequestRoute(app: Express, db: admin.firestore.Firestore) {
  app.post('/api/bid-requests/send', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const token = authHeader.substring(7);
      const decoded = await admin.auth().verifyIdToken(token);
      const uid = decoded.uid;

      const data = req.body as RequestPayload;
      if (!data?.projectId || !data?.selectionId || !data?.vendors?.length) {
        return res.status(400).json({ error: 'Missing projectId, selectionId, or vendors' });
      }

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
          `Hi ${vendorName},`, '', opener, '',
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

      const sendgridKey = process.env.SENDGRID_API_KEY;
      const sendgridFrom = process.env.SENDGRID_FROM_EMAIL;
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_FROM_NUMBER;

      const sendgridReady = !!(sendgridKey && sendgridFrom);
      if (sendgridReady) sgMail.setApiKey(sendgridKey!);
      const twilioReady = !!(twilioSid && twilioToken && twilioFrom);
      const twilioClient = twilioReady ? twilio(twilioSid!, twilioToken!) : null;

      const results: Array<any> = [];

      for (const v of data.vendors) {
        const r: any = { vendorName: v.vendorName };
        if (v.email) {
          if (!sendgridReady) {
            r.email = { sent: false, error: 'SendGrid not configured' };
          } else {
            try {
              await sgMail.send({ to: v.email, from: sendgridFrom!, subject, text: buildBody(v.vendorName) });
              r.email = { sent: true };
            } catch (e: any) {
              r.email = { sent: false, error: e?.message || String(e) };
            }
          }
        }
        if (v.phone && twilioClient) {
          try {
            await twilioClient.messages.create({ from: twilioFrom!, to: v.phone, body: buildSms(v.vendorName) });
            r.sms = { sent: true };
          } catch (e: any) {
            r.sms = { sent: false, error: e?.message || String(e) };
          }
        }
        results.push(r);
      }

      await db.collection('projects').doc(data.projectId).collection('bidRequests').add({
        selectionId: data.selectionId,
        selectionTitle: data.selectionTitle,
        stage: data.stage,
        vendors: data.vendors,
        customMessage: data.customMessage || null,
        dueByDate: admin.firestore.Timestamp.fromDate(replyByDate),
        requestedBy: uid,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        results,
      });

      const sentEmails = results.filter(r => r.email?.sent).length;
      const sentSms = results.filter(r => r.sms?.sent).length;
      res.json({ ok: true, sentEmails, sentSms, total: data.vendors.length, results });
    } catch (e: any) {
      console.error('sendBidRequest error:', e);
      res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
