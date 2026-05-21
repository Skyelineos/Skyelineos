// Brain pass — picks up unprocessed raw_items, extracts structured data via
// Claude, applies the lane resolver, and writes processed_items. Daily
// spend cap enforced via ingestion_lab/config.{dailyBudgetUsd, spendDate,
// spendTodayUsd}. One brain_runs audit doc written per invocation.
//
// POST /api/ingestionLab/brain/process — admin-only. Processes up to 50
// raw items per invocation.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { adminOnly } from './adminAuth';
import { resolveLane, Lane } from './laneResolver';
import {
  SYSTEM_PROMPT,
  EXTRACTION_TOOL,
  buildMessages,
  renderKnownProjects,
} from './prompts/extractionPrompt';

const MAX_PER_INVOCATION = 50;
const MODEL = 'claude-sonnet-4-6';

// Approximate Sonnet 4.6 list pricing — $3/1M input, $15/1M output.
// Used ONLY to drive the daily-budget guardrail; real billing comes from
// Anthropic. Drift in published pricing → the guard trips earlier/later
// than intended, but the spike is still bounded.
const INPUT_USD_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 15 / 1_000_000;

function rawItemsRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('data').collection('raw_items');
}
function processedItemsRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('data').collection('processed_items');
}
function contactsCacheRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('data').collection('contacts_cache');
}
function brainRunsRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('data').collection('brain_runs');
}
function configRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('config');
}

export function registerBrainPass(app: Express, db: FirebaseFirestore.Firestore): void {
  app.post('/api/ingestionLab/brain/process', adminOnly, async (req: any, res: any) => {
    const triggeredAt = Date.now();
    const triggeredByUid = req.user.uid;

    try {
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!apiKey) {
        res.status(500).json({ error: 'ANTHROPIC_API_KEY not bound to this function.' });
        return;
      }

      // Budget guardrail — roll the rolling window if the date changed.
      const today = new Date().toISOString().slice(0, 10);
      const cfgSnap = await configRef(db).get();
      const cfg: any = cfgSnap.data() || {};
      const dailyBudgetUsd = typeof cfg.dailyBudgetUsd === 'number' ? cfg.dailyBudgetUsd : 5;
      const sameDay = cfg.spendDate === today;
      let spendStart = sameDay ? Number(cfg.spendTodayUsd || 0) : 0;
      if (!sameDay) {
        await configRef(db).set({ spendDate: today, spendTodayUsd: 0 }, { merge: true });
      }
      if (spendStart >= dailyBudgetUsd) {
        await writeBrainRun(db, {
          triggeredAt,
          triggeredByUid,
          itemsProcessed: 0,
          itemsSucceeded: 0,
          itemsFailed: 0,
          costUsd: 0,
          durationMs: Date.now() - triggeredAt,
          error: `budget_exceeded_at_start: $${spendStart.toFixed(4)} of $${dailyBudgetUsd}`,
        });
        res.status(429).json({
          error: 'Daily budget already exceeded for today.',
          spendTodayUsd: spendStart,
          dailyBudgetUsd,
        });
        return;
      }

      // Load contacts_cache once and shape the known-projects block.
      const { giboneyContacts, christensenContacts } = await loadContactsCache(db);
      const knownProjectsBlock = renderKnownProjects({ giboneyContacts, christensenContacts });

      // Pull a batch of unprocessed items.
      const batchSnap = await rawItemsRef(db)
        .where('processedAt', '==', null)
        .limit(MAX_PER_INVOCATION)
        .get();

      if (batchSnap.empty) {
        await writeBrainRun(db, {
          triggeredAt,
          triggeredByUid,
          itemsProcessed: 0,
          itemsSucceeded: 0,
          itemsFailed: 0,
          costUsd: 0,
          durationMs: Date.now() - triggeredAt,
        });
        res.json({ ok: true, processed: 0, succeeded: 0, failed: 0, costUsd: 0 });
        return;
      }

      const anthropic = new Anthropic({ apiKey });

      let succeeded = 0;
      let failed = 0;
      let totalCostUsd = 0;
      const errors: Array<{ rawItemId: string; error: string }> = [];

      for (const rawDoc of batchSnap.docs) {
        // Mid-batch budget abort.
        if (spendStart + totalCostUsd >= dailyBudgetUsd) {
          errors.push({
            rawItemId: rawDoc.id,
            error: `budget_exceeded: spent $${(spendStart + totalCostUsd).toFixed(4)} of $${dailyBudgetUsd}`,
          });
          failed += 1;
          continue;
        }

        const raw: any = rawDoc.data();
        try {
          const messages = buildMessages({
            knownProjectsBlock,
            source: raw.source,
            metadata: raw.sourceMeta || {},
            content: raw.content || '',
          });

          const response: any = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            tools: [EXTRACTION_TOOL as any],
            tool_choice: { type: 'tool', name: 'extract_item' } as any,
            messages,
          });

          const toolUseBlock = (response.content || []).find((b: any) => b.type === 'tool_use');
          if (!toolUseBlock) throw new Error('Claude returned no tool_use block');
          const extract: any = toolUseBlock.input || {};

          const inputTokens = response.usage?.input_tokens || 0;
          const outputTokens = response.usage?.output_tokens || 0;
          const costUsd =
            inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN;
          totalCostUsd += costUsd;

          const projectId = extract.projectId === 'giboney' || extract.projectId === 'christensen'
            ? extract.projectId
            : null;
          const confidence = typeof extract.confidence === 'number'
            ? Math.max(0, Math.min(1, extract.confidence))
            : 0;

          const lane: Lane = resolveLane({
            category: String(extract.category || 'other'),
            confidence,
            needsClarification: !!extract.needsClarification,
            projectId,
          });

          const processedRef = processedItemsRef(db).doc();
          await processedRef.set({
            rawItemId: rawDoc.id,
            source: raw.source,
            sourceRef: raw.sourceRef,
            category: String(extract.category || 'other'),
            projectId,
            structuredPayload: extract.structuredPayload || {},
            confidence,
            confidenceReason: String(extract.confidenceReason || ''),
            needsClarification: !!extract.needsClarification,
            clarificationQuestion: extract.clarificationQuestion || null,
            lane,
            reviewStatus: 'pending',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            modelUsed: MODEL,
            inputTokens,
            outputTokens,
            costUsd,
          });

          await rawDoc.ref.update({
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            processedItemId: processedRef.id,
          });
          succeeded += 1;
        } catch (e: any) {
          console.error(`[brain/process] raw item ${rawDoc.id} failed:`, e?.message || e);
          errors.push({ rawItemId: rawDoc.id, error: e?.message || 'unknown' });
          failed += 1;
          // Stamp the raw item with the error for visibility. We do NOT set
          // processedAt — failed items remain in the queue and retry next
          // pass. If a specific item is poison, surface it in the UI's
          // brainErrors view and let the operator decide what to do.
          try {
            await rawDoc.ref.update({
              brainErrors: admin.firestore.FieldValue.arrayUnion(
                `${new Date().toISOString()}: ${e?.message || 'unknown'}`,
              ),
            });
          } catch (_) {
            // best effort
          }
        }
      }

      const spendEnd = spendStart + totalCostUsd;
      await configRef(db).set(
        {
          spendDate: today,
          spendTodayUsd: spendEnd,
          lastBrainPassAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      await writeBrainRun(db, {
        triggeredAt,
        triggeredByUid,
        itemsProcessed: batchSnap.size,
        itemsSucceeded: succeeded,
        itemsFailed: failed,
        costUsd: totalCostUsd,
        durationMs: Date.now() - triggeredAt,
      });

      res.json({
        ok: failed === 0,
        processed: batchSnap.size,
        succeeded,
        failed,
        costUsd: totalCostUsd,
        spendTodayUsd: spendEnd,
        dailyBudgetUsd,
        errors,
      });
    } catch (e: any) {
      console.error('[brain/process] failed:', e);
      await writeBrainRun(db, {
        triggeredAt,
        triggeredByUid,
        itemsProcessed: 0,
        itemsSucceeded: 0,
        itemsFailed: 0,
        costUsd: 0,
        durationMs: Date.now() - triggeredAt,
        error: e?.message || 'unknown',
      }).catch(() => {});
      res.status(500).json({ error: e?.message || 'unknown' });
    }
  });
}

async function loadContactsCache(db: FirebaseFirestore.Firestore): Promise<{
  giboneyContacts: Array<{ name: string; email: string | null; phone: string | null }>;
  christensenContacts: Array<{ name: string; email: string | null; phone: string | null }>;
}> {
  const snap = await contactsCacheRef(db).get();
  const giboney: Array<{ name: string; email: string | null; phone: string | null }> = [];
  const christensen: Array<{ name: string; email: string | null; phone: string | null }> = [];
  for (const d of snap.docs) {
    const c: any = d.data();
    const entry = { name: c.name || '', email: c.email || null, phone: c.phone || null };
    const slugs: string[] = Array.isArray(c.labProjectSlugs) ? c.labProjectSlugs : [];
    if (slugs.includes('giboney')) giboney.push(entry);
    if (slugs.includes('christensen')) christensen.push(entry);
  }
  return { giboneyContacts: giboney, christensenContacts: christensen };
}

async function writeBrainRun(
  db: FirebaseFirestore.Firestore,
  data: {
    triggeredAt: number;
    triggeredByUid: string;
    itemsProcessed: number;
    itemsSucceeded: number;
    itemsFailed: number;
    costUsd: number;
    durationMs: number;
    error?: string;
  },
): Promise<void> {
  const payload: any = {
    triggeredAt: admin.firestore.Timestamp.fromMillis(data.triggeredAt),
    triggeredByUid: data.triggeredByUid,
    itemsProcessed: data.itemsProcessed,
    itemsSucceeded: data.itemsSucceeded,
    itemsFailed: data.itemsFailed,
    costUsd: data.costUsd,
    durationMs: data.durationMs,
  };
  if (data.error) payload.error = data.error;
  await brainRunsRef(db).add(payload);
}
