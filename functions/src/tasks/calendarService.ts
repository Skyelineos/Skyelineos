// Google Calendar event stub
// ==========================
//
// The full Calendar REST call is wired up so we can flip
// GOOGLE_CALENDAR_ENABLED=true once Tyler authorizes the OAuth scope tomorrow
// — until then we log + return null and the rest of the task pipeline (SMS,
// Firestore writes) runs unchanged.
//
// Why we don't use the googleapis SDK here:
//   • One REST call per assignment is too thin a wrapper to justify the dep
//     surface, especially since this same `api` Cloud Function already pulls
//     googleapis in via ingestionLab (so we'd be sharing one bloated build).
//   • The token is plumbed in by the caller (sms_contacts → contacts →
//     googleAccessToken field). Refresh-token flow is the caller's job; this
//     function just makes the POST with whatever access token it's handed.
//   • REST surface is stable and the payload is tiny — title, description,
//     and a single-day all-day event. Easy to hand-roll.
//
// Failure modes:
//   • flag off → log "Calendar integration pending OAuth setup" + return null
//   • missing token → log + return null
//   • Google 4xx/5xx → log error + return null (DOES NOT throw)
//   • happy path → return the event id (also logged for traceability)

import type { ProjectTask } from './projectTaskEngine';
import type { Firestore } from 'firebase-admin/firestore';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/**
 * Fetch (and auto-refresh if needed) the server-side Google Calendar access token
 * stored by the ingestionLab OAuth flow at ingestion_lab/config.calendar.
 *
 * Returns null if no connection is stored or refresh fails (caller skips silently).
 */
export async function getServerCalendarToken(db: Firestore): Promise<string | null> {
  try {
    const snap = await db.collection('ingestion_lab').doc('config').get();
    if (!snap.exists) return null;
    const cal = (snap.data() as any)?.calendar;
    if (!cal?.refreshToken) return null;

    const now = Date.now();
    const expiresAt: number =
      typeof cal.expiresAt?.toMillis === 'function'
        ? cal.expiresAt.toMillis()
        : typeof cal.expiresAt === 'number'
        ? cal.expiresAt
        : 0;

    // Return cached access token if still valid (60s buffer).
    if (cal.accessToken && expiresAt > now + 60_000) {
      return cal.accessToken as string;
    }

    // Refresh the access token.
    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) {
      console.warn('[calendarService] GOOGLE_CLIENT_ID/SECRET not set; cannot refresh token');
      return null;
    }
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: cal.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[calendarService] token refresh failed:', res.status, text);
      return null;
    }
    const tokens: any = await res.json();
    const newExpiresAt = now + (tokens.expires_in ?? 3600) * 1_000;
    // Persist refreshed token back to Firestore.
    await db.collection('ingestion_lab').doc('config').set(
      {
        calendar: {
          accessToken: tokens.access_token,
          expiresAt: { toMillis: () => newExpiresAt, seconds: Math.floor(newExpiresAt / 1000), nanoseconds: 0 },
          refreshToken: tokens.refresh_token ?? cal.refreshToken,
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true },
    );
    return tokens.access_token as string;
  } catch (err: any) {
    console.error('[calendarService] getServerCalendarToken error:', err?.message);
    return null;
  }
}

interface GoogleCalendarEventResponse {
  id?: string;
  htmlLink?: string;
  error?: { code?: number; message?: string };
}

/**
 * Create a Google Calendar event for a project task.
 *
 *   • When GOOGLE_CALENDAR_ENABLED !== 'true' → no-op, returns null.
 *   • When the access token is empty → no-op, returns null.
 *   • Network/auth failures are caught and logged; we never throw.
 *
 * The returned event id is the Calendar event id (Google's id, not Firestore's).
 * Caller is responsible for stashing it onto the project_tasks doc if desired.
 */
export async function createTaskCalendarEvent(
  task: ProjectTask,
  assigneeEmail: string,
  googleAccessToken: string,
  db?: Firestore,
): Promise<string | null> {
  const flag = (process.env.GOOGLE_CALENDAR_ENABLED || '').trim().toLowerCase();
  if (flag !== 'true') {
    console.info('[calendarService] Calendar integration pending OAuth setup; skipping (set GOOGLE_CALENDAR_ENABLED=true to enable)');
    return null;
  }
  // Resolve token: prefer per-contact token, fall back to server-side calendar connection.
  let resolvedToken = googleAccessToken;
  if (!resolvedToken && db) {
    const serverToken = await getServerCalendarToken(db);
    if (serverToken) {
      resolvedToken = serverToken;
      console.info('[calendarService] using server-side calendar token (no per-contact token)');
    }
  }
  if (!resolvedToken) {
    console.info('[calendarService] no calendar token available; skipping event creation');
    return null;
  }
  if (!task.endDate && !task.startDate) {
    console.warn('[calendarService] task has no start/end date; skipping');
    return null;
  }
  if (!assigneeEmail) {
    console.warn('[calendarService] no assignee email; skipping');
    return null;
  }

  // Build an all-day event. Google's all-day event format requires
  // YYYY-MM-DD strings (no timezone) on `start.date` / `end.date`, and
  // `end.date` must be the day *after* the last event day.
  const startIso = task.endDate || task.startDate!;
  const startDay = startIso.slice(0, 10);
  const endDayMs = new Date(startIso).getTime() + 24 * 60 * 60 * 1000;
  const endDay = new Date(endDayMs).toISOString().slice(0, 10);

  const appBaseUrl = (process.env.APP_BASE_URL || 'https://skyelineos.web.app').replace(/\/$/, '');
  const projectLabel = task.projectId
    ? `${appBaseUrl}/projects/${task.projectId}/overview`
    : appBaseUrl;

  const description = [
    `Task: ${task.name}`,
    `Phase: ${task.phase}`,
    `Trade: ${task.trade}`,
    task.checklistItems?.length ? `Checklist:\n- ${task.checklistItems.join('\n- ')}` : null,
    `\nOpen in Skyeline: ${projectLabel}`,
  ].filter(Boolean).join('\n');

  const eventBody = {
    summary: `${task.name} — ${task.projectId || 'project'}`,
    description,
    start: { date: startDay },
    end: { date: endDay },
    attendees: [{ email: assigneeEmail }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'email', minutes: 24 * 60 },
      ],
    },
  };

  try {
    const resp = await fetch(CALENDAR_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resolvedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    });
    const json = (await resp.json()) as GoogleCalendarEventResponse;
    if (!resp.ok || json.error) {
      console.error('[calendarService] Google Calendar create failed:', resp.status, json.error?.message || JSON.stringify(json));
      return null;
    }
    if (json.id) {
      console.info(`[calendarService] created calendar event ${json.id} for task ${task.id}`);
      return json.id;
    }
    return null;
  } catch (err: any) {
    console.error('[calendarService] network error creating calendar event:', err?.message || err);
    return null;
  }
}
