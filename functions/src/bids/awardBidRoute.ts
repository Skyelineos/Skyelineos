// POST /api/bids/award
//
// Server-side bid award + compliance gate (D-016).
//
// Today the GC can press "Award" on any bid from the PortalBidsPanel
// AwardBidModal. Per D-016, this endpoint REQUIRES the winning sub to have
// all four compliance items on file BEFORE the award can land:
//   1. W-9 (users/{uid}.w9Filed === true)
//   2. Insurance current (users/{uid}.insuranceCurrent === true)
//   3. Signed Subcontractor Agreement (users/{uid}.agreementSigned === true)
//   4. Contractor license number (users/{uid}.contractorLicenseNumber non-empty)
//
// If any are missing → 400 with { error, missingItems: [...] } so the modal
// can show the GC exactly what's missing. If all present → the award lands
// atomically: bid status → awarded, parent bidRequest status → awarded,
// sub gets an in-app notification.
//
// Authorized: gc / projectManager / admin.

import type { Express } from 'express';
import * as admin from 'firebase-admin';

interface AwardPayload {
  bidId: string;
  projectId: string;
  bidRequestId?: string;       // optional — parent bidRequest, if known
}

interface ComplianceCheckResult {
  ok: boolean;
  missingItems: string[];      // user-facing labels
  resolvedUid?: string;        // the sub's Firebase Auth UID if found
}

const STAFF_ROLES = new Set(['gc', 'admin', 'projectManager']);

/**
 * Resolve a bid → the sub's users/{uid} doc. Bids may identify the sub
 * by different keys depending on how they were created (subContactId,
 * submittedByUid, etc.). Try a few common shapes.
 */
async function resolveSubUserDoc(
  db: admin.firestore.Firestore,
  bid: any,
): Promise<admin.firestore.DocumentSnapshot | null> {
  // Preferred: bid.submittedByUid is the actual Auth UID
  if (bid.submittedByUid) {
    const s = await db.collection('users').doc(bid.submittedByUid).get();
    if (s.exists) return s;
  }
  // Fall back: bid.subContactId points at contacts/{id} which has linkedUserId
  if (bid.subContactId) {
    const c = await db.collection('contacts').doc(bid.subContactId).get();
    if (c.exists) {
      const linkedUid = (c.data() as any)?.linkedUserId;
      if (linkedUid) {
        const s = await db.collection('users').doc(linkedUid).get();
        if (s.exists) return s;
      }
    }
  }
  // Last resort: lookup by subId field (legacy)
  if (bid.subId) {
    const s = await db.collection('users').doc(bid.subId).get();
    if (s.exists) return s;
  }
  return null;
}

async function checkSubCompliance(
  db: admin.firestore.Firestore,
  bid: any,
): Promise<ComplianceCheckResult> {
  const userSnap = await resolveSubUserDoc(db, bid);
  if (!userSnap) {
    return {
      ok: false,
      missingItems: [
        'Sub portal account (sub hasn\'t signed up yet — they need a Skyeline portal login)',
      ],
    };
  }
  const u = userSnap.data() as any;
  const missing: string[] = [];
  if (!u.w9Filed) missing.push('W-9 tax form');
  if (!u.insuranceCurrent) missing.push('Certificate of Insurance');
  if (!u.agreementSigned) missing.push('Signed Subcontractor Agreement');
  if (!u.contractorLicenseNumber || !String(u.contractorLicenseNumber).trim()) {
    missing.push('Contractor license number');
  }
  return {
    ok: missing.length === 0,
    missingItems: missing,
    resolvedUid: userSnap.id,
  };
}

export function registerAwardBidRoute(
  app: Express,
  db: admin.firestore.Firestore,
) {
  app.post('/api/bids/award', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const reviewerUid = decoded.uid;

      // Authz: staff only
      const reviewerSnap = await db.collection('users').doc(reviewerUid).get();
      const reviewerRole = reviewerSnap.exists ? (reviewerSnap.data() as any).role : null;
      if (!reviewerRole || !STAFF_ROLES.has(String(reviewerRole))) {
        return res.status(403).json({ error: 'Only Skyeline staff can award bids' });
      }

      const data = (req.body || {}) as AwardPayload;
      if (!data.bidId || !data.projectId) {
        return res.status(400).json({ error: 'Missing bidId or projectId' });
      }

      // Load the bid
      const bidRef = db.collection('bids').doc(data.bidId);
      const bidSnap = await bidRef.get();
      if (!bidSnap.exists) {
        return res.status(404).json({ error: 'Bid not found' });
      }
      const bid = bidSnap.data() as any;

      if (bid.status === 'awarded') {
        return res.status(409).json({ error: 'Bid is already awarded' });
      }

      // Compliance gate (D-016)
      const check = await checkSubCompliance(db, bid);
      if (!check.ok) {
        const subName = bid.subName || bid.subCompany || 'this subcontractor';
        return res.status(400).json({
          error: `Can't award — ${subName} is missing: ${check.missingItems.join(', ')}.`,
          missingItems: check.missingItems,
        });
      }

      // Atomic cascade
      const batch = db.batch();
      batch.update(bidRef, {
        status: 'awarded',
        awardedAt: admin.firestore.FieldValue.serverTimestamp(),
        awardedByUserId: reviewerUid,
        complianceVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (data.bidRequestId) {
        const bidRequestRef = db
          .collection('projects')
          .doc(data.projectId)
          .collection('bidRequests')
          .doc(data.bidRequestId);
        batch.update(bidRequestRef, {
          status: 'awarded',
          awardedBidId: data.bidId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      // Best-effort: notify the winning sub
      if (check.resolvedUid) {
        try {
          await db.collection('notifications').add({
            userId: check.resolvedUid,
            kind: 'system',
            title: `Bid awarded: ${bid.trade || 'your trade'}`,
            body: `Your bid for ${bid.projectName || 'this project'} was awarded. Skyeline will follow up with next steps.`,
            link: '/sub',
            projectId: data.projectId,
            refType: 'bid',
            refId: data.bidId,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (notifyErr) {
          console.warn('[awardBid] notification write failed (non-blocking):', notifyErr);
        }
      }

      return res.json({
        ok: true,
        bidId: data.bidId,
        awardedSubUid: check.resolvedUid || null,
      });
    } catch (e: any) {
      console.error('award bid error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
