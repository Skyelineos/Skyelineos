# Estimates — Email→Bid Ingestion + Workspace Ergonomics (design)

**Status:** Proposed (captured 2026-06-11). Not yet built. This is the next major
Estimates workstream per Tyler's direction.

**One-line:** Let the GC pull subcontractor bids straight out of email into the
estimate — AI reads 2–3 emails, recommends estimate line items (with trade), and
attaches the source PDF for review — inside a wider, side-by-side, less-cramped
estimate workspace where every line item is guaranteed to have a trade.

---

## Why this is a strong fit
The hard parts already exist in the **Ingestion Lab** (Session 12) and just need to
be pointed at the Estimates module instead of the admin spike:
- **Gmail OAuth + read** — `functions/src/ingestionLab/` (OAuth handlers + Gmail ingester).
- **Claude extraction via forced `tool_use`** — the brain pass + `prompts/extractionPrompt.ts`.
- **Daily cost guard** — the $5/day budget counter.
- **PDF handling** — raw items already carry attachments.

What's new is *scoping to a project/trade*, a *bid-specific extraction schema*, the
*recommend-a-line-item* mapping, and *attaching the PDF to the estimate*.

> **Prerequisite (blocker):** the Google OAuth operator setup must be done first —
> `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Secret Manager, Gmail API enabled,
> consent screen configured (see `SESSION_NOTES.md` Session 12). Until then the
> email read can't run.

---

## Workstream 1 — "Check Email for Bids" (AI email → estimate line items)

**Entry point:** a button at the top of the Estimate page: **"Check Email for Bids."**

**Flow:**
1. Click → a wide panel opens (doubles as the side-by-side email view, see WS2).
2. The GC picks **2–3 emails** that contain bids for this project (search by
   sender / subject / date, or pick from a project-scoped inbox view).
3. AI screens the selected emails + their PDF attachments and, per bid, **recommends
   one or more estimate line items** — description, qty, unit, unit cost, total, and
   the **trade** — with a confidence score and the snippet/PDF it came from.
4. The GC reviews each recommendation and **accepts / edits / rejects** before it's
   inserted into the estimate (never auto-insert without confirm).
5. The source **PDF is pulled and attached to the estimate** (Firebase Storage),
   linked on the estimate page for later review.

**New pieces:**
- A bid-tuned extraction schema (Claude `tool_use`):
  `{ vendor, trade, scope, validUntil, lineItems[{ description, qty, unit, unitCost, total }], total }`.
- Project/trade-scoped Gmail search (vs the lab's fixed `Skyeline-Spike` label).
- Recommendation → `estimates/{id}/lineItems` mapping (with trade pre-filled).
- PDF attach: store under the project/estimate, link from the estimate row.
- A review/confirm UI (recommendation cards with accept/edit/reject).

**Reuse / route:** fold new endpoints into the shared `api` Express app
(`/api/estimates/:id/email-bids/*`), same pattern as the lab — **do not** add
standalone Cloud Run services (org IAM blocks them).

**Open questions for Tyler:**
- Which mailbox? The GC's own Gmail via OAuth, or a shared Skyeline inbox?
- Manual pick of 2–3 emails, or auto-search a project label/folder?
- PDF attaches at the **estimate** level or the **line-item** level?
- Reuse the $5/day budget cap, or a separate estimate budget?

---

## Workstream 2 — Workspace ergonomics (see more clearly, email side-by-side)

The estimate is cramped; the GC needs room and their email visible next to it.

**Requirements → design:**
- **Collapsible sidebar** — collapses to a thin icon rail to reclaim width.
  Persist the collapsed state. Applies to the shared brand-black/gold sidebars
  (`Sidebar.tsx`, `SubcontractorSidebar.tsx`, `FinancialsSidebar.tsx`).
- **Hover-to-expand** — when collapsed, hovering the rail temporarily expands it as
  an overlay (doesn't shove content), collapses again on mouse-out.
- **Wider modals/popups** — widen the default dialog size (a `wide` variant on the
  shadcn `Dialog`), used by the estimate + email-bid modals so they're not tiny.
- **Estimate focus/expand mode** — opening an estimate can collapse the sidebar and
  maximize the working area; a **split view** puts the email/bid panel beside the
  estimate so the GC can see which trades have estimates while reading bids.

**Open questions:**
- Is "email side-by-side" a real embedded Gmail-reading pane, or just the WS1
  AI-bid panel sitting beside the estimate?
- Hover-expand sidebar globally, or only inside the estimate workspace?

---

## Workstream 3 — Trade assignment is mandatory on every line item

**Requirement:** every estimate line item must have a **trade** assigned. If one
doesn't, show an **alert** and a **prompt to find one (by requesting bids)**.

**Design:**
- Treat `trade` as required on `estimates/{id}/lineItems`.
- **Inline flag** — line items missing a trade get a visible badge/row highlight.
- **Summary alert** — e.g. "3 line items have no trade assigned," pinned at the top
  of the estimate.
- **CTA → request bids** — the prompt opens the existing bidding flow
  (`PortalBidsPanel` / `SendBidPackageModal` / `RequestBidsModal`) to source the
  trade + vendor for that scope.
- **Ties into WS1:** an email-bid recommendation should set the trade automatically,
  which is one of the main ways a missing trade gets filled.

**Reuse:** `trades` collection, the canonical bidding module under
`client/src/components/bidding/`.

---

## Suggested build order
1. **WS3 (trade enforcement)** — small, self-contained, immediately useful, and it
   sets up the data contract (every line item has a trade) that WS1 fills.
2. **WS2 (ergonomics)** — sidebar collapse + hover-expand + wider modals + estimate
   focus mode. Independent, high daily-quality-of-life payoff.
3. **WS1 (email→bids)** — the big one; do it after the Google OAuth prereqs are
   configured and once WS2's wide/side-by-side panel exists to host it.

## Dependencies & risks
- WS1 is **blocked** on Google OAuth operator setup (Secret Manager + APIs + consent).
- WS1 should reuse the Ingestion Lab's cost guard so email screening can't run up cost.
- Keep all new backend routes folded into the `api` Express app (IAM constraint).
