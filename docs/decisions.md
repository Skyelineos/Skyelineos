# Skyeline OS — Authoritative Decisions

**Status:** This file is the source of truth for product + architectural decisions made by the user. When `CLAUDE.md`, `PROJECT_OVERVIEW.md`, design docs, or session notes conflict with this file, **this file wins.**

**Drafted:** 2026-05-22.

Each decision records: the decision, when it was made, what's now in scope, what's now explicitly out of scope, and which questions it answers / opens.

---

## D-001 — `projectManager` is a real role

**Decided:** 2026-05-22.
**Answers:** open-questions.md §D1.

### What `projectManager` is
A delegate of the GC (Tyler). PMs support the GC by managing subs, timelines, and providing project status reports. **PMs are not separate stakeholders** — they act *on behalf of* the GC for operational work, with two carve-outs (billing/payment and final selection signoffs).

### Permissions matrix

| Capability | admin | gc (Tyler) | projectManager | designer | client | sub |
|---|---|---|---|---|---|---|
| Project create / delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Project edit (status, dates, team) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Sub management (invite, contract, award) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Schedule / Gantt edit | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reporting (read everything, generate reports) | ✅ | ✅ | ✅ | scoped | scoped | scoped |
| Selections — read + comment | ✅ | ✅ | ✅ | ✅ | ✅ | scoped |
| Selections — upload options on someone's behalf | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Selections — sign off (one of the required parties) | ✅* | ✅* | ❌ | ✅** | ✅** | ❌ |
| Selections — override / break lock (admin power) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Financials — read (P&L, AR/AP, budgets) | ✅ | ✅ | read-only | ❌ | scoped*** | scoped*** |
| Financials — write (record payment, post invoice, edit contract) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Bills / AP entry | ✅ | ✅ | ✅ (enter, route to GC) | ❌ | ❌ | ❌ |
| Settings (org-level config, user mgmt, integrations) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Bid send / award decisions | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Site logs / walkthroughs / photos — create + edit | ✅ | ✅ | ✅ | ❌ | ❌ | scoped |
| Contracts — author | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Contracts — view (party-only) | ✅ | ✅ | read all on assigned projects | ✅ | ✅ | ✅ |

\* = GC + admin are the only roles that can override or break a lock.
\** = designer/client sign off as a "required party" — see selections-design.md §3 (signoff parties per selection).
\*** = clients see their project's billing/financials only (invoices to them, contract total, draws); subs see their own POs/invoices only.

### Ambiguities to resolve

These were raised by this decision and need a follow-up answer before the role refactor ships:

- **D-001-a — Can a PM be assigned to multiple projects?** Recommendation: yes, scoped to `assignedUserIds[]` per project. PMs only see projects they're on.
- **D-001-b — Can multiple PMs share a project?** Recommendation: yes, multi-PM is fine. No special collision behavior needed; both edit, audit trail records who.
- **D-001-c — Can a PM create new sub contacts?** Recommendation: yes — they need to in order to manage subs effectively. Auditable.
- **D-001-d — Can a PM grant another user portal access?** Recommendation: no — that's a settings/user-mgmt action, GC only.
- **D-001-e — Does `pending_pm` exist as a pre-approval state?** Recommendation: no, PMs are added by GC directly, never self-signup.

### Implementation tasks (do NOT execute until role refactor begins)

1. **Firestore rules** — add `isProjectManager()` helper alongside `isGC()`. For every rule that uses `isGC()` for project-operational paths, expand to `isGC() || isProjectManager()`. Exceptions: billing/payment writes (`isGC()` only), final selection signoffs (no role grants this directly — it's a "required party" check, see selections-design.md), settings.
2. **Cloud Functions** — every `role === 'gc'` check in `functions/src/index.ts:1101` and `:1606` (auth middleware) extends to include `projectManager` with the same carve-outs.
3. **Client normalizers** — unify the 4 parallel `UserRole` types and 5 normalizers per `ROLE_AUDIT.md`. Canonical form: `projectManager` (camelCase). Strip `project_manager`, `projectmanager`, `pm` aliases — collapse all to `projectManager`.
4. **App.tsx role guards** — existing `allowedRoles={['admin', 'gc', 'projectManager']}` arrays are correct; preserve.
5. **Add a `ProjectManager` UI label** (display name "Project Manager") so users see clear language.

---

## D-002 — Selections is a four-stakeholder workflow

**Decided:** 2026-05-22.
**Supersedes:** the three-party model in `three-party-selections-design.md` (now renamed to `selections-design.md`).
**Answers:** open-questions.md §A2, §A3, §A6 (partial).

### The four stakeholders
**Designer · Contractor · Client · GC.** All four can read, comment, upload options, and initiate edits. **Signoff parties** are typically designer + contractor + client (the default `requiredSignoffs`). GC has the admin-equivalent power to: initiate any action, sign on behalf of any required party (override), and break a lock without going through the change-order process.

### Decision details

#### Multi-option structure
Each selection holds an `options[]` array. Any of the four parties can upload an option. When an option is uploaded, the system **automatically prompts a bid request to the relevant contractor** (selected based on the selection's category and the project's preferred vendors). The contractor responds with a bid; the bid is attached to that option.

#### $500 fee past 3 options
- A selection allows up to 3 bid-bearing options at no fee.
- Adding a 4th (or higher) option triggers a confirmation modal explaining the **$500/option overage fee.** Client (or whoever's adding) must explicitly acknowledge.
- The fee accrues against the project (added to project total — see D-002-c open follow-up below).
- Fee applies **regardless of which party initiates the 4th option** — see D-002-b below.

#### Lock after signoff
When all `requiredSignoffs` parties have signed at the current revision, the selection becomes `Locked`. From `Locked`:
- No party can edit the spec.
- The only path forward (for changes) is an authorized **change order.**
- The path through to `Ordered → Received → Installed` (contractor-driven) does not unlock the selection — those are post-lock progressions.

#### Change order unlock path
- Any party can initiate a CO. CO is its own document (see new doc `docs/change-order-design.md` to be written; minimal scope captured in D-003 below).
- A CO references the locked selection and describes the proposed change.
- CO requires its own signoff cycle from the same `requiredSignoffs` parties.
- On CO approval: the selection unlocks, the new spec is applied, and a new lock is set at the post-CO revision.

#### GC override
- GC + admin only. Buttons surfaced contextually ("Sign on behalf of <party>", "Break lock").
- All overrides logged in `revisionHistory` with explicit `byRole: 'admin' | 'gc' on behalf of <party>` and a required reason note.

### Open follow-ups raised by this decision (need user answers)

- **D-002-a — Who pays the $500 selection-overage fee, and when?** Options: (i) client pays at project close as line item; (ii) immediately to a card via Stripe; (iii) added to project total + financed through the build budget. The contractor and GC are the ones whose time is being protected, so the GC presumably keeps the money.
- **D-002-b — Does the fee apply when GC adds the 4th option on the client's behalf?** Likely no — when GC initiates, it's a GC-driven exploration, not a client expansion. But this needs explicit policy.
- **D-002-c — Is the fee refundable if the client picks one of the 4th+ bid options?** Spec: probably no — the work was already done getting the bid, not selecting it.
- **D-002-d — What's the change-order approval flow — same 4-stakeholder signoff, or shorter?** Recommendation: same `requiredSignoffs` as the underlying selection. Shorter (e.g. GC + client only) makes COs a back door around the signoff guarantee.
- **D-002-e — On option upload, which contractor gets the auto-bid request?** Today the `usePreferredVendors(category)` hook resolves preferred vendors from `contacts.preferredCategories[]`. If none preferred, who? Recommendation: GC is notified to pick a vendor manually before the bid can be requested.
- **D-002-f — Can multiple contractors bid on the same option?** Probably yes — the option spec doesn't change, just the bidder. Lowest qualifying bid wins by default; GC can override.
- **D-002-g — Sub-portal: do subs see selections at all, or only their bid requests?** Today only bid requests. Recommendation: keep that — selections are 4-party (GC/designer/contractor/client), not 5.

### Implementation impact
- The 6 open questions in `three-party-selections-design.md` §9 are now mostly resolved (see D-002-a through D-002-g above for what replaced them).
- The data model needs `options[]` (multi-option), `optionBids[]` per option, `overageFeeAccrued` field, `lockedAt` + `unlockedByChangeOrderId`, `changeOrderIds[]` history.
- The signoff state machine simplifies: `Active → Locked → (CO → Active → Locked) → Ordered → Received → Installed`.
- See full design at `docs/selections-design.md`.

---

## D-003 — Change orders are first-class

**Decided:** 2026-05-22 (implied by D-002 lock-after-signoff decision).
**Answers:** new requirement.

### What
A change order (`changeOrders/{coId}`) is a first-class Firestore document that proposes a change to a locked selection, contract, or scope. It has its own signoff cycle. On approval, it unlocks the target document and applies the proposed change.

### Scope (minimum)
- `changeOrders/{coId}` collection (already exists per firestore.rules:`match /changeOrders/{orderId}`).
- Fields: `targetType: 'selection' | 'contract'`, `targetId`, `proposedChange`, `costImpact`, `scheduleImpact`, `initiatedBy`, `initiatedAt`, `signoffs`, `status: 'draft' | 'pending' | 'approved' | 'rejected' | 'withdrawn'`.
- Signoff cycle mirrors the underlying selection's `requiredSignoffs` (per D-002-d, recommend same parties).
- On approval: write `unlockedByChangeOrderId` onto the target selection, fire `onChangeOrderApproved` Cloud Function trigger to apply the proposed change.

### Open follow-ups
- **D-003-a — Does the existing `changeOrders` collection match this design?** Need to audit — there's already a CO concept in the contracts module (`ChangeOrderRequestModal.tsx`), but it may be scoped to contracts only, not selections.
- **D-003-b — Can a single CO span multiple targets** (e.g., "change the cabinet selection AND adjust the related contract line")? Probably yes — `targets: [{type, id}]` array. Defer until needed.

---

## D-004 — AI Rendering Studio is GO with quotas + paywall

**Decided:** 2026-05-22.
**Answers:** open-questions.md §C3.
**Reopens:** I2 (Stripe) — was "kill", now likely "ship".

### What
Build the client-facing rendering studio. Use Claude (via Anthropic) as a router that picks the best image-gen provider per request (photorealistic interior → FLUX 1.1 Pro by default; other styles → DALL-E 3 / gpt-image-1; future models added by config). The existing `POST /api/ai/render` route is extended with the router; existing `AIRenderingStudio.tsx` (dead Coming Soon UI) is replaced.

### Quotas

| Role | Free quota | Overage | Visibility |
|---|---|---|---|
| Client | 5 rooms × 10 iterations/room/project | $500 per additional room, $250 per additional "wall" rendering | Visible to client + designer + GC |
| Designer | Configurable per designer by GC (settings UI) | n/a (over quota → blocked, ask GC) | Visible per project assignment |
| GC (Tyler) | Unlimited | n/a | **Private by default** (not visible to client) — can be marked public per rendering |
| projectManager | Same as designer default unless GC overrides | n/a | Same as designer |
| admin | Unlimited | n/a | Same as GC |

### Workflow
1. Client (or designer/GC) opens the rendering studio for a specific project + room.
2. **First-time per-project**: warning modal explaining the limits and paywall. Acknowledge.
3. Configure rendering — current selections auto-populated as input; user can override style ("modern transitional", "farmhouse", etc.).
4. Submit. Backend:
   - Counts: is the user over their quota? If so → paywall modal (Stripe) BEFORE the call.
   - Routes via Claude to the best model.
   - Generates rendering.
   - Persists with full metadata.
   - Returns URL to client.
5. Client can request iterations (up to 10/room) for free. Each iteration is a re-roll of the same prompt with optional tweaks.

### Persistence
Each rendering stored as:
```
projects/{projectId}/renderings/{renderingId}
  - id, projectId, roomId, renderingType: 'room' | 'wall'
  - createdBy: uid, createdByRole: 'client' | 'designer' | 'gc' | 'projectManager' | 'admin'
  - visibility: 'public' | 'private' (default depends on role — see table)
  - createdAt: serverTimestamp
  - prompt: full text
  - provider: 'dalle' | 'flux' | 'gpt-image-1' | future
  - routerReasoning: short string Claude returned explaining model choice (optional)
  - selections: array of selectionIds referenced
  - style: string
  - imageUrl: Firebase Storage URL
  - thumbnailUrl: optional smaller version
  - iterationOf: optional renderingId (for "re-roll" tracking)
  - quotaCount: { type: 'room' | 'wall', counted: bool }
  - paywallChargeId: optional, links to Stripe payment intent or accrued-fee record
```

### Open follow-ups
- **D-004-a — Where does paywall money flow?** Same as D-002-a. Decision should be unified across all paid features.
- **D-004-b — What's the difference between a "room" rendering and a "wall" rendering?** Recommend: a room rendering is a full perspective; a wall rendering is a single-elevation close-up (e.g., backsplash + cabinets only). Need UX decision on which one Claude chooses by default given context.
- **D-004-c — If client stops paying, do they lose access to previously-generated renderings?** Recommend: no — they keep what was paid for. Only new generations are blocked.
- **D-004-d — Designer quota default?** Recommend: 20 renderings/project, GC can adjust per designer.
- **D-004-e — Can designers gift their quota to a client?** Adds complexity; recommend no for v1.
- **D-004-f — Are renderings deletable?** Client deletes own → soft delete (hidden, still in storage for audit). GC delete → hard delete. Designer delete → soft delete.
- **D-004-g — Versioning / regeneration of same prompt?** Default: new prompt = new rendering. "Re-roll same prompt" = explicit action, counted as iteration. Capped at 10 iterations/room (so re-rolls share the quota).
- **D-004-h — Claude router prompt design.** Needs first-draft prompt + few-shot examples. Initial recommendation: pre-set a `provider` for interior-photorealistic (FLUX); use Claude only when user asks for something stylistically unusual.
- **D-004-i — Storage retention for renderings.** Tied into the broader doc-retention question (open-questions.md §H2). Recommend: live forever until project completes; archive 12 months after; hard-delete after 7 years.

### Implementation impact
- `AIRenderingStudio.tsx` (currently dead) — full rewrite into a real studio with quota-aware UI.
- `POST /api/ai/render` — extend with Claude routing layer + quota check + paywall integration.
- New Firestore collection: `projects/{p}/renderings/{r}` + composite index for quota queries.
- New settings UI: per-designer rendering quotas, editable by GC.
- Payment rail needed — see D-005.
- See full design at `docs/ai-rendering-studio-design.md`.

---

## D-005 — Multi-tenant is Phase 2, not now

**Decided:** 2026-05-22.
**Answers:** open-questions.md §E1.

### What
Skyeline OS stays single-tenant for the foreseeable. It serves Skyeline Homes (Tyler's company) exclusively until further notice. **After test-running, a future version may be productized and sold to other builders** — this is a real future possibility, not a hypothetical, so we should avoid making it harder than necessary.

### What changes now
**Nothing built-for-multi-tenant.** No `companyId` fields, no tenant scoping in queries, no per-org settings tables. Single-tenant assumptions are fine.

### What changes in code style (defensive moves)
Avoid hardcoding things that would make extraction painful later:
- **Brand strings** (`"Skyeline"`, `"Skyeline Homes"`, `"skyelineos"`) should come from a `companySettings/main` doc or a config constant, not be sprinkled inline.
- **Firebase project ID** (`skyelineos`) referenced in deploy scripts only; never in client code as a string compare.
- **Single-org data shapes** (e.g., "the active project's `clientId` is the homeowner") are fine to assume.
- **Hardcoded project IDs** (Giboney + Christensen in `driveIngester.ts`) should move to config.

### Phase 2 work — to be planned later, NOT now
- Introduce `organizations/{orgId}` doc + add `orgId` to every collection.
- Migrate every Firestore rule to scope by `request.auth.orgId`.
- Build org-switcher in the UI.
- Per-org branding (logo, colors).
- Per-org integrations (each org's own SendGrid, QBO, Stripe keys).
- Per-org pricing model (charge customers monthly).

### Open follow-ups
- **D-005-a — Is there a date target for productization?** If "within 2 years," any new collection should at least *consider* future tenant scoping. If "5+ years," don't.
- **D-005-b — When this gets productized, will it be hosted by Anthropic-style SaaS (Tyler runs the platform), or self-hosted (each customer runs their own Firebase project)?** Big architectural difference — SaaS forces multi-tenant; self-hosted lets each instance stay single-tenant.

### Implementation impact
- Audit the codebase for hardcoded "Skyeline" / "skyelineos" strings.
- Move hardcoded project IDs in `driveIngester.ts` to `ingestion_lab/config.driveFolders`.
- Document this constraint in `CLAUDE.md` so future sessions don't speculatively add company-isms.

---

## D-006 — `AIRenderingStudio.tsx` dead code: REPLACE, don't delete

**Decided:** 2026-05-22 (implied by D-004 GO).
**Answers:** open-questions.md §N8.

### What
The dead `client/src/components/designer/AIRenderingStudio.tsx` is no longer dead — it gets replaced with the real Studio implementation per D-004 + `docs/ai-rendering-studio-design.md`. Don't delete.

---

## D-007 — Stripe is back on the table

**Decided:** 2026-05-22 (implied by D-002 + D-004 paywall needs).
**Answers:** open-questions.md §I2 (reopens; previously recommended kill).

### What
We need a payment rail for at minimum:
- $500 selection-overage fees (D-002)
- AI rendering paywall — $500/room, $250/wall over quota (D-004)

### Options not yet decided
- **Direct Stripe** (revive `PaymentProcessingCenter.tsx`, build the missing `/api/create-payment-intent` route + webhook).
- **Stripe Connect** (multi-tenant ready) — overkill for Phase 1.
- **Accrue to project ledger, settle at project close** (no real-time payment rail, fees just added to invoice). Cheapest to build; defers the Stripe integration.
- **Stripe + accrue hybrid** — small fees accrue to ledger; large fees (>$X) charged immediately.

### Open follow-ups
- **D-007-a — Real-time charge or accrue-and-settle?** Affects the build complexity dramatically.
- **D-007-b — If real-time: card-on-file required (Stripe SetupIntent) or charge per request (PaymentIntent each time)?**
- **D-007-c — Does the GC or the client see the charge first** (i.e. who confirms before the card is hit)?

### Implementation impact
- The previous "kill Stripe" recommendation in `open-questions.md` §I2 is **revoked.** Keep the Stripe UI for now; will need extension.
- Stripe secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) need provisioning — `setup-runbook.md` §J already documents how.

---

## D-008 — AuthContext test-mode bypass: explicit decision pending

**Decided:** Not yet — flagged for separate user input.
**Refs:** open-questions.md §O3.

The test-mode bypass in `AuthContext.tsx:70-95` injects fake admin from localStorage in production builds. The user said they'll be asked separately whether to kill it immediately. **Until then, no change.**

---

## D-009 — Batch approval of recommendations (2026-05-22)

**Decided:** 2026-05-22.
**Mode:** User reviewed the full open-questions list and approved all recommendations without exception. Net effect — every question in §A4, §C1, §C2, §C4, §C6–§C16, §D1-a–d, §F1–§F3, §G1–§G4, §H1–§H4, §I1, §I2-b/c, §I3, §I4, §J1, §J2, §K1, §K2, §L1, §L2, §M1–§M3, §N1–§N13 (all 13 cleanups), §O3 (kill test-mode bypass — gate behind `import.meta.env.DEV`), §O8 (rotate Anthropic key), §O10 (budget alerts), §P1 (build sequence) is now committed at the recommendation stated in `docs/open-questions.md` last revision.

**Implication:** No outstanding "should we?" questions remain except the three answered in D-010 and D-011 below, and questions deliberately deferred (A14 changeOrders audit during Slice 2; D-005-a/b productization specifics deferred until E1-a/b clarify further).

**Override mechanism:** Any of these can be revisited at any time. If a decision turns out to feel wrong in practice, raise it as a follow-up in `open-questions.md` with a new question ID and reasoning.

---

## D-010 — Port the v2 branch into the four-stakeholder model

**Decided:** 2026-05-22.
**Answers:** open-questions.md §B1.

### What
Port `origin/feat/selections-v2-dashboard-reminders` (commit `6b09bd6`) into `main` against the new four-stakeholder selections model. ~70% of the branch lands unchanged; the ~30% coupled to `clientApprovalStatus = 'Checking w/ Client'` gets replaced with the `lockState` + `signoffs` logic per `docs/selections-design.md`.

### Lands in
Slice 4 of `docs/selections-design.md` §11 — after core selections model (Slices 1-3) is in place.

### Per-component verdict
See `docs/selections-design.md` §10 table. The pieces that need rework: `DesignerRecommendationPanel` (rename to `OptionRecommendationPanel` — any party can recommend), the daily reminder Cloud Function (expand recipients to all four parties), the `onSelectionUpdated` trigger (detect revision bumps + lock events + CO events instead of `clientApprovalStatus` transitions).

### Implication
Do NOT delete the branch yet. The branch stays until Slice 4 ships and the port is verified in production. Then archive (tag, then delete branch).

---

## D-011 — Productization horizon: within 2 years (SaaS vs. self-hosted TBD)

**Decided:** 2026-05-22.
**Answers:** open-questions.md §E1-a (resolved); §E1-b (deferred).
**Updates:** D-005 ("Multi-tenant is Phase 2") gains a concrete time-horizon.

### What

- **Productization is targeted within 2 years.** Concrete enough to influence near-term design choices.
- **SaaS vs. self-hosted is still undecided.** Plan defensively — assume SaaS is the likely path (one Tyler-hosted instance, multiple builder tenants paying monthly) but don't lock in either way.

### Implication for code now

The "single-tenant for 5 years" framing in `CLAUDE.md` is no longer accurate. Adjust:

1. **New collections should leave room for `companyId` to be added later** — design with a *single-org-implicit* mental model, but don't make data-shape assumptions that would require schema changes to retrofit (e.g., don't compose keys with the company implicit; don't write any rule that requires reading every doc to determine ownership).
2. **Continue avoiding hardcoded "Skyeline" / "skyelineos" brand strings** — D-005 guidance stands.
3. **Hardcoded project IDs in `driveIngester.ts`** (Giboney + Christensen) — move to config now (cheap, was on the list anyway), defer the full `ingestion_lab/config.driveFolders` per-project addition until Slice 1 of multi-tenant work.
4. **Document the multi-tenant migration plan as a Phase 2 doc** — `docs/multi-tenant-migration-plan.md` (TBD) — outlining: orgId addition across collections, per-org Firebase config, billing rail, org switcher UI. Don't write until Slice 1 of selections + rendering ship.

### Open follow-up

- **D-011-a — When does the SaaS/self-hosted decision need to be made?** Recommendation: at the 12-month mark, after Skyeline has been using the app daily for ~6 months and we know which features are sticky enough to productize. Until then, defensive plan-for-SaaS is fine.

### Cross-reference

- `CLAUDE.md` says single-tenant for 5 years — **update this** to "single-tenant Phase 1; SaaS productization targeted within 2 years."
- `PROJECT_OVERVIEW.md` "What's deliberately not in scope right now" mentions multi-tenant similarly — **update** to reflect the 2-year target.

---

## D-012 — Sub portal accounts + three-tier general bidding

**Decided:** 2026-05-24.
**Supersedes:** earlier magic-link-only proposal for the bid response flow.
**Answers:** open-questions.md §F (bid response loop), §G (sub onboarding).

### What

**Subs are first-class users with their own portal accounts.** Not magic-link-only.

1. **Sub sign-up flow.** Subs create their own account (email/password) via a public sign-up page tailored for subs. New account auto-links to any existing `contacts/{id}` doc with a matching email. (The existing `ensureContactAuthAccount` Firestore trigger already does the reverse — auto-creating Auth records from contacts. We're closing the loop the other direction.)

2. **Required onboarding documents.** Three artifacts must be uploaded and admin-verified before the sub can submit a bid:
   - **W-9** (tax form)
   - **Certificate of Insurance** (general liability + workers' comp; expiration tracked)
   - **Signed Subcontractor Agreement** (provided by Skyeline)

   The existing `SubBidSubmissionForm` already enforces this gate (`w9Filed && insuranceCurrent && agreementSigned` on the user doc). What's missing is the upload UI + the admin verification queue.

3. **Magic-link bid invitations route through the portal.** Email/SMS goes out with a unique `inviteToken` per vendor (`/bid/respond/:token`). The link does NOT skip sign-in — instead:
   - Signed-in sub with portal account → lands on bid response page.
   - First-time recipient → redirected to sign-up funnel with the token preserved in query string. After sign-up + email verification, lands on bid response page. Token validates server-side.

4. **Two bid types, one schema.**
   - `general` — pre-selection. Sub bids on three tiers (Parade / Mid Luxury / Low Luxury). Used when the homeowner hasn't finalized the actual selection yet.
   - `item` — post-selection. Sub bids on the specific selected option (Quartz X from Brand Y).
   
   Both shapes live in the same `bidRequests` collection with `type: 'general' | 'item'`.

5. **Auto follow-up.** When a selection moves from `preselection` → `selected`, a Cloud Function fires a follow-up bid request to subs who gave general bids on that trade. The follow-up references their original tier bid: "You bid $Y at Mid Luxury — the actual pick is Kohler Artifacts. Confirm or update."

6. **Sub visibility into selection progress.** Subs who have an active bid or awarded contract on a given trade can see the *current state* of selections on that trade (read-only). They can NOT see selections on trades they're not involved in.

7. **Award notifications.** When the GC awards a bid, the winning sub receives:
   - SMS (if phone present + Twilio configured)
   - Email
   - In-app push notification (FCM, already wired)

### Three luxury tiers — canonical definitions

Skyeline's positioning: every tier is a **step above basic builder grade.** No Skyeline build is "contractor standard."

| Tier | Description |
|---|---|
| **Parade Home Level** | Showcase / showroom quality. Top-tier brands and detailing. Target buyer: parade-home submission or feature property. |
| **Mid Luxury Level** | Standard luxury benchmark. Recognized luxury brands, semi-to-full custom finishes. Target: typical Skyeline home. |
| **Low Luxury Level** | Step above builder grade. Quality fittings, mid-market premium brands, durable finishes. Distinctly above contractor-standard. |

These descriptions ship in every general bid request UI so subs have a shared vocabulary. Trade-specific rubrics (e.g., "for plumbing, Parade = Brizo/Rohl, Mid = Kohler Artifacts, Low = Moen showroom") are **deferred to Phase 2** — v1 relies on the sub's professional judgment within their trade.

### What's now in scope (Phase 1D)

Slice 1: Magic-link funnel + sub sign-up.  
Slice 2: Three-tier general bid form.  
Slice 3: Sub onboarding upload UI + admin verification queue.  
Slice 4: Auto follow-up + award notifications + selection visibility.

### What's out of scope (Phase 2)

- Trade-specific tier rubrics (Brizo-vs-Moen reference tables per trade).
- Sub-side analytics dashboard (margin tracking, win rate, etc.).
- Sub-to-sub messaging.
- License upload requirement (optional in v1; depends on trade + state).
- Automated COI expiration auto-suspension (manual review for now).

### Resolved sub-decisions (2026-05-24)

- **D-012-a — Tier flexibility.** Sub bids all three by default, with explicit "I don't bid this tier" toggle per tier. **CONFIRMED.**
- **D-012-b — Tier assignment scope.** **Project-level only for v1.** When a project is created, the GC picks one of the three tiers as `project.defaultTier`. All selections inherit. Per-selection override deferred to Phase 2 (only build it when a real project demands it).
- **D-012-c — COI expiration.** Flag in GC dashboard; do not auto-suspend. **CONFIRMED.**
- **D-012-d — Email verification.** Required before viewing bid requests; doc upload + admin verify required to submit. **CONFIRMED.**
- **D-012-e — Token expiration.** Bid due date + 14 days grace. **CONFIRMED.**
- **D-012-f — Tier naming (NEW).** Standardized: **Parade Home Level / Mid Luxury Level / Low Luxury Level.** Every tier ends with "Level" for consistency. Reads cleaner than "Low Level Luxury" which sounded like the *quality* was low.
- **D-012-g — Decline-to-bid (NEW).** Sub can decline the entire project (separate from per-tier declines). GC gets a notification. GC can optionally mark the sub "do not invite to future bids" with one click — that sub stops appearing in invite pickers for new bid requests until manually re-enabled.
- **D-012-h — Manual link review (NEW).** When a new sub signs up and email auto-link fails, system runs a fuzzy match (name similarity + phone match) against existing contacts. If candidates found, creates a `linkReviewQueue` entry. Staff member sees a queue UI, picks one of the suggested matches, creates a brand-new contact, or marks "no match." Sub can use the portal in the meantime — linkage just makes their bid history attribute correctly.
- **D-012-i — Multi-builder portal accounts (NEW).** In the SaaS future, one sub account *could* be used across multiple builders. For v1 (single tenant), don't optimize for this — but **design data shapes so a future `companyId` partition is additive, not a rewrite**. Per D-005 / D-011 defensive multi-tenant principles.

### Cross-reference

- `docs/sub-portal-design.md` — new file. The detailed design.
- `docs/selections-design.md` — D-002 — the four-stakeholder selections flow. The sub portal is the contractor stakeholder's UI.
- `client/src/components/bidding/SubBidSubmissionForm.tsx` — existing compliance gate (`w9Filed`, `insuranceCurrent`, `agreementSigned`). Keep.
- `functions/src/bids/sendBidRequestRoute.ts` — existing email/SMS route. Update `buildBody()` + `buildSms()` to include magic link.
- `functions/src/auth/ensureContactAuth.ts` — existing contact→auth trigger. The sign-up flow is the reverse: auth→contact link.

---

## D-013 — Cost-plus pricing model: 12% / 15% markup + GC review gate

**Decided:** 2026-05-24.
**Touches:** selections, bids, contracts, invoicing, client-facing pricing UI.

### Business model

Skyeline runs a **cost-plus contract**, not a fixed-price contract.

- **Baseline markup: 12%** on all hard costs (subs, materials, sub-bid line items).
- **Markup with internal design: 15%** when Skyeline's internal design team handles **hard design** for the project (selecting cabinetry, finishes, fixtures, tile, lighting, etc. — anything built into the home). The extra 3% covers in-house design labor.
- **Soft design billed separately.** Furniture, drapery, rugs, decor, accent pieces — these are *not* covered by the 15% markup. They're a separate service line item on the contract, priced per scope.

### GC review gate (CRITICAL — changes selections data flow)

When subs respond with bids, **clients do not see raw sub-bid amounts**, ever. The flow is:

1. Sub responds with raw bid amount (e.g., $8,400 at Mid Luxury for plumbing).
2. Bid lands in a **GC review queue**, private to staff. Visible to: gc, admin, projectManager (read), but **NOT** designer, client, or any sub except the one who submitted.
3. GC + internal team review bids, may negotiate, may select a winner or request a new round.
4. GC applies markup (project default `markupRate`, overridable per selection if needed).
5. GC clicks **Publish** on the selection → the marked-up `publishedClientPrice` becomes visible to the client.
6. Client sees only `publishedClientPrice`. The raw `internalCost` and `markupAmount` are never client-visible.

### Data model implications

New / extended fields:

```ts
// projects/{projectId}
{
  ...existing,
  defaultTier: 'parade' | 'midLuxury' | 'lowLuxury',  // D-012-b
  usesInternalDesign: boolean,                         // drives markupRate default
  markupRate: number,                                  // 0.12 by default, 0.15 if usesInternalDesign
  softDesignServices?: Array<{                         // separate line items for client
    label: string,
    description?: string,
    fee: number,
    addedAt: Timestamp,
  }>,
}

// selections/{selectionId}
{
  ...existing,
  internalCost?: number,            // accepted sub bid (raw)
  markupRate?: number,              // copy from project at publish time, or override
  markupAmount?: number,            // computed: internalCost × markupRate
  publishedClientPrice?: number,    // internalCost + markupAmount, LOCKED at publish time
  publishedAt?: Timestamp,          // when GC clicked Publish
  publishedBy?: string,             // uid
  awardedSubId?: string,            // which sub got the contract
  awardedBidResponseId?: string,    // which bid response
}
```

**Lock semantics:** once `publishedClientPrice` is set, it does not change retroactively even if the markup rate is later edited. To change a published price, the GC must explicitly republish (and the new amount overwrites). This is to maintain contract integrity — the client signed for the published number.

### Client-facing UI implications

- **Selections page (client view):** shows item + photo + `publishedClientPrice` only. No tier label visible to client.  Actually — flag for follow-up: does the client see "you chose Mid Luxury" or just the picked product? See D-013-a below.
- **Selections page (GC view):** shows internalCost, markupRate, markupAmount, publishedClientPrice side-by-side. Plus a "Publish to client" button.
- **Contract / final pricing summary (client view):** marked-up totals + soft design line items + grand total. No raw cost visibility.

### Open follow-ups

- **D-013-a — Tier visibility to client.** Does the client see "this is the Mid Luxury option" labels, or are they shown clean product names without tier framing? **Default:** show tier label as soft context ("Mid Luxury tier" badge), since they picked the tier when scoping the build. Worth confirming.
- **D-013-b — Per-selection markup override.** Should the GC be able to set a different markup rate on a single selection (e.g., 20% on a high-risk item)? **Default:** yes, but with explicit UI ("override default 12% on this item — why?"). Build in Slice 4.
- **D-013-c — Markup transparency on the contract.** Does the client-facing contract say "cost-plus 12%" explicitly, or only show the final number? Cost-plus contracts traditionally disclose the percentage. **Default:** disclose the percentage in the contract preamble for legal clarity. Confirm with attorney before first signed contract.
- **D-013-d — Soft design pricing structure.** Hourly? Fixed per room? Percentage of furniture budget? **Deferred to Phase 2** when first project actually engages internal design team for soft.

### Cross-reference

- `docs/selections-design.md` — D-002 — needs an update to incorporate the publish gate + cost vs. published price distinction.
- `docs/sub-portal-design.md` — D-012 — bids land in GC review queue, NOT client-visible.
- New `docs/pricing-design.md` (to write when D-013-a/b/c are resolved) for the full pricing UX.

---

## D-014 — Client Onboarding Wizard (Phase 1E)

**Decided:** 2026-05-24.
**Touches:** project setup, tier defaults, AI rendering studio inputs, designer workflow.

### What

A multi-step wizard at `/client/onboarding/:projectId` the homeowner walks through after Skyeline opens their project. Captures tier qualification, Parade of Homes intent, design inspiration, and Pinterest/external references. Feeds the designer's selection-option curation + the AI Rendering Studio (D-004).

### Steps in the wizard

1. **Welcome + project summary** — confirm address, projected start, GC + designer assigned.
2. **Tier qualification quiz** — questions about budget range, must-haves, finish expectations, lifestyle. System recommends a tier; GC has final say + can override. Sets `project.defaultTier`.
3. **Parade of Homes intent** — yes/no + target show year. Qualification criteria placeholders for v1 (~$300/sqft build cost minimum, $150K furniture budget minimum); Skyeline + Nicole will refine criteria later.
4. **Contract signing** — uses native in-app signature widget (D-015). If contract not yet ready, step shows "in preparation" status.
5. **Design preference photo quiz** — curated photos per category (bathroom, kitchen, great room, primary suite, exterior, finish carpentry, lighting, tile, cabinetry). Client rates love / like / pass / strong-pass. For v1, photos are **AI-generated placeholders** seeded via the AI Rendering Studio (D-004). Skyeline + Nicole will replace with curated real photos in Phase 2.
6. **External inspiration capture** — paste Pinterest URL (stored as link only — Pinterest API integration deferred) + direct multi-image upload, tagged by room/category.
7. **Review + submit** — preview answers, confirm. Notifies designer + GC.

### Data model

- `projects/{projectId}/clientOnboarding/responses` — singleton doc with all wizard answers + completion status. Pause/resume via this doc.
- `projects/{projectId}/inspirations/{id}` — collection of inspiration entries (photo quiz ratings, Pinterest URLs, uploaded images). Tagged by room category + source.
- `inspirationLibrary/{id}` — admin-managed library of curated photos for the preference quiz (v1 seeded with AI-generated placeholders; later replaced by Skyeline's real portfolio).

### Resolved sub-decisions

- **D-014-a — POH criteria.** Placeholder for v1: $300/sqft build cost + $150K furniture budget. Skyeline + Nicole will refine.
- **D-014-b — Photo library source.** AI-generated placeholders for v1 via the existing Rendering Studio pipeline. Skyeline-curated photos Phase 2.
- **D-014-c — Pinterest depth.** URL + manual upload only. No API integration.
- **D-014-d — Wizard pause/resume.** Each step auto-saves; client can leave + return at any step. GC can see partial completion on dashboard.
- **D-014-e — Designer access during wizard.** Designer sees responses in real time once client completes a step (no waiting for full submission). They can start prep work concurrently.

### Cross-references

- `docs/client-onboarding-design.md` (new) — full design.
- D-012 (sub portal) — built in parallel; independent code paths.
- D-013 (cost-plus pricing) — `project.defaultTier` set in step 2 of this wizard.
- D-015 (native signatures) — powers step 4.
- D-004 (AI Rendering Studio) — generates the placeholder library + receives inspirations as future prompts.

---

## D-015 — Native in-app contract signature widget

**Decided:** 2026-05-24.
**Touches:** client contracts, subcontractor agreements, designer agreements. Cross-cutting infrastructure.

### What

A reusable React component + backend audit-trail system for in-app contract signing. Replaces the earlier assumption that contracts would route through DocuSign. Applies to:

- **Client / GC contracts** (custom home build agreements)
- **Subcontractor / GC agreements** (the doc required at sub onboarding per D-012)
- **Designer / GC agreements** (engagement letters for hired designers)

### Architecture

- **Component:** `<SignaturePad />` using `react-signature-canvas` (wraps the mature `signature_pad` library). Captures handwritten signature as PNG on HTML5 canvas.
- **Storage:** signature PNG goes to Firebase Storage at `contracts/{contractId}/signatures/{signerUid}.png`.
- **Contract document:** stored as PDF template at `contracts/{contractId}/template.pdf`. After all parties sign, a Cloud Function generates `contracts/{contractId}/finalized.pdf` with signatures + audit footer overlaid (using `pdf-lib`, already in the package tree).
- **Audit trail:** each signature event captures `{ uid, email, name, signedAt, ipAddress, userAgent, signaturePngStoragePath }` to `contracts/{contractId}/signatures[]` array on the doc.
- **Legal disclosure (ESIGN Act / UETA compliance):** consent-to-electronic-signing screen presented before the first signature, capturing explicit consent into the audit trail.
- **Status machine:** `draft` → `awaiting_signatures` → `partial` → `fully_executed` → (optionally) `voided`.

### Data model

```ts
// contracts/{contractId}
{
  id: string;
  type: 'client_gc' | 'sub_gc' | 'designer_gc';
  projectId?: string;                     // not applicable for sub master agreement
  parties: Array<{
    role: 'client' | 'gc' | 'sub' | 'designer';
    uid: string;
    email: string;
    name: string;
    required: boolean;                    // can the contract be fully executed without them
  }>;
  status: 'draft' | 'awaiting_signatures' | 'partial' | 'fully_executed' | 'voided';
  templatePdfUrl: string;
  finalizedPdfUrl?: string;
  signatures: Array<{
    signerUid: string;
    signerRole: string;
    signedAt: Timestamp;
    ipAddress: string;
    userAgent: string;
    signaturePngStoragePath: string;
    consentToElectronicSigning: boolean;
    consentAt: Timestamp;
  }>;
  createdBy: string;
  createdAt: Timestamp;
  voidedAt?: Timestamp;
  voidedReason?: string;
}
```

### Resolved sub-decisions

- **D-015-a — Library choice.** `react-signature-canvas` (MIT, wraps `signature_pad`).
- **D-015-b — Legal scope.** ESIGN Act + UETA-compliant capture for US contracts. Recommend Tyler discuss with an attorney before first client/GC contract is signed in production — the *technology* is sound but counsel should validate the *process* for high-value custom home builds.
- **D-015-c — Audit trail visibility.** All parties see their own signature timestamps. Full audit trail (including IP, user agent) visible only to gc + admin.
- **D-015-d — Voiding signed contracts.** Allowed only with explicit "Void with reason" admin action. Voided contracts retained as immutable audit record, status flipped to `voided`. New version started as fresh contract doc.

### Cross-references

- D-012 sub onboarding (subAgreement upload → replace with native signing flow once D-015 ships).
- D-014 client onboarding step 4 (contract signing).
- Future `docs/contract-signing-design.md` (TBD when implementation lands).

---

## Index of decisions

| ID | Decision | Doc(s) impacted |
|---|---|---|
| D-001 | `projectManager` is a real, GC-delegate role with explicit permissions matrix | Rules, Cloud Functions, normalizers, role docs |
| D-002 | Selections is a four-stakeholder workflow (GC + designer + contractor + client); multi-option; bid-on-upload; $500/option overage; lock-after-signoff; change-order unlock | `docs/selections-design.md` (rewritten) |
| D-003 | Change orders are first-class (per D-002 lock); minimum scope captured | New `docs/change-order-design.md` (to be written when D-003 enters scope) |
| D-004 | AI Rendering Studio GO with quotas, Claude router, persistence | `docs/ai-rendering-studio-design.md` (new) |
| D-005 | Single-tenant now, multi-tenant Phase 2; avoid hardcoded "Skyeline" strings | `CLAUDE.md`, ingester config |
| D-006 | `AIRenderingStudio.tsx` replaced, not deleted | Cleanup list in open-questions §N updated |
| D-007 | Stripe payment rail needed for paywalls; previous "kill" recommendation revoked | `setup-runbook.md` §J |
| D-008 | ~~AuthContext test-mode bypass — pending separate decision~~ Resolved by D-009 — KILL (gate behind `import.meta.env.DEV`) | `client/src/auth/AuthContext.tsx` |
| D-009 | Batch approval of all recommendations in `docs/open-questions.md` | every domain |
| D-010 | Port the v2 branch (`feat/selections-v2-dashboard-reminders`) into the four-stakeholder model — lands in Slice 4 of selections | `docs/selections-design.md` |
| D-011 | Productization horizon = within 2 years; SaaS vs. self-hosted deferred to ~12-month mark | `CLAUDE.md`, `PROJECT_OVERVIEW.md`, future `docs/multi-tenant-migration-plan.md` |
| D-012 | Subs are first-class users with full portal accounts; required W-9 + COI + agreement; three-tier general bidding (Parade / Mid Luxury / Low Luxury); magic-link funnel routes through sign-up; decline-to-bid + manual link review queue | New `docs/sub-portal-design.md`; `SubBidSubmissionForm.tsx`; `sendBidRequestRoute.ts` |
| D-013 | Cost-plus pricing: 12% baseline / 15% with internal hard design; soft design separate; GC review gate before client-visible publish; `publishedClientPrice` locked at publish | `docs/selections-design.md` (update), new `docs/pricing-design.md` (deferred), project + selection schemas |
| D-014 | Client Onboarding Wizard: tier qualification + POH intent + photo preference quiz + Pinterest/upload + contract sign. AI-generated placeholder library for v1. | New `docs/client-onboarding-design.md`; project schema; new `inspirationLibrary` collection |
| D-015 | Native in-app contract signing widget — replaces DocuSign assumption. Cross-cutting infra used by client/sub/designer contracts. ESIGN/UETA compliant. | `contracts/` collection; new `<SignaturePad />`; finalized PDF generation via `pdf-lib` |

---

## Conflict resolution

If you find conflicting guidance:
1. This file wins.
2. Then per-domain design docs (`docs/selections-design.md`, `docs/ai-rendering-studio-design.md`, `docs/ingestion-lab-schema.md`).
3. Then `CLAUDE.md`, `PROJECT_OVERVIEW.md`, `SESSION_NOTES.md`.
4. Then `CHECKPOINT.md`.
5. Then anything else in the repo.
