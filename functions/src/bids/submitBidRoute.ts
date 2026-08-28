// POST /api/bids/submit
//
// Server-side bid submission that closes the loop between a magic-link
// invite (projects/{p}/bidRequests/{r}.vendors[i]) and the top-level
// `bids` collection a sub writes from the portal.
//
// Previously the sub portal wrote to `bids` directly with `addDoc`, but the
// parent bidRequest's vendor record was NEVER updated — so Tyler's bid
// dashboard kept showing every vendor as "pending" even after they
// submitted. That's the loop break.
//
// This route writes both sides atomically:
//   1. Creates `bids/{bidId}` with the submission payload
//   2. Flips vendors[i].bidStatus → 'submitted' and stamps bidResponseId
//   3. If every vendor on the request is now 'submitted' or 'declined',
//      flags bidRequest.allResponsesIn = true so the UI can offer a
//      one-click "Analyze bids" action.
//
// Auth: Bearer Firebase ID token. The submitting user can be any signed-in
// sub — the bidRequestId + vendor email/uid identify which vendor row to
// flip. Staff (gc/admin/projectManager) can also submit on a sub's behalf
// (rare; lets us paper-trail an offline phone bid).

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { fireTrigger } from '../notifications/fireTrigger';
import { computeBidPricing } from './bidPricing';

interface SubmitBidPayload {
  bidRequestId: string;
  projectId: string;
  // The actual bid payload — passthrough into `bids/{id}`. Keys mirror what
  // SubBidSubmissionForm already builds so we don't double-validate fields
  // the UI just rendered. Server adds bidRequestId/projectId/timestamps.
  bid: Record<string, any>;
  // Optional: if the caller already knows the vendor row to flip (vendorIndex
  // from the magic-link token resolution), pass it. Otherwise we resolve by
  // matching submittedByUid → linkedUserId, then email, then subContactId.
  vendorIndex?: number;
}

function pickVendorIndex(
  vendors: any[],
  hint: { vendorIndex?: number; uid?: string; email?: string; contactId?: string },
): number {
  if (typeof hint.vendorIndex === 'number' && vendors[hint.vendorIndex]) {
    return hint.vendorIndex;
  }
  if (hint.uid) {
    const i = vendors.findIndex(v => v && v.linkedUserId === hint.uid);
    if (i >= 0) return i;
  }
  if (hint.email) {
    const e = hint.email.toLowerCase().trim();
    const i = vendors.findIndex(v => v && typeof v.email === 'string' && v.email.toLowerCase().trim() === e);
    if (i >= 0) return i;
  }
  if (hint.contactId) {
    const i = vendors.findIndex(v => v && v.contactId === hint.contactId);
    if (i >= 0) return i;
  }
  return -1;
}

export function registerSubmitBidRoute(app: Express, db: admin.firestore.Firestore): void {
  app.post('/api/bids/submit', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const submitterUid = decoded.uid;
      const submitterEmail = (decoded.email || '').toLowerCase().trim();

      const body = (req.body || {}) as SubmitBidPayload;
      if (!body.bidRequestId || !body.projectId || !body.bid) {
        return res.status(400).json({ error: 'Missing bidRequestId, projectId, or bid' });
      }

      const bidRequestRef = db
        .collection('projects').doc(body.projectId)
        .collection('bidRequests').doc(body.bidRequestId);
      const bidRequestSnap = await bidRequestRef.get();
      if (!bidRequestSnap.exists) {
        return res.status(404).json({ error: 'Bid request not found' });
      }
      const br = bidRequestSnap.data() as any;
      const vendors: any[] = Array.isArray(br.vendors) ? [...br.vendors] : [];

      // Identify which vendor row this submission satisfies.
      const idx = pickVendorIndex(vendors, {
        vendorIndex: body.vendorIndex,
        uid: submitterUid,
        email: submitterEmail,
        contactId: body.bid?.subContactId,
      });

      // Write the bid doc first so we can stamp its id on the vendor row.
      const bidRef = db.collection('bids').doc();
      const bidPayload: Record<string, any> = {
        ...body.bid,
        bidRequestId: body.bidRequestId,
        projectId: body.projectId,
        submittedByUid: submitterUid,
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'received',
      };
      // Don't let the caller override the security-relevant fields.
      delete bidPayload.awardedAt;
      delete bidPayload.awardedByUserId;

      // Authoritative pricing recompute. For line-item bids we NEVER trust the
      // client's totalAmount — we recompute it from the persisted line items
      // and the sub's declared build-up (overhead/profit/tax), then store an
      // immutable snapshot. A tampered POST that inflates or deflates the total
      // is silently corrected here. pdfQuote bids have no line items, so their
      // flat totalAmount is left as submitted.
      if (bidPayload.bidMode === 'lineItems') {
        const lines = Array.isArray(bidPayload.lineItems) ? bidPayload.lineItems : [];
        const snapshot = computeBidPricing(lines, bidPayload.pricing || undefined);
        bidPayload.pricing = {
          markupPct: snapshot.markupPct,
          overheadPct: snapshot.overheadPct,
          taxPct: snapshot.taxPct,
        };
        bidPayload.pricingSnapshot = snapshot;
        bidPayload.subtotal = snapshot.baseSubtotal;
        bidPayload.taxAmount = snapshot.taxAmt;
        bidPayload.totalAmount = snapshot.total;
      }

      const batch = db.batch();
      batch.set(bidRef, bidPayload);

      let allResponsesIn = false;
      if (idx >= 0) {
        vendors[idx] = {
          ...vendors[idx],
          bidStatus: 'submitted',
          bidResponseId: bidRef.id,
          respondedAt: admin.firestore.Timestamp.now(),
        };

        // Check if every vendor has now responded (submitted or declined).
        // We treat 'expired' as still open (Tyler can re-invite) and
        // 'pending'/'viewed' as still open.
        allResponsesIn = vendors.length > 0 && vendors.every(v =>
          v && (v.bidStatus === 'submitted' || v.bidStatus === 'declined'),
        );
      }

      const brUpdate: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (idx >= 0) brUpdate.vendors = vendors;
      if (allResponsesIn) brUpdate.allResponsesIn = true;
      batch.update(bidRequestRef, brUpdate);

      await batch.commit();

      // Notify the GC who requested the bid (best-effort).
      try {
        const total = typeof bidPayload.totalAmount === 'number'
          ? bidPayload.totalAmount
          : 0;
        await fireTrigger({
          db,
          triggerKey: 'bid_received',
          recipientUserId: br.invitedByUserId,
          projectId: body.projectId,
          variables: {
            subName: bidPayload.subName || 'A subcontractor',
            trade: br.trade || bidPayload.trade || 'trade',
            total: total ? total.toLocaleString() : 'see bid',
            projectName: br.projectName || bidPayload.projectName || '',
            link: `/projects/${body.projectId}/bids`,
            bidRequestId: body.bidRequestId,
            allResponsesIn: allResponsesIn ? 'yes' : 'no',
          },
        });
      } catch (e) {
        console.warn('[submitBidRoute] fireTrigger failed (non-blocking):', e);
      }

      return res.json({
        ok: true,
        bidId: bidRef.id,
        vendorIndex: idx,
        allResponsesIn,
      });
    } catch (e: any) {
      console.error('[submitBidRoute] error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
