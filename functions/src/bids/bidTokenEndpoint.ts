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

interface PublicBidPlan {
  name: string;
  url: string;          // short-lived (1h) v4 signed read URL when a storagePath
                        // is known; falls back to the stored download URL only
                        // when the plan predates storagePath capture.
  storagePath?: string;
  size?: number;
}

// Mint a short-lived (1 hour) signed read URL for a plan so a leaked link
// stops working within the hour instead of granting permanent file access.
// Best-effort: if signing fails (missing file / IAM), we fall back to the
// caller-provided long-lived URL so the sub can still see their plans.
async function signPlanUrl(storagePath: string, fallbackUrl: string): Promise<string> {
  try {
    const file = admin.storage().bucket().file(storagePath);
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1h
      version: 'v4',
    });
    return url;
  } catch (e: any) {
    console.warn('[bidToken] signed URL failed for', storagePath, e?.message || e);
    return fallbackUrl;
  }
}

// Public-safe shape of a client selection. Subs see only what they need to
// bid against the right product — image, brand, spec — never the allowance
// amount or any other competitive-bid info.
interface PublicSelection {
  id: string;
  category?: string;
  area?: string;
  room?: string;
  productName?: string;
  vendor?: string;
  description?: string;
  imageUrl?: string;
  productUrl?: string;
}

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
  // Bid-package fields — surfaced so BidRespond can render scope, callouts,
  // and plan downloads above the submission CTA. The token IS the auth: any
  // sub holding a valid invite token to this bidRequest may view these.
  scope?: string;                             // per-trade scope-of-work narrative
  callouts?: string;                          // common notes for all subs on this package
  plans?: PublicBidPlan[];                    // plans / docs the sub should review
  // IA-audit gap #3: selections attached by trade. Subs need these to bid
  // against the actual brand/finish/spec the client picked. Resolved by ID
  // from projects/{id}/selections/{id}; competitive-bid fields are stripped.
  selections?: PublicSelection[];
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

      // Sanitize plans into a minimal public shape — drop storage-internal
      // refs the sub doesn't need, keep download url + filename + size for the
      // UI listing.
      const rawPlans = Array.isArray(br.plans) ? (br.plans as any[]) : [];
      const publicPlans: PublicBidPlan[] = await Promise.all(
        rawPlans
          .filter(p => p && typeof p.url === 'string' && p.url)
          .map(async p => {
            const storagePath = typeof p.storagePath === 'string' ? p.storagePath : undefined;
            const url = storagePath
              ? await signPlanUrl(storagePath, String(p.url))
              : String(p.url);
            return {
              name: typeof p.name === 'string' && p.name ? p.name : 'Plan',
              url,
              storagePath,
              size: typeof p.size === 'number' ? p.size : undefined,
            };
          }),
      );

      // Resolve attached selection IDs into public-safe records. The token IS
      // the auth for this view — any sub holding a valid invite token to this
      // bidRequest may see the selections that drive their bid. Allowance
      // amounts and approval status are NEVER returned.
      const selIds: string[] = Array.isArray(br.attachedSelectionIds)
        ? (br.attachedSelectionIds as any[]).filter(x => typeof x === 'string') as string[]
        : [];
      const publicSelections: PublicSelection[] = [];
      if (selIds.length > 0) {
        const fetches = selIds.map(async id => {
          try {
            const snap = await db
              .collection('projects').doc(projectId)
              .collection('selections').doc(id)
              .get();
            if (!snap.exists) return null;
            const d = snap.data() as any;
            const items: any[] = Array.isArray(d.items) ? d.items : [];
            const firstItem = items.find(i => i && i.status !== 'removed') || items[0] || {};
            const parts: string[] = [];
            if (firstItem.size) parts.push(String(firstItem.size));
            if (firstItem.tileLayout) parts.push(`Layout: ${firstItem.tileLayout}`);
            if (firstItem.grout) parts.push(`Grout: ${firstItem.grout}`);
            if (d.area) parts.push(String(d.area));
            if (d.room) parts.push(String(d.room));
            const sel: PublicSelection = {
              id,
              category: typeof d.category === 'string' ? d.category : undefined,
              area: typeof d.area === 'string' ? d.area : undefined,
              room: typeof d.room === 'string' ? d.room : undefined,
              productName: typeof firstItem.productName === 'string' ? firstItem.productName : undefined,
              vendor: typeof firstItem.vendor === 'string' ? firstItem.vendor : undefined,
              description: parts.length > 0 ? parts.join(' · ') : undefined,
              imageUrl: Array.isArray(firstItem.imageUrls) && firstItem.imageUrls[0]
                ? String(firstItem.imageUrls[0])
                : undefined,
              productUrl: typeof firstItem.productUrl === 'string' ? firstItem.productUrl : undefined,
            };
            return sel;
          } catch (e: any) {
            console.warn('[bidToken] selection fetch failed', id, e?.message || e);
            return null;
          }
        });
        const resolved = await Promise.all(fetches);
        for (const r of resolved) if (r) publicSelections.push(r);
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
        scope: typeof br.scope === 'string' && br.scope ? br.scope : undefined,
        callouts: typeof br.callouts === 'string' && br.callouts ? br.callouts : undefined,
        plans: publicPlans.length > 0 ? publicPlans : undefined,
        selections: publicSelections.length > 0 ? publicSelections : undefined,
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
