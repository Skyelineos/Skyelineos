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

## How work ships (read this first)
**Source of truth is GitHub. Production is Firebase. These are two separate steps.**
1. **Push everything through GitHub.** All code changes are committed and pushed to the
   GitHub repo (`https://github.com/Skyelineos/Skyelineos.git`) — work on a branch and
   open a PR; nothing lives only on a local machine. GitHub is the canonical history.
2. **Go live through Firebase.** Merged code only reaches users when it is deployed to the
   `skyelineos` Firebase project (Hosting for the SPA, Cloud Functions for the backend,
   Firestore for rules/indexes). Pushing to GitHub does **not** by itself update the live
   site — a Firebase deploy does. Use the `npm run deploy*` commands below.
So the flow is: **edit → commit + push to GitHub → (review/merge) → `npm run deploy` to Firebase to go live.**

## Working across devices (GitHub is the sync layer — no iCloud)
Tyler works across a **Mac mini, MacBook Pro, iPad, iPhone, and occasionally a Windows desktop**. The standing direction: **keep everything in GitHub — it is the single cross-device source for all SkyelineOS files, and it covers every device including the desktop.** Do NOT use iCloud (or Dropbox/etc.) for project files.
- On any device, **`git pull origin main` before starting** so you're working from current; push through GitHub when done. The branch can drift dozens of commits behind between sessions — always sync first.
- **Never put the git working copy inside an iCloud/Dropbox-synced folder** — cloud sync corrupts `.git` and chokes on `node_modules`. The local clone lives in a plain local folder; GitHub does the syncing.
- Anything worth keeping belongs **in the repo** (code in its module; reference docs/notes under `docs/`). Don't leave necessary files only on one machine. One-off artifacts a session produces for Tyler are delivered to him directly rather than parked on a single device.

## Recent sessions
- **Session 12 (Ingestion Lab spike):** Built the admin-only AI ingestion pipeline at `/admin/ingestion-lab`. Gmail (label-filtered) + Google Drive (two hardcoded folders) + a generic upload endpoint (future iMessage / iCloud scripts) → Claude Sonnet 4.6 extraction via tool_use → three-lane review (Auto-Filed / Review Queue / Ask Queue). Entirely isolated under the `ingestion_lab/` Firestore namespace; production collections untouched. See `docs/ingestion-lab-schema.md` for the durable reference and `SESSION_NOTES.md` Session 12 entry for operator prerequisites + deliberate deferrals.
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
- `functions/src/ingestionLab/` — Ingestion Lab spike (Session 12). All routes fold into the shared `api` Express app: OAuth handlers (Gmail + Drive), per-source ingesters, the JSON upload endpoint, the brain pass, plus shared `adminAuth.ts` / `googleClient.ts` / `laneResolver.ts` / `prompts/extractionPrompt.ts` modules. See `docs/ingestion-lab-schema.md` for the namespace + route map.

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

**No admin approval for portal users.** Clients, subs, and designers self-create their portal and get in immediately — `pending_gc` (the "Access Pending Approval" wall in `ProtectedRoute.tsx`) applies **only** to internal team/employee sign-ups. First-time cold sign-ins resolve their role from a matching contact card in `AuthContext.tsx` (`derivePortalRole()`), so an invited sub arriving via a bid magic-link lands straight in the sub portal. See SESSION_NOTES Session 15.

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

## API keys & secrets (READ THIS before adding any integration)
- **Every external API key/secret lives in Google Secret Manager** (bound to the `api` Cloud Function via the `secrets:` array in `functions/src/index.ts`). Keys are **never** committed to the repo and **never** shipped to the browser.
- **Whenever a new API key/integration is created, add a catalog entry to the in-app API Storage page** (`client/src/pages/ApiStorage.tsx`, route `/api-storage`). That page is the human-facing index of every integration: what it is, what it does for the app, which features touch it, and the **Secret Manager variable name** to look up for rotation.
- **Store the variable NAME only — never the secret value.** The page intentionally shows no values; the value stays in Secret Manager.
- The API Storage page is **admin-only** (`RoleGuard allowedRoles={['admin']}`) and is gated behind **re-entering the account password** to view — treat it as the sensitive page it is.
- When you add/remove a secret in `functions/src/index.ts`, update `ApiStorage.tsx` in the same change so the two stay in sync.

## Conventions
- **Test before shipping.** Smoke-test the page in a headless browser before deploy — `tsc` + `vite build` miss runtime errors. Pattern: write a quick Playwright probe in `scripts/probe-*.mjs`.
- **No time-of-day assumptions** in user-facing copy or replies — sessions span time zones; don't say "good evening" or assume the user should sleep.
- **Cost-plus pricing model** on estimates: `Owner Price + Contractor Fee = Total Cost`. `Sell/unit` is an independent input the user controls.
- **Brand colors:** `#C9A96E` (gold accent), `#141414` (brand black for sidebars).
- **Bidding writes**: `bidRequests.invitedSubIds` should contain the recipient's contact ID + linkedUserId (if known) + email. The portal-side query resolves on any of the three.

## Ingestion Lab (Session 12 — admin-only spike)

Built and live at `/admin/ingestion-lab`. Pulls unstructured content from Gmail (label `Skyeline-Spike`), two hardcoded Drive folders (Giboney `1AR5kio4_DAmUFMMxW0xvuRxlMp_axuz6`, Christensen `1204VUtL4jOp28bksBcacQDaW_XnrLpaf`), and a generic JSON upload endpoint (for future iMessage / iCloud Mac scripts); runs each through Claude Sonnet 4.6 extraction via tool_use; routes results into Auto-Filed / Review Queue / Ask Queue lanes.

All state lives under the `ingestion_lab/` Firestore namespace — one wildcard rule (`match /ingestion_lab/{document=**}`) gates the whole tree on `isAdmin()` reads + Cloud-Function-only writes. The single carve-out: admins can update five whitelisted review fields on `processed_items` from the UI. Production collections are untouched.

**Route prefix:** all endpoints fold into the shared `api` Express app under `/api/ingestionLab/...`. New standalone Cloud Run services are blocked by org IAM, so do NOT add new `onRequest` exports for lab features — register routes onto the shared app, same pattern as the `register*` calls near the top of `functions/src/index.ts`.

**Operator prerequisites for first run:** Google Cloud OAuth client + redirect URIs, Gmail + Drive APIs enabled, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Secret Manager, OAuth consent screen configured, contacts cache populated via `scripts/refresh-ingestion-contacts-cache.mjs`. Full checklist in `SESSION_NOTES.md` Session 12 entry.

**Reference docs:**
- `docs/ingestion-lab-schema.md` — collections, routing rules, idempotency strategy, budget guard, prompt design
- `SESSION_NOTES.md` Session 12 — operator setup, deliberate deferrals, Session 13 work, KMS-deferred caveat for OAuth token storage

**Next major work (Session 13):** tune the extraction prompt against real Giboney / Christensen data, wire Ask-queue re-pass (answer → re-trigger brain pass with the answer in context), build the Mac-side iMessage and iCloud upload scripts. The Designer Portal lands AFTER Session 13, informed by what the spike reveals about how design content actually flows through email and Drive.
