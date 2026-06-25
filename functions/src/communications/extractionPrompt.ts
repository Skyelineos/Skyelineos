// Prompt + tool schema for the Communication Center brain. Given a conversation
// transcript, Claude extracts the actionable / record-worthy items a builder
// cares about: action items, client decisions, commitments, change-order
// signals, issues, schedule changes, and trade mentions.
//
// Mirrors the Ingestion-Lab / AI-Inbox tool_use pattern. Output is a list of
// suggestions; nothing here applies anything — the review queue (human approval)
// is enforced downstream, per the Phase-3 gating decision.

export const ENTITY_TYPES = [
  'action_item',
  'decision_made',
  'decision_needed',
  'commitment',
  'change_order_signal',
  'issue',
  'schedule_change',
  'vendor_mention',
] as const;

export const SYSTEM_PROMPT = `You are the assistant for Skyeline Homes, a custom home builder. You read a single conversation thread (between the builder's team, the homeowner/client, designers, and trade partners) and extract the items the builder needs to act on or keep a record of.

Extract ONLY things clearly supported by the conversation. Do not invent details. If something is implied but uncertain, lower the confidence and, when a human would need to clarify it, set needsClarification.

Entity types:
- action_item: a task someone needs to do ("send the quote", "order the tile").
- commitment: a promise someone made ("I'll have the framers there Tuesday").
- decision_made: a choice the client/team has settled ("approved the quartz countertops").
- decision_needed: a pending choice awaiting an answer ("need to pick the cabinet stain").
- change_order_signal: anything that could change scope/price/contract ("can we add a third bay to the garage?"). These are high-stakes — flag them.
- issue: a reported problem or concern ("the master shower is leaking").
- schedule_change: a date/sequence change ("push drywall to next week").
- vendor_mention: a trade/vendor referenced by name or role (plumber, electrician, cabinet supplier, a company name).

For each item give:
- a one-line summary (what it is),
- ownerName: the person responsible if named, else null,
- dueDate: YYYY-MM-DD if a date is stated/derivable, else null,
- priority: low | normal | high (high for change-order signals, issues, or anything urgent), else null,
- tradeMentions: array of trade/vendor names referenced, else [],
- sourceQuote: the short verbatim snippet it came from, else null,
- confidence: 0-1,
- needsClarification + clarificationQuestion when a human should confirm.

Always call the extract_communications tool. If nothing is actionable, return an empty items array. Be conservative: a handful of accurate items beats many speculative ones.`;

// NOTE on schema shape: Anthropic's tool input_schema is JSON Schema Draft
// 2020-12 but the API has tightened — `type: ['string','null']` arrays and
// `null` inside `enum` arrays are rejected with "provider rejected the
// request schema or tool payload". We keep a single `type` per field and
// make optional fields simply non-required so the model can omit them.
export const EXTRACTION_TOOL = {
  name: 'extract_communications',
  description: 'Return structured items extracted from a conversation thread.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Extracted items; empty array if nothing actionable.',
        items: {
          type: 'object',
          properties: {
            entityType: { type: 'string', enum: ENTITY_TYPES as unknown as string[] },
            summary: { type: 'string' },
            ownerName: { type: 'string', description: 'Owner name; omit if not stated.' },
            dueDate: { type: 'string', description: 'YYYY-MM-DD; omit if none.' },
            priority: { type: 'string', enum: ['low', 'normal', 'high'] },
            tradeMentions: { type: 'array', items: { type: 'string' } },
            sourceQuote: { type: 'string', description: 'Short verbatim snippet; omit if none.' },
            confidence: { type: 'number' },
            needsClarification: { type: 'boolean' },
            clarificationQuestion: { type: 'string', description: 'Question for human; omit if none.' },
          },
          required: ['entityType', 'summary', 'confidence'],
        },
      },
    },
    required: ['items'],
  },
} as const;

export interface ThreadContext {
  title: string;
  category: string;
  subjectLabel?: string;
  messages: { author: string; role?: string; text: string; at?: string }[];
}

function renderTranscript(ctx: ThreadContext): string {
  const head = `Thread: "${ctx.title}" (category: ${ctx.category}${ctx.subjectLabel ? `, subject: ${ctx.subjectLabel}` : ''})`;
  const body = ctx.messages
    .map((m) => `${m.author}${m.role ? ` (${m.role})` : ''}${m.at ? ` [${m.at}]` : ''}: ${m.text}`)
    .join('\n');
  // Cap to keep token cost predictable on very long threads.
  return `${head}\n\n${body}`.slice(0, 30000);
}

export function buildExtractMessages(ctx: ThreadContext): any[] {
  return [
    {
      role: 'user',
      content: `Extract the action items, decisions, and other record-worthy items from this conversation.\n\n${renderTranscript(ctx)}`,
    },
  ];
}

export function buildSummaryMessages(ctx: ThreadContext, scope: 'thread' | 'project'): any[] {
  const ask = scope === 'project'
    ? 'Summarize the current state of this project\'s communication: where things stand, open questions, recent decisions, and anything that needs attention. 4-8 sentences.'
    : 'Summarize this conversation: what it is about, what was decided, and what is still open. 2-4 sentences.';
  return [
    {
      role: 'user',
      content: `${ask}\n\n${renderTranscript(ctx)}`,
    },
  ];
}
