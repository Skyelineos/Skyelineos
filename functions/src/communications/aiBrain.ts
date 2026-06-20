// Communication Center brain — runs a thread through Claude for (a) extraction of
// action items / decisions / etc. and (b) summarization. Manual-trigger only
// (called from the staff "Analyze" / "Summarize" buttons). Enforces a rolling
// daily spend cap in communications_ai_config/global, mirroring the AI Inbox.

import type { firestore as adminFirestore } from 'firebase-admin';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import {
  SYSTEM_PROMPT,
  EXTRACTION_TOOL,
  buildExtractMessages,
  buildSummaryMessages,
  ENTITY_TYPES,
  type ThreadContext,
} from './extractionPrompt';

const MODEL = 'claude-sonnet-4-6';
const INPUT_USD_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 15 / 1_000_000;
const DEFAULT_DAILY_BUDGET_USD = 5;

function configRef(db: adminFirestore.Firestore) {
  return db.collection('communications_ai_config').doc('global');
}

export class BudgetExceededError extends Error {
  constructor(public spendTodayUsd: number, public dailyBudgetUsd: number) {
    super('Communication Center AI daily budget exceeded');
  }
}

async function checkBudget(db: adminFirestore.Firestore): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const cfg: any = (await configRef(db).get()).data() || {};
  const dailyBudgetUsd = typeof cfg.dailyBudgetUsd === 'number' ? cfg.dailyBudgetUsd : DEFAULT_DAILY_BUDGET_USD;
  const sameDay = cfg.spendDate === today;
  const spendStart = sameDay ? Number(cfg.spendTodayUsd || 0) : 0;
  if (!sameDay) {
    await configRef(db).set({ spendDate: today, spendTodayUsd: 0, dailyBudgetUsd }, { merge: true });
  }
  if (spendStart >= dailyBudgetUsd) throw new BudgetExceededError(spendStart, dailyBudgetUsd);
}

async function recordSpend(db: adminFirestore.Firestore, costUsd: number): Promise<void> {
  await configRef(db).set(
    {
      spendDate: new Date().toISOString().slice(0, 10),
      spendTodayUsd: admin.firestore.FieldValue.increment(costUsd),
      lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

function client(): Anthropic {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not bound to this function.');
  return new Anthropic({ apiKey });
}

function cost(usage: any): number {
  return (usage?.input_tokens || 0) * INPUT_USD_PER_TOKEN + (usage?.output_tokens || 0) * OUTPUT_USD_PER_TOKEN;
}

// ── Load a thread's transcript from Firestore ────────────────────────────────

export async function loadThreadContext(
  db: adminFirestore.Firestore,
  threadId: string,
): Promise<{ ctx: ThreadContext; data: any } | null> {
  const tSnap = await db.collection('communications').doc(threadId).get();
  if (!tSnap.exists) return null;
  const t: any = tSnap.data();
  const msgSnap = await db
    .collection('communications').doc(threadId)
    .collection('messages').orderBy('createdAt', 'asc').limit(500).get();
  const messages = msgSnap.docs.map((d) => {
    const m: any = d.data();
    const at = m.createdAt?.toDate ? m.createdAt.toDate().toISOString().slice(0, 16).replace('T', ' ') : undefined;
    return { author: m.authorName || 'Unknown', role: m.authorRole || m.senderType, text: String(m.text || ''), at };
  }).filter((m) => m.text.trim());
  return {
    data: t,
    ctx: { title: t.title || 'Conversation', category: t.category || 'general', subjectLabel: t.subjectLabel, messages },
  };
}

// ── Extraction → write suggestions into the review queue ──────────────────────

export interface AnalyzeResult { created: number; skipped: number; costUsd: number }

export async function analyzeThread(
  db: adminFirestore.Firestore,
  threadId: string,
  byUid: string,
): Promise<AnalyzeResult> {
  await checkBudget(db);
  const loaded = await loadThreadContext(db, threadId);
  if (!loaded) throw new Error('Thread not found');
  const { ctx, data } = loaded;
  if (ctx.messages.length === 0) return { created: 0, skipped: 0, costUsd: 0 };

  const resp: any = await client().messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL as any],
    tool_choice: { type: 'tool', name: 'extract_communications' } as any,
    messages: buildExtractMessages(ctx),
  });
  await recordSpend(db, cost(resp.usage));

  const toolUse = (resp.content || []).find((b: any) => b.type === 'tool_use');
  const items: any[] = (toolUse?.input?.items) || [];

  const projectId = data.subjectRef?.type === 'project' ? data.subjectRef.id : null;
  const clientId = data.subjectRef && data.subjectRef.type !== 'project' ? data.subjectRef.id : null;

  // De-dupe against suggestions already pending on this thread (re-running
  // Analyze shouldn't pile up the same items).
  const existing = await db.collection('communications').doc(threadId).collection('extractions')
    .where('status', '==', 'open').get();
  const seen = new Set(existing.docs.map((d) => String((d.data() as any).payload?.summary || '').toLowerCase().trim()));

  let created = 0, skipped = 0;
  const batch = db.batch();
  const col = db.collection('communications').doc(threadId).collection('extractions');
  for (const it of items) {
    const entityType = ENTITY_TYPES.includes(it.entityType) ? it.entityType : 'action_item';
    const summary = String(it.summary || '').trim();
    if (!summary) { skipped++; continue; }
    if (seen.has(summary.toLowerCase())) { skipped++; continue; }
    const confidence = typeof it.confidence === 'number' ? Math.max(0, Math.min(1, it.confidence)) : 0;
    batch.set(col.doc(), {
      entityType,
      payload: {
        summary,
        ownerName: it.ownerName ? String(it.ownerName) : null,
        dueDate: it.dueDate ? String(it.dueDate) : null,
        priority: ['low', 'normal', 'high'].includes(it.priority) ? it.priority : null,
        sourceQuote: it.sourceQuote ? String(it.sourceQuote).slice(0, 500) : null,
      },
      tradeMentions: Array.isArray(it.tradeMentions) ? it.tradeMentions.map(String).slice(0, 10) : [],
      projectId, clientId,
      confidence,
      needsClarification: !!it.needsClarification,
      clarificationQuestion: it.clarificationQuestion ? String(it.clarificationQuestion) : null,
      lane: 'review',          // review-queue gating: always human-confirmed
      status: 'open',          // open → linked | dismissed (staff action)
      createdViaAi: true,
      modelUsed: MODEL,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: byUid,
    });
    seen.add(summary.toLowerCase());
    created++;
  }
  if (created > 0) await batch.commit();
  return { created, skipped, costUsd: cost(resp.usage) };
}

// ── Summarization ────────────────────────────────────────────────────────────

async function summarize(db: adminFirestore.Firestore, ctx: ThreadContext, scope: 'thread' | 'project'): Promise<string> {
  await checkBudget(db);
  const resp: any = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: buildSummaryMessages(ctx, scope),
  });
  await recordSpend(db, cost(resp.usage));
  const text = (resp.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  return text;
}

export async function summarizeThread(db: adminFirestore.Firestore, threadId: string): Promise<string> {
  const loaded = await loadThreadContext(db, threadId);
  if (!loaded) throw new Error('Thread not found');
  if (loaded.ctx.messages.length === 0) return '';
  const summary = await summarize(db, loaded.ctx, 'thread');
  // Persist as the thread's latest AI summary (internal-only display field).
  await db.collection('communications').doc(threadId).set(
    { aiSummary: summary, aiSummaryAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
  return summary;
}

export async function summarizeProject(db: adminFirestore.Firestore, projectId: string): Promise<string> {
  // Aggregate recent messages across the project's threads into one transcript.
  const threads = await db.collection('communications')
    .where('subjectRef.type', '==', 'project')
    .where('subjectRef.id', '==', projectId)
    .limit(50).get();
  const messages: ThreadContext['messages'] = [];
  for (const t of threads.docs) {
    const td: any = t.data();
    const msgs = await t.ref.collection('messages').orderBy('createdAt', 'desc').limit(20).get();
    msgs.docs.reverse().forEach((d) => {
      const m: any = d.data();
      if (m.text) messages.push({ author: m.authorName || 'Unknown', role: `${td.category}/${m.authorRole || m.senderType || ''}`, text: String(m.text) });
    });
  }
  if (messages.length === 0) return '';
  return summarize(db, { title: 'Project communication', category: 'project', messages }, 'project');
}
