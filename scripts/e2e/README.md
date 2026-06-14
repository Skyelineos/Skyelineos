# E2E Test Harness

A self-cleaning end-to-end harness that drives the **live app** (deployed `/api`
Cloud Functions + Firestore + the real UI) to verify functionality fast. It
**auto-creates** throwaway test data, runs assertions, and **auto-deletes**
everything afterward — even if a test fails.

## Why it's safe to point at production

- Every doc the harness creates directly is tagged `{ __e2e: true, __e2eRun }`.
- Cloud-Function-created docs (e.g. `projectTasks` from "generate") are scoped to
  a throwaway test project and removed by `projectId`.
- Teardown runs in a `finally` block and only deletes what the harness
  registered or what carries the `__e2e` tag — never an unscoped delete.
- `cleanup.mjs` is a safety net that sweeps any leftovers from a killed run.

## Setup (one time)

1. Create a **dedicated test admin** account in Firebase Auth (role `admin` in
   the `users` collection). Don't use your personal login.
2. Put these in `.env.local` at the repo root (gitignored):

   ```
   # Public Firebase web config (Console → Project Settings → Web app)
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=skyelineos.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=skyelineos
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...

   # Dedicated test admin account
   E2E_ADMIN_EMAIL=e2e-admin@skyelineos.com
   E2E_ADMIN_PASSWORD=...

   # Optional
   # E2E_BASE_URL=https://skyelineos.web.app
   # E2E_API_BASE=https://skyelineos.web.app/api
   # E2E_CONFIRM=1   # skip the interactive confirmation
   ```

3. If **App Check is enforced** on the project, register a debug token (Console →
   App Check) and add `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN=...`, or the headless
   UI/API calls may be rejected.

## Run

```bash
npm run test:e2e            # data suites (Task Library lifecycle), then teardown
npm run test:e2e:all       # data + Playwright UI suite
npm run test:e2e:ui        # only the UI suite
npm run test:e2e -- --keep # don't auto-delete (debugging); then clean up below
npm run test:e2e -- --yes  # skip the confirmation prompt
npm run test:e2e:cleanup            # dry-run: show leftover __e2e data
npm run test:e2e:cleanup -- --apply # delete leftovers
npm run test:tour          # broad every-route page-load smoke (existing tool)
```

Exit code is non-zero if any test fails (CI-friendly).

## What's covered today

`suites/taskLibrary.suite.mjs` — the Master Task Library & Project Task system,
end to end: seed → generate → provenance (`masterTaskId`/`masterVersionUsed`) →
skip-requires-reason → quality-gate completion guard → custom task →
**master-edit independence** → closeout analysis → **archived tasks not copied**.

`suites/uiSmoke.suite.mjs` — signs in via the UI, opens the Master Task Library
(+ Projects, Dashboard), asserts no console/page errors, exercises the Add Task
modal, and saves screenshots to `scripts/e2e/screenshots/`.

## Extending it

Add a new file under `suites/` exporting `async function run(h)` and wire it into
`run.mjs`. Use the harness API:

- `h.api(path, method, body)` → `{ status, ok, data }` (auth token attached)
- `h.createDoc(collection, data)` → tagged + auto-deleted on teardown
- `h.trackProjectScope(projectId)` → sweeps that project's tasks/improvements
- `h.trackDocPath(collection, id)` → delete an externally-created doc on teardown
- `h.test(name, fn)`, `h.assert(cond, msg)`, `h.assertEq(a, b, msg)`

Keep the golden rule: **only ever create namespaced/scoped data**, and register
everything so teardown can remove it.
