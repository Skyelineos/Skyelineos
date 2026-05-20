# Ingestion Lab — Schema, Rules, and Routing

Reference doc for the Ingestion Lab spike (Session 12). The lab is an admin-only
sandbox that pulls unstructured content from Gmail, Google Drive, iMessage, and
iCloud uploads, runs each item through an Anthropic Claude extraction prompt,
and routes results into one of three lanes: Auto-Filed, Review Queue, or Ask
Queue. All data is isolated under a single Firestore namespace and never
touches production collections.

Two real projects are hardcoded for the spike: **Giboney** (Randy and Leslie,
364 W 350 S Mapleton UT) and **Christensen** (Jordan and Jessica, 279 N Clegg
Canyon Loop Mapleton UT). Do not generalize this to a "projects registry" —
when we productize the lab, we refactor then.

## Namespace layout (Option A — sentinel-doc isolation)

Everything lives under `ingestion_lab/`. The single doc `ingestion_lab/data`
acts as a sentinel parent for the bulky subcollections — it carries no fields
and exists only because Firestore requires a parent doc in the path. Phantom
parents work but a real (empty) sentinel doc makes the structure visible in the
Firebase console.

```
ingestion_lab/config                                      (doc)
ingestion_lab/data                                        (sentinel doc, empty)
ingestion_lab/data/raw_items/{itemId}                     (subcoll)
ingestion_lab/data/processed_items/{itemId}               (subcoll)
ingestion_lab/data/brain_runs/{runId}                     (subcoll)
ingestion_lab/data/oauth_states/{stateId}                 (subcoll)
ingestion_lab/data/contacts_cache/{contactId}             (subcoll)
```

The win of Option A is structural: one wildcard rule
(`match /ingestion_lab/{document=**}`) covers the whole namespace. New
subcollections added later inherit the isolation without rule changes.

## Per-collection schema

### `ingestion_lab/config` (single doc)

OAuth tokens, daily-budget guardrails, and last-run timestamps surfaced in the
Metrics tab.

```ts
{
  gmail: null | {
    refreshToken: string,
    accessToken: string,
    expiresAt: Timestamp,
    email: string,
    scope: string,
    connectedAt: Timestamp,
    connectedByUid: string,
  },
  drive: null | { /* same shape as gmail */ },
  dailyBudgetUsd: number,        // default 5
  spendTodayUsd: number,         // rolling; resets on day change
  spendDate: 'YYYY-MM-DD',       // ISO date of current rolling window
  lastGmailIngestAt: Timestamp | null,
  lastDriveIngestAt: Timestamp | null,
  lastUploadAt: Timestamp | null,
  lastBrainPassAt: Timestamp | null,
}
```

The known-projects table (slug → live project ID → name + address) lives as a
**constant in functions code**, not in this doc. Two entries: `giboney`,
`christensen`.

### `ingestion_lab/data/raw_items/{itemId}`

Every ingested item lands here first. Doc ID is deterministic:
`${source}__${urlSafe(sourceRef)}`. Idempotency is enforced by `create()` —
re-running an ingester is safe.

```ts
{
  source: 'gmail' | 'drive' | 'imessage' | 'icloud' | 'upload',
  sourceRef: string,                  // Gmail msg ID / Drive file ID / iMessage GUID
  sourceMeta: {                       // free-form provenance
    threadId?: string,
    fromEmail?: string,
    fromPhone?: string,
    subject?: string,
    label?: string,
    folderId?: string,
    fileName?: string,
    mimeType?: string,
    modifiedTime?: string,
  },
  projectHint?: 'giboney' | 'christensen',  // set when caller can disambiguate
                                            // (Drive folder ID resolves it;
                                            //  upload script supplies it)
  content: string,                          // extracted text
  contentMime?: string,
  attachmentRefs?: Array<{ filename: string, mime: string, size: number }>,
  ingestedAt: Timestamp,
  ingestedByUid: string,                    // admin who triggered, or 'system'
  processedAt: Timestamp | null,
  processedItemId: string | null,           // join key after brain pass
  brainErrors?: string[],                   // last error messages if a pass failed
}
```

### `ingestion_lab/data/processed_items/{itemId}`

Output of the brain pass. One processed item per raw item. The UI's Auto-Filed,
Review Queue, and Ask Queue tabs all read from this collection, filtering on
`lane` and `reviewStatus`.

```ts
{
  rawItemId: string,
  source: 'gmail' | 'drive' | 'imessage' | 'icloud' | 'upload',
  sourceRef: string,                  // denormalized for fast filters
  category: string,                   // claude-extracted (see category lists)
  projectId: 'giboney' | 'christensen' | null,
  structuredPayload: object,          // category-shaped extracted payload
  confidence: number,                 // 0..1
  confidenceReason: string,
  needsClarification: boolean,
  clarificationQuestion?: string,
  clarificationAnswer?: string,       // set when user answers in Ask queue
                                      // → triggers re-pass
  lane: 'auto_filed' | 'review_queue' | 'ask_queue',
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'corrected',
  reviewedAt?: Timestamp,
  reviewedByUid?: string,
  correction?: object,                // user's edited payload if Corrected
  processedAt: Timestamp,
  modelUsed: string,                  // e.g. 'claude-opus-4-7'
  inputTokens?: number,
  outputTokens?: number,
  costUsd?: number,
}
```

The five fields the admin UI is allowed to mutate (via Firestore rules) are
exactly: `reviewStatus`, `reviewedAt`, `reviewedByUid`, `correction`,
`clarificationAnswer`. Everything else is server-only.

### `ingestion_lab/data/brain_runs/{runId}`

Audit log feeding the Metrics tab — last brain pass timestamp, items processed,
total cost. Append-only from the Cloud Function side.

```ts
{
  triggeredAt: Timestamp,
  triggeredByUid: string,
  itemsProcessed: number,
  itemsSucceeded: number,
  itemsFailed: number,
  costUsd: number,
  durationMs: number,
  error?: string,
}
```

### `ingestion_lab/data/oauth_states/{stateId}`

Short-lived OAuth nonces. Cloud Function only — `allow read, write: if false`
is enforced by the namespace wildcard.

```ts
{
  state: string,                      // doc ID is the state value
  provider: 'gmail' | 'drive',
  createdAt: Timestamp,
  adminUid: string,
  redirectAfter?: string,
}
```

### `ingestion_lab/data/contacts_cache/{contactId}`

A frozen snapshot of the contacts associated with the two lab projects,
refreshed by `scripts/refresh-ingestion-contacts-cache.mjs`. The brain pass
reads this collection (not live `/contacts/`) so the lab can match
sender-email/phone to a known project without touching production data at
runtime.

Doc ID is the original `/contacts/{id}` so re-running the probe naturally
overwrites in place — no duplicates, no manual cleanup.

```ts
{
  contactId: string,                  // mirrors doc ID; original /contacts/{id}
  name: string,
  email?: string,
  phone?: string,
  address?: string,
  associatedProjects: string[],       // live project IDs from /contacts (raw)
  labProjectSlugs: Array<'giboney' | 'christensen'>,  // resolved at cache time
  cachedAt: Timestamp,
  cachedByUid: string,                // admin who ran the probe
}
```

## Three-lane routing

The lane is derived by a single resolver function in the brain pass after
Claude returns. Inputs: `{category, confidence, needsClarification, projectId}`.

```
lane = 'ask_queue'      if needsClarification == true
                        OR confidence < 0.5
                        OR projectId == null

lane = 'review_queue'   if category ∈ REVIEW_REQUIRED_CATEGORIES
                        OR 0.5 <= confidence < 0.90
                        OR category not in INFORMATIONAL_CATEGORIES
                           (conservative default for unknown categories)

lane = 'auto_filed'     otherwise (confidence >= 0.90
                        AND category ∈ INFORMATIONAL_CATEGORIES)
```

Auto-file threshold is **0.90 during the spike** — deliberately high. We want
to see the brain's work during tuning, not let it silently file 1-in-7 items.
We'll lower this once we trust accuracy.

### Category sets

```
REVIEW_REQUIRED_CATEGORIES =
  invoice, change_order, bid, cost_change, material_selection,
  schedule_change, commitment,
  design_decision, client_approval_request,
  decision_made, decision_needed         // all decision-shaped categories

INFORMATIONAL_CATEGORIES =
  general_correspondence, status_update, design_inspiration,
  schedule_question, photo_share, meeting_summary
```

Anything decision-shaped — even at high confidence — routes to Review. During
the spike, decisions are too consequential to auto-file. Categories not in
either list also route to Review (conservative default).

### Lane resolver invariants

The resolver function fails loud on misuse:

1. **Sets don't overlap.** `INFORMATIONAL ∩ REVIEW_REQUIRED == ∅` is asserted
   at module load. If the two sets ever overlap, the function throws on
   import — the spike won't deploy until it's fixed.
2. **Unknown categories are visible.** In dev, the `default` arm of the
   classification throws. In prod (env flag), it softens to "route to review"
   so a single misclassified item doesn't take the whole batch down.
3. **Single-pass evaluation.** The resolver returns on the first matching
   arm. No accidental double-classification.

## Idempotency

Every ingester (Gmail, Drive, upload, future iMessage/iCloud) uses a
deterministic doc ID: `${source}__${urlSafe(sourceRef)}`. Writes use Admin
SDK's `create()`, which fails with `ALREADY_EXISTS` on a duplicate — the
ingester catches that specific error and counts it as "skipped, already
ingested" rather than a real error. Re-running an ingester is safe.

The brain pass reads raw items where `processedAt == null` and writes
`processedAt + processedItemId` on success. A second pass cannot re-process
an already-processed item without an admin manually nulling `processedAt`.

## Budget guardrail

Before each Anthropic call inside the brain pass:

1. Read `ingestion_lab/config`.
2. If `spendDate` is not today, reset `spendTodayUsd = 0` and update
   `spendDate`.
3. If `spendTodayUsd + estimatedCostForThisCall > dailyBudgetUsd`, abort the
   batch with a `budget_exceeded` error in `brain_runs`.

Default budget is **$5 USD/day**. Adjustable in the config doc by an admin
(only via Cloud Function — direct client write is denied).

## OAuth token storage — KMS deferred

Tokens (`gmail.refreshToken`, `drive.refreshToken`, etc.) are stored in
`ingestion_lab/config` using Firestore's native at-rest encryption. This is
acceptable for the spike because:

- Read is gated by the namespace wildcard (`isAdmin()` only).
- Write is `allow write: if false` — only the Cloud Function via Admin SDK
  can touch the field.
- Scopes are read-only (Gmail) and read-only + folder-restricted (Drive), so
  blast radius is bounded even if storage is compromised.

**Before any non-Skyeline use of this lab, tokens must move to Cloud KMS.**
This caveat is also captured in SESSION_NOTES.md under the Session 12 entry.

## Firestore rules

Located in `firestore.rules`, immediately before the final
`// Deny everything else` block:

```javascript
match /ingestion_lab/{document=**} {
  allow read: if isAdmin();
  allow write: if false;
}

match /ingestion_lab/data/processed_items/{itemId} {
  allow update: if isAdmin()
    && request.resource.data.diff(resource.data).affectedKeys()
         .hasOnly([
           'reviewStatus',
           'reviewedAt',
           'reviewedByUid',
           'correction',
           'clarificationAnswer'
         ]);
}
```

The wildcard's `allow write: if false` does not block the specific
`processed_items` update — Firestore evaluates all matching rules and grants
access if any allow. This is the same shape used by the contacts self-link
rule at line 59.

## Cloud Function route prefix

All endpoints fold into the existing Express `api` Cloud Function under
`/api/ingestionLab/...`. New standalone Cloud Run services are blocked by
org IAM (see CLAUDE.md "Backend layout" and SESSION_NOTES.md #7).

```
POST  /api/ingestionLab/oauth/gmail/start
GET   /api/ingestionLab/oauth/gmail/callback
POST  /api/ingestionLab/oauth/drive/start
GET   /api/ingestionLab/oauth/drive/callback
POST  /api/ingestionLab/ingest/gmail
POST  /api/ingestionLab/ingest/drive
POST  /api/ingestionLab/upload
POST  /api/ingestionLab/brain/process
```

Module files live under `functions/src/ingestionLab/` and register routes onto
the shared Express app — they do **not** export their own `onCall` /
`onRequest` functions.
