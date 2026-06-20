# Single Source of Truth (SSOT) — Project Document System

> Status: **Design draft** (Session — Bid Room / SSOT). Not yet built.
> Owner: Tyler. Author: this design doc precedes implementation; review before Phase 1 code.

## 1. Why this exists (the problem we're solving)

Today, project information is scattered: plans live in `/documents`, design boards
in `projects/{id}/moodBoards`, client picks in `projects/{id}/selections`, and bid
plans are **copied per bid request** (`bidRequest.plans[]`). Subs only see what was
attached to their individual invite.

The expensive failure mode this causes:

> A sub bids off the **plans**. A **design board** later alters something the plans
> showed (different tile, added niche, moved wall). The sub never sees the design
> board. The client and GC don't catch the discrepancy either. At build time the sub
> either (a) raises their price to cover the change — client is upset — or (b) builds
> the original plan and skips the altered work — client is upset.

**The fix:** one **Single Source of Truth (SSOT)** per project that every role
(GC, Designer, Client, PM, Subs) references. If a document or design direction is
not in the SSOT, it is not official and nobody should act on it. Critically, when
an approved design **deviates from the base plans**, that deviation is recorded and
surfaced so loudly that no bidding sub can miss it.

## 2. Principles

1. **One folder, one truth.** Per project, there is exactly one canonical set of
   plans + approved design content + scope. No side channels.
2. **Approved-only.** Design content (boards, renderings, selections) enters the
   SSOT **only after client + designer + builder approval**. Drafts stay out.
3. **Deviations are first-class and loud.** A change from the base plans is not a
   silent file swap — it's an explicit, acknowledged **Addendum** linked to what it
   changes.
4. **Role-appropriate visibility.** Everyone references the same truth, but subs get
   a view-only, isolated slice during bidding (see §4).
5. **Reuse, don't fork.** Build on existing collections/storage/rules where possible.

## 3. What lives in the SSOT

| Content | Source collection (today) | Enters SSOT when |
|---|---|---|
| Plans / drawings / permits / specs (PDFs) | `/documents` (has `projectId`) | GC flags `inSsot: true` |
| Approved design boards | `projects/{id}/moodBoards` | board `status == 'Approved'` (client+designer+builder) |
| Approved client selections | `projects/{id}/selections` | selection approved/locked |
| Renderings | `/documents` or `designFiles` | GC/designer flags into SSOT |
| **Addenda** (deviations from base plans) | **new** `projects/{id}/addenda` | created + approved |

The SSOT is a **curated view**, not a new storage bucket: items already live in their
home collections; an `inSsot`/approval flag promotes them into the canonical view.
This avoids copying files and keeps a single Storage object per file
(`projects/{projectId}/**`, already gated to project members).

## 4. Access model

`isOnProject()` (Storage) + project membership already let any invited sub *reach*
`projects/{projectId}/**`. The SSOT view layers role rules on top:

| Role | Sees | Can edit |
|---|---|---|
| Admin / GC / PM | Everything in SSOT + full bidder roster | Curate, approve, publish addenda |
| Designer | Everything in SSOT | Propose design content for approval |
| Client | Everything in SSOT (walkthrough/review — later phase) | Approve/reject design content |
| **Sub (bidding)** | SSOT content **view-only**; **own** Q&A only; **no roster** (can't see other subs exist) | Download only; ask questions |
| **Sub (awarded)** | SSOT content + **other awarded trades** (roster reveal) | Download; coordinate via Q&A |

**Bidding isolation (your rule):** during the bid window a sub sees the files but
**not** who else has access — not even that others exist. Only admin/GC sees all
bidders. Implementation is naturally easy: we simply never render co-members and
scope each sub's reads to themselves.

**Award reveal (your rule):** once a trade is awarded, awarded subs become visible
to each other so tradesmen can coordinate quality/finish. Driven by the existing
award state (`bids.status == 'awarded'` / `pendingSubAssignments`), materialized into
a roster the rules can read.

## 5. The deviation mechanism — "Addenda" (the core value)

Borrowed from how construction bid sets actually work (numbered addenda):

- When an **approved design board / selection changes something the base plans show**,
  the GC or designer creates an **Addendum**: a short record with
  `{ number, title, description, affectsTrades[], supersedes: {planDocId / region},
  linkedMoodBoardId / linkedSelectionId, approvedBy[], createdAt }`.
- Addenda are **numbered and dated** (Addendum 1, 2, …) and **linked to the plan
  sheet / scope they modify**.
- Any bid request for an affected trade shows a **⚠️ Deviations from base plans**
  banner listing the relevant addenda; the sub must **acknowledge** each before
  submitting (acknowledgement stored on their bid).
- The plans view marks affected sheets with an **"Amended by Addendum N"** badge.

Net effect: a sub literally cannot submit a bid for an affected trade without seeing
(and acknowledging) the change. The discrepancy is caught at bid time, not build time.

> Open question (O-3): who can *author* an addendum vs. who must *approve* it before
> it's visible to subs? Proposed: designer or GC authors; becomes visible to subs only
> after client + designer + builder approval (same gate as design content).

## 6. How bidding consumes the SSOT

- Stop copying `bidRequest.plans[]` per invite. Instead, a bid request **points at the
  project SSOT** (+ optional `scopeTradeFilter` so a sub sees the whole truth but with
  their trade's scope highlighted).
- `SubBidSubmissionForm` already captures total price, est. days, line items, and a
  **bid file** (any format — not PDF-only). It already renders read-only project docs +
  selections. We extend it to render the SSOT view + the addenda acknowledgement gate.
- Compliance stays **advisory at submit, hard gate at award** (D-016 unchanged).

## 7. Phasing

- **Phase 1 (this doc):** SSOT data model + `inSsot`/approval flags + sub-portal
  "Project Files" view (view-only) + **Addenda** model & bidder acknowledgement +
  rules to grant invited subs read of SSOT items. The discrepancy-prevention core.
- **Phase 2:** Award-gated roster reveal.
- **Phase 3:** Sub → GC questions/comments (isolated per sub during bidding).
- **Phase 4:** Submission hardening — any-format bid file + scope + price + time;
  compliance advisory at submit / hard gate at award (D-016 kept).
- **Later:** Client walkthrough UI (step through plans, renderings, boards; confirm
  before subs bid).

## 8. Rules changes required (sensitive — review carefully)

Today subs **cannot** read `/documents`, `moodBoards`, `selections`, `designFiles`.
Phase 1 needs invited subs to read **only SSOT-flagged** items for projects they're
invited to. Approach: gate sub read on `resource.data.inSsot == true` **and** project
membership / invitedSubIds — never blanket sub access. Collection-group safety lessons
from the bid-requests fix apply: scope queries to keys the rules can evaluate.

## 9. Decisions locked

- SSOT spans the **entire build lifecycle**, all roles reference it.
- Only **client + designer + builder–approved** design content enters the SSOT.
- Deviations are explicit, numbered **Addenda**, acknowledged by bidding subs.
- Bid file: **any format** with scope + bid (no required PDF).
- Compliance: **advisory at submit, hard gate at award** (D-016 kept).
- Subs are **view-only**; bidding subs see **no roster**; awarded subs see each other.

## 10. Open questions

- **O-1:** Is the SSOT a curated *view* over existing collections (proposed) or a new
  consolidated collection? (Proposed: view, to keep one Storage object per file.)
- **O-2:** Folder organization — fixed top-level categories (Plans / Design / Permits /
  Addenda / Scopes) or GC-defined folders?
- **O-3:** Addenda authoring vs. approval roles (see §5).
- **O-4:** Do we need versioning of plan sheets (v1 → v2) or is "superseded by Addendum N"
  enough for now?
- **O-5:** Client walkthrough/sign-off — does the client formally "approve the bid set"
  before subs can be invited? (Could become a gate.)
