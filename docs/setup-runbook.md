# Skyeline OS — Setup & Connection Runbook

**Status:** Authoritative inventory of every external service, API key, and credential the app uses.
**Drafted:** 2026-05-22 against `main` @ `28f9cd0`.

Sit down with this doc for one session and provision everything end-to-end. Each section tells you exactly what to click, what to copy where, and how to verify it worked. The doc ends with a master checklist.

**Two locations for credentials:**
- **Google Cloud Secret Manager** — for Cloud Functions runtime secrets (anything `process.env.X` in `functions/src/`). Bind via `firebase functions:secrets:set NAME` from the repo root.
- **Local `.env` file** (NOT committed) — for `VITE_*` vars consumed by Vite at frontend build time. These get baked into the JS bundle, so anything in here is effectively public; never put real secrets here. Acceptable: Firebase web config (already public), Stripe publishable key, Sentry DSN. Not acceptable: API tokens that have write privileges.

**Firebase project:** `skyelineos` (already provisioned, Blaze plan).
**Live URL:** `https://skyelineos.web.app`
**Repo:** `https://github.com/Skyelineos/Skyelineos.git`

---

## A. Firebase project (the foundation)

### What it is
Hosts the SPA (`firebase deploy --only hosting`), Cloud Functions (`functions:`), Firestore (database + rules + indexes), Storage (file buckets + rules), Auth (sign-in), Cloud Messaging (web push).

### Current status
✅ **Provisioned and live.** Project `skyelineos`, Blaze plan since 2026-05-06. SPA at `https://skyelineos.web.app`.

### What you should verify

```bash
firebase projects:list
# Should show "skyelineos" with role: Owner
```

If you've never set up the CLI on this machine:

```bash
npm install -g firebase-tools
firebase login
# Browser opens; sign in as tyler@skyelinehomes.com
firebase use skyelineos
```

### What to do if you need to recreate
**Don't.** This project hosts production data. If you ever need a staging instance, create a SEPARATE project (e.g. `skyelineos-staging`) and add it to `.firebaserc` as an alias — never rebuild the prod one.

### Where the Firebase Web SDK config lives
Hardcoded in `client/src/lib/firebase.ts` AND `client/public/firebase-messaging-sw.js`. **This is by design** — Firebase web config keys are public; access is gated by Firestore rules. Don't try to scrub them. Per `SESSION_NOTES.md` §"Surprises".

---

## B. Firebase Auth — sign-in providers

### What it is
Email/password sign-in. May also have Google sign-in (the codebase imports Google sign-in providers in places).

### Current status
✅ **Email/password enabled.** Verify Google enabled if you want it.

### Verify

1. Console → https://console.firebase.google.com/project/skyelineos/authentication/providers
2. Email/Password should show as Enabled.
3. (Optional) Google should show as Enabled if you want one-click sign-in for Skyeline team members.

### Action if you want Google sign-in
1. Same screen → click Google → Enable → set support email to `tyler@skyelinehomes.com` → Save.
2. No secrets needed for Google sign-in via Firebase Auth — Firebase manages the OAuth client behind the scenes.

---

## C. Firebase App Check (optional but recommended for production)

### What it is
reCAPTCHA v3 attestation that requests are coming from your actual web app, not a script. Stops abuse of the Cloud Function endpoints.

### Secret name(s)
- `VITE_FIREBASE_APP_CHECK_KEY` — public site key (goes in `.env`, baked into bundle)
- `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN` — local dev only

### Current status
🟡 **Code-ready, not configured.** `client/src/lib/firebase-appcheck.ts` will activate App Check if `VITE_FIREBASE_APP_CHECK_KEY` is set AND `import.meta.env.PROD === true`.

### How to provision

1. Visit https://www.google.com/recaptcha/admin/create
2. Sign in as the Google account that owns the `skyelineos` Firebase project.
3. Label: `Skyeline OS Web`. reCAPTCHA type: **reCAPTCHA v3.** Domains: `skyelineos.web.app`. Accept terms → Submit.
4. Copy the **Site Key** (public).
5. Console → https://console.firebase.google.com/project/skyelineos/appcheck → Apps → Web app (Skyelineos) → click **reCAPTCHA v3** → paste the Site Key → Save.
6. Set on the secret API key field in the same flow (Firebase provides this).
7. Add to local `.env`:
   ```
   VITE_FIREBASE_APP_CHECK_KEY="6Lc...your-site-key..."
   ```
8. Redeploy hosting: `npm run deploy:hosting`.

### Verify
- Visit `https://skyelineos.web.app`, open DevTools Network tab, look for an `appCheck:exchangeRecaptchaToken` request returning 200 on first load.

### Why it matters
Without App Check, any script that knows your Firebase config (which is public!) can hit your Cloud Functions and database. App Check rate-limits abuse and stops most automated attacks. **Highly recommended for production.**

---

## D. Anthropic (Claude) — the AI brain

### What it is
Powers (a) bill OCR (`functions/src/bills/analyzeBill.ts`), (b) Ingestion Lab extraction (`functions/src/ingestionLab/brainPass.ts`). Both use Claude Sonnet 4.6 via the official SDK.

### Secret name
`ANTHROPIC_API_KEY`

### Current status
🟡 **Set in Secret Manager, but should be rotated.** Per the historical CHECKPOINT pending list, the existing key was sent over WhatsApp once. Defense-in-depth says rotate now.

### How to rotate

1. https://console.anthropic.com/settings/keys → sign in as the Anthropic admin for Skyeline.
2. Find the existing key labelled (likely) "Skyeline OS Production" or similar.
3. Create a new key first (so you can swap atomically): **Create Key** → label `Skyeline OS Production 2026-05` → copy the `sk-ant-...` value.
4. From the repo root:
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY --project skyelineos
   # Paste the new sk-ant-... value at the prompt
   ```
5. Deploy functions to pick up the new value:
   ```bash
   npm run deploy:functions
   ```
6. Verify a bill OCR or Ingestion Lab brain pass works on the live site.
7. Go back to https://console.anthropic.com/settings/keys → delete the OLD key.

### Cost monitoring
- Anthropic console → Usage. Watch monthly spend.
- Ingestion Lab has a `$5/day` cap built into `brainPass.ts:24` (server-side abort). Bill OCR has NO cap.
- **Set a billing alert in the Anthropic dashboard at $25/month** to start; revisit once Ingestion Lab tuning is done.

---

## E. SendGrid — transactional email

### What it is
All outbound email — bid requests, notification dispatch, password resets that route through Cloud Functions (Firebase Auth's own emails come from Firebase, not SendGrid).

### Secret names
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL` — e.g. `notifications@skyelinehomes.com`

### Current status
🔴 **NOT verified set.** Code reads these via `process.env`; the standalone `dispatchNotification` function binds them. The api function only gained them in this session's edit. Verify via `firebase functions:secrets:list`.

### How to provision

1. https://signup.sendgrid.com — sign up if not already, using `tyler@skyelinehomes.com`.
2. **Verify your sending domain.** Settings → Sender Authentication → Domain Authentication → add `skyelinehomes.com` → SendGrid gives you 3 DNS CNAME records → add them to your DNS provider (Cloudflare / Namecheap / wherever skyelinehomes.com is hosted) → wait 5-30 min → click Verify. **Without this, email goes to spam.**
3. Settings → API Keys → Create API Key → name `Skyeline OS Cloud Functions` → permissions: **Mail Send only** (don't grant Full Access) → Create → copy the `SG.xxx...` value (shown once).
4. Bind to Functions:
   ```bash
   firebase functions:secrets:set SENDGRID_API_KEY --project skyelineos
   # Paste SG.xxx...

   firebase functions:secrets:set SENDGRID_FROM_EMAIL --project skyelineos
   # Type: notifications@skyelinehomes.com
   ```
5. Deploy:
   ```bash
   npm run deploy:functions
   ```

### Verify

```bash
node scripts/send-test-bid-request.mjs --to your-personal-email@example.com
# Check the inbox; check spam if not visible.
```

### Cost monitoring
- SendGrid free tier: 100 emails/day forever. Very generous.
- Settings → Billing → set email alert at 80% of plan limit.

---

## F. Twilio — SMS

### What it is
Outbound SMS for high-urgency notifications (overdue selection reminders, on-call alerts). Per `dispatch.ts`, SMS is OPT-IN per user (`notificationPrefs.sms = true`).

### Secret names
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER` — e.g. `+18015551234`

### Current status
🔴 **NOT verified set.** Same as SendGrid — the api function gained these in this session; standalone `dispatchNotification` already had them. Verify via `firebase functions:secrets:list`.

### How to provision

1. https://www.twilio.com/try-twilio → sign up using `tyler@skyelinehomes.com`. Twilio gives ~$15 trial credit.
2. **Buy a phone number.** Console → Phone Numbers → Manage → Buy a number → pick a US number with SMS enabled (≈$1.15/mo). Set the area code to a Utah area code (385 / 801) if Tyler wants the SMS to look local.
3. Console → top-right account info → copy:
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (click eye icon to reveal)
4. Bind to Functions:
   ```bash
   firebase functions:secrets:set TWILIO_ACCOUNT_SID --project skyelineos
   firebase functions:secrets:set TWILIO_AUTH_TOKEN --project skyelineos
   firebase functions:secrets:set TWILIO_FROM_NUMBER --project skyelineos
   # paste +18015551234 (your purchased number, E.164 format with country code)
   ```
5. Deploy:
   ```bash
   npm run deploy:functions
   ```

### Verify
Send a test notification from the UI (any action that fires `notifications/` write — e.g., assign a task to a user with SMS opted in). Watch Twilio console → Monitor → Logs → Messaging for the outbound. Or use the Twilio CLI / test message tool with the credentials.

### Cost monitoring
- Twilio: pay-per-message (~$0.0079 per US SMS). Set a **monthly spend cap** in Settings → General → Spending Limit at $25/month to start.
- Watch for "trial account" stamps in messages — once you upgrade out of trial, those go away.

### One thing to NOT do
Don't put the `TWILIO_FROM_NUMBER` directly in source code or .env. Always Secret Manager. Same for the Auth Token (which is effectively a password).

---

## G. Google OAuth client (for Ingestion Lab — Gmail + Drive)

### What it is
Lets the Ingestion Lab pull labeled Gmail threads and files from two hardcoded Drive folders (Giboney + Christensen). Same OAuth client is used for both APIs.

### Secret names
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Current status
🔴 **NOT set. THIS IS THE BLOCKER** for `api` function redeploy. The function's secrets array lists these, so Firebase deploy refuses to deploy until both are set.

### How to provision (in order, all in https://console.cloud.google.com/?project=skyelineos)

#### Step 1 — Enable the APIs
1. APIs & Services → Library → search "Gmail API" → Enable.
2. Same screen → search "Google Drive API" → Enable.
3. Same screen → search "Google People API" → Enable. (Used for `openidconnect.userinfo` to resolve the connected account email.)

#### Step 2 — OAuth consent screen
1. APIs & Services → OAuth consent screen.
2. User Type: **External** → Create.
3. App name: `Skyeline OS`. User support email: `tyler@skyelinehomes.com`. Developer contact: same. Save and Continue.
4. Scopes screen → Add or Remove Scopes → search and add:
   - `https://www.googleapis.com/auth/gmail.readonly` (read messages)
   - `https://www.googleapis.com/auth/gmail.modify` (apply labels — only needed if the lab will label processed threads; if not, drop)
   - `https://www.googleapis.com/auth/drive.readonly` (read Drive files)
   - `openid`, `email`, `profile` (userinfo)
   Save and Continue.
5. Test users → add `tyler@skyelinehomes.com` and any other admin email that should connect. Save and Continue.
6. (Optional, for production) → Submit for verification. For an internal-only Skyeline lab, **stay in Testing mode** — your test users can connect indefinitely; you just have to click through the "Google hasn't verified this app" warning the first time per account.

#### Step 3 — Create the OAuth client
1. APIs & Services → Credentials → Create Credentials → OAuth client ID.
2. Application type: **Web application.**
3. Name: `Skyeline OS Ingestion Lab`.
4. Authorized redirect URIs (add both):
   - `https://skyelineos.web.app/api/ingestionLab/oauth/gmail/callback`
   - `https://skyelineos.web.app/api/ingestionLab/oauth/drive/callback`
5. Create → modal shows Client ID + Client Secret → copy both.

#### Step 4 — Bind to Cloud Functions
```bash
firebase functions:secrets:set GOOGLE_CLIENT_ID --project skyelineos
# Paste the Client ID (ends with .apps.googleusercontent.com)

firebase functions:secrets:set GOOGLE_CLIENT_SECRET --project skyelineos
# Paste the Client Secret (starts with GOCSPX-)
```

#### Step 5 — Deploy
```bash
npm run deploy:functions
```

This should NOW succeed (the prior block is cleared). The `api` function comes online with both SendGrid+Twilio (from §E, §F) AND Google OAuth secrets bound.

### Step 6 — First connect

1. Sign into `https://skyelineos.web.app` as admin.
2. Navigate to `/admin/ingestion-lab`.
3. Connectors tab → Connect Gmail → opens Google consent → grant scopes → redirected back. Repeat for Drive.
4. Then per `SESSION_NOTES.md` §"Operator prerequisites for first run":
   - Apply the Gmail label `Skyeline-Spike` to threads you want ingested.
   - Run `node scripts/refresh-ingestion-contacts-cache.mjs --list-projects` to find the Giboney + Christensen project doc IDs, then re-run without the flag (with the IDs in env vars).
5. Hit Run Ingestion. Hit Run Brain Pass. Watch processed_items appear.

### What if you want one OAuth client per scope?
Don't. Same client works for both Gmail and Drive — Google scope-gates per session, not per client. Keeps secrets count low.

### Also — `VITE_GOOGLE_CLIENT_ID` (frontend, separate)
`client/src/components/estimates/GmailBidImporter.tsx` reads `VITE_GOOGLE_CLIENT_ID` from `.env`. This is a SEPARATE OAuth client for Gmail bid imports (frontend-only Google sign-in flow). Decide whether to share the Ingestion Lab client or create a separate one for the bid importer. **Recommendation: share** — same Cloud project, same consent screen, just add `https://skyelineos.web.app` to the Authorized JavaScript Origins on the same OAuth client and put the public Client ID in `.env`.

---

## H. Firebase Cloud Messaging (FCM) — web push

### What it is
Push notifications to the browser even when the tab is closed. Used by the Notification Center.

### Secret name(s)
None server-side beyond Firebase Admin SDK (already auto-configured). Client-side needs the VAPID public key:
- (hardcoded in `client/src/lib/push-notifications.ts`)

### Current status
✅ **Provisioned and working** per `SESSION_NOTES.md`. Service worker at `client/public/firebase-messaging-sw.js`. VAPID key hardcoded by design.

### How to verify

1. Console → https://console.firebase.google.com/project/skyelineos/messaging
2. Cloud Messaging → should show Server Key + Sender ID + Web Push certificates (VAPID).

### What you don't need to do
Nothing routine. FCM works as long as the service worker + VAPID key are present in the client. Tokens are captured per-user on opt-in.

### Where to look if push stops working
- `dispatch.ts` logs FCM errors per recipient.
- `users.fcmTokens[]` accumulates dead tokens — the dispatcher prunes invalid ones automatically.

---

## I. QuickBooks Online (QBO)

### What it is
OAuth scaffold for two-way sync that hasn't been built yet. See `open-questions.md` §I3.

### Secret names
- `QBO_CLIENT_ID`
- `QBO_CLIENT_SECRET`
- `QBO_ENV` — `sandbox` or `production`

### Current status
🟡 **OAuth flow built (`/qbo/oauth/start` + `/callback`), no sync code.** Whether to provision depends on the answer to question I3 in open-questions.md.

### How to provision (if needed)

1. https://developer.intuit.com → sign in as the Intuit account that holds the Skyeline QBO subscription.
2. My Apps → Create an app → Select API → QuickBooks Online and Payments.
3. Name: `Skyeline OS`. Choose scopes: **Accounting** (read + write).
4. Development tab → Keys & OAuth → copy the **Client ID** and **Client Secret**. Add Redirect URI: `https://skyelineos.web.app/qbo/oauth/callback`.
5. Bind:
   ```bash
   firebase functions:secrets:set QBO_CLIENT_ID --project skyelineos
   firebase functions:secrets:set QBO_CLIENT_SECRET --project skyelineos
   firebase functions:secrets:set QBO_ENV --project skyelineos
   # type: sandbox  (for first connect; switch to "production" when you publish the app for production keys)
   ```
6. Deploy: `npm run deploy:functions`.
7. Test the OAuth round-trip from the QBO connect UI (look in admin pages for the Connect QBO button — exact location depends on what was built).

### Sandbox vs. Production
You'll start in sandbox. To switch to production: go through Intuit's app submission process (a few hours of review). Then update QBO_ENV.

---

## J. Stripe — payment processing (currently broken)

### What it is
Was meant to power `PaymentProcessingCenter.tsx` (client/sub payments). Frontend uses Stripe Elements; calls `/api/create-payment-intent` which **does not exist** on the Cloud Functions side.

### Public key (frontend bundle)
`VITE_STRIPE_PUBLIC_KEY` — public, in `.env`.

### Secret keys (would be server-side if implemented)
- `STRIPE_SECRET_KEY` (not currently used)
- `STRIPE_WEBHOOK_SECRET` (not currently used)

### Current status
🔴 **Half-built and broken.** The UI calls an endpoint that doesn't exist. See `open-questions.md` §I2 — decide kill or finish.

### If you decide to kill
1. Delete or comment-out `client/src/components/financial/PaymentProcessingCenter.tsx`.
2. Drop `VITE_STRIPE_PUBLIC_KEY` from `.env.example`.
3. Drop `@stripe/stripe-js` from package.json deps.

### If you decide to finish
1. https://dashboard.stripe.com → sign up / sign in.
2. Developers → API keys:
   - **Publishable key** (`pk_test_...` or `pk_live_...`) → `.env` as `VITE_STRIPE_PUBLIC_KEY`.
   - **Secret key** (`sk_test_...` or `sk_live_...`) → Secret Manager:
     ```bash
     firebase functions:secrets:set STRIPE_SECRET_KEY --project skyelineos
     ```
3. Build the `/api/create-payment-intent` route in `functions/src/index.ts`. Pattern: extract amount + customer info from body, call `stripe.paymentIntents.create({...})`, return the client_secret. Also build a webhook endpoint for `payment_intent.succeeded` events.
4. Webhook → Developers → Webhooks → Add endpoint → `https://skyelineos.web.app/api/stripe/webhook` → events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` → copy the **signing secret** (`whsec_...`) → Secret Manager:
   ```bash
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project skyelineos
   ```

### Recommendation
Kill for now. ACH or wire is the actual payment method for $1M custom homes. Stripe processes 2.9% + $0.30 per transaction — that's $29,000 fees on a $1M payment. Real custom-home GCs don't use Stripe for the contract payment.

---

## K. Meta (Instagram) — content publishing

### What it is
Powers the Content Studio (`/content-studio` page). Publishes photos, reels, carousels to Instagram via the Graph API and reads insights.

### Secret names
- `META_APP_ID`
- `META_APP_SECRET`
- `META_PAGE_ID`
- `META_IG_BUSINESS_ID`
- `META_PAGE_ACCESS_TOKEN`

### Current status
🟡 **Endpoint routes exist (`/api/instagram/...`), unclear whether configured.** Verify via `firebase functions:secrets:list`.

### How to provision

1. https://developers.facebook.com/apps → Create App → Type: **Business.**
2. Name: `Skyeline OS Content`.
3. Add Products: **Instagram Graph API** + **Facebook Login.**
4. App Settings → Basic → copy:
   - **App ID** → `META_APP_ID`
   - **App Secret** → `META_APP_SECRET`
5. Tools → Graph API Explorer (or use the Page Access Token Tool):
   - Select your Skyeline Homes Facebook Page.
   - Generate a **Page Access Token** with permissions: `pages_read_engagement`, `pages_show_list`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`.
   - **Convert to long-lived token** (token tool → "Extend Access Token"). Page tokens that come from a long-lived user token are themselves long-lived (don't expire normally, but can revoke).
6. Find your Page ID: same explorer, query `me/accounts` while signed in.
7. Find your IG Business Account ID: query `{page-id}?fields=instagram_business_account`.
8. Bind:
   ```bash
   firebase functions:secrets:set META_APP_ID --project skyelineos
   firebase functions:secrets:set META_APP_SECRET --project skyelineos
   firebase functions:secrets:set META_PAGE_ID --project skyelineos
   firebase functions:secrets:set META_IG_BUSINESS_ID --project skyelineos
   firebase functions:secrets:set META_PAGE_ACCESS_TOKEN --project skyelineos
   ```
9. Deploy: `npm run deploy:functions`.

### Recommendation
Optional. Provision only if Tyler actually wants to publish to Instagram via the app. Otherwise, Content Studio works for drafting + scheduling — the actual posting can be manual.

---

## L. OpenAI (DALL-E for AI rendering)

### What it is
Powers `POST /api/ai/render` when provider=`dalle`. See `open-questions.md` §C3 — the UI is dead.

### Secret name
`OPENAI_API_KEY`

### Current status
🟡 **Code-ready, no UI to invoke it.** Decide whether to ship a UI (see C3) before provisioning.

### How to provision (if needed)

1. https://platform.openai.com/api-keys → sign in.
2. Create new secret key → label `Skyeline OS Cloud Functions` → copy `sk-...`.
3. Bind:
   ```bash
   firebase functions:secrets:set OPENAI_API_KEY --project skyelineos
   ```
4. Add to the `api` function's secrets array (it's not currently bound):
   - Edit `functions/src/index.ts` around line 2024
   - Add `'OPENAI_API_KEY'` to the array
5. Deploy: `npm run deploy:functions`.

### Cost monitoring
- DALL-E 3 HD pricing: $0.080/image at 1792x1024. Cap monthly spend via OpenAI's budget alerts.

### Recommendation
Don't provision until you confirm C3 (build the rendering UI). Then provision both OpenAI AND Replicate to give a fallback.

---

## M. Replicate (FLUX 1.1 Pro for AI rendering)

### What it is
Powers `POST /api/ai/render` when provider=`flux`. Alternative provider to DALL-E. See `open-questions.md` §C3.

### Secret name
`REPLICATE_API_TOKEN`

### Current status
🟡 **Same as OpenAI** — code-ready, no UI.

### How to provision (if needed)

1. https://replicate.com → sign in.
2. Account → API tokens → Create token → label `Skyeline OS`.
3. Bind:
   ```bash
   firebase functions:secrets:set REPLICATE_API_TOKEN --project skyelineos
   ```
4. Same as OpenAI: add to the `api` function's secrets array (line 2024-ish), deploy.

### Cost
- FLUX 1.1 Pro: ~$0.04/image. Generally cheaper than DALL-E and tends to handle architectural rendering better.

---

## N. Sentry — frontend error tracking (optional)

### What it is
Catches uncaught errors in the React app via `ErrorBoundary.tsx`. Sends to Sentry dashboard.

### Variable name
`VITE_SENTRY_DSN` — in `.env`, baked into bundle. Public DSN is fine to ship.

### Current status
🟡 **Code-ready, no DSN configured.** ErrorBoundary checks for the var and no-ops if absent.

### How to provision

1. https://sentry.io/signup → free tier is generous (10k errors/month).
2. Create project → platform: React.
3. Sentry shows you a DSN like `https://abc123@o12345.ingest.sentry.io/678`.
4. Add to `.env`:
   ```
   VITE_SENTRY_DSN="https://abc123@o12345.ingest.sentry.io/678"
   ```
5. Redeploy: `npm run deploy:hosting`.

### Recommendation
Set this up. Frontend errors are otherwise invisible; the Cloud Function side has its own logs but the React app is a black box without Sentry.

---

## O. OpenWeatherMap (weather widget)

### What it is
`useWeather` hook in `client/src/hooks/useWeather.ts` fetches weather for the current project's site. Used for weather-dependent task gating in the Gantt.

### Variable name
`VITE_OWM_API_KEY` — public, in `.env`.

### Current status
🟡 **Code-ready, key required.**

### How to provision

1. https://openweathermap.org/api → sign up free.
2. After signup, find your default API key under My Profile → API keys.
3. Add to `.env`:
   ```
   VITE_OWM_API_KEY="your-32-char-key-here"
   ```
4. Note: new keys take ~10 minutes to activate after signup.
5. Free tier: 60 calls/min, 1M calls/month. Plenty.
6. Redeploy: `npm run deploy:hosting`.

### Recommendation
Cheap to set up, the weather data is genuinely useful for scheduling. Do it.

---

## P. Firebase Hosting — DNS for custom domain (optional)

### Current status
Hosting lives at `skyelineos.web.app`. If you want a custom domain (e.g., `app.skyelinehomes.com`):

1. https://console.firebase.google.com/project/skyelineos/hosting/main → Add custom domain.
2. Enter `app.skyelinehomes.com` → Firebase shows you a DNS A record (or TXT for ownership verification) to add.
3. Go to your DNS provider for `skyelinehomes.com`, add the records.
4. Wait 5-24 hours for verification.
5. Firebase auto-provisions Let's Encrypt SSL.

### Update redirect URIs
**Important:** after migrating to `app.skyelinehomes.com`, update all redirect URIs in:
- Google Cloud OAuth client (§G): replace `skyelineos.web.app` with `app.skyelinehomes.com` in the Authorized Redirect URIs.
- QBO app (§I): same.
- Meta app (§K): same.

Until you're committed to the custom domain, keep using `skyelineos.web.app` everywhere — it's a working production URL.

---

## Q. `.env` file template — final form

After provisioning the above, your local `.env` file (NEVER committed) should look like:

```bash
# Firebase web config (public — these are safe to commit but conventional to keep in .env)
VITE_FIREBASE_API_KEY="..."
VITE_FIREBASE_AUTH_DOMAIN="skyelineos.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="skyelineos"
VITE_FIREBASE_STORAGE_BUCKET="skyelineos.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="..."
VITE_FIREBASE_APP_ID="..."
VITE_FIREBASE_MEASUREMENT_ID="..."  # optional, GA4

# Firebase App Check (production only)
VITE_FIREBASE_APP_CHECK_KEY="6Lc...recaptcha-v3-site-key..."
VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN=""  # local dev only; leave blank in committed example

# Frontend-only OAuth for Gmail bid importer (separate from server-side Google client)
VITE_GOOGLE_CLIENT_ID="...apps.googleusercontent.com"

# Stripe (only if Stripe is alive — see §J)
VITE_STRIPE_PUBLIC_KEY="pk_live_..."

# Sentry (recommended for production)
VITE_SENTRY_DSN="https://...@sentry.io/..."

# OpenWeatherMap
VITE_OWM_API_KEY="..."

# Local dev convenience (ignored in production)
VITE_AUTO_LOGIN=""
VITE_USE_FIREBASE_EMULATORS="false"
```

**Action:** rewrite `.env.example` to match the above. The current `.env.example` is the legacy Odyssey one — Postgres / JWT / AWS / SMTP vars that no longer apply. Delete it and replace.

---

## R. Cloud Function secrets — final form

After provisioning, `firebase functions:secrets:list --project skyelineos` should show:

| Secret | Purpose | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | Bill OCR + Ingestion Lab brain | **Required** |
| `SENDGRID_API_KEY` | Email | **Required for notifications** |
| `SENDGRID_FROM_EMAIL` | Email sender | **Required for notifications** |
| `TWILIO_ACCOUNT_SID` | SMS | Optional but recommended |
| `TWILIO_AUTH_TOKEN` | SMS | Optional but recommended |
| `TWILIO_FROM_NUMBER` | SMS | Optional but recommended |
| `APP_BASE_URL` | Links in emails (e.g. `https://skyelineos.web.app`) | **Required for notifications** |
| `GOOGLE_CLIENT_ID` | Ingestion Lab OAuth | **Required to deploy api function** |
| `GOOGLE_CLIENT_SECRET` | Ingestion Lab OAuth | **Required to deploy api function** |
| `QBO_CLIENT_ID` | QBO OAuth | Optional (skip if not using QBO) |
| `QBO_CLIENT_SECRET` | QBO OAuth | Optional |
| `QBO_ENV` | `sandbox` or `production` | Optional |
| `META_APP_ID` | Instagram publishing | Optional |
| `META_APP_SECRET` | Instagram publishing | Optional |
| `META_PAGE_ID` | Instagram publishing | Optional |
| `META_IG_BUSINESS_ID` | Instagram publishing | Optional |
| `META_PAGE_ACCESS_TOKEN` | Instagram publishing | Optional |
| `OPENAI_API_KEY` | AI rendering (if shipped) | Skip until C3 decided |
| `REPLICATE_API_TOKEN` | AI rendering (if shipped) | Skip until C3 decided |

**Note:** secrets that aren't bound to any function are harmless — they just sit in Secret Manager. The cost is $0.06/secret/month (free for the first 6). Don't pre-set secrets you don't use, but don't sweat one or two.

---

## S. Master checklist (single session)

Sit down with a coffee. In one ~90-minute sitting, you can have everything provisioned. Recommended order:

- [ ] **A — Firebase** (verify) — 5 min
- [ ] **D — Anthropic ROTATE** key — 10 min (rotate first because it's a real security item)
- [ ] **G — Google OAuth client + APIs + consent screen + redirect URIs** — 20 min (this unblocks api function deploys)
- [ ] **E — SendGrid** (domain authentication takes the longest part of this — kick off DNS records early) — 15 min
- [ ] **F — Twilio** (buy a number) — 10 min
- [ ] **C — Firebase App Check** (production hardening) — 10 min
- [ ] **N — Sentry** — 5 min
- [ ] **O — OpenWeatherMap** — 5 min
- [ ] **I — QBO** (only if Q I3 says yes) — 15 min
- [ ] **K — Meta** (only if you want IG publishing now) — 15 min
- [ ] **L + M — OpenAI + Replicate** (only if Q C3 says yes) — 10 min
- [ ] **J — Stripe** (KILL unless Q I2 says yes — see §J) — 10 min
- [ ] **Rewrite .env.example** (it's still labeled "Odyssey") — 10 min
- [ ] **Final deploy**: `npm run deploy:functions && npm run deploy:hosting` — 5 min
- [ ] **Smoke test**: send a real bid request, watch it land via SendGrid + Twilio — 5 min

Total: ~2 hours including coffee.

---

## T. Things this runbook does NOT cover

These are operator tasks called out in `open-questions.md` that aren't credential-provisioning:

- Apply Gmail label `Skyeline-Spike` to threads you want ingested (§G6 in Ingestion Lab setup)
- Populate `ingestion_lab/data/contacts_cache` via `node scripts/refresh-ingestion-contacts-cache.mjs` (§G6)
- Set budget alerts in Google Cloud Console + each vendor console (open-questions §O10)
- Delete `tester@gmail.com` Firebase Auth user (open-questions §N12)
- Set Firestore export → BigQuery for analytics (not currently configured; if you want it, set up via Firebase Console → Project Settings → Integrations → BigQuery)

---

## U. Sanity check

After everything above is done, run:

```bash
# 1. Verify all required secrets exist
firebase functions:secrets:list --project skyelineos

# 2. Verify .env is populated (locally; never commit)
cat .env | grep -v "^#" | grep -v "^$" | wc -l
# Should be ~10-15 lines of actual key=value pairs

# 3. Deploy everything
npm run check  # tsc — should be clean now that ModernTimelineBuilder is fixed
npm run deploy  # build + hosting + functions + rules + indexes

# 4. End-to-end probe
node scripts/probe-signin.mjs  # confirm sign-in works
node scripts/send-test-bid-request.mjs --to your-personal@example.com
# Email should arrive within seconds; SMS within ~10s if Twilio is configured for the recipient
```

If `firebase functions:secrets:list` shows everything in §R as set (except optional ones you skipped), and the test bid request emails arrive, the setup is good.
