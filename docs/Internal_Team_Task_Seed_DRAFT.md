# Internal Team Task Seed — DRAFT for review

**Status:** Draft authored 2026-06-13 from scratch. No code written yet. Awaiting Tyler's redline before this lands in `client/src/lib/` as a seed.

These tasks are meant to **overlay on top of** the existing construction-phase templates in `client/src/lib/starterJobTemplates.ts` — they do NOT replace them. The construction template covers what subs and the GC do on the physical build; this seed covers what your internal office team does to set up, run, and close out the project around that build (sales follow-up, paperwork, scheduling inspections, warranty check-ins, etc.).

## Canonical category decision

The codebase has two competing category frameworks:

| Where | Categories |
|---|---|
| `JobTemplateEditor.tsx` (the actual editor save/load) | Administration · Schedule · Cashflow Setup · Selections · Safety/QC · Foundation · Framing · MEP · Finishes · Closing · Other |
| `Tasks.tsx` line 45 comment ("Jack-style board") | Sales · Administration · Pre Site · Site · Client |

**My call: the `JobTemplateEditor.tsx` 11-category list is canonical.** Reasoning:
- It's the one actually persisted in Firestore via the editor.
- The Jack-5 lanes are a comment-only reference for a future kanban filter view; they map cleanly onto the 11-category list as a presentation layer (e.g. "Site" lane = Foundation + Framing + MEP + Finishes).
- The construction-phase categories (Foundation / Framing / MEP / Finishes / Closing) are already in use by the existing `starterJobTemplates.ts`.

This seed uses only the 11-category list. **One gap to flag:** there's no explicit "Sales" or "Pre-Contract" category, so pre-contract work (proposal → contract sign → deposit) is currently tagged **Administration**. See open questions at the bottom.

## Summary

35 tasks across 5 categories. Day offsets are relative to project start = Day 0 = contract sign (matching the existing construction template's convention). Negative day offsets represent pre-contract sales work.

| Category | Tasks | Day range |
|---|---:|---|
| Administration | 12 | -30 to 14 |
| Cashflow Setup | 4 | 5 to 14 |
| Selections | 4 | 10 to 75 |
| Safety/QC | 6 | 14 to 240 |
| Closing | 9 | 245 to 640 |
| **TOTAL** | **35** | — |

---

## Tasks

| Day | Task | Category | Assignee | Notes |
|---:|---|---|---|---|
| -30 | Send proposal to lead | Administration | GC | Initial proposal PDF + summary email; logs proposal-sent timestamp on the lead doc. |
| -25 | Follow-up call after proposal sent | Administration | GC | Gauge readiness, surface questions, schedule contract review if warm. |
| -14 | Send contract for signature | Administration | GC | Final contract PDF + e-sign request; expected return within 7 days. |
| -7 | Collect deposit | Administration | Admin | Verify wire/check received before any work begins — gates contract activation. |
| -3 | Set up project in QuickBooks | Administration | Admin | Create QB customer + project; mirror Skyeline project code. |
| -3 | Create project folder structure (Drive + physical) | Administration | Admin | Standard subfolders: Contract, Plans, Selections, Subs, Photos, Bills, Closeout. |
| -1 | Open project Teams/Slack channel | Administration | PM | Invite GC, PM, designer, awarded subs; pin contract + plan set. |
| 1 | Send pre-construction welcome packet to client | Administration | PM | "What to expect" doc + portal login + key contacts + timeline at-a-glance. |
| 2 | Verify client lender + insurance | Administration | Admin | Construction loan + builder's risk policy on file before sitework. |
| 3 | Schedule pre-construction meeting | Administration | PM | Client + GC + PM + designer; align on selections deadlines + communication. |
| 5 | Verify sub compliance docs (W-9, COI, license) for awarded subs | Administration | Admin | Block payment if any sub is missing — feeds the compliance gate at award. |
| 14 | Confirm escrow / construction loan funded | Administration | Admin | First draw cannot be requested until this is checked off. |
| 5 | Set up draw schedule with lender | Cashflow Setup | Admin | Number of draws + percent allocations; mirror in project cashflow forecast. |
| 7 | Set up retainage tracking | Cashflow Setup | Admin | Standard 10% per sub unless contract overrides. |
| 10 | Configure invoicing schedule for client | Cashflow Setup | Admin | Monthly progress invoices vs draw-aligned invoices — match the contract. |
| 14 | Set up AP tracking for project | Cashflow Setup | Admin | Job costing in QB so bills route to the right project + cost code. |
| 10 | Schedule designer kickoff meeting with client | Selections | Designer | Walk through selections process, tier, timeline, allowances. |
| 30 | Send first selections deadline reminder to client | Selections | Designer | Hits "Foundation done" — selections needed start landing in 60 days. |
| 60 | Mid-selections check-in with client | Selections | Designer | Halfway through curation; surface any open decisions blocking ordering. |
| 75 | Final selections deadline reminder | Selections | Designer | Selections must be locked by day 90 (matches existing master schedule). |
| 14 | Post jobsite sign + safety placard | Safety/QC | PM | Skyeline sign + OSHA poster + permit posting; photo for project file. |
| 30 | Weekly site safety walk (recurring — start) | Safety/QC | PM | Recurring weekly through final inspection; log photos + any callouts. |
| 110 | Schedule framing inspection | Safety/QC | PM | Coordinate inspector + framer for ~5 days after framing finish. |
| 140 | Schedule MEP rough-in inspection | Safety/QC | PM | All three trades present; coordinate inspector visit. |
| 175 | Schedule insulation inspection | Safety/QC | PM | Pre-drywall; selection-driven (spray foam vs batt affects scheduling). |
| 240 | Walkthrough punch list creation | Safety/QC | PM | Internal punch list BEFORE client walkthrough; surfaces obvious items first. |
| 245 | Compile lien waivers from all subs | Closing | Admin | Conditional final waivers from every sub paid; gate final draw on completeness. |
| 250 | Compile warranty package | Closing | Admin | Appliance + system manuals + sub contact list + registration confirmations. |
| 260 | Issue final invoice | Closing | Admin | Final draw including retainage release; aligns with substantial completion. |
| 268 | Collect final payment | Closing | Admin | Verify payment cleared before keys handoff. |
| 275 | Deliver closeout client documentation | Closing | PM | Warranty package + lien waivers + final inspection cert + key set + alarm codes. |
| 280 | Request Google / Yelp review from client | Closing | GC | Personal ask from Tyler; include direct review links. |
| 305 | 30-day warranty check-in with client | Closing | PM | Email + offer site visit; log issues for warranty queue. |
| 460 | 6-month warranty check-in with client | Closing | PM | Email check-in; system seasonal-shift issues surface here (HVAC, doors). |
| 640 | 1-year warranty check-in with client | Closing | PM | Final formal touch; warranty obligation ends 1 year post-substantial completion. |

---

## Open questions for Tyler (please mark up)

1. **Universal vs per-project-type variants** — Should this seed apply to every project regardless of type (Custom Home Build / Basement Finish / Pool / Kitchen / Bath Remodel), OR do you want trimmed variants per type? Most internal tasks here apply universally (e.g. "Set up in QuickBooks") but some are scaled (a Bathroom Remodel doesn't need a 6-month warranty check-in but does need the deposit/contract/closeout flow).

2. **Default assignee for `Admin` tasks** — Do you have a bookkeeper/office admin person, or do all "Admin"-labeled tasks default to you (GC) until you hire one? If we add a `bookkeeper` role to the taskDefaults helper, it would resolve here; otherwise everything Admin-labeled lands on you by default.

3. **Sales category** — The current 11-category list has no "Sales" bucket, so the 7 pre-contract tasks (days -30 to -1) are tagged **Administration**. Options:
   - (a) Keep as-is — Administration is a fine catch-all.
   - (b) Add a 12th category "Sales" to `JobTemplateEditor.tsx` and re-tag the pre-contract tasks.
   - (c) Move pre-contract tasks out of the project seed entirely and into a separate "Lead/Sales pipeline" template (closer to how Jack handled it).

4. **Client-facing communication tasks** — Should this seed include the recurring touchpoints (weekly progress photo to client, mid-month update email, milestone celebration message at framing complete, etc.) or just operational checklist items? Recurring weekly comms aren't currently here.

5. **Skyeline-specific vs builder-universal** — Some tasks above are universal to any custom-home GC; others are specific to how Skyeline runs (e.g. day-30 first selections reminder timing). Please flag anything that's a process you do differently — those will need to change before this is good for you.

6. **Pre-construction meeting attendees** — I assumed client + GC + PM + designer. Do you also want awarded subs included by default, or is that a separate sub-only kickoff?

7. **Warranty cadence** — 30-day / 6-month / 1-year is the standard. Some builders also do 11-month (so client can call out warranty items inside the 1-year window before it closes). Want me to add Day 580 = 11-month check-in?

8. **Negative-day offsets** — These represent pre-contract work and need to be applied differently than positive offsets (start date doesn't anchor them — proposal-sent date does). Do you want a separate "lead" sub-template that uses a different anchor date, or keep them as negative offsets relative to contract sign?

---

*Draft authored 2026-06-13. To convert to code: a new file `client/src/lib/starterInternalTeamTasks.ts` would export this seed in the same `SeedTemplate` shape as `starterJobTemplates.ts`, and the seeding helper would add it to the `templates` collection separately so it can be applied independently of (or alongside) the construction template.*
