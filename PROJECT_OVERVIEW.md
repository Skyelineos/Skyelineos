# Skyeline OS — Project Overview

## What this app is

Skyeline OS is a **single-tenant construction management app** built for Skyeline Homes, a custom home builder in Mapleton UT. It is the operating system for one GC business — lead intake → estimates → bid packages to subs → schedule/Gantt → site logs + photos → invoicing → portals for clients, subs, and designers. Production lives at **https://skyelineos.web.app** (Firebase project `skyelineos`).

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere (strict on client + functions) |
| Frontend | React 18.3 + Vite 5.4 · Wouter 3.3 routing · Tailwind 3.4 · Radix UI / shadcn |
| State / data | React local state + TanStack Query 5.60 + Firestore `onSnapshot` listeners |
| Auth | Firebase Auth (web SDK 12.13), role string in `users/{uid}.role` |
| Database | **Firestore** is the only source of truth |
| Hosting | Firebase Hosting (SPA at `dist/public/`) + Cloud Functions (Node 20 v2) |
| Backend | All in `functions/src/`. One big Express `api` function (org IAM blocks new callables, so routes get folded in) + a few onSnapshot/onSchedule triggers (notifications, contact-auth, warranty reminders) |
| AI | Anthropic Claude SDK for bill OCR (`functions/src/bills/`) |
| Third-party | SendGrid (email), Twilio (SMS), Firebase Cloud Messaging (web push), QuickBooks Online (OAuth wired, sync not built), Stripe (deps present, not active) |
| Tests | Playwright smoke scripts in `scripts/`. No unit-test runner in CI. `npm run check` runs `tsc`. |

## What's working

**GC surface (admin):** Dashboard with cash-flow / urgent-alert cards · Sales / CRM with kanban + vCard bulk import · Contacts directory · Projects + per-project tabs · **EstimateBuilder** (the central 1,945-line screen — JACK-parity rows, MAT/LAB split, per-line markup, sub picker, description popup, takeoff link, bid auto-link chips, sign-contract flow) · **Bid Packages** via `client/src/components/bidding/PortalBidsPanel.tsx` (canonical) with multi-trade send, templates, recipient detail + reminders + add-sub, award-with-line-picker + client-price decision · Schedule / Gantt · Site Logs / Photos / Documents / Tasks / Change Orders · Finance / Bills (Claude vision OCR) / Accounting · **Lumber Takeoff Studio** (PDF render + calibrate + measurements, smoke-tested) · Notifications fan-out (email/SMS/FCM with per-recipient prefs).

**Portals:** Subcontractor portal (bid requests, claim profile, compliance gate, bid submission, contracts, FCM opt-in) · Client portal (overview + photos + messaging) · Designer portal page **exists but is not routed in `App.tsx`**.

**Cross-cutting:** vCard import + contact claim flow (V1 + V2 email merge via Cloud Function) · Web push (FCM service worker + VAPID + dead-token pruning) · Role-aware redirects + RoleGuard + recipient-mismatch banner on email deep-links · Unified brand-black + gold sidebar across GC / Sub / Financials.

**Ingestion Lab (admin-only, Session 12):** `/admin/ingestion-lab` — pulls from Gmail (label-filtered), two hardcoded Drive folders (Giboney, Christensen), and a generic JSON upload endpoint (future iMessage / iCloud Mac scripts) → Claude Sonnet 4.6 extraction via tool_use → three-lane review (Auto-Filed / Review Queue / Ask Queue). All state isolated under `ingestion_lab/` Firestore namespace; production collections never touched. Daily $5 spend cap enforced server-side. See `docs/ingestion-lab-schema.md`.

## What's partially built or not built

- **Designer Portal** — page component exists at `client/src/pages/DesignerPortal.tsx`, but `/designer-portal` route is not wired in `client/src/App.tsx` (returns 404). Nicole has a real project in design phase; this lands AFTER the ingestion spike (see "Current direction").
- **Role taxonomy refactor** — 20 historical role strings + 4 parallel `UserRole` types + 5 disagreeing normalizers. Audit and 6-phase migration plan in `ROLE_AUDIT.md`. Not executed.
- **Compliance gate on bid submission** — client-side only; a sub can bypass via direct Firestore write. Needs server-side mirror (rule or Cloud Function).
- **Takeoff → multi-line spawn** — `onPushToEstimate` accepts an array but consumes only the first measurement; the rest are discarded.
- **QBO two-way sync** — OAuth wired, but invoices/bills/journal entries don't flow between Skyeline and QuickBooks yet.
- **Per-sub `additionalEmails`** — Cloud Function writes them on claim, but Contacts edit UI doesn't surface them.
- **FCM device management** — Tokens captured on opt-in, no "registered devices" / "revoke from this device" UI.
- **Reports tab, PDF document export, dependency network diagram, sub-portal document upload, client-portal design selection UI** — all show "coming soon" placeholders.
- **Critical-path engine** — `client/src/modules/gantt/engine/criticalPath.ts` is 7 lines (coloring only); actual CPM algorithm missing.
- **TooltipProvider disabled** in `components/ui/sidebar.tsx:24` and `components/projects/EditProjectForm.tsx:16` due to a React-hook error.
- **CI** — no test runner runs on push. Playwright scripts exist as ops/smoke tools, not as a regression suite.

## What's deliberately not in scope right now

- **Multi-tenancy** — Skyeline-only for at least 5 years. Don't add tenant scoping. Don't actively make it harder later either.
- **Stripe payments** — deps are present but no integration code; not on the near-term roadmap.
- **Designer Portal** — real and urgent in concept, but waits for the ingestion spike (see below).
- **EstimateBuilder refactor** — the 1,945-line file is the central screen; risky to slice up. Wait for a quiet session.
- **Dashboard performance fix** — `GCTodayFeed` may struggle once contact lists grow (queries without `.limit()`); logged but not this week's problem.
- **Test framework selection** — no Jest/Vitest setup; defer until the codebase stabilizes post-spike.

## Current direction

The Ingestion Lab spike is **codebase-complete** (Session 12). The next session (13) focuses on:
1. **Tuning the extraction prompt** against real Giboney + Christensen data once Tyler runs the first Gmail + Drive ingestion.
2. **Wiring Ask-queue re-pass** — when an admin answers a clarification question, the brain should automatically re-process that item with the answer in context.
3. **Building the Mac-side iMessage and iCloud upload scripts** that hit `POST /api/ingestionLab/upload`.

Designer Portal lands AFTER Session 13, informed by what the spike reveals about how design content actually flows through email and Drive.
