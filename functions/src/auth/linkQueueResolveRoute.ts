// POST /api/sub/link-queue/:id/resolve
//
// Staff-side endpoint to resolve a linkReviewQueue entry (D-012-h).
//
// Actions:
//   - 'link' { contactId } → set users/{queue.userId}.linkedContactId,
//                             set contacts/{contactId}.linkedUserId
//   - 'new_contact' { newContactData? } → create a fresh contact from the
//                                          sub's signup info, link both ways
//   - 'no_match' → just close the queue entry without linking
//
// All actions stamp the queue doc with reviewedBy + reviewedAt + action +
// (resolvedContactId where applicable) and flip status to 'resolved'.
//
// Authorized: gc / projectManager / admin (validated via users/{uid}.role).

import type { Express } from 'express';
import * as admin from 'firebase-admin';

type ResolverAction = 'link' | 'new_contact' | 'no_match';

interface ResolvePayload {
  action: ResolverAction;
  contactId?: string;
  newContactData?: Partial<{
    name: string;
    email: string;
    phone: string;
    company: string;
    trade: string;
    trades: string[];
    role: string;
  }>;
  notes?: string;
}

const STAFF_ROLES = new Set(['gc', 'admin', 'projectManager']);

export function registerLinkQueueResolveRoute(
  app: Express,
  db: admin.firestore.Firestore,
) {
  app.post('/api/sub/link-queue/:id/resolve', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const reviewerUid = decoded.uid;

      // Authz: caller must be staff
      const reviewerSnap = await db.collection('users').doc(reviewerUid).get();
      const reviewerRole = reviewerSnap.exists ? (reviewerSnap.data() as any).role : null;
      if (!reviewerRole || !STAFF_ROLES.has(String(reviewerRole))) {
        return res.status(403).json({ error: 'Not authorized to resolve link queue entries' });
      }

      const { id } = req.params;
      const payload = (req.body || {}) as ResolvePayload;
      if (!id || !payload?.action) {
        return res.status(400).json({ error: 'Missing queue id or action' });
      }

      const queueRef = db.collection('linkReviewQueue').doc(id);
      const queueSnap = await queueRef.get();
      if (!queueSnap.exists) {
        return res.status(404).json({ error: 'Queue entry not found' });
      }
      const queue = queueSnap.data() as any;

      if (queue.status !== 'pending') {
        return res.status(409).json({
          error: `Queue entry already resolved (status: ${queue.status})`,
        });
      }

      const subUid: string = queue.userId;
      const now = admin.firestore.FieldValue.serverTimestamp();

      let resolvedContactId: string | null = null;

      if (payload.action === 'link') {
        if (!payload.contactId) {
          return res.status(400).json({ error: 'Missing contactId for link action' });
        }
        // Verify contact exists
        const contactRef = db.collection('contacts').doc(payload.contactId);
        const contactSnap = await contactRef.get();
        if (!contactSnap.exists) {
          return res.status(404).json({ error: 'Contact not found' });
        }
        // Bidirectional link (override any existing linkedUserId — audit captured below)
        await contactRef.set(
          {
            linkedUserId: subUid,
            hasPortalAccess: true,
            updatedAt: now,
            linkUpdatedBy: reviewerUid,
          },
          { merge: true },
        );
        await db.collection('users').doc(subUid).set(
          {
            linkedContactId: payload.contactId,
            updatedAt: now,
            linkUpdatedBy: reviewerUid,
          },
          { merge: true },
        );
        resolvedContactId = payload.contactId;
      } else if (payload.action === 'new_contact') {
        // Use the queue's stored user info as the seed; staff can pass overrides.
        const seed = {
          name: queue.userVendorName || '',
          email: queue.userEmail || '',
          phone: queue.userPhone || '',
          company: queue.userCompany || '',
          role: 'sub',
          isActive: true,
          hasPortalAccess: true,
        };
        const newContactData = { ...seed, ...(payload.newContactData || {}) };
        const contactRef = await db.collection('contacts').add({
          ...newContactData,
          linkedUserId: subUid,
          createdAt: now,
          updatedAt: now,
          createdBy: reviewerUid,
        });
        await db.collection('users').doc(subUid).set(
          {
            linkedContactId: contactRef.id,
            updatedAt: now,
            linkUpdatedBy: reviewerUid,
          },
          { merge: true },
        );
        resolvedContactId = contactRef.id;
      } else if (payload.action === 'no_match') {
        // No-op on user/contact docs; just close out the queue entry.
      } else {
        return res.status(400).json({ error: `Unknown action: ${payload.action}` });
      }

      // Mark queue entry resolved
      await queueRef.set(
        {
          status: 'resolved',
          action: payload.action,
          resolvedContactId,
          reviewerNotes: payload.notes || null,
          reviewedBy: reviewerUid,
          reviewedAt: now,
        },
        { merge: true },
      );

      return res.json({
        ok: true,
        action: payload.action,
        resolvedContactId,
      });
    } catch (e: any) {
      console.error('link-queue resolve error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
