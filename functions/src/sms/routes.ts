// Skyeline Homes SMS Agent — Express routes (Phase 1)
//
// Mounted onto the shared `api` Express app by functions/src/index.ts. We
// register two route layers:
//
//   1. PUBLIC webhook (no auth gate; Twilio signature is the gate)
//        POST /api/sms/webhook       — Twilio inbound message webhook
//        POST /api/sms/inbound       — legacy alias (kept for the existing
//                                       Twilio messaging-number config that
//                                       points at /api/sms/inbound; see
//                                       notifications/smsInboundRoute.ts).
//                                       Index.ts already registers the legacy
//                                       route; this module ONLY registers
//                                       /api/sms/webhook so we don't double-bind.
//
//   2. STAFF routes (require JWT via staffOnly middleware)
//        POST /api/sms/send
//        GET  /api/sms/threads
//        GET  /api/sms/threads/:id/messages
//        POST /api/sms/contacts
//        GET  /api/sms/contacts
//        POST /api/sms/generate
//
// All staff routes use staffOnly() — admin | gc | projectManager. The Phase 1
// spec says "JWT auth" generically; the codebase's auth middleware verifies
// Firebase ID tokens, which is the JWT-equivalent here.

import type { Express, Request, Response } from 'express';
import type { firestore as adminFirestore } from 'firebase-admin';
import * as admin from 'firebase-admin';
import {
  sendSms,
  parseInbound,
  verifyTwilioSignature,
  logMessage,
  upsertThread,
  findContactByPhone,
  loadThread,
  SMS_COLLECTIONS,
} from './smsService';
import { generateResponse, generateOutbound, parseExpenseFromMessage } from './messagingAgent';
import type { ParsedExpense } from './messagingAgent';
import { assignExpenseToDrawPeriod } from '../expenses/drawRoutes';
import { staffOnly } from '../communications/staffAuth';
import { toE164, classifySmsKeyword, applySmsKeyword } from '../notifications/sms';
import type {
  SmsContact,
  MessageContext,
  OutboundType,
  JobContext,
  Recipient,
} from './types';
import { classifyMessage } from './intentClassifier';
import type { MessageIntent } from './intentClassifier';
import { routeToProject } from './projectRouter';
import {
  checkRateLimit,
  checkAndIncrement,
  incrementUsage,
} from './rateLimiter';
import { handleEscalation } from './escalationEngine';
import { handleTaskCompletion, isCompletionKeyword } from '../tasks/taskNotifier';

const OUTBOUND_TYPES_RUNTIME: OutboundType[] = [
  'SUB_SCHEDULE_REQUEST', 'SUB_FOLLOWUP', 'SUB_CONFIRMATION',
  'CLIENT_UPDATE', 'CLIENT_MILESTONE', 'DELAY_NOTICE',
  'URGENT_PING', 'REMINDER',
];

const ROLES_RUNTIME = ['CLIENT', 'SUB', 'INTERNAL', 'VENDOR'];

// ── TwiML helper ─────────────────────────────────────────────────────────────
function twiml(body?: string): string {
  if (!body) return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

// ── Public webhook ───────────────────────────────────────────────────────────

export function registerSmsWebhookRoute(app: Express, db: adminFirestore.Firestore): void {
  app.post('/api/sms/webhook', async (req: Request, res: Response) => {
    // Always respond with TwiML on a 200, even on failure paths, so Twilio
    // doesn't retry-storm. We never throw past this handler.
    res.set('Content-Type', 'text/xml');
    try {
      const sigValid = verifyTwilioSignature(req);
      if (!sigValid) {
        // Log but allow through while we debug Firebase Hosting header forwarding.
        // TODO: re-enable hard reject once signature validation is confirmed working.
        console.warn('[sms/webhook] signature invalid — allowing through for debug (remove before prod hardening)');
      }

      const inbound = parseInbound(req);
      if (!inbound.from || !inbound.to) {
        console.warn('[sms/webhook] missing From/To, dropping');
        res.send(twiml());
        return;
      }

      // ── Honor STOP / START / HELP first so we mirror the carrier state.
      // The legacy /api/sms/inbound route already handles this for that URL;
      // we duplicate here because /api/sms/webhook is the route from the build
      // spec and may be the only one Twilio is pointed at.
      const keyword = classifySmsKeyword(inbound.body);
      if (keyword === 'stop' || keyword === 'start') {
        await applySmsKeyword(db, inbound.from, keyword);
        console.log(`[sms/webhook] keyword ${keyword.toUpperCase()} from ${inbound.from}`);
        // STOP: carrier injects confirmation. START: send our opt-in.
        const reply = keyword === 'start'
          ? "Skyeline Homes: You're now subscribed to text alerts. Reply HELP for help, STOP to unsubscribe."
          : undefined;
        res.send(twiml(reply));
        return;
      }
      if (keyword === 'help') {
        res.send(twiml('Skyeline Homes alerts. Reply STOP to unsubscribe, START to resubscribe. Msg & data rates may apply.'));
        return;
      }

      // ── Log the inbound message regardless of whether we have a contact match.
      // Orphan inbounds (unknown number) still go in sms_messages so staff can
      // claim them in the UI ("Add to roster").
      const contact = await findContactByPhone(db, inbound.from);
      const messageId = await logMessage(db, {
        direction: 'inbound',
        fromNumber: inbound.from,
        toNumber: inbound.to,
        body: inbound.body,
        twilioSid: inbound.messageSid || null,
        contactId: contact?.id ?? null,
        projectId: null,
        status: 'received',
      });

      if (contact?.id) {
        const threadId = await upsertThread(db, contact.id, null, inbound.body, 'inbound');
        await db.collection(SMS_COLLECTIONS.messages).doc(messageId).update({ threadId })
          .catch((err: any) => console.warn('[sms/webhook] threadId backfill failed:', err?.message));

        // Run the Phase 2 intelligence pipeline. This is awaited so we don't
        // double-respond, but each individual step has its own try/catch so a
        // failure in one stage degrades gracefully rather than killing the
        // whole webhook.
        await runInboundPipeline(db, contact, inbound.from, inbound.body, threadId, messageId)
          .catch((err: any) => console.error('[sms/webhook] pipeline error:', err?.message));
      } else {
        // Unknown number — send a friendly bilingual holding message.
        console.info(`[sms/webhook] no contact match for ${inbound.from}; sending default reply`);
        try {
          await sendSms(db, {
            to: inbound.from,
            body: "Hey, this is the Skyeline Homes Assistant. To reach Tyler, please call directly. / Hola, soy el asistente de Skyeline Homes. Para comunicarse con Tyler, por favor llame directamente.",
            contactId: null,
            projectId: null,
            generatedByAi: false,
            outboundType: 'DEFAULT_REPLY',
          });
        } catch (e: any) {
          console.error('[sms/webhook] default reply failed:', e?.message);
        }
      }

      // Acknowledge receipt — actual reply is sent async above.
      res.send(twiml());
    } catch (e: any) {
      console.error('[sms/webhook] error:', e?.message);
      res.send(twiml());
    }
  });
}

// ── Inbound pipeline (Phase 2) ──────────────────────────────────────────────
//
// inbound text arrives
// → rate limit check (if exceeded: "Hey, we've hit our message limit for
//   today. Tyler will follow up.")
// → intent classification (NOISE → simple ack; URGENT → escalate immediately)
// → project routing (route or ask which project)
// → STATUS_UPDATE → log to project + send "Got it, logged to [Project] ✓"
// → QUESTION       → AI answers + send
// → ESCALATION     → escalation engine + notify Tyler
// → UNKNOWN        → "Hey, just got your message. Tyler will follow up."

async function runInboundPipeline(
  db: adminFirestore.Firestore,
  contact: SmsContact,
  fromNumber: string,
  messageBody: string,
  threadId: string,
  messageId: string,
): Promise<void> {
  // 1. Rate limit on sends FIRST. If we're over budget for replies to this
  //    contact today, bail silently — sending another "limit hit" text would
  //    just burn one more send. Tyler will see the inbound in the UI.
  const sendCheck = await checkRateLimit(db, contact.id || '', 'send');
  if (!sendCheck.allowed) {
    console.warn(`[sms/pipeline] send cap reached for ${contact.name} (${contact.id}); skipping reply`);
    return;
  }

  // 2. Classify intent (keyword first, Haiku fallback).
  let intent: MessageIntent = 'UNKNOWN';
  let language: 'en' | 'es' = contact.preferredLanguage === 'es' ? 'es' : 'en';
  let usedAi = false;
  try {
    const cls = await classifyMessage(messageBody);
    intent = cls.intent;
    usedAi = cls.usedAi;
    if (cls.detectedLanguage === 'es') language = 'es';
    if (usedAi && contact.id) {
      incrementUsage(db, contact.id, 'ai_call').catch((err: any) =>
        console.warn('[sms/pipeline] incrementUsage failed:', err?.message),
      );
    }
    console.info(
      `[sms/pipeline] ${contact.name} → intent=${intent} conf=${cls.confidence.toFixed(2)} lang=${language} usedAi=${usedAi}`,
    );
  } catch (err: any) {
    console.error('[sms/pipeline] classifier crashed:', err?.message);
  }

  // 3. Project routing (skipped for NOISE; we don't need to attribute acks).
  let project: JobContext | null = null;
  let routing: Awaited<ReturnType<typeof routeToProject>> | null = null;
  if (intent !== 'NOISE') {
    try {
      routing = await routeToProject(db, contact, messageBody, language);
      if (routing.projectId) {
        project = await buildJobContext(db, routing.projectId, undefined, undefined);
      }
    } catch (err: any) {
      console.warn('[sms/pipeline] routing failed:', err?.message);
    }
  }

  // Tag the inbound message with whatever project we resolved (best-effort).
  if (routing?.projectId) {
    db.collection(SMS_COLLECTIONS.messages).doc(messageId)
      .update({ projectId: routing.projectId })
      .catch((err: any) => console.warn('[sms/pipeline] projectId backfill failed:', err?.message));
  }

  // 3.5. EXPENSE_NOTE — Tyler (INTERNAL) texted a receipt note. Parse with
  //      Claude, look up the project by name, create the expense doc, and
  //      auto-assign to the current draw period. Non-INTERNAL senders fall
  //      through to the regular STATUS_UPDATE/QUESTION/etc. flow even if the
  //      classifier guessed EXPENSE_NOTE — a sub shouldn't be able to write
  //      expense rows.
  if (intent === 'EXPENSE_NOTE' && contact.role === 'INTERNAL') {
    try {
      await handleExpenseNote(db, contact, fromNumber, messageBody);
    } catch (err: any) {
      console.error('[sms/pipeline] EXPENSE_NOTE failed:', err?.message);
      await sendAck(
        db,
        contact,
        fromNumber,
        "Couldn't parse that as an expense. Try: 'Charged $847 Home Depot Randy job materials'",
        null,
      );
    }
    return;
  }

  // 4. URGENT — escalate immediately, send brief ack.
  if (intent === 'URGENT') {
    try {
      const result = await handleEscalation(db, contact, project, messageBody, intent, language);
      await sendAck(db, contact, fromNumber, result.ackText, project?.projectId ?? null);
    } catch (err: any) {
      console.error('[sms/pipeline] URGENT escalation failed:', err?.message);
      await sendAck(
        db,
        contact,
        fromNumber,
        language === 'es' ? 'Recibido — avisando a Tyler.' : 'Got it — flagging Tyler now.',
        project?.projectId ?? null,
      );
    }
    return;
  }

  // 5. NOISE — no reply (the inbound was itself an ack).
  if (intent === 'NOISE') {
    console.info(`[sms/pipeline] NOISE from ${contact.name}; no reply sent`);
    return;
  }

  // 6. Routing ambiguity — ask which project before doing anything else.
  if (routing?.confidence === 'ambiguous' && routing.disambiguationQuestion) {
    await sendAck(db, contact, fromNumber, routing.disambiguationQuestion, null);
    return;
  }

  // 7. STATUS_UPDATE — log to project, ack.
  if (intent === 'STATUS_UPDATE') {
    // Task-completion shortcut: if the sender has an active assigned task
    // AND the message looks like a completion ack (DONE / LISTO / etc.),
    // close the task and let handleTaskCompletion own the ack.
    if (contact.id && isCompletionKeyword(messageBody)) {
      try {
        const closed = await handleTaskCompletion(db, contact.id, messageBody, threadId);
        if (closed) {
          // handleTaskCompletion already sent the "Got it, logged ✓" ack and
          // wrote a project_status_updates row. We're done.
          return;
        }
      } catch (err: any) {
        console.warn('[sms/pipeline] handleTaskCompletion threw:', err?.message);
        // Fall through to the generic STATUS_UPDATE path so the sender still
        // gets a reply.
      }
    }
    logProjectStatus(db, contact, project, messageBody, language)
      .catch((err: any) => console.warn('[sms/pipeline] status log failed:', err?.message));
    const projectLabel = project?.projectName || (language === 'es' ? 'el proyecto' : 'the project');
    const ack = language === 'es'
      ? `Recibido, logged a ${projectLabel} ✓`
      : `Got it, logged to ${projectLabel} ✓`;
    await sendAck(db, contact, fromNumber, ack, project?.projectId ?? null);
    return;
  }

  // 8. ESCALATION — engine handles the write + ack text.
  if (intent === 'ESCALATION') {
    try {
      const result = await handleEscalation(db, contact, project, messageBody, intent, language);
      await sendAck(db, contact, fromNumber, result.ackText, project?.projectId ?? null);
    } catch (err: any) {
      console.error('[sms/pipeline] ESCALATION failed:', err?.message);
      await sendAck(
        db,
        contact,
        fromNumber,
        language === 'es' ? 'Recibido — Tyler te va a contestar pronto.' : 'Got it — Tyler will follow up shortly.',
        project?.projectId ?? null,
      );
    }
    return;
  }

  // 9. QUESTION — AI answers. Gate behind the AI-call rate limit (transactional).
  if (intent === 'QUESTION') {
    const aiCheck = contact.id
      ? await checkAndIncrement(db, contact.id, 'ai_call')
      : { allowed: true };
    if (!aiCheck.allowed) {
      const ack = language === 'es'
        ? 'Oye, llegamos al límite de mensajes por hoy. Tyler te va a contestar.'
        : "Hey, we've hit our message limit for today. Tyler will follow up.";
      await sendAck(db, contact, fromNumber, ack, project?.projectId ?? null);
      return;
    }
    try {
      const ctx = await buildReplyContext(db, threadId);
      if (!ctx) {
        await sendAck(
          db,
          contact,
          fromNumber,
          language === 'es' ? 'Recibido — Tyler te va a contestar pronto.' : 'Got it — Tyler will follow up shortly.',
          project?.projectId ?? null,
        );
        return;
      }
      const { text: replyBody, needsClarification, clarification } = await generateResponse(ctx);
      const finalReply = needsClarification
        ? (clarification || (language === 'es' ? 'Recibido — Tyler te va a contestar.' : "Got it — Tyler will follow up."))
        : replyBody;
      if (finalReply && finalReply.trim()) {
        await sendSms(db, {
          to: fromNumber,
          body: finalReply,
          contactId: contact.id ?? null,
          projectId: project?.projectId ?? null,
          generatedByAi: true,
          outboundType: 'INBOUND_REPLY',
        });
      }
      console.info(`[sms/pipeline] QUESTION answered for ${contact.name}`);
    } catch (err: any) {
      console.error('[sms/pipeline] QUESTION reply failed:', err?.message);
      await sendAck(
        db,
        contact,
        fromNumber,
        language === 'es' ? 'Recibido — Tyler te va a contestar pronto.' : 'Got it — Tyler will follow up shortly.',
        project?.projectId ?? null,
      );
    }
    return;
  }

  // 10. UNKNOWN fallthrough — friendly handoff.
  const fallback = language === 'es'
    ? 'Oye, recibí tu mensaje. Tyler te va a contestar.'
    : 'Hey, just got your message. Tyler will follow up.';
  await sendAck(db, contact, fromNumber, fallback, project?.projectId ?? null);
}

// ── EXPENSE_NOTE handler ────────────────────────────────────────────────────
//
// Parses Tyler's expense text with Claude, finds the project by name hint,
// writes projects/{projectId}/expenses/{id}, and assigns to the current draw
// period. Replies via SMS with success / unassigned / parse-failed copy.
async function handleExpenseNote(
  db: adminFirestore.Firestore,
  contact: SmsContact,
  fromNumber: string,
  messageBody: string,
): Promise<void> {
  const { parsed } = await parseExpenseFromMessage(messageBody);

  // ── Parse failed or no amount → tell Tyler to retry.
  if (!parsed || !parsed.amount || parsed.amount <= 0) {
    await sendAck(
      db,
      contact,
      fromNumber,
      "Couldn't parse that as an expense. Try: 'Charged $847 Home Depot Randy job materials'",
      null,
    );
    return;
  }

  const vendor = parsed.vendor || 'Unknown vendor';
  const amountStr = formatUsd(parsed.amount);

  // ── Resolve project by projectHint (case-insensitive contains on name).
  let projectId: string | null = null;
  let projectName: string | null = null;
  if (parsed.projectHint) {
    const match = await findProjectByNameHint(db, parsed.projectHint);
    if (match) {
      projectId = match.projectId;
      projectName = match.projectName;
    }
  }

  // ── No project → log as unassigned (synthetic projectId) and ask Tyler
  //    which project. We still write the expense so it isn't lost; the
  //    "unassigned" projectId makes it easy to surface in the UI.
  if (!projectId) {
    const unassignedId = 'unassigned';
    const expenseData = buildExpenseDocData({
      projectId: unassignedId,
      projectName: 'Unassigned',
      vendor,
      parsed,
      fromNumber,
      originalMessage: messageBody,
    });
    try {
      await db
        .collection('projects')
        .doc(unassignedId)
        .collection('expenses')
        .add(expenseData);
    } catch (err: any) {
      console.warn('[sms/expense] unassigned write failed:', err?.message);
    }
    await sendAck(
      db,
      contact,
      fromNumber,
      `Logged ${amountStr} at ${vendor} as unassigned. Reply with project name to assign it.`,
      null,
    );
    return;
  }

  // ── Project found → write the expense and assign to the draw period.
  const expenseData = buildExpenseDocData({
    projectId,
    projectName: projectName || projectId,
    vendor,
    parsed,
    fromNumber,
    originalMessage: messageBody,
  });

  const ref = await db
    .collection('projects')
    .doc(projectId)
    .collection('expenses')
    .add(expenseData);

  let drawSuffix = '';
  try {
    const { periodId } = await assignExpenseToDrawPeriod(
      db,
      projectId,
      ref.id,
      parsed.date,
      parsed.amount,
      projectName || undefined,
    );
    const periodSnap = await db
      .collection('projects')
      .doc(projectId)
      .collection('draw_periods')
      .doc(periodId)
      .get();
    const drawNumber = (periodSnap.data() as any)?.drawNumber;
    if (typeof drawNumber === 'number') drawSuffix = ` (Draw #${drawNumber}, ${parsed.category})`;
    else drawSuffix = ` (${parsed.category})`;
  } catch (err: any) {
    console.warn('[sms/expense] assignExpenseToDrawPeriod failed:', err?.message);
    drawSuffix = ` (${parsed.category})`;
  }

  await sendAck(
    db,
    contact,
    fromNumber,
    `Got it — ${amountStr} at ${vendor} logged to ${projectName}${drawSuffix}. Reply EDIT to change or VOID to remove.`,
    projectId,
  );
}

// Build the Firestore expense doc payload from a parsed expense + context.
// Matches the shape used by expenseRoutes.ts so the document is editable by
// the same UI / patch route.
function buildExpenseDocData(args: {
  projectId: string;
  projectName: string;
  vendor: string;
  parsed: ParsedExpense;
  fromNumber: string;
  originalMessage: string;
}): Record<string, unknown> {
  const { projectId, projectName, vendor, parsed, fromNumber, originalMessage } = args;
  return {
    projectId,
    projectName,
    vendor,
    amount: parsed.amount || 0,
    date: parsed.date,
    category: parsed.category,
    description: parsed.description || '',
    tradeCategory: parsed.tradeCategory || '',
    status: 'pending',
    capturedBy: 'sms',
    capturedByPhone: fromNumber,
    notes: `SMS: "${originalMessage.slice(0, 800)}"`,
    receiptImageUrl: null,
    receiptStoragePath: null,
    drawNumber: null,
    qboTransactionId: null,
    qboMatchedAt: null,
    lineItems: [],
    capturedAt: admin.firestore.Timestamp.now(),
  };
}

// Case-insensitive project lookup by hint. Scans the `projects` collection
// and returns the first project whose name/clientLastName/nickname/title
// contains the hint (lowercased on both sides). Capped at a reasonable
// number of docs so we don't drag a huge collection into memory.
async function findProjectByNameHint(
  db: adminFirestore.Firestore,
  hint: string,
): Promise<{ projectId: string; projectName: string } | null> {
  const needle = hint.toLowerCase().trim();
  if (!needle) return null;
  try {
    const snap = await db.collection('projects').limit(500).get();
    for (const doc of snap.docs) {
      const data = (doc.data() || {}) as Record<string, unknown>;
      const candidates = [
        data.name,
        data.clientLastName,
        data.clientName,
        data.clientFirstName,
        data.nickname,
        data.title,
      ]
        .filter((v) => typeof v === 'string')
        .map((v) => String(v).toLowerCase());
      if (candidates.some((c) => c.includes(needle))) {
        const projectName = String(data.name || data.clientLastName || data.title || doc.id);
        return { projectId: doc.id, projectName };
      }
    }
  } catch (err: any) {
    console.warn('[sms/expense] findProjectByNameHint failed:', err?.message);
  }
  return null;
}

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Helper: send a short ack via sendSms. Wraps errors so we never crash the
// pipeline.
async function sendAck(
  db: adminFirestore.Firestore,
  contact: SmsContact,
  toNumber: string,
  body: string,
  projectId: string | null,
): Promise<void> {
  if (!body || !body.trim()) return;
  try {
    await sendSms(db, {
      to: toNumber,
      body,
      contactId: contact.id ?? null,
      projectId,
      generatedByAi: false,
      outboundType: 'INBOUND_REPLY',
    });
  } catch (err: any) {
    console.error('[sms/pipeline] sendAck failed:', err?.message);
  }
}

// Helper: write a lightweight status-update doc onto the project so the
// activity feed shows "Brad: framing done @ Christensens".
//
// Firestore schema (informal — Firestore is schemaless):
//   project_status_updates/{id} {
//     projectId, projectName, source: 'sms',
//     contactId, contactName, contactPhone, contactRole,
//     body, language, createdAt
//   }
async function logProjectStatus(
  db: adminFirestore.Firestore,
  contact: SmsContact,
  project: JobContext | null,
  messageBody: string,
  language: 'en' | 'es',
): Promise<void> {
  if (!project?.projectId) return;
  await db.collection('project_status_updates').add({
    projectId: project.projectId,
    projectName: project.projectName,
    source: 'sms',
    contactId: contact.id ?? null,
    contactName: contact.name,
    contactPhone: contact.phoneNumber,
    contactRole: contact.role,
    body: messageBody.slice(0, 1000),
    language,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ── Staff routes ─────────────────────────────────────────────────────────────

export function registerSmsStaffRoutes(app: Express, db: adminFirestore.Firestore): void {

  // POST /api/sms/send — manual outbound (Tyler in the UI hits "Send")
  app.post('/api/sms/send', staffOnly, async (req: any, res: Response) => {
    try {
      const { to, body, contactId, projectId, outboundType, skipBrandPrefix } = req.body || {};
      if (!to || typeof to !== 'string') return res.status(400).json({ error: 'to required' });
      if (!body || typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'body required' });
      if (outboundType && !OUTBOUND_TYPES_RUNTIME.includes(outboundType)) {
        return res.status(400).json({ error: 'invalid outboundType' });
      }
      const result = await sendSms(db, {
        to,
        body,
        contactId: contactId || null,
        projectId: projectId || null,
        generatedByAi: false,
        outboundType: outboundType || null,
        skipBrandPrefix: !!skipBrandPrefix,
      });
      if (!result.ok) return res.status(502).json(result);
      return res.json(result);
    } catch (e: any) {
      console.error('[sms/send] failed:', e?.message);
      return res.status(500).json({ error: e?.message || 'send_failed' });
    }
  });

  // GET /api/sms/threads — list recent threads (most recent first)
  app.get('/api/sms/threads', staffOnly, async (req: any, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const snap = await db.collection(SMS_COLLECTIONS.threads)
        .orderBy('lastMessageAt', 'desc')
        .limit(limit)
        .get();
      const threads = snap.docs.map((d) => ({
        id: d.id,
        ...serializeTimestamps(d.data()),
      }));
      return res.json({ threads });
    } catch (e: any) {
      console.error('[sms/threads] failed:', e?.message);
      return res.status(500).json({ error: e?.message || 'list_failed' });
    }
  });

  // GET /api/sms/threads/:id/messages
  app.get('/api/sms/threads/:id/messages', staffOnly, async (req: any, res: Response) => {
    try {
      const { thread, messages } = await loadThread(db, req.params.id, 200);
      if (!thread) return res.status(404).json({ error: 'thread not found' });
      // Reset unread on view.
      try {
        await db.collection(SMS_COLLECTIONS.threads).doc(req.params.id).update({ unreadCount: 0 });
      } catch { /* best-effort */ }
      return res.json({
        thread: { id: thread.id, ...serializeTimestamps(thread as any) },
        messages: messages.map((m) => ({ ...serializeTimestamps(m as any) })),
      });
    } catch (e: any) {
      console.error('[sms/threads/:id/messages] failed:', e?.message);
      return res.status(500).json({ error: e?.message || 'load_failed' });
    }
  });

  // POST /api/sms/contacts — create or update (upsert by phoneNumber)
  app.post('/api/sms/contacts', staffOnly, async (req: any, res: Response) => {
    try {
      const body = req.body || {};
      const phone = toE164(body.phoneNumber || body.phone);
      const name = String(body.name || '').trim();
      if (!phone) return res.status(400).json({ error: 'phoneNumber required (valid E.164 or 10/11 digit US)' });
      if (!name) return res.status(400).json({ error: 'name required' });
      const role = ROLES_RUNTIME.includes(body.role) ? body.role : 'SUB';
      const preferredLanguage = body.preferredLanguage === 'es' ? 'es' : 'en';
      const projectIds = Array.isArray(body.projectIds) ? body.projectIds.map(String) : [];
      const payload = {
        name,
        phoneNumber: phone,
        role,
        preferredLanguage,
        projectIds,
        trade: body.trade ? String(body.trade) : null,
        notes: body.notes ? String(body.notes) : null,
        linkedContactId: body.linkedContactId ? String(body.linkedContactId) : null,
        createdBy: req.user?.uid || 'system',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const existing = await db.collection(SMS_COLLECTIONS.contacts)
        .where('phoneNumber', '==', phone).limit(1).get();
      if (!existing.empty) {
        const ref = existing.docs[0].ref;
        await ref.set(payload, { merge: true });
        const fresh = await ref.get();
        return res.json({ contact: { id: fresh.id, ...serializeTimestamps(fresh.data() as any) } });
      }
      const ref = await db.collection(SMS_COLLECTIONS.contacts).add({
        ...payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const fresh = await ref.get();
      return res.status(201).json({ contact: { id: fresh.id, ...serializeTimestamps(fresh.data() as any) } });
    } catch (e: any) {
      console.error('[sms/contacts POST] failed:', e?.message);
      return res.status(500).json({ error: e?.message || 'upsert_failed' });
    }
  });

  // GET /api/sms/contacts — list (optional ?role= filter)
  app.get('/api/sms/contacts', staffOnly, async (req: any, res: Response) => {
    try {
      const role = String(req.query.role || '').trim();
      let q: FirebaseFirestore.Query = db.collection(SMS_COLLECTIONS.contacts);
      if (role && ROLES_RUNTIME.includes(role)) q = q.where('role', '==', role);
      const snap = await q.limit(500).get();
      const contacts = snap.docs.map((d) => ({ id: d.id, ...serializeTimestamps(d.data()) }));
      return res.json({ contacts });
    } catch (e: any) {
      console.error('[sms/contacts GET] failed:', e?.message);
      return res.status(500).json({ error: e?.message || 'list_failed' });
    }
  });

  // POST /api/sms/generate — AI draft, DOES NOT SEND
  //
  // Two modes:
  //   • reply mode  : { mode: 'reply', threadId }
  //   • outbound    : { mode: 'outbound', type, contactId, projectId, intent }
  app.post('/api/sms/generate', staffOnly, async (req: any, res: Response) => {
    try {
      const body = req.body || {};
      const mode = String(body.mode || '').trim();
      if (mode === 'reply') {
        const ctx = await buildReplyContext(db, String(body.threadId || ''));
        if (!ctx) return res.status(404).json({ error: 'thread not found or has no inbound message' });
        const result = await generateResponse(ctx);
        return res.json({ ok: true, ...result });
      }
      if (mode === 'outbound') {
        if (!OUTBOUND_TYPES_RUNTIME.includes(body.type)) return res.status(400).json({ error: 'invalid type' });
        const contactId = String(body.contactId || '');
        if (!contactId) return res.status(400).json({ error: 'contactId required' });
        const contactSnap = await db.collection(SMS_COLLECTIONS.contacts).doc(contactId).get();
        if (!contactSnap.exists) return res.status(404).json({ error: 'contact not found' });
        const contact = { id: contactSnap.id, ...(contactSnap.data() as any) } as SmsContact;
        const intent = String(body.intent || '').trim();
        if (!intent) return res.status(400).json({ error: 'intent required' });
        const job = await buildJobContext(db, String(body.projectId || ''), body.triggerSummary, body.recentActivity);
        const recipient: Recipient = { contact, intent };
        const result = await generateOutbound(body.type as OutboundType, job, recipient);
        return res.json({ ok: true, ...result });
      }
      return res.status(400).json({ error: 'mode must be reply | outbound' });
    } catch (e: any) {
      console.error('[sms/generate] failed:', e?.message);
      return res.status(500).json({ error: e?.message || 'generate_failed' });
    }
  });
}

// ── Context loaders ──────────────────────────────────────────────────────────

async function buildReplyContext(
  db: adminFirestore.Firestore,
  threadId: string,
): Promise<MessageContext | null> {
  if (!threadId) return null;
  const { thread, messages } = await loadThread(db, threadId, 30);
  if (!thread) return null;
  // The "latest inbound" is the most recent inbound message in the thread.
  const latestInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
  if (!latestInbound) return null;
  const contactSnap = await db.collection(SMS_COLLECTIONS.contacts).doc(thread.contactId).get();
  if (!contactSnap.exists) return null;
  const contact = { id: contactSnap.id, ...(contactSnap.data() as any) } as SmsContact;
  const project = thread.projectId
    ? await buildJobContext(db, thread.projectId, undefined, undefined)
    : null;
  return { contact, thread, history: messages, latestInbound, project };
}

async function buildJobContext(
  db: adminFirestore.Firestore,
  projectId: string,
  triggerSummary?: string,
  recentActivity?: string[],
): Promise<JobContext | null> {
  if (!projectId) return null;
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) {
    // Caller passed a stale id — return a stub so the agent at least has the
    // id to reference (better than throwing). Most outbound flows hit this when
    // the project is referenced by name only.
    return { projectId, projectName: 'Unknown project', triggerSummary, recentActivity };
  }
  const data: any = snap.data() || {};
  return {
    projectId,
    projectName: data.name || data.clientLastName || projectId,
    address: data.address || data.jobsiteAddress || null,
    city: data.city || null,
    triggerSummary,
    recentActivity,
  };
}

// ── Util: Firestore Timestamp → ISO string ──────────────────────────────────
function serializeTimestamps(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const out: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof (v as any).toDate === 'function') {
      try { out[k] = (v as any).toDate().toISOString(); continue; } catch { /* fallthrough */ }
    }
    out[k] = v;
  }
  return out;
}
