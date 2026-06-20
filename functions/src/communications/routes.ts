// Communication Center AI routes (staff-only, manual trigger). Registered onto
// the shared `api` Express app — org IAM blocks new Cloud Run services, so these
// fold in like every other route. ANTHROPIC_API_KEY is already bound to `api`.
//
//   POST /api/communications/threads/:threadId/analyze    → extract suggestions
//   POST /api/communications/threads/:threadId/summarize  → summarize thread
//   POST /api/communications/summarize-project            → { projectId }
//
// Extraction writes suggestions into communications/{threadId}/extractions with
// status 'open' (the review queue). Nothing becomes a real action item/decision
// until a human confirms it in the UI — that's the Phase-3 gating decision.

import type { Express, Response } from 'express';
import type { firestore as adminFirestore } from 'firebase-admin';
import { staffOnly } from './staffAuth';
import { analyzeThread, summarizeThread, summarizeProject, BudgetExceededError } from './aiBrain';

export function registerCommunicationAiRoutes(app: Express, db: adminFirestore.Firestore): void {
  app.post('/api/communications/threads/:threadId/analyze', staffOnly, async (req: any, res: Response) => {
    try {
      const result = await analyzeThread(db, req.params.threadId, req.user.uid);
      return res.json({ ok: true, ...result });
    } catch (e: any) {
      if (e instanceof BudgetExceededError) {
        return res.status(429).json({ error: 'Daily AI budget reached', spendTodayUsd: e.spendTodayUsd, dailyBudgetUsd: e.dailyBudgetUsd });
      }
      console.error('[communications/analyze] failed:', e?.message);
      return res.status(500).json({ error: e?.message || 'analyze_failed' });
    }
  });

  app.post('/api/communications/threads/:threadId/summarize', staffOnly, async (req: any, res: Response) => {
    try {
      const summary = await summarizeThread(db, req.params.threadId);
      return res.json({ ok: true, summary });
    } catch (e: any) {
      if (e instanceof BudgetExceededError) {
        return res.status(429).json({ error: 'Daily AI budget reached', spendTodayUsd: e.spendTodayUsd, dailyBudgetUsd: e.dailyBudgetUsd });
      }
      console.error('[communications/summarize] failed:', e?.message);
      return res.status(500).json({ error: e?.message || 'summarize_failed' });
    }
  });

  app.post('/api/communications/summarize-project', staffOnly, async (req: any, res: Response) => {
    try {
      const projectId = String(req.body?.projectId || '');
      if (!projectId) return res.status(400).json({ error: 'projectId required' });
      const summary = await summarizeProject(db, projectId);
      return res.json({ ok: true, summary });
    } catch (e: any) {
      if (e instanceof BudgetExceededError) {
        return res.status(429).json({ error: 'Daily AI budget reached', spendTodayUsd: e.spendTodayUsd, dailyBudgetUsd: e.dailyBudgetUsd });
      }
      console.error('[communications/summarize-project] failed:', e?.message);
      return res.status(500).json({ error: e?.message || 'summarize_failed' });
    }
  });
}
