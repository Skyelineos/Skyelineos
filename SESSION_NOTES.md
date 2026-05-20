# Session Notes

Things a future Claude session should know before diving in. Specific file paths and line numbers throughout.

## Pre-existing TypeScript errors (out of scope)

`npm run check` (`tsc --noEmit`) reports **3 errors**, all in one file. They were present before Session 10 and were not introduced by the cleanup. Out of scope until someone deliberately addresses them.

- `client/src/components/timeline/ModernTimelineBuilder.tsx:815` — `error TS1005: ')' expected.`
- `client/src/components/timeline/ModernTimelineBuilder.tsx:816` — `error TS1109: Expression expected.`
- `client/src/components/timeline/ModernTimelineBuilder.tsx:1342` — `error TS1128: Declaration or statement expected.`

The errors look like a brace/paren mismatch around line 815, with the parser cascading the rest of the file as a single broken expression. The file imports cleanly (it's only used in a few timeline experiments) and `vite build` succeeds because esbuild is more permissive than `tsc`. **Production builds and ships fine** — but `npm run check` will always exit non-zero until these are fixed. Don't gate CI on `tsc` without addressing this first.

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
