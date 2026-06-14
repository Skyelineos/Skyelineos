# Session Notes

Things a future Claude session should know before diving in. Specific file paths and line numbers throughout.

## Pre-existing TypeScript errors (out of scope)

`npm run check` (`tsc --noEmit`) reports **3 errors**, all in one file. They were present before Session 10 and were not introduced by the cleanup. Out of scope until someone deliberately addresses them.

- `client/src/components/timeline/ModernTimelineBuilder.tsx:815` — `error TS1005: ')' expected.`
- `client/src/components/timeline/ModernTimelineBuilder.tsx:816` — `error TS1109: Expression expected.`
- `client/src/components/timeline/ModernTimelineBuilder.tsx:1342` — `error TS1128: Declaration or statement expected.`

The errors look like a brace/paren mismatch around line 815, with the parser cascading the rest of the file as a single broken expression. The file imports cleanly (it's only used in a few timeline experiments) and `vite build` succeeds because esbuild is more permissive than `tsc`. **Production builds and ships fine** — but `npm run check` will always exit non-zero until these are fixed. Don't gate CI on `tsc` without addressing this first.

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
- **`tsconfig.json` does not include `functions/**/*`** — the Functions package has its own `functions/tsconfig.json` and its own `tsc` run during predeploy. Root `tsc` does not see the Functions code. Fine, but worth knowing — `npm run check` won't catch type errors in `functions/src/`.
- **212 prod dependencies**, including multiple Gantt libraries (`@daypilot/daypilot-lite-react`, `dhtmlx-gantt`, `frappe-gantt`, `@fullcalendar/*`) and multiple PDF libraries (`jspdf`, `pdf-lib`, `pdfjs-dist`, `@react-pdf/renderer`). At least one of each is unused. A dep audit would shrink the install.
- **`prepare: husky` script** is in `package.json` but no actual git hooks are configured. The dependency is installed without effect.

## Surprises

- The git history was sparse — only 3 commits before Session 10's pair landed. Tyler appears to commit in big "Session N" batches rather than per-feature. Adapt accordingly: if you finish meaningful work, commit it before the next checkpoint or it will pile up.
- Despite the breadth (~70 pages, ~250 components), the main bundle is only ~142 KB gzipped. The codebase is large but well code-split.
- The Firebase Web SDK config (`apiKey`, etc.) in `client/src/lib/firebase.ts` and `client/public/firebase-messaging-sw.js` is hardcoded. **This is by design** — Firebase web config keys are public; access is gated by Firestore rules. Don't try to "scrub" them.
- The VAPID public key in `client/src/lib/push-notifications.ts` is also hardcoded by design — required client-side for FCM web push registration.
