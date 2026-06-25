// First-draft extraction prompt for the Ingestion Lab brain pass.
//
// Three exports:
//   - SYSTEM_PROMPT      — role + rules + two text-rendered few-shot examples
//   - EXTRACTION_TOOL    — Anthropic tool definition with strict JSON schema
//   - buildMessages()    — builds the single user turn for one raw item
//   - renderKnownProjects() — renders the "KNOWN PROJECTS" block from
//                              the contacts_cache (called once per batch)
//
// Few-shot examples are baked into the system prompt as text rather than
// real tool_use turns. Two reasons: (1) avoids the tool_result round-trip
// the Anthropic API enforces between tool_use turns; (2) lets us reference
// the schema by example without polluting the message history.
//
// Iteration target: Session 13. Once the spike has real items in
// review_queue / ask_queue, tune categories + few-shot calibration based
// on where the brain is mis-classifying.

import { allCategories } from '../laneResolver';

const CATEGORIES_LIST = allCategories();

export const SYSTEM_PROMPT = `You are extracting structured data from construction-business communications for Skyeline Homes, a custom home builder in Mapleton UT.

Each input is one item from a Gmail inbox, a Google Drive folder, an iMessage thread, or an iCloud upload. The item is most likely associated with one of two ACTIVE projects (or, occasionally, neither).

Your job:
1. Pick the single best category from this list: ${CATEGORIES_LIST.join(', ')}.
2. Decide which project it relates to (or null if you can't tell).
3. Extract a structured payload appropriate to the category — free-form fields, but match the example shapes below.
4. Score your confidence in classification + project assignment.
5. Flag any ambiguity that a human reviewer needs to resolve.

Rules:
- Match the project via sender email or phone (use the known-contacts list), addresses mentioned in the content (Giboney = 364 W 350 S Mapleton; Christensen = 279 N Clegg Canyon Loop Mapleton), or explicit project names.
- If you cannot tell which project, set projectId to null. Do NOT guess.
- If the content involves money, a decision, a commitment, or a material selection, choose the matching category — those route to human review automatically. Decisions in particular ARE NEVER auto-filed.
- Use "other" sparingly, only when nothing else fits.
- Always call the extract_item tool. Do not return prose.
- Omit optional fields entirely when unknown (do not pass them as null). The schema treats absence as null.

Two examples of correct extractions:

EXAMPLE 1 — change order from a known contact
Input:
  KNOWN PROJECTS:
    - giboney      (Randy and Leslie Giboney, 364 W 350 S Mapleton UT)
        contacts: randy@giboney.example (Randy Giboney)
    - christensen  (Jordan and Jessica Christensen, 279 N Clegg Canyon Loop Mapleton UT)
        contacts: jordan@chr.example (Jordan Christensen)

  SOURCE: gmail
  FROM: randy@giboney.example
  SUBJECT: Window order — final count

  CONTENT:
  Tyler — confirmed final window count is 38 (was 36 in the plans). The two
  extra are for the breakfast nook bump-out. Vendor needs the PO by Friday.
  The price went up by $4,820 vs the original bid. Need your sign-off.

Correct extract_item call:
  {
    "category": "change_order",
    "projectId": "giboney",
    "structuredPayload": {
      "summary": "Window count increase from 36 to 38 (breakfast nook bump-out)",
      "costDeltaUsd": 4820,
      "vendor": null,
      "action": "Approve PO",
      "deadline": "Friday"
    },
    "confidence": 0.92,
    "confidenceReason": "Sender is a known Giboney contact; explicit cost change and decision request.",
    "needsClarification": false,
    "clarificationQuestion": null
  }

EXAMPLE 2 — unknown sender, ambiguous project
Input:
  KNOWN PROJECTS: (as above)
  SOURCE: imessage
  FROM: +1-555-0143 (unknown)

  CONTENT:
  Hey just checking if the framers are still coming Tuesday or did that move?

Correct extract_item call (note: projectId omitted because it's unknown):
  {
    "category": "schedule_question",
    "structuredPayload": {
      "summary": "Asking whether framers are still scheduled for Tuesday",
      "rawQuestion": "Are the framers still coming Tuesday or did that move?"
    },
    "confidence": 0.4,
    "confidenceReason": "Sender phone is not in known contacts; cannot determine which project.",
    "needsClarification": true,
    "clarificationQuestion": "Whose project is this? The sender +1-555-0143 is not in the known contacts."
  }

Now process the actual input below.`;

// NOTE on schema shape: Anthropic recently tightened tool-schema validation
// and now rejects `type: ['string','null']` plus `null` in `enum`. To keep
// the "null when unknown" semantic, optional fields are non-required and
// the model is told (in SYSTEM_PROMPT) to omit them when unknown. The
// caller (brainPass.ts) coerces missing `projectId` back to null.
export const EXTRACTION_TOOL = {
  name: 'extract_item',
  description: 'Extract structured data from one construction-business communication.',
  input_schema: {
    type: 'object',
    required: [
      'category',
      'structuredPayload',
      'confidence',
      'confidenceReason',
      'needsClarification',
    ],
    properties: {
      category: {
        type: 'string',
        enum: CATEGORIES_LIST,
        description: 'Best-fit category for this item.',
      },
      projectId: {
        type: 'string',
        enum: ['giboney', 'christensen'],
        description: 'Project slug. Omit the field entirely if you cannot tell.',
      },
      structuredPayload: {
        type: 'object',
        description: 'Category-shaped extracted data; free-form key/values.',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: '0..1 confidence in classification + project match.',
      },
      confidenceReason: {
        type: 'string',
        description: 'One sentence: how you arrived at the confidence score.',
      },
      needsClarification: {
        type: 'boolean',
        description: 'True if a human must answer something before filing.',
      },
      clarificationQuestion: {
        type: 'string',
        description: 'Question for the human; omit if needsClarification is false.',
      },
    },
  },
};

export function buildMessages(args: {
  knownProjectsBlock: string;
  source: string;
  metadata: any;
  content: string;
}): any[] {
  return [{ role: 'user', content: renderItem(args) }];
}

function renderItem(args: {
  knownProjectsBlock: string;
  source: string;
  metadata: any;
  content: string;
}): string {
  const meta = args.metadata || {};
  const lines: string[] = [];
  lines.push(args.knownProjectsBlock);
  lines.push('');
  lines.push(`SOURCE: ${args.source}`);
  if (meta.fromEmail) {
    lines.push(`FROM: ${meta.fromEmail}${meta.fromName ? ' (' + meta.fromName + ')' : ''}`);
  } else if (meta.fromPhone) {
    lines.push(`FROM: ${meta.fromPhone}`);
  } else if (meta.fromName) {
    lines.push(`FROM: ${meta.fromName}`);
  }
  if (meta.subject) lines.push(`SUBJECT: ${meta.subject}`);
  if (meta.fileName) lines.push(`FILE: ${meta.fileName}`);
  if (meta.date) lines.push(`DATE: ${meta.date}`);
  if (meta.pathBreadcrumb) lines.push(`DRIVE PATH: ${meta.pathBreadcrumb}`);
  lines.push('');
  lines.push('CONTENT:');
  // Cap content to keep token use predictable. Real PDFs / threads can be
  // huge; truncating is a spike-acceptable compromise. Tuned in Session 13.
  lines.push(truncate(args.content || '', 30000));
  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s;
  return s.slice(0, max) + `\n\n[content truncated — original length ${s.length} chars]`;
}

export function renderKnownProjects(args: {
  giboneyContacts: Array<{ name: string; email: string | null; phone: string | null }>;
  christensenContacts: Array<{ name: string; email: string | null; phone: string | null }>;
}): string {
  const lines: string[] = ['KNOWN PROJECTS:'];
  lines.push('  - giboney      (Randy and Leslie Giboney, 364 W 350 S Mapleton UT)');
  if (args.giboneyContacts.length > 0) {
    lines.push('      contacts: ' + formatContactList(args.giboneyContacts));
  }
  lines.push(
    '  - christensen  (Jordan and Jessica Christensen, 279 N Clegg Canyon Loop Mapleton UT)',
  );
  if (args.christensenContacts.length > 0) {
    lines.push('      contacts: ' + formatContactList(args.christensenContacts));
  }
  return lines.join('\n');
}

function formatContactList(
  contacts: Array<{ name: string; email: string | null; phone: string | null }>,
): string {
  return contacts
    .map((c) => {
      const ids: string[] = [];
      if (c.email) ids.push(c.email);
      if (c.phone) ids.push(c.phone);
      return ids.length ? `${ids.join(' / ')} (${c.name})` : c.name;
    })
    .join(', ');
}
