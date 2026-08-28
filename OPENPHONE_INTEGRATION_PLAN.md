# OpenPhone → Skyeline OS Integration Plan

**Status:** Ready to implement  
**Author:** AI subagent scope (2026-08-24)  
**Estimated effort:** ~1 day of focused work (3 new backend files, 2 UI components, 1 UI enhancement)

---

## Context & Key Findings

### Existing Voice Infrastructure (Twilio)
The codebase already has a mature voice stack under `functions/src/voice/`:
- `voiceRoutes.ts` — Twilio inbound call webhooks (TwiML-based)
- `callLogger.ts` — Firestore CRUD for `call_logs/` collection
- `postCallProcessor.ts` — Claude-based transcript extraction → tasks, notifications, `communications/{projectId}/events`
- `types.ts` — `CallLog`, `CallTurn`, `CallSentiment`, `CallDisposition`

**OpenPhone sits alongside this** — it's a separate phone provider that fires JSON webhooks when a call ends. We are **not** replacing the Twilio voice AI; we're adding a second inbound path that reuses the same `call_logs` collection and post-call processing pipeline.

### Phone Matching Pattern
The SMS system uses `sms_contacts` (E.164 `phoneNumber` field) via `findContactByPhone()`. The `contacts` Firestore collection also has a `phone` field. OpenPhone matching should check **both**, exactly as the SMS/voice system does.

### Communication Surface
- `call_logs/{callSid}` — per-call Firestore doc (already exists for Twilio calls)
- `communications/{projectId}/events` — project activity events (already written by `postCallProcessor.ts`)
- `notifications/` — push notifications (already consumed by `ProjectActivityFeed.tsx`)
- `project_tasks/` — action items extracted by Claude (already created by `postCallProcessor.ts`)

**The plan reuses all of these.** OpenPhone calls will appear in every place Twilio calls already appear.

---

## OpenPhone Webhook Event Shape

OpenPhone fires a `call.completed` event via HTTP POST with JSON body:

```json
{
  "type": "call.completed",
  "apiVersion": "v3",
  "object": "event",
  "createdAt": "2026-08-24T15:30:00.000Z",
  "data": {
    "object": {
      "id": "CA_abc123",
      "object": "call",
      "createdAt": "2026-08-24T15:25:00.000Z",
      "completedAt": "2026-08-24T15:30:00.000Z",
      "direction": "incoming",
      "duration": 287,
      "from": "+18015550123",
      "to": "+13852334688",
      "status": "completed",
      "phoneNumberId": "PN_abc",
      "userId": "US_abc",
      "recording": {
        "id": "RE_abc",
        "url": "https://api.openphone.com/v1/recordings/RE_abc",
        "duration": 287
      },
      "transcript": {
        "dialogue": [
          { "speaker": "user", "content": "Hey Tyler, just checking on the drywall schedule..." },
          { "speaker": "agent", "content": "Of course, let me look that up..." }
        ],
        "summary": "Client called about drywall schedule for Christensen project."
      }
    }
  }
}
```

**Verification:** OpenPhone signs webhooks with HMAC-SHA256. The signature is in the `openphone-signature` header as `t=<timestamp>,v1=<hmac>`. Compute `HMAC-SHA256(secret, "${timestamp}.${rawBody}")` and compare.

---

## Files to Create / Modify

### New Files (Backend — `functions/src/openphone/`)

```
functions/src/openphone/
  types.ts          — OpenPhone event shapes (TypeScript interfaces)
  webhookRoute.ts   — POST /api/openphone/webhook (public, HMAC-gated)
  phoneMapper.ts    — Phone number → contact/project resolver
```

### New Files (Frontend — `client/src/`)

```
client/src/components/voice/
  CallLogPanel.tsx          — Read-only call log list (staff view)
  CallTranscriptDrawer.tsx  — Slide-over showing full transcript + summary
```

### Modified Files

```
functions/src/index.ts                             — register OpenPhone route
client/src/components/projects/ProjectActivityFeed.tsx  — render voice_call events
```

---

## Implementation — Step by Step

---

### Step 1: `functions/src/openphone/types.ts`

```typescript
// OpenPhone webhook event types for Skyeline OS.
// Matches OpenPhone API v3 (2025+).

export interface OpenPhoneDialogueTurn {
  speaker: 'user' | 'agent';
  content: string;
}

export interface OpenPhoneTranscript {
  dialogue: OpenPhoneDialogueTurn[];
  summary?: string;
}

export interface OpenPhoneRecording {
  id: string;
  url: string;
  duration?: number;
}

export interface OpenPhoneCallObject {
  id: string;                   // OpenPhone call ID (used as doc key, analogous to Twilio CallSid)
  object: 'call';
  createdAt: string;            // ISO 8601
  completedAt: string;          // ISO 8601
  direction: 'incoming' | 'outgoing';
  duration: number;             // seconds
  from: string;                 // E.164 caller number
  to: string;                   // E.164 called number (Skyeline's OpenPhone number)
  status: 'completed' | 'missed' | 'voicemail' | string;
  phoneNumberId: string;
  userId?: string;              // OpenPhone user who handled the call (staff)
  recording?: OpenPhoneRecording | null;
  transcript?: OpenPhoneTranscript | null;
}

export interface OpenPhoneCallCompletedEvent {
  type: 'call.completed';
  apiVersion: string;
  object: 'event';
  createdAt: string;
  data: {
    object: OpenPhoneCallObject;
  };
}

// Full discriminated union — extend when we handle more event types
export type OpenPhoneEvent = OpenPhoneCallCompletedEvent;
```

---

### Step 2: `functions/src/openphone/phoneMapper.ts`

Reuses the same multi-collection phone lookup the SMS + Twilio voice system uses.

```typescript
import type { Firestore } from 'firebase-admin/firestore';
import { findContactByPhone } from '../sms/smsService';
import type { SmsContact } from '../sms/types';

/**
 * Resolve an E.164 phone number to a contact + best-guess project.
 *
 * Priority:
 *   1. sms_contacts (has projectIds[] — best for project routing)
 *   2. contacts collection (canonical CRM, has phone field)
 *
 * Returns null when the number is unknown (unregistered caller).
 */
export async function resolvePhoneNumber(
  db: Firestore,
  phone: string,
): Promise<{ contact: SmsContact | null; projectId: string | null; projectName: string | null }> {
  // 1. SMS contacts (already has project association)
  const smsContact = await findContactByPhone(db, phone).catch(() => null);
  if (smsContact) {
    const projectId = smsContact.projectIds?.[0] ?? null;
    let projectName: string | null = null;
    if (projectId) {
      const snap = await db.collection('projects').doc(projectId).get().catch(() => null);
      if (snap?.exists) {
        const d = snap.data() as any;
        projectName = d.name || d.clientLastName || projectId;
      }
    }
    return { contact: smsContact, projectId, projectName };
  }

  // 2. Canonical contacts collection (phone field, may have associatedProjects)
  const normalizedPhone = phone.replace(/\D/g, '');
  try {
    const snap = await db.collection('contacts')
      .where('phone', '==', phone)
      .limit(1)
      .get();
    // Also try without leading +1 if E.164 didn't match
    const snap2 = snap.empty
      ? await db.collection('contacts')
          .where('phone', '==', normalizedPhone)
          .limit(1)
          .get()
      : snap;
    if (!snap2.empty) {
      const d = snap2.docs[0].data() as any;
      // Build a minimal SmsContact-shaped object for downstream compatibility
      const contact: SmsContact = {
        id: snap2.docs[0].id,
        name: `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.name || 'Unknown',
        phoneNumber: phone,
        role: d.type === 'client' ? 'CLIENT' : d.type === 'subcontractor' ? 'SUB' : 'INTERNAL',
        preferredLanguage: 'en',
        projectIds: Array.isArray(d.associatedProjects) ? d.associatedProjects : [],
        createdBy: 'contacts-sync',
      };
      const projectId = contact.projectIds[0] ?? null;
      let projectName: string | null = null;
      if (projectId) {
        const pSnap = await db.collection('projects').doc(projectId).get().catch(() => null);
        if (pSnap?.exists) {
          const pd = pSnap.data() as any;
          projectName = pd.name || pd.clientLastName || projectId;
        }
      }
      return { contact, projectId, projectName };
    }
  } catch (err: any) {
    console.warn('[openphone/phoneMapper] contacts lookup failed:', err?.message);
  }

  return { contact: null, projectId: null, projectName: null };
}
```

---

### Step 3: `functions/src/openphone/webhookRoute.ts`

This is the main entry point. Follows the exact same structure as `sms/routes.ts` and `qbo/webhookRoute.ts`.

```typescript
// Skyeline Homes — OpenPhone webhook handler
//
// Registered PUBLIC (before /api auth middleware) at:
//   POST /api/openphone/webhook
//
// OpenPhone fires call.completed events when a call ends. We:
//   1. Verify the HMAC-SHA256 signature
//   2. Match the caller's phone to sms_contacts / contacts
//   3. Write a call_logs/{callId} doc (same collection as Twilio calls)
//   4. Flatten the OpenPhone transcript into the same shape as Twilio's
//   5. Run processCallTranscript() — existing Claude extractor
//      which fans out to: project_tasks, notifications, communications/{projectId}/events

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { resolvePhoneNumber } from './phoneMapper';
import { processCallTranscript } from '../voice/postCallProcessor';
import type { OpenPhoneCallCompletedEvent, OpenPhoneEvent } from './types';
import type { CallDisposition } from '../voice/types';

const COLLECTION = 'call_logs';

// ── Signature verification ──────────────────────────────────────────────────
// OpenPhone sends: openphone-signature: t=<unix_ms>,v1=<hex_hmac>
// HMAC input: `${timestamp}.${rawBody}`
// Secret: OPENPHONE_WEBHOOK_SECRET env var

function verifyOpenPhoneSignature(req: Request): boolean {
  const secret = (process.env.OPENPHONE_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    // Dev bypass — log prominently so it's not forgotten
    console.warn('[openphone/webhook] OPENPHONE_WEBHOOK_SECRET not set — skipping signature check');
    return true;
  }

  const header = String(req.headers['openphone-signature'] || '');
  // Format: t=<ts>,v1=<hmac>
  const parts = Object.fromEntries(
    header.split(',').map((s) => s.split('=') as [string, string]),
  );
  const timestamp = parts['t'];
  const receivedHmac = parts['v1'];

  if (!timestamp || !receivedHmac) {
    console.warn('[openphone/webhook] missing signature header parts');
    return false;
  }

  // Replay protection: reject webhooks older than 5 minutes
  const age = Date.now() - Number(timestamp);
  if (age > 5 * 60 * 1000) {
    console.warn(`[openphone/webhook] stale webhook age=${age}ms`);
    return false;
  }

  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(receivedHmac, 'hex'),
  );
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerOpenPhoneWebhookRoute(app: Express, db: Firestore): void {
  app.post('/api/openphone/webhook', async (req: Request, res: Response) => {
    // Respond 200 immediately — OpenPhone retries on non-2xx
    res.status(200).json({ received: true });

    try {
      if (!verifyOpenPhoneSignature(req)) {
        console.warn('[openphone/webhook] signature invalid — dropping');
        return;
      }

      const event = req.body as OpenPhoneEvent;

      if (event.type !== 'call.completed') {
        // Future: handle call.ringing, message.received, etc.
        console.info(`[openphone/webhook] ignoring event type: ${event.type}`);
        return;
      }

      await handleCallCompleted(db, event);
    } catch (err: any) {
      console.error('[openphone/webhook] unhandled error:', err?.message);
    }
  });
}

// ── call.completed handler ──────────────────────────────────────────────────

async function handleCallCompleted(db: Firestore, event: OpenPhoneCallCompletedEvent): Promise<void> {
  const call = event.data.object;
  const callId = call.id;           // e.g. "CA_abc123"
  const from = call.from;           // caller E.164
  const to = call.to;               // Skyeline's number

  console.info(`[openphone/webhook] call.completed id=${callId} from=${from} duration=${call.duration}s`);

  // 1. Resolve caller → contact + project
  const { contact, projectId, projectName } = await resolvePhoneNumber(db, from);

  // 2. Flatten OpenPhone transcript to a plain string (same shape Twilio's
  //    transcription-complete callback produces)
  const transcript = flattenTranscript(call.transcript);

  // 3. Determine disposition from call status + transcript presence
  const disposition: CallDisposition = resolveDisposition(call.status, transcript);

  // 4. Write call_logs/{callId} — same collection as Twilio calls so the
  //    admin UI doesn't need two separate queries
  const ref = db.collection(COLLECTION).doc(callId);
  await ref.set(
    {
      callSid: callId,          // keep field name consistent with Twilio shape
      source: 'openphone',      // NEW field: distinguishes from Twilio entries
      from,
      to,
      direction: call.direction,
      duration: call.duration ?? null,
      contactId: contact?.id ?? null,
      contactName: contact?.name ?? null,
      contactRole: contact?.role ?? null,
      projectId: projectId ?? null,
      projectName: projectName ?? null,
      disposition,
      recordingUrl: call.recording?.url ?? null,
      recordingDuration: call.recording?.duration ?? null,
      transcript: transcript || null,
      // OpenPhone may include an AI summary directly — store it raw
      openPhoneSummary: call.transcript?.summary ?? null,
      aiSummary: call.transcript?.summary ?? null,   // pre-fill for UI display
      actionItems: [],
      sentiment: null,
      postProcessed: false,
      turns: buildTurns(call.transcript),
      createdAt: admin.firestore.Timestamp.fromDate(new Date(call.createdAt)),
      completedAt: admin.firestore.Timestamp.fromDate(new Date(call.completedAt)),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  console.info(`[openphone/webhook] call_logs/${callId} written`);

  // 5. Run the existing Claude post-call processor — handles:
  //    - AI summary + sentiment extraction
  //    - project_tasks creation
  //    - urgent/negative notifications
  //    - communications/{projectId}/events write
  if (transcript && transcript.trim()) {
    await processCallTranscript(db, callId, transcript).catch((err: any) =>
      console.error('[openphone/webhook] processCallTranscript failed:', err?.message),
    );
  } else {
    // No transcript — mark processed so the UI doesn't show a stale spinner
    await ref.set({ postProcessed: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Flatten OpenPhone's structured dialogue into a plain transcript string.
 * Format: "Tyler: Hey, checking on drywall...\nClient: Yeah, we're good..."
 * Falls back to the summary string when dialogue is empty.
 */
function flattenTranscript(t?: OpenPhoneCallCompletedEvent['data']['object']['transcript'] | null): string {
  if (!t) return '';
  if (Array.isArray(t.dialogue) && t.dialogue.length > 0) {
    return t.dialogue
      .map((turn) => {
        const speakerLabel = turn.speaker === 'agent' ? 'Tyler' : 'Client';
        return `${speakerLabel}: ${turn.content}`;
      })
      .join('\n');
  }
  // OpenPhone may send summary only for short/missed calls
  return t.summary || '';
}

/**
 * Map OpenPhone call status to our CallDisposition enum.
 */
function resolveDisposition(status: string, transcript: string): CallDisposition {
  switch (status) {
    case 'completed': return transcript ? 'ANSWERED_BY_AI' : 'MISSED';
    case 'missed': return 'MISSED';
    case 'voicemail': return 'VOICEMAIL';
    default: return 'MISSED';
  }
}

/**
 * Convert OpenPhone dialogue turns to the existing CallTurn[] shape so the
 * call detail UI works without changes.
 */
function buildTurns(t?: OpenPhoneCallCompletedEvent['data']['object']['transcript'] | null): import('../voice/types').CallTurn[] {
  if (!t?.dialogue) return [];
  return t.dialogue.map((d) => ({
    speaker: d.speaker === 'agent' ? 'assistant' : 'caller',
    text: d.content,
  }));
}
```

> **Important:** Express needs access to the raw body for HMAC. Add `rawBody` capture to the JSON middleware in `index.ts` if not already present (see Step 4).

---

### Step 4: Register the route — `functions/src/index.ts`

Find the block where public webhooks are registered (before the `/api` auth middleware):

```typescript
// EXISTING lines (for reference):
import { registerVoiceRoutes }          from './voice/voiceRoutes';
registerVoiceRoutes(app, admin.firestore());

// ADD these two lines immediately after:
import { registerOpenPhoneWebhookRoute } from './openphone/webhookRoute';
registerOpenPhoneWebhookRoute(app, admin.firestore()); // POST /api/openphone/webhook
```

Also verify the JSON body-parser captures `rawBody`. In `index.ts`, find the `express.json()` call and make it:

```typescript
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
```

This is needed for HMAC signature verification.

---

### Step 5: Set the environment secret

In Firebase Functions config:

```bash
# Set the webhook signing secret from OpenPhone dashboard
firebase functions:secrets:set OPENPHONE_WEBHOOK_SECRET

# Then add to functions/src/config/index.ts or ensure it's read via process.env
```

In OpenPhone dashboard:
- **Settings → Webhooks → Add endpoint**
- URL: `https://api-mtph34upva-uc.a.run.app/api/openphone/webhook`
- Events: `call.completed` (add `call.missed` later if desired)
- Copy the signing secret → `OPENPHONE_WEBHOOK_SECRET`

---

## Firestore Schema Changes

### Existing: `call_logs/{callId}`

No schema migration needed. We extend the existing collection with two new fields:

| Field | Type | Notes |
|---|---|---|
| `source` | `'twilio' \| 'openphone'` | **NEW** — allows filtering by provider |
| `openPhoneSummary` | `string \| null` | **NEW** — raw OpenPhone AI summary (before Claude enrichment) |
| `direction` | `'incoming' \| 'outgoing'` | **NEW** — OpenPhone provides this |
| `completedAt` | `Timestamp` | **NEW** — OpenPhone provides exact completion time |

All other fields (`callSid`, `from`, `to`, `contactId`, `projectId`, `transcript`, `aiSummary`, `actionItems`, `sentiment`, `turns`, `postProcessed`, `recordingUrl`) are already in the existing `CallLog` type.

### Existing: `communications/{projectId}/events`

Written by `processCallTranscript()`. Already handles `type: 'voice_call'` events. No changes needed.

### Existing: `project_tasks/`

Written by `processCallTranscript()`. Tagged with `source: 'voice'`. No changes needed — OpenPhone-sourced tasks will appear alongside Twilio-sourced tasks automatically.

---

## UI Changes

### 5a. `ProjectActivityFeed.tsx` — add voice_call event rendering

The feed currently reads from `notifications` collection. `postCallProcessor.ts` already writes to `communications/{projectId}/events` for voice calls — but the feed doesn't read from that sub-collection yet. **Two options:**

**Option A (recommended — least work):** The `processCallTranscript()` already fires a `notifications` doc. Update `ProjectActivityFeed.tsx` to recognize `voice_call` trigger type:

```typescript
// In iconFor():
if (k.includes('voice') || k.includes('call')) return PhoneCall; // from lucide-react

// In hrefFor():
if (t.includes('voice') || t.includes('call'))
  return `/projects/${projectId}/calls`;
```

Add a display label in the feed item:
```typescript
// In the feed label render:
if (type === 'voice_call') {
  return `📞 ${n.fromUserName || 'Client'} called: ${n.message || n.body || 'view transcript'}`;
}
```

**Option B (richer):** Add a dedicated "Calls" tab to the project detail page (see 5b).

---

### 5b. `CallLogPanel.tsx` — new component (staff view)

Location: `client/src/components/voice/CallLogPanel.tsx`

Reads `call_logs` where `projectId == projectId`, ordered by `createdAt desc`.

```tsx
// Sketch — full component follows the same pattern as ProjectActivityFeed.tsx

import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Phone, PhoneIncoming, PhoneMissed, FileText } from 'lucide-react';

interface CallLogEntry {
  id: string;
  callSid: string;
  source: 'twilio' | 'openphone';
  from: string;
  direction: 'incoming' | 'outgoing';
  duration: number;
  contactName?: string;
  aiSummary?: string;
  transcript?: string;
  sentiment?: 'positive' | 'neutral' | 'urgent' | 'negative';
  disposition: string;
  createdAt: any;
}

export function CallLogPanel({ projectId }: { projectId: string }) {
  const [calls, setCalls] = useState<CallLogEntry[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'call_logs'),
      where('projectId', '==', projectId),
      orderBy('createdAt', 'desc'),
      limit(25),
    );
    return onSnapshot(q, (snap) => {
      setCalls(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallLogEntry)));
    });
  }, [projectId]);

  return (
    <div className="space-y-2">
      {calls.map((call) => (
        <CallRow key={call.id} call={call} />
      ))}
      {calls.length === 0 && (
        <p className="text-sm text-gray-500 py-4">No calls recorded yet.</p>
      )}
    </div>
  );
}

function CallRow({ call }: { call: CallLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const sentimentColor = {
    positive: 'bg-green-100 text-green-800',
    neutral: 'bg-gray-100 text-gray-600',
    urgent: 'bg-red-100 text-red-800',
    negative: 'bg-amber-100 text-amber-800',
  }[call.sentiment ?? 'neutral'];

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PhoneIncoming className="h-4 w-4 text-gray-400" />
          <span className="font-medium text-sm">{call.contactName || call.from}</span>
          <Badge className={sentimentColor}>{call.sentiment || 'neutral'}</Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{Math.floor(call.duration / 60)}:{String(call.duration % 60).padStart(2, '0')}</span>
          {call.transcript && (
            <button onClick={() => setExpanded(!expanded)} className="text-blue-500 hover:underline flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {expanded ? 'Hide' : 'Transcript'}
            </button>
          )}
        </div>
      </div>

      {call.aiSummary && (
        <p className="mt-1.5 text-sm text-gray-600">{call.aiSummary}</p>
      )}

      {expanded && call.transcript && (
        <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
          {call.transcript}
        </div>
      )}
    </div>
  );
}
```

**Where to surface this:** Add a "Calls" tab to the project detail sidebar, or embed `<CallLogPanel>` in the project Overview page alongside `ProjectActivityFeed`. The activity feed already has a slot for it.

---

### 5c. `CallTranscriptDrawer.tsx` — full-screen transcript view (optional)

For completeness, a slide-over that shows:
- Full transcript with speaker labels
- AI summary
- Action items (links to `project_tasks`)
- Recording player (if `recordingUrl` exists)
- Contact info + project link

This follows the same pattern as `BidDetailSlideOver.tsx` or `ContactDetailView.tsx` in the codebase.

---

## Firestore Security Rules

Add a rule so staff can read `call_logs`:

```javascript
// firestore.rules — add to existing rules
match /call_logs/{callId} {
  allow read: if request.auth != null && 
    request.auth.token.role in ['admin', 'gc', 'projectManager'];
  allow write: if false; // backend only
}
```

---

## Environment Variables

| Variable | Where | Notes |
|---|---|---|
| `OPENPHONE_WEBHOOK_SECRET` | Firebase Secret Manager | From OpenPhone dashboard → Webhooks |
| `OPENPHONE_API_KEY` | Firebase Secret Manager | For future: fetching recording URLs if they expire |

---

## Composite Firestore Index

The `CallLogPanel` query (`where projectId == X`, `orderBy createdAt desc`) needs a composite index:

```json
// firestore.indexes.json — add:
{
  "collectionGroup": "call_logs",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "projectId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

Deploy with `firebase deploy --only firestore:indexes`.

---

## End-to-End Data Flow

```
OpenPhone call ends
       │
       ▼
POST /api/openphone/webhook
  verifyOpenPhoneSignature()
       │
       ▼
resolvePhoneNumber(from)
  ├── sms_contacts (phoneNumber field, has projectIds[])
  └── contacts (phone field, has associatedProjects[])
       │
       ▼
call_logs/{callId} written
  source: 'openphone'
  contactId, projectId, transcript, turns
       │
       ▼
processCallTranscript(db, callId, transcript)
  ├── Claude claude-haiku-4-5 extraction
  │     summary, actionItems, projectHint, sentiment
  ├── call_logs/{callId} updated (aiSummary, actionItems, sentiment, postProcessed=true)
  ├── project_tasks/ docs created (one per action item)
  ├── notifications/ doc created (urgent/negative only → Tyler push)
  └── communications/{projectId}/events doc created
              type: 'voice_call'
              ← feeds ProjectActivityFeed.tsx
       │
       ▼
UI surfaces:
  ProjectActivityFeed.tsx  — "📞 [contact] called: [summary]"
  CallLogPanel.tsx         — per-project call list with transcript expand
  Notifications bell       — urgent/negative calls only
```

---

## Implementation Order

1. **`functions/src/openphone/types.ts`** — 15 min
2. **`functions/src/openphone/phoneMapper.ts`** — 20 min (mostly copy pattern from smsService)
3. **`functions/src/openphone/webhookRoute.ts`** — 45 min
4. **`functions/src/index.ts` patch** — 5 min (add import + register call)
5. **Verify rawBody capture in body-parser** — 5 min
6. **Set `OPENPHONE_WEBHOOK_SECRET`** — 5 min (Firebase secrets)
7. **Configure OpenPhone webhook in dashboard** — 5 min
8. **Deploy functions** — `firebase deploy --only functions`
9. **`firestore.indexes.json` + deploy** — 10 min
10. **`ProjectActivityFeed.tsx` patch** — 20 min (add voice_call icon + label)
11. **`client/src/components/voice/CallLogPanel.tsx`** — 60 min
12. **Wire `CallLogPanel` into project detail page** — 20 min

**Total: ~3.5 hours of focused implementation**

---

## What We're NOT Doing (Scope Boundary)

- **Not replacing the Twilio AI receptionist** — OpenPhone calls are logged post-hoc; Twilio still handles live call routing
- **Not building outbound calling from Skyeline OS** — that's a separate feature
- **Not building a "missed call → auto SMS" flow** — easy to add later using `call.missed` event type
- **Not surfacing calls in the client portal** — transcripts are internal staff-only initially

---

## Quick Sanity Check: Does `processCallTranscript()` Need Changes?

**No changes needed.** It already:
- Handles any `callSid` (now `callId` from OpenPhone — same doc key)
- Reads back `call_logs/{callSid}` to enrich with contact/project context
- Writes to `communications/{projectId}/events`
- Creates `project_tasks/` docs
- Fires `notifications/` docs

The only behavioral difference: OpenPhone may already include a summary in the webhook payload. We pre-fill `aiSummary` with `call.transcript.summary` so the UI shows something immediately, and then Claude overwrites it with a more Tyler-voice-tuned version after `processCallTranscript()` runs.
