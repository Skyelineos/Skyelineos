# Command Center — Step 1: Schema Map & Ingestion Design Research

**Status:** Research only. Step 2 (ingestion endpoint) is NOT in this doc.
**Scope:** Map every Firestore collection the Command Center will read or write
against, prove out the inbound‑sender → contact → project resolution path, and
identify the gaps that have to close before we write a single line of ingestion
code.
**Method:** Read against the current `main` of `Skyelineos/Skyelineos`. Every
field name in this doc is quoted from a real file in the repo.

---

## 0. Executive summary (the short version)

The user's proposed `communications` collection **already exists** as a fully
designed Phase 1‑3 surface (see `docs/communication-center-schema.md`). It is
subjectRef‑keyed (`{ type: 'lead' | 'client' | 'project', id }`), supports
lifecycle carry‑forward (lead → project), has a `messages/{id}` subcollection
whose `source` enum already includes `'ingestion'`, and an
`extractions/{id}` subcollection used today by the Phase‑3 AI Brain
(`functions/src/communications/aiBrain.ts`) and the voice agent's post‑call
processor (`functions/src/voice/postCallProcessor.ts`).

This means the Command Center is **not** building a parallel collection. It is
becoming the *single front door* that lands inbound email / SMS / Telegram /
portal / call transcripts into `communications/{threadId}/messages/{id}` with a
verified record. The "no parallel DB" rule is satisfied by extending — not
forking — what is already shipped.

There are real gaps before that can ship: phone numbers are not E.164‑normalized
on contacts; emails are not stored lowercased; project ↔ contact links are
bidirectional but not enforced by a single helper; and there is no per‑message
`processed_status` state machine to satisfy the RAW‑WRITE‑FIRST / VERIFY‑WRITE‑
LAST contract. Those four close‑outs are Step 1.5 work.

---

## A. Schema map — every Firestore collection in `main`

Definitive list pulled from `firestore.rules` (99 `match` statements). Grouped
by domain. Subcollections are indented under their parent path.

### Identity / directory

| Path | Doc ID | Purpose |
|---|---|---|
| `users/{userId}` | Firebase Auth uid | Per‑user profile, role, prefs. |
| `contacts/{contactId}` | auto | The directory. Clients, subs, designers, leads. |
| `clients/{clientId}` | auto | Legacy client table — being phased into `contacts`. |
| `pendingTrades/{tradeId}` | auto | Sub‑trade applications awaiting admin verification. |
| `trades/{tradeId}` | trade slug | Approved trade taxonomy. |
| `portalInvites/{inviteId}` | auto | Magic‑link sub invites awaiting click‑through. |
| `linkReviewQueue/{entryId}` | auto | Admin review queue for sub auth linkage. |

### Projects + project subcollections

| Path | Doc ID | Purpose |
|---|---|---|
| `projects/{projectId}` | auto | The build. Canonical project record. |
| `projects/{projectId}/locationEvents/{eventId}` | auto | Audit log for buildLocation changes. |
| `projects/{projectId}/changeOrders/{coId}` | auto | Legacy CO subcollection (migrating to top‑level `changeOrders/`). |
| `projects/{projectId}/rooms/{roomId}` | auto | Room‑level structure used by selections. |
| `projects/{projectId}/bidRequests/{requestId}` | auto | Per‑project bid request envelopes. |
| `projects/{projectId}/bidPackages/{packageId}` | auto | Bid packages dispatched to subs. |
| `projects/{projectId}/addenda/{addendumId}` | auto | Phase 1 SSOT: bid addenda surface. |
| `projects/{projectId}/selections/{selectionId}` | auto | Homeowner selections. |
| `projects/{projectId}/moodBoards/{boardId}` | auto | Designer mood boards. |
| `projects/{projectId}/designDecisions/{decisionId}` | auto | Designer‑logged decisions. |
| `projects/{projectId}/designFiles/{fileId}` | auto | Plan/design uploads. |
| `projects/{projectId}/stylePreferences/{docId}` | auto | Homeowner style answers. |
| `projects/{projectId}/styleComparisons/{docId}` | auto | A/B comparisons. |
| `projects/{projectId}/styleInspiration/{docId}` | auto | Inspiration pins. |
| `projects/{projectId}/selectionRecommendations/{docId}` | auto | AI‑generated recs for the designer. |
| `projects/{projectId}/schedules/{scheduleId}` | auto | Per‑project schedule snapshots. |
| `projects/{projectId}/channels/{channelId}` | auto | Legacy project channels (being subsumed by `communications/`). |
| `projects/{projectId}/channels/{channelId}/messages/{messageId}` | auto | Legacy channel messages. |
| `projects/{projectId}/rfis/{rfiId}` | auto | RFIs. |
| `projects/{projectId}/draws/{drawId}` | auto | Construction draws. |
| `projects/{projectId}/budgetItems/{itemId}` | auto | Per‑project budget rows. |
| `projects/{projectId}/takeoffs/{takeoffId}` | auto | Takeoff data. |
| `projects/{projectId}/lumberTakeoffs/{lumberTakeoffId}` | auto | Lumber‑specific takeoffs. |
| `projects/{projectId}/walkthroughs/{walkthroughId}` | auto | Site walkthroughs. |
| `projects/{projectId}/moveInBinder/{itemId}` | auto | Closeout binder content. |

### Financial

| Path | Doc ID | Purpose |
|---|---|---|
| `estimates/{estimateId}` | auto | Top‑level estimates (per the EstimateBuilder save path). |
| `estimates/{estimateId}/lineItems/{lineItemId}` | auto | Estimate line items (when split out). |
| `invoices/{invoiceId}` | auto | Client invoices. |
| `bids/{bidId}` | auto | Top‑level bids (replaces project subcollection). |
| `bidInviteTokens/{token}` | token | Sub bid magic‑link tokens. |
| `bidPackageTemplates/{templateId}` | auto | Reusable bid‑package templates. |
| `subTakeoffs/{takeoffId}` | auto | Sub‑side takeoff data. |
| `changeOrders/{orderId}` | auto | Top‑level CO collection. |
| `purchaseOrders/{poId}` | auto | POs. |
| `contracts/{contractId}` | auto | Contracts. |
| `financials/{docId}` | auto | Generic financial documents. |
| `qboConnections/{docId}` | uid | QuickBooks OAuth bindings. |
| `qboOAuthStates/{docId}` | nonce | Short‑lived OAuth state. |
| `pendingSubAssignments/{id}` | auto | Sub awards awaiting confirmation. |

### Communications (already built — see Section C for the deep dive)

| Path | Doc ID | Purpose |
|---|---|---|
| `communications/{threadId}` | auto | Lifecycle‑spanning thread keyed on `subjectRef`. |
| `communications/{threadId}/messages/{messageId}` | auto | Append‑only messages. `source` enum includes `'ingestion'`. |
| `communications/{threadId}/extractions/{extractionId}` | auto | AI extractions — CF‑write‑only. |
| `actionItems/{itemId}` | auto | Cross‑subject action items (Phase 2). |
| `decisions/{decisionId}` | auto | Cross‑subject decision log (Phase 2). |
| `commsLog/{logId}` | auto | GC‑manual call/email log (legacy; staff‑only). |
| `notifications/{notificationId}` | auto | Per‑user notification inbox. |
| `notificationJobs/{jobId}` | auto | Scheduled / batched notification sends. |
| `emailTemplates/{templateId}` | auto | Outbound email templates. |
| `emailTemplates_meta/{docId}` | auto | Template metadata. |

### Voice / SMS

| Path | Doc ID | Purpose |
|---|---|---|
| `call_logs/{callSid}` | Twilio CallSid | One doc per inbound call. Voice agent writes `summary`, `actionItems`, `projectHint`, `sentiment`, `callerIntent`. |
| `sms_opt_outs/{phone}` | E.164 phone | STOP‑message opt‑out list. |

### Ingestion (existing spike + AI Inbox Phase A)

| Path | Doc ID | Purpose |
|---|---|---|
| `ingestion_lab/{document=**}` | — | Sandbox spike. Admin‑only. See `docs/ingestion-lab-schema.md`. |
| `ingestion_lab/data/raw_items/{itemId}` | `${source}__${urlSafe(sourceRef)}` | Every ingested raw item (idempotent create). |
| `ingestion_lab/data/processed_items/{itemId}` | auto | Brain‑pass output with `lane` (auto/review/ask). |
| `ingestion_lab/data/brain_runs/{runId}` | auto | Brain pass audit log. |
| `ai_inbox_items/{itemId}` | auto | AI Inbox Phase A — PDF intake + spam triage + link flagging. |
| `ai_inbox_config/{docId}` | auto | AI Inbox tuning. |

### Tasks & schedule

| Path | Doc ID | Purpose |
|---|---|---|
| `tasks/{taskId}` | auto | Schedule tasks. |
| `tasks/{taskId}/signoffEvents/{eventId}` | auto | Sign‑off audit trail. |
| `masterTasks/{taskId}` | auto | Master library. |
| `projectTasks/{taskId}` | auto | Per‑project task copies (legacy alongside `tasks/`). |
| `taskImprovements/{impId}` | auto | Suggestions queue. |
| `scheduleTemplates/{templateId}` | auto | Reusable schedule shapes. |
| `schedules/{projectId}` | projectId | Top‑level schedule by project. |

### Documents / files

| Path | Doc ID | Purpose |
|---|---|---|
| `documents/{docId}` | auto | Top‑level doc index. |
| `safetyForms/{formId}` | auto | Safety forms. |
| `timesheets/{sheetId}` | auto | Subcontractor timesheets. |
| `siteLogs/{logId}` | auto | Daily site logs. |
| `siteLogs/{logId}/entries/{entryId}` | auto | Per‑day entries. |
| `permits/{permitId}` | auto | Permit tracking. |

### Sales / catalogs / templates / settings

| Path | Doc ID | Purpose |
|---|---|---|
| `inspiration/{itemId}` | auto | Inspiration pieces. |
| `styleLibrary/{imageId}` | auto | Style library. |
| `styleReactions/{reactionId}` | auto | Style swipe reactions. |
| `styleProfiles/{contactId}` | contactId | Per‑contact aggregated style. |
| `public_content/{docId}` | slug | Public marketing content. |
| `salesPitchSections/{sectionId}` | auto | Sales pitch chunks. |
| `designSelections/{selectionId}` | auto | Designer selections catalog. |
| `catalogs/{itemId}` | auto | Generic catalog. |
| `templates/{templateId}` | auto | Reusable templates. |
| `automations/{autoId}` | auto | Automation rules. |
| `socialPosts/{postId}` | auto | Content Studio posts. |
| `playbookEntries/{entryId}` | auto | Playbook. |
| `lots/{lotId}` | auto | Lots inventory. |
| `subscriptions/{subId}` | auto | Subscriptions. |
| `contentDrafts/{draftId}` | auto | Content drafts. |
| `companySettings/{settingsDoc}/descriptionTemplates/{templateId}` | auto | Per‑setting templates. |
| `settings/{settingId}` | auto | Per‑user settings. |
| `system/deployLock` | static | Deploy lock for CI. |
| `qa_runs/{runId}` | auto | QA run history. |
| `projectReviews/{reviewId}` | auto | Project review records. |
| `reminders/{reminderId}` | auto | Cross‑surface reminders. |
| `clientActivity/{eventId}` | auto | Client portal engagement log. |

---

## B. PROJECTS ↔ CONTACTS deep dive (the inbound resolution path)

### B.1 `projects/{projectId}` — fields that matter to ingestion

From `client/src/components/projects/NewProjectForm.tsx` (creation source of
truth) and `client/src/lib/buildLocation.ts`:

| Field | Type | Canonical? | Notes |
|---|---|---|---|
| `name` | string | yes | Human label, e.g. "Veliz Home". |
| `projectCode` | string | yes | Pattern: `LastNameMMDDYYYY` (e.g. `Veliz06282026`). Generated at create. |
| `clientIds[]` | string[] | **yes** | Array of `contacts/{id}` IDs. Canonical link to clients. |
| `clientName` | string | denormalized | Joined display name (e.g. "Jane & John Veliz"). |
| `clientEmail` | string | denormalized | Primary client's email. Snapshot at create — not auto‑refreshed. |
| `clientPhone` | string | denormalized | Primary client's phone. Snapshot at create. |
| `designerChoice` | `'select' \| 'none' \| 'client_self' \| 'later'` | yes | |
| `designerContactId` | string (optional) | yes when `designerChoice='select'` | |
| `designerName` / `designerEmail` / `designerCompany` | string | denormalized | |
| `projectManager` | string | yes | PM display name. |
| `address` | string | legacy | Flat address typed by hand. |
| `buildLocation.addressLine1` / `.city` / `.state` / `.zipCode` / `.county` | string | **canonical when present** | Set when the address came from Google Places autocomplete. Has `latitude` + `longitude` when picked. |
| `buildLocation.latitude` / `.longitude` | number \| null | yes | Only present on autocomplete‑picked addresses. |
| `buildLocation.status` | `'unconfirmed' \| 'pending_client' \| 'confirmed' \| 'correction_requested'` | yes | |
| `startDate` | ISO date | yes | |
| `targetCompletion` | ISO date | yes | |
| `status` | enum (lifecycle phase) | yes | |
| `spent` | number | denormalized | Updated by financial flows. |
| `budget` | number | yes | |
| `assignedUserIds[]` | string[] | yes (rules) | Used by Storage + Firestore rules to grant designer/sub access. Not always written at create — backfilled when sub is awarded. |
| `salesClientId` | string | legacy | Old lead conversion path. |

**Address resolution rule:** prefer `buildLocation.addressLine1 + …` when
`buildLocation.status !== 'unconfirmed'`, else fall back to flat `address`. The
`locationFromProject()` helper in `client/src/lib/buildLocation.ts` already
implements this.

### B.2 `contacts/{contactId}` — fields that matter to ingestion

From `client/src/pages/Contacts.tsx` (create) and `shared/schema.ts`:

| Field | Type | Notes |
|---|---|---|
| `name` | string | Full name. |
| `firstName` / `lastName` | string | Stored separately too. |
| `email` | string | **Not normalized at write time.** Whatever was typed. |
| `phone` | string | **Not normalized.** Free‑form. |
| `company` | string | |
| `role` | enum | `'client' \| 'subcontractor' \| 'designer' \| 'projectManager' \| 'admin' \| 'sub' \| 'lead'`. `normalizeRole()` in `shared/auth-types.ts` handles legacy variants. |
| `trade` | string | Legacy single trade. |
| `trades[]` | string[] | Modern multi‑trade. |
| `linkedUserId` | string | Firebase Auth uid bound to this contact via the post‑signup link flow. Allows a sub who signed up with a different email than their contact to still be matched. |
| `associatedProjects[]` | string[] | Denormalized list of project IDs. **Maintained manually — not bidirectional with `project.clientIds[]`.** Either may drift. |
| `address` / `city` / `state` / `zipCode` | string | |
| `isActive` / `rating` / `tags[]` | varied | |

**Doc ID convention:** auto. Lookups are by `email`, `phone`, `linkedUserId`,
or full‑text on `name`. There is no deterministic ID derived from an
email/phone.

### B.3 Resolution path — inbound email from `jane@example.com`

```
1. Normalize  →  'jane@example.com'.trim().toLowerCase()
2. Query      →  contacts where email == <normalized>
   → If 1 hit: contact resolved.
   → If 0 hits: also try     contacts where lower(email) == <normalized>
                 (no such field today — see Gap #2; fallback is to load + scan)
   → If 2+ hits: pick the highest‑role contact (admin > gc > pm > client > sub > designer > lead).
3. Project resolution:
   → Prefer:  query projects where 'clientIds' array-contains <contactId>
   → Fallback: read contact.associatedProjects[], iterate.
   → If still no match: park in the "ambiguous" lane for staff routing.
```

Email matching is brittle today because `contacts.email` is **case‑sensitive**
(see Gap #2). The resolver must lowercase before the query, and a one‑time
backfill pass on `contacts` is required so the index matches.

### B.4 Resolution path — inbound SMS from `+15551234567`

```
1. Normalize  →  E.164 (+15551234567). Use `libphonenumber-js` parse + format.
2. Query      →  contacts where phone == <E.164>
   → If 0 hits, also try `phone` stripped of '+1' (legacy stored as '5551234567'),
     and the (888) 555-1234 formatted variant.
   → If 2+ hits, pick by recency (last contacted with the same phone).
3. Project resolution: same as B.3 (clientIds array-contains).
```

**SMS matching is the most brittle path today** — see Gap #1. Without a phone
normalization pass on contacts, every inbound SMS has to do up to three
fallback queries.

### B.5 Resolution path — inbound from voice transcript

Today the voice agent runs `postCallProcessor.ts` which extracts a
`projectHint` (caller's last name or project nickname) via Claude Haiku. That
hint is loose — Command Center should overlay the deterministic SMS path
above using the caller's Twilio `From` number, and only fall back to the
Claude hint when the number doesn't match any contact.

---

## C. Existing communications surface (already built)

**This is the most important section.** The user's proposed `communications`
collection in the brief matches almost exactly what already ships.

### C.1 `communications/{threadId}` — Phase 1 thread

Per `docs/communication-center-schema.md` + `firestore.rules` lines 457–501 +
`client/src/lib/communications/firestore.ts`:

| Field | Type | Notes |
|---|---|---|
| `subjectRef` | `{ type: 'lead' \| 'client' \| 'project', id: string }` | The lifecycle key. |
| `subjectChain[]` | `string[]` | Full trail, e.g. `['lead:abc', 'project:xyz']`. Phase 2 `repointThreadSubject()` appends on conversion. |
| `subjectLabel` | string | Denormalized name for list display. |
| `title` | string | |
| `category` | enum | General · Sales · Design · Selections · Budget · Schedule · Construction · Trade Coordination · Change Orders · Issues · Warranty · Internal |
| `kind` | `'thread' \| 'phone_call' \| 'meeting' \| 'voice_memo'` | |
| `memberUids[]` | string[] | Visibility membership (mirrors channels). |
| `visibility` | `'internal' \| 'client' \| 'trade' \| 'restricted'` | Read gate enforced in `firestore.rules`. |
| `tradeIds[]` | string[] | Contact IDs of relevant trades. |
| `status` | `'open' \| 'resolved' \| 'archived'` | |
| `priority` | `'low' \| 'normal' \| 'high' \| 'urgent'` (optional) | |
| `lastMessageAt` / `lastMessageText` | Timestamp / string | Denormalized for list. |
| `createdAt` / `createdBy` / `createdByName` | | |
| `aiSummary` | string (optional) | Set by Phase‑3 Brain on demand. Internal‑only. |

### C.2 `communications/{threadId}/messages/{messageId}` — append‑only

| Field | Type | Notes |
|---|---|---|
| `type` | `'text' \| 'file' \| 'photo' \| 'video' \| 'audio' \| 'call_log' \| 'meeting_record' \| 'system' \| 'ai_note'` | |
| `text` | string | Body. |
| `authorUid` / `authorName` / `authorRole` | string | |
| `mentions[]` | uid[] | @‑tagged users. |
| `tradeIds[]` | string[] | |
| `attachments[]` | `{ name, url, storagePath, contentType, size }[]` | |
| `parentId` | string (optional) | Threaded reply. |
| `visibility` | overrides thread's if set | |
| `source` | `'app' \| 'phone' \| 'meeting' \| 'ingestion' \| 'ai'` | **`'ingestion'` slot already reserved for the Command Center.** |
| `senderType` / `sourceType` | string (Phase 2) | Reserved hooks. |
| `createdAt` | Timestamp | |

### C.3 `communications/{threadId}/extractions/{id}` — AI output

| Field | Type | Notes |
|---|---|---|
| `entityType` | `'action_item' \| 'decision_made' \| 'decision_needed' \| 'commitment' \| 'change_order_signal' \| 'issue' \| 'schedule_change' \| 'vendor_mention'` | |
| `sourceMessageId` | string | |
| `projectId` | string (optional) | |
| `ownerUid` | string (optional) | |
| `tradeIds[]` | string[] | |
| `payload` | object | Entity‑shaped. |
| `confidence` | number 0..1 | |
| `needsClarification` | boolean | |
| `lane` | `'auto' \| 'review' \| 'ask'` | Mirrors Ingestion Lab. |
| `visibility` | `'internal'` only | |
| `status` | `'open' \| 'linked' \| 'done' \| 'dismissed'` | |
| `linkedRef` | reference to a real task/decision once promoted | |
| `createdViaAi` | boolean | Distinguishes from human review. |

**Write rules:** Cloud Function only (`allow create, delete: if false`).
Staff may update only `status`, `linkedRef`, `reviewedAt`, `reviewedByUid`.

### C.4 Server‑side AI Brain

- `functions/src/communications/aiBrain.ts` — runs `claude-sonnet-4-6` via the
  tool‑use API to extract entities. Has a **daily $5 budget guard** in
  `communications_ai_config/global`. De‑dupes against open suggestions on
  re‑run.
- `functions/src/communications/extractionPrompt.ts` — system prompt + the
  `extract_communications` tool definition.
- `functions/src/communications/routes.ts` — `POST /api/communications/threads/:id/analyze`,
  `.../:id/summarize`, `POST /api/communications/summarize-project`.
- `functions/src/communications/staffAuth.ts` — `staffOnly` middleware.

### C.5 Voice agent already feeds `communications/`

`functions/src/voice/postCallProcessor.ts` already writes:
- `call_logs/{callSid}` — primary call record (`summary`, `actionItems`,
  `projectHint`, `sentiment`, `callerIntent`).
- `communications/{threadId}/extractions/{id}` — when the call resolves to a
  project, mirrors the SMS extraction surface.

So voice and SMS are already half‑integrated into communications. The Command
Center's job is to land **the inbound message itself** as
`communications/{threadId}/messages/{id}` with `source='ingestion'` and a
verified `processed_status` (new field — see Gap #4).

### C.6 SMS inbound exists

Twilio inbound SMS already hits `/api/sms/inbound` and `/api/sms/webhook`
(registered in `functions/src/index.ts` lines 67‑68). The SMS Agent Phase 1
is shipped. The Command Center should converge the inbound endpoints to land
in `communications/` rather than wherever SMS currently lands.

---

## D. Gaps that block ingestion (close BEFORE Step 2 ships)

### Gap #1 — Phone numbers are not E.164‑normalized on `contacts`

`contacts.phone` is free‑form whatever the GC typed: `(555) 123‑4567`,
`555-123-4567`, `+15551234567`, `555.123.4567` — all coexist. Twilio webhooks
always deliver E.164. Without normalization, SMS sender → contact matching
has to try every plausible format.

**Close‑out:** one‑time backfill pass that parses every `contacts.phone` with
`libphonenumber-js`, stores the E.164 in a new `phoneE164` field, leaves the
original in `phone` for display, and adds a Firestore index on `phoneE164`.
Going forward, the Contact create/edit form normalizes on save.

### Gap #2 — Email case is not normalized on `contacts`

`contacts.email` is stored exactly as typed. Firestore queries are
case‑sensitive. `Jane@Example.com` won't match `jane@example.com`.

**Close‑out:** add a `emailLower` field on `contacts`, backfill, query against
it. The form lowercases on save.

### Gap #3 — `project.clientIds[]` ↔ `contact.associatedProjects[]` are bidirectional but unenforced

Either side may drift. Today nothing keeps them in sync — they're written by
different paths (project create writes `clientIds`; nothing routinely updates
`associatedProjects`).

**Close‑out:** a small server‑side helper `linkContactToProject(contactId,
projectId)` that writes BOTH sides in a batch, and a Cloud Function trigger
on `projects/{id}` writes that reconciles `associatedProjects` on every
client list change. Command Center is the canonical caller of this helper
when a new inbound creates a thread on a project.

### Gap #4 — No `processed_status` state machine on messages

The user's RAW‑WRITE‑FIRST + VERIFY‑WRITE‑LAST contract requires per‑message
state: `raw → classified → verified` (and `failed`). Today
`communications/{threadId}/messages/{id}` has no such field. The
extractions subcollection has `status: 'open' | 'linked' | …` but that's
for the AI output, not the message itself.

**Close‑out:** add three fields to messages:
- `processed_status: 'raw' \| 'classified' \| 'verified' \| 'failed'`
- `confidence: number` (when classified, the routing confidence)
- `verifiedAt: Timestamp` (set when Firebase read‑back confirms persistence)

Default `'raw'` on Command Center first write so the original is durable
before any LLM runs. Update to `'classified'` after Tier 2 categorization.
Update to `'verified'` after the post‑write read‑back confirms.

### Gap #5 — No top‑level `inbound_raw/` quarantine collection

The RAW‑WRITE‑FIRST rule demands the original payload persist *before any
parsing*. Writing the raw payload directly into `communications/…/messages/`
risks landing it on the wrong thread if sender resolution races. Better: a
separate **quarantine** collection that always succeeds, then promote.

**Close‑out:** add top‑level `inbound_raw/{rawId}` written FIRST with the
verbatim source payload, sender, channel, timestamp, attachments, idempotency
key. Then a separate `promoteRawToCommunications()` step resolves the
sender → contact → project and writes to `communications/`. The `inbound_raw`
doc is never edited — it's a forensic record.

### Gap #6 — Voice + SMS + Email landings are inconsistent

- Voice → `call_logs/{callSid}` + sometimes `communications/.../extractions`
- SMS → existing SMS Agent surface (specifics scattered across `functions/src/index.ts`)
- Email → `ingestion_lab/data/raw_items/` (admin spike only)
- AI Inbox → `ai_inbox_items/{itemId}`

The Command Center's value is **converging all four into one front door**:
every inbound → `inbound_raw/` (Gap #5) → `communications/`.

### Gap #7 — Storage rules for attachments under `communications/`

`storage.rules` currently lets any authed user read/write under
`communications/{threadId}/…`. The Firestore rules gate visibility, but
storage is open. For Command Center we want **CF‑service‑account only writes**
to `inbound_raw/` attachments (no user can drop a file there), and
visibility‑gated reads from `communications/{threadId}/…` (mirror the
`isOnProject(projectId)` pattern from the Stream‑1 rules audit).

**Close‑out:** rewrite the `match /communications/{threadId}/…` block to:
- write: deny (CF only)
- read: `request.auth != null && firestore.get(/databases/(default)/documents/communications/$(threadId)).data.memberUids[request.auth.uid] != null`

---

## E. Recommended schema additions (modest deltas, not a new collection)

### E.1 New top‑level `inbound_raw/{rawId}` (RAW‑WRITE‑FIRST quarantine)

| Field | Type | Notes |
|---|---|---|
| `rawId` | string (doc ID) | Deterministic: `${channel}__${sourceRef}` so retries are idempotent. |
| `channel` | `'email' \| 'sms' \| 'voice' \| 'telegram' \| 'portal' \| 'webform'` | |
| `direction` | `'inbound'` | Outbound goes through existing notify infra. |
| `sourceRef` | string | Provider's ID — Gmail msg ID / Twilio MessageSid / etc. |
| `sender.address` | string | Email or E.164 or Telegram chat id. |
| `sender.displayName` | string (optional) | |
| `sender.normalized` | string | Lowercased email / E.164 phone — the field we'll query against. |
| `recipient.address` | string | Which mailbox / phone number received. |
| `subject` | string (optional) | Email only. |
| `body` | string | Plain text / transcript. |
| `bodyHtml` | string (optional) | Email HTML. |
| `attachments[]` | `{ filename, contentType, size, storagePath }[]` | Files land in `inbound_raw/{rawId}/{filename}` in Storage. |
| `receivedAt` | Timestamp | Provider's timestamp, not server. |
| `ingestedAt` | Timestamp | Server timestamp. |
| `processed_status` | `'raw' \| 'classified' \| 'promoted' \| 'failed' \| 'spam'` | RAW until classifier runs. |
| `confidence` | number 0..1 | Set when classified. |
| `routedTo.threadId` | string (optional) | Set when promoted. |
| `routedTo.projectId` | string (optional) | Resolved project. |
| `routedTo.contactId` | string (optional) | Resolved contact. |
| `routingReason` | string | Human‑readable: "matched contact by E.164 phone", "ambiguous — staff routing". |
| `errors[]` | string[] | If classification or promotion failed. |
| `verified` | boolean | Set TRUE only after Firebase read‑back confirms downstream writes. |

**Why top‑level, not subcollection.** A subcollection under
`projects/{id}/inbound_raw/` would require resolving the project FIRST, which
defeats RAW‑WRITE‑FIRST. Top‑level lets the write succeed before classification
runs.

**Indexes:**
- `(channel, processed_status, ingestedAt DESC)` — staff "unprocessed
  inbound" queue.
- `(sender.normalized, ingestedAt DESC)` — sender history lookup.
- `(routedTo.projectId, ingestedAt DESC)` — per‑project inbound feed.

**Security rules:**
- read: GC + admin + PM only (`isStaff()`).
- create / update / delete: false (CF‑only via admin SDK).

### E.2 Three field additions to `communications/{threadId}/messages/{messageId}`

| Field | Type | Default | Notes |
|---|---|---|---|
| `processed_status` | `'raw' \| 'classified' \| 'verified' \| 'failed'` | `'raw'` | Set when the message lands. Flips to `'verified'` after read‑back. |
| `confidence` | number 0..1 (optional) | undefined | Routing confidence from Tier 2 classifier. |
| `verifiedAt` | Timestamp (optional) | undefined | Set when verification read confirms. |
| `inboundRawId` | string (optional) | undefined | FK back to `inbound_raw/{rawId}`. |

No rule change required — these are all writeable by the CF service account
that the Command Center will run under. The thread's existing visibility
rules continue to gate read access.

### E.3 No changes to `extractions/{id}` — already correct

The Phase‑3 extractions schema with `lane: 'auto' | 'review' | 'ask'` and
`status: 'open' | 'linked' | 'done' | 'dismissed'` already covers the AI
output side. Command Center writes inbound messages; the existing Brain
runs extractions on demand. Don't duplicate.

### E.4 Storage rules tighten‑up

Add to `storage.rules`:
```
match /inbound_raw/{rawId}/{file=**} {
  allow read:  if request.auth != null && hasStaffRole();
  allow write: if false;     // CF admin SDK only
}
```
And rewrite the existing `communications/{threadId}/…` block to require
`memberUids` membership for reads (currently any authed user can read).

---

## F. Tiered cost estimate (preliminary, 100 messages/day baseline)

Assumes Anthropic API list pricing as of Q2 2026:
- Haiku 4.5: ~$0.80/M input, ~$4/M output
- Sonnet 4.6: ~$3/M input, ~$15/M output
- Opus 4.6: ~$15/M input, ~$75/M output

Typical bounded‑JSON classification call: ~600 input tokens, ~120 output tokens.
Typical Sonnet reasoning call: ~2k input, ~400 output.
Typical Opus on‑demand call: ~4k input, ~1k output.

| Tier | Resolves what | % of traffic | Cost per msg | Daily cost (100 msg) |
|---|---|---|---|---|
| **Tier 1 — code only** | Known sender (email/phone matches existing contact) → known project (single hit on `clientIds`). Pure Firestore lookup. | 60 % | **$0** | **$0.00** |
| **Tier 2 — Haiku classification** | Unknown sender, OR known sender → ambiguous project. Haiku categorizes (category/kind/priority) and emits a structured routing decision. | 35 % | ~$0.00098 (600 in @ $0.80/M + 120 out @ $4/M) | **$0.034** |
| **Tier 3 — Sonnet reasoning** | Genuinely ambiguous routing, draft reply needed, or extraction with chain‑of‑thought. Same Brain that already runs Phase‑3 extractions. | 4 % | ~$0.012 (2k in @ $3/M + 400 out @ $15/M) | **$0.048** |
| **Tier 4 — Opus on demand** | Explicit staff "summarize this whole project" ask, or executive briefing assembly. Never automatic. | 1 % | ~$0.135 (4k in @ $15/M + 1k out @ $75/M) | **$0.135** |
| **Total** | | **100 %** | | **~$0.22/day → ~$6.60/month** |

At 1000 messages/day (10× growth) we're at ~$66/month — still trivial.
The Phase‑3 Brain's existing $5/day budget guard
(`communications_ai_config/global`) covers Tiers 2+3+4 with headroom.

**% allocations are estimates** — Tier 1 is the load‑bearing assumption. If
Tier 1 only catches 30 % (because Gap #1 and Gap #2 aren't closed), Tier 2
costs roughly double. **Closing Gaps #1 and #2 is the single biggest cost
lever for the whole project.**

---

## G. Step‑1.5 close‑outs required before Step 2

Gating the ingestion endpoint on these so the math works:

1. Backfill `contacts.phoneE164` from `contacts.phone` via
   `libphonenumber-js`. Add index on `phoneE164`. Update Contact create/edit
   form to normalize on save.
2. Backfill `contacts.emailLower` from `contacts.email`. Add index. Update
   form to lowercase on save.
3. Write `linkContactToProject(contactId, projectId)` helper + a Cloud
   Function trigger on `projects/{id}` writes that reconciles
   `contacts.associatedProjects`.
4. Add `processed_status` / `confidence` / `verifiedAt` / `inboundRawId`
   fields to `communications/{threadId}/messages/{id}`. No rule change.
5. Create `inbound_raw/{rawId}` collection + rules per E.1 / E.4.
6. Tighten storage rules under `communications/{threadId}/…` to gate reads
   on `memberUids` membership.

After those land, **Step 2** is: build the ingestion endpoint that writes
`inbound_raw/` first, then promotes to `communications/` with verification.

---

## H. Out of scope for this doc (by design)

- The actual ingestion endpoint code.
- Which channel adapters to build first (email/SMS/voice/Telegram order).
- Daily exec briefing assembly (Tier 3+ work).
- Multi‑provider gateways (rule #5 — Anthropic API only).
- A parallel database (rule #4 — Firestore is the SOT).

These come back as Step 2+ after the user signs off on the schema deltas in
sections E and G.
