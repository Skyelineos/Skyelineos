// Skyeline Homes SMS — Escalation Engine (Phase 2)
//
// When the intent classifier flags ESCALATION or URGENT, the webhook hands
// off to this module. It:
//
//   1. Picks the right escalation lane (URGENT / CLIENT_DECISION /
//      DESIGNER_INPUT / TYLER_REVIEW).
//   2. Writes the appropriate Firestore artifact:
//        URGENT          → notifications/{id}     (Tyler-targeted urgent ping)
//        CLIENT_DECISION → sms_drafts/{id}        (AI-drafted client message
//                                                  for Tyler to approve)
//        DESIGNER_INPUT  → sms_escalations/{id}   (flagged for designer portal)
//        TYLER_REVIEW    → sms_escalations/{id}   (summary + original)
//   3. Returns a structured result so the webhook can ack the sender in
//      Tyler's voice.
//
// All Firestore writes are awaited so we return a usable result, but if any
// write fails we still return a degraded result — the inbound message has
// already been logged separately, so no data is lost.
//
// Firestore document schemas (informal — Firestore is schemaless):
//
//   sms_drafts/{id}
//     {
//       contactId: string | null,
//       projectId: string | null,
//       projectName: string | null,
//       toNumber: string,            // who Tyler would send to
//       draftBody: string,            // the AI draft for client
//       sourceMessage: string,        // the inbound that triggered this
//       sourceContactId: string | null,
//       reason: string,               // why we drafted (1-line summary)
//       status: 'pending' | 'approved' | 'rejected' | 'sent',
//       createdAt, updatedAt
//     }
//
//   sms_escalations/{id}
//     {
//       type: 'CLIENT_DECISION' | 'DESIGNER_INPUT' | 'TYLER_REVIEW' | 'URGENT',
//       contactId: string | null,
//       contactName: string,
//       projectId: string | null,
//       projectName: string | null,
//       originalMessage: string,
//       summary: string,
//       intent: MessageIntent,
//       language: 'en' | 'es',
//       status: 'open' | 'resolved',
//       createdAt, updatedAt
//     }
//
//   notifications/{id}  (existing collection used by the in-app shell)
//     {
//       kind: 'sms_urgent',
//       toUserRole: 'admin' | 'owner',
//       title, body,
//       contactId, projectId,
//       link: string,
//       createdAt
//     }

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import type { JobContext, SmsContact } from './types';
import type { MessageIntent } from './intentClassifier';

// ── Public types ─────────────────────────────────────────────────────────────

export type EscalationType =
  | 'CLIENT_DECISION'
  | 'DESIGNER_INPUT'
  | 'TYLER_REVIEW'
  | 'URGENT';

export interface EscalationResult {
  type: EscalationType;
  notifyTyler: boolean;
  /** AI-generated draft TO client (Tyler reviews/sends). Set for CLIENT_DECISION only. */
  draftForClient?: string;
  /** Short summary written for Tyler. */
  summary: string;
  /** Firestore doc id that was written (if any). */
  recordId?: string;
  /** Which collection the recordId lives in. */
  recordCollection?: 'sms_drafts' | 'sms_escalations' | 'notifications';
  /** Short ack to send back to the sender in their language. */
  ackText: string;
}

// ── Main entry ──────────────────────────────────────────────────────────────

export async function handleEscalation(
  db: admin.firestore.Firestore,
  contact: SmsContact,
  project: JobContext | null,
  messageText: string,
  intent: MessageIntent,
  language: 'en' | 'es' = 'en',
): Promise<EscalationResult> {
  const type = classifyEscalation(contact, intent, messageText);
  const summary = buildSummary(contact, project, messageText, type);

  switch (type) {
    case 'URGENT':
      return handleUrgent(db, contact, project, messageText, summary, language);
    case 'CLIENT_DECISION':
      return handleClientDecision(db, contact, project, messageText, summary, language);
    case 'DESIGNER_INPUT':
      return handleDesignerInput(db, contact, project, messageText, summary, intent, language);
    case 'TYLER_REVIEW':
    default:
      return handleTylerReview(db, contact, project, messageText, summary, intent, language);
  }
}

// ── Type selection ───────────────────────────────────────────────────────────

function classifyEscalation(
  contact: SmsContact,
  intent: MessageIntent,
  messageText: string,
): EscalationType {
  if (intent === 'URGENT') return 'URGENT';

  const text = messageText.toLowerCase();

  // Designer signal: explicit mention of designer/architect/spec/selection.
  const designerSignals = [
    'designer', 'architect', 'spec', 'selection', 'finishes',
    'diseñador', 'disenador', 'arquitecto',
  ];
  if (designerSignals.some((s) => text.includes(s))) {
    return 'DESIGNER_INPUT';
  }

  // Client decision: came from a CLIENT, OR the message references a
  // client/homeowner choice.
  const clientSignals = [
    'client wants', 'client asked', 'homeowner', 'they want',
    "they're asking", 'wants to change', 'want to change',
    'cliente quiere', 'cliente pregunta', 'quieren cambiar',
  ];
  if (contact.role === 'CLIENT' || clientSignals.some((s) => text.includes(s))) {
    return 'CLIENT_DECISION';
  }

  return 'TYLER_REVIEW';
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleUrgent(
  db: admin.firestore.Firestore,
  contact: SmsContact,
  project: JobContext | null,
  messageText: string,
  summary: string,
  language: 'en' | 'es',
): Promise<EscalationResult> {
  const title = `🚨 Urgent from ${contact.name}${project?.projectName ? ` @ ${project.projectName}` : ''}`;
  const body = messageText.slice(0, 500);

  let recordId: string | undefined;
  let recordCollection: EscalationResult['recordCollection'];
  try {
    const ref = await db.collection('notifications').add({
      kind: 'sms_urgent',
      toUserRole: 'admin',
      title,
      body,
      summary,
      contactId: contact.id ?? null,
      contactName: contact.name,
      contactPhone: contact.phoneNumber,
      projectId: project?.projectId ?? null,
      projectName: project?.projectName ?? null,
      originalMessage: messageText,
      language,
      severity: 'urgent',
      status: 'unread',
      createdAt: FieldValue.serverTimestamp(),
    });
    recordId = ref.id;
    recordCollection = 'notifications';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[escalationEngine/handleUrgent] notification write failed:', message);
  }

  // Also drop a row in sms_escalations so the SMS UI shows it in the
  // escalation queue, not just the global notification bell.
  try {
    await db.collection('sms_escalations').add({
      type: 'URGENT',
      contactId: contact.id ?? null,
      contactName: contact.name,
      contactPhone: contact.phoneNumber,
      projectId: project?.projectId ?? null,
      projectName: project?.projectName ?? null,
      originalMessage: messageText,
      summary,
      intent: 'URGENT',
      language,
      status: 'open',
      severity: 'urgent',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[escalationEngine/handleUrgent] sms_escalations write failed:', message);
  }

  return {
    type: 'URGENT',
    notifyTyler: true,
    summary,
    recordId,
    recordCollection,
    ackText: language === 'es'
      ? 'Recibido. Avisando a Tyler ahora mismo.'
      : 'Got it — flagging Tyler right now.',
  };
}

async function handleClientDecision(
  db: admin.firestore.Firestore,
  contact: SmsContact,
  project: JobContext | null,
  messageText: string,
  summary: string,
  language: 'en' | 'es',
): Promise<EscalationResult> {
  // Draft a message Tyler can send back. If the inbound is FROM a client,
  // the draft is Tyler's reply to that same client. If the inbound is from a
  // sub asking on behalf of a client, the draft is Tyler-to-client (Tyler
  // will pick the recipient in the UI).
  let draft = '';
  try {
    draft = await draftClientMessage(contact, project, messageText, language);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[escalationEngine/handleClientDecision] draft failed:', message);
  }

  let recordId: string | undefined;
  try {
    const ref = await db.collection('sms_drafts').add({
      contactId: contact.id ?? null,
      contactName: contact.name,
      projectId: project?.projectId ?? null,
      projectName: project?.projectName ?? null,
      toNumber: contact.role === 'CLIENT' ? contact.phoneNumber : null,
      draftBody: draft,
      sourceMessage: messageText,
      sourceContactId: contact.id ?? null,
      reason: summary,
      language,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    recordId = ref.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[escalationEngine/handleClientDecision] sms_drafts write failed:', message);
  }

  // Mirror to sms_escalations so it shows in the unified queue.
  try {
    await db.collection('sms_escalations').add({
      type: 'CLIENT_DECISION',
      contactId: contact.id ?? null,
      contactName: contact.name,
      projectId: project?.projectId ?? null,
      projectName: project?.projectName ?? null,
      originalMessage: messageText,
      summary,
      draftId: recordId ?? null,
      language,
      status: 'open',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[escalationEngine/handleClientDecision] sms_escalations write failed:', message);
  }

  return {
    type: 'CLIENT_DECISION',
    notifyTyler: true,
    draftForClient: draft || undefined,
    summary,
    recordId,
    recordCollection: 'sms_drafts',
    ackText: language === 'es'
      ? 'Ok recibí esto. Voy a hablar con Tyler y te confirmo.'
      : 'Got it — I\'ll loop in Tyler and circle back with an answer.',
  };
}

async function handleDesignerInput(
  db: admin.firestore.Firestore,
  contact: SmsContact,
  project: JobContext | null,
  messageText: string,
  summary: string,
  intent: MessageIntent,
  language: 'en' | 'es',
): Promise<EscalationResult> {
  let recordId: string | undefined;
  try {
    const ref = await db.collection('sms_escalations').add({
      type: 'DESIGNER_INPUT',
      contactId: contact.id ?? null,
      contactName: contact.name,
      projectId: project?.projectId ?? null,
      projectName: project?.projectName ?? null,
      originalMessage: messageText,
      summary,
      intent,
      language,
      status: 'open',
      flaggedFor: 'designer',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    recordId = ref.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[escalationEngine/handleDesignerInput] write failed:', message);
  }

  return {
    type: 'DESIGNER_INPUT',
    notifyTyler: true,
    summary,
    recordId,
    recordCollection: 'sms_escalations',
    ackText: language === 'es'
      ? 'Recibido — voy a confirmar con el diseñador y te aviso.'
      : 'Got it — I\'ll check with the designer and circle back.',
  };
}

async function handleTylerReview(
  db: admin.firestore.Firestore,
  contact: SmsContact,
  project: JobContext | null,
  messageText: string,
  summary: string,
  intent: MessageIntent,
  language: 'en' | 'es',
): Promise<EscalationResult> {
  let recordId: string | undefined;
  try {
    const ref = await db.collection('sms_escalations').add({
      type: 'TYLER_REVIEW',
      contactId: contact.id ?? null,
      contactName: contact.name,
      projectId: project?.projectId ?? null,
      projectName: project?.projectName ?? null,
      originalMessage: messageText,
      summary,
      intent,
      language,
      status: 'open',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    recordId = ref.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[escalationEngine/handleTylerReview] write failed:', message);
  }

  return {
    type: 'TYLER_REVIEW',
    notifyTyler: true,
    summary,
    recordId,
    recordCollection: 'sms_escalations',
    ackText: language === 'es'
      ? 'Recibido. Tyler te va a contestar pronto.'
      : 'Got it — Tyler will follow up shortly.',
  };
}

// ── Summary builder ─────────────────────────────────────────────────────────

function buildSummary(
  contact: SmsContact,
  project: JobContext | null,
  messageText: string,
  type: EscalationType,
): string {
  const who = contact.name || 'Unknown contact';
  const where = project?.projectName ? ` @ ${project.projectName}` : '';
  const lead = type === 'URGENT' ? 'URGENT' : type.replace('_', ' ').toLowerCase();
  const preview = messageText.replace(/\s+/g, ' ').trim().slice(0, 140);
  return `${who}${where} (${lead}): ${preview}`;
}

// ── Draft generator (CLIENT_DECISION only) ──────────────────────────────────

const HAIKU_MODEL = 'claude-haiku-4-5';
const HAIKU_INPUT_USD_PER_TOKEN = 1 / 1_000_000;
const HAIKU_OUTPUT_USD_PER_TOKEN = 5 / 1_000_000;

async function draftClientMessage(
  contact: SmsContact,
  project: JobContext | null,
  inboundMessage: string,
  language: 'en' | 'es',
): Promise<string> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    // No key bound — return empty draft so Tyler can write it himself.
    return '';
  }

  const system =
    `You are drafting an SMS for Tyler Rhoton (Skyeline Homes) to send to a client. ` +
    `Voice: warm working-builder casual, direct, humble, 1-3 sentences. ` +
    `Open with "Hey [name]," or just "Hey,". Don't sign the text. ` +
    `Acknowledge what was asked, propose a path forward, and ask if that works. ` +
    `If you don't know a fact (date, price, time), use "I think" / "should be" / "I'll double check" rather than inventing. ` +
    `Output ONLY the SMS body, no quotes, no labels.` +
    (language === 'es'
      ? ` Write in casual Spanish (Tyler's bilingual register). Keep construction nouns in English.`
      : '');

  const projectLine = project?.projectName
    ? `Project: ${project.projectName}${project.address ? ` — ${project.address}` : ''}`
    : 'Project: (unspecified)';

  const user =
    `Contact: ${contact.name} (${contact.role})\n` +
    `${projectLine}\n` +
    `Inbound from them: "${inboundMessage.slice(0, 600)}"\n\n` +
    `Draft Tyler's reply.`;

  try {
    const client = new Anthropic({ apiKey });
    const resp: any = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 200,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = (resp.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim();
    // Strip stray wrapping quotes.
    const cleaned = text.replace(/^["']/, '').replace(/["']$/, '').trim();
    // Cost tracking is informational only here — we don't bill it.
    const usage = resp.usage || {};
    const costUsd =
      (usage.input_tokens || 0) * HAIKU_INPUT_USD_PER_TOKEN +
      (usage.output_tokens || 0) * HAIKU_OUTPUT_USD_PER_TOKEN;
    console.info(
      `[escalationEngine/draftClientMessage] drafted (${cleaned.length} chars, $${costUsd.toFixed(5)})`,
    );
    return cleaned;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[escalationEngine/draftClientMessage] Haiku call failed:', message);
    return '';
  }
}
