# Project Information Architecture Audit

**Date:** 2026-06-16
**Stance:** Verify the **project is the single source of truth** for every category of home-build information. Verify every persona (GC, PM, designer, sub, client) reads from that store. Verify bid packages auto-pull relevant project info per trade.
**Method:** Code walk over `origin/main` at `a3ba514` (post-merge of bid-packages + estimate-import-project-scope-fix). Cross-referenced with `docs/Skyelineos_CTO_Audit_2026-06-16.md` Section 6.3 source-of-truth list.

---

## Executive verdict

The project doc + its subcollections are the *intended* central store — but **eight categories drift across multiple parallel stores today**, and **bid packages don't auto-pull from the project's existing plans, selections, specs, allowances, or schedule** — Tyler re-uploads or re-types every send. Personas have lopsided access: subs bid in the dark (no selections, no mood board, no allowance target); designers don't see master plans or schedule; PMs are gated out of budget. Top three highest-impact fixes: **(1) auto-attach project plans to bid packages by trade tag, (2) finish the change-order migration the audit thought was done (server still writes the deprecated subcollection), (3) auto-attach selections to bid packages where category matches trade.**

---

## Per-category audit (16)

### 1. Plans

**Storage:**
- Live: `documents/` (top-level, `category: 'plans'`, `projectId` field) — write in `client/src/components/projects/setup-wizard/Step5Plans.tsx:84`
- Storage path: `projects/{id}/plans/{ts}-{filename}`
- Parallel: `projects/{projectId}/bid-packages/{filename}` for plans Tyler re-uploads inside `SendBidPackageModal.tsx:270-285`

**Source of truth:** Dual. Master plans land in `documents/`; bid modal re-uploads the same files to a separate Storage path with no link back.

**Persona access:**

| Persona | Reads | Surface | Verdict |
|---|---|---|---|
| GC | yes | Sidebar → Documents (`DocumentsTab`) | OK |
| PM | yes | same | OK |
| Designer | partial | `projects/{id}/designFiles` subcollection only — not master `documents/` plans | weak |
| Sub | partial | Only what Tyler re-uploads inside the bid request | weak |
| Client | yes | Client portal Documents tab | OK |

**Project-page integration:** N — `ProjectOverview.tsx` doesn't surface plans.
**Bid package integration:** N — Tyler must re-upload via `handlePlanUpload` (line 269); no read from `documents` where `category=='plans'`.

**Recommended fix:** "Project Plans" picker in `SendBidPackageModal` that queries `documents` with smart trade-default selection (A-sheets → finishes; S-sheets → framing; M/E/P → trades). Expose plans on `ProjectOverview` as a dedicated card.

---

### 2. Design boards

**Storage:**
- Live: `projects/{id}/moodBoards` — `client/src/lib/designer/portalService.ts:126`
- Separate: `inspiration/` top-level keyed by `clientContactId` (NOT projectId) — `client/src/components/client-portal/InspirationBoard.tsx:56`

**Source of truth:** Scattered. Mood boards are per-project; client inspiration is per-contact and divorced from the project.

**Persona access:**

| Persona | Reads | Surface | Verdict |
|---|---|---|---|
| GC | partial | `GCDesignSnapshot` reads selections only — no mood boards | weak |
| PM | no | nothing | gap |
| Designer | yes | `MoodBoardPanel`, `DesignerDashboard` | OK |
| Sub | no | nothing | gap |
| Client | partial | `InspirationBoard` (own inspiration only, not designer's mood board) | weak |

**Project-page integration:** N.
**Bid package integration:** N — finish trades (tile, cabinets, paint) never see the mood board guiding the look.

**Recommended fix:** Move inspiration to `projects/{id}/inspiration`; expose mood boards to GC + client via project page; allow optional mood-board attachment to finish-trade bid packages.

---

### 3. Selections

**Storage:**
- Live: `projects/{id}/selections` — writes in `SelectionsManager.tsx:81-83, 267, 451, 494`, `RoomManager.tsx:110/180`, `SeedSelectionsFromTemplate.tsx:60-75`, server approval in `functions/src/index.ts`
- Dead-ish: `designSelections/` top-level — written only by `ImportCenter.tsx:562` mock importer; read once by `DesignerTodayFeed.tsx:34`

**Source of truth:** Single canonical (`projects/{id}/selections`). `designSelections/` is vestigial — delete + migrate `DesignerTodayFeed` to `collectionGroup` query.

**Persona access:**

| Persona | Reads | Surface | Verdict |
|---|---|---|---|
| GC | yes | `GCDesignSnapshot`, `ContractorSignoffQueue`, `SelectionsProgressCard` | OK |
| PM | yes | `SelectionsProgressCard` via overview | OK |
| Designer | yes | `SelectionsManager`, `SelectionTrackerPanel` | OK |
| Sub | **no** | not surfaced — sub sees free-text scope only | **gap** |
| Client | yes | `SelectionsBoard`, `SelectionsTab`, `SelectionsWizard` | OK |

**Project-page integration:** Y (Partial) — `SelectionsProgressCard` on `ProjectOverview.tsx:295`.
**Bid package integration:** N — `SendBidPackageModal` can't attach the client's chosen tile/fixture. Sub bids in the dark.

**Recommended fix:** When trade matches a selection category (Tile → Tile, Plumbing → Fixtures), auto-include `selectedOption` JSON + photo in the request payload; surface on `SubBidSubmissionForm.tsx:498`.

---

### 4. Appliances

**Storage:** No dedicated collection.
- Pre-install: `projects/{id}/selections` with category "Appliances"
- Post-install: `projects/{id}/moveInBinder`

**Source of truth:** Scattered. Pre-install in selections; post-install in binder; no link between the two.

**Persona access:**

| Persona | Reads | Surface | Verdict |
|---|---|---|---|
| GC | yes | via selections / Move-in Binder tab | OK |
| PM | yes | same | OK |
| Designer | yes | through SelectionsManager (if appliance category) | OK |
| Sub (installer) | no | no surface | gap |
| Client | yes | SelectionsBoard + Move-in Binder | OK |

**Project-page integration:** N — only via Move-in Binder sidebar tab.
**Bid package integration:** N — appliance install/delivery bids can't see model #s + specs.

**Recommended fix:** Treat appliances as `kind:'appliance'` selection sub-type with `modelNumber`, `sku`, `deliveryDate` fields; auto-promote to `moveInBinder` on `status=='installed'`; attach to Appliances bid packages.

---

### 5. Specifications (scope of work)

**Storage:**
- Per-trade text: `projects/{id}/bidRequests/{id}.scope` + `projects/{id}/bidPackages/{id}.commonNotes` (`SendBidPackageModal.tsx:333`)
- Trade defaults: `companySettings/{...}/descriptionTemplates` (`SendBidPackageModal.tsx:209-230`)
- Estimate-level: `estimates/{id}/lineItems[].description`
- Project-level: `project.scopeStatement` (Step7Scope.tsx, read by `SubBidSubmissionForm.tsx:209`)

**Source of truth:** Scattered. Same scope text gets written into estimate descriptions, bid-request scope, AND trade-template defaults — none reconciled.

**Persona access:**

| Persona | Reads | Surface | Verdict |
|---|---|---|---|
| GC | yes | EstimateForm + SendBidPackageModal + Step7 | OK |
| PM | partial | only via estimate; cannot edit bid scope from project | weak |
| Designer | no | not exposed | gap |
| Sub | yes | bid request payload | OK |
| Client | no | `scopeStatement` isn't surfaced in client portal | gap |

**Project-page integration:** N.
**Bid package integration:** Y (Partial) — relies on per-trade saved defaults; no link to estimate line items, selections, or specs library.

**Recommended fix:** Make `descriptionTemplates` the single source for trade scopes + `projects/{id}/scopeOverrides` map. Auto-include relevant selections + plan pages by trade tag.

---

### 6. Allowances + budgets

**Storage:** **Triple-stored.**
1. `project.allowances` map — `Step4Budget.tsx:33`, NewProjectForm
2. `selection.allowanceAmount` per-selection — `SelectionsManager.tsx`, `SelectionTrackerPanel.tsx:433`
3. `projects/{id}/budgetItems/{id}` subcollection — `BudgetVsActualTab.tsx:89-141`, read by `ClientFinancials.tsx:351`

**Source of truth:** Scattered. Three live stores; no sync.

**Persona access:**

| Persona | Reads | Surface | Verdict |
|---|---|---|---|
| GC | yes | `BudgetVsActualTab`, `SelectionsProgressCard` | OK |
| PM | partial | budget tab gated behind financials role | varies |
| Designer | yes | `SelectionTrackerPanel` reads per-selection allowance | OK |
| Sub | no | not visible | gap (expected) |
| Client | yes | `ClientFinancials` reads `budgetItems`; `SelectionsBoard` reads per-selection | OK |

**Project-page integration:** Y — `SoftBudgetBadge` + financials cards.
**Bid package integration:** N — sub bids don't get told the target allowance for that trade.

**Recommended fix:** Make `projects/{id}/budgetItems` canonical; compute `project.allowances` map as a derived view; on `SelectionsManager.create`, read `budgetItems[category].allowance` rather than free-typing. Optionally expose target allowance to subs as upper bound.

---

### 7. Schedule

**Storage:**
- Live: `schedules/{projectId}` top-level — `useSchedulePersistence.ts:17`, `projectDefaults.ts:170`
- In rules but unused in code: `projects/{projectId}/schedules/{scheduleId}` — `firestore.rules:140`
- Tasks-derived: `tasks/` (start/end dates)

**Source of truth:** Single (`schedules/{projectId}`) — but rules expose a dead subcollection that creates ambiguity. Audit 6.3 confirmed.

**Persona access:**

| Persona | Reads | Surface | Verdict |
|---|---|---|---|
| GC | yes | `GanttChart`, `ScheduleSlipAlarmCard` | OK |
| PM | yes | Schedule tab + tasks | OK |
| Designer | partial | `PhaseTimelineView` reads selections phases, not schedule doc | weak |
| Sub | partial | Their own task dates only | OK for now |
| Client | yes | Schedule tab in portal | OK |

**Project-page integration:** Y — schedule slip on overview (`ProjectOverview.tsx:172`).
**Bid package integration:** Y (Partial) — `defaultDueDate` per package; per-trade start/end not auto-pulled from schedule.

**Recommended fix:** Drop `projects/{id}/schedules` from `firestore.rules`. Pass schedule into bid package — show sub their phase window.

---

### 8. Permits

**Storage:** Top-level `permits/` collection in `firestore.rules` — but **no writes or reads in active code**. Only mention is `ImportCenter.tsx:723` (mock CSV importer).

**Source of truth:** None. Permits are effectively absent.

**Persona access:** All personas: **no surface.**

**Project-page integration:** N.
**Bid package integration:** N — electrical/plumbing subs can't see permit numbers.

**Recommended fix:** Build `permits/` writes from a "Permits" sidebar tab; attach permit doc URLs (Storage) per category (building, electrical, plumbing, mechanical). Auto-include on relevant bid packages and on the GC overview.

---

### 9. Contracts

**Storage:** Single top-level `contracts/` with `projectId` field — `client/src/lib/contracts/firestore.ts:8`, writes in `ContractEditor`, `MyContractsView`, `ChangeOrderRequestModal:46-73`, `functions/src/contracts/commenceRoute.ts:81`.

**Source of truth:** Single. Clean.

**Persona access:**

| Persona | Reads | Surface | Verdict |
|---|---|---|---|
| GC | yes | `ContractEditor`, `ContractProfitCard` | OK |
| PM | yes | same | OK |
| Designer | no | not surfaced | acceptable |
| Sub | yes | `MyContractsView` (their own) | OK |
| Client | yes | "Contracts" tab in client portal | OK |

**Project-page integration:** Y — `ContractProfitCard` (`ProjectOverview.tsx:280`).
**Bid package integration:** N/A for trade bids; subcontractor agreements acknowledged via `SubBidSubmissionForm:316`.

**Recommended fix:** Tag contracts with `kind: 'client' | 'sub' | 'warranty'` for filtered views.

---

### 10. Photos

**Storage:**
- `projects/{id}/walkthroughs/{id}` (each holds media) — `WalkthroughCapture.tsx:153`
- Top-level `photos` collection referenced by `functions/src/index.ts:455` API endpoint — but no client writer found

**Source of truth:** Dual. Walkthroughs is the live store; the `photos` API endpoint returns empty in practice.

**Persona access:**

| Persona | Reads | Surface | Verdict |
|---|---|---|---|
| GC | yes | `WalkthroughList`, `GCTodayFeed`, sidebar Photos tab | OK |
| PM | yes | same | OK |
| Designer | no | no project-photos surface for designer | gap |
| Sub | no | only photos uploaded inside their own bid response | weak |
| Client | yes | `ClientTodayFeed:105`, sidebar Photos tab | OK |

**Project-page integration:** Y — `WalkthroughCapture` + `WalkthroughList` on `ProjectOverview.tsx:638`.
**Bid package integration:** N — existing condition photos can't be attached.

**Recommended fix:** Delete the dead `photos` endpoint OR back it with a `collectionGroup('walkthroughs')` query. Add "Attach existing photos" picker to bid package.

---

### 11. Communications

**Storage:** **Dual hierarchies live.**
- `communications/{threadId}/messages/{mid}` — top-level, project-keyed via field. `client/src/lib/communications/firestore.ts:137`
- `projects/{projectId}/channels/{channelId}/messages/{mid}` — `client/src/lib/messaging/firestore.ts:41`, `portalService.ts:531-578`

**Source of truth:** Dual. Audit 6.3 didn't call this one out; it's real. Top-level used by `ClientMessenger`, `CommThreadView`, `CommunicationPanel`; project-scoped used by designer portal + new messaging library.

**Persona access:**

| Persona | Reads | Surface | Verdict |
|---|---|---|---|
| GC | yes | both (depends on screen) | confusing |
| PM | yes | both | confusing |
| Designer | yes | `channels/` only (`DiscussionPanel`) | partial |
| Sub | yes | top-level threads | OK |
| Client | yes | `ClientMessenger` + DesignStudio discussion | confusing |

**Project-page integration:** Y (partial) — `ChatThread` on overview.
**Bid package integration:** Threads created on send live in `communications/`.

**Recommended fix:** Pick `projects/{id}/channels` as canonical project messaging; keep `communications/` only for pre-project vendor outreach. Migrate `ClientMessenger`.

---

### 12. Tasks

**Storage:** **Dual live.**
- `tasks/` top-level — primary, written everywhere (`WalkthroughCapture:170`, `ProjectProgressView:134`, all dashboards)
- `projectTasks/` top-level — written only by `ProjectTaskBoard.tsx:83`

**Source of truth:** Dual. Audit 6.3 confirmed.

**Persona access:** GC/PM/Sub/Client all read `tasks/`. `projectTasks/` board is an island.
**Bid package integration:** Tasks tagged with `bidPackageId` link (`taskDefaults.ts:98`) — partial.

**Recommended fix:** Migrate `ProjectTaskBoard` to read/write `tasks/` with a board view; delete `projectTasks/`.

---

### 13. Bid packages

**Storage:** `projects/{id}/bidPackages/{pid}` + `projects/{id}/bidRequests/{rid}` — `SendBidPackageModal.tsx:326`, `RequestBidsModal.tsx:155`, `PortalBidsPanel.tsx:81`.

**Source of truth:** Single. Clean.

**Persona access:** GC creates; sub reads via `bidInviteTokens` magic-link + `SubBidRequestsTab`; client sees aggregate in `ContractorSignoffQueue`.
**Bid package integration:** Self — inputs (plans, selections, specs, allowances) are NOT auto-pulled, which is the core gap of this audit.

**Recommended fix:** Per categories 1, 3, 5 above.

---

### 14. Change orders

**Storage:** **Dual live — despite the T0-4 fix.**
- Top-level `changeOrders/` with `projectId` field — all client writes (`SelectionsBoard.tsx:72`, `ChangeOrders.tsx:193`, `ChangeOrderRequestModal`)
- Subcollection `projects/{id}/changeOrders` — server-side writes in `functions/src/index.ts:1278, 1309, 1317`

**Source of truth:** Dual. T0-4 fixed the CO decision route but **three other function writers still target the subcollection.** Selection-overage CO from server lands in subcollection; client reads top-level → invisible.

**Persona access:**

| Persona | Reads from | Verdict |
|---|---|---|
| GC | top-level | misses server-created COs |
| Client | top-level | same |

**Recommended fix:** **Critical follow-up.** Migrate `functions/src/index.ts` CO writers (3 sites) to top-level `changeOrders/` with `projectId`. Backfill any existing subcollection docs.

---

### 15. Documents

**Storage:** Top-level `documents/` with `projectId` + `category` — `Step5Plans.tsx:84`, `SubBidSubmissionForm.tsx:172`, `GlobalDocuments.tsx:162-374`.

**Source of truth:** Single. Clean.

**Persona access:** GC/PM/Client via `DocumentsTab`; designer reads via `designFiles` subcollection (separate); sub uploads bid attachments here.

**Project-page integration:** N — only via sidebar "Documents" tab.
**Bid package integration:** N — covered in Plans.

**Recommended fix:** Surface latest 5 docs on `ProjectOverview`; unify `designFiles` with `documents` (filter by `category=='design'`).

---

### 16. Client info

**Storage:**
- Denormalized on `projects/{id}`: `clientName`, `clientEmail`, `clientPhone`, `address` — `NewProjectForm:309-315`
- Canonical: `contacts/{id}` (or `clients/{id}`) referenced via `project.clientIds[]` — `NewProjectForm:310`
- Per-contact style: `styleProfiles/{contactId}`
- Per-project style: `projects/{id}/stylePreferences/quiz`

**Source of truth:** Dual. Project doc holds a snapshot; canonical contact record may change without updating the project copy.

**Persona access:**

| Persona | Reads | Verdict |
|---|---|---|
| GC | both | drift risk |
| Designer | both | drift risk |
| Sub | project denormalized only | fine |
| Client | own contact | OK |

**Bid package integration:** Subs see project address from denormalized fields. OK.

**Recommended fix:** Make `contacts/{id}` canonical; treat project fields as a cache; resync on every contact write via a Cloud Function trigger.

---

## Cross-cutting findings

**Source-of-truth ambiguities beyond CTO audit 6.3:**

1. **Communications dual hierarchy** (`communications/` top-level + `projects/{id}/channels/`) — not previously called out.
2. **Photos dead endpoint** — `functions/src/index.ts:455` queries a non-existent collection.
3. **Plans storage path duplication** — `documents/` collection + `projects/{id}/bid-packages/{filename}` separate Storage path.
4. **Allowance triple-store** — `project.allowances` map + `selection.allowanceAmount` + `budgetItems` subcollection.
5. **CO dual-store STILL LIVE** — server writes to subcollection while client uses top-level. Audit claimed T0-4 fixed this; only the decision route was migrated.
6. **Inspiration keyed off contact**, not project — client with multiple projects has one shared bucket.

**Personas missing access:**

- **Designer**: no master plans, no master schedule, no progress photos.
- **PM**: no scope-editing surface; financial gating excludes budget tab.
- **Sub**: no selections, no mood board, no allowance target — bids in the dark.
- **Client**: no master schedule beyond hardcoded timeline; mood boards invisible; specs invisible.

**Bid-package send NOT auto-pulling from central store:**

- Plans (must re-upload)
- Selections (cannot attach)
- Specs (must re-type, only trade defaults available)
- Allowances (not sent — sub doesn't know the target)
- Permits (would-be field — collection unused)
- Mood boards (no attach mechanism)
- Style preferences (designer doesn't push forward)
- Schedule window (no per-trade phase dates pulled in)

**Saved client preferences NOT flowing forward:**

- `projects/{id}/stylePreferences/quiz` is read by `RecommendationsManager` + `RecommendedSelections` but NOT by `SelectionsManager` (designer re-elicits) and NOT by `SendBidPackageModal`.
- `styleProfiles/{contactId}` (top-style + per-room lean) feeds the style card but never the bid scope.
- `inspiration/` is invisible to sub + GC dashboards.

---

## Top-10 actionable consolidation list (impact × effort, descending)

**1. Auto-attach project plans to bid packages by trade tag** — Plans live at `documents/` with `category=='plans'`, but `SendBidPackageModal.handlePlanUpload` (line 269) forces re-upload. Wire the modal to read existing project plans + checkbox each one per outgoing trade with smart defaults (framing → S sheets; cabinets → A sheets). **Effort: M. Impact: GC ↑↑ (saves 10 min per package), Sub ↑↑ (always gets right plans).**

**2. Finish CO migration to top-level — functions still write subcollection** — `functions/src/index.ts:1278, 1309, 1317` still write `projects/{id}/changeOrders`. Client reads top-level only — server-created selection-overage COs are silently invisible. Migrate three function sites; backfill the subcollection. **Effort: S. Impact: GC ↑↑, Client ↑↑ (eliminates silent data loss).**

**3. Auto-attach selections to bid packages where category matches trade** — When `trade==Tile`, attach all `projects/{id}/selections` where `category=='tile'` to the request payload + render on `SubBidSubmissionForm.tsx` next to plans. **Effort: M. Impact: Designer ↑↑ (no more "what tile?" questions), Sub ↑↑ (bids the right product).**

**4. Unify allowance source of truth into `projects/{id}/budgetItems`** — Drop the `project.allowances` map; compute it as a derived view; have `SelectionsManager` look up `budgetItems[category].allowance` rather than free-typing. Today three stores drift. **Effort: L. Impact: GC ↑↑, Designer ↑, Client ↑ (single dial controls budget warnings everywhere).**

**5. Pick one project-comms canonical: `projects/{id}/channels`** — Deprecate top-level `communications/` for project threads; keep it only for pre-project vendor outreach. Migrate `ClientMessenger` + `CommunicationPanel`. **Effort: L. Impact: every persona ↑ (single inbox per project, notification logic stops missing half the messages).**

**6. Move inspiration from contact-keyed to project-keyed** — Migrate `inspiration/` to `projects/{id}/inspiration`; surface in designer + GC views. **Effort: M. Impact: Designer ↑↑, Client ↑ (per-project inspiration finally visible).**

**7. Delete dead collections (`designSelections/`, `projects/{id}/schedules` rule, `photos/` endpoint, `projectTasks/`)** — Each tempts re-introduction of dual writes. `DesignerTodayFeed` → migrate to `collectionGroup('selections')`; remove subcollection rules; remove `/api/projects/:id/photos` endpoint or back it with walkthroughs collectionGroup; merge `projectTasks/` into `tasks/`. **Effort: M. Impact: Engineer ↑↑↑ (removes 4 of the audit's 8 source-of-truth ambiguities in one PR).**

**8. Specs library: trade scope = template + selections + override** — Make `companySettings/.../descriptionTemplates` the canonical trade-scope source; compose per-bid as `template + selections-summary + project-overrides`. Today every bid re-types scope. **Effort: M. Impact: GC ↑↑, Sub ↑ (consistency of scope across estimates AND bids).**

**9. Build the `permits/` workflow** — Add a Permits sidebar tab that writes `projectId`, `category`, `docUrl`, `issuedAt`, `expiresAt`. Attach permit doc to electrical/plumbing/mechanical bid packages automatically. **Effort: M. Impact: GC ↑↑, Sub ↑ (closes compliance gap; subs work to permitted scope).**

**10. Surface category-summary cards on `ProjectOverview.tsx`** — GC overview only shows financials, schedule slip, selections progress, walkthroughs. Add cards for: latest plans, mood-board status, change orders, document count, communications unread. Today every category is a separate sidebar tab. **Effort: S–M. Impact: GC ↑↑↑, PM ↑↑ (single-page situational awareness; no more click-through hunting).**
