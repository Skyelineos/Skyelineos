// reconcileRoute.ts — QBO ↔ Skyeline reconciliation + sync status endpoints.
//
// Routes mounted on the main /api Express app:
//
//   POST /api/qbo/reconcile    (admin / GC / projectManager only)
//     Body: { sinceDays?: number }   // default 60
//     Walks recent QBO Purchase records and matches each one to the closest
//     Skyeline expense by (amount ±$1, vendor fuzzy match, date ±3 days).
//     For each match, sets the expense to status:'reconciled' with
//     qboTransactionId + qboMatchedAt. Returns counts and the matched docs.
//
//   GET  /api/qbo/sync-status
//     Lightweight read of qboConnections/global — connection state, env,
//     token validity, last sync timestamp.
//
// NOTE: GET /api/qbo/status is already registered by qbo/paymentLink.ts and
// is used by the client portal. We keep it untouched and expose a separate
// /sync-status here so this admin reconciliation UI has its own surface.
//
// Auth: routes mount AFTER `app.use('/api', authMiddleware)` in index.ts, so
// req.user is always a verified Firebase ID token. We additionally enforce
// staff-only access for the reconcile route.

import type { Express, Request, Response } from 'express';
import type { firestore as adminFirestore } from 'firebase-admin';
import * as admin from 'firebase-admin';
import { qboRequest, getQboConnection } from './qboClient';

// ── Helpers ─────────────────────────────────────────────────────────────────

const STAFF_ROLES = new Set([
  'admin',
  'gc',
  'projectmanager',
  'pm',
  'owner',
  'superadmin',
]);

async function callerIsStaff(
  db: adminFirestore.Firestore,
  uid: string,
): Promise<boolean> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const data = (snap.data() as any) || {};
    const role = String(data.role || '')
      .toLowerCase()
      .replace(/_/g, '');
    return STAFF_ROLES.has(role);
  } catch {
    return false;
  }
}

/**
 * Normalize a vendor / company name for fuzzy comparison:
 *   - lowercase, strip non-alphanumeric
 *   - drop common suffixes (inc, llc, co, corp, ltd)
 */
function normalizeVendor(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(inc|llc|co|corp|corporation|ltd|company)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple bigram-based Dice-Sørensen similarity in [0,1].
 * Robust to typos / suffixes once `normalizeVendor` runs.
 */
function vendorSimilarity(a: string, b: string): number {
  const na = normalizeVendor(a);
  const nb = normalizeVendor(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // Short strings: substring containment counts as a strong match.
  if (na.length <= 4 || nb.length <= 4) {
    return na.includes(nb) || nb.includes(na) ? 0.9 : 0;
  }
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      out.set(bg, (out.get(bg) || 0) + 1);
    }
    return out;
  };
  const A = bigrams(na);
  const B = bigrams(nb);
  let inter = 0;
  for (const [k, v] of A) {
    const w = B.get(k);
    if (w) inter += Math.min(v, w);
  }
  let totA = 0;
  for (const v of A.values()) totA += v;
  let totB = 0;
  for (const v of B.values()) totB += v;
  if (totA + totB === 0) return 0;
  return (2 * inter) / (totA + totB);
}

function ymdToDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '').trim());
  if (!m) return null;
  const d = new Date(
    Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)),
  );
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function dateMinusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerQboSyncRoutes(
  app: Express,
  db: adminFirestore.Firestore,
): void {
  // GET /api/qbo/sync-status — connection + token + last-sync snapshot.
  app.get('/api/qbo/sync-status', async (_req: Request, res: Response) => {
    try {
      const conn = await getQboConnection(db);
      if (!conn) {
        res.json({
          connected: false,
          env: process.env.QBO_ENV || 'sandbox',
          accessTokenValid: false,
          refreshTokenValid: false,
          lastSyncAt: null,
          lastReconcileAt: null,
        });
        return;
      }
      const now = Date.now();
      const accessTokenValid = (conn.accessTokenExpiresAt || 0) > now;
      const refreshTokenValid = (conn.refreshTokenExpiresAt || 0) > now;

      // Find the most recent QBO sync activity across all expense + draw docs.
      let lastSyncAt: number | null = null;
      try {
        const recent = await db
          .collectionGroup('expenses')
          .where('qboSynced', '==', true)
          .orderBy('qboSyncedAt', 'desc')
          .limit(1)
          .get();
        if (!recent.empty) {
          const ts = (recent.docs[0].data() as any).qboSyncedAt;
          if (ts?.toMillis) lastSyncAt = ts.toMillis();
        }
      } catch {
        // Missing composite index is fine — leave lastSyncAt null. The UI
        // shows "never" and the admin can run /reconcile to populate.
      }

      let lastReconcileAt: number | null = null;
      try {
        const reconciled = await db
          .collectionGroup('expenses')
          .where('status', '==', 'reconciled')
          .orderBy('qboMatchedAt', 'desc')
          .limit(1)
          .get();
        if (!reconciled.empty) {
          const ts = (reconciled.docs[0].data() as any).qboMatchedAt;
          if (ts?.toMillis) lastReconcileAt = ts.toMillis();
        }
      } catch {
        // ditto — missing index is non-fatal.
      }

      res.json({
        connected: refreshTokenValid,
        env: conn.env,
        realmId: conn.realmId,
        accessTokenValid,
        refreshTokenValid,
        accessTokenExpiresAt: conn.accessTokenExpiresAt,
        refreshTokenExpiresAt: conn.refreshTokenExpiresAt,
        lastSyncAt,
        lastReconcileAt,
      });
    } catch (err: any) {
      console.error('[qbo/sync-status] error:', err);
      res.status(500).json({ error: err?.message || 'Failed' });
    }
  });

  // POST /api/qbo/reconcile — match recent QBO Purchases to Skyeline expenses.
  app.post('/api/qbo/reconcile', async (req: any, res: Response) => {
    try {
      const uid: string = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: 'No uid' });
        return;
      }
      if (!(await callerIsStaff(db, uid))) {
        res.status(403).json({ error: 'Staff role required' });
        return;
      }

      const sinceDays = Math.max(
        1,
        Math.min(365, Number(req.body?.sinceDays) || 60),
      );
      const sinceDate = dateMinusDays(sinceDays);

      // 1. Pull recent QBO Purchases. QBO query is SQL-ish with single-quoted
      //    literals; the date filter is on TxnDate. Cap maxresults at 1000.
      const queryStr =
        `select Id, TxnDate, TotalAmt, PrivateNote, EntityRef ` +
        `from Purchase where TxnDate >= '${sinceDate}' ` +
        `orderby TxnDate desc maxresults 1000`;
      let qboPurchases: any[] = [];
      try {
        const resp = await qboRequest(
          db,
          'GET',
          `query?query=${encodeURIComponent(queryStr)}`,
        );
        qboPurchases = Array.isArray(resp?.QueryResponse?.Purchase)
          ? resp.QueryResponse.Purchase
          : [];
      } catch (err: any) {
        const code = err?.code;
        if (code === 'not_connected') {
          res
            .status(409)
            .json({ error: err.message, code: 'not_connected' });
          return;
        }
        throw err;
      }

      // 2. Pull all Skyeline expenses from the same window (collectionGroup).
      const sinceTimestamp = ymdToDate(sinceDate);
      const candidates: Array<{
        ref: adminFirestore.DocumentReference;
        data: any;
      }> = [];
      try {
        const snap = await db
          .collectionGroup('expenses')
          .where('date', '>=', sinceDate)
          .get();
        for (const d of snap.docs) {
          const ex = d.data() as any;
          // Only consider expenses that aren't already reconciled.
          if (ex.status === 'reconciled' || ex.status === 'void') continue;
          candidates.push({ ref: d.ref, data: ex });
        }
      } catch (err: any) {
        // The date-range collectionGroup query needs a single-field index on
        // `date`. Fall back to a full scan + in-memory filter so reconcile
        // still works pre-index. Log so the operator can add the index.
        console.warn(
          '[qbo/reconcile] collectionGroup date query failed, falling back to full scan:',
          err?.message || err,
        );
        const snap = await db.collectionGroup('expenses').get();
        for (const d of snap.docs) {
          const ex = d.data() as any;
          if (ex.status === 'reconciled' || ex.status === 'void') continue;
          const dt = ymdToDate(ex.date);
          if (sinceTimestamp && dt && dt < sinceTimestamp) continue;
          candidates.push({ ref: d.ref, data: ex });
        }
      }

      // 3. For each QBO purchase, find the best Skyeline match.
      const matched: any[] = [];
      const unmatched: any[] = [];
      const usedExpenseIds = new Set<string>();
      const AMOUNT_TOLERANCE = 1.0;       // $
      const DATE_TOLERANCE_DAYS = 3;
      const VENDOR_SIM_THRESHOLD = 0.6;

      for (const p of qboPurchases) {
        const pAmount = Number(p.TotalAmt) || 0;
        const pDate = ymdToDate(p.TxnDate);
        const pVendor = String(p?.EntityRef?.name || '').trim();

        let best: {
          ref: adminFirestore.DocumentReference;
          data: any;
          score: number;
          sim: number;
          daysDiff: number;
          amountDiff: number;
        } | null = null;

        for (const c of candidates) {
          if (usedExpenseIds.has(c.ref.path)) continue;
          const cAmount = Number(c.data.amount) || 0;
          if (Math.abs(cAmount - pAmount) > AMOUNT_TOLERANCE) continue;

          const cDate = ymdToDate(c.data.date);
          if (!pDate || !cDate) continue;
          const dd = daysBetween(pDate, cDate);
          if (dd > DATE_TOLERANCE_DAYS) continue;

          const sim = vendorSimilarity(pVendor, String(c.data.vendor || ''));
          if (sim < VENDOR_SIM_THRESHOLD) continue;

          // Composite score: prefer high vendor sim, tight date, tight amount.
          const score =
            sim * 3 +
            (1 - dd / (DATE_TOLERANCE_DAYS + 1)) +
            (1 - Math.abs(cAmount - pAmount) / (AMOUNT_TOLERANCE + 0.01));
          if (!best || score > best.score) {
            best = {
              ref: c.ref,
              data: c.data,
              score,
              sim,
              daysDiff: dd,
              amountDiff: Math.abs(cAmount - pAmount),
            };
          }
        }

        if (best) {
          usedExpenseIds.add(best.ref.path);
          try {
            await best.ref.update({
              status: 'reconciled',
              qboTransactionId: String(p.Id),
              qboMatchedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedBy: 'qbo-reconcile',
            });
          } catch (err: any) {
            console.error(
              '[qbo/reconcile] failed to write reconciliation for',
              best.ref.path,
              err?.message || err,
            );
          }
          matched.push({
            qboPurchaseId: String(p.Id),
            qboVendor: pVendor,
            qboAmount: pAmount,
            qboDate: p.TxnDate,
            expensePath: best.ref.path,
            expenseId: best.ref.id,
            expenseVendor: best.data.vendor,
            expenseAmount: Number(best.data.amount) || 0,
            expenseDate: best.data.date,
            vendorSimilarity: Number(best.sim.toFixed(2)),
            daysDiff: best.daysDiff,
            amountDiff: Number(best.amountDiff.toFixed(2)),
          });
        } else {
          unmatched.push({
            qboPurchaseId: String(p.Id),
            qboVendor: pVendor,
            qboAmount: pAmount,
            qboDate: p.TxnDate,
          });
        }
      }

      res.json({
        sinceDays,
        sinceDate,
        scanned: {
          qboPurchases: qboPurchases.length,
          skyelineCandidates: candidates.length,
        },
        matched: matched.length,
        unmatched: unmatched.length,
        expenses: matched,
        unmatchedPurchases: unmatched,
      });
    } catch (err: any) {
      console.error('[qbo/reconcile] error:', err);
      res
        .status(500)
        .json({ error: err?.message || 'Reconciliation failed' });
    }
  });
}
