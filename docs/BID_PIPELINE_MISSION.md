# MISSION: Bid Pipeline End-to-End (Priority 1)

Owner: Tyler. QuickBooks integration is explicitly DEFERRED — do not touch
functions/src/qbo or any QBO tooling in this mission.

## Goal

Bids must flow in, get measured, get organized, and get compared — clearly
and easily, from Tyler's phone. Full path:

Plans uploaded → Takeoff measured → Bid packages sent (by cost code /
bid_package trade) → Subs submit → Bids ingested + filed → Leveled
side-by-side → Awarded → Rolls into project budget by cost code →
Client portal shows clean cost-to-build by client_category.

## Foundation already in place (2026-07-02)

- Master cost code catalog: root `costCodes` collection, 118 codes SEEDED
  in production Firestore. Fields: code (NN-NNN), item, division,
  divisionNum, bidPackage, clientCategory, allowance, tierVariable, notes,
  active. Admin UI at /cost-codes (client/src/pages/CostCodes.tsx).
- Firestore rules for costCodes deployed (isGCOnly read/write, admin delete).
- Route + sidebar wiring for /cost-codes is in working tree (uncommitted,
  tangled with Expenses/QBO WIP in App.tsx + Sidebar.tsx).

## Known breakage (from tsc, 2026-07-02) — fix these first

1. client/src/components/projects/BidResponseManager.tsx — all apiRequest()
   calls use a stale signature ('GET'/'PATCH' as first arg). Runtime-broken.
   Align with current queryClient.ts apiRequest signature.
2. client/src/components/bidding/StartBidModal.tsx (line ~344) and
   client/src/components/projects/BidFromEstimateModal.tsx (~281) — trade
   select component props drifted (value/onValueChange mismatch). The trade
   picker in bid creation is likely dead. Also allContacts typed unknown.
3. client/src/components/bidding/BidRequestDetailModal.tsx (~144) —
   PortalBid.subId does not exist; find the correct field.
4. Takeoff tool reported broken by Tyler — symptom TBD (ask or repro).
   Files: client/src/components/takeoff/TakeoffStudio.tsx (1535 lines),
   client/src/pages/ProjectTakeoff.tsx. No type errors — runtime issue.
   Repro: npm run dev, open a project → Takeoff, load a plan PDF, calibrate
   scale, draw measurements, refresh, confirm persistence per page.

## Build-out required (after fixes)

A. Bid packages must group by cost code `bidPackage` field — wire
SendBidPackageModal / RequestBidsModal to the master costCodes catalog
(today they use lib/bidPackageTradeMap.ts trade strings; reconcile the
two — costCodes.bidPackage is the source of truth going forward).
B. Bid ingestion: incoming bids (email/PDF via IngestionLab + AiInbox)
must parse to structured {sub, bidPackage, costCodes[], amount,
inclusions, exclusions, alternates} and file to
projects/{id}/bids with cost code tags.
C. Bid leveling: BidComparisonMatrix must compare per bidPackage with
exclusion flags surfaced. Awarding (AwardBidModal) writes a committed
budget line keyed to cost code(s).
D. Client rollup: project budget view aggregates committed/allowance/
pending by clientCategory (10 groups) for the client portal.

## Definition of done

- npm run dev: create bid package from cost codes → send → submit as sub
  (BidRespond) → bid appears in comparison matrix → award → budget line
  exists → client portal cost view shows the category rollup.
- Takeoff: calibrate, measure, persist across refresh, per-page.
- tsc errors in bidding/, takeoff/, projects/Bid\* files: zero.
- Do NOT ship the 500 unrelated pre-existing tsc errors as scope creep.

## Working rules

- Tyler's WIP (Expenses/QBO, 12 files uncommitted) must not be lost.
  Commit it first as its own commit if it stands in the way.
- Small commits per fix, push to main after verification.
- Update CHECKPOINT.md as you go; /compact proactively.
