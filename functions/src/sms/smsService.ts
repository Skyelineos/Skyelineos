// Skyeline Homes SMS Agent — Twilio Service (Phase 1)
//
// One module owns every Twilio interaction so the rest of the agent never
// imports the SDK directly:
//
//   • sendSms(...)            — outbound Twilio REST send + Firestore logging
//   • parseInbound(req)       — parse Twilio's form-urlencoded webhook body
//   • verifyTwilioSignature   — validate the X-Twilio-Signature header (CSRF)
//   • logMessage(...)         — append an sms_messages doc + upsert thread
//   • upsertThread(...)       — find-or-create sms_threads/{id} for a contact
//
// Twilio creds come from Secret Manager (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
// TWILIO_FROM_NUMBER). The existing notification dispatcher already binds those
// secrets to the `api` function (see functions/src/index.ts), so this module
// reads them via process.env at runtime.

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import twilio from 'twilio';
import type { Request } from 'express';
import { toE164, isSmsOptedOut } from '../notifications/sms';
import type {
  SmsContact,
  SmsMessage,
  SmsThread,
  SmsDirection,
  SmsStatus,
  OutboundType,
} from './types';

const SMS_MESSAGES = 'sms_messages';
const SMS_THREADS  = 'sms_threads';
const SMS_CONTACTS = 'sms_contacts';

// Identifying header the agent prepends so every outbound is unambiguously
// "from the assistant" — required by the build spec. Kept short so the visible
// body still fits in a single 160-char SMS segment most of the time.
//
// Skipped for messages whose body already starts with "Skyeline" (rare, but
// covers Tyler typing a manual message that begins with the brand) and for
// STOP/HELP carrier responses (handled separately).
const AGENT_BRAND_PREFIX = 'Skyeline Homes Assistant: ';

function withBrand(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return trimmed;
  if (/^skyeline\b/i.test(trimmed)) return trimmed;
  return `${AGENT_BRAND_PREFIX}${trimmed}`;
}

// ── Twilio signature validation ──────────────────────────────────────────────
// Twilio signs every webhook with HMAC-SHA1 of the URL + sorted form params
// using the auth token. We verify before doing anything stateful so a public
// /api/sms/webhook can't be spammed by anyone with the URL.
//
// `req.body` here is the parsed urlencoded form (express.urlencoded). We pass
// it through twilio.validateRequest, which re-serializes it the same way
// Twilio did when signing.
export function verifyTwilioSignature(req: Request): boolean {
  const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  // Local emulator / unit-test bypass: when there's no token bound, skip the
  // check. The route layer still refuses to log anything in that path.
  if (!authToken) return true;
  const signature = String(req.headers['x-twilio-signature'] || '');
  if (!signature) return false;

  // Reconstruct the exact URL Twilio used to sign. Cloud Functions sits behind
  // Hosting rewrites, so `req.protocol` is sometimes "http" even though the
  // public URL is https. Prefer the explicit TWILIO_WEBHOOK_URL when set so
  // signature validation lines up with Twilio's view of the world; fall back
  // to the host header otherwise.
  //
  // NOTE TO OPERATOR: set TWILIO_WEBHOOK_URL once the public URL is finalized
  // (e.g. https://skyelineos.web.app/api/sms/webhook). Without it we use the
  // host header, which works as long as Hosting doesn't rewrite the path.
  const configured = (process.env.TWILIO_WEBHOOK_URL || '').trim();
  const url = configured || `https://${req.get('host')}${req.originalUrl}`;
  try {
    return twilio.validateRequest(authToken, signature, url, req.body || {});
  } catch (e) {
    console.error('[sms-service] signature validation threw:', e);
    return false;
  }
}

// ── Inbound parsing ──────────────────────────────────────────────────────────
export interface InboundSmsPayload {
  from: string;       // E.164 (Twilio always sends in E.164)
  to: string;         // E.164
  body: string;
  messageSid: string;
  numMedia: number;
  // The raw form for callers that want to dig further (media URLs, etc.).
  raw: Record<string, string>;
}

export function parseInbound(req: Request): InboundSmsPayload {
  const body = (req.body || {}) as Record<string, string>;
  return {
    from: String(body.From || '').trim(),
    to: String(body.To || '').trim(),
    body: String(body.Body || ''),
    messageSid: String(body.MessageSid || body.SmsMessageSid || ''),
    numMedia: Number(body.NumMedia || 0) || 0,
    raw: body,
  };
}

// ── Firestore helpers ────────────────────────────────────────────────────────

/**
 * Find an SMS contact by phone number. Tries `sms_contacts` first; falls back
 * to the canonical `contacts/` collection (Tyler's existing CRM) so the agent
 * can match someone who's never been texted before but is already known to
 * the company.
 */
export async function findContactByPhone(
  db: admin.firestore.Firestore,
  phone: string,
): Promise<SmsContact | null> {
  const e164 = toE164(phone);
  if (!e164) return null;
  const direct = await db.collection(SMS_CONTACTS).where('phoneNumber', '==', e164).limit(1).get();
  if (!direct.empty) {
    const d = direct.docs[0];
    return { id: d.id, ...(d.data() as any) } as SmsContact;
  }
  // Best-effort fallback to the main contacts collection. We don't write a new
  // sms_contacts row here — that's the staff's call (the contact card in the
  // UI will offer "Add to SMS roster") — but we synthesize one for the agent.
  try {
    const last10 = e164.replace(/\D/g, '').slice(-10);
    const snap = await db.collection('contacts').limit(2000).get();
    for (const d of snap.docs) {
      const data: any = d.data();
      const candidate = toE164(data.phone || data.phoneNumber || data.mobile || '');
      if (candidate && candidate.endsWith(last10)) {
        return {
          id: d.id,
          name: data.name || 'Unknown',
          phoneNumber: candidate,
          role: inferRoleFromContact(data),
          preferredLanguage: data.preferredLanguage === 'es' ? 'es' : 'en',
          projectIds: Array.isArray(data.associatedProjects) ? data.associatedProjects : [],
          trade: data.trade || data.trades?.[0] || null,
          notes: null,
          linkedContactId: d.id,
          createdBy: data.createdBy || 'system',
        } as SmsContact;
      }
    }
  } catch (e) {
    console.warn('[sms-service] contacts fallback failed', e);
  }
  return null;
}

function inferRoleFromContact(data: any): SmsContact['role'] {
  const v = String(data.role || data.type || '').toLowerCase().trim();
  if (v === 'client' || v === 'homeowner') return 'CLIENT';
  if (v === 'sub' || v === 'subcontractor') return 'SUB';
  if (v === 'vendor' || v === 'supplier') return 'VENDOR';
  if (v === 'admin' || v === 'gc' || v === 'projectmanager' || v === 'staff') return 'INTERNAL';
  return 'SUB'; // safest default: subs are the highest-volume inbound
}

/**
 * Find-or-create the conversation thread for (contact, project). Project is
 * optional; when null, all of the contact's project-less messages share one
 * thread. The thread is the unit the agent loads context from when drafting
 * replies (see messagingAgent.ts).
 */
export async function upsertThread(
  db: admin.firestore.Firestore,
  contactId: string,
  projectId: string | null,
  preview: string,
  direction: SmsDirection,
): Promise<string> {
  const q = db.collection(SMS_THREADS)
    .where('contactId', '==', contactId)
    .where('projectId', '==', projectId ?? null)
    .limit(1);
  const snap = await q.get();
  const now = FieldValue.serverTimestamp();
  const update = {
    lastMessageAt: now,
    lastMessagePreview: preview.slice(0, 240),
    lastDirection: direction,
    // Inbound bumps unreadCount; outbound resets it (Tyler just replied).
    unreadCount: direction === 'inbound'
      ? FieldValue.increment(1)
      : 0,
  };
  if (!snap.empty) {
    const ref = snap.docs[0].ref;
    await ref.update(update as any);
    return ref.id;
  }
  const ref = await db.collection(SMS_THREADS).add({
    contactId,
    projectId: projectId ?? null,
    ...update,
    unreadCount: direction === 'inbound' ? 1 : 0,
    createdAt: now,
  });
  return ref.id;
}

/**
 * Append an `sms_messages` doc. Returns the new doc id. Caller is responsible
 * for having E.164-normalized the numbers (we don't silently fix bad input
 * because that masks bugs upstream).
 */
export async function logMessage(
  db: admin.firestore.Firestore,
  msg: Omit<SmsMessage, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await db.collection(SMS_MESSAGES).add({
    ...msg,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

// ── Outbound send ────────────────────────────────────────────────────────────

export interface SendSmsOptions {
  to: string;                    // E.164 or anything toE164() can normalize
  body: string;
  contactId?: string | null;
  projectId?: string | null;
  generatedByAi?: boolean;
  outboundType?: OutboundType | null;
  // Skip the agent brand prefix. Use sparingly — every Phase 1 outbound is
  // supposed to identify itself.
  skipBrandPrefix?: boolean;
  // Override the From number (rare — multi-number setups). Defaults to
  // TWILIO_FROM_NUMBER from Secret Manager.
  fromOverride?: string;
}

export interface SendSmsResult {
  ok: boolean;
  messageId?: string;            // sms_messages/{id}
  twilioSid?: string;
  threadId?: string;
  skipped?: 'opted_out' | 'invalid_number' | 'no_credentials';
  error?: string;
}

export async function sendSms(
  db: admin.firestore.Firestore,
  opts: SendSmsOptions,
): Promise<SendSmsResult> {
  const sid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const from = (opts.fromOverride || process.env.TWILIO_FROM_NUMBER || '').trim();
  const to = toE164(opts.to);
  const body = opts.skipBrandPrefix ? opts.body.trim() : withBrand(opts.body);

  if (!to) {
    return { ok: false, skipped: 'invalid_number', error: `Invalid recipient: "${opts.to}"` };
  }
  if (!sid || !token || !from) {
    // Log the attempt anyway so the staff UI shows the draft. Status='failed'.
    const messageId = await logMessage(db, {
      direction: 'outbound',
      fromNumber: from || 'unknown',
      toNumber: to,
      body,
      twilioSid: null,
      contactId: opts.contactId ?? null,
      projectId: opts.projectId ?? null,
      status: 'failed',
      generatedByAi: !!opts.generatedByAi,
      outboundType: opts.outboundType ?? null,
      errorMessage: 'Twilio credentials not bound to function',
    });
    return { ok: false, messageId, skipped: 'no_credentials', error: 'Twilio creds missing' };
  }

  if (await isSmsOptedOut(db, to)) {
    const messageId = await logMessage(db, {
      direction: 'outbound',
      fromNumber: from,
      toNumber: to,
      body,
      twilioSid: null,
      contactId: opts.contactId ?? null,
      projectId: opts.projectId ?? null,
      status: 'undelivered',
      generatedByAi: !!opts.generatedByAi,
      outboundType: opts.outboundType ?? null,
      errorMessage: 'Recipient previously texted STOP',
    });
    return { ok: false, messageId, skipped: 'opted_out', error: 'Recipient opted out' };
  }

  // 1600 chars (~10 segments) is Twilio's hard cap on a single REST call.
  // Tyler's agent should never go anywhere near that — but trim to be safe.
  const safeBody = body.slice(0, 1500);

  try {
    const client = twilio(sid, token);
    const sent = await client.messages.create({ to, from, body: safeBody });
    const status = mapTwilioStatus(sent.status);
    const messageId = await logMessage(db, {
      direction: 'outbound',
      fromNumber: from,
      toNumber: to,
      body: safeBody,
      twilioSid: sent.sid,
      contactId: opts.contactId ?? null,
      projectId: opts.projectId ?? null,
      status,
      generatedByAi: !!opts.generatedByAi,
      outboundType: opts.outboundType ?? null,
    });

    let threadId: string | undefined;
    if (opts.contactId) {
      threadId = await upsertThread(db, opts.contactId, opts.projectId ?? null, safeBody, 'outbound');
      // Backfill threadId on the message we just logged.
      await db.collection(SMS_MESSAGES).doc(messageId).update({ threadId });
    }

    return { ok: true, messageId, twilioSid: sent.sid, threadId };
  } catch (e: any) {
    const errMsg = e?.message || String(e);
    const messageId = await logMessage(db, {
      direction: 'outbound',
      fromNumber: from,
      toNumber: to,
      body: safeBody,
      twilioSid: null,
      contactId: opts.contactId ?? null,
      projectId: opts.projectId ?? null,
      status: 'failed',
      generatedByAi: !!opts.generatedByAi,
      outboundType: opts.outboundType ?? null,
      errorMessage: errMsg,
    });
    console.error('[sms-service] Twilio send failed', errMsg);
    return { ok: false, messageId, error: errMsg };
  }
}

function mapTwilioStatus(s: string | undefined | null): SmsStatus {
  switch (String(s || '').toLowerCase()) {
    case 'accepted':
    case 'queued':       return 'queued';
    case 'sending':      return 'sending';
    case 'sent':         return 'sent';
    case 'delivered':    return 'delivered';
    case 'undelivered':  return 'undelivered';
    case 'failed':       return 'failed';
    case 'received':     return 'received';
    default:             return 'queued';
  }
}

/**
 * Convenience: load a thread + its messages (chronological) so the agent can
 * build prompt context. Limited to the most recent N messages to keep the
 * Claude call cheap.
 */
export async function loadThread(
  db: admin.firestore.Firestore,
  threadId: string,
  limit = 30,
): Promise<{ thread: SmsThread | null; messages: SmsMessage[] }> {
  const tSnap = await db.collection(SMS_THREADS).doc(threadId).get();
  const thread = tSnap.exists ? ({ id: tSnap.id, ...(tSnap.data() as any) } as SmsThread) : null;
  const msgs = await db.collection(SMS_MESSAGES)
    .where('threadId', '==', threadId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  const messages = msgs.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) } as SmsMessage))
    .reverse();
  return { thread, messages };
}

export const SMS_COLLECTIONS = {
  messages: SMS_MESSAGES,
  threads: SMS_THREADS,
  contacts: SMS_CONTACTS,
};
