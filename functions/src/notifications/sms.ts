// Shared SMS helpers used by every outbound text path (the notification
// dispatcher + the bid-request / bid-package routes). Two jobs:
//
//   1. toE164() — coerce free-form phone input into the E.164 format Twilio
//      requires. Contacts are entered every which way; Twilio rejects anything
//      that isn't `+18015551234`.
//   2. Opt-out ledger — carriers (and the TCPA) require us to honor STOP. We
//      keep a phone-keyed ledger at `sms_opt_outs/{e164}` written by the inbound
//      STOP webhook, and every sender checks it before texting — even "forced"
//      alerts. Twilio also blocks STOPed numbers at the carrier level, but
//      checking ourselves avoids wasted sends and keeps our own record.

import * as admin from 'firebase-admin';

export const SMS_OPT_OUT_COLLECTION = 'sms_opt_outs';

/**
 * Normalize a free-form phone number to E.164. Defaults to the US/Canada
 * country code (+1) since this is a single-tenant Utah builder. Returns null
 * when the input can't be coerced into a plausible number so the caller can
 * skip + log instead of letting Twilio throw.
 */
export function toE164(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // Already international (kept the +) — trust the digits as-is.
  if (hadPlus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  // Bare 10-digit US number → prepend +1.
  if (digits.length === 10) return `+1${digits}`;
  // 11-digit starting with the US country code.
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // Anything else without a + is ambiguous — refuse rather than mis-send.
  return null;
}

/**
 * True if the given number (raw or E.164) has texted STOP and not since
 * re-subscribed. Best-effort: on a read error we return false (fail open to
 * sending) because the inbound webhook + Twilio's own carrier-level STOP
 * handling are the authoritative guards; a transient Firestore blip shouldn't
 * silently black-hole every alert.
 */
export async function isSmsOptedOut(
  db: admin.firestore.Firestore,
  phone: string | undefined | null,
): Promise<boolean> {
  const e164 = toE164(phone);
  if (!e164) return false;
  try {
    const snap = await db.collection(SMS_OPT_OUT_COLLECTION).doc(e164).get();
    return snap.exists && (snap.data() as any)?.optedOut === true;
  } catch (e) {
    console.warn('[sms] opt-out check failed (failing open):', e);
    return false;
  }
}

// Inbound keyword sets per the carrier/CTIA standard. Twilio's Advanced
// Opt-Out handles these at the carrier level too, but we mirror the state so
// our own senders skip the number and so START re-enables it.
const STOP_KEYWORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt-out']);
const START_KEYWORDS = new Set(['start', 'unstop', 'yes', 'optin', 'opt-in', 'subscribe']);

export type SmsKeyword = 'stop' | 'start' | 'help' | null;

/** Classify an inbound SMS body into a control keyword (or null). */
export function classifySmsKeyword(body: string | undefined | null): SmsKeyword {
  const word = String(body || '').trim().toLowerCase().split(/\s+/)[0] || '';
  if (STOP_KEYWORDS.has(word)) return 'stop';
  if (START_KEYWORDS.has(word)) return 'start';
  if (word === 'help' || word === 'info') return 'help';
  return null;
}

/** Apply a STOP/START to the opt-out ledger. No-op for other keywords. */
export async function applySmsKeyword(
  db: admin.firestore.Firestore,
  phone: string,
  keyword: SmsKeyword,
): Promise<void> {
  const e164 = toE164(phone);
  if (!e164) return;
  const ref = db.collection(SMS_OPT_OUT_COLLECTION).doc(e164);
  if (keyword === 'stop') {
    await ref.set({
      phone: e164,
      optedOut: true,
      optedOutAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } else if (keyword === 'start') {
    await ref.set({
      phone: e164,
      optedOut: false,
      optedInAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}
