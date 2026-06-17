// POST /api/sub/invoices/submit
//
// Sub self-service invoice / pay-application submission. The sub picks one
// of their AWARDED projects in the portal, enters invoice number / amount /
// percent complete / description, optionally attaches a PDF, and the GC
// sees the bill land in the existing /financials/* Bills page with a
// submittedBy:'sub' marker for the filter chip.
//
// Why a server endpoint instead of letting the client write to /financials
// directly?
//   1. Server verifies the sub is actually AWARDED on the project they're
//      billing — checked against bids where subContactId === this contact
//      AND status === 'awarded' AND projectId matches.
//   2. Server verifies request.auth.uid === contact.linkedUserId so a sub
//      can't submit invoices on someone else's behalf.
//   3. Server enforces the financials shape so GC-side Bills.tsx keeps
//      working without per-row defensive code (vendor non-empty, amount > 0,
//      submittedBy:'sub', status:'unpaid').
//
// Auth: inherits /api authMiddleware from Stream 1 — req.user.uid is set.

import type { Express } from 'express';
import * as admin from 'firebase-admin';

interface SubmitPayload {
  subContactId: string;
  projectId: string;
  invoiceNumber: string;
  amount: number;
  percentComplete: number;      // 0..100
  description?: string;
  attachmentUrl?: string;
  storagePath?: string;         // projects/{projectId}/sub-invoices/{subContactId}/{uuid}.{ext}
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_PREFIXES = ['image/'];
const ALLOWED_MIME_EXACT = new Set(['application/pdf']);

function isMimeAllowed(mime: string): boolean {
  if (!mime) return true; // attachment optional
  if (ALLOWED_MIME_EXACT.has(mime)) return true;
  return ALLOWED_MIME_PREFIXES.some(p => mime.startsWith(p));
}

async function isSubAwardedOnProject(
  db: admin.firestore.Firestore,
  subContactId: string,
  subUserUid: string,
  projectId: string,
): Promise<boolean> {
  // Two shapes of "awarded": bids/{} with subContactId or submittedByUid.
  // Match either, scoped to this project and status=awarded.
  const byContact = await db
    .collection('bids')
    .where('subContactId', '==', subContactId)
    .where('projectId', '==', projectId)
    .where('status', '==', 'awarded')
    .limit(1)
    .get();
  if (!byContact.empty) return true;
  const byUid = await db
    .collection('bids')
    .where('submittedByUid', '==', subUserUid)
    .where('projectId', '==', projectId)
    .where('status', '==', 'awarded')
    .limit(1)
    .get();
  return !byUid.empty;
}

export function registerSubmitInvoiceRoute(
  app: Express,
  db: admin.firestore.Firestore,
) {
  app.post('/api/sub/invoices/submit', async (req: any, res: any) => {
    try {
      // req.user is set by /api authMiddleware (Stream 1).
      const uid: string | undefined = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Sign in required' });

      const data = req.body as SubmitPayload;

      // ── Shape validation ──────────────────────────────────────────────
      if (!data?.subContactId || !data?.projectId || !data?.invoiceNumber) {
        return res.status(400).json({ error: 'Missing subContactId, projectId, or invoiceNumber' });
      }
      const amount = Number(data.amount);
      if (!isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }
      const pct = Number(data.percentComplete);
      if (!isFinite(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ error: 'percentComplete must be 0..100' });
      }
      // Attachment metadata, if provided, must be sane.
      if (data.attachmentUrl) {
        if (typeof data.sizeBytes === 'number' && data.sizeBytes > MAX_BYTES) {
          return res.status(400).json({ error: `Attachment too large — max ${MAX_BYTES / 1024 / 1024}MB` });
        }
        if (!isMimeAllowed(data.mimeType || '')) {
          return res.status(400).json({ error: 'Attachment must be PDF or image' });
        }
        if (data.storagePath) {
          const expectedPrefix = `projects/${data.projectId}/sub-invoices/${data.subContactId}/`;
          if (!data.storagePath.startsWith(expectedPrefix)) {
            return res.status(400).json({
              error: 'storagePath must live under projects/{projectId}/sub-invoices/{subContactId}/',
            });
          }
        }
      }

      // ── Ownership: caller controls this contact ───────────────────────
      const contactSnap = await db.collection('contacts').doc(data.subContactId).get();
      if (!contactSnap.exists) return res.status(404).json({ error: 'Contact not found' });
      const contact = contactSnap.data() as any;
      if (contact.linkedUserId !== uid) {
        return res.status(403).json({ error: 'You can only submit invoices for your own contact' });
      }
      const subContactName: string = contact.name || contact.companyName || 'Subcontractor';

      // ── Project membership: sub must be AWARDED on this project ──────
      const awarded = await isSubAwardedOnProject(db, data.subContactId, uid, data.projectId);
      if (!awarded) {
        return res.status(403).json({
          error: 'You can only submit invoices for projects where your bid has been awarded',
        });
      }

      // Resolve project name for the bill row (GC dashboard friendly).
      let projectName = '';
      try {
        const projSnap = await db.collection('projects').doc(data.projectId).get();
        if (projSnap.exists) projectName = (projSnap.data() as any)?.name || '';
      } catch { /* non-fatal */ }

      // ── Write to /financials so GC's Bills page picks it up ──────────
      const now = admin.firestore.FieldValue.serverTimestamp();
      const billDoc: Record<string, any> = {
        type: 'bill',
        vendor: subContactName,
        invoiceNumber: String(data.invoiceNumber).trim(),
        amount,
        percentComplete: pct,
        description: data.description || '',
        status: 'unpaid',
        projectId: data.projectId,
        projectName,
        submittedBy: 'sub',
        subContactId: data.subContactId,
        submittedByUid: uid,
        createdAt: now,
        createdBy: uid,
        category: 'subcontractor',
      };
      if (data.attachmentUrl) {
        billDoc.attachmentUrl = data.attachmentUrl;
        billDoc.imageUrl = data.attachmentUrl;     // mirror so Bills.tsx preview works unchanged
        billDoc.storagePath = data.storagePath || '';
        billDoc.attachmentMime = data.mimeType || '';
        billDoc.attachmentSize = data.sizeBytes || 0;
        billDoc.attachmentName = data.fileName || '';
      }
      const ref = await db.collection('financials').add(billDoc);

      // TODO Dispatch 6: fire `sub_invoice_submitted` trigger
      // audience=gc, projectId=data.projectId, vars={
      //   subName: subContactName, amount, invoiceNumber, link: '/bills'
      // }. Suppressed until the registry lands.

      return res.json({
        ok: true,
        financialsId: ref.id,
        invoiceNumber: billDoc.invoiceNumber,
        amount,
        projectName,
      });
    } catch (err: any) {
      console.error('[submitInvoice] failed', err);
      return res.status(500).json({ error: err?.message || 'Invoice submission failed' });
    }
  });
}
