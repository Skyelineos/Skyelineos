# Build-Out Roadmap — Clarity for Clients, Organization for the GC

**Date:** 2026-06-16
**Method:** Audit of `origin/main` HEAD against two named outcomes —
1. **Clarity for clients** — every client knows what's happening, what's coming, who to talk to, where to find things.
2. **Organization for the GC (Tyler)** — every operational decision has a clear surface, every status is derivable, no critical info living in his head.

This doc is read-and-decide. No code changes ship until Tyler picks priorities. Severity tags:

- **Critical** — without it, the persona can't function or actively gets confused.
- **High** — clear win; app limps along without it.
- **Medium** — polish + sophistication.
- **Nice-to-have** — someday.

---

## Executive summary — top 10 highest-impact items

These are the 10 gaps that, fixed in any order, would most move both outcomes. Mix of clarity + organization wins.

1. **[Critical / Client]** Client sidebar links (`contracts`, `punch-list`, `warranty`, `estimates`) navigate to dead URLs — the `SkyelineClientPortal.tsx` `TABS` array doesn't include those keys, so every click silently lands on the dashboard. Same bug class we just fixed for the Designer Portal.
2. **[Critical / Sub]** Compliance "Upload" buttons in the sub portal just toast "coming soon" — subs literally cannot file W-9 / COI / signed agreement / license, which gates award. This blocks every new sub today.
3. **[Critical / GC]** No company-wide outstanding-AR dashboard for client draws — Tyler has draws/invoices per project but no roll-up of "who owes me what right now, sorted by days overdue."
4. **[Critical / Cross]** Global search (`GlobalSearch.tsx`) calls `/api/search` which has no backend route. Search box always returns nothing. Cmd+K is a dead feature.
5. **[High / Designer]** Two competing designer surfaces (`/designer-portal` global + `/projects/:id/designer` project-scoped, room-by-room) share concepts but use different data shapes. Designer edits one, other doesn't reflect. Pick one or define the boundary explicitly.
6. **[High / Client]** No "who do I call" surface in the client portal. No team card listing GC / PM / designer with photo, phone, email, "best for X questions."
7. **[High / GC]** No "bid follow-up needed" view. When subs are invited and don't respond, there's no list of "X invited, Y responded, follow up with Z."
8. **[High / Cross]** Notification trigger catalog is sparse (5 triggers). Missing: schedule slip, change-order created, selection due, draw requested, invoice received, photo uploaded, walkthrough item assigned. Per-user notification preferences UI exists but isn't wired.
9. **[High / Client]** No client-facing punch-list / walkthrough / warranty surface despite GC-side equivalents existing. Homeowners have no post-occupancy access.
10. **[High / GC]** Two Schedule pages (`Schedule.tsx` + `GlobalSchedule.tsx`, the latter still shows hardcoded "7 active projects"). Kill one or merge.

---

## Client portal

Goal: homeowner opens portal, knows immediately what's up, what's next, what they owe, who to ask.

### Critical
- **Dead sidebar links.** `ClientSidebar.tsx` advertises Contracts / Estimates / Punch List / Warranty tabs but `SkyelineClientPortal.tsx`'s `TABS` array doesn't render any of them. Every click silently falls back to dashboard. Either wire the tabs or remove the sidebar items.
- **No "who do I call" team card.** Project Overview shows this for staff, but client portal has no contact card with photo/phone/email per team member, no "best for design questions / billing questions / site questions" routing.
- **No invoice/payment receipt history.** `ClientFinancials.tsx` shows draw rows with status, but no downloadable PDF receipt or paid-history list. The "Pay now" link mints a QBO link but post-payment confirmation isn't surfaced back to the client.

### High
- **No allowance vs spend per selection category.** Client sees per-trade budget rollup but each individual selection doesn't show its allowance, the chosen item's cost, and overage attribution.
- **Schedule tab has no "what changed" surface.** If dates slip, client gets no diff/explanation. No calendar export (.ics).
- **No threaded conversations.** `ClientMessenger.tsx` is single-thread iMessage-style — no way for client to separate "design questions" from "billing questions" from "site questions."
- **No read receipts / typing indicators** in client messenger. Clients don't know if their question landed.
- **Change-order approval lacks scope detail.** `ChangeOrdersTab.tsx` shows title + amount but no attached drawings/photos/comparison-to-baseline for the change.
- **Photos feed has no per-phase filtering.** `PhotosTab.tsx` has `visibleToClient` flag but no "show me framing photos" chip filter.
- **No "next big decision needed" anchor.** Dashboard counts pending decisions but doesn't surface "Pick countertops by Aug 12 — needed for cabinet bid."
- **No warranty surface despite sidebar link.** Move-In Binder data model exists (`/projects/:id/move-in-binder` is wired GC-side) but no `client-portal/warranty` page is rendered.
- **No punch-list surface for client.** Site Log and Walkthroughs are GC-side; client can't see their own open punch items or sign off on closeout.

### Medium
- **Documents tab has no client-side search/filter.** Lists docs but no category chips, no full-text search.
- **Build Location confirm card only appears once.** Once confirmed, no way to view/edit it; if address changes mid-project the client can't see it.
- **Inspiration board doesn't link forward to actual selections.** Client uploads inspiration but no "applied to X selection" backlink.
- **Style Discovery completion has no next-action CTA.** Shows "Profile ready" badge but doesn't push next step.
- **Design Studio renderings have no compare-mode persistence.** Each session is a fresh comparison.

### Nice-to-have
- Calendar `.ics` export for the schedule timeline.
- Push reminder N days before decision due date (today only via email triggers).
- Inline reactions on photos ("love this one").
- Client-side notes / journal per project.
- Sharing a one-link "view-only" snapshot with family.

---

## GC operational

Goal: Tyler opens the app, knows in 30 seconds what needs his attention today across every project.

### Critical
- **No company-wide AR/AP dashboard.** `FastFinancialCard` exists in code but isn't mounted on `Dashboard.tsx`. No "who owes me what, sorted by days overdue" view at the owner level.
- **Tasks page has no "overdue" as default view.** Overdue items aren't pinned across all projects. `MissingTasksAlertCard` is project-scope-driven, not personal-todo.
- **No "bid follow-up needed" view.** When subs are invited and don't respond, there's no list of "X invited, Y responded, follow up with Z by date."

### High
- **Two competing Schedule pages.** `Schedule.tsx` and `GlobalSchedule.tsx` both exist; GlobalSchedule shows hardcoded "7" active projects. Kill or merge.
- **No "schedule slip alarm."** `computeScheduleSlip` exists in `projectUtils` but isn't surfaced as a dashboard alert per project.
- **Selections coordination has no GC reconciliation view.** Designer-side `RecommendationsManager` and client-side `SelectionsBoard` are wired, but no GC view shows recommendation → selection → bid impact in one row.
- **Cashflow forecast is project-scoped only.** `CashFlowForecast.tsx` per-project; `ThreeMonthCashFlowProjection.tsx` company-wide exists but isn't an executive cashflow surface. Need "next 90 days inflows vs outflows by week."
- **Change-order initiation from field is missing.** `ChangeOrders.tsx` is a list/create form; no "convert this selection overage / site-log issue / sub RFI into a CO" one-click flow.
- **Sub performance reporting beyond star rating.** `Reports.tsx` has gain/loss + estimate-vs-actual + profit comparison, but no per-sub "on-time %, on-budget %, COs caused."
- **Lead conversion funnel exists in Reports but no SLA alarms.** "Hot lead untouched for 48 hours" alerts missing.
- **Project Overview ChatThread uses legacy threadId scheme** (`project-${parseInt(projectId)}`) — likely stranded from the dead /api messaging.
- **Document mgmt versioning missing.** No version-pin / "current vs superseded" flag; signed contracts don't have "executed copy locked" UX.
- **Photo organization for GC.** Allows category but no bulk re-tag, no auto-EXIF date/place, no "who uploaded."

### Medium
- **Project Overview is dense.** Lifecycle pill row wraps awkwardly; better as a stage tracker with current-phase emphasis (also flagged in mobile audit).
- **No "all clients" health dashboard** (last login, pending decisions count, mood per client). `PortalActivityPanel` shows per-project; no all-clients view.
- **Bid award flow doesn't push a contract draft.** Awarding doesn't auto-generate sub agreement to send for e-signature.
- **No GC "approve sub invoice" queue.** Sub uploads invoice → it sits in `invoices` collection until manually opened. No inbox.
- **Selections "Locked" semantics are unclear.** Lock icon exists but a clear "freeze date" workflow (when does a category become un-changeable?) is missing.
- **Bid package comparison matrix doesn't group by tier guidance.** `BidComparisonMatrix.tsx` exists but tier-guidance fields aren't side-by-side.
- **`Schedule.tsx` does unbounded `getDocs`** on every page mount.

### Nice-to-have
- Per-project P&L PDF export.
- WIP report scheduled email weekly to owner.
- "Days since last client comm" badge per project on Projects.tsx.
- Tyler-only "owner pulse" card aggregating overdue tasks + open walkthroughs + pending COs.

---

## Designer experience

Goal: designer logs in, sees what's blocking projects, can move work forward without context-switching.

### Critical
- **Two designer surfaces with overlapping concepts.** `/designer-portal` (`DesignerPortal.tsx` — global with own per-project tabs: dashboard/rooms/selections/catalog/plans/rfis/messages) AND `/projects/:id/designer` (`ProjectDesigner.tsx` — newer room-by-room workspace). They use different data shapes (`designer/portalTypes` vs `designer/SelectionsManager`). Risk: designer edits one, other doesn't reflect. Pick one or define the boundary.

### High
- **Recommendation → selection → signoff chain is fragmented.** `RecommendationsManager` lets designer recommend; client likes/passes; `ContractorSignoffQueue.tsx` is separate — no surface that walks the whole chain ("designer signed, client approved, GC cost approved, fully locked").
- **Style Discovery answers don't surface in recommendation cards.** Designer has to pop the answers view separately.
- **Mood boards have "Client Review" / "Ready For Review" states** but client portal doesn't expose moodboards as a review surface.
- **No designer file versioning.** `FileLibraryPanel.tsx` uploads but no rev-tracking.

### Medium
- **"Missing links" stat is good but no bulk action.** No "request product info" mailer for selections missing product URLs.
- **Allowance variance is surfaced** but no per-room budget rollup vs project allowances.
- **Selections catalog is global; no per-project saved-favorites.**

### Nice-to-have
- Designer notes per room exported to PDF spec book.
- Time tracking against design hours.

---

## Sub experience

Goal: sub gets a bid request via email, responds on phone, knows when to be on site, gets paid on time, knows the schedule when it slips.

### Critical
- **Compliance upload is a toast stub.** Subs cannot file W-9, COI, agreement, license. Award is gated on these. This blocks every new sub today.
- **No way to add/update payment info on file.** Once awarded, subs have no surface to enter ACH details or change remit-to.

### High
- **Schedule visibility is task-only.** `renderSchedule` shows tasks; no per-trade window from the project's Gantt — sub can't see "you're up week of Aug 10."
- **Schedule slip notifications missing.** If a predecessor slips, no SMS/email to dependent sub. `triggerCatalog.ts` has `task_due` but no `schedule_slip` trigger.
- **No "submit invoice" / "submit pay app" surface.** Subs see issued invoices but can't draft and submit their own — must email Tyler.
- **No "request a change order" surface.** Sub finds a scope issue in the field — no in-app workflow; must call/text.
- **RFI panel exists** but no SLA timer or notification routing on response.
- **Bid response form has tier guidance** but no inline reference photo / spec attachment per bid (only via the bid package upload).

### Medium
- **Compliance expiry warnings.** `w9ExpiresAt` / `insuranceExpiresAt` are stored but dashboard shows binary On File / Missing — no "expires in 30 days" warning.
- **Sub has no view of other subs on the same project** (relevant for trade coordination).
- **No "punch list assigned to me" view** even though walkthroughs support `assignedToContactId`.

### Nice-to-have
- Sub mobile camera-first "I'm on site" photo log.
- Auto-OCR insurance PDF to extract expiry.

---

## Cross-cutting

Goal: the experience around the personas — notifications, search, accessibility, settings, mobile.

### Critical
- **Global search is non-functional.** `GlobalSearch.tsx` calls `/api/search` which has no backend route. Cmd+K returns nothing.
- **No MFA / 2FA.** Sign-in is email+password / Google SSO; no 2FA enrollment surface despite handling financial data and PII.
- **No first-time onboarding** for sub or designer. Client has `ClientWelcomePreview.tsx` (good); other personas land in dashboards with no orientation.

### High
- **Notification preferences are admin-side only.** `NotificationTriggersSettings.tsx` lets Tyler configure trigger flows; recipients (client, sub, designer) have no per-user "I want SMS for X, only email for Y." `UserPreferencesDialog.tsx` has a Notifications tab but it's not wired to the backend trigger engine.
- **No in-app notification center with read/unread state for non-staff portals.** `NotificationCenter.tsx` exists but it's unclear it surfaces in all portal layouts.
- **Reminders are one-shot.** `task_due` fires once at 24h; no escalation ladder (T+1 → T+3 → SMS).
- **Accessibility audit absent.** No ARIA-live regions on toasts; many color-only status (amber/green/red); `text-xs` widely used.
- **No global keyboard shortcuts** beyond Cmd+K (which is dead).
- **Mobile UX gaps** — documented in `docs/Mobile_Optimization_Audit.md`. Top still-broken items: `<Dialog>` overflow at 360px, BidRespond magic-link CTAs <44px, Compliance upload non-functional, Sales/Tasks kanban requires horizontal scroll, Estimate line-item tables can't be edited on touch.
- **Email change / account management.** Password reset works, but no "I want to change my email" UX or account-merge surface.

### Medium
- **Notification trigger catalog is sparse.** Only 5 triggers: `lead_created`, `bid_invitation`, `bid_awarded`, `project_commenced`, `task_due`. Missing: schedule slip, change-order created, selection due, draw requested, invoice received, photo uploaded, walkthrough item assigned.
- **No notification digest mode.** Either real-time or nothing — no "daily digest at 7am" toggle.
- **No "working hours / time-off"** setting for Tyler (affects auto-scheduling and reminder timing).
- **`Schedule.tsx` reads all projects + all tasks** in unbounded queries on mount.
- **No audit log / activity feed** for admin operations (who changed what, when).
- **No data export per client / per project** for closeout handoff.
- **`DesignerTodayFeed` links to `/designer-portal/selections`** which doesn't render as a tab today (the deep tab link ignores the URL param).
- **`/financials/reports` is a "coming soon"** surface (per May 28 audit). Newer `Reports.tsx` has 6 reports — decide which is canonical.

### Nice-to-have
- Saved views/filters per user on Projects, Tasks, Contacts.
- Bulk actions on Projects (archive multiple, reassign PM).
- Slack/Teams integration for notifications.
- API access for power users.
- Health-check page for admin (Firestore reads/min, function error rate).
- Per-client branded portal theming.

---

## Themes that keep recurring

- **Dead links across personas.** Sidebar entries → 404 or silent dashboard fallback. The client portal sidebar bug pattern is identical to the Designer Portal sidebar bug we just fixed (`c1fd90b`). Worth a systematic sweep of every persona's nav.
- **Built-but-unmounted features.** `FastFinancialCard`, `WeatherForecast`, `/financials/reports`, `NotificationCenter` in portal layouts — code exists but isn't rendered on the surfaces that need it.
- **One-way data flows.** Designer recommends → client approves → GC has no reconciliation view. Sub bids → GC awards → no contract auto-draft. Selection overage → no auto-CO. The "next step in the workflow" is consistently missing.
- **Tyler-only knowledge that should be system knowledge.** Sub on-time %. Days since client last logged in. Which bid invites haven't been responded to. Which selections are about to block downstream bids. All derivable from data the app already stores; just not surfaced.
- **Notification engine is under-built.** 5 triggers, no per-user preferences, no digest, no escalation ladders. This is the single biggest leverage point for both outcomes — half the gaps above evaporate if the notification engine pushes the right info to the right person at the right time.

---

## File anchors (verified on origin/main)

- `client/src/pages/SkyelineClientPortal.tsx` — TABS array vs `client/src/components/layout/ClientSidebar.tsx` sidebar items
- `client/src/pages/SubcontractorPortal.tsx` — Compliance Upload toast stub
- `client/src/components/search/GlobalSearch.tsx` — calls dead `/api/search`
- `client/src/components/communications/ClientMessenger.tsx` — single-thread design
- `client/src/components/client-portal/SelectionsBoard.tsx` — no recommendation rationale embed
- `client/src/pages/Schedule.tsx` + `client/src/pages/GlobalSchedule.tsx` — duplicated, GlobalSchedule has hardcoded "7"
- `functions/src/notifications/triggerCatalog.ts` — only 5 triggers
- `client/src/pages/DesignerPortal.tsx` (global) + `client/src/pages/ProjectDesigner.tsx` (project-scoped, room-by-room) — both exist with overlapping data shapes
- `docs/Mobile_Optimization_Audit.md` — 42 mobile issues enumerated, most P0/P1 still pending
- `docs/Security_Exposure_Assessment.md` — separate doc, security concerns including 46 unauthed Cloud Function endpoints
