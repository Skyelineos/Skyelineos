# Security Exposure Assessment — Skyeline OS

**Date:** 2026-06-16
**Scope:** `origin/main` HEAD (not the stale workspace; everything below was verified against deployed production code).

This is an honest read on attack surface. Real concerns first. No fluff.

---

## Current exposure level: **Urgent**

The Firestore rules and Storage rules look thoughtful in isolation, but they are bypassed wholesale by a parallel attack surface: **~46 Cloud Function HTTP routes on the `api` Express app are exposed at `https://skyelineos.web.app/api/**` with NO auth check**, and the Admin SDK behind them ignores Firestore rules. Anonymous internet traffic can `DELETE /api/projects/:id` and cascade-delete every estimate, bid, and task on a project; list every contact and every project in the database; create projects/estimates/tasks/contacts; spend the company's OpenAI/Replicate budget via `/api/ai/render`; and forge Twilio STOP/HELP webhooks. Storage rules let any signed-in user read every project's documents, bids, bills, and Communication Center attachments — cross-tenant data leak by default. App Check is implemented in code but **never wired into the bootstrap**, so a stolen Firebase web config (which IS public) can hammer Firestore/Storage/Functions directly without origin gating. Admin "view as" writes as the impersonated user with no audit trail. Until the unauthed Express routes are gated, this product should not hold a real customer's data at scale.

---

## Top 5 fixes that close the most surface area for the least effort

1. **Apply `authMiddleware` to every legacy route in `functions/src/index.ts`** — one-line `app.use('/api', authMiddleware)` before the route block; closes ~46 unauthed endpoints including data deletion and AI cost burn. The helper already exists at the bottom of the file.
2. **Tighten Storage rules to per-project membership** — replicate the Firestore `clientOwnsProject` / `assignedUserIds` pattern in `storage.rules`. Closes the cross-tenant photo/document/bid/bill leak that the May 28 audit also flagged.
3. **Wire `initializeFirebaseAppCheck()` into the client boot** — the function exists in `client/src/lib/firebase-appcheck.ts` and is never called. One-line fix in `client/src/lib/firebase.ts` (or `main.tsx`); set `VITE_FIREBASE_APP_CHECK_KEY`.
4. **Verify Twilio webhook signatures** in `smsInboundRoute.ts` — `twilio.validateRequest` against the auth-token secret. Currently anyone can forge inbound SMS to flip any phone's opt-out ledger.
5. **Audit-log admin impersonation** — write an `auditLogs/{ts}_{adminUid}` entry on `enterAdminView`; stamp every Firestore write while `isAdminView===true` with `_impersonatedBy: adminUid`; show a non-dismissable banner.

These five close 80%+ of practical attack surface. Estimated cost: a focused day per item.

---

## Critical (must fix now)

### 1. Unauthenticated Cloud Function routes expose the whole database

- **What's vulnerable:** `functions/src/index.ts` lines 42–1297. ~46 of the 71 routes have no auth check and use the Admin SDK (bypasses Firestore rules). Examples:
  - `DELETE /api/projects/:id` (L231) — cascade-deletes estimates + bids + tasks
  - `POST /api/projects` (L811)
  - `DELETE /api/contacts/:id` (L645)
  - `DELETE /api/estimates/:id` (L888)
  - `GET /api/contacts` (L59) — full contact dump with PII
  - `GET /api/projects/:id` (L198)
  - `POST /api/projects/:projectId/selections/:selectionId/approve` (L1206) — arbitrary client-approval of any selection (price commitment)
- **How attackable:** `curl -X DELETE https://skyelineos.web.app/api/projects/<id>` from anywhere on the internet. No token required. Cascade-delete batch runs at L264–285.
- **Blast radius:** Full database read of contacts/projects/estimates/bids/tasks; destruction of any project + financial history; insertion of fake projects/selections/tasks; arbitrary client approval of any selection.
- **Remediation:** Add `app.use('/api', authMiddleware)` once before the route block, OR `authMiddleware` to every individual route + role check inside. The helper already exists at L1338.

### 2. `/api/ai/render` is an open-wallet endpoint

- **What's vulnerable:** `functions/src/index.ts` L1297. Anonymous POST triggers `dall-e-3` (`size: 1792x1024, quality: hd`, ~$0.12/image) or Replicate Flux 1.1 Pro.
- **How attackable:** Scripted loop posting JSON bodies. No rate limit, no budget cap.
- **Blast radius:** Direct OpenAI/Replicate bill burn until the secret runs out of quota.
- **Remediation:** `app.post('/api/ai/render', authMiddleware, ...)` + per-user/day quota in Firestore.

### 3. Storage rules grant any signed-in user read+write to every project's bytes

- **What's vulnerable:** `storage.rules` lines 7–80. `/projects/{projectId}/**`, `/bids/**`, `/site-logs/**`, `/bills/**`, `/content/**`, `/communications/**`, `/subTakeoffs/**` all gate on `request.auth != null` only.
- **How attackable:** Any client of customer A authenticates to their own portal, then `getDownloadURL('projects/<customer-B-projectId>/photos/floorplan.pdf')` — Firestore rules block listing the doc metadata, but the storage path is guessable / leaks via shared links.
- **Blast radius:** Cross-customer leak of plans, contracts, COIs, vendor bids (pricing!), and DM attachments. The May audit flagged exactly this and it's still here.
- **Remediation:** Replicate Firestore membership predicates in Storage rules. Read `firestore.get(/projects/$(projectId)).data.assignedUserIds` and gate on `request.auth.uid in assignedUserIds || clientOwnsProject(...)`.

### 4. Admin "View As" writes are indistinguishable from the real user's

- **What's vulnerable:** `client/src/contexts/AdminViewContext.tsx` — `isReadOnly = false`, no logging on `enterAdminView`, no actor field stamped on writes during impersonation.
- **How attackable:** Compromised or malicious admin views as a sub, submits/edits a bid, exits view. Audit trail says the sub did it.
- **Blast radius:** Repudiation. Bid tampering attributed to the wrong party. No forensic recovery path.
- **Remediation:** Write `auditLogs/{ts}_{adminUid}` on enter/exit. In Firestore client wrappers, append `_impersonatedBy: adminUid` to any `set/update` while `isAdminView===true`. Show a non-dismissable banner.

---

## High

### 5. App Check is dead code in production

- **What's vulnerable:** `client/src/lib/firebase-appcheck.ts` defines `initializeFirebaseAppCheck()` but `git grep` finds no callers anywhere in `client/`. The Firebase web `apiKey` (public by design) gives any attacker a working SDK handle.
- **How attackable:** Take the apiKey from any deployed bundle, run the Firebase JS SDK from a script, hit Firestore/Storage/Functions at rule-allowed rates from a botnet origin.
- **Blast radius:** No origin gating on backend services; abusive read/write from any IP at scale.
- **Remediation:** Call `initializeFirebaseAppCheck()` after `initializeApp` in `client/src/lib/firebase.ts`. Enforce in Firebase console for Firestore + Storage + Functions. Set `VITE_FIREBASE_APP_CHECK_KEY`.

### 6. Twilio inbound webhook has no signature verification

- **What's vulnerable:** `functions/src/notifications/smsInboundRoute.ts` L42–60. Trusts `req.body.From` and `req.body.Body` from any caller.
- **How attackable:** `curl -X POST https://skyelineos.web.app/api/sms/inbound -d "From=+1<victim>&Body=STOP"` — adds victim to `sms_opt_outs/`, silencing all future Skyeline SMS to them.
- **Blast radius:** Targeted denial-of-notification on any phone in the customer base. Ability to spam HELP/START replies billed to Skyeline's Twilio account.
- **Remediation:** Verify `x-twilio-signature` against the request URL+body using the auth-token secret (`twilio.validateRequest`). Reject on mismatch.

### 7. QBO OAuth `/start` is unauthenticated with weak state nonce

- **What's vulnerable:** `functions/src/qbo/oauth.ts` L41–58. `Math.random().toString(36)` for state. No auth gate on `/start`.
- **How attackable:** Anyone can mint `qboOAuthStates` entries (rate-limit-free Firestore writes); state is weak entropy. Lack of auth lets an attacker prep a malicious state and dangle the link.
- **Blast radius:** OAuth state injection / CSRF on the QBO connection; downstream connection-hijack risk.
- **Remediation:** Gate `/start` behind admin role. Use `crypto.randomBytes(32).toString('base64url')` for state.

### 8. `pending_team` users are stranded with auth privileges

- **What's vulnerable:** `functions/src/auth/ensureContactAuth.ts` writes `role: 'pending_team'` for `team`/`employee` contact roles; no UI / Firestore rule branch recognizes it (per `ROLE_AUDIT.md` lines 26, 328).
- **How attackable:** Normalizers fall these users back to `client` in some paths and lock them out in others — inconsistent. Any such uid can read every doc the `client` role can read on whichever project their email matches via `linkedContactId`.
- **Blast radius:** Latent privilege confusion + the stranded users can never be deleted by the UI flow.
- **Remediation:** Execute the `ROLE_AUDIT.md` migration: collapse `pending_gc` + `pending_team` → `pending`, fail-closed. Backfill existing users.

---

## Medium

### 9. No rate limiting anywhere

- **What's vulnerable:** All of `functions/src/index.ts`. `express-rate-limit` is in `package.json` but `git grep` finds zero call sites.
- **Blast radius:** Brute-forcing bid tokens (144-bit, impractical but free to try); cost-amp via `/api/ai/render`, `/api/analyze-bill`, `/api/content/analyze-media` (each Anthropic call).
- **Remediation:** Apply `rateLimit({ windowMs: 60_000, max: 30 })` per IP on `/api/**`, with tighter caps on AI routes.

### 10. `tester@gmail.com` Firebase Auth user still dangling

- **What's vulnerable:** Documented in `CHECKPOINT.md` L340, `docs/setup-runbook.md` L678 as outstanding.
- **Blast radius:** Unknown password strength. If `tester@gmail.com` has admin role anywhere → full takeover.
- **Remediation:** Delete via Firebase Console (operational; not a code change).

### 11. Notifications collection allows write-any-uid

- **What's vulnerable:** `firestore.rules` L827 — `notifications/{id}` create is `allow create: if isSignedIn()`. Caller picks `userId`.
- **How attackable:** Any signed-in user spams notifications into another user's feed, including phishing-style "GC requests payment" messages.
- **Remediation:** `request.resource.data.userId == request.auth.uid` OR restrict create to staff.

### 12. `reminders` create is not author-scoped

- **What's vulnerable:** `firestore.rules` L743 — `allow create: if isSignedIn();` without checking `ownerUid == request.auth.uid`.
- **Remediation:** Add `&& request.resource.data.ownerUid == request.auth.uid`.

### 13. Style/giveaway/sales-pitch storage globally readable + signed-in writable

- **What's vulnerable:** `storage.rules` paths `styleQuiz/`, `styleLibrary/`, `salesPitch/`, `branding/`, `public/` — `read: if true; write: if request.auth != null`. Any signed-in client can overwrite the company's sales-pitch video.
- **Remediation:** Restrict writes via custom claim or role check.

### 14. `clients` collection readable by every signed-in user

- **What's vulnerable:** `firestore.rules` L172 — `allow read: if isGC() || isSignedIn()` (comment: "for address matching on registration"). Subs / homeowners / designers read every CRM lead's contact info.
- **Remediation:** Replace with a Cloud Function that does the address-match lookup server-side and returns boolean only.

---

## Low

### 15. No Zod/Joi validation on Cloud Function bodies

- **What's vulnerable:** Bodies parsed as `req.body` with manual `String(x).trim()` in best cases.
- **Blast radius:** Logic bugs; Firestore poisoning by writing unexpected field types.
- **Remediation:** Add Zod schemas to write routes.

### 16. Sentry mentioned but not implemented

- **What's vulnerable:** `client/src/components/ErrorBoundary.tsx` L41: "Sentry error reporting would go here" comment.
- **Blast radius:** No production error visibility. Failed auths and abuse attempts go unobserved.
- **Remediation:** Initialize `@sentry/react` and `@sentry/node`; log failed `verifyIdToken` events.

### 17. CORS is fully open

- **What's vulnerable:** `functions/src/index.ts` L19 — `app.use(cors({ origin: true }))` reflects any origin.
- **Blast radius:** Combined with the unauthed routes above, lets any malicious site call from a victim's browser. Once routes are gated by auth, CORS-open is acceptable since auth is the real gate.
- **Remediation:** Restrict to `['https://skyelineos.web.app', 'http://localhost:5173']` after auth is in place.

### 18. `portalInvites` are world-readable

- **What's vulnerable:** `firestore.rules` L789 — `allow read: if true`. Per comment, intentional (token = capability).
- **Blast radius:** Sequential id enumeration leaks invitee emails + token strings → claim invites pre-signup.
- **Remediation:** Make ids unguessable (likely already random); leave collection-read closed (implicit) so only `getDoc(id)` works. Lower priority — by design.

---

## Observed positives (worth keeping)

- **Firestore rules are mostly tight.** Financial collections gated on `isGCOnly()`. `clientOwnsProject()` membership checks for client reads. Project subcollections (`draws`, `budgetItems`, `selections`) properly scoped. `qboConnections`/`sms_opt_outs`/`notificationJobs`/`bidInviteTokens` explicitly blocked from client writes.
- **`AuthContext.tsx` test-mode bypass is properly gated** behind `import.meta.env.DEV` (L100–125). The May audit finding is fixed.
- **Bid invite tokens.** 144-bit (`crypto.randomBytes(18).toString('base64url')`), 14-day expiry, O(1) `bidInviteTokens/{token}` lookup with status update.
- **Compliance gate** (`awardBidRoute.ts` L97) is server-enforced: W-9, COI, agreement, license required before award lands.
- **Most isolated `functions/src/<module>/*Route.ts` files DO use Bearer-token + role check** (contracts, bids, leads, post-signup link, payment link, qa). The vulnerability is concentrated in `index.ts`'s legacy block.
- **`.env.example`** is well-commented about what's safe to ship to the bundle. `.gitignore` covers `.env*`.
- **No literal `sk-ant-...` Anthropic key** in git history — the May 28 WhatsApp leak appears rotated and was never committed.
- **Secrets correctly use `defineSecret`** (Secret Manager), not env files.

---

## Items I could not verify

- **Firebase App Check enforcement.** It's a console toggle, not in code — the client never calls `initializeFirebaseAppCheck`, so even if enforcement were on, the production app would fail. Assume both are off.
- **Whether the `tester@gmail.com` Firebase Auth user still exists** and what role it has — has to be checked in Firebase Console.
- **Whether `pending_team` users actually exist in production** — has to be queried in the `users` collection.
- **`npm audit` for known CVEs** in the deployed `firebase-functions ^6.4.0` / `firebase-admin ^13.5.0` / `express ^4.21.2` versions — needs `npm install` outside the read-only audit.
- **Anthropic / SendGrid / Twilio / OpenAI budget alerts** — these are Cloud Billing console settings, not in code.
- **Whether the QBO `/start` endpoint is reachable from the outside internet** vs blocked at the Firebase Hosting layer — the rewrite at `firebase.json` says it's mapped to `api`, so reachable. Confirm via curl.
