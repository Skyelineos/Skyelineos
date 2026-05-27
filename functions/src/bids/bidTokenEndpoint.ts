// Public token-resolution endpoint for the magic-link bid response flow.
// Per docs/sub-portal-design.md Slice 1.
//
// Flow:
//   1. Sub clicks SMS/email link → /bid/respond/:token
//   2. Frontend calls GET /api/bid-requests/by-token/:token (this endpoint)
//   3. Endpoint resolves the token → returns project + scope info
//   4. If sub not signed in, frontend prompts sign-in / sign-up (preserving the token)
//   5. After sign-in, sub lands on the bid response form
//
// Public: no auth required (the token IS the auth for view-only access).
// Returns only public-safe fields. NEVER returns other vendors' info, internal
// notes, bid amounts from other respondents, or anything that would leak
// competitive bid pricing.

import type { Express } from 'express';
import * as admin from 'firebase-admin';

interface PublicBidContext {
  bidRequestId: string;
  projectId: string;
  projectName?: string;
  trade?: string;
  type: 'general' | 'item';
  stage: string;
  selectionTitle?: string;
  selectionSpecs?: string;
  tierGuidance?: { parade: string; midLuxury: string; lowLuxury: string };
  customMessage?: string;
  dueByDate: string;                          // ISO
  requesterName?: string;
  vendor: {
    vendorName: string;
    email?: string;
    contactId?: string;
    bidStatus: 'pending' | 'viewed' | 'submitted' | 'declined' | 'expired';
    alreadyResponded: boolean;
    bidResponseId?: string;
  };
  tokenExpired: boolean;
}

export function registerBidTokenEndpoint(app: Express, db: admin.firestore.Firestore) {
  app.get('/api/bid-requests/by-token/:token', async (req: any, res: any) => {
    try {
      const { token } = req.params;
      if (!token || typeof token !== 'string' || token.length < 16) {
        console.warn('[bidToken] Rejecting malformed token (len=' + (token?.length ?? 0) + ')');
        return res.status(400).json({ error: 'Invalid token format' });
      }

      // O(1) token lookup. Log enough to diagnose if a real link 404s — print
      // the full token to Cloud Function logs (only visible to project staff)
      // so we can cross-reference against bidInviteTokens directly.
      const tokenSnap = await db.collection('bidInviteTokens').doc(token).get();
      if (!tokenSnap.exists) {
        console.warn('[bidToken] No bidInviteTokens entry for token=' + token);
        return res.status(404).json({
          error: 'This bid invitation is no longer valid. It may have been withdrawn by Skyeline Homes, sent before our portal was live, or the link is from a different project. Contact Skyeline if you believe this is wrong.',
        });
      }
      const tokenData = tokenSnap.data()!;
      const { projectId, bidRequestId, vendorIndex, expiresAt } = tokenData;

      const now = admin.firestore.Timestamp.now();
      const tokenExpired = expiresAt && expiresAt.toMillis() < now.toMillis();

      // Load the bid request
      const bidRequestRef = db
        .collection('projects')
        .doc(projectId)
        .collection('bidRequests')
        .doc(bidRequestId);
      const bidRequestSnap = await bidRequestRef.get();
      if (!bidRequestSnap.exists) {
        console.warn('[bidToken] Token resolved but bidRequest missing: project=' + projectId + ' bidRequestId=' + bidRequestId);
        return res.status(404).json({
          error: 'This bid request has been deleted by Skyeline Homes. The invitation is no longer active. Reach out to Skyeline if you have questions.',
        });
      }
      const br = bidRequestSnap.data()!;
      const vendor = (br.vendors as any[])?.[vendorIndex];
      if (!vendor) {
        return res.status(404).json({ error: 'Vendor entry not found on this request' });
      }

      // Load the project for display name (best effort — don't fail if missing)
      let projectName: string | undefined;
      try {
        const projectSnap = await db.collection('projects').doc(projectId).get();
        if (projectSnap.exists) {
          projectName = (projectSnap.data() as any)?.name;
        }
      } catch {
        /* ignore */
      }

      // Mark vendor.bidStatus = 'viewed' if first view + not yet expired/submitted
      //
      // NOTE: FieldValue.serverTimestamp() cannot be used inside an array
      // element — Firestore rejects the whole update if you try. Since we're
      // already inside a Cloud Function (Google's clock), Timestamp.now() is
      // the correct workaround and has the same semantic for our audit needs.
      if (vendor.bidStatus === 'pending' && !tokenExpired) {
        const vendorsArr = [...(br.vendors as any[])];
        vendorsArr[vendorIndex] = {
          ...vendor,
          bidStatus: 'viewed',
          viewedAt: admin.firestore.Timestamp.now(),
        };
        await bidRequestRef.update({ vendors: vendorsArr });
      }

      const response: PublicBidContext = {
        bidRequestId,
        projectId,
        projectName,
        trade: br.trade || undefined,
        type: br.type as 'general' | 'item',
        stage: br.stage,
        selectionTitle: br.selectionTitle || undefined,
        selectionSpecs: br.selectionSpecs || undefined,
        tierGuidance: br.tierGuidance || undefined,
        customMessage: br.customMessage || undefined,
        dueByDate: br.dueByDate?.toDate().toISOString(),
        requesterName: br.requesterName || undefined,
        vendor: {
          vendorName: vendor.vendorName,
          email: vendor.email,
          contactId: vendor.contactId,
          bidStatus: vendor.bidStatus,
          alreadyResponded: !!vendor.bidResponseId,
          bidResponseId: vendor.bidResponseId,
        },
        tokenExpired: !!tokenExpired,
      };

      return res.json(response);
    } catch (e: any) {
      console.error('bid-token resolve error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
