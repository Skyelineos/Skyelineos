// QA harness backend — Phase 1 backbone.
//
// Flow: admin clicks "Test app" on the dashboard → POST /api/qa/trigger →
// we set a deploy lock, create a qa_runs/{runId} doc, and dispatch the
// `qa-suite.yml` GitHub Actions workflow (which runs the Playwright sweep
// against live). The workflow streams progress back via POST /api/qa/report
// (shared-secret auth) and clears the lock when it finishes.
//
// The deploy lock (system/deployLock) is read by deploy-on-push.yml, which
// aborts any deploy while a QA run is in flight so nothing ships mid-test.
//
// Secrets (Secret Manager, bound to the `api` function):
//   GH_DISPATCH_TOKEN  — fine-scoped GitHub PAT with actions:write on the repo
//   QA_REPORT_TOKEN    — shared bearer the workflow uses to post results back

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { adminOnly } from '../ingestionLab/adminAuth';

const REPO = 'Skyelineos/Skyelineos';
const WORKFLOW_FILE = 'qa-suite.yml';

const LOCK_DOC = ['system', 'deployLock'] as const;

export function registerQaRoutes(app: Express, db: admin.firestore.Firestore): void {
  // ── Trigger a run (admin only) ────────────────────────────────────────────
  app.post('/api/qa/trigger', adminOnly, async (req: any, res: any) => {
    try {
      const token = process.env.GH_DISPATCH_TOKEN;
      if (!token) {
        res.status(503).json({ error: 'GH_DISPATCH_TOKEN not configured — add it to Secret Manager.' });
        return;
      }
      const runId = `qa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const by = req.user?.email || req.user?.uid || 'admin';

      // Set the deploy lock so deploy-on-push aborts while we test.
      await db.doc(LOCK_DOC.join('/')).set({
        locked: true,
        reason: 'QA run in progress',
        qaRunId: runId,
        source: 'qa',
        lockedBy: by,
        lockedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection('qa_runs').doc(runId).set({
        runId,
        status: 'queued',
        triggeredBy: by,
        triggeredAt: admin.firestore.FieldValue.serverTimestamp(),
        summary: { total: 0, passed: 0, failed: 0, errored: 0 },
        checks: [],
      });

      // Dispatch the workflow. inputs.run_id ties the run back to this doc.
      const resp = await fetch(
        `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: 'main', inputs: { run_id: runId } }),
        },
      );

      if (!resp.ok) {
        const detail = await resp.text();
        // Roll back the lock + run doc so a failed dispatch doesn't wedge deploys.
        await clearLock(db, runId);
        await db.collection('qa_runs').doc(runId).set(
          { status: 'error', error: `Dispatch failed (${resp.status}): ${detail.slice(0, 300)}` },
          { merge: true },
        );
        res.status(502).json({ error: `GitHub dispatch failed: ${resp.status}`, detail: detail.slice(0, 300) });
        return;
      }

      res.json({ ok: true, runId });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'trigger failed' });
    }
  });

  // ── Receive progress / final results from the workflow ────────────────────
  app.post('/api/qa/report', async (req: any, res: any) => {
    const auth = String(req.headers.authorization || '');
    const expected = process.env.QA_REPORT_TOKEN;
    if (!expected || auth !== `Bearer ${expected}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const { runId, phase, patch, releaseLock } = req.body || {};
      if (!runId) { res.status(400).json({ error: 'runId required' }); return; }

      const update: Record<string, any> = { ...(patch || {}) };
      if (phase === 'running' && !update.status) update.status = 'running';
      if (phase === 'running' && !update.startedAt) update.startedAt = admin.firestore.FieldValue.serverTimestamp();
      if (phase === 'final') update.finishedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection('qa_runs').doc(runId).set(update, { merge: true });

      // Final report (or explicit release) clears the deploy lock.
      if (phase === 'final' || releaseLock) await clearLock(db, runId);

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'report failed' });
    }
  });

  // ── Manual deploy-lock toggle (admin only) ────────────────────────────────
  app.post('/api/qa/lock', adminOnly, async (req: any, res: any) => {
    try {
      const { locked, reason } = req.body || {};
      const by = req.user?.email || req.user?.uid || 'admin';
      if (locked) {
        await db.doc(LOCK_DOC.join('/')).set({
          locked: true,
          reason: reason || 'Manual lock',
          qaRunId: null,
          source: 'manual',
          lockedBy: by,
          lockedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await db.doc(LOCK_DOC.join('/')).set({
          locked: false,
          unlockedBy: by,
          unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      res.json({ ok: true, locked: !!locked });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'lock toggle failed' });
    }
  });
}

async function clearLock(db: admin.firestore.Firestore, runId: string): Promise<void> {
  // Only clear if this run owns the lock (don't stomp a manual lock).
  const ref = db.doc(LOCK_DOC.join('/'));
  const snap = await ref.get();
  const data = snap.exists ? snap.data() || {} : {};
  if (data.source === 'manual' && data.locked) return; // leave manual locks alone
  if (data.qaRunId && data.qaRunId !== runId) return;   // a newer run owns it
  await ref.set({
    locked: false,
    qaRunId: null,
    unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}
