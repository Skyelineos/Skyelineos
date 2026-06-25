// Skyeline Homes Voice AI Receptionist — AI response generator
//
// Wraps Claude Haiku with a voice-specific system prompt. Returns a typed
// VoiceAIResponse so the TwiML layer can branch deterministically on what to
// do (read out, transfer, take a message, urgent transfer).
//
// Why Haiku: phone needs sub-second perceived latency. Sonnet round-trip is
// usually too slow once you add TwiML + Polly synthesis. Haiku at ~500ms is
// the right call for the structured-output, short-answer use case here.
//
// ANTHROPIC_API_KEY is already bound to the api function via Secret Manager.

import Anthropic from '@anthropic-ai/sdk';
import type { SmsContact, JobContext } from '../sms/types';
import type { CallTurn, VoiceAIResponse } from './types';

// Haiku 3.5 is the production-ready fast model. We pin a recent snapshot to
// avoid silent personality drift if Anthropic ships a refresh.
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 256;

// ── System prompt ───────────────────────────────────────────────────────────
// Phone-specific: shorter, more spoken, more bias toward transferring when
// uncertain. Borrows tone rules from agent-style-guide §13 but reshapes them
// for spoken delivery.

export const VOICE_SYSTEM_PROMPT = `You are the Skyeline Homes Assistant — a phone receptionist for Skyeline Homes (Tyler Rhoton, owner, American Fork, UT). You answer inbound calls from subcontractors, clients, vendors, and city officials. You sound like a warm, sharp human assistant, not a robot.

PHONE-SPECIFIC VOICE RULES
- Keep every spoken response to ONE or TWO sentences. People hate long phone responses.
- Sound natural: "Yep", "Sure", "Got it", "Let me check on that for you", "Tyler's out on a job right now…".
- Conversational contractions ("I'll", "we're", "he's"). Never read out punctuation.
- Mirror Tyler's builder casual: warm, direct, decisive. No corporate-speak.
- Don't say "as an AI" or "I'm an AI assistant" — say "I'm the Skyeline assistant" if asked.
- Don't sign off with a name. Just speak.

YOUR JOB
You decide what to do with each turn of the call. You always return a structured JSON object:
{
  "type": "ANSWER" | "TRANSFER" | "TAKE_MESSAGE" | "URGENT_TRANSFER",
  "spokenResponse": "<exactly what to say out loud, 1–2 sentences>",
  "transferReason": "<optional, why transferring>",
  "logNote": "<optional, what to log to the project record>"
}

Type semantics:
- ANSWER: You can answer their question confidently from what you know. Keep talking.
- TRANSFER: You should connect them to Tyler now. Say one polite handoff sentence (e.g. "Let me grab Tyler for you real quick.") and we'll dial him.
- TAKE_MESSAGE: They're a new client or general inquiry. Get their name + reason and we'll text Tyler. Say something like "Sure, what's the best way for Tyler to reach you?"
- URGENT_TRANSFER: Emergency on a jobsite (water, fire, injury, safety, code red). Connect immediately. Say "Hang on, I'm getting Tyler right now."

WHEN TO ANSWER CONFIDENTLY
- Job address / location of a project (only if it's in the context you were given).
- What time a sub is scheduled (only if in context).
- Who to contact for X (only if in context).
- "Are you open" / general "how do I reach Tyler" questions.
- Status of a submitted bid (only if in context).
- Confirming an appointment that's in context.

WHEN TO TRANSFER (NEVER GUESS — TRANSFER)
- Anything about money, payments, change orders, invoices.
- Client design decisions (paint, finishes, plans, layouts).
- Complaints, problems, things that went wrong.
- Anything you don't know the answer to.
- Anything where being wrong would matter.

WHEN TO TAKE A MESSAGE
- New work / sales inquiries from people not in the contact roster.
- General "I saw your sign" / "I'm interested in a build" type calls.
- Vendors trying to sell something — get name, company, callback number.

WHEN TO URGENT_TRANSFER
- Active leak, fire, flood, gas smell, injury on site.
- Inspector on site demanding to speak with the GC right now.
- Anything described as "emergency" or with serious safety language.

OUTPUT DISCIPLINE
- Return ONLY the JSON object. No preamble, no markdown, no \`\`\`json fences.
- spokenResponse is what we feed to text-to-speech. Make it sound spoken, not written.
- Never include URLs, email addresses, or anything that doesn't read naturally out loud.
- If the caller hasn't given a name and you don't recognize them, your first ANSWER should ask for their name naturally ("Sure — who am I talking to?").

CONTEXT YOU CAN TRUST
You'll be given:
- The caller's contact record if they're in the roster (name, role, trade, projects).
- Recent conversation turns from this same call.
- Any project context that's been resolved.
If a field isn't in the context, you don't know it. Don't invent it. Transfer instead.`;

// ── Anthropic client ───────────────────────────────────────────────────────
function client(): Anthropic {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not bound to this function');
  return new Anthropic({ apiKey });
}

export interface VoiceContext {
  contact: SmsContact | null;
  capturedName?: string | null;
  project?: JobContext | null;
  turns: CallTurn[];          // chronological, oldest → newest
  latestUtterance: string;    // what the caller just said
}

/**
 * Generate the next AI response for a voice call turn. Always returns a valid
 * VoiceAIResponse — on parse / API failure we synthesize a TRANSFER so the
 * caller never gets dropped or hears garbage.
 */
export async function generateVoiceResponse(ctx: VoiceContext): Promise<VoiceAIResponse> {
  const user = buildUserMessage(ctx);
  try {
    const resp: any = await client().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: VOICE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    });
    const raw = (resp.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();
    return parseStructuredResponse(raw);
  } catch (err: any) {
    console.error('[voice/agent] Claude call failed:', err?.message);
    return safeTransfer('AI call failed — transferring to Tyler.');
  }
}

function buildUserMessage(ctx: VoiceContext): string {
  const parts: string[] = [];
  parts.push('CONTEXT FOR THIS CALL:');
  if (ctx.contact) {
    parts.push(`- Caller is in the roster: ${ctx.contact.name} (${ctx.contact.role}${ctx.contact.trade ? `, ${ctx.contact.trade}` : ''})`);
    if (ctx.contact.notes) parts.push(`- Notes Tyler keeps on them: ${ctx.contact.notes}`);
    if (ctx.contact.projectIds?.length) {
      parts.push(`- Linked projects: ${ctx.contact.projectIds.join(', ')}`);
    }
    if (ctx.contact.preferredLanguage === 'es') {
      parts.push(`- Preferred language is Spanish — answer in Spanish.`);
    }
  } else if (ctx.capturedName) {
    parts.push(`- Caller is NOT in the roster. They gave their name as: ${ctx.capturedName}`);
  } else {
    parts.push('- Caller is NOT in the roster and has not yet given their name.');
  }

  if (ctx.project) {
    parts.push('');
    parts.push('PROJECT CONTEXT:');
    parts.push(`- Project: ${ctx.project.projectName}`);
    if (ctx.project.address) parts.push(`- Address: ${ctx.project.address}${ctx.project.city ? ` (${ctx.project.city})` : ''}`);
    if (ctx.project.recentActivity?.length) {
      parts.push('- Recent activity:');
      for (const a of ctx.project.recentActivity.slice(0, 5)) parts.push(`    • ${a}`);
    }
  }

  if (ctx.turns.length) {
    parts.push('');
    parts.push('CALL SO FAR (oldest first):');
    for (const t of ctx.turns.slice(-8)) {
      const who = t.speaker === 'caller' ? 'Caller' : 'You';
      parts.push(`[${who}] ${t.text}`);
    }
  }

  parts.push('');
  parts.push('CALLER JUST SAID:');
  parts.push(`> ${ctx.latestUtterance.trim()}`);
  parts.push('');
  parts.push('Respond with ONLY the JSON object described in the system prompt.');
  return parts.join('\n');
}

// ── Response parsing ───────────────────────────────────────────────────────
// Defensive parser — strips code fences, finds the first { ... } block, and
// validates the shape. If anything is off we fall back to a safe transfer.

const ALLOWED_TYPES = new Set<VoiceAIResponse['type']>([
  'ANSWER', 'TRANSFER', 'TAKE_MESSAGE', 'URGENT_TRANSFER',
]);

export function parseStructuredResponse(raw: string): VoiceAIResponse {
  let s = (raw || '').trim();
  // Strip ```json fences if the model decides to ignore the instruction.
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // Find the first { ... } envelope.
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return safeTransfer('Parser could not find JSON envelope.');
  }
  const slice = s.slice(start, end + 1);
  let obj: any;
  try {
    obj = JSON.parse(slice);
  } catch (err: any) {
    console.warn('[voice/agent] JSON parse failed:', err?.message, 'raw:', s.slice(0, 200));
    return safeTransfer('JSON parse failed.');
  }
  const type = String(obj?.type || '').toUpperCase().trim() as VoiceAIResponse['type'];
  const spoken = String(obj?.spokenResponse || '').trim();
  if (!ALLOWED_TYPES.has(type)) {
    return safeTransfer(`Unknown response type: ${obj?.type}`);
  }
  if (!spoken) {
    return safeTransfer('Empty spokenResponse.');
  }
  return {
    type,
    spokenResponse: sanitizeForTts(spoken),
    transferReason: obj?.transferReason ? String(obj.transferReason).trim() : undefined,
    logNote: obj?.logNote ? String(obj.logNote).trim() : undefined,
  };
}

/**
 * The model occasionally tries to read out URLs or symbols. Strip the worst
 * offenders so TTS doesn't spell things character-by-character.
 */
function sanitizeForTts(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Build a TRANSFER response from scratch — used as the safe fallback whenever
 * the model misbehaves or we hit an exception. Tyler always gets the call
 * rather than the caller hearing dead air.
 */
export function safeTransfer(reason: string): VoiceAIResponse {
  return {
    type: 'TRANSFER',
    spokenResponse: "Let me grab Tyler for you real quick.",
    transferReason: reason,
  };
}
