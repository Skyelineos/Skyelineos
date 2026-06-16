# Skyeline OS — CTO + Architecture + Security Audit

**Date:** 2026-06-16
**Stance:** Adversarial. Walks the code, not the docs. Scores honestly.
**Scope:** Sections 4–9. Sections 1–3 (overview, mobile, secrets) are covered in companion docs and referenced rather than re-written.

## Companion docs (read first, do not re-do here)

- **`docs/Build_Out_Roadmap.md`** — ~70 feature gaps catalogued by persona + cross-cutting. Top 10 highest-impact items in its own exec summary.
- **`docs/Security_Exposure_Assessment.md`** — backend security audit. Verdict: **Urgent**; ~46 unauthed Cloud Function routes plus Storage rules + App Check gaps. Wave A Stream 1 (`feat/sec-auth-gate` / `34fa489`) closes most of this; pending merge review.
- **`docs/Security_Secrets_Audit.md`** — git history secrets scan. No live API keys found. 2 High clusters: hardcoded test passwords in `scripts/seed-test-client.mjs` + `client/src/pages/PortalLogin.tsx` quickLogin buttons.
- **`docs/Mobile_Optimization_Audit.md`** — 42 mobile UX issues catalogued. Stream 2 of Wave A is shipping the dead-link batch; mobile primitive fixes (Dialog overflow, touch targets) still pending.
- **`docs/app-audit-2026-05-28.md`** — earlier baseline. Many items in it are still open.

## Executive summary

Skyeline OS is at the point where every feature has a credible-looking surface but **most cross-feature workflows break at a handoff**. The product is roughly 5/10 feature-complete, 3/10 security-ready (will be 6/10 once Wave A Stream 1 merges), 3.5/10 production-ready, and shipping with **zero unit tests** against 690 TS/TSX files. Architecture is fundamentally sound (Firebase + React + Cloud Functions, no PostgreSQL remnants in the runtime), but eight distinct concepts have **dual sources of truth** (role lives in users *and* contacts; CO lives in top-level *and* subcollection; project status has four taxonomies; etc.), and seven of the eleven end-to-end workflows have a broken or missing step that a developer or an attacker can name in one sentence. The single highest-leverage move after Wave A lands is to **route every notification through `fireTrigger`** — half the "client doesn't know" and "sub never followed up" gaps in the Build-Out Roadmap evaporate when the notification pipeline becomes the one source of truth.

---

## Section 4 — End-to-end workflow walks

For each workflow: expected happy path → files involved → current status → likely failure points → tests that should exist.

### Workflow 1 — Lead → Project

**Expected happy path:** Lead lands in `clients` via Sales kanban or public form → GC drags to Estimating → CreateProjectDialog opens → confirms → creates `projects/{id}` + draft `estimates/{id}` + links `clients/{id}.linkedJobId` → project appears in Projects list and homeowner portal.

**Files involved:**
- `client/src/pages/Sales.tsx:1467-1477` — `checkProjectCreation`. **Triggers only on stage labels containing "estimat", NOT "won".**
- `client/src/pages/Sales.tsx:824-927` — `CreateProjectDialog.handleCreate` writes `projects` + `estimates` + updates `clients`.
- `functions/src/leads/intakeRoute.ts:189-241` — `/api/leads/intake` and `/api/leads/public-intake` writes `clients`.
- `functions/src/leads/newLeadAlert.ts` — onCreate trigger.

**Status:** **Partially works.** Intake works; estimating drag works; **"won" stage never creates a project**.

**Failure points:**
1. `Sales.tsx:1467` `isEstimatingStage` is a substring match on the stage label; renaming stages breaks the trigger silently.
2. `Sales.tsx:874` `clientIds: contactId ? [contactId] : []` — `contactId` reads from `(client as any).contactId` which `clients` doesn't populate at intake. Portal client lookup misses until manually linked.
3. `Sales.tsx:864-873` `buildLocation` only populated when lead has lat/lng. Intake route never geocodes. Maps + directions on Project Overview are empty.
4. `intakeRoute.ts:189` — when `LEAD_INTAKE_SECRET` is unset, returns 503 silently. Google Form Apps Script treats every submission as failure.
5. Dragging back to a previous stage does NOT delete orphaned project/estimate. `onRevert` only updates `clients.stage`.

**Tests that should exist:**
- `tests/e2e/lead-to-project.spec.ts` — `should create a project when dragging a lead to estimating`
- `tests/e2e/lead-to-project.spec.ts` — `should not create a duplicate when client.linkedJobId already exists`
- `tests/integration/leadIntake.test.ts` — `should reject when LEAD_INTAKE_SECRET missing OR wrong header`
- `tests/integration/leadIntake.test.ts` — `should dedupe by formResponseId`
- `tests/e2e/lead-to-project.spec.ts` — `should link portal access when contact is present on the lead`

### Workflow 2 — Project → Estimate

**Status:** **Works for happy path.** But: `POST /api/estimates` + `DELETE /api/estimates/:id` (`functions/src/index.ts:859-887`) bypass `authMiddleware` — anyone can create/delete estimates. Tax (`taxPct`) stored but not included in total (`EstimateBuilder.tsx:225-246`). No transactional guard against concurrent GC edits — last write wins.

**Tests:** `tests/integration/estimate.totals.test.ts` for the tax bug; `tests/integration/estimates.api.test.ts` for the auth bypass; `tests/e2e/estimate.spec.ts` for blank-seed-on-create.

### Workflow 3 — Estimate → Bids (magic-link)

**Status:** **Works in happy path.** Gotchas: `SubBidSubmissionForm.tsx:370` writes `subUserId: user.id?.toString()` — and `user.id` is hardcoded `0` in `AuthContext.tsx:178`, so every bid has `subUserId === "0"`. `invitedSubIds` array uses lowercased email — sub renames email → invitation invisible. `BidRespond` magic-link route has no rate limit; leaked tokens can't be revoked without manual Firestore edit.

**Tests:** `tests/integration/bidRequest.send.test.ts`, `tests/e2e/bidRespond.spec.ts`, `tests/integration/subBid.submit.test.ts` (for the `user.id=0` regression).

### Workflow 4 — Bid → Schedule (award)

**Status:** **Partially works.** Award lands and notifies the sub. **The "populates schedule" half is missing entirely.** `awardBidRoute.ts` never writes to `projects/{p}/schedules`, `tasks`, or the Gantt store. Plus: compliance gate requires the sub to already have a Firebase Auth account (`linkedUserId`); a sub who responded by magic-link but didn't finish account creation can't be awarded even with paperwork in hand.

**Tests:** `tests/integration/awardBid.test.ts` (compliance gate + schedule write), `tests/e2e/award.spec.ts` (schedule task gets assignedSubId after award).

### Workflow 5 — Schedule → Client portal

**Status:** **Works.** Concerns: `publishScheduleToClient` reads `useGantt()` in-memory tasks (`PublishScheduleButton.tsx:47`) — unsaved edits get published. `resolveClientUids` falls back to treating the contact id as a uid on lookup failure → wrong recipients silently notified. Client portal uses `getDoc` (one-shot), not `onSnapshot`, so republishes don't propagate live.

**Tests:** `tests/integration/publishSchedule.test.ts`, `tests/e2e/client-portal-schedule.spec.ts`, `tests/integration/scheduleRule.test.ts` (multi-project read isolation).

### Workflow 6 — Issue → Sub (walkthrough)

**Status:** **Partially broken.** Storage + Firestore writes work. **Notification chain is broken — sub never sees the alert.** `WalkthroughCapture.tsx:188` writes notification with `userId: assigneeId` where `assigneeId` is a **contacts** doc id. `NotificationCenter.tsx:72` listens with `where('userId','==', user.id?.toString() || user.email)` — `user.id` is `0`, so query is `userId == '0' || email`. Document exists, no one reads it.

**Tests:** `tests/e2e/walkthrough.spec.ts` (sub sees task after assignment), `tests/integration/walkthrough.notify.test.ts` (uid keying), `tests/integration/walkthrough.security.test.ts` (cross-project isolation).

### Workflow 7 — Change Order → Budget

**Status:** **Broken chain.** Three independent bugs:
1. Client decision route (`functions/src/index.ts:1271-1294`) patches `projects/{p}/changeOrders/{co}` (**subcollection**). GC + client both READ from top-level `changeOrders` (`ChangeOrders.tsx:153`, `ChangeOrdersTab.tsx:39`). Client clicks Approve → silent success on a phantom doc. Status never visibly changes.
2. `index.ts:1271` — route has NO auth check; anyone with `projectId + coId` flips approvals.
3. `ChangeOrders.tsx:221-225` — GC approve only flips `status`, never recomputes `projects/{id}.contractAmount`. Project budget card silently lies.

Plus: CO create does not notify the client.

**Tests:** `tests/integration/co.client-decision.test.ts` (must hit same doc the GC reads), `tests/e2e/change-order.spec.ts` (budget update + client notification), `tests/integration/co.client-decision.test.ts` (auth on the public route).

### Workflow 8 — Invoice → Payment

**Status:** **Sub-side bill → QBO bill is MISSING.** Client-side draw → QBO payment link works (`functions/src/qbo/paymentLink.ts`). `Bills.tsx:269-275` just flips a status string; nothing posts to QBO, no ACH, no notification to sub. No sub-side "submit invoice" surface exists at all.

**Tests:** `tests/e2e/bill-flow.spec.ts` (sub submits invoice — currently no UI), `tests/integration/billApproval.test.ts` (QBO bill on approval), `tests/integration/qbo.paymentLink.test.ts` (token refresh).

### Workflow 9 — Selection → Approval → Schedule

**Status:** **Partially works.** Selection write + client status flip + overage CO creation works. Auto-downstream task / cabinet order / schedule update is **missing**. Plus: two divergent approval paths (direct Firestore in `SelectionsBoard.tsx` vs REST `/api/projects/:p/selections/:s/approve` in `functions/src/index.ts:1206`). The REST path is effectively dead code AND has no auth gate.

**Tests:** `tests/integration/selection.approve.test.ts` (CO creation when over allowance), `tests/integration/selection.approve.test.ts` (downstream order task — currently absent), `tests/integration/selection.security.test.ts` (client can't approve another project's selection).

### Workflow 10 — Warranty → Sub

**Status:** **MISSING.** No `WarrantyClaimForm`, no `/api/warranty/*` route, no `warranty_claim_filed` trigger. `ProjectMoveInBinder.tsx` stores `installerContactId` per item but no submission UI reads it. `warrantyReminders.ts` fires reminders to the *homeowner*, not subs.

**Tests (require build):** `tests/e2e/warranty-claim.spec.ts`, `tests/integration/warrantyClaim.route.test.ts`, `tests/integration/warrantyClaim.expiry.test.ts`.

### Workflow 11 — Email → Action Item

**Status:** **MISSING entirely.** No `/api/email/inbound` route, no SendGrid Inbound Parse wiring, no MX record in Firebase Hosting rewrites, no `mail_inbox` collection, no dedup-by-Message-ID logic.

**Tests (require build):** `tests/integration/email.inbound.test.ts` (signature, dedup, routing, TASK: subject parsing).

### Workflow walk — cross-cutting findings

1. **`user.id` is always `0`** (`AuthContext.tsx:178`, `use-auth.ts:37`). Any code using `user.id?.toString()` as a key (notifications, audit, `subUserId` on bids, `createdBy` on bills/tasks) is broken or stores literal `"0"`. Pervasive — touches Workflows 3, 6, 8.
2. **Notification routing is broken** when writer keys by contact-doc id and reader queries by `user.id || user.email` (Workflow 6). Walkthrough writer (`WalkthroughCapture.tsx:188`) and sub NotificationCenter (`NotificationCenter.tsx:72`) speak different ID dialects.
3. **Change Order + Selection-Overage CO** subcollection mismatch (Workflows 7, 9). Server route patches one place, client reads the other.
4. **`functions/src/index.ts` unauth endpoints** — `POST /api/estimates`, `DELETE /api/estimates/:id`, `POST /api/projects`, `PATCH /api/projects/:p/change-orders/:co/decision`, `POST /api/projects/:p/selections`, `POST /api/projects/:p/selections/:s/approve` all registered without `authMiddleware`. Wave A Stream 1 (`feat/sec-auth-gate`) closes this.
5. **Award compliance gate too strict** — requires Firebase Auth account; a sub who responded by magic-link but didn't finish signup is uneligible to be awarded.
6. **Schedule publish reads in-memory state** — unsaved Gantt edits publish to client.

---

## Section 5 — Test coverage audit

### What's in the repo today

- **Unit tests (vitest/jest):** **0.** Zero `*.test.ts` / `*.spec.ts` files in `client/src/`, `functions/src/`, or `shared/`. `package.json` declares `jest@^30.0.5` + `jest-environment-jsdom` as devDeps but no jest config and no test files reference jest.
- **E2E suites (Playwright):** 2 suites under `scripts/e2e/suites/`:
  - `uiSmoke.suite.mjs` (91 lines, ~10 assertions) — signs in as test admin, opens key pages, checks for console errors, screenshots.
  - `taskLibrary.suite.mjs` (158 lines) — exercises the master task library.
  - Shared harness `scripts/e2e/lib/harness.mjs`. Runner `scripts/e2e/run.mjs`. Cleanup `scripts/e2e/cleanup.mjs`.
- **Smoke scripts:** `scripts/smoke-lumber.mjs` (1 assertion), `scripts/smoke-vcard-import.mjs` (0 assertions — it's a one-shot importer). Not real tests.
- **In-app dev pages:** `client/src/tests/{AuthTestPage,ProtectedRouteTest,QuickAuthTests}.tsx` — interactive UI test pages, not automated.
- **Cloud Function QA endpoints:** `functions/src/qa/qaRoutes.ts` (157 lines) — internal QA API, calls "qa runs."
- **GH Actions workflow:** `.github/workflows/qa-suite.yml` runs the e2e + smoke suites.
- **Type check as a stand-in:** `npm run check` is just `tsc --noEmit`. Counts as "compile guard," not test coverage.

### Tallied

| Category | Count | Notes |
|---|---|---|
| TS/TSX source files (`client/src/**` + `functions/src/**`) | 654 | per `git ls-tree` |
| Unit test files | **0** | no vitest/jest tests |
| E2E suite files | 2 | uiSmoke, taskLibrary |
| Smoke scripts | 2 | partial coverage |
| In-app test pages | 3 | manual only |
| Estimated automated assertions | ~25 | across e2e + smoke combined |
| Code coverage tooling | none | no istanbul, no v8 coverage in scripts |

### Gaps in priority order

1. **Permission / Firestore rules tests** — none. The "GC vs PM vs client vs sub" matrix has bugs that have already shipped (`RoleGuard.tsx:11` notes "BUGFIX 2026-06: gc was being collapsed into projectManager"). A rules test harness using `@firebase/rules-unit-testing` would have caught that.
2. **Auth bypass tests** — Wave A Stream 1 closes ~46 unauthed endpoints. There must be regression tests that fail if any of those goes back to unauthed.
3. **Financial calculation tests** — the `taxPct` bug in `useEstimateMath` (`EstimateBuilder.tsx:225`) is the canonical example — tax is stored but never added to the total. Currency arithmetic, percentage overhead/profit/markup, allowance vs overage, AR/AP rollup, contract amount + COs all need pure-function unit tests.
4. **Schedule dependency tests** — predecessor logic, day offsets, weekend handling, the `computeScheduleSlip` red/amber/green tone. None of these are tested.
5. **E2E coverage for the 7 broken-or-missing workflows** — currently no e2e suite walks Lead→Project, Bid→Schedule, Walkthrough Notification, CO→Budget, Selection→Order Task, Warranty, or Email→Task.
6. **Cross-tenant isolation tests** — multi-project: client of project A must not read project B's data. Sub on project A must not read sub list of project B. None of this is tested.

### Recommended new test file structure

```
tests/
  unit/
    financial/
      estimateMath.test.ts         — tax, overhead, profit, subtotal carrying
      cashflow.test.ts             — forecast aggregation
      arApRollup.test.ts           — Stream-5 card math
    schedule/
      scheduleSlip.test.ts         — red/amber/green thresholds
      dependencies.test.ts         — predecessor/successor + day offsets
    roles/
      normalizeRole.test.ts        — every legacy role string → canonical
      roleAccess.test.ts           — canAccessFinancials/Settings/etc. matrix
  integration/
    rules/                         — Firebase rules unit-testing
      financials.rules.test.ts
      changeOrders.rules.test.ts
      selections.rules.test.ts
      bids.rules.test.ts
      projects.crossProject.test.ts
    api/
      auth.middleware.test.ts      — every gated route 401s without bearer
      auth.bypass.test.ts          — the whitelist (sms/inbound, bid-respond, OAuth) stays public
      estimates.api.test.ts
      changeOrders.decision.test.ts
      walkthrough.notify.test.ts
    workflows/
      lead-to-project.test.ts
      bid-award.schedule.test.ts
      co-budget-update.test.ts
      selection-approval.test.ts
  e2e/                              — Playwright (move under tests/)
    lead-to-project.spec.ts
    bid-respond.spec.ts
    publish-schedule.spec.ts
    walkthrough-assigns-sub.spec.ts
    change-order-client-approval.spec.ts
    sub-compliance-upload.spec.ts
    warranty-claim.spec.ts
```

### Test maturity score: **1.5 / 10**

There is real infrastructure (Playwright, harness, GH Actions workflow, type checks, QA panel) — that's the +1.5. There are zero unit tests, no Firestore rules tests, no auth-bypass regression tests, and only happy-path e2e coverage for two narrow surfaces. The product has shipped a known role-collapse privilege escalation and a `user.id=0` ID-keying bug — both classes of bug that targeted unit tests would have caught.

---

## Section 6 — Architecture review

### 6.1 Frontend

- **Routing:** 91 `<Route>` declarations in a single 800+ line `client/src/App.tsx`. No central route table. Every new role-gated route hand-wires `<RoleGuard allowedRoles={[...]}>`. At least two legacy aliases survive (`/portal-login`, `/not-authorized`).
- **State:** Three coexisting strategies — `@tanstack/react-query` (REST `/api/*`, mostly unused after Firestore migration), raw `onSnapshot`/`getDocs` scattered through pages (the dominant pattern, no shared cache), React Context for cross-cutting state. **No coherent strategy.** Same collection (`projects`) is listened to in 8+ separate components.
- **Component organization:** 50+ folders under `client/src/components/`. Notable **dead trees**:
  - `client/src/components/{advanced,timeline}/GanttChart.tsx`, `timeline/PhaseGanttChart.tsx`, `gantt/{GanttBuilder,WbsGantt}.tsx` — five Gantt files with zero importers.
  - `client/src/components/layout/{DesignerSidebar,DesignerLayout,ClientSidebar,SubcontractorSidebar,SubcontractorLayout}.tsx` — five dead layout files.
  - `client/src/lib/queryClient-original.ts` — orphan.
- **Shared types:** Split between `client/src/types/` (8 files), `shared/types.ts`, `shared/auth-types.ts`, `shared/schema.ts` (Drizzle legacy still imported for type-only use by 7 files), and 11+ per-feature `lib/<domain>/types.ts`. **No single canonical `Project` type** — `shared/types.ts:84`, `shared/schema.ts`, `EditProjectForm.tsx`, `CreateProjectModal.tsx` all define overlapping shapes.

### 6.2 Backend (Cloud Functions)

- **Endpoint organization:** Mega-Express anti-pattern. `functions/src/index.ts` is **2,195 lines** with **71 inline `app.X` calls**. Modular routes exist (`bids/*`, `contracts/commenceRoute.ts`, `auth/postSignupLinkRoute.ts`) but a huge legacy tail still inlines.
- **Middleware pattern:** No shared `requireAuth`. The bearer-verify pattern at `index.ts:1037-1153` is **copy-pasted at least 6 times**. A helper exists at L1337 but most routes verify inline. **No role-check middleware** — role gating lives in firestore.rules only.
- **Shared utilities:** `admin.initializeApp()` duplicated across module files. No structured logger — raw `console.log`. Each route does ad-hoc `res.status(500).json({error})`.
- **Cold start budget:** Every cold start of the single `api` function parses all 2,195 lines + SendGrid + OpenAI + Replicate + Twilio + QBO + googleapis + brain-pass GPT. Memory `512MiB`, timeout `540s` (set for AI workloads, applies to every route). Cold start probably 2-4s; degrades with every feature.

### 6.3 Data model

**~60 top-level collections** (excerpt): users, projects, contacts, clients, estimates, bids, bidInviteTokens, tasks, projectTasks, masterTasks, financials, invoices, changeOrders, draws, documents, photos, messages, notifications, notificationJobs, contracts, qboConnections, sms_opt_outs, schedules, scheduleTemplates, walkthroughs, selections, designSelections, styleLibrary, styleProfiles, communications, actionItems, decisions, reminders, portalInvites, ingestion_lab, ... (see firestore.rules for the canonical list).

**~22 project subcollections:** locationEvents, rooms, bidRequests, selections, moodBoards, designDecisions, designFiles, stylePreferences, styleComparisons, styleInspiration, selectionRecommendations, schedules, channels, rfis, draws, budgetItems, takeoffs, lumberTakeoffs, walkthroughs, moveInBinder, bidPackages, changeOrders.

**Source-of-truth ambiguities — eight named:**

| Concept | Conflict |
|---|---|
| role | `contacts.role` + `users.role` (computed via `deriveUserRole`) + 3rd in-memory normalizer in `AuthContext.tsx:20`. Three writes, drifts on every read. |
| user identity | Firebase Auth `uid`, `users.id` (legacy serial, always `0`), `contacts.linkedUserId`, `users.linkedContactId`. Code reads `user.id`, `user.uid`, `user.firebaseUid` interchangeably. |
| project status | FOUR overlapping taxonomies: `projects.status` (planning/active), `projects.stage` (estimating/proposal — `CreateProjectModal.ts:36`), `projects.stage` (lead/design/construction — `ProjectStageTracker.tsx:10`, same type name, different values), `projects.phase` (free string). |
| change orders | top-level `changeOrders/` (client) + subcollection `projects/{id}/changeOrders/` (server). Never see each other. |
| selections | live: `projects/{id}/selections`. Dead in code, alive in rules: top-level `designSelections/`. |
| tasks | top-level `tasks/` + separate top-level `projectTasks/`. Both rule-validated. |
| schedules | `schedules/{projectId}` (single doc per project) + `projects/{id}/schedules/{sid}` (multi). |
| notification audience | server uses uid via `fireTrigger`; client uses contact-doc id via direct `createNotification` write. Diverges. |

### 6.4 Conflicting systems — verdicts

**Role taxonomies — NOT consolidated.** 8 separate definitions:

| File | What's there | Verdict |
|---|---|---|
| `shared/auth-types.ts:25` | canonical `UserRole` + `normalizeRole` | KEEP |
| `shared/types.ts:243` | re-exports above | KEEP |
| `client/src/components/auth/RoleGuard.tsx:7` | own `UserRole` + own normalizer (had the gc→PM bug) | DELETE, import canonical |
| `client/src/hooks/useRoleAccess.ts:4` | own `UserRole` + own normalizer | DELETE |
| `client/src/lib/designer/portalTypes.ts:273` | own `normalizeRole` for portal | DELETE |
| `client/src/auth/AuthContext.tsx:20` | own `derivePortalRole` switch | DELETE |
| `functions/src/auth/ensureContactAuth.ts:31` | own `deriveUserRole` | DELETE |
| `functions/src/auth/contactAuthBackfill.ts:20` | copy of the above | DELETE |

**Designer Portal duplication — share data, drift on UI.** `/designer-portal` (`DesignerPortal.tsx`, 391 lines, global multi-project) and `/projects/:id/designer` (`ProjectDesigner.tsx`, 272 lines, project-scoped room-by-room) both read/write `projects/{id}/selections`. But ProjectDesigner adds `moodBoards`, `designDecisions`, `designFiles`, `stylePreferences`, `styleInspiration` — none of which DesignerPortal's UI exposes. Edits in one partially reflect; some don't reflect at all. Worse: different chrome (AppLayout vs ProjectLayout). **Pick one entry point** — recommend `/designer-portal` index that deep-links into ProjectDesigner per project.

**Legacy Drizzle/Postgres remnants — NOT 100% Firebase.**
- `drizzle.config.ts` still exists, throws on missing `DATABASE_URL`. Dead at runtime but trips local tooling.
- `shared/schema.ts` (full Drizzle pg schema) is **actively imported as a type source** by 7 files (`DocumentsTab.tsx:45`, `Settings.tsx:45`, `useFinancialData.ts:5`, etc.).
- `functions/src/migrations/20240105_add_dependencies_foreign_keys.sql` — orphan.
- No /server directory, no `pg`/`drizzle-orm` runtime imports.

**Sidebar implementations — 5 dead files.** `Sidebar.tsx` (mounted) is the source of truth, holds all 4 role-specific nav arrays. `DesignerSidebar.tsx`, `DesignerLayout.tsx`, `ClientSidebar.tsx`, `SubcontractorSidebar.tsx`, `SubcontractorLayout.tsx` are all unmounted dead code.

**Schedule / Gantt implementations.** Live: `client/src/modules/gantt/ui/SkyelineGantt.tsx` + `BuildTrackerPro.tsx`. Dead with zero importers: `advanced/GanttChart.tsx`, `timeline/GanttChart.tsx`, `timeline/PhaseGanttChart.tsx`, `gantt/GanttBuilder.tsx`, `gantt/WbsGantt.tsx`. Plus four schedule *page* routes (`/schedule`, `/global-schedule`, `/projects/:id/schedule`, `/timeline`) — three using different visualizations.

**Notification systems — one engine, two entry points.** `fireTrigger` is the canonical server pipeline. But **6+ client-side call sites bypass it** with direct `createNotification` writes (`Tasks.tsx`, `RFI/firestore.ts`, `walkthrough/WalkthroughCapture.tsx`, `bidding/*`, `templates/JobTemplateEditor.tsx`, `schedule/publishSchedule.ts`). Result: SMS/email fan-out + trigger rules apply only to server-fired notifications. Client-fired are in-app only AND have the contact-id-vs-uid mismatch.

**CO surface — coexisting, not migrating.** Top-level `changeOrders/` (client) + subcollection `projects/{id}/changeOrders/` (server). No migration in flight.

### 6.5 Scalability risks

- **Listeners on dashboard mount:** `GCTodayFeed.tsx` opens **9 `onSnapshot` subscriptions** at L58, 77, 104, 119, 133, 146, 167, 185, 190. Every GC dashboard render starts 9 live Firestore streams.
- **Unbounded queries (no `where`/`limit`):** `getDocs(collection(db, 'projects'))` in `CashFlowForecastCard`, `DesignBoard`, `CommsLog`, `CashFlowForecast`, `NewProjectForm`, ... 20+ sites total. `getDocs(collection(db, 'tasks'))` in `GlobalScheduleCalendar.tsx:55` (worst — tasks grows fastest).
- **N+1 patterns:** `MissingTasksAlertCard.tsx:57` does `for (const p of projects) await getDocs(tasks where projectId == p.id)` on every dashboard render. Cost: O(N projects × tasks-query latency).
- **Cold start budget:** Single 2,195-line `api` function loads every SDK on every cold start. Should split into `api-core` + `api-ingestion` + `api-ai` so AI imports don't ride along on every CRUD call.
- **No file/image retention policy.** `storage.rules` has no `expirationPolicy` or lifecycle rules. Walkthrough photos, bid PDFs, selection images grow forever.
- **Pagination — almost nowhere.** `Tasks.tsx`, `ChangeOrders.tsx`, `UserManagement.tsx`, `Reports.tsx`, `Contacts.tsx` all load entire collections. Only `FastDashboardCards.tsx`, `QaTestPanel.tsx`, `GCTodayFeed.tsx`, `communications/firestore.ts`, `ContentStudio.tsx` use cursor pagination.

### 6.6 Recommended architectural moves

1. **Collapse role taxonomy to `shared/auth-types.ts` exclusively.** Delete 5 local `UserRole` types + 5 local normalizers. Pick single canonical role-write site.
2. **Delete the dead layout/Gantt/legacy trees in one PR** — ~12 files removed, no behavior change.
3. **Pick one CO storage shape + one Schedule storage shape + one tasks store.** Recommend subcollections. Migrate.
4. **Consolidate the project status taxonomy** to the `ProjectStageTracker` lifecycle. Delete the other three.
5. **Route every notification through `fireTrigger`.** Expose as HTTP endpoint, replace 6 client `createNotification` callers.
6. **Bound the unbounded queries.** Add `limit(50)` + cursor pagination to the 6 list pages. Denormalize `projects.hasAnyTasks: boolean` for `MissingTasksAlertCard`.
7. **Split the Cloud Function mega-Express.** 71 inline routes in 2,195 lines is the biggest cold-start cliff. Move remaining routes to per-module `register*` files, extract `requireAuth(role?)` middleware, consider 3 separate v2 functions.

---

## Section 7 — Business goal alignment

Eight business outcomes scored honestly. Each gets: score, what works (1 line), what's broken (1 line), highest-leverage improvement (1 line).

### 7.1 Know what's next on every project — **5/10**
**Works:** GC dashboard has Today Feed + lifecycle pill bar per project. Wave A Stream 5 added schedule-slip + bid-follow-up cards.
**Broken:** Tyler still has to open each project to see its state. No "all projects, sorted by who's slipping worst" view. Tasks page has no overdue-first default.
**Move 2-3 points:** Mount a single "Owner pulse" card on Dashboard that rolls up across projects: schedule slip + overdue tasks + open walkthroughs + pending CO approvals + AR days outstanding.

### 7.2 Prevent missed client decisions — **3/10**
**Works:** Selections have `dueDate`. Client portal dashboard shows "Decisions Due" tile.
**Broken:** No escalation. One-shot notification at 24h then silence. No "what does this decision unlock downstream" linkage so client doesn't feel the cost. No SMS for due-today.
**Move 2-3 points:** Build T+1 / T+3 / SMS escalation ladder on the `selection_due` trigger (Section 8 Tier B item).

### 7.3 Reduce sub follow-up by Tyler — **4/10**
**Works:** Bid invites send via SendGrid + optional SMS. Compliance status visible. Stream 5's `BidFollowUpCard` lists non-responders.
**Broken:** No auto-reminders. Compliance upload is a toast stub — Tyler can't actually let new subs onboard themselves. No "schedule slipped, your start window moved" SMS to the affected sub.
**Move 2-3 points:** Build the sub compliance upload UI (Stream 4 already specced) + auto-reminder cron on bid invites past 3 days.

### 7.4 Track budget and margin risk — **5/10**
**Works:** Estimates have overhead/profit/margin math. Stream 5's AR/AP card adds visibility. ProjectFinancialsCard exists.
**Broken:** Tax not included in totals (`useEstimateMath` bug). Approved COs never recompute `projects.contractAmount`. Cashflow forecast is project-scoped, no executive 90-day rollup. Sub on-budget % is not measured.
**Move 2-3 points:** Fix the tax bug + auto-update `contractAmount` on CO approval. (Small, high-leverage.) Then add sub-by-sub variance reporting.

### 7.5 Manage change orders cleanly — **2/10**
**Works:** GC can create COs. Client portal can show them.
**Broken:** The whole chain is broken (Workflow 7). Client clicks Approve → patches a phantom subcollection doc that no one reads. Status stays "pending" forever. Budget never updates. Client never gets notified of a new CO.
**Move 2-3 points:** Fix the subcollection vs top-level mismatch (Workflow 7 fix). Single PR; cascades through 3 readers.

### 7.6 Keep clients informed without effort — **4/10**
**Works:** Client portal has Selections, ChangeOrders (rendered, even if broken backend), Photos with `visibleToClient` flag, Site Log, Schedule (published).
**Broken:** Client messenger is single-thread iMessage (no topical separation). No "what changed" diff on schedule re-publish. Photos have no per-phase filter. Sidebar links to Contracts/Estimates/Punch List/Warranty silently 404 (Wave A Stream 2 fixes the silent-404 by adding stubs; doesn't build the pages).
**Move 2-3 points:** Build the 4 ComingSoon stubs into real surfaces in priority order: Punch List > Contract (PDF view) > Warranty (binder reuse) > Estimates.

### 7.7 Protect the builder legally — **3/10**
**Works:** Contracts module exists. Magic-link bid invites have 144-bit tokens, 14-day expiry. Compliance gate on award is server-enforced (W-9, COI, agreement, license).
**Broken:** No audit log on admin impersonation. No e-signature flow (D-015 is still pending Phase 1F). No CO has documented client signature. No record of "client was notified at X time" for legally-meaningful events. Document versioning missing — signed contract can be overwritten by upload.
**Move 2-3 points:** Add audit log on `enterAdminView` + native signature widget for COs and Contracts (D-015 from CHECKPOINT).

### 7.8 Improve team accountability — **3/10**
**Works:** Tasks have `assignedSubId`. Tyler can see overdue tasks per project.
**Broken:** No per-sub on-time %. No per-PM portfolio dashboard. No "Chris (PM) hasn't logged into the app in 3 days" alert. Admin impersonation leaves no trail (so "who did this?" is unanswerable). Activity feed missing.
**Move 2-3 points:** Build per-user activity feed + per-sub on-time/on-budget scoreboard. Both are pure read-aggregations over existing data.

### Business alignment overall: **3.6 / 10**

The product surfaces every business question but answers none of them confidently. Most surfaces show data but don't drive action. Notification engine is the universal limiting reagent.

---

## Section 8 — Prioritized roadmap

Five tiers. Each item: why it matters / where in codebase / what to build / how to test / severity + effort.

### Tier 0 — Must-fix before any client uses the app

| # | Item | Where | What | Test | Sev / Effort |
|---|---|---|---|---|---|
| T0-1 | Merge Wave A Stream 1 (`feat/sec-auth-gate`) | functions/src/index.ts, storage.rules, client/src/lib/firebase.ts | gate ~46 unauthed routes + per-project Storage rules + App Check boot | `tests/integration/api/auth.middleware.test.ts` — every gated route 401s | Critical / S |
| T0-2 | Rotate hardcoded credentials in repo | Firebase Auth user list + `scripts/seed-test-client.mjs` + `client/src/pages/PortalLogin.tsx` + `client/src/components/auth/LoginForm.tsx` | delete or password-rotate the 10 emails listed in `Security_Secrets_Audit.md` | manual; no test | Critical / S |
| T0-3 | Fix walkthrough notification chain | `client/src/components/walkthrough/WalkthroughCapture.tsx`, `client/src/lib/notifications.ts` | resolve contact id → uid via `contacts.linkedUserId` before writing notification.userId | `tests/integration/walkthrough.notify.test.ts` | Critical / S |
| T0-4 | Fix CO subcollection vs top-level | `functions/src/index.ts:1271`, `client/src/pages/ChangeOrders.tsx`, `client/src/components/client-portal/ChangeOrdersTab.tsx` | pick subcollection (collocation), migrate top-level reads, kill the dead REST route | `tests/integration/co.client-decision.test.ts` | Critical / M |
| T0-5 | Fix tax not included in estimate total | `client/src/pages/EstimateBuilder.tsx:225-246` | add tax to `useEstimateMath` total | `tests/unit/financial/estimateMath.test.ts` | High / S |

### Tier 1 — Must-fix before paid beta

| # | Item | Where | What | Test | Sev / Effort |
|---|---|---|---|---|---|
| T1-1 | Build sub compliance upload (Wave B Stream 4) | `client/src/pages/SubcontractorPortal.tsx`, new endpoint in `functions/src/<module>` | replace toast stub with real file picker → Storage upload → Firestore update; expiry warnings 30 days out | `tests/e2e/sub-compliance.spec.ts` | Critical / M |
| T1-2 | Route notifications through `fireTrigger` | `client/src/lib/notifications.ts` + 6 callers + new HTTP endpoint | replace direct `createNotification` writes with HTTP call to fireTrigger; audience uses uid, not contact id | `tests/integration/notify.fanout.test.ts` | Critical / M |
| T1-3 | Build 7 missing notification triggers (Wave B Stream 3) | `functions/src/notifications/triggerCatalog.ts` + dispatchers | schedule_slip, change_order_created, selection_due, draw_requested, invoice_received, photo_uploaded, walkthrough_assigned | `tests/integration/triggers.catalog.test.ts` | High / M |
| T1-4 | Build per-user notification preferences UI | `client/src/components/settings/UserPreferencesDialog.tsx` (tab exists, unwired) | tab wires to backend; per-trigger SMS/email/in-app toggles | `tests/e2e/notification-prefs.spec.ts` | High / M |
| T1-5 | Award bid → schedule write | `functions/src/bids/awardBidRoute.ts` | on award, write `assignedSubId` onto matching schedule tasks (or `projects/{id}/schedules/{sid}` lines) | `tests/integration/awardBid.test.ts` | High / M |
| T1-6 | CO approval recomputes `contractAmount` | `client/src/pages/ChangeOrders.tsx`, server route | on approve, `projects.contractAmount += coAmount` atomically; notification fires | `tests/integration/co.budget.test.ts` | High / S |
| T1-7 | MFA / 2FA enrollment | `client/src/pages/Settings.tsx`, Firebase Auth | enroll TOTP/SMS 2nd factor; required for admin+GC | `tests/e2e/mfa.spec.ts` | High / M |
| T1-8 | Client portal: kill dead links + build Punch List | `client/src/pages/SkyelineClientPortal.tsx` | wire `punch-list` tab to walkthrough data with `visibleToClient` filter | `tests/e2e/client-punch-list.spec.ts` | High / M |
| T1-9 | Sub-side "submit invoice / pay app" surface (Wave B Stream 4) | `client/src/pages/SubcontractorPortal.tsx` | new tab; writes to `invoices` collection; routes to QBO bill on GC approval | `tests/e2e/sub-invoice.spec.ts` | High / M |
| T1-10 | Permission test harness (Firebase rules unit testing) | `tests/integration/rules/*` | rules-unit-testing setup; per-collection role matrix | `tests/integration/rules/financials.rules.test.ts` | High / M |

### Tier 2 — Strong MVP

| # | Item | Why | Effort |
|---|---|---|---|
| T2-1 | Pick one CO + one Schedule + one Tasks store; migrate | source-of-truth ambiguity → user-facing bugs | M |
| T2-2 | Consolidate the 8 role taxonomy definitions | already caused one privilege bug | S |
| T2-3 | Single canonical `Project` type | downstream type drift | S |
| T2-4 | Delete dead Gantt/sidebar/Drizzle files (~12 files) | reduces cognitive load + bundle size | S |
| T2-5 | Global search backend | `/api/search` is dead; Cmd+K returns nothing | M |
| T2-6 | "All projects" Owner pulse card (Section 7.1) | answers Tyler's #1 question | S |
| T2-7 | AR/AP days-outstanding rollup with red-zone alerts | Stream 5 added the math; needs alert thresholds | S |
| T2-8 | Audit log on admin impersonation + write stamp | legal protection + forensic recovery | S |
| T2-9 | Twilio webhook signature verification | exposed surface today | S |
| T2-10 | Designer portal: pick one entry point, deep-link the other | confusion + data drift | M |

### Tier 3 — Important, can wait

| # | Item | Why | Effort |
|---|---|---|---|
| T3-1 | Native signature widget (D-015, Phase 1F from CHECKPOINT) | CO + contract signoff | L |
| T3-2 | Warranty claim surface (Workflow 10 build) | post-occupancy gap | M |
| T3-3 | Email→Action item ingestion (Workflow 11 build) | reduces Tyler-as-router pattern | L |
| T3-4 | Per-client team card ("who do I call") | clarity for clients gap | S |
| T3-5 | Document versioning + "executed copy locked" | legal protection | M |
| T3-6 | Schedule slip alarm escalation ladder (T+1 / T+3 / SMS) | reduces missed-decision class | S |
| T3-7 | Mobile primitives fix batch (Dialog overflow, touch targets) | `Mobile_Optimization_Audit.md` Batch 1 | M |
| T3-8 | Cashflow forecast — executive 90-day rollup | answers margin-risk question | M |
| T3-9 | Per-sub on-time / on-budget scoreboard | accountability gap | M |
| T3-10 | Threaded conversations in client messenger | clarity for clients gap | M |

### Tier 4 — Nice-to-have / future AI

| # | Item | Why |
|---|---|---|
| T4-1 | AI auto-categorize photos by phase | photo organization win |
| T4-2 | AI summarize site log to weekly client digest | clarity for clients |
| T4-3 | AI bid review (rate-flag outliers vs. comparable bids) | sub mgmt win |
| T4-4 | Auto-generate sub contract draft from awarded bid | reduces Tyler workload |
| T4-5 | Predictive cashflow (Monte Carlo on slip probability) | margin risk forecasting |
| T4-6 | Voice memo → action item ingestion | field UX |
| T4-7 | Auto-OCR insurance PDF for expiry extraction | compliance |
| T4-8 | Designer notes per room → PDF spec book export | designer UX |
| T4-9 | Saved per-user views/filters | power-user productivity |
| T4-10 | Slack/Teams notification integration | enterprise adoption |

---

## Section 9 — Final scores + 10 dispatch tasks

### Scores

| Dimension | Score | Reasoning |
|---|---|---|
| **Production readiness** | **3.5 / 10** | Cannot hold real customer data at scale today. Wave A Stream 1 + T0 list moves this to ~6/10. Zero unit tests + 7/11 workflows have a broken or missing step disqualifies "production-ready." |
| **Security readiness** | **3 / 10 → 6 / 10 post-Wave-A-Stream-1** | ~46 unauthed Cloud Function routes today. Storage cross-tenant leak. App Check coded but never called. Twilio webhook unsigned. No MFA. Hardcoded test creds in repo. Stream 1 closes ~80% of practical attack surface in one merge. |
| **Feature completeness** | **5.5 / 10** | Most surfaces exist; most workflows have a working data write + a broken handoff. Designer, Client, Sub portals all functional happy-path. Notification engine and CO chain are the two most-broken layers. Warranty + email-ingestion are missing entirely. |
| **Test coverage** | **1.5 / 10** | 0 unit tests in 654 TS files. 2 e2e suites + 2 smoke scripts. Real infra exists (Playwright, GH Actions workflow); no actual coverage. |
| **Architecture cleanliness** | **5 / 10** | Firebase + React stack is sound. 5-12 dead files per layer. 8 source-of-truth ambiguities. 2,195-line index.ts mega-Express. No DI / no module boundaries enforced. |
| **Overall product readiness** | **4 / 10** | Solid bones, urgent gaps. Right team can move this to 7/10 in 4-6 focused weeks. |

### Top 5 highest-risk findings + mitigation

1. **~46 unauthed Cloud Function routes** including DELETE on projects/contacts/estimates → anonymous data destruction or AI cost burn. → Merge Wave A Stream 1.
2. **Walkthrough notification chain broken end-to-end** — sub never sees Tyler's assignments. → Fix the contact-id-vs-uid keying (T0-3).
3. **CO approval is fully broken** — client approval writes to phantom doc. Budget never updates. → Fix subcollection mismatch (T0-4).
4. **0 unit tests** + 1 already-shipped role-collapse privilege bug + 1 stored `user.id=0` ID bug. → Stand up tests harness (T1-10) + fix `user.id` (audit needed).
5. **No multi-tenancy enforcement** in `qboConnections/global` + Storage rules + app-wide isStaff predicates. → Either commit to single-tenant explicitly OR build tenant scoping. (Current path is single-tenant; document it.)

### Top 10 missing modules

1. Sub compliance upload UI
2. Sub invoice / pay-app submission
3. Warranty claim surface (homeowner + sub routing)
4. Email → action item ingestion
5. MFA enrollment for admin/GC
6. Audit log + admin impersonation trail
7. Native signature widget (D-015)
8. Document versioning / "executed copy locked"
9. Per-user notification preferences (UI exists, unwired)
10. Global search backend (`/api/search` is dead)

### Next 10 engineering tasks — fully formed

1. **TASK-1: Merge Wave A Stream 1 to main** — files: `functions/src/index.ts`, `storage.rules`, `client/src/lib/firebase.ts`, `.env.example`. Acceptance: every `/api/*` route returns 401 without bearer; Storage rules deny cross-project reads; App Check initialized on PROD boot.
2. **TASK-2: Walkthrough notification uid keying** — files: `client/src/components/walkthrough/WalkthroughCapture.tsx`, `client/src/lib/notifications.ts`. Acceptance: notification doc's `userId` is the auth uid of the assignee (resolved via `contacts.linkedUserId`).
3. **TASK-3: CO subcollection migration** — files: `functions/src/index.ts:1271`, `client/src/pages/ChangeOrders.tsx`, `client/src/components/client-portal/ChangeOrdersTab.tsx`. Acceptance: top-level `changeOrders/` migrated to subcollection; all readers updated; dead REST route deleted; `tests/integration/co.client-decision.test.ts` passes.
4. **TASK-4: Tax included in estimate total** — files: `client/src/pages/EstimateBuilder.tsx:225-246`. Acceptance: `total = subtotal + overheadAmt + profitAmt + (subtotal × taxPct)`; `tests/unit/financial/estimateMath.test.ts` passes.
5. **TASK-5: Stream 4 (Wave B) — sub compliance upload** — files: `client/src/pages/SubcontractorPortal.tsx` compliance tab, new `functions/src/compliance/uploadRoute.ts`. Acceptance: real file picker; W-9/COI/agreement/license upload to `projects/.../compliance/{subUid}/`; Firestore mirrors expiry dates; T-30 reminder fires.
6. **TASK-6: Stream 3 (Wave B) — 7 missing triggers + prefs UI wiring** — files: `functions/src/notifications/triggerCatalog.ts`, `client/src/components/settings/UserPreferencesDialog.tsx`. Acceptance: each new trigger is registered, dispatch fires, prefs UI persists per-user per-channel choice.
7. **TASK-7: Award → schedule write** — files: `functions/src/bids/awardBidRoute.ts`. Acceptance: on award, `assignedSubId` written to the project's task or schedule lines matching the trade; UI shows assignment.
8. **TASK-8: CO approval → contractAmount update** — files: `client/src/pages/ChangeOrders.tsx`, server CO route. Acceptance: approve transaction increments `projects.contractAmount`; dashboard reflects.
9. **TASK-9: MFA enrollment for admin/GC** — files: `client/src/pages/Settings.tsx`, Firebase Auth multi-factor setup. Acceptance: admin can enroll TOTP; sign-in flow prompts for 2nd factor on subsequent logins; required for admin role.
10. **TASK-10: Audit log on admin impersonation** — files: `client/src/contexts/AdminViewContext.tsx`, new `auditLogs` collection + rules. Acceptance: `enterAdminView` writes audit doc; every Firestore write while impersonating stamps `_impersonatedBy`; non-dismissable banner shows in UI.

### Next 10 tests — exact file paths

1. `tests/integration/rules/financials.rules.test.ts` — every persona can/can't read financials per matrix.
2. `tests/integration/api/auth.middleware.test.ts` — every gated route returns 401 without bearer; whitelist remains public.
3. `tests/unit/financial/estimateMath.test.ts` — subtotal/overhead/profit/tax math, including the tax bug regression.
4. `tests/integration/co.client-decision.test.ts` — client approval writes to the same doc the GC reads.
5. `tests/integration/walkthrough.notify.test.ts` — notification keyed by auth uid, not contact id.
6. `tests/integration/awardBid.test.ts` — compliance gate + schedule write on award.
7. `tests/integration/triggers.catalog.test.ts` — each new trigger registered + dispatched to right audience.
8. `tests/e2e/sub-compliance.spec.ts` — sub uploads W-9/COI/agreement/license; GC sees status.
9. `tests/e2e/client-punch-list.spec.ts` — client sees their open punch items + can sign off.
10. `tests/integration/multi-project-isolation.test.ts` — client of project A cannot read project B's data via any query.

### 10 Claude Dispatch prompts — ready to paste

Each prompt is self-contained. Hand off one at a time to a sub-agent.

---

**Dispatch 1 — Merge Wave A Stream 1**
> Branch `feat/sec-auth-gate` at commit `34fa489` is on origin/Skyelineos. Apply this branch to main: rebase or fast-forward, push, watch the GH Actions deploy via WIF. Acceptance: every `/api/*` route returns 401 without a bearer token; Storage rules deny cross-project reads; `client/src/lib/firebase.ts` calls `initializeFirebaseAppCheck()` when `VITE_FIREBASE_APP_CHECK_KEY` is set in env. If deploy fails surface the exact error.

**Dispatch 2 — Walkthrough notification uid keying**
> In `client/src/components/walkthrough/WalkthroughCapture.tsx:188`, the notification `userId` is set to a contact-doc id. Sub portal `NotificationCenter` queries by `user.id?.toString() || user.email`. Fix: resolve `contacts.linkedUserId` for the assignee contact and use that as the notification `userId`. If `linkedUserId` is missing, do NOT write the notification — instead, surface an in-app warning to the GC ("Sub has no portal account; cannot notify"). Add `tests/integration/walkthrough.notify.test.ts` that fails before this fix and passes after.

**Dispatch 3 — CO subcollection migration**
> Top-level `changeOrders/` is the read-side source of truth across `client/src/pages/ChangeOrders.tsx:153`, `client/src/components/client-portal/ChangeOrdersTab.tsx:39`, `client/src/components/client-portal/ClientDashboard.tsx:40`, `ClientFinancials.tsx:368`, `SelectionsBoard.tsx:72`, `ProjectFinancialsCard.tsx:80`. Subcollection `projects/{id}/changeOrders/` is the write-side from `functions/src/index.ts:1221-1294`. Migrate everything to the subcollection. Steps: (1) backfill function to copy top-level docs to subcollection; (2) update all 6 readers; (3) delete the dead REST route AND the top-level rules block. Add auth check to any remaining server route. Acceptance: client click-Approve flow updates the same doc GC sees; budget recomputes.

**Dispatch 4 — Tax in estimate total**
> `client/src/pages/EstimateBuilder.tsx:225-246` (`useEstimateMath`) computes `total = subtotal + overheadAmt + profitAmt` and IGNORES `taxPct`. Add `taxAmt = subtotal * (taxPct / 100)` and include in total. Write `tests/unit/financial/estimateMath.test.ts` with cases: 0% tax, 8.25%, 10.25%, billable=false rows excluded. Verify all sub-components that display `total` still render correctly.

**Dispatch 5 — Stream 4 (Wave B) sub compliance upload**
> Sub portal Compliance tab in `client/src/pages/SubcontractorPortal.tsx` (~L437-527) currently shows a `toast("coming soon")` Upload button. Build the real version: file picker → Storage upload at `projects/{projectId}/compliance/{subUid}/{type}-{ts}.pdf` → Firestore update at `contacts/{subContactId}.compliance.{type} = { uploadedAt, fileUrl, expiresAt? }`. Types: W-9, COI, agreement, contractorLicense. Show expiry date with 30-day warning. Server upload endpoint enforces 10MB cap + PDF/image MIME types only. Add `tests/e2e/sub-compliance.spec.ts`.

**Dispatch 6 — Stream 3 (Wave B) notification triggers + prefs UI**
> Add 7 triggers to `functions/src/notifications/triggerCatalog.ts`: schedule_slip, change_order_created, selection_due, draw_requested, invoice_received, photo_uploaded, walkthrough_assigned. Each has an audience resolver (uid-based) + a default channel set (email/SMS/in-app). Then wire `client/src/components/settings/UserPreferencesDialog.tsx` Notifications tab to read/write per-user-per-trigger-per-channel preferences. Storage shape: `users/{uid}.notificationPrefs[trigger][channel] = boolean`. Add `tests/integration/triggers.catalog.test.ts`.

**Dispatch 7 — Award bid → schedule write**
> `functions/src/bids/awardBidRoute.ts` writes `bids/{id}.status='awarded'` but never touches schedule. After award succeeds, look up matching task/schedule line via `projectId + trade` and write `assignedSubId = check.resolvedUid` (the sub's auth uid). If multiple tasks match the trade, write to all. Add `tests/integration/awardBid.test.ts` with: (a) compliance gate blocks award if any of W-9/COI/agreement/license missing; (b) schedule task gets assignedSubId after award; (c) notification fires.

**Dispatch 8 — CO approval → contractAmount**
> `client/src/pages/ChangeOrders.tsx:221-225` flips status only. After moving to subcollection (Dispatch 3), update the server CO-approve handler to also increment `projects/{projectId}.contractAmount` by `coAmount` in the same Firestore transaction. Dashboard's `FinancialPositionCard` and `ProjectFinancialsCard` read `projects.contractAmount`. Add `tests/integration/co.budget.test.ts`.

**Dispatch 9 — MFA for admin/GC**
> Add TOTP enrollment flow in `client/src/pages/Settings.tsx` using Firebase Auth multi-factor. Make MFA required for `role in [admin, gc]` — sign-in flow must prompt for 2nd factor on subsequent logins for those roles. Recovery codes downloadable as `.txt`. Add `tests/e2e/mfa.spec.ts`.

**Dispatch 10 — Audit log + admin impersonation trail**
> Create `auditLogs/{id}` collection (rules: write-only by Cloud Function, read by admin only). In `client/src/contexts/AdminViewContext.tsx`, write an audit doc on `enterAdminView({ adminUid, impersonatedUid, startedAt })` and on `exitAdminView({ endedAt })`. Wrap every Firestore `setDoc`/`updateDoc` while `isAdminView===true` to append `_impersonatedBy: adminUid` field. Add a non-dismissable banner in `AppLayout.tsx` when in admin-view mode. Add `tests/integration/audit.impersonation.test.ts`.

---

## Closing note

This audit reflects origin/main HEAD `cd5511c` (after Wave A Streams 2 + 5 landed, before Stream 1 is merged). Re-run the audit after Stream 1 merges + the Tier 0 list lands; expected combined movement is roughly +2.5 points on production readiness, +3 on security, +1 on feature completeness. The test maturity score will not move without an explicit testing investment — that's the single ungrowable axis on the current trajectory.

Tyler asked for blunt. The product is good. It is not yet safe to put a real customer's money or legal documents into without the Tier 0 list + a credential rotation. Wave A is the right wedge.
