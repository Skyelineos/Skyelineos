# Skyelineos — Session Checkpoint
**Last updated:** 2026-05-22 (refresh against git history through commit `28f9cd0`)
**Live URL:** https://skyelineos.web.app
**Firebase project:** skyelineos (**BLAZE** plan — upgraded 2026-05-06)
**Deploy command:** `npm run deploy` (or `:hosting` / `:rules` / `:functions` variants — see `package.json`)
**Authoritative docs:** `CLAUDE.md`, `PROJECT_OVERVIEW.md`, `SESSION_NOTES.md` (in that order). This file is a session-checkpoint snapshot; the other three are the durable references.

---

## Current state (as of 2026-05-22)

Production `main` is at commit `28f9cd0`. Everything below is shipped on `main` unless marked otherwise.

**Unmerged work:** `origin/feat/selections-v2-dashboard-reminders` (`6b09bd6`, 2026-05-22) — dashboard tile + reminders + designer recommendations. Sits outside `main` because its data model assumes `clientApprovalStatus = 'Checking w/ Client'`, which conflicts with main's contractor-signoff rework. **Decide whether to port forward onto the lifecycle model or revert main before merging.**

### Selections + bidding (current shape on main)
- **1,195-item template** at `client/src/data/selectionsTemplate.ts`, idempotent per-project seeder (`SeedSelectionsFromTemplate`).
- **Lifecycle state machine** (in `selections-template-extensions.ts`): Not Started → Designer-Curating → Client-Reviewing → Awaiting-Bids → Bids-Received → GC-Approved → Ordered → Received → Installed.
- **Client view is collaborative, not approval-based**: `ClientSelectionsTimeline` lets the client mark a preference + leave a note. There is no client "Approve" button.
- **Two-stage vendor bidding**: `SelectionBid[]` per selection with `stage: 'rough' | 'final'`. Rough bids land off plans; final bids land once specs lock.
- **Preferred vendors per category** on contacts via `preferredCategories[]`; `usePreferredVendors(category)` hook resolves matches. `PreferredCategoriesEditor` dialog reachable from contact action menu.
- **Bid request flow** (`RequestBidUpdate` + `RequestBidUpdateAuto`): tries `POST /api/bid-requests/send`, falls back to `mailto:` per-vendor. Server route at `functions/src/bids/sendBidRequestRoute.ts` (folded into the Express api app, NOT a standalone callable — org IAM blocks new public functions).
- **Contractor sign-off queue** (`ContractorSignoffQueue`, mounted under `PhaseTimelineView` in `GCDesignSnapshot`): separate cost and design sign-offs; both must be checked for `gcApproved = true`.
- **Phase timeline view** with overdue + allowance-vs-actual roll-up across phases.
- **Firestore rules + indexes**: selections subcollection rules (`firestore.rules:210`), bidRequests subcollection rules, three composite selections indexes.

### Sessions in production (chronological, with commits)

- **`2558ab3` (initial commit)** — Skyline OS through Session 7. DesignerPortal, AIRenderingStudio (Coming Soon), SelectionsCatalog, all per-project tabs, ClientPortal/SubcontractorPortal/AdminPortal, 19 schedule components, real-time messaging, safety forms, site log, comms log, trades, catalogs, templates, automations (schema only), notifications Phase 1-3, subscriptions tracker.
- **`606e7a8` Session 8 — Takeoff, bidding, scheduling, playbook, reviews (2026-05-11).** Takeoff tool pinch zoom + fullscreen + halve-pages + measurement title + color picker; multi-trade bid packages, sub bid response, award flow; First/Last contact split + spouse linking + portal invite; dashboard missing-trade alerts + unsigned-schedule banner + pending reviews; playbook + project review form.
- **`40cf0c8` Session 9 — Contracts, lifecycle, reports, bills workflow, Jack import (2026-05-12).** New `contracts/` module (per-party portal visibility, ContractEditor with allowances/draws/COs/retainage/designer fee/employment fields, MyContractsView shared by Client/Sub/Designer, ContractProfitCard, SoftBudgetBadge); ProjectStageTracker (lead → design → estimating → contract → construction → move-in → warranty → completed); move-in binder + warranty reminders; reports + bills workflow + Jack import.
- **`bf409ed` Session 10 — sidebar consistency + progressUtils + role audit (2026-05-19).** Pre-cleanup snapshot of Session 10 work: Sidebar/SubcontractorSidebar/FinancialsSidebar unified on brand-black + gold + MobileNav + ProjectLayout alignment; shared StatCard; progressUtils rewritten to read Firestore directly (was hitting non-existent /api/* endpoints); bidding module hardening (AwardBidModal rewrite, BidRequestDetailModal w/ add-sub + reminders, ClaimContactDialog w/ replace/add email merge, RecipientMismatchBanner, BidPackageTemplatePicker); SubBidRequestsTab multi-ID resolution + auto-link + diagnostic panel; estimate builder polish; vCard import + manage leads + recipient prefill; **Lumber Takeoff module** (lib + wizard + PDF stage — what was originally written up as "Session 9"); Draws module + Trade Draws Panel; FCM web push service worker + EnablePushButton + dispatch pipeline; QBO OAuth scaffold; RoleGuard fail-closed.
- **`d162314` Cleanup — remove dead server/ + 11 stale bid components (2026-05-19).** ~45k lines deleted. `server/` directory (91 files, legacy Express + Drizzle/Postgres) gone. 11 "bid-processes" UI components calling endpoints that didn't exist on the deployed api function gone. **`PortalBidsPanel.tsx` is now the only canonical bid screen.**
- **`e5ec776` Session 10 docs (2026-05-19).** CLAUDE.md rewrite, PROJECT_OVERVIEW.md rewrite, SESSION_NOTES.md created.
- **`b787f7a` → `c4a7b46` Session 12 — Ingestion Lab (2026-05-20).** Admin-only AI ingestion at `/admin/ingestion-lab`. Namespace `ingestion_lab/**` (wildcard rule, admin reads + Cloud-Function-only writes); OAuth handlers for Gmail + Drive (folded into api app); Gmail ingester (label `Skyeline-Spike`); Drive ingester (two hardcoded folders — Giboney + Christensen); JSON upload endpoint (for future iMessage / iCloud Mac scripts); brain pass (Claude Sonnet 4.6, forced tool_use, daily $5 budget cap); lane resolver (REVIEW_REQUIRED_CATEGORIES vs INFORMATIONAL_CATEGORIES, auto-file threshold 0.90); UI with Connectors / Auto-Filed / Review Queue / Ask Queue tabs. Full reference: `docs/ingestion-lab-schema.md`.
- **`717cbf7` Selections portal foundations + Odyssey→Skyelineos rename (2026-05-21).** Applied the original `skyelineos-portal-patch/` (1,195-item template, seed button, PhaseTimelineView, ClientSelectionsTimeline, selections-template-extensions, indexes + rules). `OdysseyClientPortal.tsx` → `SkyelineClientPortal.tsx`. `package.json` name = `skyelineos`. localStorage key + Firebase scripts + UI strings all renamed. `ROLE_AUDIT.md` retains historical Odyssey notes intentionally.
- **`21dd262` Rework approval flow: contractor signs off, not client (2026-05-21).** Removed client approval CTAs; introduced `SelectionLifecycle` + `SelectionBid`; added `ContractorSignoffQueue` + `RequestBidUpdate`; reworked `ClientSelectionsTimeline` to preference + note instead of approve.
- **`24e6637` Preferred vendors per category + sendBidRequest Cloud Function (2026-05-21).** `preferredCategories[]` on contacts, `PreferredCategoriesEditor`, `usePreferredVendors` hook, `RequestBidUpdateAuto` wrapper, standalone `sendBidRequest` callable, bidRequests subcollection rules.
- **`2aadbb7` Merge selections-portal (2026-05-21).** Squash-merge of the selections-portal work into main.
- **`28f9cd0` Fold sendBidRequest into Express api app (2026-05-21).** New route `POST /api/bid-requests/send` registered on the shared `api` Express app. Standalone `sendBidRequest` callable removed (org IAM blocks new public functions). **Deploy note:** api function redeploy is blocked until `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are in Secret Manager.

### Lumber Takeoff Calculator (v1.0, landed in Session 10 cleanup snapshot `bf409ed`)
New top-level **Tools** section in the sidebar. First tool: Lumber Takeoff Calculator.

**Routes:**
- `/tools` → Tools landing page (cards: Lumber [Available], Tile/Millwork/Concrete [Coming Soon])
- `/tools/lumber` → Project picker
- `/tools/lumber/:projectId` → Takeoff list + "New takeoff" button
- `/tools/lumber/:projectId/:takeoffId` → 6-step wizard (Setup → Legend → Walls → Headers → Subfloor → Results)

**Files added (Session 10 cleanup snapshot):**
- `client/src/lib/lumber/types.ts`, `assemblies.ts`, `calculate.ts`
- `client/src/pages/Tools.tsx`, `LumberTakeoff.tsx`
- `client/src/components/lumber/LumberWizard.tsx`

**Data model:** Side-car doc at `projects/{projectId}/lumberTakeoffs/{takeoffId}`.

**Math rules (v1):** 1 stud/LF × 1.05 waste; plates 3× LF with 10% splice waste; sheathing area÷32 + 10% waste; headers pull beam specs from legend.

**Deferred to v1.5:** Wizard-driven markup on PDF (reuse PdfCanvas/MeasurementOverlay).
**Deferred to v2:** Trimmer/king breakout, shear walls, holdowns, multi-floor stacking, supplier pricing.

---

## Open threads (deploy blockers, stale docs, known issues)

### Deploy / live-site blockers
1. **`api` function redeploy is blocked** until `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set in Secret Manager. Per commit `28f9cd0`. Run: `firebase functions:secrets:set GOOGLE_CLIENT_ID` then `…GOOGLE_CLIENT_SECRET`.
2. **`api` function does NOT bind `SENDGRID_*` / `TWILIO_*` secrets** (`functions/src/index.ts:2011`). `sendBidRequestRoute` reads `process.env.SENDGRID_API_KEY` etc., which will be `undefined` in production. Bid request emails/SMS silently fall through to mailto. **One-line fix** — add the six names (`SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `APP_BASE_URL`) to the secrets array on the `api` onRequest config. (The standalone `dispatchNotification` function already has them via `functions/src/notifications/dispatch.ts:81`.)
3. **Ingestion Lab first-run prerequisites unmet.** Per `SESSION_NOTES.md` Session 12: Google Cloud OAuth client + redirect URIs + Gmail/Drive APIs enabled + OAuth consent screen + contacts cache probe + Gmail label. Until done, ingestion can't run.

### Stale docs
4. **`PROJECT_OVERVIEW.md` says the `/designer-portal` route is not wired in `App.tsx`** — it is, at `client/src/App.tsx:515`, behind `RoleGuard(['admin', 'designer'])`. Fix the doc.

### Known issues (per SESSION_NOTES.md, none of these are new)
5. **3 pre-existing TS errors** in `client/src/components/timeline/ModernTimelineBuilder.tsx` (lines 815, 816, 1342). Brace mismatch around 815 cascades. `npm run check` will always exit non-zero until fixed. `vite build` succeeds because esbuild is more permissive.
6. **RoleGuard isLoading bug** (`client/src/components/auth/RoleGuard.tsx:45`) — destructures `isLoading` but `useAuth` exposes `loading`. Loading-state guard never short-circuits. Benign in practice.
7. **`shared/types.ts:240` redefines `UserRole`** identically to `shared/auth-types.ts:16`. Roll into the role-taxonomy refactor.
8. **Dead role `pending_team`** — written by `ensureContactAuth.ts:34` and `contactAuthBackfill.ts:29`, never recognized by any UI. Users with this role have no portal.
9. **212 prod deps**, multiple Gantt + PDF libraries, at least one of each unused. Dep audit would shrink the install.
10. **AuthContext test-mode bypass** at `client/src/auth/AuthContext.tsx:70-95` — `localStorage.testMode === 'true'` injects fake admin. If you're debugging mysterious admin access, check there first.

### "Coming Soon" placeholders still on screen
- `Tools.tsx:139` — Tile/Millwork/Concrete calculators
- `ClientPortal.tsx:436` — design selection interface (this is partially obsoleted by `ClientSelectionsTimeline` in `SkyelineClientPortal.tsx` — confirm which client portal is the live one)
- `Financials.tsx:305` — financial reporting features
- `SubcontractorPortal.tsx:502` — document upload
- `DependencyManager.tsx:522` — interactive network diagram
- `UltimateTimelineBuilder.tsx:541` — advanced analytics
- `AIRenderingStudio.tsx:42` — Coming Soon dialog
- `DocumentTemplateEditor.tsx:182` — PDF export

---

## Test accounts (unchanged)
- gc: `testgc@skyelineos.com` / `SkyeTest2024!`
- designer: `testdesigner@skyelineos.com` / `SkyeTest2024!`
- client: `testclient@skyelineos.com` / `SkyeTest2024!`
- Tyler: `tyler@skyelinehomes.com` (admin)

---

## Pre-current-session history (preserved verbatim below)

The content below was the previous CHECKPOINT.md (last updated 2026-05-12, Session 9 framing). Useful for archaeology — the canonical narrative above replaces it, but many of the per-feature details (notification dispatch, subscriptions tracker, mobile sidebar fix, etc.) still match what's on `main`. Treat conflicts in favor of the canonical narrative above.

---

## Session 9 — Tools section + Lumber Takeoff Calculator v1 (2026-05-12)

### Lumber Takeoff Calculator (v1.0)
New top-level **Tools** section in the sidebar — landing page for Skyeline's standalone calculators. First tool shipped: Lumber Takeoff Calculator.

**Routes:**
- `/tools` → Tools landing page (cards: Lumber [Available], Tile/Millwork/Concrete [Coming Soon])
- `/tools/lumber` → Project picker (every takeoff must be tied to a project)
- `/tools/lumber/:projectId` → Takeoff list for that project + "New takeoff" button
- `/tools/lumber/:projectId/:takeoffId` → 6-step wizard (Setup → Legend → Walls → Headers → Subfloor → Results)

**Files added:**
- `client/src/lib/lumber/types.ts` — `LumberTakeoff` doc, `WallRun`/`HeaderRun`/`SubfloorArea`, `BeamSpec`/`PostSpec`, `WIZARD_STEPS`
- `client/src/lib/lumber/assemblies.ts` — `UTAH_DEFAULTS` (2x6 16"oc, OSB-1/2, 9' default, AdvanTech), stud precut lookup, sheathing display, waste helpers
- `client/src/lib/lumber/calculate.ts` — pure function: `LumberTakeoff → LumberTakeoffResult` (categorized lines + summary + warnings)
- `client/src/pages/Tools.tsx` — landing page
- `client/src/pages/LumberTakeoff.tsx` — page with internal `ProjectPicker` / `TakeoffPicker` / `TakeoffEditor` routing
- `client/src/components/lumber/LumberWizard.tsx` — wizard shell + all step components + tips panel + auto-save + CSV export

**Files modified:**
- `client/src/App.tsx` — lazy imports + 4 new routes (RoleGuard: admin/gc/projectManager)
- `client/src/components/layout/Sidebar.tsx` — new "Tools" nav group between Field and Finance
- `client/src/components/layout/MobileNav.tsx` — Tools entry under Catalogs
- `firestore.rules` — `match /projects/{projectId}/lumberTakeoffs/{lumberTakeoffId}` (GC/admin only)

**Data model:** Side-car doc at `projects/{projectId}/lumberTakeoffs/{takeoffId}` — keeps the generic Takeoff tool's `Measurement` types untouched. Lumber doc references measurements by id (future v1.5) OR holds numeric inputs directly (v1).

**Math rules (v1):**
- Studs: 1 stud/LF × 1.05 waste (industry quick-takeoff rule absorbs corners + T-intersections)
- Plates: bottom 1× LF + top 2× LF = 3× total, with 10% splice waste, treated callout for bottom-on-slab
- Sheathing/subfloor: area ÷ 32 sf/sheet + 10% waste, ceiling-rounded
- Headers: each occurrence pulls its beam spec from the legend → emits `qty × length` per beam designation

**Build verified:** `npm run check` returned only pre-existing `ModernTimelineBuilder.tsx` errors. `vite build` succeeded in 5.66s; both `Tools-*.js` and `LumberTakeoff-*.js` chunks emit clean.

**Deferred to v1.5:** Wizard-driven markup on PDF (reusing PdfCanvas/MeasurementOverlay) so the user can draw walls/beams on the plan instead of typing LF. Each measurement gets tagged with kind/height/beam designation and feeds the same `calculate()` engine.

**Deferred to v2:** Trimmer/king-stud breakout by P#, shear walls, holdowns, multi-floor stacking refinements, supplier pricing layer.

---

## Session 7 — Major Additions (2026-05-06 → 2026-05-07)

### 1. Takeoff Tool (Phase 1) — Plan PDF measurements
- `client/src/components/takeoff/` — full PDF.js + SVG overlay measurement tool
  - `PdfCanvas.tsx` — PDF.js renderer with PDF user-space coordinate conversion (zoom-stable)
  - `MeasurementOverlay.tsx` — SVG overlay for linear/area/count
  - `CalibrationDialog.tsx` — set scale via known dimension
  - `TakeoffStudio.tsx` — main container, Firestore-backed
  - `lib/geometry.ts` — distance, polygon area (shoelace), unit conversions
  - `lib/types.ts` — types
- Page: `/projects/:id/takeoff` — accessible to GC, projectManager, designer, admin
- Designer Portal also has a Takeoff tab
- Firestore: `projects/{id}/takeoffs/{takeoffId}` — coordinates stored in PDF user space
- Storage: `projects/{id}/takeoffs/{takeoffId}/{filename}.pdf`
- Push-to-Estimate stub (passes line items via callback)
- **Phase 2 deferred:** volume measurements, multi-page nav, AI auto-takeoff

### 2. Import Center — 17 templates + Google Sheets URL
- File: `client/src/pages/ImportCenter.tsx` (extended substantially)
- **NEW templates added** (10 total): Cost Breakdown, Draw Schedule, Punch List, Change Orders, Design Selections, Jobsite Inspection, Bid History, Expenses/Bills, Permits & Inspections, Lot/Land Inventory
- Existing templates: Clients, Subcontractors, Projects, Schedule, Catalogs, Employees, Invoices
- **Google Sheets URL paste support** — drop a shared sheet URL and parse-as-CSV via export endpoint
- **New collections:** `permits/{id}`, `lots/{id}` (Firestore rules added)

### 3. Job Template Editor — Full JACK-parity rewrite
- File: `client/src/components/templates/JobTemplateEditor.tsx`
- **Per-task fields:** name, description, category, department, assignee role, tags, date-type (Fixed vs Dependent), days-offset, dependsOn task, checklist, notify-on-assign/due/complete
- **Filter tabs by category:** All / Schedule / Cashflow / Selections / Safety/QC / Administration
- **TaskEditModal** — full edit dialog with all fields
- **ApplyToJobModal** — pick project + start date → generates real Tasks via topological due-date resolution (handles dependent task chains correctly + cycle detection fallback)
- Notifies the applier on completion

### 4. Walkthrough Capture (field media → assigned tasks)
- Files: `client/src/components/walkthrough/{WalkthroughCapture,WalkthroughList}.tsx`
- **Floating Action Button** on `/projects/:id/overview`
- iPhone/Android camera capture via `<input type="file" capture="environment">` for photo + video
- Auto-creates a walkthrough record + a corresponding Task assigned to the chosen sub
- Auto-fires `walkthrough_assigned` notification to the sub
- WalkthroughList component: status filter pills (All/Open/In Progress/Done), media cards, inline status update
- Firestore: `projects/{id}/walkthroughs/{walkId}` — sub-only sees their assigned items
- Storage: `projects/{id}/walkthroughs/{filename}`

### 5. Phase 2 Notifications — Real Firestore-backed bell
- New: `client/src/lib/notifications.ts` — helper to create + mark-read
- Replaced `client/src/components/messaging/NotificationCenter.tsx` with live Firestore subscription
- Bell icon shows unread count badge in top nav
- Per-kind icons + colors (task_assigned, task_due, walkthrough_assigned, etc.)
- Click → marks read + navigates to link
- "Mark all read" bulk action
- Firestore: `notifications/{id}` collection (rule: each user reads only their own; any signed-in user can write)
- Index added: `userId + createdAt DESC`

### 6. Phase 3 Notifications — Cloud Functions LIVE
- `functions/src/notifications/dispatch.ts` — Firestore trigger on `notifications/{id}` create
  - Looks up recipient's user/contact email + phone + prefs
  - Sends via SendGrid + Twilio (currently no-ops with placeholder secrets — real keys needed)
  - Per-kind opt-in/opt-out support via `notificationPrefs.kinds[kind]`
- `functions/src/notifications/scheduledDueSweep.ts` — daily 7am MT
  - Scans tasks due in next 24h, status ≠ done
  - Creates `task_due` notifications (idempotent via `dedupeKey`)
- Functions deployed: `dispatchNotification`, `dueSweep`, `api`
- **Secrets in Secret Manager:** SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, APP_BASE_URL, **ANTHROPIC_API_KEY** (real key in)
- Dependencies installed: `@sendgrid/mail`, `twilio`

### 7. Subscriptions Tracker (admin page)
- File: `client/src/pages/Subscriptions.tsx`
- Route: `/subscriptions` (admin-only)
- Sidebar + MobileNav links under Management
- Auto-seeds `subscriptions` collection on first admin visit with 7 services (Firebase, Anthropic, OpenAI, SendGrid, Twilio, Reimagine Home, Domain)
- Per-row: name, vendor, category, status, pricing, monthlyEstimate, lastMonthActual, **API key (masked, reveal/copy buttons)**, signup/dashboard URLs, notes
- Top strip: Projected this month / Last month actual / Variance
- Bottom card: total run-rate vs JACK ($299) / BuilderTrend
- Firestore: `subscriptions/{id}` — admin-only read+write

### 8. Mobile sidebar fix
- Bug: `sheet.tsx` had hardcoded inline `backgroundColor` style that overrode `className`. Fixed by spreading user-provided `style` after defaults.
- `MobileNav.tsx` updated: explicit dark slate-900 bg, white text, gold (#C9A96E) active, slate-200 inactive items, hover handlers.
- Users moved to bottom of mobile nav.

### 9. 404 fix on portals
- `/client-portal` and `/subcontractor-portal` (no tab) → 404 because routes were `/client-portal/:tab*` only.
- Added base routes that render the same component.

---

## Other Claude session work (Session 6.5 — overnight 2026-05-06 ~02:30 UTC)
The other Claude Code session in the terminal shipped 4 features in parallel agents:
- **Estimates Kanban** — 5-column pipeline (Pending / In Progress / Waiting for Quotes / Internal Approval / Archived) with toggle to list view
- **Estimate Costings Tab** — 13 pre-seeded cost groups with formula bar (Builder Cost + Markup = Owner Price)
- **Job Template scaffolding** — base task list with day-offset (which Session 7 then dramatically extended)
- **Document Template Editor** — letterhead preview + rich-text body

---

## Costs as of 2026-05-07
- Firebase Blaze plan active (no current charges — within free tier)
- Anthropic API key live, $5–10 free credit
- Subscriptions tracker shows projected ~$30/mo run-rate (Anthropic + Firebase active; rest are trial/paused)

## PENDING / Next session priorities
1. **Test notification system end-to-end** — capture walkthrough as GC, log in as sub on phone, confirm in-app notification + click-through
2. **Real SendGrid + Twilio API keys** — sign up + replace placeholder secrets via `firebase functions:secrets:set`
3. **AI Bill OCR** — `bills` collection + Cloud Function with Claude vision; UI to upload bill image and confirm extracted data
4. **AI Estimate Drafter** — feed plan PDF + scope description, get first-draft line items
5. **AI Rendering Studio** — replace "Coming Soon" with real img-gen via OpenAI gpt-image-1
6. **Per-task assignee mapping** for template apply (role → specific user)
7. **Rotate Anthropic API key** (was sent over WhatsApp — defense-in-depth, rotate after 24-48h)

## Test accounts (unchanged)
- gc: testgc@skyelineos.com / SkyeTest2024!
- designer: testdesigner@skyelineos.com / SkyeTest2024!
- client: testclient@skyelineos.com / SkyeTest2024!
- Tyler: tyler@skyelinehomes.com (admin)

## Known issues / cleanup items
- `tester@gmail.com` user still exists — delete via Firebase Console
- `ModernTimelineBuilder.tsx` has pre-existing TS errors (not blocking)
- 4 large bundle chunks (>500kB) — could code-split later

---

## All previous sessions' work (1-6)
[Original CHECKPOINT.md content preserved below — pre-Session 7]

### Firebase Project (now Blaze plan as of Session 7)
- **Hosting + Firestore + Auth + Functions + Storage**: `skyelineos`
- **Live URL**: https://skyelineos.web.app
- **Spark → Blaze upgraded:** 2026-05-06 (Session 7)

### Bugs fixed previous sessions
- `DesignerPortal.tsx` — temporal dead zone crash fixed
- `functions/src/index.ts` — `authMiddleware` defined
- Seed script `serverTimestamp()` inside array — replaced
- Firestore rules: selections, schedules, draws, takeoffs, walkthroughs, permits, lots, notifications, subscriptions all added

### Major features built before Session 7
- DesignerPortal with selections workflow
- AIRenderingStudio (Coming Soon placeholder)
- SelectionsCatalog
- ProjectOverview / ProjectDetail / ProjectEstimates / ProjectBids / ProjectSchedule / ProjectBudget / ProjectDocuments / ProjectPhotos
- ClientPortal (8 tabs)
- SubcontractorPortal (8 tabs)
- AdminPortal + UserManagement
- 19 Schedule components (DHtmlx Gantt + custom views)
- Real-time messaging w/ threading + mobile UI
- Safety forms (4 form types)
- Site Log
- Comms Log
- Trades management
- Catalogs
- Templates
- Automations (rules-based, schema only — execution engine deferred)
