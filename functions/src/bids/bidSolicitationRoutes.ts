// bidSolicitationRoutes.ts
// -----------------------------------------------------------------------------
// Express routes for the Automated Bid Solicitation System. Wires the engine
// in bidSolicitation.ts to /api/bids/... endpoints. All routes sit behind the
// /api auth gate registered in index.ts (Firebase ID token required).
//
// Endpoints:
//   POST   /api/bids/solicit                    Queue solicitations for a project
//   GET    /api/bids/solicitations/:projectId   List solicitations for a project
//   POST   /api/bids/solicitations/:id/send     Send/resend one email
//   POST   /api/bids/solicitations/:id/remind   Send a reminder
//   DELETE /api/bids/solicitations/:id          Remove from the queue
//   POST   /api/bids/solicit/gardanier          Preload Gardanier project (utility)
//   GET    /api/bids/trades                     Canonical trade list (for UI)

import type { Express, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import {
  queueSolicitationsForProject,
  listSolicitationsForProject,
  sendSolicitationEmail,
  sendAllQueuedForProject,
  deleteSolicitation,
  preloadGardanierSolicitations,
  TRADES,
  type SolicitationSeed,
} from './bidSolicitation';

function bearerUid(req: Request): string | undefined {
  // The /api auth middleware in index.ts populates req.user.uid. Fall back to
  // undefined if we're behind a test harness that skipped the gate.
  return (req as any)?.user?.uid;
}

export function registerBidSolicitationRoutes(
  app: Express,
  db: admin.firestore.Firestore,
) {
  // ── Kick off a solicitation batch for a project ────────────────────────────
  //
  // Body:
  //   {
  //     projectId: string,
  //     trades: string[],                                // trade slugs
  //     contractorsByTrade?: Record<slug, Seed[]>,       // optional overrides
  //     sendImmediately?: boolean                        // fire the queued emails right away
  //   }
  app.post('/api/bids/solicit', async (req: Request, res: Response) => {
    try {
      const {
        projectId,
        trades,
        contractorsByTrade,
        sendImmediately,
      }: {
        projectId?: string;
        trades?: string[];
        contractorsByTrade?: Record<string, SolicitationSeed[]>;
        sendImmediately?: boolean;
      } = req.body || {};

      if (!projectId || typeof projectId !== 'string') {
        return res.status(400).json({ error: 'projectId (string) is required' });
      }
      if (!Array.isArray(trades) || trades.length === 0) {
        return res.status(400).json({ error: 'trades (non-empty string[]) is required' });
      }

      const queued = await queueSolicitationsForProject(db, {
        projectId,
        trades,
        contractorsByTrade,
        createdBy: bearerUid(req),
      });

      let sendResults: any[] | undefined;
      if (sendImmediately) {
        sendResults = await sendAllQueuedForProject(db, projectId);
      }

      return res.json({
        ok: true,
        projectId,
        created: queued.created.length,
        skippedDuplicates: queued.skippedDuplicates,
        tradesProcessed: queued.tradesProcessed,
        solicitations: queued.created,
        sendResults,
      });
    } catch (err: any) {
      console.error('[bidSolicitation] POST /api/bids/solicit error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to queue solicitations' });
    }
  });

  // Convenience: send every queued row for a project in one call.
  app.post('/api/bids/solicit/:projectId/send-all', async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      if (!projectId) return res.status(400).json({ error: 'projectId required' });
      const results = await sendAllQueuedForProject(db, projectId);
      return res.json({ ok: true, projectId, results });
    } catch (err: any) {
      console.error('[bidSolicitation] send-all error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to send queued solicitations' });
    }
  });

  // Preload the Gardanier project (703 W 930 N, American Fork, UT 84003).
  // Handy for demos / initial seeding — walks every canonical trade.
  app.post('/api/bids/solicit/gardanier', async (_req: Request, res: Response) => {
    try {
      const result = await preloadGardanierSolicitations(db);
      return res.json({ ok: true, ...result, created: result.created.length });
    } catch (err: any) {
      console.error('[bidSolicitation] preload gardanier error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to preload Gardanier solicitations' });
    }
  });

  // ── List solicitations for a project ───────────────────────────────────────
  app.get('/api/bids/solicitations/:projectId', async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      if (!projectId) return res.status(400).json({ error: 'projectId required' });
      const rows = await listSolicitationsForProject(db, projectId);
      return res.json({ ok: true, projectId, count: rows.length, solicitations: rows });
    } catch (err: any) {
      console.error('[bidSolicitation] list error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to list solicitations' });
    }
  });

  // ── Send or resend a single email ──────────────────────────────────────────
  app.post('/api/bids/solicitations/:id/send', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { customIntro } = (req.body || {}) as { customIntro?: string };
      const result = await sendSolicitationEmail(db, id, { customIntro });
      const status = result.sent ? 200 : 500;
      return res.status(status).json({ ok: result.sent, ...result });
    } catch (err: any) {
      console.error('[bidSolicitation] send one error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to send solicitation' });
    }
  });

  // ── Send a reminder ────────────────────────────────────────────────────────
  app.post('/api/bids/solicitations/:id/remind', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { customIntro } = (req.body || {}) as { customIntro?: string };
      const result = await sendSolicitationEmail(db, id, { isReminder: true, customIntro });
      const status = result.sent ? 200 : 500;
      return res.status(status).json({ ok: result.sent, ...result });
    } catch (err: any) {
      console.error('[bidSolicitation] remind error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to send reminder' });
    }
  });

  // ── Delete a solicitation ──────────────────────────────────────────────────
  app.delete('/api/bids/solicitations/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await deleteSolicitation(db, id);
      if (!result.deleted) return res.status(404).json({ error: 'Solicitation not found' });
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error('[bidSolicitation] delete error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to delete solicitation' });
    }
  });

  // ── Canonical trade catalog (for the UI checklist) ─────────────────────────
  app.get('/api/bids/trades', (_req: Request, res: Response) => {
    return res.json({ ok: true, trades: TRADES });
  });
}
