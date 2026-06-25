// Skyeline Homes SMS — Rate Limiter (Phase 2)
//
// Per-contact daily caps so a misbehaving sub (or a bug) can't burn through
// Anthropic + Twilio budget overnight. Window resets at local midnight in
// Tyler's timezone (America/Denver / Mountain Time).
//
// Firestore layout:
//
//   sms_rate_limits/{contactId}/daily/{YYYY-MM-DD}
//     {
//       ai_call: number,       // count of AI-backed responses today
//       send:    number,       // count of outbound sends today
//       updatedAt: Timestamp,
//     }
//
// Why two counters?
//   • ai_call protects token spend (Anthropic).
//   • send protects per-message Twilio cost AND spam-perception (a runaway
//     loop sending 200 texts to one sub is a brand catastrophe, even if it's
//     cheap).
//
// All functions are forgiving: a Firestore outage MUST NOT block the inbound
// webhook. On any error we log and return "allowed: true" so legitimate
// traffic flows; the webhook still has its own UNKNOWN fallback.

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// ── Public types ─────────────────────────────────────────────────────────────

export type RateLimitCost = 'ai_call' | 'send';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** ISO string for when the daily window resets (next midnight MT). */
  resetAt: string;
  /** Counter value AFTER this check (i.e. current usage today). */
  used: number;
  /** Cap that applies for this cost type. */
  limit: number;
}

// ── Limits ─────────────────────────────────────────────────────────────────

export const RATE_LIMITS: Record<RateLimitCost, number> = {
  ai_call: 10, // Claude calls per contact per day (Haiku OR Sonnet)
  send: 20,    // Outbound SMS per contact per day
};

const COLLECTION = 'sms_rate_limits';
const SUBCOLLECTION = 'daily';

// Tyler's timezone. We bake this into the date key calculation so "today"
// always means "Tyler's today", not UTC's today.
const TIMEZONE = 'America/Denver';

// ── Date utilities (timezone-aware) ─────────────────────────────────────────

/**
 * Returns YYYY-MM-DD for the current date in Tyler's timezone. Used as the
 * Firestore doc id so we get a fresh window at local midnight without needing
 * a scheduled function to reset counters.
 */
export function currentDateKey(now: Date = new Date()): string {
  // en-CA gives YYYY-MM-DD for any locale tz it supports.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Returns an ISO string for the next midnight in Tyler's timezone. We compute
 * this by walking forward in 1-hour steps until the date-key flips — robust
 * across DST transitions without pulling in a timezone library.
 */
export function nextResetIso(now: Date = new Date()): string {
  const today = currentDateKey(now);
  let cursor = new Date(now.getTime());
  // Walk forward at most 30 hours (DST + safety).
  for (let i = 0; i < 30 * 12; i += 1) {
    cursor = new Date(cursor.getTime() + 5 * 60 * 1000); // 5-minute steps
    if (currentDateKey(cursor) !== today) {
      // Snap back to the minute the date flipped.
      return cursor.toISOString();
    }
  }
  // Shouldn't reach here; fall back to "in 24 hours".
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

// ── Core API ────────────────────────────────────────────────────────────────

/**
 * Inspect (but do not modify) the current usage for `contactId`. Returns
 * `allowed: true` if a future increment would still fit under the cap.
 *
 * Always non-throwing — Firestore failure returns `allowed: true` so a
 * monitoring outage doesn't break inbound replies.
 */
export async function checkRateLimit(
  db: admin.firestore.Firestore,
  contactId: string,
  costType: RateLimitCost,
): Promise<RateLimitResult> {
  const limit = RATE_LIMITS[costType];
  const resetAt = nextResetIso();

  if (!contactId) {
    // Unknown contact — apply send cap by phone hash elsewhere if we want;
    // for now allow.
    return { allowed: true, remaining: limit, resetAt, used: 0, limit };
  }

  try {
    const ref = dailyDocRef(db, contactId);
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const used = Number((data as Record<string, unknown>)[costType] || 0);
    const remaining = Math.max(0, limit - used);
    return {
      allowed: used < limit,
      remaining,
      resetAt,
      used,
      limit,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[rateLimiter/checkRateLimit] Firestore read failed; allowing:', message);
    return { allowed: true, remaining: limit, resetAt, used: 0, limit };
  }
}

/**
 * Atomic +1 on `costType`. Fire-and-forget from the caller's point of view —
 * we wait for the write so the next checkRateLimit reads the new value, but
 * we never throw.
 */
export async function incrementUsage(
  db: admin.firestore.Firestore,
  contactId: string,
  costType: RateLimitCost,
): Promise<void> {
  if (!contactId) return;
  try {
    const ref = dailyDocRef(db, contactId);
    await ref.set(
      {
        [costType]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[rateLimiter/incrementUsage] write failed:', message);
  }
}

/**
 * Atomic check-and-increment in one Firestore transaction. Use when you need
 * "exactly N per day" guarantees (e.g. AI calls). Falls back to a permissive
 * allow on any error.
 */
export async function checkAndIncrement(
  db: admin.firestore.Firestore,
  contactId: string,
  costType: RateLimitCost,
): Promise<RateLimitResult> {
  const limit = RATE_LIMITS[costType];
  const resetAt = nextResetIso();
  if (!contactId) {
    return { allowed: true, remaining: limit, resetAt, used: 0, limit };
  }

  try {
    const ref = dailyDocRef(db, contactId);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() || {}) : {};
      const used = Number((data as Record<string, unknown>)[costType] || 0);
      if (used >= limit) {
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          used,
          limit,
        };
      }
      tx.set(
        ref,
        {
          [costType]: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return {
        allowed: true,
        remaining: Math.max(0, limit - used - 1),
        resetAt,
        used: used + 1,
        limit,
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[rateLimiter/checkAndIncrement] tx failed; allowing:', message);
    return { allowed: true, remaining: limit, resetAt, used: 0, limit };
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

function dailyDocRef(
  db: admin.firestore.Firestore,
  contactId: string,
): admin.firestore.DocumentReference {
  const dateKey = currentDateKey();
  return db
    .collection(COLLECTION)
    .doc(contactId)
    .collection(SUBCOLLECTION)
    .doc(dateKey);
}
