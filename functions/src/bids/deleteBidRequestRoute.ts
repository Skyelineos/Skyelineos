// POST /api/bid-requests/delete
//
// Staff-side endpoint to delete a single bidRequest (a tile in the GC's
// "Open Packages" view). Cascades:
//   1. Deletes every bidInviteTokens/{token} doc for vendors in this request
//   2. Deletes the bidRequest doc itself
//   3. If the parent bidPackages/{id} doc has no other child bidRequests
//      after this deletion, removes it too (so stale packages don't linger)
//
// Authorized: gc / projectManager / admin only.

import type { Express } from 'express';
import * as admin from 'firebase-admin';

interface DeletePayload {
  projectId: string;
  bidRequestId: string;
}

const STAFF_ROLES = new Set(['gc', 'admin', 'projectManager']);

export function registerDeleteBidRequestRoute(
  app: Express,
  db: admin.firestore.Firestore,
) {
  app.post('/api/bid-requests/delete', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const uid = decoded.uid;

      const userSnap = await db.collection('users').doc(uid).get();
      const role = userSnap.exists ? (userSnap.data() as any).role : null;
      if (!role || !STAFF_ROLES.has(String(role))) {
        return res.status(403).json({ error: 'Only staff can delete bid requests' });
      }

      const data = (req.body || {}) as DeletePayload;
      if (!data.projectId || !data.bidRequestId) {
        return res.status(400).json({ error: 'Missing projectId or bidRequestId' });
      }

      const reqRef = db
        .collection('projects')
        .doc(data.projectId)
        .collection('bidRequests')
        .doc(data.bidRequestId);
      const reqSnap = await reqRef.get();
      if (!reqSnap.exists) {
        return res.status(404).json({ error: 'Bid request not found' });
      }
      const reqData = reqSnap.data() as any;

      // Collect every invite token associated with this request so we can
      // clean up the root-level lookup collection.
      const vendors = (reqData.vendors as Array<{ inviteToken?: string }>) || [];
      const tokensToDelete = vendors.map(v => v.inviteToken).filter((t): t is string => !!t);

      // Batch the deletes (single atomic write).
      const batch = db.batch();
      for (const token of tokensToDelete) {
        batch.delete(db.collection('bidInviteTokens').doc(token));
      }
      batch.delete(reqRef);
      await batch.commit();

      // Orphan-check: if this bidRequest had a parent bidPackage, check
      // whether any sibling bidRequests still reference it. If not, delete
      // the parent so the Bid Packages view doesn't show empty package shells.
      let parentPackageDeleted = false;
      const bidPackageId: string | undefined = reqData.bidPackageId;
      if (bidPackageId) {
        const siblings = await db
          .collection('projects')
          .doc(data.projectId)
          .collection('bidRequests')
          .where('bidPackageId', '==', bidPackageId)
          .limit(1)
          .get();
        if (siblings.empty) {
          await db
            .collection('projects')
            .doc(data.projectId)
            .collection('bidPackages')
            .doc(bidPackageId)
            .delete();
          parentPackageDeleted = true;
        }
      }

      return res.json({
        ok: true,
        deletedBidRequestId: data.bidRequestId,
        deletedTokens: tokensToDelete.length,
        parentPackageDeleted,
      });
    } catch (e: any) {
      console.error('delete bid request error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
