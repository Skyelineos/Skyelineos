// Skyeline Homes SMS — Intent Classifier (Phase 2)
//
// Cheap pre-filter for inbound texts. Runs BEFORE the full Claude Sonnet call.
//
//   NOISE          — acks ("ok", "thanks", "👍"). No AI needed. Skip reply or
//                    send a one-liner.
//   STATUS_UPDATE  — "framing done at christensens". Log to project, ack.
//   QUESTION       — "what time tomorrow?". AI answers.
//   ESCALATION     — client/designer/Tyler decision needed.
//   URGENT         — "leak", "fire", "broke". Override everything; ping Tyler.
//   UNKNOWN        — can't classify. Log + ask for clarification.
//
// Strategy:
//   1. Keyword pass first (cheap, deterministic, bilingual EN+ES).
//   2. URGENT keywords override everything (we don't want a "leak" buried).
//   3. If keywords are ambiguous (no clear signal, or multiple categories
//      tie), call Claude Haiku with a tiny prompt.
//   4. Always return a confidence score so the webhook can choose to ask for
//      clarification on low-confidence classifications.

import Anthropic from '@anthropic-ai/sdk';

// ── Public types ─────────────────────────────────────────────────────────────

export type MessageIntent =
  | 'NOISE'
  | 'STATUS_UPDATE'
  | 'QUESTION'
  | 'ESCALATION'
  | 'URGENT'
  | 'EXPENSE_NOTE'
  | 'UNKNOWN';

export interface ClassificationResult {
  intent: MessageIntent;
  confidence: number;        // 0..1
  detectedLanguage: 'en' | 'es';
  usedAi: boolean;           // true when Haiku was consulted
  matchedKeywords: string[]; // for debugging / logs
  costUsd: number;           // 0 when keywords were sufficient
}

// ── Keyword dictionaries ─────────────────────────────────────────────────────
// All entries are lowercased ASCII (we lowercase + strip diacritics before
// matching). Bilingual: English and Spanish entries co-exist.

const NOISE_TOKENS: ReadonlyArray<string> = [
  'ok', 'okay', 'k', 'kk', 'thanks', 'thank you', 'thx', 'ty',
  'got it', 'sounds good', 'sg', 'perfect', 'great', 'cool',
  'np', 'no problem', 'will do', 'on it', 'noted', 'roger',
  'yes', 'yep', 'yup', 'no', 'nope',
  '👍', '👍🏼', '👍🏽', '👍🏾', '👍🏿', '👌', '🙌', '🙌🏽', '🙏', '✅', '❤️',
  // Spanish
  'gracias', 'ok gracias', 'okay gracias', 'sí', 'si', 'no problema',
  'entendido', 'claro', 'perfecto', 'listo', 'bien', 'buenos dias',
  'buenos días', 'hola',
];

const URGENT_TOKENS: ReadonlyArray<string> = [
  // English
  'leak', 'leaking', 'flood', 'flooded', 'flooding', 'fire',
  'broke', 'broken', 'collapse', 'collapsed', 'emergency',
  'hurt', 'injured', 'injury', 'accident', 'ambulance', 'bleeding',
  'urgent', '911', 'help!', 'stolen', 'theft', 'break-in', 'break in',
  'no show', 'no-show', 'didnt show', "didn't show",
  // Spanish
  'fuga', 'fugando', 'fuego', 'incendio', 'roto', 'rota',
  'emergencia', 'accidente', 'lesionado', 'herido', 'ambulancia',
  'urgente', 'robado', 'robo',
];

const STATUS_TOKENS: ReadonlyArray<string> = [
  // English (past-tense / completion words)
  'done', 'finished', 'complete', 'completed', 'wrapped', 'wrapped up',
  'poured', 'framed', 'installed', 'delivered', 'ready', 'passed',
  'approved', 'inspected', 'set', 'rough in done', 'rough-in done',
  'cleaned', 'started',
  // Spanish
  'listo', 'lista', 'terminado', 'terminada', 'acabado', 'acabada',
  'hecho', 'hecha', 'entregado', 'entregada', 'instalado', 'instalada',
  'llisto', // common Tyler-crew misspelling
];

const QUESTION_TOKENS: ReadonlyArray<string> = [
  // English question heads / patterns
  'when', 'what time', 'where', 'how', 'why', 'who',
  'did you', 'do you', 'can you', 'could you', 'will you',
  'have you', 'is it', 'will it', 'is the', 'are the', 'are you',
  'should i', 'should we', 'how much', 'how many',
  // Spanish
  'cuándo', 'cuando', 'a qué hora', 'a que hora', 'dónde', 'donde',
  'cómo', 'como', 'por qué', 'por que', 'quién', 'quien',
  'puede', 'puedes', 'podría', 'podria', 'tiene', 'tienes',
  'ya', 'cuánto', 'cuanto', 'cuántos', 'cuantos',
];

// EXPENSE_NOTE — financial / receipt-style phrasing. Tyler texts the Skyeline
// number short notes like "Charged $847 Home Depot Randy job materials" or
// "Paid plumber $1200 christensens". We detect on financial verbs near a
// dollar amount; the messagingAgent then parses the structured fields out
// with Claude. EN only for now — Tyler is the only EXPENSE_NOTE sender today.
const EXPENSE_KEYWORDS: ReadonlyArray<string> = [
  'charged', 'paid', 'spent', 'bought', 'receipt', 'invoice', 'expense',
  'purchased', 'cost', 'billed',
];

// Construction-supply vendors Tyler hits most often. A vendor hit plus any
// dollar amount is a strong EXPENSE_NOTE signal even without a verb ("$847
// home depot lumber").
const EXPENSE_VENDOR_HINTS: ReadonlyArray<string> = [
  'home depot', 'lowes', "lowe's", 'sutherlands', 'sherwin williams',
  'sherwin-williams', 'ferguson', 'ace hardware', 'menards', 'harbor freight',
  'amazon', 'costco', 'sams club', "sam's club",
];

const ESCALATION_TOKENS: ReadonlyArray<string> = [
  // English — client/designer/decision triggers
  'client wants', 'client asked', 'client says', "they're asking",
  'they are asking', 'wants to change', 'want to change',
  'change order', 'approval', 'approve', 'designer', 'architect',
  'decision', 'need your ok', 'need approval', 'they want',
  'homeowner wants', 'homeowner asked',
  // Spanish
  'cliente quiere', 'cliente pregunta', 'cliente dice',
  'quieren cambiar', 'quiere cambiar', 'aprobación', 'aprobacion',
  'decisión', 'decision', 'diseñador', 'disenador',
];

// Spanish language detection words — common high-frequency words. Hit on any
// of these (and not on English-only equivalents) tips detection to Spanish.
const SPANISH_DETECTOR_WORDS: ReadonlyArray<string> = [
  'que', 'qué', 'una', 'esto', 'esta', 'está', 'estoy',
  'para', 'como', 'cómo', 'cuando', 'cuándo', 'gracias',
  'puede', 'tiene', 'quieren', 'porque', 'porqué', 'pero',
  'también', 'tambien', 'donde', 'dónde', 'aquí', 'aqui',
  'mañana', 'manana', 'hoy', 'ayer', 'señor', 'senor',
  'buenos', 'buenas', 'dias', 'días', 'noches', 'tarde',
  'hola', 'sí', 'si',
];

// ── Normalization ────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    // Strip combining diacritics so "está" → "esta" for matching, but keep ñ
    // intact (we'll allow both forms in dictionaries).
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function containsAny(haystack: string, needles: ReadonlyArray<string>): string[] {
  const hits: string[] = [];
  for (const n of needles) {
    const needle = normalize(n);
    if (!needle) continue;
    // Multi-word needles: substring match (we normalize whitespace).
    if (needle.includes(' ')) {
      if (haystack.includes(needle)) hits.push(n);
      continue;
    }
    // Single token: word-boundary-ish match. Emojis don't word-boundary on
    // \b so we also accept raw substring for non-alphabetic needles.
    if (/^[\p{L}\p{N}]+$/u.test(needle)) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(needle)}([^\\p{L}\\p{N}]|$)`, 'u');
      if (re.test(haystack)) hits.push(n);
    } else if (haystack.includes(needle)) {
      hits.push(n);
    }
  }
  return hits;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Language detection ──────────────────────────────────────────────────────

export function detectLanguage(rawText: string): 'en' | 'es' {
  const text = normalize(rawText);
  if (!text) return 'en';
  const hits = containsAny(text, SPANISH_DETECTOR_WORDS);
  if (hits.length >= 2) return 'es';
  // Single strong Spanish word in a short message is enough.
  if (hits.length === 1 && wordCount(text) <= 4) return 'es';
  return 'en';
}

// EXPENSE_NOTE detection: look for a dollar amount (with or without $) near a
// financial verb, OR a known vendor + a dollar amount. We deliberately avoid
// matching bare prices on QUESTION/STATUS messages ("how much for 847")
// because those typically lack the verbs in EXPENSE_KEYWORDS.
function detectExpenseNote(normalized: string): { hit: boolean; matched: string[] } {
  const matched: string[] = [];
  const hasDollar = /\$\s*\d/.test(normalized);
  // Bare amount: 3-6 digit run that isn't part of a longer number (so phone
  // numbers / addresses don't trip it). Optional decimal.
  const hasBareAmount = /(^|[^\d])\d{2,6}(\.\d{1,2})?(?=[^\d]|$)/.test(normalized);
  const verbHits = containsAny(normalized, EXPENSE_KEYWORDS);
  const vendorHits = containsAny(normalized, EXPENSE_VENDOR_HINTS);

  if (hasDollar) matched.push('$');
  matched.push(...verbHits, ...vendorHits);

  // Strong: dollar sign + verb. ("charged $847 home depot")
  if (hasDollar && verbHits.length > 0) return { hit: true, matched };
  // Strong: vendor + any amount. ("$340 sutherlands lumber", "home depot 200")
  if (vendorHits.length > 0 && (hasDollar || hasBareAmount)) {
    return { hit: true, matched };
  }
  // Medium: verb + bare amount. ("paid plumber 1200")
  if (verbHits.length > 0 && hasBareAmount) return { hit: true, matched };
  return { hit: false, matched: [] };
}

// ── Main classifier ─────────────────────────────────────────────────────────

/**
 * Classify an inbound SMS. Always returns a result; never throws (errors are
 * swallowed and surfaced as UNKNOWN with usedAi=false so the webhook can fall
 * back to the safe "Tyler will follow up" path).
 */
export async function classifyMessage(rawText: string): Promise<ClassificationResult> {
  const detectedLanguage = detectLanguage(rawText);
  const text = normalize(rawText);

  // Empty / whitespace-only — treat as NOISE so we don't burn tokens.
  if (!text) {
    return {
      intent: 'NOISE',
      confidence: 1,
      detectedLanguage,
      usedAi: false,
      matchedKeywords: [],
      costUsd: 0,
    };
  }

  // 1. URGENT keywords override everything.
  const urgentHits = containsAny(text, URGENT_TOKENS);
  if (urgentHits.length > 0) {
    return {
      intent: 'URGENT',
      confidence: 0.95,
      detectedLanguage,
      usedAi: false,
      matchedKeywords: urgentHits,
      costUsd: 0,
    };
  }

  // 2. NOISE — short messages that are pure acks. Check BEFORE keyword scans
  //    so "ok gracias" doesn't trip the QUESTION list on "gracias".
  const words = wordCount(text);
  if (words <= 3) {
    // Exact match against a noise token (most common path).
    const exact = NOISE_TOKENS.find((t) => normalize(t) === text);
    if (exact) {
      return {
        intent: 'NOISE',
        confidence: 1,
        detectedLanguage,
        usedAi: false,
        matchedKeywords: [exact],
        costUsd: 0,
      };
    }
    // Sub-message: contains a noise token and nothing else meaningful.
    const noiseHits = containsAny(text, NOISE_TOKENS);
    if (noiseHits.length > 0 && words <= 2) {
      return {
        intent: 'NOISE',
        confidence: 0.9,
        detectedLanguage,
        usedAi: false,
        matchedKeywords: noiseHits,
        costUsd: 0,
      };
    }
  }

  // 3. EXPENSE_NOTE — receipt-style financial messages from Tyler. We classify
  //    based on text only; the pipeline gates the actual expense-create on
  //    contact.role === 'INTERNAL', so a sub texting "$200 home depot" still
  //    falls through to STATUS_UPDATE/UNKNOWN handling.
  const expenseDetect = detectExpenseNote(text);
  if (expenseDetect.hit) {
    return {
      intent: 'EXPENSE_NOTE',
      confidence: 0.9,
      detectedLanguage,
      usedAi: false,
      matchedKeywords: expenseDetect.matched,
      costUsd: 0,
    };
  }

  // 4. ESCALATION wins over status/question when present (these phrases imply
  //    a decision Tyler needs to be in the loop on).
  const escalationHits = containsAny(text, ESCALATION_TOKENS);
  const statusHits = containsAny(text, STATUS_TOKENS);
  const questionHits = containsAny(text, QUESTION_TOKENS);
  const questionMark = text.includes('?');

  if (escalationHits.length > 0) {
    return {
      intent: 'ESCALATION',
      confidence: 0.85,
      detectedLanguage,
      usedAi: false,
      matchedKeywords: escalationHits,
      costUsd: 0,
    };
  }

  // 5. Clear single-category signals.
  const statusOnly = statusHits.length > 0 && questionHits.length === 0 && !questionMark;
  const questionOnly = (questionHits.length > 0 || questionMark) && statusHits.length === 0;

  if (statusOnly) {
    return {
      intent: 'STATUS_UPDATE',
      confidence: 0.85,
      detectedLanguage,
      usedAi: false,
      matchedKeywords: statusHits,
      costUsd: 0,
    };
  }
  if (questionOnly) {
    return {
      intent: 'QUESTION',
      confidence: questionMark ? 0.9 : 0.8,
      detectedLanguage,
      usedAi: false,
      matchedKeywords: questionHits.length ? questionHits : ['?'],
      costUsd: 0,
    };
  }

  // 6. Ambiguous — call Haiku.
  try {
    const ai = await classifyWithHaiku(rawText, detectedLanguage);
    return {
      intent: ai.intent,
      confidence: ai.confidence,
      detectedLanguage,
      usedAi: true,
      matchedKeywords: [
        ...statusHits,
        ...questionHits,
        ...escalationHits,
      ],
      costUsd: ai.costUsd,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[intentClassifier/classifyMessage] Haiku fallback failed:', message);
    return {
      intent: 'UNKNOWN',
      confidence: 0.3,
      detectedLanguage,
      usedAi: false,
      matchedKeywords: [],
      costUsd: 0,
    };
  }
}

// ── Haiku fallback ───────────────────────────────────────────────────────────

const HAIKU_MODEL = 'claude-haiku-4-5';

// Haiku pricing (approx, current public list): $1/MTok input, $5/MTok output.
const HAIKU_INPUT_USD_PER_TOKEN = 1 / 1_000_000;
const HAIKU_OUTPUT_USD_PER_TOKEN = 5 / 1_000_000;

interface HaikuClassification {
  intent: MessageIntent;
  confidence: number;
  costUsd: number;
}

function anthropicClient(): Anthropic {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not bound');
  return new Anthropic({ apiKey });
}

async function classifyWithHaiku(
  rawText: string,
  language: 'en' | 'es',
): Promise<HaikuClassification> {
  const system =
    `You classify inbound SMS messages from a construction company's subs, clients, and crew. ` +
    `Reply with ONLY a JSON object: {"intent":"<LABEL>","confidence":<0..1>}. No prose.\n` +
    `LABELS:\n` +
    `NOISE = pure ack ("ok","thanks","👍").\n` +
    `STATUS_UPDATE = a sub/crew reporting work done or progress.\n` +
    `QUESTION = a direct question that needs an answer (scheduling, scope, logistics).\n` +
    `ESCALATION = client/designer/decision needed; owner Tyler should review.\n` +
    `URGENT = leak, fire, injury, no-show, emergency.\n` +
    `EXPENSE_NOTE = a short receipt/expense note from an internal staff member ` +
    `(e.g. "Charged $847 Home Depot Randy job materials"). Dollar amount + ` +
    `vendor + project hint.\n` +
    `UNKNOWN = cannot tell.`;

  const user =
    `Language: ${language === 'es' ? 'Spanish' : 'English'}\n` +
    `Message: "${rawText.slice(0, 500)}"\n` +
    `Return JSON.`;

  const resp: any = await anthropicClient().messages.create({
    model: HAIKU_MODEL,
    max_tokens: 60,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = (resp.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();
  const usage = resp.usage || {};
  const costUsd =
    (usage.input_tokens || 0) * HAIKU_INPUT_USD_PER_TOKEN +
    (usage.output_tokens || 0) * HAIKU_OUTPUT_USD_PER_TOKEN;

  const parsed = parseHaikuJson(text);
  if (!parsed) {
    return { intent: 'UNKNOWN', confidence: 0.3, costUsd };
  }
  return { ...parsed, costUsd };
}

function parseHaikuJson(text: string): { intent: MessageIntent; confidence: number } | null {
  // Be forgiving: pull the first {...} block in case the model wraps it.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { intent?: unknown; confidence?: unknown };
    const intent = String(obj.intent || '').toUpperCase() as MessageIntent;
    const validIntents: MessageIntent[] = [
      'NOISE', 'STATUS_UPDATE', 'QUESTION', 'ESCALATION', 'URGENT',
      'EXPENSE_NOTE', 'UNKNOWN',
    ];
    if (!validIntents.includes(intent)) return null;
    let confidence = Number(obj.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.6;
    confidence = Math.max(0, Math.min(1, confidence));
    return { intent, confidence };
  } catch {
    return null;
  }
}
