// SMS Agent (Phase 1) types — FUNCTIONS-LOCAL COPY.
//
// Firebase Functions can't import across the package boundary because
// tsc's outDir would reorganize the lib/ layout and break `main: lib/index.js`.
// The canonical copy lives at shared/sms-types.ts; this file is a verbatim
// clone kept in sync by hand. When you edit one, edit both.
//
// Two universes live in this codebase:
//   • Runtime: Firebase Functions + Firestore. The agent reads/writes
//     `sms_messages`, `sms_contacts`, `sms_threads` as Firestore collections.
//   • Schema-of-record: a Drizzle/Postgres schema sits in `shared/schema.ts`
//     as a legacy artifact from the Replit era. Equivalent `pgTable`
//     definitions live there too so a future Postgres migration is a copy,
//     not a re-derive. (See `shared/schema.ts` → SMS section.)

// ── Roles ────────────────────────────────────────────────────────────────────
// Mirrors how Tyler thinks about the people the agent talks to:
//   • CLIENT  — homeowners (current + recent past clients)
//   • SUB     — subcontractors / trades / vendor crews
//   • INTERNAL — Skyeline staff (Chris, Easton, Brandon, Nicole, etc.)
//   • VENDOR  — material suppliers, lumberyards, etc. who aren't subs
export const SMS_CONTACT_ROLES = ['CLIENT', 'SUB', 'INTERNAL', 'VENDOR'] as const;
export type SmsContactRole = typeof SMS_CONTACT_ROLES[number];

// Spanish-speaking subs flip this on so the agent replies in Spanish (style
// guide §9). Anything else defaults to English.
export const SMS_LANGUAGES = ['en', 'es'] as const;
export type SmsLanguage = typeof SMS_LANGUAGES[number];

// ── Direction / status ───────────────────────────────────────────────────────
export type SmsDirection = 'inbound' | 'outbound';

// Twilio-aligned message status. We track the lifecycle so the UI can show
// "queued → sent → delivered → read" instead of a single timestamp.
export const SMS_STATUSES = [
  'queued',
  'sending',
  'sent',
  'delivered',
  'undelivered',
  'failed',
  'received',
  'read',
] as const;
export type SmsStatus = typeof SMS_STATUSES[number];

// ── Proactive outbound message types ─────────────────────────────────────────
// These are the buckets the trigger engine + AI agent map to. Phase 1 ships
// the eight below; we deliberately keep this list short so the prompt-builder
// for each one is well-tuned to Tyler's voice (see agent-style-guide §12).
export const OUTBOUND_TYPES = [
  'SUB_SCHEDULE_REQUEST', // "Hey are you able to stop by tomorrow?"
  'SUB_FOLLOWUP',         // "Hey just checking in on the doors eta"
  'SUB_CONFIRMATION',     // "Confirming doors for Christensens tomorrow"
  'CLIENT_UPDATE',        // Mid-project status text
  'CLIENT_MILESTONE',     // "We are soooo excited" celebration
  'DELAY_NOTICE',         // "Hey sorry…" + reason + next step
  'URGENT_PING',          // "There is a balcony that needs waterproofing asap"
  'REMINDER',             // Inspection / blower-door / pre-pour reminders
  'INBOUND_REPLY',        // AI auto-reply to inbound message from known contact
  'DEFAULT_REPLY',        // Default reply to unknown number
] as const;
export type OutboundType = typeof OUTBOUND_TYPES[number];

// ── Firestore document shapes ────────────────────────────────────────────────
// `id` is the Firestore doc id and only present on read-back. Timestamps are
// strings (ISO) over the wire; Firestore stores them as Timestamps and the
// dispatch layer converts via `.toDate()?.toISOString()`.

export interface SmsContact {
  id?: string;
  name: string;
  phoneNumber: string;           // E.164
  role: SmsContactRole;
  preferredLanguage: SmsLanguage; // default 'en'
  projectIds: string[];           // Firestore project doc ids
  // Optional sub-trade for SUB contacts (electrical, plumbing, hvac, …).
  // Drives the SUB_SCHEDULE_REQUEST prompt: "the electrician" vs "the painter".
  trade?: string | null;
  // Notes Tyler wants the agent to remember (e.g. "Brad — owner, 2 crews, slow to respond on weekends").
  notes?: string | null;
  // Tyler's contacts collection has linkedContactId — when set, this row
  // is a thin SMS pointer back to the canonical /contacts/{id} doc so the
  // agent can pull email + company info without duplicating it.
  linkedContactId?: string | null;
  createdBy: string;              // uid of the staff member who created it
  createdAt?: string;
  updatedAt?: string;
}

export interface SmsThread {
  id?: string;
  contactId: string;
  projectId?: string | null;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastDirection?: SmsDirection;
  unreadCount?: number;          // # of inbound msgs since last staff view
  createdAt?: string;
}

export interface SmsMessage {
  id?: string;
  threadId?: string;             // populated after thread upsert; missing for orphan inbound until matched
  direction: SmsDirection;
  fromNumber: string;            // E.164
  toNumber: string;              // E.164
  body: string;
  twilioSid?: string | null;     // Twilio MessageSid, present for sent/received via Twilio
  contactId?: string | null;
  projectId?: string | null;
  status: SmsStatus;
  // For outbound: whether the AI agent drafted the body. Used for analytics +
  // to distinguish manual sends from agent sends in the UI.
  generatedByAi?: boolean;
  // For outbound AI-generated: which OutboundType was used (auditability).
  outboundType?: OutboundType | null;
  errorMessage?: string | null;
  createdAt?: string;
}

// ── Agent context shapes (server-only but exported here so the client can
// preview drafts without round-tripping the prompt) ──────────────────────────

export interface MessageContext {
  contact: SmsContact;
  thread: SmsThread | null;
  history: SmsMessage[];          // chronological, oldest → newest
  project?: JobContext | null;
  // The fresh inbound message we're replying to. Always last in `history` too,
  // but exposed here as a convenience for prompt builders.
  latestInbound: SmsMessage;
}

export interface JobContext {
  projectId: string;
  projectName: string;            // "Christensens" / "Joseph's" / canonical client last name
  address?: string | null;        // "364 w 350 s Mapleton"
  city?: string | null;
  // Free-form recent activity / status the agent should reference. Pulled from
  // project notes, recent task completions, schedule changes, etc.
  recentActivity?: string[];
  // What just happened that triggered the proactive message (e.g.
  // "Plumbing rough completed", "Inspector booked for Monday 9am").
  triggerSummary?: string;
}

export interface Recipient {
  contact: SmsContact;
  // What Tyler wants to ask / tell them. The agent fills in the voice; this is
  // the operator's intent in their own words.
  intent: string;
}
