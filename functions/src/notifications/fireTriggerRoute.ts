// HTTP entry point that lets the client fire any catalog trigger through the
// same `fireTrigger` pipeline that server-side fire sites use. Eliminates the
// 6+ direct `createNotification` call sites the CTO audit (Section 6.4) called
// out: those sites bypassed audience resolution, channel fan-out, and per-user
// preferences.
//
//   POST /api/notifications/fire
//   body: { kind, projectId?, payload, overrides?: { targetUserIds?, channels? } }
//
// Auth: gated by the global authMiddleware (Stream 1 — `app.use('/api', ...)`).
// Audience resolution runs SERVER-SIDE — the caller passes `kind` + `projectId`
// and the server expands to the list of recipients. The optional
// `overrides.targetUserIds` is honored only for single-uid kinds.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { fireTrigger, fireTriggerForMany } from './fireTrigger';
import { Audience, roleToAudience, getTrigger } from './triggerCatalog';
import { resolveAudience, AudienceKind } from './audienceResolvers';

// Mirrors shared/notifications-catalog.ts — keep in sync.
// Maps each trigger kind to its audience-resolver kind.
const KIND_AUDIENCE: Record<string, AudienceKind> = {
  // Phase 1
  lead_created:        'single_uid',
  bid_invitation:      'single_uid',
  bid_awarded:         'single_uid',
  project_commenced:   'single_uid',
  task_due:            'single_uid',
  task_assigned:       'single_uid',
  rfi_answered:        'single_uid',
  bid_received:        'single_uid',
  bid_reminder:        'single_uid',
  template_applied:    'single_uid',
  schedule_published:  'client_of_project',
  // Phase 2 — wave-2 from the CTO audit
  schedule_slip:           'staff_on_project',
  change_order_created:    'client_of_project',
  selection_due:           'client_of_project',
  draw_requested:          'client_of_project',
  invoice_received:        'staff_on_project',
  photo_uploaded:          'client_of_project',
  walkthrough_assigned:    'single_uid',
  estimate_sent:           'client_of_project',
  // Phase 2 — Stream-4 stubs
  compliance_doc_uploaded: 'staff_on_project',
  sub_invoice_submitted:   'staff_on_project',
};

// Map the audience-resolver kind to the engine's Audience bucket so the
// per-audience flow lookup picks the right template set.
function defaultEngineAudience(audKind: AudienceKind): Audience {
  switch (audKind) {
    case 'staff_on_project': return 'team';
    case 'client_of_project': return 'client';
    case 'sub_on_project': return 'sub';
    default: return 'team';
  }
}

export function registerFireTriggerRoute(app: Express, db: admin.firestore.Firestore) {
  app.post('/api/notifications/fire', async (req: any, res: any) => {
    // authMiddleware (in index.ts) already populated req.user.
    const caller: string | undefined = req.user?.uid;
    if (!caller) return res.status(401).json({ error: 'Sign in required' });

    const body = req.body || {};
    const kind = String(body.kind || '').trim();
    const projectId = body.projectId ? String(body.projectId) : undefined;
    const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};
    const overrides = (body.overrides && typeof body.overrides === 'object') ? body.overrides : {};

    if (!kind) return res.status(400).json({ error: 'kind is required' });

    // Validate the kind. New wave-2 kinds aren't in the v1 TRIGGER_CATALOG so we
    // also accept anything we have an audience for.
    const triggerDef = getTrigger(kind);
    const audKind = KIND_AUDIENCE[kind];
    if (!triggerDef && !audKind) {
      return res.status(400).json({ error: `Unknown trigger kind: ${kind}` });
    }

    // Resolve recipients server-side.
    let recipients: string[] = [];
    const singleUidOverride: string | undefined = Array.isArray(overrides.targetUserIds) && overrides.targetUserIds.length === 1
      ? String(overrides.targetUserIds[0])
      : undefined;

    if (audKind === 'single_uid') {
      // Single-uid kinds need the caller to specify the recipient explicitly
      // via overrides.targetUserIds (e.g. walkthrough's assignee).
      if (!Array.isArray(overrides.targetUserIds) || overrides.targetUserIds.length === 0) {
        return res.status(400).json({ error: `Kind ${kind} requires overrides.targetUserIds` });
      }
      recipients = overrides.targetUserIds.map(String);
    } else if (audKind) {
      recipients = await resolveAudience(db, audKind, { projectId, singleUid: singleUidOverride });
    } else {
      // Phase 1 kinds without an entry — fall back to caller as recipient.
      recipients = [caller];
    }

    if (recipients.length === 0) {
      // No audience to notify — not an error; the caller doesn't need to know
      // the project's roster. Log and return ok.
      console.warn('[fireTriggerRoute] empty audience for', kind, 'projectId=', projectId);
      return res.json({ ok: true, recipientsCount: 0 });
    }

    const audience = audKind ? defaultEngineAudience(audKind) : 'team';
    const fromUserName = (req.userProfile?.displayName as string | undefined)
                     || (req.user?.name as string | undefined)
                     || (req.user?.email as string | undefined)
                     || 'Skyeline OS';

    try {
      await fireTriggerForMany(
        {
          db,
          triggerKey: kind,
          // Force the audience so the configured per-audience flow is picked.
          audience: audKind === 'single_uid' ? undefined : audience,
          variables: payload,
          projectId,
          fromUserName,
        },
        recipients,
      );
      return res.json({ ok: true, recipientsCount: recipients.length });
    } catch (e: any) {
      console.error('[fireTriggerRoute] fire failed', e);
      return res.status(500).json({ error: e?.message || 'Fire failed' });
    }
  });
}

// Silence ts unused (roleToAudience + fireTrigger may be referenced indirectly)
void roleToAudience;
void fireTrigger;
