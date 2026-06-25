// GET /api/projects/:id/bids/summary
//
// At-a-glance bid status for one project. Returns every bidRequest with the
// per-vendor status array + the count of received bids, so Tyler can see
// (1) which subs haven't responded yet, (2) which packages are ready to
// analyze, and (3) which trades have been awarded.
//
// Returns:
// {
//   projectId,
//   packages: [
//     {
//       bidRequestId, trade, stage, dueByDate, status,
//       allResponsesIn, awardedBidId,
//       vendors: [
//         { vendorName, email, bidStatus, viewedAt, respondedAt, bidResponseId }
//       ],
//       bidStatusCounts: { pending, viewed, submitted, declined, expired },
//       receivedBids: [
//         { bidId, subName, totalAmount, status, submittedAt }
//       ]
//     }
//   ],
//   totals: { invited, viewed, submitted, declined, awarded }
// }
//
// Auth: any Skyeline staff role (gc/admin/projectManager).

import type { Express } from 'express';
import * as admin from 'firebase-admin';

const STAFF_ROLES = new Set(['gc', 'admin', 'projectManager']);

function statusCounts(vendors: any[]): Record<string, number> {
  const out: Record<string, number> = {
    pending: 0, viewed: 0, submitted: 0, declined: 0, expired: 0,
  };
  for (const v of vendors) {
    const s = v?.bidStatus || 'pending';
    if (s in out) out[s] += 1;
  }
  return out;
}

function tsToIso(ts: any): string | null {
  if (!ts) return null;
  try {
    if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
    if (ts instanceof Date) return ts.toISOString();
    if (typeof ts === 'string') return ts;
  } catch { /* fall through */ }
  return null;
}

export function registerBidsSummaryRoute(app: Express, db: admin.firestore.Firestore): void {
  app.get('/api/projects/:id/bids/summary', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const userSnap = await db.collection('users').doc(decoded.uid).get();
      const role = userSnap.exists ? (userSnap.data() as any)?.role : null;
      if (!role || !STAFF_ROLES.has(String(role))) {
        return res.status(403).json({ error: 'Staff role required' });
      }

      const projectId = req.params.id;
      if (!projectId) return res.status(400).json({ error: 'Missing project id' });

      const bidRequestsSnap = await db
        .collection('projects').doc(projectId)
        .collection('bidRequests')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();

      // Pre-fetch all bids for this project in one query so we don't make a
      // round-trip per package. Keyed by bidRequestId.
      const bidsSnap = await db.collection('bids')
        .where('projectId', '==', projectId)
        .limit(500)
        .get();
      const bidsByRequest = new Map<string, any[]>();
      for (const d of bidsSnap.docs) {
        const b: any = d.data();
        const list = bidsByRequest.get(b.bidRequestId) || [];
        list.push({
          bidId: d.id,
          subName: b.subName || b.subCompany || '',
          subEmail: b.subEmail || '',
          trade: b.trade || '',
          totalAmount: typeof b.totalAmount === 'number' ? b.totalAmount : null,
          status: b.status || 'received',
          submittedAt: tsToIso(b.submittedAt),
          awardedAt: tsToIso(b.awardedAt),
        });
        bidsByRequest.set(b.bidRequestId, list);
      }

      const totals = { invited: 0, viewed: 0, submitted: 0, declined: 0, awarded: 0 };
      const packages = bidRequestsSnap.docs.map(d => {
        const br: any = d.data();
        const vendors: any[] = Array.isArray(br.vendors) ? br.vendors : [];
        const counts = statusCounts(vendors);
        totals.invited += vendors.length;
        totals.viewed += counts.viewed + counts.submitted; // submitted implies viewed
        totals.submitted += counts.submitted;
        totals.declined += counts.declined;
        if (br.status === 'awarded') totals.awarded += 1;

        // Derive the package-level status track:
        //   INVITED \u2192 VIEWED \u2192 SUBMITTED \u2192 ANALYZED \u2192 AWARDED
        let track = 'INVITED';
        if (counts.viewed + counts.submitted > 0) track = 'VIEWED';
        if (counts.submitted > 0) track = 'SUBMITTED';
        if (br.aiAnalysisAt || br.analyzedAt) track = 'ANALYZED';
        if (br.status === 'awarded' || br.awardedBidId) track = 'AWARDED';

        return {
          bidRequestId: d.id,
          trade: br.trade || null,
          stage: br.stage || null,
          type: br.type || 'item',
          dueByDate: tsToIso(br.dueByDate) || tsToIso(br.dueDate),
          status: br.status || 'open',
          track,
          allResponsesIn: !!br.allResponsesIn || counts.pending + counts.viewed === 0,
          awardedBidId: br.awardedBidId || null,
          createdAt: tsToIso(br.createdAt),
          vendors: vendors.map(v => ({
            vendorName: v?.vendorName || '',
            email: v?.email || null,
            phone: v?.phone || null,
            contactId: v?.contactId || null,
            bidStatus: v?.bidStatus || 'pending',
            viewedAt: tsToIso(v?.viewedAt),
            respondedAt: tsToIso(v?.respondedAt),
            bidResponseId: v?.bidResponseId || null,
          })),
          bidStatusCounts: counts,
          receivedBids: bidsByRequest.get(d.id) || [],
        };
      });

      return res.json({ projectId, packages, totals });
    } catch (e: any) {
      console.error('[bidsSummaryRoute] error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
