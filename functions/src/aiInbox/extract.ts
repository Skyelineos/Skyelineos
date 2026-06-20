// AI Inbox brain — runs one item through Claude and returns a normalized
// extraction. Shared by the n8n ingest route (inline at intake) and the
// /reprocess route. Enforces a rolling daily spend cap stored in
// ai_inbox_config/global, mirroring the Ingestion Lab budget guardrail.

import type { firestore as adminFirestore } from 'firebase-admin';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import {
  SYSTEM_PROMPT,
  EXTRACTION_TOOL,
  buildMessages,
} from './extractionPrompt';
import {
  loadProjectIndex,
  renderKnownProjects,
  deterministicMatch,
  ProjectIndexEntry,
} from './projectMatcher';
import { AiInboxExtraction } from './types';

const MODEL = 'claude-sonnet-4-6';
// Sonnet 4.6 list pricing — used ONLY for the local budget guardrail.
const INPUT_USD_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 15 / 1_000_000;
const DEFAULT_DAILY_BUDGET_USD = 10;

export function aiInboxConfigRef(db: adminFirestore.Firestore) {
  return db.collection('ai_inbox_config').doc('global');
}

export class BudgetExceededError extends Error {
  spendTodayUsd: number;
  dailyBudgetUsd: number;
  constructor(spendTodayUsd: number, dailyBudgetUsd: number) {
    super('AI Inbox daily budget exceeded');
    this.spendTodayUsd = spendTodayUsd;
    this.dailyBudgetUsd = dailyBudgetUsd;
  }
}

export interface ExtractResult {
  extraction: AiInboxExtraction;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// Budget check + roll. Throws BudgetExceededError if today's spend is already
// at/over cap. Returns the current dailyBudget so callers can report it.
async function checkBudget(db: adminFirestore.Firestore): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const snap = await aiInboxConfigRef(db).get();
  const cfg: any = snap.data() || {};
  const dailyBudgetUsd = typeof cfg.dailyBudgetUsd === 'number' ? cfg.dailyBudgetUsd : DEFAULT_DAILY_BUDGET_USD;
  const sameDay = cfg.spendDate === today;
  const spendStart = sameDay ? Number(cfg.spendTodayUsd || 0) : 0;
  if (!sameDay) {
    await aiInboxConfigRef(db).set({ spendDate: today, spendTodayUsd: 0, dailyBudgetUsd }, { merge: true });
  }
  if (spendStart >= dailyBudgetUsd) {
    throw new BudgetExceededError(spendStart, dailyBudgetUsd);
  }
  return dailyBudgetUsd;
}

async function recordSpend(db: adminFirestore.Firestore, costUsd: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await aiInboxConfigRef(db).set(
    {
      spendDate: today,
      spendTodayUsd: admin.firestore.FieldValue.increment(costUsd),
      lastBrainPassAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

// Run the extraction for one raw item. `extraHint` is appended to the user turn
// (used by /reprocess to feed a human's clarification answer back in).
export async function extractInboxItem(
  db: adminFirestore.Firestore,
  raw: {
    source?: string;
    sourceMeta?: any;
    content?: string;
  },
  opts: { extraHint?: string; projectIndex?: ProjectIndexEntry[] } = {},
): Promise<ExtractResult> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not bound to this function.');

  await checkBudget(db);

  const projects = opts.projectIndex || (await loadProjectIndex(db));
  const knownProjectsBlock = renderKnownProjects(projects);

  let content = raw.content || '';
  if (opts.extraHint) {
    content += `\n\nHUMAN CLARIFICATION (use this to refine your extraction):\n${opts.extraHint}`;
  }

  const messages = buildMessages({
    knownProjectsBlock,
    source: raw.source || 'gmail',
    metadata: raw.sourceMeta || {},
    content,
  });

  const anthropic = new Anthropic({ apiKey });
  const response: any = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL as any],
    tool_choice: { type: 'tool', name: 'extract_inbox_item' } as any,
    messages,
  });

  const toolUseBlock = (response.content || []).find((b: any) => b.type === 'tool_use');
  if (!toolUseBlock) throw new Error('Claude returned no tool_use block');
  const out: any = toolUseBlock.input || {};

  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const costUsd = inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN;
  await recordSpend(db, costUsd);

  const extraction = normalizeExtraction(out, raw, projects);
  return { extraction, modelUsed: MODEL, inputTokens, outputTokens, costUsd };
}

function normalizeExtraction(
  out: any,
  raw: { sourceMeta?: any; content?: string },
  projects: ProjectIndexEntry[],
): AiInboxExtraction {
  const meta = raw.sourceMeta || {};

  // Validate Claude's projectId against the real index; backfill with the
  // deterministic matcher if Claude returned null/garbage.
  let projectId: string | null = typeof out.projectId === 'string' ? out.projectId : null;
  let projectName: string | null = typeof out.projectName === 'string' ? out.projectName : null;
  const valid = projectId ? projects.find((p) => p.id === projectId) : undefined;
  if (!valid) {
    projectId = null;
    projectName = null;
    const haystack = [meta.subject, meta.fromName, meta.fromEmail, raw.content]
      .filter(Boolean)
      .join(' ');
    const det = deterministicMatch(haystack, projects);
    if (det) {
      projectId = det.id;
      projectName = det.name;
    }
  } else {
    projectName = valid.name;
  }

  const amount = typeof out.amountUsd === 'number' && isFinite(out.amountUsd) ? out.amountUsd : null;
  const confidence = typeof out.confidence === 'number'
    ? Math.max(0, Math.min(1, out.confidence))
    : 0;

  return {
    category: String(out.category || 'general'),
    vendorName: out.vendorName ? String(out.vendorName) : null,
    amountUsd: amount,
    currency: out.currency ? String(out.currency) : 'USD',
    documentDate: out.documentDate ? String(out.documentDate) : null,
    dueDate: out.dueDate ? String(out.dueDate) : null,
    invoiceNumber: out.invoiceNumber ? String(out.invoiceNumber) : null,
    qboAccountSuggestion: out.qboAccountSuggestion ? String(out.qboAccountSuggestion) : null,
    gmailLabelRecommendation: out.gmailLabelRecommendation ? String(out.gmailLabelRecommendation) : null,
    projectId,
    projectName,
    summary: String(out.summary || meta.subject || '').slice(0, 500),
    confidence,
    confidenceReason: String(out.confidenceReason || ''),
    needsClarification: !!out.needsClarification,
    clarificationQuestion: out.clarificationQuestion ? String(out.clarificationQuestion) : null,
  };
}
