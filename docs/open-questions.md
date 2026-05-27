# Skyeline OS — Open Strategic Questions

**Status:** Living doc. Drafted 2026-05-22 against `main` @ `28f9cd0` + branch `feat/selections-v2-dashboard-reminders` @ `6b09bd6`. **Last refreshed 2026-05-22 (decisions D-001 / D-002 / D-003 / D-004 / D-005 / D-006 / D-007 batch).**

**Resolved questions are struck through.** See `docs/decisions.md` for the authoritative answers. Net-new questions raised by the latest batch of decisions are marked **🆕** and grouped at the bottom of each section.

The codebase has made many implicit architectural decisions that haven't been validated. This doc surfaces all of them, grouped by domain. For each question: **why it matters** (one sentence), **recommendation** if we have one, and **cost of getting it wrong**.

---

## A. Selections workflow (now four-stakeholder)

**Authoritative spec:** `docs/selections-design.md`. **Decision record:** `docs/decisions.md` §D-002 + §D-003.

### ~~A1. Are `clientPreference` edits material?~~
**RESOLVED** by D-002 — the new model collapses `clientPreference` into "any party can mark a preference via comments + selectedOptionId proposal." No separate field. Recommendation stands: preferences are non-material; signoffs are the only formal gate.

### ~~A2. Grandfather existing `gcApproved: true` records?~~
**RESOLVED** by D-002 — yes, grandfather. UI badge + per-item "Initiate change order to revise" action. See `selections-design.md` §9.

### ~~A3. Per-field edit gating or fully open editing?~~
**RESOLVED** by D-002 — the four-stakeholder + multi-option + lock-after-signoff model supersedes per-field gating entirely. Pre-lock: any party can edit anything (revision bumps audit). Post-lock: nothing edits except via change order. Edit gating is moot.

### A4. Signoff revocation ripple behavior — **still open.**
**Why it matters:** If I sign off then un-sign, do the other parties' signoffs survive?
**Recommendation:** Treat un-signoff as a material change — invalidate other signoffs.
**Cost of getting it wrong:** "Phantom approvals" where one party silently downgraded.

### ~~A5. Lifecycle simplification.~~
**RESOLVED** by D-002 — collapsed to `active / locked / ordered / received / installed`. See `selections-design.md` §6.

### ~~A6. Admin override.~~
**RESOLVED** by D-002 — GC + admin can sign on behalf of any party AND break a lock without a CO. Required reason. Logged in `revisionHistory`. See `selections-design.md` §7.

### 🆕 A7. Who pays the $500 selection-overage fee, and when?
**Why it matters:** Drives whether we need a real-time payment rail in Slice 1 (Stripe) or can defer to project-close billing.
**Recommendation:** Accrue to project ledger, settle at project close. Simplest to build; matches how clients already pay for everything else.
**Cost of getting it wrong:** Real-time Stripe is months of integration; deferred billing might leave Tyler holding the bag if a client walks.

### 🆕 A8. Does the $500 fee apply when GC adds the 4th option on the client's behalf?
**Why it matters:** Affects UI logic in Slice 1.
**Recommendation:** No — when GC initiates, it's a GC-driven exploration, not client expansion.
**Cost of getting it wrong:** Either Tyler eats unnecessary cost (yes-charge case) or clients game by asking Tyler to add their 4th option (no-charge case).

### 🆕 A9. Is the $500 fee refundable if the client picks one of the 4th+ options?
**Why it matters:** Slice 4 paywall logic.
**Recommendation:** No — the work was getting the bid, not picking it.
**Cost of getting it wrong:** Refund logic adds complexity; not refunding may feel punitive.

### 🆕 A10. Change-order signoff parties — same as the underlying selection, or shorter?
**Why it matters:** Determines whether COs are a meaningful gate or a fast-pass around the signoff guarantee.
**Recommendation:** Same `requiredSignoffs` as the underlying selection.
**Cost of getting it wrong:** Shorter CO signoff = back door around the agreement everyone made.

### 🆕 A11. On option upload with no preferred vendor for that category — what happens?
**Why it matters:** Affects Slice 1 UX. Options: notify GC to pick manually before the bid request fires; auto-create a "no vendor" placeholder; block the upload entirely.
**Recommendation:** Notify GC; place option in `bidRequestStatus: 'no_vendor'`; allow upload to proceed so the option is visible.
**Cost of getting it wrong:** Blocking frustrates users; auto-firing to nobody leaves the option in zombie state.

### 🆕 A12. Multiple contractors bidding on the same option — okay by default?
**Why it matters:** Some categories have multiple preferred vendors; we may want all to bid for price comparison.
**Recommendation:** Yes, allow. Lowest qualifying bid auto-flagged as recommended.
**Cost of getting it wrong:** Locking to one bidder per option loses competitive pricing.

### 🆕 A13. Sub portal — keep at "bid requests only" or expose the selection when sub has a bid open?
**Why it matters:** Sub experience when they get a bid request — do they see only the request, or can they see the full option + its context?
**Recommendation:** Expose minimal read of the option they're bidding on (so they understand specs); keep the full selection thread GC/designer/client-only.
**Cost of getting it wrong:** Sub bids blind; misquotes; rework.

### 🆕 A14. Existing `changeOrders` collection — interop with selection COs, or separate collection?
**Why it matters:** A `changeOrders` collection already exists for the contracts module (`ChangeOrderRequestModal.tsx`). Reusing it requires unifying schema.
**Recommendation:** Audit existing usage first (Slice 2 work). If schemas don't conflict badly, unify. If they do, use `selectionChangeOrders`.
**Cost of getting it wrong:** Either duplicate concepts or merge conflicts during migration.

### 🆕 A15. Overage paywall warning frequency.
**Why it matters:** Show on every option add past 3, or only the first?
**Recommendation:** Show once per selection. Recurring warnings feel like nagging.
**Cost of getting it wrong:** Too noisy → ignored; too quiet → client surprised at project close.

### 🆕 A16. `requiredSignoffs` editability — invalidate existing signoffs on change?
**Why it matters:** GC adds an extra required signer mid-iteration — do prior signoffs reset?
**Recommendation:** No. Only the newly-added party needs to sign. Existing signoffs survive.
**Cost of getting it wrong:** Resetting feels punitive; not resetting could let GC sneak in a party who didn't see the spec at signoff time.

### 🆕 A17. GC self-signoff vs. override.
**Why it matters:** When GC adds themselves to a selection's `requiredSignoffs` (atypical but allowed), does GC's signoff use the formal `gc` slot OR does the override pathway always work in parallel?
**Recommendation:** `gc` slot is the formal record; override is for crisis only.
**Cost of getting it wrong:** Two paths into the same outcome confuses audit trail.

### 🆕 A18. Sub onboarding for the new bid request flow.
**Why it matters:** When a sub receives an auto-bid-request triggered by option upload, what's their landing experience? Today the sub portal opens to a bid request list; the new flow needs the request to clearly link "Bid for selection X, option Y, project Z."
**Recommendation:** Surface in `SubBidRequestsTab` with the contextual fields. Add a sub-portal section "Selection bids" if these become frequent.
**Cost of getting it wrong:** Sub doesn't understand the context, sends back an unrelated bid.

---

## B. Selections v2 branch reconciliation

### B1. Does the v2 branch (`feat/selections-v2-dashboard-reminders`, `6b09bd6`) ship in any form, or is it abandoned?
**Why it matters:** ~3k lines of UX (dashboard tile, banner, in-app notification center, NotificationPreferences page, designer recommendation panel, daily reminder Cloud Function) is sitting in a branch. The portable parts are valuable; the parts coupled to `clientApprovalStatus` need rework.
**Recommendation:** Port forward. Per-component verdict already in `three-party-selections-design.md` §4 — ~70% lands unchanged. The pieces that flip `clientApprovalStatus = 'Checking w/ Client'` need replacing with revision/signoff logic.
**Cost of getting it wrong:** Abandoning loses a daily-reminder Cloud Function the client portal needs to function as a "real" portal (otherwise users only see things when they remember to log in). Force-merging breaks the contractor-signoff model.

### B2. Daily reminder cadence and content.
**Why it matters:** The v2 branch has `scheduledSelectionRemindersDaily` running at 8am MT. Once three-party, who gets reminded about what?
**Recommendation:** Per-party digest, "Here are N selections waiting on your signoff plus M waiting on someone else." Overdue items also fire SMS to all three parties. Once-daily; collapse to per-week after first 30 days if data shows over-notification.
**Cost of getting it wrong:** Too noisy → users tune out; too quiet → selections stall for weeks.

---

## C. AI features

### C1. AI Bill OCR — final scope. **Still open.**
**Why it matters:** Callable `analyzeBill` works today (Claude Sonnet vision; extracts vendor, invoice #, date, amount, line items). What's the next layer: line-item GL auto-categorization, vendor matching against Contacts, duplicate detection?
**Recommendation:** Ship as-is for one sprint, instrument what humans correct, prioritize next layer based on real correction patterns.
**Cost of getting it wrong:** Speculative builds waste cycles.

### C2. AI Estimate Drafter — build, defer, or kill? **Still open.**
**Why it matters:** No code yet. Big lift; high payoff for a builder.
**Recommendation:** Build, but after the Ingestion Lab first run.
**Cost of getting it wrong:** Building now means designing prompts in a vacuum.

### ~~C3. AI Rendering Studio — kill, ship existing backend, or rebuild?~~
**RESOLVED** by D-004 — **GO**, with client/designer/GC quotas, paywall, Claude routing. Full spec at `docs/ai-rendering-studio-design.md`. The dead `AIRenderingStudio.tsx` is replaced (not deleted) per D-006.

### C4. Ingestion Lab tuning — go/no-go on first ingestion? **Still open.**
**Why it matters:** Lab is codebase-complete but never run against real data. Session 13's stated work.
**Recommendation:** Do operator setup (`setup-runbook.md` §G) and run the first ingestion this week.
**Cost of getting it wrong:** Building Mac scripts and threshold tuning blind means doing it twice.

### ~~C5. AI provider strategy — consolidate?~~
**RESOLVED** by D-004 — keep multi-provider. Anthropic for text/router; OpenAI + Replicate for image gen; Adobe Firefly considered for commercial-safe outputs (see C13 below).

### 🆕 C6. Claude router prompt design.
**Why it matters:** The router is the AI brain of the rendering feature. First-draft prompt needs few-shot examples (interior modern → FLUX, traditional warm-wood → DALL-E, etc.).
**Recommendation:** Write alongside Slice 1; iterate from real prompts after first 50 renderings.
**Cost of getting it wrong:** Bad routing = bad renderings = client doesn't trust the tool.

### 🆕 C7. Room vs. wall — who picks?
**Why it matters:** Affects quota math + provider choice.
**Recommendation:** UI picker; Claude suggests a default based on prompt context.
**Cost of getting it wrong:** Auto-picking the wrong type spends a client's room quota on what they wanted as a wall close-up.

### 🆕 C8. Rendering deletion semantics.
**Why it matters:** Audit, ownership, lifecycle.
**Recommendation:** Client soft-delete only (hidden, still in storage); GC hard-delete; designer soft-delete.
**Cost of getting it wrong:** Hard-delete by client = lost audit trail; soft-delete-only = storage bloat.

### 🆕 C9. Re-roll same prompt counts as iteration.
**Recommendation:** Yes — counts against the 10-iteration-per-room cap. Otherwise iteration cap is meaningless.

### 🆕 C10. If client stops paying, do they lose access to prior renderings?
**Recommendation:** No — they keep what was paid for. Only new generations blocked.

### 🆕 C11. Designer default quota.
**Recommendation:** 20 renderings/project. GC can adjust per-designer via settings UI.

### 🆕 C12. Designers gifting their quota to clients.
**Recommendation:** Skip for v1; adds complexity for marginal use case.

### 🆕 C13. Adobe Firefly / commercial-safe outputs.
**Why it matters:** DALL-E and FLUX outputs have ambiguous commercial-use rights. Firefly is trained on Adobe-licensed content with explicit commercial-use guarantee.
**Recommendation:** Provision Firefly only if Skyeline plans to use renderings in print collateral, Instagram tagging Skyeline as creator, or for-sale marketing materials.
**Cost of getting it wrong:** Skip Firefly + run into licensing pushback = pull all materials. Add Firefly speculatively = unused secrets + budget.

### 🆕 C14. Selection-driven auto-rendering.
**Why it matters:** When a selection locks, should the system offer to auto-generate a rendering using the locked spec?
**Recommendation:** Optional CTA on lock event — "Generate a rendering of this locked spec?" One-click; uses default style; counts against quota.
**Cost of getting it wrong:** Surfacing forcibly = annoying; never surfacing = miss the moment of natural integration.

### 🆕 C15. Provider outage fallback.
**Why it matters:** If OpenAI is down today, the request fails. Should the router retry with another provider?
**Recommendation:** Yes — if the chosen provider 5xxs or times out, retry once with the next-best provider for that style. Log both attempts; don't double-charge.
**Cost of getting it wrong:** Single-point-of-failure UX for what should be a graceful service.

### 🆕 C16. Custom domain / share links for renderings.
**Why it matters:** Clients may want to share renderings with friends/family for input.
**Recommendation:** Build a tokenized share-link mechanism (signed URL with expiration). No watermarking for v1.
**Cost of getting it wrong:** Either no sharing (lost word-of-mouth) or unsigned URLs (leaks).

---

## D. Roles + access control

### ~~D1. Is `projectManager` a real role, or accidental?~~
**RESOLVED** by D-001 — **real role, GC delegate.** Permissions matrix at `docs/decisions.md` §D-001. Carve-outs: cannot do billing/payment writes, cannot sign off as GC, cannot break selection locks. Implementation tasks documented in the decision; not yet executed.

### 🆕 D1-a. Multiple PMs on a project — any conflict behavior?
**Why it matters:** Two PMs editing the same selection simultaneously.
**Recommendation:** No special collision handling. Both edit; revision counter + audit trail records who.
**Cost of getting it wrong:** Heavyweight conflict resolution is overkill at single-tenant scale.

### 🆕 D1-b. Can a PM create new sub contacts?
**Why it matters:** PM needs this to manage subs effectively.
**Recommendation:** Yes, auditable.
**Cost of getting it wrong:** Saying no forces every new sub through Tyler's bottleneck.

### 🆕 D1-c. Can a PM grant another user portal access?
**Recommendation:** No. Settings/user-mgmt action; GC + admin only.

### 🆕 D1-d. Does `pending_pm` exist as a pre-approval state?
**Recommendation:** No. PMs are added by GC directly; never self-signup.

### D2. `sub` vs. `subcontractor` — pick one.
**Why it matters:** Two strings used as aliases everywhere. RoleGuard accepts both for the sub portal route. Normalizers convert one to the other inconsistently.
**Recommendation:** `sub` everywhere. Shorter, what Firestore rules already use (`isSub()`), and what Cloud Functions write by default. Refactor `subcontractor` → `sub` and remove the alias.
**Cost of getting it wrong:** Continued inconsistency = continued normalizer divergence = more bugs.

### D3. `pending_team` dead role.
**Why it matters:** Cloud Function writes this role when a contact has role `team` or `employee`, but **no UI recognizes it**. Users in this state have no portal — they can sign in and see nothing.
**Recommendation:** Either (a) make `pending_team` first-class with its own pending-approval screen + admin-approves flow, or (b) drop the write and route those contacts to `pending_gc` (existing screen handles them).
**Cost of getting it wrong:** Real users get stuck (this isn't theoretical — anyone who joins as `team` or `employee` lands here).

### D4. Designer vs. client vs. contractor — anyone read-only?
**Why it matters:** Real-world stakeholders sometimes need view-only access — a spouse, a lender, an architect, a project investor. None exists today.
**Recommendation:** Defer. Build read-only `observer` role only when the second user asks for it.
**Cost of getting it wrong:** Building it speculatively adds complexity to every rule and route; not building it forces awkward workarounds (share a client account, dump PDFs).

### D5. Role refactor scope — clean up to 7 roles, or live with 20 strings?
**Why it matters:** `ROLE_AUDIT.md` proposes a 6-phase migration to admin / gc / projectManager (maybe) / client / sub / designer / pending. The current state has 20 distinct role strings, 4 parallel `UserRole` types, 5 disagreeing normalizers.
**Recommendation:** Refactor. The current state has at least one latent privilege bug (D1) and one dead-letter state (D3). Do this BEFORE shipping three-party selections so the new code uses the clean taxonomy.
**Cost of getting it wrong:** Building three-party on top of 20-string chaos means three-party logic also has to handle every alias.

### D6. Admin override semantics.
**Why it matters:** Admin sees everything, but should admin be able to *act as* another party (sign off as client, edit as designer)? Test-mode bypass at `AuthContext.tsx:70-95` already does this via localStorage for dev — should it be a real product feature with auditability?
**Recommendation:** Yes, with explicit logging. Useful for stuck workflows and customer support. Build an "Acting as <user>" banner so admin never forgets they're impersonating.
**Cost of getting it wrong:** Hidden impersonation = invisible audit trail = trust loss with clients.

---

## E. Multi-tenancy / single-org

### ~~E1. Will Skyeline OS ever host a second builder?~~
**RESOLVED** by D-005 — **single-tenant now, multi-tenant Phase 2.** Productization is a real future possibility but not imminent. Don't pre-build org separation. DO avoid hardcoded "Skyeline" / "skyelineos" strings in places that would make extraction painful later. Audit + cleanup tasks captured in D-005.

### 🆕 E1-a. Date target for productization?
**Why it matters:** Within-2-years horizon means new collections should at least *consider* tenant scoping. 5+ years means don't bother.
**Recommendation:** Pending user input.

### 🆕 E1-b. SaaS-hosted by Tyler, or self-hosted per builder?
**Why it matters:** Big architectural difference — SaaS forces multi-tenant; self-hosted lets each instance stay single-tenant indefinitely.
**Recommendation:** Pending user input. SaaS is the obvious product play (Tyler runs platform, charges monthly). Self-hosted is simpler to ship but harder to support.

### E2. Hardcoded project IDs.
**Why it matters:** Ingestion Lab has Giboney + Christensen Drive folder IDs baked in (`functions/src/ingestionLab/driveIngester.ts`). New projects don't get ingested. This is fine for the spike but breaks every subsequent project.
**Recommendation:** Move folder IDs into `ingestion_lab/config.driveFolders` so adding a project = one Firestore write. Defer to Session 13 if the first ingestion's results justify keeping the lab.
**Cost of getting it wrong:** Every new project requires a code change + redeploy to be ingested.

---

## F. Sub portal — scope intentionality

### F1. Is the sub portal's 10-tab depth (`dashboard / bid-requests / bids / contracts / schedule / compliance / invoices / purchase-orders / progress-photos / messages`) what we actually want a sub to do?
**Why it matters:** A sub today is asked to view bid requests, submit bids, sign contracts, check schedule, upload compliance docs, see invoices, see POs, upload progress photos, message. That's a lot. Real subs may abandon the portal if it's too heavy.
**Recommendation:** Talk to one real sub at Skyeline. Watch where they get stuck. The current surface is generous — trim by half if the user-test says so. Most subs I've ever talked to use 2-3 surfaces (bid in, schedule, get paid).
**Cost of getting it wrong:** Over-built portal = subs revert to texting + email; under-built = friction with the ones who'd use it.

### F2. Document upload UI is "Coming Soon" (`SubcontractorPortal.tsx:502`).
**Why it matters:** Subs can be SENT documents but can't upload them back. Limits the contract counter-signature loop and the COI / W-9 / lien-waiver workflow.
**Recommendation:** Ship it. Same Storage rules as `bills/` (any authed user). Filename-based metadata. Bind to the sub's contract doc.
**Cost of getting it wrong:** Subs continue emailing files to Tyler, who's the bottleneck.

### F3. Compliance gate is client-side only — bypassable.
**Why it matters:** `PROJECT_OVERVIEW.md` flags this: a sub can submit a bid past the compliance gate via direct Firestore write. Real exposure.
**Recommendation:** Mirror the gate in Firestore rules (deny `bidSubmissions.create` unless contact's compliance docs are all present and unexpired). Add a Cloud Function backup that rejects writes that bypass the rule.
**Cost of getting it wrong:** A motivated sub bypasses, you lose your audit defense.

---

## G. Notifications

### G1. Channel × event matrix — what fires what?
**Why it matters:** Today the dispatcher fans out to email + SMS + push, with per-kind opt-in/out. But the kinds are an ad-hoc list (`task_assigned`, `task_due`, `walkthrough_assigned`, plus the v2 branch's `designer_recommendation` etc.). No central registry, easy to drift.
**Recommendation:** Define a notification event catalog (markdown table) with: event name, what fires it, default channels (email/SMS/push), default opt-in state per role. Codify into a `shared/notifications-catalog.ts` enum.
**Cost of getting it wrong:** Inconsistency — some events SMS by default, some don't, no one knows which without reading source.

### G2. Digest vs. real-time.
**Why it matters:** Real-time push for task_assigned makes sense; real-time push for "designer added a comment" is annoying. The v2 branch has daily digest for reminders; the rest is real-time.
**Recommendation:** Real-time for *direct action requests* (you've been asked to do something, decision required). Daily digest for *FYI / status* (designer commented, contractor signed off, photo added). Per-event default; user can override.
**Cost of getting it wrong:** Notification fatigue → users turn it all off → product loses its glue.

### G3. SMS opt-in default — off (current) or on?
**Why it matters:** SMS costs money (Twilio per-message). Current default is `sms: false` on `notificationPrefs`. Users have to actively opt in.
**Recommendation:** Keep default off. Make it easy to opt in from the NotificationPreferences page. Reserve SMS for "stuff that's overdue and the client hasn't seen the email."
**Cost of getting it wrong:** Default-on = Twilio bill surprise + user annoyance; default-off = some critical alerts get missed.

### G4. Who gets bid-update emails when a sub submits/changes a bid?
**Why it matters:** The bidding flow fires several events. Designers and clients shouldn't get notified about every bid that comes in for every trade.
**Recommendation:** GC + project manager only. Bid-related notifications are operational, not stakeholder.
**Cost of getting it wrong:** Client portal floods with "Plumber Joe updated his bid" messages, which means nothing to them.

---

## H. Document handling

### H1. Storage backend.
**Why it matters:** Today everything is Firebase Storage with permissive rules (`any authenticated user can read/write` for `projects/*`, `subTakeoffs/*`, `site-logs/*`, `bills/*`, `content/*`). This is *too permissive* — a subcontractor can read every project's bills.
**Recommendation:** Tighten Storage rules to match Firestore. `bills/*` reads gated by GC + project access; `site-logs/*` gated by project access; `subTakeoffs/*` gated by the contact ID embedded in the path. The current "any authed" was a "we'll fix it later" decision.
**Cost of getting it wrong:** Real PII / financial exposure if a sub knows another project's filename.

### H2. Retention.
**Why it matters:** No retention policy exists. When a project completes, all its docs sit in Storage forever. Storage costs scale with everything ever uploaded.
**Recommendation:** Define a project-completion archive rule: move docs to a `archive/` prefix with longer-term-storage class (Coldline) after 12 months past `completedAt`. Hard delete after 7 years (typical construction record retention).
**Cost of getting it wrong:** Storage cost grows unboundedly; legal retention may be required.

### H3. Contract signing flow — DocuSign integration, in-house e-sign, or upload-the-signed-PDF?
**Why it matters:** Today the contract editor accepts an upload of a signed PDF (`signedDocumentUrl`). No native signature gathering.
**Recommendation:** Stay with upload-signed-PDF for v1. DocuSign integration is a real lift (OAuth, embedded signing, status callbacks) that's only worth doing if Tyler is sending many contracts/month and wants to remove the round-trip.
**Cost of getting it wrong:** Over-build means months of integration work for a feature that gets used 5x/year; under-build means Tyler manually emails contracts to clients with HelloSign or similar.

### H4. Allowed file types and size limits.
**Why it matters:** Today, anything authenticated, any size. Risk: someone uploads a 4GB video to `bills/`.
**Recommendation:** Storage rules enforce: bills + contracts = PDF/JPG/PNG ≤25MB. site-logs + photos = JPG/PNG/MP4 ≤100MB. content = same as site-logs.
**Cost of getting it wrong:** Storage cost spikes; UI hangs on huge file uploads.

---

## I. Financial flow

### I1. Where is the "bid → estimate → contract → invoice → payment" canonical flow documented?
**Why it matters:** Components exist for each step (`PortalBidsPanel`, `EstimateBuilder`, `ContractEditor`, `AutomatedInvoiceManagement`, `PaymentProcessingCenter`) but the **transitions between them are not enforced** by data — an estimate isn't required to come from a bid, a contract isn't required to come from an estimate. Soft links only.
**Recommendation:** Document the canonical happy-path and write a `progressUtils`-style helper that derives "what state is this project in financially" from the actual docs. Then surface mismatches (estimate that didn't come from any bid, invoice without an underlying contract).
**Cost of getting it wrong:** Auditing the financials of any one project becomes a manual hunt.

### I2. Stripe — is payment processing actually in scope? **REOPENED.**
**Previously recommended kill.** Now reopened by D-007 — we need a payment rail for the $500 selection-overage fees AND for the AI Rendering Studio paywall ($500/room, $250/wall). Tyler still doesn't take credit cards for contract payments — but small fees like these are exactly the Stripe use case.
**Recommendation update:** Don't kill the existing UI. Plan for Stripe integration in Slice 4 (after core selections + rendering data models are in place). See D-007-a/b/c for sub-questions.

### 🆕 I2-a. Real-time charge or accrue-and-settle?
**Why it matters:** Real-time = Stripe SetupIntent + card-on-file flow + webhooks. Accrue = add line to project at close. Massive build-complexity difference.
**Recommendation:** Accrue and settle at project close for Phase 1. Add real-time later if clients ask for it.
**Cost of getting it wrong:** Real-time is months of work; accrue may leave Tyler holding the bag if client disappears.

### 🆕 I2-b. If real-time: card-on-file (SetupIntent) or per-request (PaymentIntent)?
**Why it matters:** SetupIntent = one-time card capture, then frictionless future charges. PaymentIntent = re-enter card each time. UX vs. data-sensitivity tradeoff.
**Recommendation:** SetupIntent. Card on file at project start; small charges happen without re-entry.

### 🆕 I2-c. Who confirms before the card is hit — client or GC?
**Recommendation:** Client confirms (since it's the client's card and the client's overage). GC can override / waive (no charge) per their discretion.

### I3. QBO sync — OAuth-only or two-way?
**Why it matters:** QBO has OAuth `/qbo/oauth/start` + `/callback` routes; no actual sync code exists. Per `PROJECT_OVERVIEW.md`: "invoices/bills/journal entries don't flow between Skyeline and QuickBooks yet."
**Recommendation:** Decide what flows and which direction. My recommendation: Skyeline → QBO one-way only (push invoices + bills as they're created; never read from QBO). Two-way invites reconciliation bugs.
**Cost of getting it wrong:** No sync = double data entry; two-way sync = drift bugs forever.

### I4. Draw schedule + retainage.
**Why it matters:** ContractEditor has draws + retainage fields. There's a `draws/` subcollection under projects. Draw release workflow ("contractor requests draw, lender approves") is unclear.
**Recommendation:** Document the workflow before building. Likely: contractor flags a draw "ready for inspection," client (or lender) approves, draw moves to "released."
**Cost of getting it wrong:** Building this without a clear workflow = features that go unused because the real-world process diverges.

---

## J. Mobile + push

### J1. Native iOS/Android app, or responsive web only?
**Why it matters:** FCM web push is built (service worker + VAPID + EnablePushButton). No Capacitor / React Native / Expo. Field photos go through the iOS Safari camera capture (`<input type="file" capture="environment">`).
**Recommendation:** Responsive web + add-to-home-screen for one more year. If Tyler's subs start saying "I want a real app icon" or push reliability matters on iOS (Safari throttles aggressively), revisit. Capacitor is the easy on-ramp.
**Cost of getting it wrong:** Going native too early = duplicate codepath for limited gain; staying web too long = iOS push reliability becomes a real pain point.

### J2. Offline support.
**Why it matters:** Job sites have poor connectivity. Today the app is online-only.
**Recommendation:** Defer until someone complains. Firestore SDK has offline persistence built-in; turning it on is one flag. UX changes (queueing photo uploads, showing pending state) is bigger work.
**Cost of getting it wrong:** Subs in the field walk away from the portal because it doesn't work in the basement.

---

## K. Reporting and PDF export

### K1. Which reports actually get used?
**Why it matters:** `Financials.tsx:305` shows "Financial reporting features coming soon..." today. Several other report-ish features (PDF export from DocumentTemplateEditor, dependency network diagram from UltimateTimelineBuilder, advanced analytics) are placeholders.
**Recommendation:** Don't build until requested. Ask Tyler what he prints / sends to clients / emails to the bank. Build those three things. Everything else is feature lust.
**Cost of getting it wrong:** Half-built reporting suite that no one uses.

### K2. Audience for reports.
**Why it matters:** Client-facing reports look different from internal-ops reports.
**Recommendation:** Separate "Client-facing report" (clean PDF, brand colors, no internal cost data) from "Internal report" (everything, ugly is fine).
**Cost of getting it wrong:** Accidentally sending the internal report to the client.

---

## L. Testing + CI

### L1. Is zero unit tests acceptable for the foreseeable?
**Why it matters:** `npm run check` runs `tsc` only. `npm run test:smoke` runs one Playwright script (`smoke-lumber.mjs`). No Jest/Vitest, no PR-gating tests, no CI runs on push.
**Recommendation:** Add a minimal Playwright smoke suite that covers: sign in, create project, send bid request, sub claims + submits bid, GC awards. Run on push via GitHub Actions. Defer unit tests. The smoke suite catches 80% of regressions for 20% of the effort.
**Cost of getting it wrong:** Every refactor risks silently breaking a flow. The bigger the app gets, the more this hurts.

### L2. Test data lifecycle.
**Why it matters:** `tester@gmail.com` user exists in Firebase Auth, dangling. Test accounts (`testgc@skyelineos.com` etc.) are documented in CHECKPOINT.md.
**Recommendation:** Either commit to a test-data seed-and-clean script that runs nightly, or accept that the prod database has test users and label them clearly (`testAccount: true` flag on user doc).
**Cost of getting it wrong:** Test data shows up in production reports.

---

## M. Data lifecycle

### M1. Project completion — archive, delete, read-only?
**Why it matters:** When a project completes (move-in done, warranty period over), what happens to the data? Today it stays fully editable forever.
**Recommendation:** Read-only after `status: 'completed'`. Enforce via Firestore rule. Anyone with access can still read; only admin can edit.
**Cost of getting it wrong:** Accidental edits to a completed project's docs years later create audit nightmares.

### M2. Client off-boarding.
**Why it matters:** Client portal access today is gated by `clientId` on the project. When the client moves in + the warranty ends, does access continue indefinitely?
**Recommendation:** Continue until the client requests removal. Their data is theirs; keep it visible. Just stop sending notifications.
**Cost of getting it wrong:** Either feels stingy (cut off) or noisy (continuing alerts about projects long done).

### M3. Sub / vendor off-boarding.
**Why it matters:** A sub who hasn't been used in 18 months still has portal access and a contact record.
**Recommendation:** Auto-mark contacts as `inactive` after 18 months of no project association. Inactive contacts don't appear in bid-request recipient lists but can be reactivated by tagging them onto a new project.
**Cost of getting it wrong:** Recipient picker becomes unusable as years of inactive subs accumulate.

---

## N. Stale things to delete

These are real cleanup items already identified during audit. Each is safe to delete; none affect production. **Recommendation: do these in a single cleanup commit before three-party Slice 1.**

1. **`BuildTrackerPro-Complete-Fixed.tsx`** (127k) and **`BuildTrackerPro-Complete.tsx`** (34k) at the repo root — orphan files. Not imported anywhere. **162k lines of dead code.**
2. **`site-log-preview.html`** at the repo root — dev artifact.
3. **`client/src/App-full-no-auth.tsx`** and **`client/src/App-minimal.tsx`** — App variants no longer used.
4. **`client/src/pages/ClientPortal.tsx`** — legacy client portal, unrouted. `SkyelineClientPortal` is the live one.
5. **`client/src/pages/Accounting.tsx`**, **`FinancialManagement.tsx`**, **`ProjectFinancialsPage.tsx`**, **`ProjectsOverview.tsx`**, **`Trades.tsx`** — unreferenced page files.
6. **`client/src/pages/LoginPage.tsx`** — `App.tsx` no longer imports it (only `PortalLogin` and the inline `sign-in` route). Confirm dead before delete.
7. **`client/src/pages/TimelineBuilder.tsx`** — confirm unrouted (search showed no references but App.tsx has a `/timeline` route — verify which component renders there before deleting).
8. ~~**`client/src/components/designer/AIRenderingStudio.tsx`**~~ — **REPLACE, not delete** (per D-006). The file becomes the entry point for the real Studio per `docs/ai-rendering-studio-design.md`.
9. **`drizzle.config.ts`** at root — config for the deleted Drizzle/Postgres server.
10. **`.env.example`** — still labeled "Odyssey Environment Configuration"; contains Postgres / Drizzle / JWT / AWS / SMTP vars that no longer apply. **Rewrite from scratch using `setup-runbook.md`.**
11. **4 logo files** (`client/public/logos/logo-dark.png`, `logo-light.png`, `logo-transparent-cropped.png`, `logo-transparent.png`) — appear deleted in this session's working tree per a Cowork sync issue; confirm on local checkout that they're actually present, then assess whether all 4 are referenced (likely a couple are stale variants).
12. **`tester@gmail.com`** user in Firebase Auth — flagged in old CHECKPOINT; delete via Firebase Console.
13. **`shared/types.ts:240` duplicate `UserRole`** — identical to `shared/auth-types.ts:16`. Pick one. (Part of D5 role refactor.)

### N1. Anything else?
**Recommendation:** Run `npx ts-prune` (or similar) to find every unused export. The audit above is the obvious stuff; ts-prune catches the rest.
**Cost of getting it wrong:** Dead code piles up faster than it's deleted; future sessions waste context reading it.

---

## O. Architectural decisions that look load-bearing but unvalidated

### O1. **One big Express api function.** All backend HTTP routes fold into a single Cloud Function (`functions/src/index.ts`, 2,040 lines) because org IAM blocks creating new public Cloud Run services. This is a *constraint*, not a choice — but it's load-bearing: the function will eventually hit Cloud Functions' 2nd-gen size + cold-start limits. Plan for the moment when it has to be split (likely by namespace: `api`, `apiIngestion`, `apiBilling`). Not urgent but should be in the roadmap.

### O2. **No companyId on any doc.** Single-tenant assumption baked into every collection. See E1.

### O3. **Test-mode bypass in `AuthContext.tsx:70-95`** injects fake admin user from localStorage. Dev convenience. If this code path ships to a production build (it does — `import.meta.env.PROD` doesn't gate it), any user with browser console access can grant themselves admin by setting two localStorage keys. **Real security exposure.** Recommendation: gate this behind `import.meta.env.DEV` immediately.

### O4. **Firebase Hosting + Storage public-by-default.** Storage rules grant `any authed user → read+write` to `projects/*`, `subTakeoffs/*`, `site-logs/*`, `bills/*`, `content/*`. Firestore rules are much tighter. The two layers are out of sync. See H1.

### O5. **`tsconfig.json` excludes `functions/**/*`.** Root `tsc` doesn't see Cloud Function code. Functions has its own tsconfig that runs during predeploy. Fine in principle but means `npm run check` is a *partial* type check. Document this clearly so no one thinks they have full coverage.

### O6. **Wouter routing.** Lightweight (~2kb) vs. React Router. Fine for the current scale; if we add nested layouts or want code-split per route segment, may need to revisit. Not urgent.

### O7. **DHtmlx Gantt licensed properly?** The schedule module uses `@daypilot/daypilot-lite-react` (free) AND `dhtmlx-gantt` (commercial). The legacy code path imports DHtmlx in a few places. Is the DHtmlx license paid? Free for non-commercial use only. Check now before legal issue.

### O8. **Anthropic key was sent over WhatsApp once.** Per old CHECKPOINT pending list (item 7). Still hasn't been rotated. **Recommendation: rotate this session.**

### O9. **`firestore.rules` is 22,846 chars (1 file).** Single file is fine but it's getting big. Rules-language doesn't support import/include. If it ever crosses ~50KB, performance starts mattering. Watch.

### O10. **Cost monitoring.** No budget alerts set on the Firebase project. Ingestion Lab has a $5/day cap on Anthropic spend (good). Other AI calls (image gen, bill OCR) have no cap. SendGrid + Twilio have no cap. **Set per-service budget alerts in Google Cloud + the vendor consoles.**

---

## P. Roadmap framing (for the build-for-weeks-at-a-time stretch)

### P1. What ships first?
**Recommendation order** (sequenced for minimum thrash):

1. **Cleanup pass** (§N + §O3 + §O8) — half a day. Unblocks everything by deleting noise and closing security holes.
2. **Role refactor (D5)** — 1-2 days. Land before three-party so the new code uses the clean taxonomy.
3. **Three-party selections Slice 1** (data model + signoff CTAs only, no comments, no migration) — 2-3 days.
4. **Three-party Slice 2** (comments) — 1-2 days.
5. **Three-party Slice 3** (migration + legacy grandfathering) — 1 day.
6. **v2 branch port** (dashboard tile, banner, in-app notification center, reminder Cloud Function) onto three-party — 2 days.
7. **Operator setup runbook** (see `setup-runbook.md`) — half a day operator work, anytime.
8. **First Ingestion Lab run + prompt tuning** (C4) — 1 day, blocks Mac iMessage/iCloud script work.
9. **Storage rules tightening** (H1) — 1 day.
10. **Smoke test suite** (L1) — 1-2 days. Optional but pays back fast.

### P2. What should explicitly NOT be built in this stretch?
**Recommendation list** (so we don't get pulled sideways):
- Native mobile app (J1)
- DocuSign integration (H3)
- AI Estimate Drafter (C2) — wait for Ingestion Lab signal
- Multi-tenancy (E1)
- Read-only observer role (D4)
- Stripe payment processing (I2) — kill the broken UI for now
- DHtmlx Gantt → alternative migration (O7) — unless licensing forces it
- Unit test framework (L1) — smoke suite is enough

---

## Tally (updated 2026-05-22 post-decisions batch)

| Domain | Open questions | Resolved this round |
|---|---|---|
| A. Selections (four-stakeholder) | 13 (was 6) — A4 + 12 new (A7–A18) | A1, A2, A3, A5, A6 |
| B. v2 branch | 2 | none (B1 still open, re-framed in report) |
| C. AI features | 13 (was 5) — C1, C2, C4 + 10 new (C6–C16) | C3, C5 |
| D. Roles | 9 (was 6) — D2, D3, D4, D5, D6 + 4 new (D1-a/b/c/d) | D1 |
| E. Multi-tenancy | 2 — E2 + 2 new (E1-a/b) | E1 |
| F. Sub portal | 3 | none (F1, F2, F3 still open) |
| G. Notifications | 4 | none |
| H. Documents | 4 | none |
| I. Financials | 6 (was 4) — I1, I2 reopened + 3 new (I2-a/b/c), I3, I4 | none |
| J. Mobile | 2 | none |
| K. Reporting | 2 | none |
| L. Testing | 2 | none |
| M. Lifecycle | 3 | none |
| N. Stale code | 12 (was 13) | N8 (AIRenderingStudio replace not delete) |
| O. Architecture | 10 | none |
| P. Sequencing | 2 | none |

**Total open: ~89** (the four-stakeholder + rendering + projectManager decisions resolved 5 questions but raised 24 new ones — the net is more questions, but they're tighter and more answerable.)

### What's now the top of the pile

After this batch, the highest-impact still-open questions are:

1. **A7 / I2-a — payment rail design.** Real-time Stripe or accrue-to-ledger affects Slice 1 vs. Slice 4 of selections AND rendering studio. Single decision unlocks both.
2. **A11 — option upload with no preferred vendor.** Affects Slice 1 UX immediately.
3. **A10 — CO signoff parties.** Affects Slice 2 (change orders).
4. **C4 — Ingestion Lab first-run go.** Operator setup; unblocks Mac scripts + prompt tuning.
5. **B1 (re-framed) — v2 branch port: yes or no.** See report; user didn't understand the question first time.
6. **D5 — role refactor scope (the broader cleanup, not just D1).** D1 is resolved, but the rest of the 20-string mess still needs picking through.
7. **O3 — test-mode bypass security exposure.** Still pending separate decision (per D-008 placeholder).
8. **O8 — Anthropic key rotation.** Still pending.
