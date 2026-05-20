# Skyeline OS — Project Overview

Construction management web app for a custom home builder (Skyeline Homes, American Fork UT). Single-tenant for now; multi-tenancy is not built. Production at https://skyelineos.web.app, Firebase project **`skyelineos`** (note: `CLAUDE.md` lists a different project id from a prior iteration — the live one is `skyelineos`).

---

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere (strict on client + functions; partial on legacy server/) |
| Frontend | React 18.3 + Vite 5.4, Wouter 3.3 routing, Tailwind 3.4, Radix UI primitives |
| State / data | React local state + TanStack Query 5.60 + Firestore `onSnapshot` listeners. No global store; some `XState` + `Zustand` deps imported but lightly used. |
| Auth | Firebase Auth (web SDK 12.13) via `client/src/auth/AuthContext.tsx`. Role-string in `users/{uid}.role`. |
| Database | **Firestore is the source of truth.** Drizzle/Postgres scaffolding exists in `server/` from an earlier architecture but is not the live system. Treat any `server/` code that uses Drizzle as legacy. |
| Hosting | Firebase Hosting (static SPA) + Cloud Functions (Node 20 v2). |
| Backend logic | Mostly client-side directly against Firestore. Cloud Functions used for: notifications dispatch (SendGrid/Twilio/FCM), bill OCR (Anthropic Claude), QBO OAuth, contact-auth backfill, warranty reminders, claim-contact endpoints. |
| AI | Anthropic Claude SDK for bill OCR (`functions/src/bills/`). No model code on the client. |
| 3rd-party integrations | SendGrid (email), Twilio (SMS), Firebase Cloud Messaging (web push), QuickBooks Online (read+write planned, OAuth wired), Stripe (deps present, not yet active). |
| Build / deploy | `npm run build && firebase deploy --project skyelineos`. Functions have their own `npm run build` predeploy step (`tsc`). |
| Testing | Playwright smoke scripts in `scripts/`. No unit-test runner is wired into CI. |

---

## Folder structure (3 levels)

```
skyelineos-clean/
├── client/
│   ├── public/
│   │   ├── firebase-messaging-sw.js      # FCM service worker (web push)
│   │   ├── locales/                       # i18n stubs
│   │   └── logos/
│   └── src/
│       ├── auth/                          # AuthContext, ProtectedRoute
│       ├── components/                    # ~250 components grouped by domain
│       │   ├── auth/                      # RoleGuard
│       │   ├── bidding/                   # Portal bid panel, send/award/claim modals
│       │   ├── contacts/                  # Contact list, edit
│       │   ├── designer/                  # Designer portal pieces
│       │   ├── estimates/                 # Line description button, sub picker, templates
│       │   ├── layout/                    # Sidebars, top nav
│       │   ├── notifications/             # EnablePushButton
│       │   ├── sales/                     # Sales CRM cards, vCard import zone
│       │   ├── schedule/                  # Schedule editors
│       │   ├── takeoff/                   # PDF takeoff studio
│       │   └── ui/                        # Radix primitives (shadcn)
│       ├── contexts/                      # AdminViewContext etc.
│       ├── hooks/                         # use-auth, use-toast, etc.
│       ├── lib/
│       │   ├── contacts/                  # vCard parser
│       │   ├── draws/                     # Draw aggregation
│       │   ├── estimates/                 # Markup math, trade taxonomy
│       │   ├── lumber/                    # Lumber takeoff engine
│       │   ├── push-notifications.ts      # FCM client wrapper
│       │   └── firebase.ts                # Web SDK init
│       ├── pages/                         # ~70 top-level routes
│       └── utils/                         # roleRedirects, formatting helpers
├── functions/
│   └── src/
│       ├── auth/                          # contact-auth ensure + backfill
│       ├── bills/                         # Anthropic bill OCR
│       ├── contacts/                      # (currently empty — claim flow folded into api Express)
│       ├── notifications/                 # dispatch (email + SMS + push), scheduledDueSweep
│       ├── projects/                      # warrantyReminders
│       ├── qbo/                           # QuickBooks OAuth
│       └── index.ts                       # Big Express app + all v2 exports
├── server/                                # LEGACY Express + Drizzle backend, not the production path
│   ├── auth/, db/, middleware/, routes/, services/, workflows/
│   └── (anything here that isn't referenced from functions/ or client/ is effectively dead)
├── shared/
│   ├── auth-types.ts                      # UserRole, normalizeRole, role permissions
│   ├── types.ts                           # Project/Contact/Estimate/Bid types
│   ├── messaging-types.ts
│   ├── messaging-schema.ts
│   └── schema.ts                          # Zod schemas (partial)
├── scripts/                               # Playwright smoke tests, ops scripts
│   ├── send-test-bid-request.mjs          # ops scripts use REST API + Auth token
│   ├── delete-test-bid-request.mjs
│   ├── smoke-vcard-import.mjs
│   └── test-vcard-parser.mjs              # Unit-style parser tests via esbuild
├── firestore.rules                        # Security rules — single source of truth for access
├── firestore.indexes.json
├── storage.rules
├── firebase.json                          # Hosting + Functions + Storage + Firestore config
├── CLAUDE.md                              # Dev playbook (project conventions, role table)
└── package.json
```

---

## Major modules built (live in production)

**GC/admin surface:**
1. **Dashboard** — Cash-flow / team-access / unsigned-schedule cards (`client/src/pages/Dashboard.tsx`)
2. **Sales / CRM** — Pipeline stages, lead kanban, vCard bulk import + contact-claim, leadDialog (`client/src/pages/Sales.tsx`)
3. **Contacts** — Sub/vendor directory, trade tagging, insurance + license fields (`client/src/pages/Contacts.tsx`)
4. **Projects** — Project list + per-project nested tabs (`client/src/pages/Projects.tsx`)
5. **Estimates / EstimateBuilder** — JACK-parity line items, MAT/LAB split, per-line markup, sub picker, takeoff link, description popup, bid auto-link chips, status filters, costings tab, sign-contract flow (`client/src/pages/EstimateBuilder.tsx`, ~1700 lines — the central screen)
6. **Bid Packages (Portal Bids)** — Multi-trade send modal, templates, request detail (recipients + status + send reminder + add sub), award flow w/ estimate-line picker + client-price decision (`client/src/components/bidding/`)
7. **Schedule / Gantt** — Trade dropdown unification, draws panel, schedule editor modal (`client/src/components/schedule/`, `client/src/modules/gantt/`)
8. **Site Logs + Photos + Documents + Tasks + Change Orders** — Each as a project sub-tab.
9. **Finance / Accounting** — Budget aggregation, draws, QBO OAuth (Express endpoints live; full two-way sync not yet built).
10. **Bills** — AI bill OCR via Claude vision (`functions/src/bills/analyzeBill.ts`).
11. **Lumber Takeoff Studio** — PDF render + calibrate + multi-page measurements, smoke-tested (`client/src/components/takeoff/`, `client/src/lib/lumber/`).
12. **Notifications** — `notifications/{id}` Firestore doc triggers a Cloud Function that dispatches Email (SendGrid) + SMS (Twilio) + Web Push (FCM) per recipient prefs (`functions/src/notifications/dispatch.ts`).
13. **Settings, Users (in progress for Phase 2)**.

**Portal surfaces:**
14. **Subcontractor Portal** — Bid requests tab (collectionGroup query with contact-resolution fallback), bid submission form w/ compliance gate, claim-profile flow w/ replace/add email merge, FCM opt-in.
15. **Designer Portal** — Selections + palette + rendering studio (`client/src/components/designer/`).
16. **Client Portal** — Project overview + photos + messaging stubs.

**Cross-cutting infra:**
17. **vCard import + claim** — Contacts directory bulk import; sub portal "Claim your profile" flow (`client/src/components/bidding/ClaimContactDialog.tsx` + `functions/src/index.ts` Express routes).
18. **Web push** — Service worker at `client/public/firebase-messaging-sw.js`, VAPID configured, dispatcher prunes dead tokens.
19. **Auth role redirects** — `client/src/utils/roleRedirects.ts` + `RoleGuard` + `ProtectedRoute` route by role; signed-in users mismatched on `?email=X` deep links get a recipient-mismatch banner with "sign in as X" action.

---

## Stubbed / in-progress modules

Per `CLAUDE.md`:
- **Safety Forms** — page exists, Firestore wiring pending
- **Timesheets** — page exists, Firestore wiring pending
- **Design Board** — partially built
- **Social Media (Module 5)** — planned only

Other in-flight work observed in code:
- **Staff/Admin role split** with per-permission toggles (proposed, not yet started). Currently `gc` is the de-facto staff role.
- **Role-based pricing visibility on estimate display** (sub sees no $, client sees only client-price). Discussed, not built.
- **Takeoff → multi-line spawn** — currently one ruler click updates one line; the multi-measure → multi-spawn flow is partially designed (handler accepts an array but only takes the first).
- **Bid template Phase 2** — only per-trade `defaultScope` exists in `trades/{id}`; full bid-package templates were added to a new `bidPackageTemplates` collection.
- **Per-sub additionalEmails surfacing** — the Cloud Function writes `additionalEmails[]` on Add-mode claim, but the Contacts edit UI doesn't show this array yet.

---

## Known issues & areas of uncertainty

**Architecture smells:**
- **Two parallel backends**: `functions/` is the live path; `server/` is legacy Express+Drizzle. Some routes in `server/` mention `/api/...` but those don't reach production (Firebase Hosting rewrites `/api/...` to the `api` Cloud Function only). Anyone reading `server/` may be misled.
- **Duplicate bid systems**: `BidsTabNew.tsx` and `BidsTab.tsx` both exist. The live path is `PortalBidsPanel` → `SendBidPackageModal` / `AwardBidModal`. The old `BidsTab*` files call an Express `/api/bid-responses/:id/select` that doesn't exist in production.
- **Org IAM blocks new Cloud Functions**: Any new callable function fails to deploy. Workaround: fold into the existing `api` Express app and route via path. Documented near `analyze-bill` and `contacts/claim` routes in `functions/src/index.ts`.
- **TypeScript errors in `ModernTimelineBuilder.tsx`** (lines ~815, 1342) are pre-existing and currently ignored — vite/esbuild build succeeds despite them.

**Data-model footguns:**
- `users/{uid}.email` and Firebase Auth `auth.token.email` can diverge. Bid request resolution uses **auth email**, not the Firestore user-doc email, to avoid stale links.
- Contacts are linked to users via `linkedUserId` set on first sub-portal load (auto-link when emails match) OR via the manual claim flow. Bid invites store contact ID + linkedUserId + email in `invitedSubIds[]` so any of the three resolves.
- Firestore rules: collection-group queries can't use `get()` (silently fails the query). The `bidRequests` read rule was rewritten to rely only on `request.auth.uid in invitedSubIds || request.auth.token.email.lower() in invitedSubIds` — no role lookup.

**Unfinished plumbing:**
- Compliance gate on bid submission is client-side only — needs a Firestore rule or Cloud Function mirror so a sub can't bypass via curl.
- `users/{uid}.fcmTokens[]` is populated by client opt-in but there's no UI yet for a user to see "registered devices" or revoke from one device only.
- Sign-up flow doesn't auto-link the new user to any matching contact — the link happens on first sub-portal visit instead. Could be moved to a `users/onCreate` Cloud Function.

---

## Critical files to read first (architecture)

1. **`firestore.rules`** — the actual access-control story.
2. **`shared/types.ts`** + **`shared/auth-types.ts`** — canonical data shapes + role list.
3. **`firestore.indexes.json`** — which composite queries are supported.
4. **`functions/src/index.ts`** — the Express app + every Cloud Function export. All real backend logic lives here or imports from here.
5. **`client/src/pages/EstimateBuilder.tsx`** — biggest single file; touches estimates, bids, takeoff, sub picker. If reviewing for refactor opportunities, start here.
6. **`client/src/auth/AuthContext.tsx`** + **`client/src/components/auth/RoleGuard.tsx`** + **`client/src/utils/roleRedirects.ts`** — how the app decides who sees what.
7. **`client/src/components/bidding/`** — the most-iterated module right now.
8. **`functions/src/notifications/dispatch.ts`** — fan-out for email/SMS/push.
9. **`CLAUDE.md`** — conventions, role table, deploy command.

---

## Deploy

```bash
npm run build && firebase deploy --project skyelineos
```

For rules-only changes:
```bash
firebase deploy --only firestore:rules --project skyelineos
```
For functions-only:
```bash
firebase deploy --only functions --project skyelineos
```
