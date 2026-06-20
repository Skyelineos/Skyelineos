// AI Inbox — admin review/approval routes (Firebase ID token, admin role).
//
//   GET  /api/ai-inbox/status                 → { qboConnected, env, ... }
//   POST /api/ai-inbox/:id/approve            → apply correction, sync to QBO
//   POST /api/ai-inbox/:id/reject             → mark rejected (no QBO write)
//   POST /api/ai-inbox/:id/reprocess          → re-run the brain (optional hint)
//
// Approval is the ONLY path that writes to QuickBooks, satisfying the
// "no auto-sync without human approval" requirement. The QBO write happens
// server-side here (never from the browser) and is idempotent on the cached
// qboEntityId.

import type { Express, Request, Response } from 'express';
import type { firestore as adminFirestore } from 'firebase-admin';
import * as admin from 'firebase-admin';
import { adminOnly } from '../ingestionLab/adminAuth';
import { extractInboxItem } from './extract';
import { resolveAiInboxLane, AiInboxExtraction } from './types';
import { syncApprovedItemToQbo } from './qboSync';
import { qboConnectionStatus } from '../qbo/client';

function itemsRef(db: adminFirestore.Firestore) {
  return db.collection('ai_inbox_items');
}

// Fields a human may override on approve. We merge these over the brain's
// extraction so the QBO write reflects the corrected values.
const CORRECTABLE_KEYS: (keyof AiInboxExtraction)[] = [
  'category',
  'vendorName',
  'amountUsd',
  'documentDate',
  'dueDate',
  'invoiceNumber',
  'qboAccountSuggestion',
  'gmailLabelRecommendation',
  'projectId',
  'projectName',
  'summary',
];

function applyCorrection(base: AiInboxExtraction, correction: any): AiInboxExtraction {
  const merged: any = { ...base };
  if (correction && typeof correction === 'object') {
    for (const k of CORRECTABLE_KEYS) {
      if (k in correction) merged[k] = correction[k];
    }
  }
  return merged as AiInboxExtraction;
}

export function registerAiInboxReviewRoutes(app: Express, db: adminFirestore.Firestore): void {
  // Connection/status probe so the UI can show whether QBO is linked.
  app.get('/api/ai-inbox/status', adminOnly, async (_req: Request, res: Response) => {
    const qbo = await qboConnectionStatus(db);
    res.json({ qboConnected: qbo.connected, qboEnv: qbo.env });
  });

  // Approve → (optional correction) → QBO sync.
  app.post('/api/ai-inbox/:id/approve', adminOnly, async (req: any, res: Response) => {
    try {
      const ref = itemsRef(db).doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Item not found' });
      const item: any = snap.data();

      const baseExtraction: AiInboxExtraction = item.extraction || {};
      const correction = req.body?.correction;
      const finalExtraction = applyCorrection(baseExtraction, correction);
      const wasCorrected = !!correction && Object.keys(correction).length > 0;

      // Idempotency: if we already synced this item, don't post again.
      if (item.qboSyncStatus === 'synced' && item.qboEntityId) {
        await ref.set({
          reviewStatus: wasCorrected ? 'corrected' : 'approved',
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          reviewedByUid: req.user.uid,
          ...(wasCorrected ? { correction, extraction: finalExtraction } : {}),
        }, { merge: true });
        return res.json({ ok: true, alreadySynced: true, qboEntityId: item.qboEntityId });
      }

      let syncStatus = 'not_synced';
      let syncResult: any = null;
      let syncError: string | null = null;
      try {
        const result = await syncApprovedItemToQbo(db, finalExtraction);
        if (result.skipped) {
          syncStatus = 'skipped';
        } else {
          syncStatus = 'synced';
        }
        syncResult = result;
      } catch (e: any) {
        syncStatus = 'error';
        syncError = String(e?.message || 'qbo_sync_failed').slice(0, 1000);
        console.error('[ai-inbox/approve] QBO sync failed:', e?.message, e?.body || '');
      }

      await ref.set({
        reviewStatus: wasCorrected ? 'corrected' : 'approved',
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedByUid: req.user.uid,
        ...(wasCorrected ? { correction, extraction: finalExtraction, category: finalExtraction.category, projectId: finalExtraction.projectId, amountUsd: finalExtraction.amountUsd } : {}),
        qboSyncStatus: syncStatus,
        ...(syncResult?.entityType ? { qboEntityType: syncResult.entityType } : {}),
        ...(syncResult?.entityId ? { qboEntityId: syncResult.entityId } : {}),
        ...(syncStatus === 'synced' ? { qboSyncedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
        ...(syncError ? { qboSyncError: syncError } : { qboSyncError: admin.firestore.FieldValue.delete() }),
      }, { merge: true });

      if (syncStatus === 'error') {
        return res.status(502).json({ ok: false, error: syncError, qboSyncStatus: syncStatus });
      }
      return res.json({
        ok: true,
        qboSyncStatus: syncStatus,
        qboEntityType: syncResult?.entityType,
        qboEntityId: syncResult?.entityId,
        skippedReason: syncResult?.reason,
      });
    } catch (e: any) {
      console.error('[ai-inbox/approve] failed:', e);
      return res.status(500).json({ error: e?.message || 'unknown' });
    }
  });

  // Reject — no QBO write.
  app.post('/api/ai-inbox/:id/reject', adminOnly, async (req: any, res: Response) => {
    try {
      const ref = itemsRef(db).doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Item not found' });
      await ref.set({
        reviewStatus: 'rejected',
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedByUid: req.user.uid,
        ...(req.body?.reason ? { rejectReason: String(req.body.reason).slice(0, 500) } : {}),
      }, { merge: true });
      return res.json({ ok: true });
    } catch (e: any) {
      console.error('[ai-inbox/reject] failed:', e);
      return res.status(500).json({ error: e?.message || 'unknown' });
    }
  });

  // Reprocess — re-run the brain, optionally with a human clarification hint.
  app.post('/api/ai-inbox/:id/reprocess', adminOnly, async (req: any, res: Response) => {
    try {
      const ref = itemsRef(db).doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Item not found' });
      const item: any = snap.data();
      if (item.qboSyncStatus === 'synced') {
        return res.status(409).json({ error: 'Already synced to QuickBooks — cannot reprocess.' });
      }

      const sourceMeta = {
        fromEmail: item.from?.email || null,
        fromName: item.from?.name || null,
        subject: item.subject || null,
        gmailLabels: item.gmailLabels || [],
        attachments: item.attachments || [],
        threadId: item.threadId || null,
      };
      const result = await extractInboxItem(
        db,
        { source: item.source, sourceMeta, content: item.bodyText || '' },
        { extraHint: req.body?.clarificationAnswer || undefined },
      );
      const x = result.extraction;
      const lane = resolveAiInboxLane({
        category: x.category,
        confidence: x.confidence,
        needsClarification: x.needsClarification,
      });
      await ref.set({
        status: 'processed',
        extraction: x,
        category: x.category,
        projectId: x.projectId,
        projectName: x.projectName,
        amountUsd: x.amountUsd,
        vendorName: x.vendorName,
        gmailLabelRecommendation: x.gmailLabelRecommendation,
        confidence: x.confidence,
        lane,
        reviewStatus: 'pending',
        modelUsed: result.modelUsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processingError: admin.firestore.FieldValue.delete(),
        ...(req.body?.clarificationAnswer ? { clarificationAnswer: String(req.body.clarificationAnswer).slice(0, 1000) } : {}),
      }, { merge: true });
      return res.json({ ok: true, lane, category: x.category, projectId: x.projectId });
    } catch (e: any) {
      console.error('[ai-inbox/reprocess] failed:', e);
      return res.status(500).json({ error: e?.message || 'unknown' });
    }
  });
}
