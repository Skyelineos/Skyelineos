// AI Inbox — n8n ingestion endpoint.
//
//   POST /api/ai-inbox/ingest
//
// This route is registered BEFORE the /api Firebase-auth gate, because n8n
// (or any external workflow) authenticates with a shared secret header, not a
// Firebase ID token — same pattern as the lead-intake and bid-token public
// routes. The secret lives in Secret Manager as N8N_INGEST_SECRET.
//
// n8n's job: trigger on new Gmail mail (invoices, receipts, bank alerts, sub /
// client email), parse it, and POST the fields here. We persist the raw item to
// `ai_inbox_items`, run the extraction brain inline, and store the structured
// result + project match + Gmail-label recommendation. Nothing is written to
// QuickBooks here — that only happens on human approval.
//
// Idempotent: the doc id is derived from the Gmail messageId, so n8n can retry
// safely without creating duplicates.

import type { Express, Request, Response } from 'express';
import type { firestore as adminFirestore } from 'firebase-admin';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { extractInboxItem, BudgetExceededError } from './extract';
import { resolveAiInboxLane } from './types';
import { processAttachments } from './attachments';

function itemsRef(db: adminFirestore.Firestore) {
  return db.collection('ai_inbox_items');
}

// Constant-time secret comparison so the endpoint doesn't leak via timing.
function secretMatches(provided: string | undefined): boolean {
  const expected = (process.env.N8N_INGEST_SECRET || '').trim();
  if (!expected) return false; // fail closed if the secret isn't configured
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function urlSafe(s: string): string {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
}

export function registerAiInboxIngest(app: Express, db: adminFirestore.Firestore): void {
  app.post('/api/ai-inbox/ingest', async (req: Request, res: Response) => {
    // Accept the secret from a header (preferred) or body field (n8n convenience).
    const provided =
      (req.headers['x-n8n-secret'] as string) ||
      (req.headers['x-ingest-secret'] as string) ||
      (req.body && req.body.secret);
    if (!secretMatches(provided)) {
      res.status(401).json({ error: 'Invalid or missing ingest secret' });
      return;
    }

    try {
      const b: any = req.body || {};
      const source = typeof b.source === 'string' ? b.source : 'gmail';
      const messageId = b.messageId || b.gmailMessageId || b.id;
      const from = b.from || {};
      const fromEmail = from.email || b.fromEmail || null;
      const fromName = from.name || b.fromName || null;
      const subject = b.subject || null;
      const content = b.text || b.body || b.snippet || b.html || '';
      const gmailLabels = Array.isArray(b.gmailLabels) ? b.gmailLabels : (Array.isArray(b.labels) ? b.labels : []);
      const rawAttachments = Array.isArray(b.attachments) ? b.attachments : [];
      // Which intake mailbox did this hit (e.g. accounting@…). n8n sends one
      // trigger per connected address and stamps `mailbox` so items are
      // filterable by inbox. Fall back to the To: address if provided.
      const mailbox = (b.mailbox || b.to || '').toString().toLowerCase().trim() || null;

      if (!content && !subject && rawAttachments.length === 0) {
        res.status(400).json({ error: 'Item has no subject, body, or attachment to process' });
        return;
      }

      // Deterministic id for idempotency. Fall back to a content hash when no
      // messageId is supplied (e.g. a manual repost).
      const idSeed = messageId
        ? `${source}__${urlSafe(String(messageId))}`
        : `${source}__${crypto.createHash('sha1').update(`${subject}|${content}`).digest('hex')}`;

      const docRef = itemsRef(db).doc(idSeed);

      // Idempotency: if it already exists, don't reprocess (avoids re-spending
      // on the brain and double-posting). Return the existing state.
      const existing = await docRef.get();
      if (existing.exists) {
        res.json({ ok: true, skipped: true, id: docRef.id, reason: 'already_ingested' });
        return;
      }

      // Decode + store attachments (PDF invoices, receipt images). The PDF/image
      // subset is handed to Claude; all are stored for viewing in the portal.
      const { claudeAttachments, stored } = await processAttachments(docRef.id, rawAttachments);

      const sourceMeta = {
        fromEmail,
        fromName,
        subject,
        gmailLabels,
        mailbox,
        attachments: stored.map((a) => ({ filename: a.filename, mime: a.mimeType, size: a.size })),
        threadId: b.threadId || null,
        date: b.receivedAt || b.date || null,
      };

      const baseDoc: any = {
        source,
        messageId: messageId ? String(messageId) : null,
        threadId: b.threadId || null,
        mailbox,
        from: { email: fromEmail, name: fromName },
        subject,
        bodyText: String(content).slice(0, 20000),
        gmailLabels,
        attachments: stored,
        receivedAt: b.receivedAt ? new Date(b.receivedAt) : null,
        ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
        ingestedVia: 'n8n',
        reviewStatus: 'pending',
        qboSyncStatus: 'not_synced',
      };

      // Run the brain inline. If the daily budget is exhausted, persist the raw
      // item as needs_processing so it can be picked up by /reprocess later —
      // we never drop an inbound item just because the AI budget is spent.
      try {
        const result = await extractInboxItem(
          db,
          { source, sourceMeta, content },
          { attachments: claudeAttachments },
        );
        const x = result.extraction;
        const lane = resolveAiInboxLane({
          category: x.category,
          confidence: x.confidence,
          needsClarification: x.needsClarification,
        });
        await docRef.set({
          ...baseDoc,
          status: 'processed',
          extraction: x,
          // Denormalized for cheap filtering/sorting in the UI.
          category: x.category,
          projectId: x.projectId,
          projectName: x.projectName,
          amountUsd: x.amountUsd,
          vendorName: x.vendorName,
          gmailLabelRecommendation: x.gmailLabelRecommendation,
          hasInvoiceLink: x.hasInvoiceLink,
          invoiceLinkUrl: x.invoiceLinkUrl,
          confidence: x.confidence,
          lane,
          modelUsed: result.modelUsed,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.json({
          ok: true,
          id: docRef.id,
          lane,
          category: x.category,
          projectId: x.projectId,
          gmailLabelRecommendation: x.gmailLabelRecommendation,
          attachmentsStored: stored.length,
          attachmentsRead: claudeAttachments.length,
        });
        return;
      } catch (e: any) {
        if (e instanceof BudgetExceededError) {
          await docRef.set({
            ...baseDoc,
            status: 'needs_processing',
            lane: 'needs_review',
            processingError: 'budget_exceeded',
          });
          res.json({ ok: true, id: docRef.id, status: 'needs_processing', reason: 'budget_exceeded' });
          return;
        }
        // Brain failed — keep the raw item, flag it, let /reprocess retry.
        console.error('[ai-inbox/ingest] extraction failed:', e?.message || e);
        await docRef.set({
          ...baseDoc,
          status: 'needs_processing',
          lane: 'needs_review',
          processingError: String(e?.message || 'extraction_failed').slice(0, 500),
        });
        res.json({ ok: true, id: docRef.id, status: 'needs_processing', reason: 'extraction_failed' });
        return;
      }
    } catch (e: any) {
      console.error('[ai-inbox/ingest] failed:', e);
      res.status(500).json({ error: e?.message || 'unknown' });
    }
  });
}
