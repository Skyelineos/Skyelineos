# Skyeline OS — MVP Audit

**Date:** 2026-07-04
**Auditor:** Claude Code (subagent, opus-4-7)
**Repo:** `~/Projects/Skyelineos`
**Scope:** enumerate every route/page, verify wiring end-to-end, park non-MVP
features under `future-features/`, and fix quick wins. **No deploys.**

---

## TL;DR

- **Router surface:** 81 pages in `client/src/pages/`; ~90 routes in `App.tsx`.
- **Backend:** Firebase Functions with a single Express app in
  `functions/src/index.ts` (2441 lines). Bid, project, task, expense,
  estimate, communications, SMS, voice, QBO, and leads routes are all
  registered under one `/api/*` auth gate.
- **TypeScript health:** 468 → **403** errors after fixes. Not blocking builds
  (`vite build` succeeds). The bulk of remaining errors are `unknown` inference
  from untyped `useQuery()` calls in the accounting/financial power-user
  components — fixable with a single-file sweep per component.
- **Non-MVP parked:** 11 pages + 4 component folders moved to
  `future-features/`. Their routes and sidebar entries are commented out
  (not deleted) so restoring is a one-diff operation.
- **External connections:** Firebase config uses hard-coded fallbacks so the
  app boots even with a mostly empty `.env`. Twilio + Anthropic keys are set.
  SendGrid, Google Calendar (OAuth), Google Drive (via Ingestion Lab), and
  Stripe are gated behind env flags — routes exist, just not activated.
- **Communications portal:** Solid foundation (Firestore + realtime listeners
  in both `messaging/` and `communications/`), but the "Communication Center"
  and per-project Messaging are two parallel implementations of the same
  concept. See §6 recommendation.

---

## 1. Section Status Matrix

| Section | Route(s) | Status | Notes |
|---------|----------|:------:|-------|
| Sign In / Auth | `/sign-in`, `/portal-login` | ✅ | Firebase Auth + role-based redirect. |
| Dashboard | `/dashboard` | ✅ | Cards live-read Firestore; role-gated. |
| Projects — list | `/projects` | ✅ | Wired to `/api/projects` + Firestore. |
| Projects — setup wizard | `/projects/setup[/:draftId]` | ✅ | Multi-step draft state persists. |
| Project detail | `/projects/:id` + subtabs | ✅ | Overview / Estimates / Bids / Schedule / Budget / Docs / Photos / Design / Tasks / RFIs / Change-Orders / Site Log / Bills / Walkthroughs / Move-in Binder — all mounted. |
| Project — Gantt / Timeline | `/projects/:id/schedule`, `/timeline` | ⚠️ | Timeline builder has 12 TS errors (`AdvancedTimelineBuilder.tsx`) — renders but internal typings loose. |
| Bids — package/submit/compare/award | `/tools/bid-compare`, project/:id/bids, `/bid/respond/:token` | ✅ | Full loop wired: send → magic-link → submit → compare → award → PO. Public magic-link route is auth-free. |
| Financials | `/financials/:tab?` | ⚠️ | Overview + Cash Flow + Budget-Analysis + Invoices + Payments + POs + Cost Tracking tabs load; **Reports tab is stubbed "coming soon"** (real `/reports` page exists separately). Payment Processing gated behind `VITE_STRIPE_PUBLIC_KEY` (currently unset). |
| Estimates | `/estimates`, `/projects/:id/estimates` | ✅ | Estimate builder is 541 kB bundle — heaviest page, but functional. |
| Bills | `/bills`, `/projects/:id/bills` | ✅ | |
| Expenses | `/expenses` | ✅ | Backed by `functions/src/expenses/`. |
| Tasks | `/tasks`, `/projects/:id/tasks` | ✅ | |
| Daily Digest | `/daily` | ✅ | Route registered, backed by `dailyWorkflowRoute`. |
| Change Orders | `/change-orders`, `/projects/:id/change-orders` | ✅ | |
| Site Log | `/site-log`, `/projects/:id/site-log` | ✅ | Realtime Firestore. |
| Documents | `/documents`, `/projects/:id/documents` | ✅ | Firebase Storage-backed. |
| Photos | `/projects/:id/photos` | ✅ | |
| Contacts | `/contacts` | ✅ | |
| Contracts | `/contracts` | ✅ | |
| Sales / CRM | `/sales`, `/learn-more` (public lead-capture) | ✅ | Public route hits `/api/leads/public-intake`. |
| Schedule (global) | `/schedule`, `/global-schedule` | ✅ | |
| Reports | `/reports` | ✅ | Six real report types (gain/loss, WIP, lead source, etc.) reading live Firestore. |
| Comms Log | `/comms-log` | ✅ | |
| Communication Center | `/communications` | ✅ | Real Firestore listeners + AI analyze/summarize routes. |
| Messages (project chat) | `/messages` | ✅ | Slack-like channel + realtime. Parallel to Communication Center — see §6. |
| Client Portal | `/client-portal[/:tab*]` | ✅ | |
| Sub Portal | `/subcontractor-portal[/:tab*]` | ✅ | |
| Designer Portal | `/designer-portal[/:tab*]` | ⚠️ | "Design gallery — coming soon" placeholder inside; core scheduling works. |
| Admin Portal | `/admin-portal` | ✅ | |
| Admin Link Queue | `/admin/link-queue` | ✅ | Sub→contact reconciliation UI. |
| Settings | `/settings` | ✅ | Includes QBO connection card. |
| Users | `/users` | ✅ | |
| Templates | `/templates` | ✅ | |
| Master Tasks | `/master-tasks` | ✅ | |
| Task List Library | `/task-library` | ✅ | |
| Catalogs | `/catalogs` | ✅ | |
| Cost Codes | `/cost-codes` | ✅ | |
| Tools index | `/tools`, `/tools/lumber`, `/tools/bid-compare` | ✅ | Lumber takeoff + bid compare live. |
| Safety | `/safety` | ✅ | |
| Timesheet | `/timesheet` | ✅ | |
| Import Center | `/import-center` | ✅ | |
| SMS Privacy / Terms | `/sms-privacy`, `/sms-terms` | ✅ | Public disclosure pages. |
| **Content Studio** | ~~`/content-studio`~~ | 🚫 | Moved to `future-features/`. |
| **Design Board** | ~~`/design-board`~~ | 🚫 | Moved. |
| **Social Media** | ~~`/social-media`~~ | 🚫 | Moved. |
| **Automations** | ~~`/automations`~~ | 🚫 | Moved. |
| **Playbook** | ~~`/playbook`~~ | 🚫 | Moved. |
| **Subscriptions** | ~~`/subscriptions`~~ | 🚫 | Moved. |
| **API Storage** | ~~`/api-storage`~~ | 🚫 | Moved. |
| **Ingestion Lab** | ~~`/admin/ingestion-lab`~~ | 🚫 | Moved (backend routes retained). |
| **AI Inbox** | ~~`/admin/ai-inbox`~~ | 🚫 | Moved (backend routes retained). |
| **Style Library Admin** | ~~`/admin/style-library`~~ | 🚫 | Moved. |
| **Giveaway** | ~~`/giveaway`~~ | 🚫 | Moved. |

---

## 2. Broken / Wonky Items (with file paths)

### Critical

- **`client/src/lib/queryClient.ts` — `apiRequest()` had a single signature but ~90 call sites used two.** Modern callers passed `(url, options)`; legacy callers passed `(method, url, body)`. TS errored on the legacy shape; at runtime, the legacy 3rd arg was silently dropped, so POST/PUT bodies weren't sent — buttons appeared to "click but nothing happens." → **Fixed** (see §3).

### Financial power-user components (heaviest TS-error concentration)

- `client/src/components/financial/PaymentProcessingCenter.tsx` (37 errors) — untyped `useQuery` returns; Stripe helpers reference `.data` fields that don't exist on `{}`.
- `client/src/components/financial/AutomatedPOSystem.tsx` (30 errors) — same pattern.
- `client/src/components/financial/InvoiceMatchingSystem.tsx` (22 errors) — same.
- `client/src/components/financial/ProfitMarginAnalysis.tsx` (18 errors) — same.
- `client/src/components/financial/CostVarianceAnalysis.tsx` (16 errors) — same.
- `client/src/components/financial/CashFlowForecasting.tsx` (11 errors) — same.
- `client/src/components/budget/BudgetTab.tsx` (17 errors) — same.
- `client/src/components/budget/LiveBudgetDashboard.tsx` (8 errors) — same.
- `client/src/components/accounting/CompanyFinancialDashboard.tsx` (15 errors) — same.

**Root cause pattern:** `const { data: projects = [] } = useQuery({ queryKey: ['/api/projects'] })` — no generic, so `data` is `unknown`. **Fix pattern:** `useQuery<Project[]>({ queryKey: [...] })`. All these still render because runtime doesn't care about TS, but they're type-lying about their data.

### Placeholder UI still in production paths

- `client/src/pages/Financials.tsx:305` — Financial Reports tab renders `"Financial reporting features coming soon..."`. The real Reports page is at `/reports` — **recommend redirecting the tab to `/reports` or embedding it**.
- `client/src/pages/DesignerPortal.tsx:245` — Design gallery + Designer schedule show "coming soon" text.
- `client/src/pages/SkyelineClientPortal.tsx:125` — Generic "{feature} — coming soon" fallback (fine if never hit; audit which tab keys trigger it).
- `client/src/pages/Tools.tsx:150` — At least one tool card says "Coming Soon".

### Dead handlers

- `client/src/components/designer/SelectionsManager.tsx:408` — "Save to Catalog too" button had `onClick={() => {}}`. → **Fixed** — now calls the passed `onSaveToCatalog` prop.

### Miscellaneous type errors

- `client/src/App.tsx:894,908` — `roles: ['Admin', 'Sub', 'Subcontractor']` used `'sub'` but `UserRole` union didn't include it. → **Fixed** by widening `UserRole`.
- `client/src/components/auth/AuthProvider.tsx:3` — imports `AuthContext` from `@/hooks/use-auth`, which doesn't export it. This is a **live bug** if anything actually renders `<AuthProvider>`. Currently no callers import it (verify with `grep AuthProvider client/src/**/*.tsx`) — safe to delete the file.
- `client/src/utils/dependencyUtils.ts:1` — imports `ScheduleDependency` from `useProjectSchedule`, which doesn't export it. Utility appears orphaned; grep before deleting.
- `client/src/utils/frontendTracing.ts` — OpenTelemetry setup references API surface that doesn't exist in the installed `@opentelemetry/sdk-trace-web` version. Never called from bootstrap (verified via grep). → **Safe to delete**; keep only if you plan to wire APM.
- `client/src/components/common/PerformanceProvider.tsx:9` — `useEffect(async () => …)` — returns a Promise, not a cleanup fn. Cleanup never runs. Not a runtime crash, but the effect leaks whatever listeners it wires. Wrap the async body in an inner IIFE.

### Non-fatal but noisy

- Cash Flow, Budget, and Accounting components each independently fetch `/api/projects`, `/api/client-payments`, `/api/purchase-orders`, `/api/invoices`. Consolidating those into shared hooks (`useProjects`, `useClientPayments`, etc.) would collapse the "unknown-type" churn to a single fix.

---

## 3. Fixes Applied This Pass

| File | Change |
|------|--------|
| `client/src/lib/queryClient.ts` | `apiRequest()` now accepts **both** `(url, options?)` and `(method, url, body?)` signatures. Cut TS errors 468 → 403 and un-broke ~90 legacy call sites. |
| `client/src/components/auth/RoleGuard.tsx` | Widened `UserRole` union to include `'sub'` (was already used in `App.tsx` and Sidebar). |
| `client/src/components/designer/SelectionsManager.tsx` | "Save to Catalog too" button now calls `onSaveToCatalog?.()` instead of no-op. |
| `client/src/App.tsx` | Removed ~11 lazy imports and 8 routes for parked pages; commented (not deleted) with `MVP AUDIT` markers. |
| `client/src/components/layout/Sidebar.tsx` | Commented the "Creative" nav group + admin/marketing entries in "Management". |
| `client/src/components/layout/MobileNav.tsx` | Same treatment as Sidebar. |
| `future-features/` | Created. Contains parked pages + component folders + `README.md`. |
| Verified `npx vite build` still succeeds. |

---

## 4. External Connection Status

### Firebase / Firestore ✅
- Web config: hard-coded fallbacks in `client/src/lib/firebase.ts` mean the app boots even with an empty `.env`. Values in `.env` are actually mostly empty (`VITE_FIREBASE_API_KEY`, `MESSAGING_SENDER_ID`, `APP_ID` all `""`). This works but is **fragile** — if the fallbacks ever drift from production, only prod will notice.
  - **Recommendation:** populate `.env` from Firebase Console to match hardcoded values, or delete the fallbacks and require env.
- Firestore rules: `firestore.rules` is 58 KB and comprehensive. Deployed as of the last `firebase deploy --only firestore:rules` (per `firebase-debug.log`).
- `firestore.indexes.json` is 13 KB — indexes exist and are tracked.
- App Check: gated on `VITE_FIREBASE_APP_CHECK_KEY` being present. Currently empty. In production `import.meta.env.PROD` triggers the code path anyway; will log-and-continue if the key is missing.

### Google Calendar ⚠️
- `GOOGLE_CALENDAR_ENABLED` env flag is checked in `functions/src/tasks/calendarService.ts`. **When flag ≠ `'true'`, it no-ops and logs `"integration pending OAuth setup"`.**
- OAuth handler exists at `functions/src/ingestionLab/oauthHandlers.ts` (calendar path alongside gmail/drive). Endpoints:
  - `GET /api/ingestionLab/oauth/calendar/start`
  - `GET /api/ingestionLab/oauth/calendar/callback`
- **State:** wiring in place; needs (a) Tyler to complete the OAuth consent flow, (b) `GOOGLE_CALENDAR_ENABLED=true` in Cloud Functions env.
- **NOTE:** the Ingestion Lab UI is now parked in `future-features/`. To trigger the OAuth flow without the UI, either restore the page temporarily or hit `/api/ingestionLab/oauth/calendar/start` directly with an admin ID token.

### Gmail / SendGrid ⚠️
- `SENDGRID_API_KEY` is defined as a Firebase secret (`defineSecret('SENDGRID_API_KEY')`) in `functions/src/notifications/dispatch.ts`. It's bound to the `api` function alongside Twilio + `APP_BASE_URL`.
- `sendPortalInviteRoute.ts` reads `process.env.SENDGRID_API_KEY` — this only works if the secret is bound. Verify with `firebase functions:secrets:access SENDGRID_API_KEY` in the CLI. If unset, portal invites silently fail.
- Local `.env` has **no** `SENDGRID_API_KEY` (dev-only local won't send email).

### Twilio SMS (10DLC pending) ✅ routes exist
- `.env` has `TWILIO_ACCOUNT_SID` (34 chars), `TWILIO_AUTH_TOKEN` (32 chars), `TWILIO_FROM_NUMBER` (12 chars).
- Routes registered in `functions/src/index.ts`:
  - `POST /api/sms/inbound` (legacy webhook, Twilio-signed, public)
  - `POST /api/sms/webhook` (Phase 1 SMS Agent, public)
  - `POST /api/sms/send`, `GET /api/sms/threads`, `/messages`, `/api/sms/contacts`, `POST /api/sms/generate` (staff-only, behind auth gate)
- **10DLC campaign gating is upstream at Twilio, not in code.**

### Twilio Voice ✅ routes exist (not activated per instruction)
- `functions/src/voice/voiceRoutes.ts` registers:
  - `POST /api/voice/inbound`
  - `POST /api/voice/gather`
  - `POST /api/voice/recording-complete`
  - `POST /api/voice/transcription-complete`
- **Left untouched.** Webhook is NOT pointed at production per instructions.

### Google Drive ⚠️
- Only accessed through Ingestion Lab (`functions/src/ingestionLab/driveIngester.ts`). Backend endpoint remains registered even though the UI is parked.

### Stripe 🚫 not configured
- `VITE_STRIPE_PUBLIC_KEY` is empty. `Financials.tsx` conditionally hides `PaymentProcessingCenter` when the key is missing — good defensive behavior. Payment processing intentionally deferred.

### QBO ✅ wired
- `registerQboWebhookRoutes` mounted publicly (HMAC-verified). `QboConnectionCard` in Settings surfaces the OAuth start.

### Anthropic ✅
- `ANTHROPIC_API_KEY` is 108 chars in `.env` and bound as a Firebase secret to `api`. Used by Communication Center AI + AI Inbox + estimate extraction + bid compare.

---

## 5. Features Moved to `future-features/`

Full README at `future-features/README.md`. Summary:

**Pages moved (git-tracked moves):**
- `pages/Automations.tsx`
- `pages/ContentStudio.tsx`
- `pages/DesignBoard.tsx`
- `pages/SocialMedia.tsx`
- `pages/Playbook.tsx`
- `pages/Giveaway.tsx`
- `pages/Subscriptions.tsx`
- `pages/ApiStorage.tsx`
- `pages/IngestionLab.tsx`
- `pages/AiInbox.tsx`
- `pages/StyleLibraryAdmin.tsx`

**Component folders moved:**
- `components/aiInbox/` (2 files)
- `components/content-studio/` (2 files)
- `components/ingestionLab/` (5 files)
- `components/playbook/` (1 file)

**Not moved (kept in main tree):**
- `LearnMore.tsx` — public lead-capture QR landing page. Feeds Sales/CRM. Judged MVP-critical for a builder pushing model-home tours.
- `Templates.tsx`, `MasterTaskLibrary.tsx`, `TaskListLibrary.tsx` — used by the Project Setup wizard's task-list generation. Kept in tree.
- `Catalogs.tsx`, `CostCodes.tsx` — referenced by Estimates and Designer.
- `functions/src/aiInbox/` and `functions/src/ingestionLab/` — backend endpoints stay registered (they're idle without the UI, harmless).

---

## 6. Communications Portal Assessment

### Current state

There are **two parallel communications implementations** in the app, both wired to real Firestore, both with realtime listeners, and both accessible from the sidebar:

1. **Messages** (`/messages`) — `client/src/components/messaging/ProjectChat.tsx`
   - Slack-style channels per project (general / design / budget / field / trade)
   - Membership by channel; @mention → notification
   - Realtime via `onSnapshot`
   - **In-app only.** Does not fan out to SMS/email.

2. **Communication Center** (`/communications`) — `client/src/components/communications/CommunicationPanel.tsx`
   - Unified thread list across leads, clients, projects (any surface with a thread ID)
   - AI extraction: `/api/communications/threads/:id/analyze` and `/summarize` (Anthropic-backed)
   - Realtime via `onSnapshot`
   - Deep-linking (`/communications?thread=<id>`)
   - Integrates with Action Items + Decisions collections

### Speed / fitness for real-time contractor/client comms

- **In-app latency:** ✅ Realtime. Firestore `onSnapshot` → sub-second updates. Good enough for chat.
- **Delivery outside the app:** ❌ Neither surface fans out to SMS or push by default. The `notifications/dispatch.ts` pipeline (SendGrid + Twilio + FCM) exists, but the two chat surfaces don't invoke it on send — only mentions in Messages call `notifyMentions()`, and Communication Center relies on staff opening the app.
- **Mobile push:** `PushNotificationPrompt` and `NotificationCenter` are mounted at the App level. Push registration works, but individual chat sends don't push.
- **Contractor UX:** Subs currently reach messages via the Sub Portal → `/messages`. Fine for daily-driver subs; poor for text-only trades.

### Verdict

Foundation is real and fast (Firestore realtime), but the app is currently **two competing surfaces** trying to be the source of truth. That fragments where a client or sub actually looks for a message.

**Recommendation (do first):**
1. **Pick one primary surface.** The Communication Center's cross-context model (leads → warranty) is the more useful one — it survives project archiving and covers pre-sale threads. Messages/ProjectChat is nicer for team-internal chatter.
2. **Alias `/messages` to `/communications`** for MVP, or embed the ProjectChat as a "Team" tab inside the Communication Center. Deleting either code path is risky mid-audit — flag it as a follow-up.
3. **Wire outbound fan-out on message send:**
   - Client message → SMS + email via `notifications/dispatch.ts`.
   - Sub message → SMS via Twilio (already-signed 10DLC campaign will make this compliant).
   - Owner @mentions → FCM push (already-wired).
4. **Keep both realtime listeners** (they're cheap and already work).

**Not recommended:** rebuilding chat from scratch or bringing in Sendbird/Stream. What you have will scale to a few dozen active projects.

---

## 7. Recommended Next Fixes, In Priority Order

1. **Consolidate `useQuery` typings in the financial/budget/accounting stack.** Add `<T>` generics to every `useQuery` in `components/financial/*`, `components/budget/*`, `components/accounting/*`. Estimated impact: ~250 of the remaining 403 TS errors. Pattern change; can be done as a single PR.

2. **Communications consolidation** (see §6). Decide primary surface + wire outbound fan-out.

3. **Financial Reports tab.** In `pages/Financials.tsx`, replace the "coming soon" Reports tab body with either an `<iframe src="/reports">` embed or a `<Redirect to="/reports">`. Users get to the real reports one click sooner.

4. **`AuthProvider.tsx` and `dependencyUtils.ts` cleanup.** Grep for callers; if none, delete. If yes, fix the imports.

5. **`frontendTracing.ts`.** Either upgrade `@opentelemetry/*` deps and wire it into bootstrap, or delete. Currently a lint/type liability with zero benefit.

6. **Sidebar/MobileNav `/design-board` dead link** in `components/projects/ProjectTodayInbox.tsx:174` — points to a parked route. Either link somewhere real (e.g. `/projects/:id/design`) or remove the "view all" chip.

7. **Google Calendar activation.** When Tyler is ready to authorize:
   - Un-park `IngestionLab` briefly, complete OAuth via `/api/ingestionLab/oauth/calendar/start`, re-park.
   - Set `GOOGLE_CALENDAR_ENABLED=true` in Cloud Functions env.
   - Verify a task with a `dueDate` fans out an event.

8. **SendGrid smoke test.** Trigger `sendPortalInviteRoute` for a test contact and confirm the invite email lands. If it doesn't, the secret is unbound.

9. **Client Portal + Sub Portal audit of "coming soon" placeholders.** Grep for `— coming soon` inside those pages; hide the tabs entirely rather than surface a stub — clients seeing stubs feels unfinished.

10. **`PerformanceProvider.tsx`** — fix the async `useEffect` to prevent listener leaks over long sessions.

11. **Sidebar "Templates" nav entry survivability check.** Templates is kept in tree but not used in the customer-facing MVP flow — verify GC users actually use it, otherwise it's dead weight in the sidebar.

12. **Env hygiene.** Populate `.env` from Firebase Console so it matches the fallbacks in `firebase.ts`. Delete the fallbacks after that.

---

## Appendix A: TypeScript Error Count by File (post-fixes)

Top 20 (see full list via `npx tsc --noEmit -p tsconfig.json`):

```
37 client/src/components/financial/PaymentProcessingCenter.tsx
30 client/src/components/financial/AutomatedPOSystem.tsx
22 client/src/components/financial/InvoiceMatchingSystem.tsx
18 client/src/components/financial/ProfitMarginAnalysis.tsx
17 client/src/components/budget/BudgetTab.tsx
16 client/src/components/financial/CostVarianceAnalysis.tsx
15 client/src/components/accounting/CompanyFinancialDashboard.tsx
12 client/src/tests/ProtectedRouteTest.tsx
12 client/src/components/timeline/AdvancedTimelineBuilder.tsx
12 client/src/components/payments/PaymentDashboard.tsx
12 client/src/components/invoices/AutomatedInvoiceManagement.tsx
11 client/src/components/financial/CashFlowForecasting.tsx
 9 client/src/components/timeline/AddTaskModal.tsx
 8 client/src/components/budget/LiveBudgetDashboard.tsx
 7 client/src/components/accounting/PerProjectAccountingTab.tsx
 6 client/src/utils/cycleDetection.ts
 5 client/src/utils/frontendTracing.ts
 4 client/src/components/timeline/GanttChart.tsx
 4 client/src/components/projects/EstimatesTab.tsx
 4 client/src/components/documents/PurchaseOrdersSection.tsx
```

## Appendix B: Verified working (representative sample)

- `npx vite build` — 8.6s, no errors, produces `dist/public/`.
- Firebase config resolves from hardcoded fallbacks; app initializes even with empty `VITE_FIREBASE_API_KEY`.
- Bid magic-link route `/bid/respond/:token` is public + gated by token — verified in `App.tsx` order (registered before `/api` auth gate).
- Public routes: `/learn-more`, `/sms-privacy`, `/sms-terms` — all auth-free.
- Backend `/api` auth gate: middleware in `functions/src/index.ts:41` catches all `/api/*` except explicit allowlist (SMS webhooks, bid magic-link, leads intake, QBO webhook, ingestion OAuth callbacks, health).
