// Purchase Order generation + send route.
//
// generatePo()  — called from awardBidRoute after a bid is awarded.
//                 Creates projects/{projectId}/purchaseOrders/{poId}.
//
// POST /api/projects/:projectId/purchase-orders/:poId/send
//   — sends the PO to the vendor via SendGrid with a signing link.
//
// PO lifecycle: draft → sent → signed | void

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { requireBidsStaff } from '../middleware/rbac';
import { requireProjectAccess } from '../middleware/requireProjectAccess';

export interface GeneratePoInput {
  projectId: string;
  bidId: string;
  bid: any;                       // raw Firestore bid document data
  awardedSubUid: string | null;
}

export interface PurchaseOrder {
  poNumber: string;
  projectId: string;
  projectName: string;
  vendorId: string | null;
  vendorName: string;
  vendorEmail: string;
  trade: string;
  description: string;
  amount: number;
  bidId: string;
  status: 'draft' | 'sent' | 'signed' | 'void';
  lineItems: any[];
  createdAt: admin.firestore.FieldValue;
  sentAt: null;
  signedAt: null;
  signedByName: null;
  signedByEmail: null;
  notes: string;
}

/**
 * Creates a Purchase Order document in Firestore when a bid is awarded.
 * Returns the new PO document ID.
 */
export async function generatePo(
  db: admin.firestore.Firestore,
  input: GeneratePoInput,
): Promise<string> {
  const { projectId, bidId, bid, awardedSubUid } = input;

  // Resolve project name
  let projectName = bid.projectName || '';
  if (!projectName) {
    try {
      const proj = await db.collection('projects').doc(projectId).get();
      projectName = (proj.data() as any)?.name || projectId;
    } catch { /* ignore */ }
  }

  // Resolve vendor email from contacts collection if not on bid
  let vendorEmail = bid.subEmail || bid.vendorEmail || '';
  if (!vendorEmail && awardedSubUid) {
    try {
      const userSnap = await db.collection('users').doc(awardedSubUid).get();
      vendorEmail = (userSnap.data() as any)?.email || '';
    } catch { /* ignore */ }
  }
  if (!vendorEmail && bid.subContactId) {
    try {
      const contactSnap = await db.collection('contacts').doc(bid.subContactId).get();
      vendorEmail = (contactSnap.data() as any)?.email || '';
    } catch { /* ignore */ }
  }

  const trade = bid.trade || 'general';
  const timestamp = Date.now();
  const poNumber = `PO-${projectId.slice(0, 6).toUpperCase()}-${trade.toUpperCase().replace(/\s+/g, '-').slice(0, 12)}-${timestamp.toString().slice(-5)}`;

  const po: PurchaseOrder = {
    poNumber,
    projectId,
    projectName,
    vendorId: awardedSubUid || bid.subContactId || null,
    vendorName: bid.subName || bid.subCompany || bid.vendorName || 'Unknown Vendor',
    vendorEmail,
    trade,
    description: bid.description || bid.scope || `${trade} work for ${projectName}`,
    amount: bid.totalAmount ?? bid.amount ?? 0,
    bidId,
    status: 'draft',
    lineItems: Array.isArray(bid.lineItems) ? bid.lineItems : [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sentAt: null,
    signedAt: null,
    signedByName: null,
    signedByEmail: null,
    notes: '',
  };

  const poRef = await db
    .collection('projects').doc(projectId)
    .collection('purchaseOrders').add(po);

  console.log(`[generatePo] Created PO ${poNumber} (${poRef.id}) for project ${projectId}, bid ${bidId}`);
  return poRef.id;
}

/**
 * Registers PO-related routes on the Express app.
 */
export function registerPoRoutes(
  app: Express,
  db: admin.firestore.Firestore,
) {
  // GET /api/projects/:projectId/purchase-orders
  // List all POs for a project. Any project member can read (subs need to
  // see their own PO). requireProjectAccess replaces the inline token verify
  // that used to trust anyone with a valid Firebase JWT.
  app.get('/api/projects/:projectId/purchase-orders', requireProjectAccess, async (req: any, res: any) => {
    try {
      const snap = await db
        .collection('projects').doc(req.params.projectId)
        .collection('purchaseOrders')
        .orderBy('createdAt', 'desc')
        .get();

      return res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e: any) {
      console.error('[PO list]', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });

  // POST /api/projects/:projectId/purchase-orders/:poId/send
  // Email the PO to the vendor with a link to acknowledge/sign.
  //
  // Audit fix (2026-07-05): the previous handler did its own role check by
  // re-verifying the Bearer token — that bypassed the /api authMiddleware
  // req.user propagation and didn't check project ownership. Consolidated
  // onto requireBidsStaff + requireProjectAccess.
  app.post('/api/projects/:projectId/purchase-orders/:poId/send', requireBidsStaff, requireProjectAccess, async (req: any, res: any) => {
    try {
      const decoded = req.user; // populated by authMiddleware

      const { projectId, poId } = req.params;
      const poRef = db.collection('projects').doc(projectId).collection('purchaseOrders').doc(poId);
      const poSnap = await poRef.get();
      if (!poSnap.exists) return res.status(404).json({ error: 'PO not found' });
      const po = poSnap.data() as any;

      if (!po.vendorEmail) {
        return res.status(400).json({ error: 'No vendor email on file — add one before sending' });
      }

      const appBaseUrl = process.env.APP_BASE_URL || 'https://skyelineos.web.app';
      const poLink = `${appBaseUrl}/subcontractor-portal/purchase-orders/${poId}`;

      // Resend email send
      const resendApiKey = process.env.RESEND_API_KEY;
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        const { error: resendError } = await resend.emails.send({
          from: 'Skyeline Homes <tyler@skyelinehomes.com>',
          to: po.vendorEmail,
          subject: `Purchase Order ${po.poNumber} — ${po.projectName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2c3e50;">Purchase Order — ${po.poNumber}</h2>
              <p>Hi ${po.vendorName},</p>
              <p>Skyeline Homes has issued you a Purchase Order for the following work:</p>
              <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
                <tr style="background:#f8f9fa;">
                  <td style="padding:8px; border:1px solid #dee2e6;"><strong>Project</strong></td>
                  <td style="padding:8px; border:1px solid #dee2e6;">${po.projectName}</td>
                </tr>
                <tr>
                  <td style="padding:8px; border:1px solid #dee2e6;"><strong>Trade</strong></td>
                  <td style="padding:8px; border:1px solid #dee2e6;">${po.trade}</td>
                </tr>
                <tr style="background:#f8f9fa;">
                  <td style="padding:8px; border:1px solid #dee2e6;"><strong>Amount</strong></td>
                  <td style="padding:8px; border:1px solid #dee2e6;"><strong>$${Number(po.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
                </tr>
                <tr>
                  <td style="padding:8px; border:1px solid #dee2e6;"><strong>Description</strong></td>
                  <td style="padding:8px; border:1px solid #dee2e6;">${po.description}</td>
                </tr>
              </table>
              <p>Please review and acknowledge this Purchase Order by clicking the link below:</p>
              <p style="margin: 24px 0;">
                <a href="${poLink}" style="background:#2c3e50; color:white; padding:12px 24px; text-decoration:none; border-radius:4px; display:inline-block;">
                  Review &amp; Sign PO
                </a>
              </p>
              <p style="color:#666; font-size:12px;">
                Questions? Reply to this email or contact Tyler at Skyeline Homes.<br/>
                PO Number: ${po.poNumber}
              </p>
            </div>
          `,
        });
        if (resendError) throw new Error(resendError.message);
      } else {
        console.warn('[PO send] RESEND_API_KEY not set — email skipped');
      }

      await poRef.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        sentByUid: decoded?.uid || null,
      });

      return res.json({ ok: true, poNumber: po.poNumber, sentTo: po.vendorEmail });
    } catch (e: any) {
      console.error('[PO send]', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });

  // POST /api/projects/:projectId/purchase-orders/:poId/acknowledge
  // Vendor acknowledges/signs the PO (unauthenticated — link from email).
  app.post('/api/projects/:projectId/purchase-orders/:poId/acknowledge', async (req: any, res: any) => {
    try {
      const { projectId, poId } = req.params;
      const { signerName, signerEmail } = (req.body || {}) as { signerName?: string; signerEmail?: string };

      const poRef = db.collection('projects').doc(projectId).collection('purchaseOrders').doc(poId);
      const poSnap = await poRef.get();
      if (!poSnap.exists) return res.status(404).json({ error: 'PO not found' });
      const po = poSnap.data() as any;
      if (po.status === 'void') return res.status(410).json({ error: 'This PO has been voided' });
      if (po.status === 'signed') return res.json({ ok: true, alreadySigned: true });

      await poRef.update({
        status: 'signed',
        signedAt: admin.firestore.FieldValue.serverTimestamp(),
        signedByName: signerName || po.vendorName,
        signedByEmail: signerEmail || po.vendorEmail,
      });

      return res.json({ ok: true, poNumber: po.poNumber });
    } catch (e: any) {
      console.error('[PO acknowledge]', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
