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
// Who can finalize an award directly, and who can approve a PM's request.
// PMs deliberately excluded — their awards go through the approval queue.
const APPROVER_ROLES = new Set(['gc', 'admin']);

interface AwardResult {
  ok: boolean;
  awardedSubUid?: string | null;
  status?: number;        // HTTP status to return on failure
  error?: string;
  missingItems?: string[];
}

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

/**
 * The binding award: compliance gate (D-016) → bid status `awarded`, parent
 * bidRequest `awarded`, sub notified. Used both by the direct GC/admin award
 * and by the admin approval of a PM's queued request.
 */
async function executeAward(
  db: admin.firestore.Firestore,
  data: AwardPayload,
  reviewerUid: string,
): Promise<AwardResult> {
  const bidRef = db.collection('bids').doc(data.bidId);
  const bidSnap = await bidRef.get();
  if (!bidSnap.exists) return { ok: false, status: 404, error: 'Bid not found' };
  const bid = bidSnap.data() as any;
  if (bid.status === 'awarded') return { ok: false, status: 409, error: 'Bid is already awarded' };

  const check = await checkSubCompliance(db, bid);
  if (!check.ok) {
    const subName = bid.subName || bid.subCompany || 'this subcontractor';
    return {
      ok: false,
      status: 400,
      error: `Can't award — ${subName} is missing: ${check.missingItems.join(', ')}.`,
      missingItems: check.missingItems,
    };
  }

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

  if (check.resolvedUid) {
    try {
      await db.collection('notifications').add({
        userId: check.resolvedUid,
        kind: 'system',
        title: `Bid awarded: ${bid.trade || 'your trade'}`,
        body: `Your bid for ${bid.projectName || 'this project'} was awarded. Skyeline will follow up with next steps.`,
        link: '/subcontractor-portal/bids',
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

  return { ok: true, awardedSubUid: check.resolvedUid || null };
}

export function registerAwardBidRoute(
  app: Express,
  db: admin.firestore.Firestore,
) {
  // POST /api/bids/award
  // GC/admin → award immediately. projectManager → queue an approval request
  // (an admin must approve before the sub is bound).
  app.post('/api/bids/award', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const reviewerUid = decoded.uid;

      const reviewerSnap = await db.collection('users').doc(reviewerUid).get();
      const reviewerData = reviewerSnap.exists ? (reviewerSnap.data() as any) : null;
      const reviewerRole = reviewerData?.role;
      if (!reviewerRole || !STAFF_ROLES.has(String(reviewerRole))) {
        return res.status(403).json({ error: 'Only Skyeline staff can award bids' });
      }

      const data = (req.body || {}) as AwardPayload;
      if (!data.bidId || !data.projectId) {
        return res.status(400).json({ error: 'Missing bidId or projectId' });
      }

      // Project Manager: queue an approval request instead of awarding.
      if (String(reviewerRole) === 'projectManager') {
        const bidSnap = await db.collection('bids').doc(data.bidId).get();
        if (!bidSnap.exists) return res.status(404).json({ error: 'Bid not found' });
        const bid = bidSnap.data() as any;
        if (bid.status === 'awarded') return res.status(409).json({ error: 'Bid is already awarded' });

        // Don't queue duplicates for the same bid.
        const dupe = await db.collection('pendingSubAssignments')
          .where('bidId', '==', data.bidId)
          .where('status', '==', 'pending')
          .limit(1)
          .get();
        if (!dupe.empty) {
          return res.json({ pendingApproval: true, requestId: dupe.docs[0].id, duplicate: true });
        }

        const reqRef = await db.collection('pendingSubAssignments').add({
          bidId: data.bidId,
          projectId: data.projectId,
          bidRequestId: data.bidRequestId || null,
          projectName: bid.projectName || '',
          subName: bid.subName || '',
          subCompany: bid.subCompany || '',
          trade: bid.trade || '',
          amount: bid.totalAmount ?? null,
          requestedByUid: reviewerUid,
          requestedByName: reviewerData?.name || decoded.email || 'Project Manager',
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return res.json({ pendingApproval: true, requestId: reqRef.id });
      }

      // GC / admin: award now.
      const result = await executeAward(db, data, reviewerUid);
      if (!result.ok) {
        return res.status(result.status || 500).json({ error: result.error, missingItems: result.missingItems });
      }
      return res.json({ ok: true, bidId: data.bidId, awardedSubUid: result.awardedSubUid });
    } catch (e: any) {
      console.error('award bid error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });

  // POST /api/pending-sub-assignments/:id/approve — admin/GC approves a PM's
  // queued sub assignment; the award executes (compliance gate still applies).
  app.post('/api/pending-sub-assignments/:id/approve', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const approverUid = decoded.uid;
      const approverSnap = await db.collection('users').doc(approverUid).get();
      const approverRole = approverSnap.exists ? (approverSnap.data() as any).role : null;
      if (!approverRole || !APPROVER_ROLES.has(String(approverRole))) {
        return res.status(403).json({ error: 'Only an admin can approve sub assignments' });
      }

      const reqRef = db.collection('pendingSubAssignments').doc(req.params.id);
      const reqSnap = await reqRef.get();
      if (!reqSnap.exists) return res.status(404).json({ error: 'Request not found' });
      const reqData = reqSnap.data() as any;
      if (reqData.status !== 'pending') {
        return res.status(409).json({ error: `Request already ${reqData.status}` });
      }

      const result = await executeAward(
        db,
        { bidId: reqData.bidId, projectId: reqData.projectId, bidRequestId: reqData.bidRequestId || undefined },
        approverUid,
      );
      if (!result.ok) {
        // Surface the failure (e.g. compliance) but leave the request pending so
        // it can be retried once the sub is compliant.
        return res.status(result.status || 500).json({ error: result.error, missingItems: result.missingItems });
      }

      await reqRef.update({
        status: 'approved',
        resolvedByUid: approverUid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        awardedSubUid: result.awardedSubUid,
      });
      return res.json({ ok: true, awardedSubUid: result.awardedSubUid });
    } catch (e: any) {
      console.error('approve sub assignment error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });

  // POST /api/pending-sub-assignments/:id/deny — admin/GC rejects the request.
  app.post('/api/pending-sub-assignments/:id/deny', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const approverUid = decoded.uid;
      const approverSnap = await db.collection('users').doc(approverUid).get();
      const approverRole = approverSnap.exists ? (approverSnap.data() as any).role : null;
      if (!approverRole || !APPROVER_ROLES.has(String(approverRole))) {
        return res.status(403).json({ error: 'Only an admin can deny sub assignments' });
      }

      const reqRef = db.collection('pendingSubAssignments').doc(req.params.id);
      const reqSnap = await reqRef.get();
      if (!reqSnap.exists) return res.status(404).json({ error: 'Request not found' });
      if ((reqSnap.data() as any).status !== 'pending') {
        return res.status(409).json({ error: 'Request already resolved' });
      }

      await reqRef.update({
        status: 'denied',
        resolvedByUid: approverUid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        denyReason: (req.body || {}).reason || null,
      });
      return res.json({ ok: true });
    } catch (e: any) {
      console.error('deny sub assignment error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
