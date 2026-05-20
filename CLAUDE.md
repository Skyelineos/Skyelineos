# Skyeline OS — Claude Code Instructions

## What this is
Skyeline OS is a **single-tenant construction management app** built for Skyeline Homes (custom home builder in Mapleton UT). It is the operating system for one GC business — lead intake → estimates → bid packages to subs → schedule/Gantt → site logs + photos → invoicing → client/sub/designer portals.

**Backend:** Firebase only. All real backend logic lives in `functions/src/`. The legacy `server/` directory and the dead `BidsTab*` / `BidComparisonView*` / `BidItemDetail*` / `ManualBidForm` components were removed in Session 10 — they are gone, not "to be removed."

**Multi-tenancy:** Not built and not on the roadmap for the next ~5 years. Don't design for it. But also don't actively make it harder later (no hardcoded "Skyeline" strings where a variable would do, etc.).

## Start of every session
1. Read this file (CLAUDE.md)
2. Read **PROJECT_OVERVIEW.md** — current module inventory + tech stack
3. Read **SESSION_NOTES.md** — known oddities, pre-existing errors, anything a fresh session should beware of
4. Check `CHECKPOINT.md` only if it exists for a mid-session resume

## Recent sessions
- **Session 10 (cleanup):** Removed dead `server/` directory (102 files, ~37k lines) and 11 stale bid components (~8k lines). Total ~45k lines deleted. `PortalBidsPanel` confirmed as canonical bid system. CLAUDE.md corrected. Three pre-existing TypeScript errors in `ModernTimelineBuilder.tsx` (lines 815, 816, 1342) remain — out of scope for this session.
- **Session 10 (earlier work, same git snapshot):** Sidebar consistency pass (`Sidebar.tsx`, `SubcontractorSidebar.tsx`, `FinancialsSidebar.tsx` unified on brand-black + gold), shared `StatCard`, `progressUtils.ts` rewritten to read Firestore directly, role taxonomy audit + plan (`ROLE_AUDIT.md`), bidding module hardening, vCard import + claim flow, FCM web push, QBO OAuth scaffold, role-aware redirect + recipient-mismatch banner.

## Project
- **Working directory:** `~/Downloads/skyelineos-clean/`
- **Stack:** React 18 + Vite + TypeScript (client) · Firebase Cloud Functions (Node 20, Express) for backend logic · Firestore for data · Firebase Auth for users · Firebase Hosting for the static SPA.
- **Firebase project:** `skyelineos` (prod) — https://skyelineos.web.app
- **Remote:** https://github.com/Skyelineos/Skyelineos.git (branch tracks `origin/main`)
- **Deploy:**
  ```bash
  npm run deploy              # build + full deploy
  npm run deploy:hosting      # client SPA only
  npm run deploy:rules        # Firestore rules only
  npm run deploy:functions    # Cloud Functions only
  ```
- **Local dev:** `npm run dev` runs Vite. Pair it with `firebase emulators:start` if you need to exercise rules/functions locally; most iterative work just builds + deploys.
- **Build:** `npm run build` runs `vite build`, output at `dist/public/`. No more `esbuild server/index.ts` step — that targeted the deleted server.
- **Type-check:** `npm run check` runs `tsc --noEmit`.

## Backend layout
All Cloud Functions live in `functions/src/`:
- `functions/src/index.ts` — the Express `api` function (one big HTTP-callable Express app). New routes are added here because **org IAM policy blocks creating new standalone Cloud Run services**; fold into this Express app instead of adding new `onCall` exports.
- `functions/src/notifications/dispatch.ts` — fan-out for email (SendGrid) + SMS (Twilio) + Web Push (FCM) triggered by `notifications/{id}` Firestore writes.
- `functions/src/notifications/scheduledDueSweep.ts` — daily 7am MT due-date sweep.
- `functions/src/auth/ensureContactAuth.ts` + `contactAuthBackfill.ts` — auto-create Firebase Auth accounts for contacts with emails; backfill runs every 5 min until marker doc says done.
- `functions/src/bills/analyzeBill.ts` — Anthropic Claude vision OCR for bills (called via `/api/analyze-bill`).
- `functions/src/projects/warrantyReminders.ts` — auto-create 3/6/11/12-month reminders when a project gets a `moveInDate`.
- `functions/src/qbo/` — QuickBooks Online OAuth (routes folded into `api`).

## Bid system — single source of truth
The canonical bid module lives at **`client/src/components/bidding/`** (14 files, all live):
- `PortalBidsPanel.tsx` — **the GC-side bid screen.** Imported by `client/src/pages/ProjectBids.tsx` and lazy-loaded in `EstimateBuilder.tsx`. Reads Firestore directly; no API round-trips.
- `SendBidPackageModal.tsx` — multi-trade send w/ templates
- `AwardBidModal.tsx` — line picker + client-price decision
- `BidRequestDetailModal.tsx` — recipients, status, send reminder, add sub
- `ClaimContactDialog.tsx` — V1 claim + V2 replace/add email merge (Cloud Function backed)
- `SubBidRequestsTab.tsx` — sub-portal collectionGroup query w/ multi-ID resolution + auto-link
- `SubBidSubmissionForm.tsx` — sub-side submission with compliance gate
- `RecipientMismatchBanner.tsx` — email deep-link mismatch handler
- Plus: `BidExpandedView`, `BidItemCard`, `BidPackageTemplatePicker`, `RequestBidsModal`, `StartBidModal`, `types.ts`

If you find code calling `/api/bid-processes/*`, `/api/bid-responses/*`, or `/api/bid-invitations/*` — **those endpoints don't exist**. The components that referenced them were deleted in Session 10. Use Firestore directly.

## Roles (current — see ROLE_AUDIT.md for the refactor plan)
| Value | Display name | Access |
|-------|-------------|--------|
| `admin` | Administrator | Full access |
| `gc` | Skyeline Team | Full project access |
| `pending_gc` | Pending Approval | Blocked until admin approves → promotes to `gc` |
| `client` | Home Owner | Client portal |
| `sub` | Subcontractor | Sub portal |
| `designer` | Designer | Designer portal |

There are 20 historical role-string variants scattered across the codebase plus 4 separate `UserRole` types. The refactor to a clean 7-role taxonomy is planned but not executed. See `ROLE_AUDIT.md` for the full audit and 6-phase rollout. Don't touch role strings without reading that doc first.

## Architecture map
- `client/src/` — React frontend
- `client/src/pages/` — ~70 routes (Wouter)
- `client/src/components/` — domain folders: `auth/`, `bidding/`, `dashboard/`, `estimates/`, `layout/`, `notifications/`, `sales/`, `schedule/`, `takeoff/`, `ui/` (shadcn primitives), etc.
- `client/src/lib/` — utilities + per-domain libs (`estimates/`, `draws/`, `lumber/`, `contacts/`, `push-notifications.ts`, `firebase.ts`, `progressUtils.ts`)
- `client/src/auth/AuthContext.tsx` — Firebase auth + Firestore profile loading
- `client/src/components/auth/RoleGuard.tsx` + `client/src/utils/roleRedirects.ts` — route gating
- `functions/src/` — all real backend logic (see "Backend layout" above)
- `shared/` — TypeScript types shared between client and functions
- `firestore.rules` — single source of truth for access control
- `firestore.indexes.json` — composite indexes
- `scripts/` — Playwright smoke tests + ops scripts (send-test-bid-request, screenshot-*, etc.)

## Self-management rules
1. Every ~50,000 tokens, stop and run `/compact` automatically.
2. When context reaches 80% full, save `CHECKPOINT.md` with current status, then `/compact` before continuing.
3. Never let a source file exceed 25,000 tokens — split into modules.
4. After completing each major feature, update `CHECKPOINT.md`.
5. If responses slow or repeat, run `/compact` immediately.
6. End every session by updating `CHECKPOINT.md` (or removing it if work is fully committed).

## Conventions
- **Test before shipping.** Smoke-test the page in a headless browser before deploy — `tsc` + `vite build` miss runtime errors. Pattern: write a quick Playwright probe in `scripts/probe-*.mjs`.
- **No time-of-day assumptions** in user-facing copy or replies — sessions span time zones; don't say "good evening" or assume the user should sleep.
- **Cost-plus pricing model** on estimates: `Owner Price + Contractor Fee = Total Cost`. `Sell/unit` is an independent input the user controls.
- **Brand colors:** `#C9A96E` (gold accent), `#141414` (brand black for sidebars).
- **Bidding writes**: `bidRequests.invitedSubIds` should contain the recipient's contact ID + linkedUserId (if known) + email. The portal-side query resolves on any of the three.

## Next session — Ingestion Lab Spike

The next major work item is NOT the Designer Portal. It is an **ingestion lab spike** — building an AI-powered system that extracts structured data from unstructured sources (emails, Google Drive, iMessage) for two active Skyeline projects: Giboney (Randy and Leslie, 364 W 350 S Mapleton UT) and Christensen (Jordan and Jessica, 279 N Clegg Canyon Loop Mapleton UT).

The spike will:
- Build at `/admin/ingestion-lab`, admin-only, isolated from production data
- Write to a separate Firestore collection (`ingestion_lab`), never to live `projects` data
- Use Gmail OAuth (read-only, scoped to a "Skyeline-Spike" label)
- Use Google Drive OAuth (read-only, scoped to specific project folders)
- Use an iMessage export script (Mac chat.db read, filtered to specific contacts)
- Pass extracted content through an Anthropic Claude prompt that classifies, scopes to project, extracts structured payload, and assigns confidence
- Use a three-lane review model: Auto-file (high confidence + low stakes), Review queue (anything involving money/decisions/commitments/low confidence), Ask (genuinely ambiguous)

The Designer Portal comes AFTER the spike, informed by what the spike reveals about how design content flows through email and Drive.

Do not start the Designer Portal or any other major feature work before the ingestion spike is run.
