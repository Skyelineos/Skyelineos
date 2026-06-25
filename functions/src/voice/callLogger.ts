// Skyeline Homes Voice AI Receptionist — Firestore call log
//
// One doc per Twilio CallSid in `call_logs/`. The inbound webhook creates the
// row, the gather handler updates it as turns happen, and the recording /
// transcription callbacks fill in the recordingUrl + transcript fields once
// Twilio is done with them.
//
// We key the doc id on the CallSid because callbacks reference it later and
// we want idempotent upserts (Twilio retries on 5xx).

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import type { SmsContact } from '../sms/types';
import type {
  CallDisposition,
  CallLog,
  CallTurn,
} from './types';

export const CALL_LOGS = 'call_logs';

/**
 * Create-or-update the call log for a Twilio CallSid. Returns the doc id
 * (always equal to the CallSid for stability across Twilio callbacks).
 *
 * We deliberately use `.set({...}, { merge: true })` so a webhook retry from
 * Twilio doesn't blow away fields written by a later callback.
 */
export async function logCall(
  db: Firestore,
  callSid: string,
  from: string,
  to: string,
  contact: SmsContact | null,
  projectId: string | null,
  aiSummary?: string,
  disposition: CallDisposition = 'IN_PROGRESS',
): Promise<string> {
  if (!callSid) throw new Error('callSid required');
  const ref = db.collection(CALL_LOGS).doc(callSid);
  const snap = await ref.get();
  const now = FieldValue.serverTimestamp();
  const base: any = {
    callSid,
    from,
    to,
    contactId: contact?.id ?? null,
    contactName: contact?.name ?? null,
    contactRole: contact?.role ?? null,
    projectId: projectId ?? null,
    disposition,
    updatedAt: now,
  };
  if (aiSummary) (base as any).aiSummary = aiSummary;
  if (!snap.exists) {
    (base as any).createdAt = now;
    (base as any).turns = [];
    (base as any).actionItems = [];
    (base as any).postProcessed = false;
  }
  await ref.set(base, { merge: true });
  return ref.id;
}

/** Patch a call log with arbitrary fields. Soft-fails on missing docs. */
export async function updateCallLog(
  db: Firestore,
  callSid: string,
  patch: Partial<CallLog>,
): Promise<void> {
  if (!callSid) return;
  const ref = db.collection(CALL_LOGS).doc(callSid);
  await ref.set(
    { ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  ).catch((err) => {
    console.warn('[voice/callLogger] updateCallLog failed:', err?.message);
  });
}

/**
 * Append a conversation turn to the call log. Used by the gather route so the
 * post-call processor + UI both have an in-order record of what was said.
 */
export async function appendTurn(
  db: Firestore,
  callSid: string,
  turn: CallTurn,
): Promise<void> {
  if (!callSid) return;
  const ref = db.collection(CALL_LOGS).doc(callSid);
  try {
    await ref.set(
      {
        turns: FieldValue.arrayUnion({
          ...turn,
          at: new Date().toISOString(),
        }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err: any) {
    console.warn('[voice/callLogger] appendTurn failed:', err?.message);
  }
}

/** Read the current call log (used by callbacks to enrich existing rows). */
export async function getCallLog(
  db: Firestore,
  callSid: string,
): Promise<CallLog | null> {
  if (!callSid) return null;
  const snap = await db.collection(CALL_LOGS).doc(callSid).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as any) } as CallLog;
}

/**
 * Convenience: fire a `notifications/` row so Tyler gets a real-time push when
 * something urgent happens on a call (urgent transfer, escalation, etc.).
 * The notifications collection is the same one the rest of the app uses.
 */
export async function notifyTyler(
  db: Firestore,
  title: string,
  body: string,
  link?: string,
  meta?: Record<string, any>,
): Promise<void> {
  try {
    await db.collection('notifications').add({
      source: 'voice',
      title,
      body,
      link: link || null,
      meta: meta || null,
      // The notification dispatcher already routes to admin/gc roles by
      // default; the voice path always wants Tyler so we tag it explicitly.
      audienceRole: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
    });
  } catch (err: any) {
    console.warn('[voice/callLogger] notifyTyler failed:', err?.message);
  }
}
