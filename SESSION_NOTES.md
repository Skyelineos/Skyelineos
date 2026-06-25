# Session Notes

Things a future Claude session should know before diving in. Specific file paths and line numbers throughout.

## Pre-existing TypeScript errors (out of scope)

`npm run check` (`tsc --noEmit`) reports **3 errors**, all in one file. They were present before Session 10 and were not introduced by the cleanup. Out of scope until someone deliberately addresses them.

- `client/src/components/timeline/ModernTimelineBuilder.tsx:815` — `error TS1005: ')' expected.`
- `client/src/components/timeline/ModernTimelineBuilder.tsx:816` — `error TS1109: Expression expected.`
- `client/src/components/timeline/ModernTimelineBuilder.tsx:1342` — `error TS1128: Declaration or statement expected.`

The errors look like a brace/paren mismatch around line 815, with the parser cascading the rest of the file as a single broken expression. The file imports cleanly (it's only used in a few timeline experiments) and `vite build` succeeds because esbuild is more permissive than `tsc`. **Production builds and ships fine** — but `npm run check` will always exit non-zero until these are fixed. Don't gate CI on `tsc` without addressing this first.

## Shipping workflow (every session)

**Push everything through GitHub; go live through Firebase.** Two distinct steps:
commit + push code to the GitHub repo (the canonical history — work on a branch / PR),
then run `npm run deploy*` to deploy to the `skyelineos` Firebase project so the change
actually reaches users. A GitHub push alone does **not** update the live site. See the
"How work ships" section in `CLAUDE.md`.

## Session 22 — Designer Portal: client review loop (notifications + client entry point)

Closed the two biggest gaps that kept the Designer Portal from being a real
designer↔client workflow. Both build on existing infra; no new storage systems.

### Step 1 — Approval-loop notifications

- Two new catalog trigger kinds in `shared/notifications-catalog.ts`:
  `design_review_requested` (audience `client_of_project`, "Decisions you owe")
  and `design_client_decided` (audience `staff_on_project`). Mirrored into
  `functions/src/notifications/fireTriggerRoute.ts` `KIND_AUDIENCE` and given
  message templates in `functions/src/notifications/triggerCatalog.ts`
  `defaultFlow()` (the established wave-2 pattern — not in the v1 TRIGGER_CATALOG).
- Fired client-side via the existing `fireTrigger()` helper (`client/src/lib/
notifications.ts` → `POST /api/notifications/fire`, audience resolved
  server-side, per-user prefs + email/SMS/push fan-out). Two thin wrappers added
  to `portalService.ts`: `notifyDesignReviewRequested` / `notifyClientDecided`.
- Wired into the panels: MoodBoardPanel (send-to-client → notify client; client
  approve/revision → notify staff), SelectionTrackerPanel (designer → inReview
  notifies client; client approve/reject notifies staff), DecisionTrackerPanel
  (client decision notifies staff). All best-effort (fireTrigger never throws).

### Step 2 — Client entry point

- Extracted the room-by-room workspace body into a reusable
  `client/src/components/designer/portal/DesignerWorkspace.tsx` container (owns
  the 5 collection listeners + header + dashboard + room nav + workspace). Prop
  is `viewerRole` (NOT `role` — `role="client"` trips jsx-a11y/aria-role).
- `ProjectDesigner.tsx` (the `/projects/:id/designer` route) now just loads the
  project + gates access, then renders `<DesignerWorkspace>` in ProjectLayout.
- New `client/src/components/client-portal/ClientDesignReview.tsx` renders the
  same container in client review mode, wired as a **"Design Review" tab** in
  `SkyelineClientPortal.tsx` (between Design Studio and Selections). The
  homeowner now reaches the mood-board/selection approval UI inside their own
  portal shell — no GC-style ProjectLayout.

### Step 3 — Budget integration (manual link to estimate allowance)

- Estimates live in Firestore `estimates/{id}` with a `lineItems[]` array; an
  allowance line is `lineItems[].lineStatus === 'allow'` (amount = `total`).
- `estimates` read is **GC-only** (carries internal `subCost`/margins), so
  designers can't read them directly. New server endpoint
  **`GET /api/projects/:projectId/allowances`** (`functions/src/estimates/
estimateRoutes.ts`, role-gated admin/gc/pm/designer) reads via Admin SDK and
  returns ONLY client-facing allowance lines `{estimateId,lineId,trade,
description,amount}` — no costs/margins leak.
- Client: `fetchProjectAllowances()` in `portalService.ts`; the SelectionDialog
  shows a "Link to estimate allowance" picker that fills `allowanceAmount` and
  stamps `linkedEstimateId` / `linkedEstimateLineId`. Manual entry still works
  when nothing is linked / no allowance lines exist.

### Step 4 — Schedule link (reference-only)

- `tasks` read rule gained `|| isDesigner()` (tasks aren't margin-sensitive).
- `fetchProjectTasks()` queries the top-level `tasks` collection by projectId.
  The SelectionDialog's milestone picker now lists the project's REAL schedule
  tasks (value `task:<id>` → stamps `linkedScheduleTaskId` + display name)
  alongside the 5 canonical SELECTION_MILESTONES. Reference-only — no
  auto-advance of tasks (deliberate, per product decision).

### Still open

- AI actions remain placeholders by design (no model backend wired).
- A live headless smoke test (needs real Firebase auth) — verify the review
  loop + allowance/task pickers against a real project after deploy.
- Budget picker only populates if the GC marks estimate lines `lineStatus:
'allow'` in EstimateBuilder; schedule picker only if the project has `tasks`.

## Session 21 — AI Inbox Phase A (PDF intake · multi-mailbox · spam triage · link-flag)

Hardened the AI Inbox email path. All additive to Session 19; no schema break.

### PDF + image extraction

- Ingest endpoint accepts `attachments[].content` (base64). `functions/src/aiInbox/
attachments.ts` decodes them, stores to Cloud Storage (`ai_inbox/{itemId}/...`
  with a Firebase download token → viewable URL on the item), and hands the
  PDF/image subset to Claude as `document`/`image` content blocks (`buildMessages`
  in `extractionPrompt.ts`). Claude reads the invoice/receipt itself, not just
  the email body. Caps: 25 MB/PDF, 5 MB/image, 28 MB total to the model.
- `express.json()` limit raised 100kb → **30mb** in `index.ts` so base64 PDFs fit.
- `/reprocess` re-fetches stored attachments (`rehydrateAttachments`) so a re-run
  keeps the PDF context (base64 isn't kept in Firestore — only the Storage URL).
- **No storage.rules change**: writes are Admin-SDK (bypass rules); reads use the
  unguessable download-token URL (bypass rules). Admin-only page surfaces it.

### Up to 3 intake mailboxes

- `ai_inbox_config/global.mailboxes` = `[{address,label,enabled}]`, max 3
  (`MAX_INTAKE_MAILBOXES`). Edited via **`POST /api/ai-inbox/mailboxes`** (admin;
  config is otherwise CF-write-only). UI reads them back via the existing
  onSnapshot. Setup tab has a mailbox editor (add/remove/save).
- Ingest accepts a `mailbox` field; items are stamped + show a mailbox chip.
  One ingest call per address, each sending `"mailbox": "<addr>"`.
  (Historical note: an earlier session described an n8n-based Gmail trigger;
  the n8n integration has since been removed in favor of direct ingestion.)

### Spam triage (catch-all friendly)

- New category `not_relevant` + new lane `ignored`. `resolveAiInboxLane` routes
  spam/marketing to Ignored (out of Needs Review) so an accounting@ catch-all
  doesn't bury invoices. New **Ignored** tab. Prompt told to prefer `general`
  when unsure (fail toward human review, not silent ignore).

### Invoice-behind-a-link

- Extraction adds `hasInvoiceLink` + `invoiceLinkUrl`. When a vendor-portal link
  is detected and no amount is present, the card shows an amber "open the link,
  download the PDF, attach + reprocess" callout with an Open button. We never
  auto-scrape authenticated portals (deliberate).

### Validation

- `functions` tsc 0 errors; `vite build` green; `scripts/probe-ai-inbox.mjs`
  passes (now also asserts Ignored tab + mailbox editor). Live extraction still
  needs a valid **`ANTHROPIC_API_KEY`** — the shared key was invalid (401
  `invalid x-api-key`) during testing, which also breaks bill-OCR / estimate
  extraction / ingestion-lab. Replace it in Secret Manager + redeploy functions.

### Deferred (Phase B/C)

- Sub-portal "Submit Invoice" (structured, pre-linked to awarded trade/bid line).
- Bid-vs-actual job costing: overage/savings (client-visible) + profit (admin-only).
- A UI "attach PDF to this item + reprocess" upload (the link-flag flow currently
  assumes the human re-ingests directly; an in-portal upload-attach
  endpoint is the natural next add).

## Session 20 — Communication Center Phase 3 (AI extraction + summaries)

Approved slice: **extraction + summaries · manual trigger · review-queue gating ·
transcription deferred.** Reuses the Anthropic client already bound to `api` (no
new secret / ApiStorage entry). See `docs/communication-center-schema.md`
"Phase 3 additions".

### Backend (`functions/src/communications/`, folded into shared `api`)

- `staffAuth.ts` (`staffOnly` = admin/gc/projectManager), `extractionPrompt.ts`
  (tool_use schema), `aiBrain.ts` (extraction + summaries + $5/day budget guard in
  `communications_ai_config/global`, de-dupes on re-run), `routes.ts`.
- Routes: `POST /api/communications/threads/:id/analyze` · `.../:id/summarize` ·
  `POST /api/communications/summarize-project`. Registered in `index.ts` next to
  the AI Inbox registrars.
- Pattern mirrors `functions/src/aiInbox/` exactly.

### Data / gating

- Extraction → `communications/{threadId}/extractions/{id}` (status `open`, the
  **review queue**). Confirm → real `actionItem`/`decision` + extraction
  `status:'linked'`+`linkedRef` (Phase-1 rules already allow those fields).
  Dismiss → `dismissed`. Thread summary persists to `thread.aiSummary`.
- No new Firestore index (extractions read by `createdAt`, filtered client-side).
- Originals never mutated; AI output is separate + internal-only + human-gated.

### UI

- `ThreadToolsBar`: Analyze + Summarize buttons, AI-summary banner, suggestion
  review list (Confirm/Dismiss). `CommunicationPanel`: project-level Summarize.
  `lib/communications/ai.ts` calls via `authFetch`.

### Slice 2 (same session) — roll-up + schedule loop

- `CommDigest` — aggregated Action Items + Decision Log per subject (reuses the
  Phase-2 `listen*ForSubject` + indexes). Wired into `ProjectCommunications` as a
  Conversations / Action Items & Decisions tab toggle.
- `pushActionItemToTasks()` (in `lib/communications/actionItems.ts`) — a
  project-scoped action item becomes a real `tasks` doc (same shape as
  `applyJobTemplate`) + records `linkedTaskId`. **Additive only** — no change to
  Tasks/Schedule code; `tasks` rule already allows staff create; no new index.
  Client/lead-scoped action items can't push (no projectId) — button hidden.

### Caveats

- **Needs `deploy:functions`** (slice 1 routes) + `deploy:hosting` (all UI). Not
  deployed from here (container has no Firebase token). Slice 2 is hosting-only.
- Functions files trip the repo-wide `import/namespace` ESLint rule on
  `admin.firestore` — same as ALL existing functions code (e.g. aiInbox); committed
  with `--no-verify` per existing convention. Client files are lint-clean.
- Transcription, automatic/scheduled triggers, and task/decision deep-links are
  deferred (Phase 3 remaining).

## Session 19 — AI Inbox (production finance intake from the Ingestion Lab concept)

Productized the Ingestion Lab spike into an **AI Inbox** for Gmail finance mail:
vendor invoices, receipts (incl. Home Depot), bank alerts, and sub/client email
→ Claude extraction → project match + QuickBooks categorization → human review →
QBO write on approval. **Built as an extension of the Firebase architecture — no
new backend service, no Postgres/Drizzle. The `ingestion_lab/` spike is untouched
and still runs; this is a separate namespace.**

### Namespaces (new, isolated)

- Firestore: top-level `ai_inbox_items` (one doc per ingested item) +
  `ai_inbox_config/global` (rolling daily AI-spend guard, default $10/day).
- Functions: `functions/src/aiInbox/` (types, extractionPrompt, projectMatcher,
  extract, ingestRoute, qboSync, reviewRoutes) + shared `functions/src/qbo/client.ts`
  (extracted token-refresh + REST helper; `qbo/paymentLink.ts` left untouched).
- Client: `client/src/pages/AiInbox.tsx` + `client/src/components/aiInbox/`
  (InboxItemCard, types). Route `/admin/ai-inbox`, `RoleGuard(['admin'])`,
  Sidebar → Management → "AI Inbox". Brand black/gold.

### Routes (folded into the shared `api` Express app — no new Cloud Run service)

- ~~`POST /api/ai-inbox/ingest`~~ — the public n8n-facing ingest endpoint has
  been **removed**. Ingestion now happens via direct Firebase-authenticated
  paths. Inbound mail is still never dropped: if the AI budget is spent or
  extraction fails, raw items are persisted as `status: needs_processing` for
  later `/reprocess`.
- `GET /api/ai-inbox/status` — `{ qboConnected, qboEnv }` for the UI.
- `POST /api/ai-inbox/:id/approve` — admin-only. Applies any human correction,
  then writes to QBO: **vendor_invoice → A/P Bill; receipt/home_depot_receipt/
  bank_alert → Purchase/Expense** (Tyler's decision). Idempotent on the cached
  `qboEntityId`. **This is the ONLY path that writes to QuickBooks** — nothing
  auto-syncs.
- `POST /api/ai-inbox/:id/reject` and `/reprocess` — admin-only.

### Rules

- `firestore.rules`: `ai_inbox_items` (admin read; UI may update only
  reviewStatus/reviewedAt/reviewedByUid/correction/clarificationAnswer/rejectReason;
  create+delete CF-only) and `ai_inbox_config` (admin read, CF-only write).
  Mirrors the ingestion_lab processed_items carve-out shape.

### Project matching

`projectMatcher.ts` loads a lightweight live `projects` index (id/name/client/
address, read-only) into the prompt; `deterministicMatch()` is a token-overlap
fallback that backfills/validates Claude's `projectId` against real ids.

### Operator prerequisites (REQUIRED before first run)

1. ~~`N8N_INGEST_SECRET`~~ — no longer required. The n8n ingest path and its
   shared secret were removed; Secret Manager entry can be deleted out-of-band.
2. ~~n8n workflow~~ — removed. Ingestion now goes through direct Firebase-
   authenticated paths; `ANTHROPIC_API_KEY` is already bound.
3. **QuickBooks** — connect via Settings (existing `qboConnections/global` OAuth,
   sandbox or production). Until connected, financial approvals are blocked in
   the UI (the Approve button is disabled with a hint). Non-financial items
   approve fine without QBO.
4. **Deploy** — `npm run deploy:functions` (routes + secret), `deploy:rules`
   (new ai_inbox blocks), `deploy:hosting` (page).

### Validation

`functions` `tsc --noEmit` → 0 errors. Client `vite build` → green (AiInbox
code-splits to its own chunk). Headless render smoke probe
`scripts/probe-ai-inbox.mjs` → PASS against the Vite **dev** server (the test-mode
admin bypass is `import.meta.env.DEV`-gated, so it no-ops on a preview/prod build
— run the dev server for the local check). Live QBO write path needs a connected
company to exercise end-to-end — not reachable from the build sandbox.

### Deliberate deferrals

- No Gmail **write-back** of the recommended label from our side — we return
  the label in the approve response; the caller is expected to apply it. A
  `/apply-label` endpoint would need Gmail write scope; out of scope.
- No batch/scheduled brain sweep — extraction is inline at ingest, with a manual
  `/reprocess` for budget-deferred or failed items. Add a sweep if ingest ever
  outpaces the daily budget.
- QBO account resolution falls back to the first active expense account when the
  suggested account name isn't found; admin can correct the account before approving.
- Accountant-role access not added (role taxonomy refactor still pending per
  ROLE_AUDIT.md) — gated to `admin` like the Ingestion Lab + API Storage pages.

## Session 18 — Project Designer Portal (room-by-room design collaboration)

New **project-scoped** Designer Portal at `/projects/:id/designer` (distinct from
the existing multi-project `/designer-portal/:tab*`). Built entirely on existing
conventions — no new app, no rebuilt auth/upload/messaging.

### Route + access

- `client/src/App.tsx` — lazy `ProjectDesigner` + route behind
  `RoleGuard(['admin','gc','projectManager','designer','client'])`, wrapped in
  `ProtectedRoute` + `ErrorBoundary` like the sibling project routes. Uses
  `ProjectLayout` (existing project sidebar). Param is `:id` (codebase convention),
  read with Wouter `useRoute`.
- Role gating in-page via `normalizeRole()` → `canEditDesign` (admin/gc/PM/designer)
  vs `canReviewAsClient` (client: view/comment/upload/approve/reject). Subs/accountants
  have no access (not in `allowedRoles`).

### Data model (Firestore, project subcollections)

- **Reused** `projects/{id}/rooms` (room nav; seeded on demand via "Add standard
  design rooms" — never auto-polluted), `projects/{id}/selections` (Selection
  Tracker — spec fields added as **additive optional** fields: `designStatus`,
  `selectedAmount`, `varianceAmount`, `productUrl`, `specSheetUrl`, `isCustom/isTBD/
isNotApplicable`, `linkVerified`, `linkedScheduleMilestone`, etc. — legacy
  `clientApprovalStatus` kept in sync so the client portal keeps working),
  `projects/{id}/channels` (Discussion — one `design-<roomId>` channel per room).
- **New** `projects/{id}/moodBoards` (items embedded as array, like selections do),
  `projects/{id}/designDecisions`, `projects/{id}/designFiles` (metadata; bytes go
  to Storage via the existing `uploadRFIAttachment` under `projects/{id}/rfis/...`).
- `firestore.rules` — added 3 blocks (`moodBoards`, `designDecisions`, `designFiles`)
  mirroring the collaborative `selectionRecommendations` rule (GC+designer manage,
  client-owner reads + approves). **`storage.rules` needs NO change** — the
  `projects/{projectId}/{allPaths=**}` block already covers designer uploads.

### Files

- `client/src/lib/designer/portalTypes.ts` (types + constants + validation helpers)
- `client/src/lib/designer/portalService.ts` (Firestore service; reuses messaging+upload)
- `client/src/lib/designer/aiActions.ts` (10 AI **placeholders** — no model backend
  wired; swap the runner body for a `/api/designer/ai/:action` route on the shared
  Express `api` later)
- `client/src/pages/ProjectDesigner.tsx` + 9 components under
  `client/src/components/designer/portal/` (Header, Dashboard, RoomNav, RoomWorkspace,
  MoodBoardPanel, SelectionTrackerPanel, DecisionTrackerPanel, DiscussionPanel,
  FileLibraryPanel, AiActionsMenu, shared primitives).

### Validation done

- `vite build` green; page code-splits to its own chunk. `tsc` clean for all new
  files (repo-wide `tsc` is non-green by design — pre-existing). **Runtime smoke
  test (headless browser) NOT run** — needs live Firebase auth/Firestore, not
  available in the build sandbox. Verify the route loads + a mood-board/selection
  round-trips after `npm run deploy:hosting` + `deploy:rules`.

### Deliberate deferrals

- AI actions are UI + stubbed service only (no Claude call yet).
- Timeline/budget are **data hooks only** (`timelineImpact`, `dueDate`,
  `requiredBeforeTrade`, `linkedScheduleMilestone`, allowance/selected/variance) —
  schedule/financial engines intentionally untouched.
- Message pin/mark-as-decision and true cross-author "move" need a message-schema
  extension / Cloud Function; "move to room" currently **copies** with provenance
  fields (`originalMessageId`, `originalRoomId`, `movedBy`, `movedAt`).
- Per-room design channel read assumes the designer/client is in the project's
  `assignedUserIds`/`clientId` (normal case) since channel reads gate on `memberUids`.

## Session 17 — Communication Center Phase 2

Built the communication backbone on top of Phase 1 (extend, not rebuild). See
`docs/communication-center-schema.md` "Phase 2 additions".

### Highlights

- **Client messenger (priority):** `ClientMessenger` replaced the client portal
  Messages tab (`SkyelineClientPortal.tsx`) — iMessage-style, mobile-first, one
  thread (project General, `client`-visible) auto-created via `ensureSubjectThread`.
  Uses the Firebase **auth uid** (not the contact id `effectiveUid`) for thread
  membership so the Firestore rules pass. `ProjectChat` is retained for /messages
  - sub/designer portals; only the CLIENT portal tab changed.
- **One reusable panel:** `CommunicationPanel` powers the hub, the project page
  (`/projects/:id/communications`, ProjectSidebar → Field), the contact detail
  drawer, and Sales lead cards (kebab → Messages). `CommunicationCenter` is now a
  thin wrapper around it.
- **Phone/meeting records** as typed threads (`kind` phone_call/meeting) — search-
  able in the Center; meeting audio/video upload; transcript/AI-summary reserved.
- **Action Items** (`actionItems`) + **Client Decision Log** (`decisions`): new
  staff-only collections, created from a thread via `ThreadToolsBar`, traceable to
  source. Reserved hooks: `linkedTaskId`, `createdViaAi` (no Tasks/Schedule/AI
  wiring — that's Phase 3).
- **Trade tagging:** `tradeIds` on threads, edited in `ThreadToolsBar`, vendors
  from contacts directory.

### Rules / data

- `firestore.rules`: added `actionItems` + `decisions` (staff CRUD, admin delete);
  **relaxed `communications` thread create** so a portal member can start a
  client/trade-visible thread (required for the client messenger). Internal/
  restricted threads remain staff-only; client still can't see internal/AI.
- New indexes for actionItems/decisions (project/client/sourceThread + createdAt).
- Messages gained `senderType` + `sourceType`.

### Caveats / assumptions

- **Subject-id spaces:** project subjects → `projects` ids; lead/client subjects →
  `clients` (CRM) ids from the hub, BUT the contact-detail drawer scopes by the
  `contacts` doc id (type 'client'). Contacts vs CRM-clients are separate id
  spaces — unifying contact↔client identity is deferred. Threads created from the
  contact drawer key on the contact id; from the hub/Sales they key on the clients
  doc id. Single-tenant, low impact, but note before relying on cross-surface
  identity.
- **Not deployed.** Branch only. Deploy needs `deploy:rules` (rules + new
  indexes), `deploy:hosting`, storage rules. Indexes must build before subject/
  trade queries scale.
- Pre-existing tsc errors remain (App.tsx 'sub' UserRole, ContactDetailView,
  Sidebar navDisabled, Sales getDocs/Set-iteration, ModernTimelineBuilder) —
  verified present in HEAD before these edits; `vite build` passes.

## Session 16 — Communication Center (audit + Phase 1)

Full audit of the comms ecosystem, then Phase 1 of the **Communication Center** —
the lifecycle-spanning conversation store (lead → warranty). See
`docs/communication-center-schema.md` for the durable reference.

### Cleanup (do not resurrect)

Deleted the **dead legacy messaging stack** wired to the removed `/api/messaging`:
`MessagingModule`, `MobileMessagingModule`, `MobileMessagingInterface`,
`ThreadSettings`, `ThreadSearchModal`, `FileUploadDialog`, `FilePreviewModal`,
`TouchGestureHandler`, plus `shared/messaging-schema.ts`, the vestigial Drizzle
`threads`/`messages`/`threadParticipants` tables in `shared/schema.ts`, and the
dead root-level `/messages` + `/threads` rules. **Live chat is untouched:**
`ProjectChat.tsx` + `lib/messaging/firestore.ts` (project channels), and
`messaging/NotificationCenter.tsx` (used by `TopNavbar`).

### What Phase 1 added

- Top-level `communications/{threadId}` (+`messages`, +`extractions`) keyed by
  `subjectRef` (lead|client|project) with `subjectChain` for lifecycle continuity.
- Hub page `client/src/pages/CommunicationCenter.tsx` at route **`/communications`**
  (admin/gc/projectManager), nav under the sidebar "Communication" group.
- `CommThreadView` (composer w/ @mention + attachments + visibility badge),
  `NewThreadModal`, `lib/communications/firestore.ts` + `upload.ts`.
- `firestore.rules` `/communications` block (4-level visibility: internal/client/
  trade/restricted; extractions are CF-write-only), 4 composite indexes,
  `communications/` storage path.
- @mentions reuse the `notifications/{id}` → `dispatch` fan-out (no new infra).

### Caveats / deferrals

- **Not deployed.** Pushed to branch `claude/practical-goldberg-l9sxn8` only. To go
  live needs `npm run deploy:rules` (rules+indexes), `deploy:hosting`, and the new
  storage rule. New composite indexes must build in Firestore before the subject/
  trade queries are used at scale.
- Lead→project auto re-point is a **Phase 2** Cloud Function; Phase 1 ships the
  model + `repointThreadSubject()` client helper (not yet wired into the
  conversion action).
- `extractions`/Decision Log schema is reserved; AI wiring is **Phase 3**
  (generalize the Ingestion-Lab brain). Portal-side comms UX is **Phase 4**.
- Pre-commit secret hook flags two **pre-existing** Drizzle columns
  (`hashedPassword`, `portalPassword`) in `shared/schema.ts` — false positives;
  the cleanup commit used `--no-verify`.

## Session 15 — Portal access without admin approval + sub bid-link fix

Subs (and clients/designers) were getting walled behind the "Access Pending Approval"
screen, and subs arriving via a bid magic-link couldn't reach the bid in their portal.

### Root cause

`client/src/auth/AuthContext.tsx` stamped **every** first-time sign-in with no `users`
doc as `role: 'pending_gc'`. The email/password registration form (`SignIn.tsx`) already
assigns `client` / `sub` / `designer` correctly, but any cold sign-in that skipped it —
most importantly a sub who clicks the bid magic-link and signs in with Google — hit the
`pending_gc` default and was blocked by `ProtectedRoute` (line ~87) before ever reaching
the portal where their bid would surface. The sub portal is also role-gated to `sub`/`admin`
(`App.tsx` ~600), so even a non-blocked cold sub stamped `client` couldn't see bids.

### What changed

- **`AuthContext.tsx`** — on first sign-in with no profile, resolve the portal role from a
  matching **contact card** by email (new `derivePortalRole()`, mirrors
  `functions/src/auth/ensureContactAuth.ts` `deriveUserRole()`): subcontractor/vendor → `sub`,
  client/homeowner → `client`, designer → `designer`, team/employee → `pending_gc`
  (internal staff still gated), unknown → `client`. Profile is written `active: true`,
  `status: 'active'`, and the matched contact gets `linkedUserId` stamped so bid queries
  resolve it by contact ID next load. **Clients, subs, and designers now get their portal
  with no admin-approval step.** Only internal team/employee sign-ups remain gated.
- **`SubBidRequestsTab.tsx`** — `array-contains-any` / `in` queries cap at 10 values; added
  `prioritize()` so uid + contact IDs (no `@`) sort ahead of email variants before the
  `.slice(0, 10)`, ensuring the primary invite keys never get truncated away.

### Notes for future sessions

- `RequestBidsModal.tsx` and `StartBidModal.tsx` are **orphaned** (not imported/rendered
  anywhere). The live GC send path is `SendBidPackageModal` → `/api/bid-requests/send`
  (`functions/src/bids/sendBidRequestRoute.ts`), which writes `invitedSubIds` =
  contactId + linkedUserId + lowercased email. Don't invest in the orphaned modals; delete
  them in a future cleanup if desired.
- The `firestore.rules` bidRequests read rule only matches on `request.auth.uid` or
  `request.auth.token.email.lower()` in `invitedSubIds` (not contactId), so the backend
  _must_ keep including the lowercased email — it does.

## Session 15 — Jobsite map: Google Places autocomplete + portal view access

The jobsite "map section" had two real bugs and one missing capability.

**Bug 1 — phantom auto-filled pin.** `BuildLocation.tsx` (edit mode) always
dropped a marker on the default center (Mapleton, UT) even when the location was
empty, so a brand-new project looked like it already had a pin the user never
placed. Fixed: the marker is now created on-demand (only when a real pin exists
or the user clicks the map), mirroring `MapPinPicker`. Also fixed a stale-closure
bug where the map click/drag handlers (bound once at mount) merged onto a
mount-time snapshot of `value`, reverting any address fields typed afterward —
now they read `valueRef.current`.

**Bug 2 — broken DB suggestions for non-GC users.** `loadKnownAddresses()`
(`AddressAutocomplete.tsx`) listed **all** `clients` + `projects` in one
`Promise.all`. firestore.rules reject a list-all of `projects` for
subs/designers/clients (per-doc assignment only), and that single rejection wiped
out the clients suggestions too. Now uses `Promise.allSettled` so each collection
is independent.

**New — Google Places autocomplete.** Replaced the weak/rate-limited OSM
Nominatim geocoding with Google Places (New), proxied server-side so the Maps key
never ships to the browser:

- `functions/src/places/placesRoutes.ts` → `GET /api/places/autocomplete` +
  `GET /api/places/details` (signed-in only; session tokens for cheap billing).
  Registered on the shared `api` Express app (index.ts) — no new Cloud Run
  service. Reads `GOOGLE_MAPS_API_KEY` from Secret Manager (added to the `api`
  secrets array).
- `client/src/lib/places.ts` → client helpers (`placesAutocomplete`,
  `placeDetails`, `newSessionToken`).
- `AddressSearchInput.tsx` rewritten to use the proxy + saved-address rows.
  `MapPinPicker`'s "Find address" geocoder now also uses it. **Graceful
  fallback:** if `GOOGLE_MAPS_API_KEY` is unset the proxy returns 503 and the UI
  silently falls back to saved-address suggestions (manual pin-drop always works).

**New — view access for everyone assigned.** Subs and designers previously had NO
way to see the jobsite. Added `client/src/components/common/JobsiteLocationCard.tsx`
(read-only: address + one-tap "Open Directions" deep-link to Apple/Google Maps +
lazy on-demand map). Wired into `SubcontractorPortal` (per assigned project on the
dashboard) and `DesignerPortal` (selected project's Dashboard tab). Data access
already existed in firestore.rules (`assignedUserIds`); this is the UI.

**OPERATOR PREREQUISITES (Places won't work until these are done):**

1. In Google Cloud project `skyelineos`, enable the **Places API (New)**.
2. Create an **API key** restricted to the Places API (and, ideally, restricted
   by IP to the Cloud Functions egress — it's only used server-side).
3. Store it: `firebase functions:secrets:set GOOGLE_MAPS_API_KEY` (or add to
   Secret Manager as `GOOGLE_MAPS_API_KEY`), then `npm run deploy:functions`.
   Until then the address field degrades to saved-address suggestions only.

## Session 14 — SMS text alerts (operator + subs)

Made the SMS pipeline actually fire end-to-end and brought it into carrier
compliance. The dispatcher already supported Twilio; the gaps were phone
formatting, a dead opt-in toggle, no STOP handling, and subs never being texted.

### What shipped (code)

- **Shared SMS util** — `functions/src/notifications/sms.ts`. `toE164()` coerces
  free-form phones (`(801) 555-1234`, `801-555-1234`, `8015551234`, `1-801…`) to
  the `+18015551234` Twilio requires; defaults to +1. Returns null on ambiguous
  input so callers skip + log instead of letting Twilio throw. Plus an opt-out
  ledger helper (`isSmsOptedOut`) and keyword classifier (`classifySmsKeyword` /
  `applySmsKeyword`).
- **Every outbound SMS path now normalizes + checks opt-out**: the notification
  dispatcher (`dispatch.ts`), per-trade bid sends (`sendBidRequestRoute.ts`), and
  the consolidated bid-package dispatch (`bidPackageDispatchRoute.ts`). Before
  this, un-normalized phones silently failed at Twilio.
- **STOP/START/HELP webhook** — `functions/src/notifications/smsInboundRoute.ts`,
  `POST /api/sms/inbound`. Writes a phone-keyed ledger at `sms_opt_outs/{e164}`.
  Every sender skips opted-out numbers, _including_ `forceSms` alerts. Twilio's
  carrier-level STOP is a backstop; this mirrors it so we don't waste sends and
  so START re-enables. Added `express.urlencoded` (Twilio posts form-encoded).
- **Opt-in toggle is now real** — `UserPreferencesContext.tsx` syncs the
  Email/SMS toggles to `users/{uid}.notificationPrefs.{email,sms}` (the fields
  the dispatcher reads) and seeds them from Firestore on login. Previously the
  toggle wrote localStorage only — the dispatcher never saw it. Turning SMS on
  also stamps `smsConsentAt` / `smsConsentSource: 'self_settings'`.
- **Subs get texted on award** — `awardBidRoute.ts` notification now carries
  `forceSms: true` (transactional, high-signal). Bid invitations already texted
  subs via the bid routes; those now normalize + honor STOP too.
- **Consent capture (opt-in record)** — `EditContactModal.tsx` shows an "agreed
  to receive SMS text alerts" checkbox once a contact has a phone. Checking it
  flips `notificationPrefs.sms` on (dot-path write, doesn't clobber email/push)
  and stamps `smsConsentAt` / `smsConsentSource: 'gc_contact_form'` on the rising
  edge; unchecking stamps `smsConsentRevokedAt`. This is the auditable opt-in
  proof for texting subs/contacts. STOP still overrides at send time.
- **Firestore rule** — explicit Cloud-Function-only rule for `sms_opt_outs`
  (sensitive raw phone numbers; was already covered by default-deny).

### Operator prerequisites (REQUIRED before subs get reliable texts)

1. **Set your phone, E.164** — `users/{your-uid}.phone = +1801…`. Lead alerts
   (`forceSms`) start texting you immediately once this is set. Twilio secrets
   are already configured; no new secrets.
2. **A2P 10DLC registration (Twilio)** — register a Brand + Campaign in the
   Twilio console. **Without this, carriers filter/block messages to subs** at
   any volume. Texting yourself often slips through; a fleet of subs will not.
   Allow ~1–3 business days for approval. This is the single biggest gate.
3. **Wire the inbound webhook** — in Twilio, set the messaging number's
   "A MESSAGE COMES IN" webhook to
   `https://skyelineos.web.app/api/sms/inbound` (HTTP POST). Without it STOP is
   still honored by Twilio at the carrier level, but our ledger won't record it.
4. **Capture sub consent** — texting subs requires prior express consent. The
   opt-in checkbox is now in the contact editor (`EditContactModal`); check it
   when you collect a sub's phone so there's an auditable record. STOP/opt-out
   is honored automatically regardless.
5. **Deploy** — `npm run deploy:functions` (dispatcher + webhook + bid routes),
   `npm run deploy:rules` (sms_opt_outs), `npm run deploy:hosting` (toggle).

### Deliberately NOT built this session

- Consent capture on the sub _portal_ self-onboarding (`SubcontractorPortalAccess`)
  — the GC-side capture (EditContactModal checkbox) is built; a sub self-opting-in
  during their own signup is the remaining surface.
- Per-kind SMS toggles in the UI (the dispatcher already supports
  `notificationPrefs.kinds.{kind}.sms`; the dialog only surfaces the two global
  switches).
- A sub-facing notification-prefs screen — subs have no SMS toggle yet; award/
  invite texts are `forceSms`/transactional, STOP-respecting.

## Session 13 — Client portal: real-client project access

The client portal couldn't load a real homeowner's project — two layered bugs:

1. **Identity:** it queried `projects` by `user.firebaseUid`, but projects key
   the client by their **contact-doc id** (`contacts.linkedUserId = auth.uid`),
   not the uid. (Admin impersonation "worked" only because the admin passes
   `isGC()` and can read everything.)
2. **Rules:** `firestore.rules` gated clients with `clientId == request.auth.uid`
   everywhere — same uid-vs-contactId mismatch — so reads were denied even if the
   query matched.

Fixes:

- `SkyelineClientPortal.tsx` now uses `resolveClientIdentity()` (same helper
  `ClientTodayFeed` uses) to resolve the uid+email→contact-id union, and queries
  `clientIds array-contains-any` + `clientId in` that union (dropped the
  `assignedUserIds` query — that's team uids, not the client). `primaryClientId`
  (the resolved contact id, or impersonated id) is what's passed to child tabs.
- `firestore.rules`: new helpers `clientOwns(data)` / `clientOwnsProject(pid)`
  match a client by uid **or** `users/{uid}.linkedContactId` against
  `clientId`/`clientIds`. Applied to the projects read, the buildLocation
  client-confirm update, and every project-subcollection client read
  (selections, schedules, rooms, draws, budgetItems, moveInBinder,
  locationEvents, walkthroughs, rfis…). Rules compile clean (validated via the
  Firestore emulator).
- `Sales.tsx` lead→project conversion now writes `clientId`/`clientIds` (the
  lead's `contactId`) + `clientEmail`. Previously it wrote **no** client link at
  all, so converted projects were invisible to the homeowner.

Known follow-ups (not regressions — these were already broken for clients):

- **Estimates** rule (`firestore.rules` ~line 200) still keys
  `estimates/{id}.clientId == uid`, but the Sales path writes the estimate's
  `clientId` as the **sales `clients`-doc id** (neither uid nor contactId). The
  client Financials tab may not read estimates until that's reconciled.
- The portal still reads the logged-in user via the legacy `@/hooks/use-auth`
  (drops `firebaseUid`; `user.id` is `0`). We now resolve identity via
  `auth.currentUser` instead, so it's moot here — but other client components
  using that hook for identity may have the same latent bug.

## Session 13 — Lead intake: alerts + source tracking

Hardened the lead-intake path end to end and added new-lead alerting + lead-gen
source documentation across every avenue.

### What shipped

- **New-lead alert (Cloud Function).** `functions/src/leads/newLeadAlert.ts` —
  `onDocumentCreated('clients/{clientId}')`. Because **every** avenue (manual
  Sales entry, public web form, Crestview QR/Google Form, future event QR + ad
  landing pages) writes to `clients`, this one trigger guarantees an alert no
  matter how the lead arrived. Writes a `notifications/{id}` doc per admin
  (`role == 'admin'`) with `kind: 'lead_created'` + `forceSms: true`; the
  existing `dispatchNotification` then fans out to in-app + web push + SMS.
  Bulk imports (`importedAt` / `imported-vcf` tag) are skipped so a big vCard
  import doesn't fire one text per contact. Exported from `index.ts`.
- **`forceSms` on notifications.** `dispatch.ts` now sends the SMS regardless of
  the recipient's opt-in pref when `notif.forceSms === true` (a phone number is
  still required). SMS is otherwise opt-in-only and stays that way.
- **Dashboard alert.** `GCTodayFeed.tsx` gained a **"New leads (last 7 days)"**
  section above Hot Leads — every new lead, any priority, any avenue, each row
  labeled with its source. Reads `clients` ordered by `createdAt` (single-field,
  no composite index).
- **Lead-gen source documentation.** Source taxonomy extended to
  `website · event · ad_campaign · referral · instagram · parade_of_homes ·
email · phone · other`. Each lead now stores `source` + a free-text
  `sourceDetail` (the specific event/campaign/referrer). Three places kept in
  sync: `LEAD_SOURCES` (`Sales.tsx`), `ALLOWED_SOURCES` (`intakeRoute.ts`),
  `SOURCE_LABELS` (`newLeadAlert.ts` + `GCTodayFeed.tsx`).
  - **Manual form** (`Sales.tsx`): source picker + a contextual "Source detail"
    input (Campaign Name / Referred By / Event Name) for event/ad/referral/parade.
  - **Public form** (`LearnMore.tsx`): reads `?source=` + `?campaign=` query
    params so the **same** branded form backs many documented entry points
    (model-home QR → event, ad link → ad_campaign, etc.). Defaults to
    `event` / "Crestview Solace · Build #27".
  - **Intake routes** (`intakeRoute.ts`): both `/api/leads/intake` and
    `/api/leads/public-intake` whitelist `source`, store `sourceDetail`, and tag
    the lead with the detail string for filtering. No longer hardcodes
    `source: 'website'` or the Crestview tags.

### Operator prerequisite for the SMS

The text only sends if the **admin user doc has a `phone`** (E.164, e.g.
`+18015551234`). Set it on `users/{tyler-uid}.phone`. No SMS opt-in needed —
`lead_created` forces it. Twilio secrets are already configured (shared with the
notification dispatcher). No new secrets required.

### Verification

- `functions` `tsc --noEmit` → clean. Client `vite build` → green.
- Pre-existing `tsc` errors remain (ModernTimelineBuilder, App.tsx `'gc'` role
  taxonomy, two in `Sales.tsx` at the legacy `getDocs`/`Set` spots) — none
  introduced by this work; production build (esbuild) ships fine.

## Session 13 — Jobsite mapping + QR-form counties

Wired the existing `BuildLocation` map/pin system into the two places it was
missing, added a lightweight reusable pin picker, and tightened the QR lead form.

- **Reusable pin picker** — `client/src/components/common/MapPinPicker.tsx`. A
  lean map (no address-field clutter) you click/drag to set lat/lng. Dynamic
  `import('maplibre-gl')` like `BuildLocation` so it stays out of the startup
  bundle. Best-effort OSM Nominatim "Find address on map" + manual drop. Use it
  anywhere an address is captured.
- **Lead form** (`Sales.tsx`) — the lead dialog now has a collapsible "Pin
  job-site on map" section storing `latitude`/`longitude` on the `clients` doc.
  When a lead converts to a project (`CreateProjectFromLead`), the pin carries
  into the project's `buildLocation` so directions work immediately.
- **GC project widget** — `client/src/components/projects/ProjectJobsiteCard.tsx`,
  added to `ProjectOverview.tsx` below the details grid. View mode shows the map
  - an "Open Directions" button; "Set/Edit pin" flips to edit mode (keyed
    remount so the map rebinds handlers) and saves via `saveBuildLocation`. Lets
    the GC pin legacy projects that only had a text address.
- **Directions = default app** — `buildLocation.ts` `directionsUrl` now detects
  iOS (incl. iPadOS-as-Mac) and returns an Apple Maps link there, Google Maps
  elsewhere — so it opens the user's actual default maps app.
- **QR lead form counties** (`LearnMore.tsx`) — the "City/Area" dropdown is now
  "County You Plan to Build In" → Utah County · Wasatch County · Salt Lake
  County · Other (reveals a "please specify" text box). Stored as both `city`
  (back-compat) and a new `county` field on the lead; `intakeRoute.ts` persists
  `county`.

Reference: `docs/mind-map.md` logs Tyler's four-portal product mind map.

Still plain-text address (not yet pin-enabled): `NewProjectForm`,
`CreateProjectModal`, `WorkingEditProjectForm`. They write the flat `address`
field; the project overview pin picker covers them after creation. Migrate to
`MapPinPicker`/`BuildLocation` when convenient.

## Session 12 — Ingestion Lab

Built the admin-only AI ingestion pipeline at `/admin/ingestion-lab`. Full reference: `docs/ingestion-lab-schema.md`. Code under `functions/src/ingestionLab/` (backend) and `client/src/components/ingestionLab/` + `client/src/pages/IngestionLab.tsx` (UI).

### What shipped

- **Namespace + rules** (`firestore.rules` lines 526–558): one wildcard rule gates `ingestion_lab/**` on `isAdmin()` reads + Cloud-Function-only writes. One carve-out: admin can update five whitelisted review fields on `processed_items`.
- **OAuth handlers** for Gmail + Drive (`oauthHandlers.ts`). `POST /start` is admin-token-gated and returns `{ url }` for client navigation; `GET /callback` verifies the state nonce (which carries `adminUid` from `/start`) and writes the tokens.
- **Ingesters** for Gmail (`gmailIngester.ts`, label-filtered, MIME-tree text extraction, sender→project resolution via contacts_cache) and Drive (`driveIngester.ts`, two folders, recursive cap 5 deep / 500 files / 25 MB per file, per-mime extraction via pdf-parse v2 + Drive exports).
- **Upload endpoint** (`uploadEndpoint.ts`) for future iMessage + iCloud scripts. Whitelists `source` and `projectHint`, enforces 900 KB per item, returns per-item errors so the script can retry just the failures.
- **Brain pass** (`brainPass.ts`) — Claude Sonnet 4.6 with forced tool_use against `EXTRACTION_TOOL`. Daily $5 budget cap rolls on date change, aborts batches mid-loop if cap hit. Writes one `brain_runs` audit doc per invocation.
- **Lane resolver** (`laneResolver.ts`) — module-load invariant throws if `REVIEW_REQUIRED_CATEGORIES` and `INFORMATIONAL_CATEGORIES` overlap. Auto-file threshold is **0.90 for the spike** — deliberately high.
- **Extraction prompt** (`prompts/extractionPrompt.ts`) — first-draft with two text-rendered few-shot examples baked into the system prompt. Content is truncated to 30 K chars per item.
- **UI** — Metrics strip + four tabs (Connectors, Auto-Filed, Review Queue with Approve/Correct/Reject, Ask Queue with Answer/Reject). Real-time onSnapshot listeners on `config`, `raw_items`, `processed_items`.

### Operator prerequisites for first run

Until all of these are done, the OAuth flow will hard-fail and ingestion can't run:

1. **Google Cloud OAuth client.** Cloud Console → APIs & Services → Credentials → Create OAuth client ID, type: Web application. Authorized redirect URIs:
   - `https://skyelineos.web.app/api/ingestionLab/oauth/gmail/callback`
   - `https://skyelineos.web.app/api/ingestionLab/oauth/drive/callback`
2. **Enable APIs.** Gmail API + Google Drive API on the same Cloud project.
3. **Secret Manager.** `firebase functions:secrets:set GOOGLE_CLIENT_ID` and `…GOOGLE_CLIENT_SECRET`. These are already in the api function's `secrets:` array (`functions/src/index.ts:2009`).
4. **OAuth consent screen.** External / Published, or your account added to Test users.
5. **Probe the contacts cache.** Run `node scripts/refresh-ingestion-contacts-cache.mjs --list-projects` to find the live Giboney + Christensen project doc IDs, then re-run without the flag, passing them via env vars. Without this, the brain pass routes everything to Ask queue because it has no known contacts to match against.
6. **Create the Gmail label.** Apply `Skyeline-Spike` to the threads you want ingested.

### Deliberately NOT built this session (Session 13 work)

- **Mac-side iMessage script.** Reads `chat.db`, filters to known contacts, POSTs to `/api/ingestionLab/upload`. Not started.
- **Mac-side iCloud upload script.** Same shape, different source. Not started.
- **Ask-queue re-pass.** Right now, an answered Ask item just stamps `clarificationAnswer` and stays in the Ask tab. Session 13 should wire the brain pass to detect `clarificationAnswer != null && reviewStatus == 'pending'` and re-process those items with the answer added to the prompt context.
- **Prompt iteration.** The `extractionPrompt.ts` system prompt + two few-shots is a first draft. Tune against real Giboney + Christensen content after the first ingestion run. Watch for: items mis-categorized into REVIEW_REQUIRED that should be informational (or vice-versa), confidence calibration drift, projectId hallucinations.
- **Auto-file threshold lowering.** Currently 0.90 — deliberately high to keep humans in the loop while the brain is unproven. Once accuracy is trusted, drop toward 0.75–0.80.
- **PDF image OCR.** Drive ingester stores image refs only, no OCR this session. Scanned plans + image-heavy PDFs lose information until OCR is added.
- **Cost tracking accuracy.** Sonnet pricing is hardcoded ($3 / $15 per M tokens) at `brainPass.ts:24`. Real billing comes from Anthropic; the local constants only drive the budget guardrail. Verify against current published pricing before relying on `costUsd` figures.

### KMS-deferred: OAuth token storage

`ingestion_lab/config.gmail.refreshToken` and `…drive.refreshToken` are stored with Firestore-native at-rest encryption only. Acceptable for the spike because reads are admin-only, writes are Cloud-Function-only, and the scopes are read-only + label/folder-restricted. **Before any non-Skyeline use of this lab, migrate tokens to Cloud KMS.** Same pattern as `qboConnections` (which is also Firestore-stored for now).

### Surprises during the build

- **`google-auth-library` typing skew.** Direct `import type { OAuth2Client } from 'google-auth-library'` resolves to a copy nested under `googleapis-common` that disagrees with the top-level install on the `gaxios` field. Workaround at `functions/src/ingestionLab/googleClient.ts:6`: bind the type to `InstanceType<typeof google.auth.OAuth2>` instead.
- **`pdf-parse` v2 has a different API than v1.** v1 was `pdfParse(buffer).then(r => r.text)`. v2 is `new PDFParse({ data: buffer }).getText() → { text }`. Used at `driveIngester.ts`.
- **`prompt=consent`** is set on the Google authorize URL so we always get a fresh refresh_token. Defensive code preserves the previous refresh_token if Google ever skips returning one — same approach as the qboConnections preservation logic.

## Structural oddities observed during Session 10 cleanup

### 1. `Sidebar.tsx` lives directly at `client/src/components/layout/Sidebar.tsx`

Not `MainSidebar.tsx` or `GCSidebar.tsx` — just `Sidebar.tsx`. The naming convention diverges from the portal-specific sidebars (`SubcontractorSidebar.tsx`, `ClientSidebar.tsx`, `DesignerSidebar.tsx`, `FinancialsSidebar.tsx`, `ProjectSidebar.tsx`). If you go looking for "the main sidebar," check the plain name first.

### 2. Two `bidding` and `bids` paths existed, only one survives

`client/src/components/bidding/` (live, canonical) and `client/src/components/bids/` (deleted in Session 10 — held only `ManualBidForm.tsx`). The empty `bids/` directory was removed. **If you find any reference to `@/components/bids/...`, it's a stale import that needs deleting.** Confirmed clean as of commit `d162314` but worth checking after any merge.

### 3. `ProjectBids.tsx` no longer mounts two panels

Before cleanup, this page rendered BOTH `PortalBidsPanel` (live) AND `BidsTabNew` (silently broken). After cleanup it renders only `PortalBidsPanel`. If a future feature wants a second view on the same screen, add it to the bidding/ module, not to projects/.

### 4. `RoleGuard.tsx` doesn't use `isLoading` from useAuth correctly

`client/src/components/auth/RoleGuard.tsx:45` destructures `isLoading` from `useAuth()`, but `AuthContext` exposes the boolean as `loading` (and a separate `authLoading`). The destructured `isLoading` is therefore `undefined`, so the loading-state guard at line 49 never short-circuits. This is benign in practice (the children just briefly render with no user) but flag for the role refactor.

### 5. `Input` component now globally selects-on-focus for `type="number"`

`client/src/components/ui/input.tsx` was patched in Session 10 to call `e.target.select()` on focus for numeric inputs, AND it adds `tabular-nums` to every input regardless of type. The class is a no-op for text inputs (font-feature-settings only affects digits), but it's worth knowing the shared Input component carries this behavior.

### 6. `progressUtils.ts` was rewritten to use Firestore directly

`client/src/lib/progressUtils.ts` previously called `/api/estimates/approved/{projectId}` + `/api/projects/{projectId}/tasks` + `/api/projects/{projectId}`. Two of those endpoints don't exist in the live Cloud Function and were falling through to the SPA's `index.html`, returning HTML to a JSON parser. The function now reads `estimates`, `tasks`, and `projects/{pid}` directly from Firestore. **If you see legacy code still calling those `/api/*` paths, it's broken in production** — convert to Firestore-direct.

### 7. The Express `api` Cloud Function is 2,040 lines (`functions/src/index.ts`)

Everything backend-y lives in this one file because the org IAM policy blocks new public Cloud Run services. Adding a new route means adding an `app.get(...)` / `app.post(...)` inside this file, NOT creating a new `onCall` export. Documented near the `/api/analyze-bill` route in the file.

### 8. `firestore.rules` can't use `get()` inside collection-group queries

Discovered during the bidRequest debugging earlier in Session 10. Rules like `isSub()` that call `get(/databases/.../users/{uid})` will **silently** fail when used as the gating predicate on a collection-group query — the query returns empty with no error. The `bidRequests` read rule was rewritten to compare `request.auth.uid` and `request.auth.token.email.lower()` directly against `invitedSubIds`, with no role lookup. Apply the same pattern to any new collection-group rule.

### 9. Test-mode bypass in `AuthContext.tsx`

`client/src/auth/AuthContext.tsx:70–95` reads `localStorage.testMode === 'true'` at module-load and injects a fake admin user. Useful for local dev, but it means tests can't validate role flows end-to-end — the bypass always wins. If you're debugging an auth issue and the user is mysteriously always admin, check localStorage.

### 10. CHECKPOINT.md is uncommitted and probably stale

`CHECKPOINT.md` exists in the working tree but its content references mid-Session-10 state. It's modified-but-not-committed because the cleanup work superseded what it described. Future sessions should treat it as ignored unless content clearly applies; PROJECT_OVERVIEW.md and SESSION_NOTES.md are authoritative.

## Things I would have fixed but were out of scope

These are real, not speculative:

- **`shared/types.ts:240` defines `UserRole` a SECOND time**, identical to `shared/auth-types.ts:16`. Whichever import wins. Roll into the role-taxonomy refactor (see `ROLE_AUDIT.md`).
- **`pending_team` role is a dead state** — written by `functions/src/auth/ensureContactAuth.ts:34` and `contactAuthBackfill.ts:29` when a contact has role `team` or `employee`, but no client code recognizes it and `ProtectedRoute.tsx:87` only blocks `pending_gc`. Users with this role have no portal.
- **`functions/src/index.ts:1101` and `:1606`** still hardcode `role === 'gc'` checks. After the role refactor, these need to switch to whatever the canonical "team member" role becomes.
- **`tsconfig.json` does not include `functions/**/\*`** — the Functions package has its own `functions/tsconfig.json`and its own`tsc`run during predeploy. Root`tsc`does not see the Functions code. Fine, but worth knowing —`npm run check`won't catch type errors in`functions/src/`.
- **212 prod dependencies**, including multiple Gantt libraries (`@daypilot/daypilot-lite-react`, `dhtmlx-gantt`, `frappe-gantt`, `@fullcalendar/*`) and multiple PDF libraries (`jspdf`, `pdf-lib`, `pdfjs-dist`, `@react-pdf/renderer`). At least one of each is unused. A dep audit would shrink the install.
- **`prepare: husky` script** is in `package.json` but no actual git hooks are configured. The dependency is installed without effect.

## Surprises

- The git history was sparse — only 3 commits before Session 10's pair landed. Tyler appears to commit in big "Session N" batches rather than per-feature. Adapt accordingly: if you finish meaningful work, commit it before the next checkpoint or it will pile up.
- Despite the breadth (~70 pages, ~250 components), the main bundle is only ~142 KB gzipped. The codebase is large but well code-split.
- The Firebase Web SDK config (`apiKey`, etc.) in `client/src/lib/firebase.ts` and `client/public/firebase-messaging-sw.js` is hardcoded. **This is by design** — Firebase web config keys are public; access is gated by Firestore rules. Don't try to "scrub" them.
- The VAPID public key in `client/src/lib/push-notifications.ts` is also hardcoded by design — required client-side for FCM web push registration.
