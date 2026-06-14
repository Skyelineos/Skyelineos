// POST /api/bid-packages/dispatch
//
// Sends ONE consolidated bid invitation email per vendor for a bid package
// that spans multiple trades. Replaces the previous per-trade fan-out which
// produced multiple emails to the same sub when they were invited to >1 trade.
//
// Flow (called from SendBidPackageModal):
//   1. Modal creates the bidPackages/{id} parent doc client-side
//   2. Modal calls /api/bid-requests/send per trade with skipDispatch=true
//      → that creates the bidRequest docs + invite tokens but does NOT email
//   3. Modal calls THIS endpoint with the bidPackageId
//      → server reads every bidRequest under that package, groups vendors
//      → sends one styled HTML email per unique vendor listing the trades
//      → sends one SMS per unique vendor with the trade list
//
// The email button URL points at /bid/respond/<one of the vendor's tokens>.
// Any of their tokens works — after sign-in / verification, the portal
// surfaces all bids the vendor is invited to, not just the one matching the
// token.
//
// Authorized: gc / projectManager / admin.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';

interface DispatchPayload {
  projectId: string;
  bidPackageId: string;
  requesterName?: string;
}

interface VendorEntry {
  contactId?: string;
  vendorName: string;
  email?: string;
  phone?: string;
  inviteToken: string;
  bidStatus?: string;
}

interface VendorBundle {
  key: string;                     // dedupe key (contactId or email)
  vendorName: string;
  email?: string;
  phone?: string;
  trades: string[];                // unique trade names invited to
  primaryToken: string;            // any one of the vendor's tokens
  bidRequestIds: string[];
}

const STAFF_ROLES = new Set(['gc', 'admin', 'projectManager']);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPackageEmailHtml(args: {
  vendorName: string;
  projectName: string;
  trades: string[];
  link: string;
  requesterName?: string;
  packageName: string;
}): string {
  const { vendorName, projectName, trades, link, requesterName, packageName } = args;
  const tradesList = trades.map(t => `<li style="margin-bottom:4px;">${escapeHtml(t)}</li>`).join('');
  const fromLine = requesterName
    ? `<p style="color:#666;font-size:13px;margin:0 0 16px 0;">From: ${escapeHtml(requesterName)}</p>`
    : '';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #222;">
      <div style="border-bottom: 3px solid #C9A96E; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin:0;color:#141414;font-size:18px;">New bid request — ${escapeHtml(projectName)}</h2>
      </div>
      ${fromLine}
      <p style="font-size:15px;line-height:1.55;">Hi ${escapeHtml(vendorName)},</p>
      <p style="font-size:15px;line-height:1.55;">Skyeline Homes is requesting bids on the following trade${trades.length === 1 ? '' : 's'} for <strong>${escapeHtml(projectName)}</strong>:</p>
      <ul style="margin:12px 0 16px 18px;padding:0;font-size:15px;line-height:1.5;">
        ${tradesList}
      </ul>
      <p style="font-size:15px;line-height:1.55;">Click below to open the full scope and submit your bid through your Skyeline Subcontractor Portal.</p>
      <p style="margin:28px 0;">
        <a href="${link}" style="background:#C9A96E;color:#141414;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;display:inline-block;font-size:15px;">View in Skyeline OS</a>
      </p>
      <p style="color:#777;font-size:13px;margin:0 0 24px 0;">First time bidding with Skyeline? The button above will walk you through a quick sign-up and required document upload (W-9, Certificate of Insurance, Subcontractor Agreement).</p>
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0 12px 0;">
      <p style="font-size:11px;color:#999;text-align:center;margin:0;">Skyeline Homes · This is an automated notification.</p>
    </div>
  `;
}

function buildPackageEmailText(args: {
  vendorName: string;
  projectName: string;
  trades: string[];
  link: string;
  requesterName?: string;
}): string {
  const { vendorName, projectName, trades, link, requesterName } = args;
  return [
    `Hi ${vendorName},`,
    '',
    `Skyeline Homes is requesting bids on the following trade${trades.length === 1 ? '' : 's'} for ${projectName}:`,
    ...trades.map(t => `  • ${t}`),
    '',
    `Open the full scope and submit your bid through your Skyeline Subcontractor Portal:`,
    `→ ${link}`,
    '',
    `First time bidding with Skyeline? The link above will walk you through a quick sign-up and required document upload (W-9, Certificate of Insurance, Subcontractor Agreement).`,
    '',
    `Thanks,`,
    requesterName || 'The Skyeline Homes Team',
  ].join('\n');
}

function buildPackageSms(args: {
  vendorName: string;
  projectName: string;
  trades: string[];
  link: string;
}): string {
  const { projectName, trades, link } = args;
  const tradeList = trades.length === 1 ? trades[0] : `${trades.length} trades (${trades.join(', ')})`;
  return `Skyeline Homes bid request — ${tradeList} on ${projectName}. Submit in your portal: ${link}`;
}

export function registerBidPackageDispatchRoute(
  app: Express,
  db: admin.firestore.Firestore,
) {
  app.post('/api/bid-packages/dispatch', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const senderUid = decoded.uid;

      const userSnap = await db.collection('users').doc(senderUid).get();
      const role = userSnap.exists ? (userSnap.data() as any).role : null;
      if (!role || !STAFF_ROLES.has(String(role))) {
        return res.status(403).json({ error: 'Only staff can dispatch bid packages' });
      }

      const data = (req.body || {}) as DispatchPayload;
      if (!data.projectId || !data.bidPackageId) {
        return res.status(400).json({ error: 'Missing projectId or bidPackageId' });
      }

      // Load the bidPackage parent
      const pkgRef = db.collection('projects').doc(data.projectId).collection('bidPackages').doc(data.bidPackageId);
      const pkgSnap = await pkgRef.get();
      if (!pkgSnap.exists) {
        return res.status(404).json({ error: 'Bid package not found' });
      }
      const pkg = pkgSnap.data() as any;

      // Load every bidRequest under this package
      const reqSnap = await db
        .collection('projects')
        .doc(data.projectId)
        .collection('bidRequests')
        .where('bidPackageId', '==', data.bidPackageId)
        .get();

      if (reqSnap.empty) {
        return res.status(404).json({ error: 'No bid requests found for this package' });
      }

      // Group vendors across trades. Dedup by contactId (preferred) or email.
      const bundles = new Map<string, VendorBundle>();
      for (const doc of reqSnap.docs) {
        const br = doc.data() as any;
        const trade = String(br.trade || '').trim();
        if (!trade) continue;
        const vendors = (br.vendors as VendorEntry[]) || [];
        for (const v of vendors) {
          const key = v.contactId || (v.email ? v.email.toLowerCase().trim() : `${v.vendorName}|${v.inviteToken}`);
          let bundle = bundles.get(key);
          if (!bundle) {
            bundle = {
              key,
              vendorName: v.vendorName,
              email: v.email,
              phone: v.phone,
              trades: [],
              primaryToken: v.inviteToken,
              bidRequestIds: [],
            };
            bundles.set(key, bundle);
          }
          if (!bundle.trades.includes(trade)) bundle.trades.push(trade);
          if (!bundle.bidRequestIds.includes(doc.id)) bundle.bidRequestIds.push(doc.id);
          // Prefer keeping whichever token came first; no need to swap.
          // (Any token resolves the sub into their portal.)
        }
      }

      const projectName = pkg.projectName || 'Skyeline project';
      const packageName = pkg.name || `Bid Package — ${projectName}`;
      const requesterName = data.requesterName || pkg.createdByName || undefined;

      // SendGrid + Twilio init (same pattern as sendBidRequestRoute — isolate
      // Twilio init so a bad SID doesn't kill email).
      const appBaseUrl = (process.env.APP_BASE_URL || 'https://skyelineos.web.app').replace(/\/$/, '');
      const sendgridKey = process.env.SENDGRID_API_KEY;
      const sendgridFrom = process.env.SENDGRID_FROM_EMAIL;
      const sendgridReady = !!(sendgridKey && sendgridFrom);
      if (sendgridReady) sgMail.setApiKey(sendgridKey!);

      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_FROM_NUMBER;
      let twilioClient: ReturnType<typeof twilio> | null = null;
      if (twilioSid && twilioAuthToken && twilioFrom) {
        try {
          twilioClient = twilio(twilioSid, twilioAuthToken);
        } catch (e: any) {
          console.error('[bidPackageDispatch] Twilio init failed — SMS disabled:', e?.message || e);
          twilioClient = null;
        }
      }

      let sentEmails = 0;
      let sentSms = 0;
      const droppedNoContact: string[] = [];
      const perVendorResults: Array<any> = [];

      for (const bundle of bundles.values()) {
        const link = `${appBaseUrl}/bid/respond/${bundle.primaryToken}`;
        const result: any = { vendorName: bundle.vendorName, trades: bundle.trades };

        if (!bundle.email && !bundle.phone) {
          droppedNoContact.push(`${bundle.vendorName} (${bundle.trades.join(', ')})`);
          result.skipped = 'no contact info';
          perVendorResults.push(result);
          continue;
        }

        if (bundle.email && sendgridReady) {
          try {
            await sgMail.send({
              to: bundle.email,
              from: sendgridFrom!,
              subject: `New bid request — ${projectName}`,
              text: buildPackageEmailText({
                vendorName: bundle.vendorName,
                projectName,
                trades: bundle.trades,
                link,
                requesterName,
              }),
              html: buildPackageEmailHtml({
                vendorName: bundle.vendorName,
                projectName,
                trades: bundle.trades,
                link,
                requesterName,
                packageName,
              }),
            });
            result.email = { sent: true };
            sentEmails += 1;
          } catch (e: any) {
            result.email = { sent: false, error: e?.message || String(e) };
          }
        } else if (bundle.email && !sendgridReady) {
          result.email = { sent: false, error: 'SendGrid not configured' };
        }

        if (bundle.phone && twilioClient) {
          try {
            await twilioClient.messages.create({
              from: twilioFrom!,
              to: bundle.phone,
              body: buildPackageSms({
                vendorName: bundle.vendorName,
                projectName,
                trades: bundle.trades,
                link,
              }),
            });
            result.sms = { sent: true };
            sentSms += 1;
          } catch (e: any) {
            result.sms = { sent: false, error: e?.message || String(e) };
          }
        }
        perVendorResults.push(result);
      }

      // Persist dispatch summary on the bidPackage doc for audit / dashboard.
      await pkgRef.set({
        dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
        dispatchedBy: senderUid,
        dispatchSummary: {
          uniqueVendors: bundles.size,
          sentEmails,
          sentSms,
          droppedNoContact,
        },
      }, { merge: true });

      return res.json({
        ok: true,
        uniqueVendors: bundles.size,
        sentEmails,
        sentSms,
        droppedNoContact,
        results: perVendorResults,
      });
    } catch (e: any) {
      console.error('bid-packages dispatch error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
