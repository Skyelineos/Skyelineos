# Security Secrets Audit — Full Git History Scan

**Date:** 2026-06-16
**Scope:** Every commit on every branch of the Skyelineos repo from the initial commit (`2558ab3`, 2026-05-07) through `dc646a0` (2026-06-16).
**Tools:** TruffleHog (Python legacy, regex + entropy), `detect-secrets` (Yelp; entropy + plugin detectors), and a manual regex sweep across `git log --all -p` for the high-stakes prefixes (Stripe, Anthropic, OpenAI, GitHub PATs, Google API keys, Firebase CI tokens, SendGrid, Twilio, PEM private keys, JWT, generic `password=`).

> **Handling:** This report names every place a real credential might be living in plaintext in the repo. All snippets are redacted (first 4 + last 4 chars only). **Do not paste this report into shared chats, public Slack channels, or anywhere it could be screenshotted and shared.** Repository owner + ops only.

---

## Summary

- **Total commits scanned:** 255
- **Branches scanned:** all (HEAD: `dc646a0`)
- **Real exposures found that need same-week remediation:** **2 clusters**
  - Hardcoded production-shaped credentials in `scripts/seed-test-client.mjs` (3 accounts, shared password)
  - Hardcoded "quick login" credentials in `client/src/components/auth/LoginForm.tsx` + `client/src/pages/PortalLogin.tsx` (6+ named accounts)
- **Critical-tier exposures (live API keys, service account JSON, prod PEM):** **none found.**
- **High-tier exposures (real account credentials that might map to existing Firebase Auth users):** **2 (above).**
- **Low-tier exposures (public-by-design configs flagged by scanners):** several, listed for completeness.
- **No evidence** of any Stripe (live or test), Anthropic, OpenAI, generic OAuth secret with real grant scope, SendGrid, Twilio token, GitHub PAT, Firebase CI token (`1//`), or PEM private key in git history.

The "Anthropic key leaked via WhatsApp" noted in the May 28 audit doc is not in any commit; it must have been leaked out of band and never committed.

---

## Most urgent action item

**Today:** rotate or delete the Firebase Auth users for any email below that exists in your production user list. If `testgc@skyelineos.com` exists with password `Skye...024!`, anyone who can read this repo (or who could read it before it went private — see "Pre-private repo exposure window" below) can sign in with full GC privileges right now.

Suggested order:
1. Open Firebase Console → Authentication → Users.
2. Search for each email below.
3. For any that exist: either delete the account (preferred — they were dev seeds, not real users) or reset the password and remove the hardcoded reference in the same push.
4. After the user list is clean, push a code change removing the hardcoded passwords from `seed-test-client.mjs`, `LoginForm.tsx`, and `PortalLogin.tsx`. These shouldn't be in repo even if the matching Firebase Auth users don't exist anymore.

---

## High — fix this week

### H1. `scripts/seed-test-client.mjs` — hardcoded production-project test passwords

- **First introduced:** commit  `2558ab3` (Initial commit) — present in HEAD.
- **File:** `scripts/seed-test-client.mjs`
- **Lines (HEAD):** 66, 73, 80
- **What's there:** Three test users are created in whatever Firebase project `VITE_FIREBASE_PROJECT_ID` points at — and the production default for that env var is `skyelineos`. All three accounts share the same password.

| Email | Role | Password (redacted) |
|---|---|---|
| `testclient@skyelineos.com` | client | `Skye...024!` |
| `testdesigner@skyelineos.com` | designer | `Skye...024!` |
| `testgc@skyelineos.com` | gc | `Skye...024!` |

The `testgc@` account is the most consequential — GC role gets financial reads, sub mgmt, write access to most project paths.

- **Why High not Critical:** these only matter if the script was actually run against production Firebase. If you've never run `node scripts/seed-test-client.mjs` against the prod project, no user exists at those emails and the exposure is theoretical. Check the prod user list to confirm — if any of these emails are missing, you're clean.
- **Remediation:**
  1. Firebase Console → Authentication → Users → search each of the three emails → delete any that exist.
  2. Edit `seed-test-client.mjs` to read the password from `process.env.SEED_PASSWORD` instead of hardcoding, AND default to a randomly-generated value if unset. The whole point of E2E seed scripts is they should be ephemeral and the password should rotate per run.
  3. Add an explicit "this script will fail unless `VITE_FIREBASE_PROJECT_ID` is `skyelineos-staging` or similar" guard at the top to keep someone from accidentally seeding prod.

### H2. `client/src/components/auth/LoginForm.tsx` — hardcoded admin credentials with on-screen display

- **First introduced:** commit `2558ab3` (Initial commit) — present in HEAD.
- **File:** `client/src/components/auth/LoginForm.tsx`
- **Lines (HEAD):** 11, 12, 100, 101
- **What's there:** `useState('admin@skyeline.com')` and `useState('admin123')` pre-fill the form, and `<p>Email: admin@skyeline.com</p>` / `<p>Password: admin123</p>` are rendered on-screen as a "demo creds" hint.

Email: `admi...e.com` — Password: `admi...n123`

- **Mounted?** The exported `LoginForm` is defined in this file but I could not find a route or import that mounts it on origin/main — likely dead code that was superseded by `client/src/pages/SignIn.tsx`. **Still treat as exposed** because (a) any future re-mount instantly leaks the creds, (b) the file is readable by anyone with repo access.
- **Remediation:** delete the file outright (verify it's not the active sign-in component first via `git grep "LoginForm"` — only the file itself appears in the grep, so it really is unused). One-line removal in a separate commit.

### H3. `client/src/pages/PortalLogin.tsx` — six hardcoded "quickLogin" credentials

- **First introduced:** commit `2558ab3` (Initial commit) — present in HEAD.
- **File:** `client/src/pages/PortalLogin.tsx`
- **Lines (HEAD):** 196, 206, 216, 226, 236, 246
- **Mounted?** Yes — `/portal-login` is a registered route in `App.tsx` line 892. This page is reachable in production.
- **What's there:** Six rendered buttons that call `quickLogin(email, password)` to instantly sign the user in as a named test account:

| Email | Implied role | Password (redacted) |
|---|---|---|
| `admi...mes.com` (`admin@skylinehomes.com`) | admin | `Admi...s123` |
| `pm@s...mes.com` (`pm@skylinehomes.com`) | PM | `PMPa...s456` |
| `mjoh...l.com` (`mjohnson@email.com`) | client | `Clie...s123` |
| `info...l.com` (`info@eliteelectrical.com`) | sub | `SubP...s456` |
| `sara...s.com` (`sarah@austininteriors.com`) | designer | `Desi...s789` |
| `acco...mes.com` (`accountant@skylinehomes.com`) | accountant | `Acct...s789` |

If any of these accounts exist in production Firebase Auth with the matching password, that's six pre-authenticated roles available to anyone hitting `/portal-login` and clicking a button.

- **Remediation:**
  1. Firebase Console → Auth → search each of the six emails → delete or rotate. The `admin@` and `pm@` accounts are the worst-case if they exist.
  2. Strip the `quickLogin` buttons from `PortalLogin.tsx`. Replace with a single passwordless-sign-in CTA or just the standard email+password form.
  3. If you want a dev shortcut, gate the buttons behind `import.meta.env.DEV` so they never ship to production (same pattern that's already used to gate the test-mode bypass in `AuthContext.tsx`).

---

## Pre-private repo exposure window

The repo went private today (2026-06-16). Until that flip, this report's content was readable by any GitHub user who knew the repo URL. If H1/H2/H3 credentials map to real Firebase Auth users:

- **They have been publicly visible since 2026-05-07** (initial commit) — ~40 days of public exposure.
- Even though the repo is private now, **scrubbing git history won't undo that**. The credentials should be assumed compromised.
- This is why H1/H2/H3 need rotation + account deletion **regardless** of whether you also clean the repo.

`git filter-repo` to scrub the historical commits is **not worth doing for a private repo** — the fix is rotation, not erasure. Save it for cases where you can't rotate (e.g. an asymmetric private key whose public counterpart is already deployed). Passwords are cheap to rotate; spend the time there.

---

## Low — known-public values flagged by scanners

These are not exposures. Listing them so you can sanity-check that I'm not overlooking something, and so future scanners' alerts on these values can be acknowledged + ignored without re-investigation.

### L1. Firebase web API key

- `client/src/lib/firebase.ts` and `client/public/firebase-messaging-sw.js` contain `apiKey: 'AIza...0E0'`.
- This is the Firebase **web** API key — public by design. Firebase's documented model is that this key identifies your project to Google but the actual security boundary is Firestore rules + Storage rules + App Check. The May 28 audit doc and the current `docs/Security_Exposure_Assessment.md` both note this.
- **Action:** none required. After App Check is enforced (Stream 1 in your current Wave A), this becomes even less interesting.

### L2. VAPID push notification public key

- `client/src/lib/push-notifications.ts` line ~12 contains `const DEFAULT_VAPID = 'BGfs...8QRE';`.
- This is the **public** half of a Web Push VAPID keypair. The matching private key lives in Firebase Console — that one is the secret. Public VAPID keys are intended to ship in the browser bundle.
- **Action:** none required. Already documented in-file as "Public — safe to ship in the client bundle."

### L3. Firebase CLI public OAuth client_secret

- `scripts/verify-import-fix.mjs` line 37 contains `client_secret: 'j9iV...sAi'`.
- This is the embedded OAuth client credential that `firebase-tools` itself uses. It's published in the `firebase-tools` npm package and the firebase-tools GitHub repo. Google treats it as a public client identifier — the actual auth grant is gated by the user's `refresh_token` (which stays local to the developer's machine).
- **Action:** none required for security. Best practice is to read from `process.env` even for "public" values just so security scanners don't fire on every PR. Optional cleanup, low priority.

### L4. JWT tutorial token in deleted test code

- Historical commits referenced the well-known jwt.io tutorial token `eyJ0eXAi...w5c` in a now-deleted test file.
- Not a real credential. The token decodes to the canonical `{"sub":"1234567890","name":"John Doe","iat":1516239022}` payload from every JWT tutorial.
- **Action:** none required. The code has been deleted.

### L5. `postgres://username:password@host` placeholder URLs

- `.env.example` and `README.md` contain example Postgres connection strings with `postgres://username:password@hostname...` style placeholders.
- These are documentation, not credentials. No real host or password values.
- **Action:** none required.

### L6. Hex high-entropy strings in `client/src/data/selectionsTemplate.ts`

- 228 detect-secrets hits, all of them hex strings of 6-8 characters in a curated selections catalog.
- These are CSS color codes (`#3B82F6`-style) and short image-CDN identifiers. The catalog is the pre-built finishes library.
- **Action:** none required. Worth adding `# pragma: allowlist secret` annotations or a baseline file if you want to suppress these in future scans.

### L7. "Secret Keyword" hits in data and docs

- `data/odyssey-data.json` (13 hits), `docs/setup-runbook.md` (1), `functions/src/examples/security-testing.md` (4), `scripts/seed-test-client.mjs` (1), `scripts/verify-import-fix.mjs` (1), `.husky/pre-commit` (1), `README.md` (multiple).
- All are detect-secrets' "the word 'secret' or 'password' appeared near a string" heuristic. Manually verified each — they're either column labels in seed data, doc-page section headers, or comments in the pre-commit hook itself (which is literally a secrets-scanner).
- **Action:** none required.

---

## What I checked and did not find

For audit-trail completeness — these were searched for and returned zero hits across all branches and all commits:

- Stripe live secret keys (`sk_live_...`)
- Stripe test secret keys (`sk_test_...`)
- Stripe publishable keys (`pk_live_...` / `pk_test_...`)
- Stripe webhook secrets (`whsec_...`)
- Anthropic API keys (`sk-ant-...`) — including the WhatsApp-leaked key mentioned in the May 28 audit
- OpenAI API keys (`sk-` followed by 40+ chars, excluding the stripe prefixes)
- GitHub classic personal access tokens (`ghp_...`, `ghu_...`, etc.)
- GitHub fine-grained PATs (`github_pat_...`)
- Firebase CI tokens (`1//...`)
- SendGrid API keys (`SG.xxx.xxx`)
- Twilio Account SIDs (`AC<32 hex>`) with matching auth tokens
- PEM-format private keys (`-----BEGIN ... PRIVATE KEY-----`) — RSA, EC, OpenSSH, PGP
- Google service account JSON files (`"type": "service_account"`, `"private_key": "..."`)
- Real-looking JWT-format tokens (other than the jwt.io tutorial example)

If any of those appear in a future commit, the `.husky/pre-commit` hook will catch them locally and CI should fail the deploy. The pre-commit scanner pattern in `.husky/pre-commit` looks reasonable; recommend adding gitleaks to CI as a belt-and-suspenders.

---

## Remediation checklist

To close every High finding in this report:

- [ ] Firebase Console → Authentication → search and delete (or password-rotate):
  - `testclient@skyelineos.com`
  - `testdesigner@skyelineos.com`
  - `testgc@skyelineos.com`
  - `admin@skyeline.com`
  - `admin@skylinehomes.com`
  - `pm@skylinehomes.com`
  - `mjohnson@email.com`
  - `info@eliteelectrical.com`
  - `sarah@austininteriors.com`
  - `accountant@skylinehomes.com`
- [ ] Delete `client/src/components/auth/LoginForm.tsx` (confirmed unmounted).
- [ ] Strip the six `quickLogin` button blocks + `quickLogin` helper from `client/src/pages/PortalLogin.tsx` (or gate behind `import.meta.env.DEV`).
- [ ] Rewrite `scripts/seed-test-client.mjs` to read `SEED_PASSWORD` from env (no default) and refuse to run unless `VITE_FIREBASE_PROJECT_ID` matches a staging project name.
- [ ] Optional: add `gitleaks` to a GitHub Actions workflow so future commits get scanned in CI.

After the prod user list is cleaned, the remaining `*.tsx` / `*.mjs` changes can ship as one small standalone commit. Happy to prepare it once you confirm the prod users are gone.
