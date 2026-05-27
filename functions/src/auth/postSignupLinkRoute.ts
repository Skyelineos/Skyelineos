// POST /api/sub/post-signup-link
//
// Called from the client immediately after a new sub registration completes.
// Tries to link the new user to an existing `contacts/{id}` record:
//   1. Email exact match → link directly (set users/{uid}.linkedContactId
//      and contacts/{id}.linkedUserId).
//   2. No email match → run fuzzy match against name + phone. If candidates
//      score above the threshold, create a `linkReviewQueue/{id}` entry for
//      staff to resolve.
//   3. No candidates at all → no-op. The user can still use the portal; a
//      fresh contact will get created later if needed.
//
// Per docs/decisions.md D-012-h.
// Authorized: caller's Firebase ID token (sub claims their own linkage).

import type { Express } from 'express';
import * as admin from 'firebase-admin';

interface PostSignupPayload {
  vendorName?: string;
  phone?: string;
  company?: string;
}

interface FuzzyCandidate {
  contactId: string;
  vendorName: string;
  email?: string;
  phone?: string;
  company?: string;
  matchScore: number;
  matchReasons: string[];
}

// ── Fuzzy match helpers ─────────────────────────────────────────────────

function normalize(s: string | undefined | null): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizePhone(s: string | undefined | null): string {
  return (s || '').replace(/\D/g, '').slice(-10); // last 10 digits
}

/**
 * Jaccard similarity of word sets — coarse but effective for company names.
 * Returns 0..1.
 */
function nameSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const setA = new Set(norm(a));
  const setB = new Set(norm(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  setA.forEach(w => { if (setB.has(w)) inter++; });
  const union = setA.size + setB.size - inter;
  return union ? inter / union : 0;
}

const FUZZY_THRESHOLD = 0.4;

export function registerPostSignupLinkRoute(
  app: Express,
  db: admin.firestore.Firestore,
) {
  app.post('/api/sub/post-signup-link', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const uid = decoded.uid;
      const email = decoded.email?.toLowerCase();

      const payload = (req.body || {}) as PostSignupPayload;
      const vendorName = (payload.vendorName || decoded.name || '').trim();
      const phoneNorm = normalizePhone(payload.phone);
      const company = (payload.company || '').trim();

      // ── 0. Idempotency: skip if the client-side flow already linked.
      // SignIn.tsx runs a client-side email+phone+name matcher; this
      // endpoint runs after that completes and only fills in cases the
      // client matcher missed.
      const userSnap = await db.collection('users').doc(uid).get();
      if (userSnap.exists) {
        const u = userSnap.data() as any;
        if (u.linkedContactId) {
          return res.json({
            ok: true,
            outcome: 'already_linked',
            contactId: u.linkedContactId,
          });
        }
      }

      // ── 1. Email exact match ─────────────────────────────────────────
      if (email) {
        const exact = await db.collection('contacts')
          .where('email', '==', email)
          .limit(1)
          .get();
        if (!exact.empty) {
          const contactDoc = exact.docs[0];
          await contactDoc.ref.update({
            linkedUserId: uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          await db.collection('users').doc(uid).set(
            {
              linkedContactId: contactDoc.id,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          return res.json({
            ok: true,
            outcome: 'email_match',
            contactId: contactDoc.id,
            contactName: contactDoc.data().name,
          });
        }
      }

      // ── 2. Fuzzy match: name similarity + phone match ───────────────
      // Pull all contacts marked as subs (role sub / subcontractor / vendor)
      // and compute similarity. For larger contact lists, replace with a
      // proper search index (Algolia / Typesense) in Phase 2.
      const subContacts = await db.collection('contacts')
        .where('role', 'in', ['sub', 'subcontractor', 'vendor', 'supplier'])
        .get();

      const candidates: FuzzyCandidate[] = [];
      for (const c of subContacts.docs) {
        const d = c.data() as any;
        const cPhoneNorm = normalizePhone(d.phone);
        const reasons: string[] = [];
        let score = 0;

        if (phoneNorm && cPhoneNorm && phoneNorm === cPhoneNorm) {
          score += 0.7;
          reasons.push('phone match');
        }

        const nameScore = vendorName && d.name
          ? nameSimilarity(vendorName, String(d.name))
          : 0;
        if (nameScore > 0.3) {
          score += nameScore * 0.5;
          reasons.push(`name similarity ${nameScore.toFixed(2)}`);
        }

        const companyScore = company && d.company
          ? nameSimilarity(company, String(d.company))
          : 0;
        if (companyScore > 0.3) {
          score += companyScore * 0.3;
          reasons.push(`company similarity ${companyScore.toFixed(2)}`);
        }

        if (score >= FUZZY_THRESHOLD) {
          candidates.push({
            contactId: c.id,
            vendorName: d.name || '(no name)',
            email: d.email,
            phone: d.phone,
            company: d.company,
            matchScore: Math.min(1, score),
            matchReasons: reasons,
          });
        }
      }

      candidates.sort((a, b) => b.matchScore - a.matchScore);
      const top = candidates.slice(0, 5);

      // ── 3. Queue for staff review, or no-op ────────────────────────
      if (top.length === 0) {
        return res.json({ ok: true, outcome: 'no_match' });
      }

      const queueDoc = await db.collection('linkReviewQueue').add({
        userId: uid,
        userEmail: email || null,
        userVendorName: vendorName || null,
        userPhone: payload.phone || null,
        userCompany: company || null,
        candidates: top,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.json({
        ok: true,
        outcome: 'queued_for_review',
        linkReviewQueueId: queueDoc.id,
        candidateCount: top.length,
      });
    } catch (e: any) {
      console.error('post-signup-link error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
