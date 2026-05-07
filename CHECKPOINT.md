# Skyeline Odyssey — Session Checkpoint
**Last updated:** 2026-05-07 (Session 7 — late-night build sprint)
**Live URL:** https://skyelineos.web.app
**Firebase project:** skyelineos (**BLAZE** plan — upgraded 2026-05-06)
**Deploy command:** `npm run build && firebase deploy --only hosting,firestore:rules,firestore:indexes,functions`

---

## Session 7 — Major Additions (2026-05-06 → 2026-05-07)

### 1. Takeoff Tool (Phase 1) — Plan PDF measurements
- `client/src/components/takeoff/` — full PDF.js + SVG overlay measurement tool
  - `PdfCanvas.tsx` — PDF.js renderer with PDF user-space coordinate conversion (zoom-stable)
  - `MeasurementOverlay.tsx` — SVG overlay for linear/area/count
  - `CalibrationDialog.tsx` — set scale via known dimension
  - `TakeoffStudio.tsx` — main container, Firestore-backed
  - `lib/geometry.ts` — distance, polygon area (shoelace), unit conversions
  - `lib/types.ts` — types
- Page: `/projects/:id/takeoff` — accessible to GC, projectManager, designer, admin
- Designer Portal also has a Takeoff tab
- Firestore: `projects/{id}/takeoffs/{takeoffId}` — coordinates stored in PDF user space
- Storage: `projects/{id}/takeoffs/{takeoffId}/{filename}.pdf`
- Push-to-Estimate stub (passes line items via callback)
- **Phase 2 deferred:** volume measurements, multi-page nav, AI auto-takeoff

### 2. Import Center — 17 templates + Google Sheets URL
- File: `client/src/pages/ImportCenter.tsx` (extended substantially)
- **NEW templates added** (10 total): Cost Breakdown, Draw Schedule, Punch List, Change Orders, Design Selections, Jobsite Inspection, Bid History, Expenses/Bills, Permits & Inspections, Lot/Land Inventory
- Existing templates: Clients, Subcontractors, Projects, Schedule, Catalogs, Employees, Invoices
- **Google Sheets URL paste support** — drop a shared sheet URL and parse-as-CSV via export endpoint
- **New collections:** `permits/{id}`, `lots/{id}` (Firestore rules added)

### 3. Job Template Editor — Full JACK-parity rewrite
- File: `client/src/components/templates/JobTemplateEditor.tsx`
- **Per-task fields:** name, description, category, department, assignee role, tags, date-type (Fixed vs Dependent), days-offset, dependsOn task, checklist, notify-on-assign/due/complete
- **Filter tabs by category:** All / Schedule / Cashflow / Selections / Safety/QC / Administration
- **TaskEditModal** — full edit dialog with all fields
- **ApplyToJobModal** — pick project + start date → generates real Tasks via topological due-date resolution (handles dependent task chains correctly + cycle detection fallback)
- Notifies the applier on completion

### 4. Walkthrough Capture (field media → assigned tasks)
- Files: `client/src/components/walkthrough/{WalkthroughCapture,WalkthroughList}.tsx`
- **Floating Action Button** on `/projects/:id/overview`
- iPhone/Android camera capture via `<input type="file" capture="environment">` for photo + video
- Auto-creates a walkthrough record + a corresponding Task assigned to the chosen sub
- Auto-fires `walkthrough_assigned` notification to the sub
- WalkthroughList component: status filter pills (All/Open/In Progress/Done), media cards, inline status update
- Firestore: `projects/{id}/walkthroughs/{walkId}` — sub-only sees their assigned items
- Storage: `projects/{id}/walkthroughs/{filename}`

### 5. Phase 2 Notifications — Real Firestore-backed bell
- New: `client/src/lib/notifications.ts` — helper to create + mark-read
- Replaced `client/src/components/messaging/NotificationCenter.tsx` with live Firestore subscription
- Bell icon shows unread count badge in top nav
- Per-kind icons + colors (task_assigned, task_due, walkthrough_assigned, etc.)
- Click → marks read + navigates to link
- "Mark all read" bulk action
- Firestore: `notifications/{id}` collection (rule: each user reads only their own; any signed-in user can write)
- Index added: `userId + createdAt DESC`

### 6. Phase 3 Notifications — Cloud Functions LIVE
- `functions/src/notifications/dispatch.ts` — Firestore trigger on `notifications/{id}` create
  - Looks up recipient's user/contact email + phone + prefs
  - Sends via SendGrid + Twilio (currently no-ops with placeholder secrets — real keys needed)
  - Per-kind opt-in/opt-out support via `notificationPrefs.kinds[kind]`
- `functions/src/notifications/scheduledDueSweep.ts` — daily 7am MT
  - Scans tasks due in next 24h, status ≠ done
  - Creates `task_due` notifications (idempotent via `dedupeKey`)
- Functions deployed: `dispatchNotification`, `dueSweep`, `api`
- **Secrets in Secret Manager:** SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, APP_BASE_URL, **ANTHROPIC_API_KEY** (real key in)
- Dependencies installed: `@sendgrid/mail`, `twilio`

### 7. Subscriptions Tracker (admin page)
- File: `client/src/pages/Subscriptions.tsx`
- Route: `/subscriptions` (admin-only)
- Sidebar + MobileNav links under Management
- Auto-seeds `subscriptions` collection on first admin visit with 7 services (Firebase, Anthropic, OpenAI, SendGrid, Twilio, Reimagine Home, Domain)
- Per-row: name, vendor, category, status, pricing, monthlyEstimate, lastMonthActual, **API key (masked, reveal/copy buttons)**, signup/dashboard URLs, notes
- Top strip: Projected this month / Last month actual / Variance
- Bottom card: total run-rate vs JACK ($299) / BuilderTrend
- Firestore: `subscriptions/{id}` — admin-only read+write

### 8. Mobile sidebar fix
- Bug: `sheet.tsx` had hardcoded inline `backgroundColor` style that overrode `className`. Fixed by spreading user-provided `style` after defaults.
- `MobileNav.tsx` updated: explicit dark slate-900 bg, white text, gold (#C9A96E) active, slate-200 inactive items, hover handlers.
- Users moved to bottom of mobile nav.

### 9. 404 fix on portals
- `/client-portal` and `/subcontractor-portal` (no tab) → 404 because routes were `/client-portal/:tab*` only.
- Added base routes that render the same component.

---

## Other Claude session work (Session 6.5 — overnight 2026-05-06 ~02:30 UTC)
The other Claude Code session in the terminal shipped 4 features in parallel agents:
- **Estimates Kanban** — 5-column pipeline (Pending / In Progress / Waiting for Quotes / Internal Approval / Archived) with toggle to list view
- **Estimate Costings Tab** — 13 pre-seeded cost groups with formula bar (Builder Cost + Markup = Owner Price)
- **Job Template scaffolding** — base task list with day-offset (which Session 7 then dramatically extended)
- **Document Template Editor** — letterhead preview + rich-text body

---

## Costs as of 2026-05-07
- Firebase Blaze plan active (no current charges — within free tier)
- Anthropic API key live, $5–10 free credit
- Subscriptions tracker shows projected ~$30/mo run-rate (Anthropic + Firebase active; rest are trial/paused)

## PENDING / Next session priorities
1. **Test notification system end-to-end** — capture walkthrough as GC, log in as sub on phone, confirm in-app notification + click-through
2. **Real SendGrid + Twilio API keys** — sign up + replace placeholder secrets via `firebase functions:secrets:set`
3. **AI Bill OCR** — `bills` collection + Cloud Function with Claude vision; UI to upload bill image and confirm extracted data
4. **AI Estimate Drafter** — feed plan PDF + scope description, get first-draft line items
5. **AI Rendering Studio** — replace "Coming Soon" with real img-gen via OpenAI gpt-image-1
6. **Per-task assignee mapping** for template apply (role → specific user)
7. **Rotate Anthropic API key** (was sent over WhatsApp — defense-in-depth, rotate after 24-48h)

## Test accounts (unchanged)
- gc: testgc@skyelineos.com / SkyeTest2024!
- designer: testdesigner@skyelineos.com / SkyeTest2024!
- client: testclient@skyelineos.com / SkyeTest2024!
- Tyler: tyler@skyelinehomes.com (admin)

## Known issues / cleanup items
- `tester@gmail.com` user still exists — delete via Firebase Console
- `ModernTimelineBuilder.tsx` has pre-existing TS errors (not blocking)
- 4 large bundle chunks (>500kB) — could code-split later

---

## All previous sessions' work (1-6)
[Original CHECKPOINT.md content preserved below — pre-Session 7]

### Firebase Project (now Blaze plan as of Session 7)
- **Hosting + Firestore + Auth + Functions + Storage**: `skyelineos`
- **Live URL**: https://skyelineos.web.app
- **Spark → Blaze upgraded:** 2026-05-06 (Session 7)

### Bugs fixed previous sessions
- `DesignerPortal.tsx` — temporal dead zone crash fixed
- `functions/src/index.ts` — `authMiddleware` defined
- Seed script `serverTimestamp()` inside array — replaced
- Firestore rules: selections, schedules, draws, takeoffs, walkthroughs, permits, lots, notifications, subscriptions all added

### Major features built before Session 7
- DesignerPortal with selections workflow
- AIRenderingStudio (Coming Soon placeholder)
- SelectionsCatalog
- ProjectOverview / ProjectDetail / ProjectEstimates / ProjectBids / ProjectSchedule / ProjectBudget / ProjectDocuments / ProjectPhotos
- ClientPortal (8 tabs)
- SubcontractorPortal (8 tabs)
- AdminPortal + UserManagement
- 19 Schedule components (DHtmlx Gantt + custom views)
- Real-time messaging w/ threading + mobile UI
- Safety forms (4 form types)
- Site Log
- Comms Log
- Trades management
- Catalogs
- Templates
- Automations (rules-based, schema only — execution engine deferred)
