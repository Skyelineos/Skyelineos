# Sub Portal Design — Phase 1D

**Status:** Drafted 2026-05-24.
**Authoritative decision:** [D-012 in `docs/decisions.md`](./decisions.md).
**Related design docs:** [`docs/selections-design.md`](./selections-design.md) (the sub is the *contractor* stakeholder in the four-party selections model).

This document describes the sub portal: how subs sign up, get verified, receive bid requests, respond at three luxury tiers (general) or per-option (item), get awarded, and see selection progress on trades they're contracted for.

---

## 1. Goals + non-goals

### Goals (v1)
- Sub clicks SMS/email link → if not a portal user, gets a sign-up flow → after sign-up, lands on the bid response page with their context intact.
- A sub cannot submit a bid until W-9, COI, and signed Subcontractor Agreement are uploaded and admin-verified.
- The same bid request shape supports both *general* (3-tier, pre-selection) and *item* (post-selection, per-option) bids.
- When a selection moves from preselection to selected, the system auto-pings the relevant subs to firm up their tier bid into an item-specific bid.
- Awarded subs receive a multi-channel notification (SMS + email + push).
- Subs see read-only selection state on trades they're awarded or actively bidding on.

### Non-goals (v1)
- Trade-specific tier reference tables.
- Sub-side analytics, margin tracking, win-rate dashboards.
- Sub-to-sub messaging.
- Automated COI expiration suspension.
- License upload requirement.
- Sub-side contract negotiation flow (POs and contracts ship one-way for now).

---

## 2. Personas

**The sub** — small business operator, often the owner. Limited time for portals. Wants: clear ask, fast response, proof of award, payment visibility.

**The GC (Tyler)** — sends bid requests, reviews submissions, awards work, signs off as the contractor stakeholder on selections.

**The PM (`projectManager`)** — delegate of the GC for operational sub management. Can send bid requests + recommend awards, cannot finalize award (per D-001 permissions matrix).

**The client + designer** — outside scope of this doc, but their selection decisions trigger sub portal behavior (auto follow-up).

---

## 3. Data model

### Existing collections (unchanged, referenced)

- `contacts/{contactId}` — the rolodex. Subs have `role: 'sub'` and may have `linkedUserId` set when their portal account is created.
- `users/{uid}` — Auth-linked user doc. Subs have `role: 'sub'`, `linkedContactId`, and compliance flags: `w9Filed`, `insuranceCurrent`, `agreementSigned`. Plus document refs: `w9FileUrl`, `coiFileUrl`, `coiExpirationDate`, `agreementFileUrl`, `agreementSignedAt`.
- `projects/{projectId}/bidRequests/{bidRequestId}` — existing collection. We're extending it.
- `projects/{projectId}/bidRequests/{bidRequestId}/results[]` — embedded array of per-vendor send results. We're extending it.

### Extended `bidRequest` shape

```ts
interface BidRequest {
  id: string;
  type: 'general' | 'item';                          // NEW
  trade: string;                                      // NEW (required for general; useful for item too)

  // type='item' only:
  selectionId?: string;
  selectionTitle?: string;
  selectionSpecs?: string;
  selectedOptionId?: string;                          // NEW — the specific option this bid is for

  // type='general' only:
  tierGuidance?: {                                    // NEW — shown in the response UI
    parade: string;       // generic description, baked from decisions doc
    midLuxury: string;
    lowLuxury: string;
  };

  stage: 'rough' | 'final' | 'preselection';          // ADD 'preselection'
  vendors: VendorRecipient[];                         // see below
  customMessage?: string;
  dueByDate: Timestamp;
  requestedBy: string;                                // uid
  requestedAt: Timestamp;
  results: Array<SendResult>;                         // existing
  
  // Follow-up linkage:
  parentBidRequestId?: string;                        // NEW — set on auto follow-ups, points to original general bid
}

interface VendorRecipient {
  contactId?: string;
  vendorName: string;
  email?: string;
  phone?: string;
  inviteToken: string;                                // NEW — 24-char URL-safe random
  inviteTokenExpiresAt: Timestamp;                    // NEW — bid due date + 14 days
  bidStatus: 'pending' | 'viewed' | 'submitted' | 'declined' | 'expired';  // NEW
  viewedAt?: Timestamp;                               // NEW — first time the link was opened
  respondedAt?: Timestamp;                            // NEW
  bidResponseId?: string;                             // NEW — pointer to the response doc
}
```

### New collection: `projects/{projectId}/bidResponses/{responseId}`

```ts
interface BidResponse {
  id: string;
  bidRequestId: string;
  contactId?: string;                                 // null if sub signed up just for this
  vendorName: string;
  vendorUserId: string;                               // the sub's UID (always present — sign-in required to submit)
  type: 'general' | 'item';
  
  // type='item':
  amount?: number;
  leadTimeDays?: number;
  
  // type='general':
  tiers?: {
    parade?: TierBid | { declined: true; reason?: string };
    midLuxury?: TierBid | { declined: true; reason?: string };
    lowLuxury?: TierBid | { declined: true; reason?: string };
  };
  
  generalNotes?: string;
  attachments?: string[];                             // Storage paths
  submittedAt: Timestamp;
  submittedVia: 'portal' | 'manual_entry';
}

interface TierBid {
  amount: number;
  leadTimeDays: number;
  notes?: string;
}
```

### New collection: `subVerifications/{verificationId}`

The admin verification queue. One doc per submission of compliance docs. Auto-created when a sub uploads docs; deleted on approval. (We could embed status on `users/{uid}` and skip this collection — but a dedicated queue gives the GC a clean inbox view and an audit trail.)

```ts
interface SubVerification {
  id: string;
  userId: string;             // the sub's UID
  contactId?: string;         // if linked
  vendorName: string;
  submittedAt: Timestamp;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  documents: {
    w9?: { url: string; uploadedAt: Timestamp };
    coi?: { url: string; uploadedAt: Timestamp; expirationDate: string };
    agreement?: { url: string; uploadedAt: Timestamp; signedAt: Timestamp };
  };
  reviewedBy?: string;        // GC/PM uid
  reviewedAt?: Timestamp;
  reviewerNotes?: string;
}
```

### Firestore rules summary

- `bidRequests` — staff (gc/pm/admin) write + read; sub can read only the specific docs where their UID appears in `vendors[].linkedUserId` (computed via Cloud Function listing endpoint, not a direct collection scan).
- `bidResponses` — sub creates their own (via Cloud Function with token validation); staff read all; sub reads their own only.
- `subVerifications` — sub creates + reads their own; staff reads + writes (approval) all.

### Indexes needed

- `bidResponses` — composite on `(bidRequestId, submittedAt desc)` for GC viewing responses.
- `subVerifications` — composite on `(status, submittedAt desc)` for the admin queue.

---

## 4. URL routes

### New public routes (no auth required to view; auth required to submit)
- `/bid/respond/:token` — bid response landing. Validates token server-side. If sub not signed in, prompts to sign in/up.
- `/sub/signup?bidToken=:token` — sub-tailored sign-up page. Pre-fills email if known from the contact record.

### New authenticated routes (sub portal)
- `/sub/onboarding` — upload W-9, COI, agreement. Lands here after sign-up if not yet verified.
- `/sub/bids` — list of all bid requests (already exists as a tab inside `SubcontractorPortal`).
- `/sub/bids/:bidRequestId` — single bid request detail + response form.

### New authenticated routes (admin/GC)
- `/admin/sub-verifications` — verification queue (could be a section of the existing admin dashboard).

---

## 5. Backend endpoints

All inside the existing `api` Express function in `functions/src/index.ts`.

### Public (no auth)
- `GET /api/bid-requests/by-token/:token` — fetch bid request + vendor entry for the token. Marks `bidStatus: 'viewed'` if first view. Returns 410 Gone if expired, 404 if not found.

### Authenticated (sub bearer token)
- `POST /api/bid-requests/by-token/:token/respond` — submit response. Validates the signed-in user owns the linked contact (or claims it). Creates `bidResponse` doc, marks vendor entry `submitted`. Notifies GC via in-app + email.
- `POST /api/sub/verifications/submit` — sub submits their docs. Creates `subVerification` doc.

### Authenticated (gc/pm/admin)
- `POST /api/sub/verifications/:id/approve` — flips `users/{uid}.w9Filed/insuranceCurrent/agreementSigned` to true.
- `POST /api/sub/verifications/:id/reject` — notifies sub with reason.

### Triggered (Firestore + scheduled)
- Existing `ensureContactAuthAccount` — unchanged.
- NEW Firestore trigger on `selections/{id}` write — if `status: preselection` → `selected`, and there's a `general` bid request on the same trade, create a follow-up `item` bid request linking back via `parentBidRequestId`.
- NEW Firestore trigger on `bidResponses/{id}` create — notify GC via in-app + push.
- NEW Cloud Function (callable, gc/pm only) — award bid. Marks bidRequest awarded, creates PO, notifies winning sub (SMS + email + push).

---

## 6. UI flows

### Flow A — First-time sub gets bid invitation
1. Sub receives SMS/email: "Skyeline Homes bid request — Plumbing for Smith Residence. Three-tier general bid needed by 2026-06-07. Submit in your portal: skyelineos.web.app/bid/respond/abc123"
2. Clicks link → hits `/bid/respond/abc123`.
3. Page renders: project + scope summary (read-only public view) + CTA: "Sign in or create your Skyeline Subcontractor account to respond."
4. Sub clicks "Create account" → redirected to `/sub/signup?bidToken=abc123`.
5. Email pre-filled from `vendors[].email`. Sub enters password, accepts ToS.
6. Account created. `users/{uid}` doc created with `role: 'sub'`, `linkedContactId` set to the contact entry that owned the email (via the existing trigger).
7. Email verification email sent. Sub clicks link in email.
8. Sub redirected to `/sub/onboarding`. Banner: "Upload W-9, Certificate of Insurance, and signed Subcontractor Agreement to submit your bid."
9. Sub uploads docs. `subVerification` doc created, `status: pending`.
10. Sub redirected to `/bid/respond/abc123` showing the bid form **disabled with the message** "Submission unlocks once Skyeline verifies your documents (usually within 1 business day)."
11. **Meanwhile**, GC sees a new entry in the verification queue, reviews docs, clicks Approve.
12. Sub gets push + email: "You're verified. Your bid for [project] is ready to submit."
13. Sub returns to portal, submits bid.

### Flow B — Returning sub (already verified)
1. Sub receives SMS/email link.
2. Clicks → `/bid/respond/abc123` → already signed in OR signs in.
3. Sees bid response form fully enabled. Submits.
4. Done.

### Flow C — Auto follow-up on selection finalization
1. Selection on `selectionId=xyz` moves from `preselection` → `selected`. Selected option is "Kohler Artifacts faucet, Brand: Kohler, SKU: K-72218".
2. Firestore trigger fires. Looks up all `bidRequests` where `type=general`, `trade=plumbing`, `projectId=current`. Finds one with three responding subs.
3. Trigger creates a new `bidRequest` with `type=item`, `selectionId=xyz`, `selectedOptionId=...`, `parentBidRequestId=original`, `vendors` = same vendors.
4. Each vendor gets a new email/SMS: "Specs are locked on [selection title]. Confirm or update your bid: [link]"
5. The response form shows their original tier bid as a reference: "You bid $8,400 at Mid Luxury. Confirm or update for the specific item."

### Flow D — Award
1. GC clicks "Award" on a bid response in the admin UI.
2. Callable Cloud Function: marks `bidRequest.awardedResponseId`, creates PO, sets `users/{uid}.activeContracts[]`.
3. Winning sub gets: SMS + email + push.
4. Losing subs get: email notification "Bid not selected this time" (no SMS — too noisy).

---

## 7. Email + SMS body copy

### Initial general bid (pre-selection)

**Email**

> **Subject:** Bid request — {trade} — {projectName}
>
> Hi {vendorName},
>
> We're prepping bids for **{projectName}** — a new build by Skyeline Homes. Since we're early in the selection process, we'd like a general bid from you at our three quality tiers, so we have working numbers as the homeowner finalizes selections.
>
> Every Skyeline home is built a step above standard builder grade, so all three of our tiers reflect that:
>
> - **Parade Home Level** — showcase quality, top-tier brands
> - **Mid Luxury Level** — standard luxury benchmark, semi-to-full custom
> - **Low Luxury Level** — step above builder grade, mid-market premium
>
> You'll respond through your Skyeline Subcontractor Portal. If you don't have an account yet, the link below will walk you through a quick sign-up and document upload.
>
> **→ Submit your bid:** {link}
>
> Please respond by **{dueByDate}**. Reply to this email with any questions.
>
> Thanks,
> {requesterName or "The Skyeline Homes Team"}

**SMS** (≤ 320 chars, 2 segments max)

> Skyeline Homes bid request — {trade} for {projectName}. Three-tier general bid needed by {dueByDate}. Submit in your portal: {link}

### Item-specific bid (post-selection)

**Email**

> **Subject:** Updated bid request — {selectionTitle} specs locked — {projectName}
>
> Hi {vendorName},
>
> The specs on **{selectionTitle}** are now locked for {projectName}. We'd like an updated bid based on the specific selection.
>
> **Selected:** {productName}
> {selectionSpecs}
>
> You originally bid at **{tier}** level — please confirm if that number still holds for this specific item, or send an updated price.
>
> **→ Submit updated bid:** {link}
>
> Please respond by **{dueByDate}**.
>
> Thanks,
> {requesterName or "The Skyeline Homes Team"}

**SMS**

> Skyeline — {projectName}: {selectionTitle} specs locked. Submit updated bid in portal: {link}

### Award notification

**Email**

> **Subject:** You've been awarded the {trade} contract — {projectName}
>
> Hi {vendorName},
>
> Good news — Skyeline Homes has awarded you the **{trade}** work for {projectName}. Your bid of **${amount}** at {tier} level has been accepted.
>
> **Next steps:**
> 1. Review the contract in your portal: {link}
> 2. Confirm timing and any prep needs
> 3. We'll send the Purchase Order separately
>
> Thanks for working with us. Welcome aboard.
>
> {requesterName or "The Skyeline Homes Team"}

**SMS**

> Skyeline: you've been awarded {trade} on {projectName}. Review contract in portal: {link}

### Not-selected notification

**Email**

> **Subject:** Bid update — {projectName}
>
> Hi {vendorName},
>
> Thanks for taking the time to bid on the {trade} work for {projectName}. We've selected another contractor for this project.
>
> We'll keep your information on file and reach out when future Skyeline projects fit your trade. Appreciate your work.
>
> {requesterName or "The Skyeline Homes Team"}

(No SMS for not-selected — too noisy.)

---

## 8. Slicing plan

### Slice 1 — Magic-link funnel + sub sign-up flow
- Generate `inviteToken` per vendor on `bidRequest` creation (24-char URL-safe random)
- Public route `/bid/respond/:token` (read-only public view + CTA)
- Sign-up redirect to `/sub/signup?bidToken=:token` (pre-fills email)
- Auto-linking new user to existing contact by email match (sign-up callback)
- **Fuzzy-match fallback when email auto-link fails (D-012-h).** Run name-similarity + phone match against existing contacts. If candidates found (above match threshold), create a `linkReviewQueue` entry with suggested matches ranked by score. Staff member reviews + picks one OR creates a new contact OR marks "no match." Sub can use the portal in the meantime; linkage just routes their bid history to the right contact record.
- New collection `linkReviewQueue/{id}` and basic admin queue UI page
- Public endpoint `GET /api/bid-requests/by-token/:token` — token validation, marks viewed
- Email/SMS body copy with magic link in `sendBidRequestRoute.ts` (`buildBody()` and `buildSms()`)
- Compliance gate banner on `/bid/respond/:token` if sub not yet verified

**Out of slice 1:** the actual bid submission form changes (slice 2), the upload UI (slice 3).

### Slice 2 — Three-tier general bid form + GC review queue
- Extend `BidRequest` schema (`type`, `trade`, `tierGuidance`, etc.)
- Add `project.defaultTier` field + project-creation UI step ("What tier is this build?")
- New `bidResponses` collection
- General-bid form variant of `SubBidSubmissionForm` (three tier cards, per-tier amount + lead time + notes + "I don't bid this tier" toggle)
- **Decline-to-bid button** (D-012-g): sub declines entire project; GC notified; optional one-click "remove from invite pool" with reason capture
- Backend endpoint `POST /api/bid-requests/by-token/:token/respond` (handles both general and item; handles decline)
- Backend endpoint `POST /api/bid-requests/by-token/:token/decline`
- Firestore rules for `bidResponses` — staff read all, sub reads own only; client + designer **CANNOT** read raw amounts (per D-013 review gate)
- GC-side admin UI: "Create general bid request" button on project bidding page (lets you select trade + multiple subs)
- GC-side admin UI: bid review queue showing all incoming responses for a project, per trade

### Slice 3 — Sub onboarding upload UI + admin verification queue
- Audit existing upload code paths (some W-9/COI handling already exists in contact admin)
- Build/finish `/sub/onboarding` page (three upload zones)
- Build `/admin/sub-verifications` queue page
- Approve/reject endpoints
- Email notification to sub on approval
- COI expiration tracking + display

### Slice 4 — Auto follow-up + award + selection visibility + publish-to-client
- Firestore trigger on selection state change → follow-up bid request creation
- Callable Cloud Function: `awardBid` (sets `selection.awardedSubId`, `awardedBidResponseId`, `internalCost`)
- **Publish-to-client flow (D-013):** GC UI to enter markup (defaults from `project.markupRate`), preview client-facing price, click Publish to lock `publishedClientPrice` + `publishedAt`
- Client-facing selection view shows `publishedClientPrice` only — never raw `internalCost`
- PO creation on award
- SMS + email + push on award
- Read-only selection visibility for awarded subs (`projects/{id}/selections` rule update — sub sees the *selected option's spec*, NOT pricing)
- Not-selected email to losing bids

### Cross-slice: pricing model (D-013)
- `project.defaultTier`, `project.usesInternalDesign`, `project.markupRate` added in Slice 2 (project creation step)
- `selection.internalCost / markupRate / markupAmount / publishedClientPrice / publishedAt` added in Slice 4
- Firestore rules ensure clients/designers cannot read `internalCost` or any bid response amounts — only `publishedClientPrice` once set

---

## 9. Open questions (not blocking Slice 1)

- **Tier flexibility (D-012-a)** — confirmed default: bid all three, with explicit "I don't bid this tier" toggle.
- **Tier assignment scope (D-012-b)** — per-selection, defaults to project-level tier.
- **COI expiration (D-012-c)** — flag, do not auto-suspend.
- **Email verification (D-012-d)** — required before viewing bid; doc upload + admin verify required to submit.
- **Token expiration (D-012-e)** — bid due date + 14 days grace.
- **What if a sub forwards their link to a colleague?** Default: the colleague would need to sign in / sign up with the *original recipient's email* to submit. Tokens are scoped to a specific vendor entry. If the colleague has their own portal account at a different email, they can't use the token. Acceptable for v1.
- **What if a sub wants to add a teammate to their portal account?** Phase 2. v1 = one user per sub business.
- **Multi-project bidding from same sub** — the sub portal already supports this; no change needed.
- **Sub bidding on selections they're already contracted for** — should be blocked (already contracted = no need to re-bid). Add as a Slice 2 check.
- **What if the GC accidentally awards the wrong bid?** Phase 2 — add an undo window (24h) + audit trail. v1 = manual cleanup.

---

## 10. Cross-references

- `docs/decisions.md` D-012 — authoritative decision.
- `docs/selections-design.md` — D-002 — sub is the *contractor* stakeholder in selection signoff.
- `client/src/pages/SubcontractorPortal.tsx` — existing portal page.
- `client/src/components/bidding/SubBidSubmissionForm.tsx` — existing form with compliance gate.
- `client/src/components/bidding/SubBidRequestsTab.tsx` — existing list.
- `functions/src/bids/sendBidRequestRoute.ts` — existing email/SMS sender; will be extended.
- `functions/src/auth/ensureContactAuth.ts` — existing contact→auth trigger.
