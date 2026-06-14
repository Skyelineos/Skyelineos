# Master Task Library & Project Task Template System

Durable reference for the reusable task system that turns the home-building
process into an operating system: one editable **Master Task Library** →
copied into each project as an independent **Project Task** list → improved at
closeout via **admin-approved promotions** back into the master.

## Mental model (system rules)

1. **Master tasks are templates.** `masterTasks` collection. Admin-managed.
2. **Project tasks are copies.** `projectTasks` collection. Independent after
   generation — editing one **never** touches the master.
3. **Master edits only affect FUTURE generations.** No retro-apply to live
   projects (a future "apply master update" hook is stubbed but not built).
4. **Archived master tasks are never copied** into new projects.
5. **Every skipped task requires a reason** (`changeReason`). Enforced server-side.
6. **Quality-gate tasks require acceptance-criteria confirmation to complete.**
7. **Closeout improvements are never auto-applied** — admin approval required.

## Data model

Shared types: `shared/taskLibrary-types.ts` (client) + a parallel copy of the
enums in `functions/src/taskLibrary/` (the functions build can't import `shared/`).

| Collection | Purpose | Rules |
|---|---|---|
| `masterTasks` | The editable library (templates) | read `isGC()`, write `isAdmin()` |
| `projectTasks` | Per-project independent copies (`projectId` field) | read staff + client(visible) + sub(visible); write `isGC()`; delete `isGCOnly()` |
| `taskImprovements` | Closeout suggestions awaiting admin review (`projectId` field) | read `isAdmin()`, write Cloud-Function-only |

Field lists are documented in `shared/taskLibrary-types.ts` (`MasterTask`,
`ProjectTask`, `TaskImprovement`). Phases, statuses, roles, tags, and badge
maps are all exported from there.

### Phases (lifecycle order)
Lead Capture & Qualification → Preconstruction → Procurement, Scheduling &
Project Controls → Site Prep & Foundation → Framing & Dry-In → MEP Rough,
Inspections, Insulation & Drywall → Finishes & Commissioning → Punchlist,
Closeout & Warranty.

## Backend — `functions/src/taskLibrary/`

All routes fold into the shared `api` Express app (org IAM blocks new Cloud Run
services). Registered via `registerTaskLibrary(app, db)` in `functions/src/index.ts`.

| Method & route | Auth | Purpose |
|---|---|---|
| `POST /api/taskLibrary/master/seed` | admin | Idempotent baseline seed (by `taskCode`) |
| `POST /api/taskLibrary/master` | admin | Create master task (version 1) |
| `PATCH /api/taskLibrary/master/:id` | admin | Edit (bumps `version`) |
| `POST /api/taskLibrary/master/:id/archive` · `/unarchive` | admin | Soft delete / restore |
| `POST /api/taskLibrary/master/reorder` | admin | Reorder within phase (`orderedIds`) |
| `GET /api/taskLibrary/projects/:id/generate/preview` | staff | Count by phase for current selection |
| `POST /api/taskLibrary/projects/:id/generate` | staff | Copy active master → project (idempotent on `taskCode`) |
| `POST /api/taskLibrary/projects/:id/tasks` | staff | Add a custom project task |
| `PATCH /api/taskLibrary/projects/:id/tasks/:taskId` | staff | Update project task (validates skip reason + quality gate) |
| `DELETE /api/taskLibrary/projects/:id/tasks/:taskId` | staff | Delete a **custom** task (copied tasks must be skipped, not deleted) |
| `POST /api/taskLibrary/projects/:id/closeout/analyze` | admin | Generate improvement suggestions |
| `POST /api/taskLibrary/improvements/:id/resolve` | admin | Approve/reject; applies approved change to master |

Reads in the UI are **live Firestore `onSnapshot`** (not API GETs) for
real-time boards. Mutations go through the API for server-side validation.

## Frontend

| File | Route / usage |
|---|---|
| `client/src/pages/MasterTaskLibrary.tsx` | `/master-tasks` (admin) — library board, filters, add/edit/archive, reorder |
| `client/src/components/taskLibrary/MasterTaskModal.tsx` | Add/edit master task |
| `client/src/pages/ProjectBuildPlan.tsx` | `/projects/:id/build-plan` — generate + board |
| `client/src/components/taskLibrary/GenerateTasksModal.tsx` | Tag-group selector + preview + confirm |
| `client/src/components/taskLibrary/ProjectTaskBoard.tsx` | Phase-grouped board + add custom task |
| `client/src/components/taskLibrary/ProjectTaskDrawer.tsx` | Task detail: status, criteria, photos/docs, links |
| `client/src/pages/ProjectCloseout.tsx` | `/projects/:id/closeout` (admin) — lessons learned |
| `client/src/components/taskLibrary/PromoteImprovementsModal.tsx` | Per-suggestion action picker |
| `client/src/lib/taskLibrary/api.ts` | Client API helpers (surface server error messages) |

Nav: "Master Tasks" in the admin sidebar Management group; "Build Plan" +
"Lessons Learned (Closeout)" in the project sidebar.

## Seed data

`functions/src/taskLibrary/masterTasks.seed.ts` — ~50 baseline tasks across all
8 phases (lead → warranty), tagged for optional groups (hillside, basement,
pool, septic, well, HOA, ADU, elevator, long-lead windows, etc.). Easy to edit:
change the array and re-run the seed. Seeding is idempotent on `taskCode`.

**To seed:** admin opens `/master-tasks` (empty state) → "Load baseline
template", or `POST /api/taskLibrary/master/seed` with an admin token.

## Future integrations (stubs in place)

Project tasks carry nullable link fields wired for later modules:
`scheduleTaskId` (Gantt), `drawRequestId` (draws/payment), `changeOrderId`
(change orders), `clientSelectionId` (designer portal), `warrantyItemId`
(warranty), `inspectionId` (inspections). `drawMilestoneRelevant` and the
client/subcontractor visibility flags are ready for the client milestone
calendar and the sub/designer portals. An AI "recommend tasks from project
details" pass can read the master library + project tags.

## Known limitations

- Reorder is up/down buttons (no drag-and-drop yet).
- Photo/document upload is add-by-URL placeholder; real Firebase Storage upload
  wires into `ProjectTaskDrawer.addAttachment`.
- Cross-project "skipped frequently" reads all `projectTasks` (fine for a single
  builder; add aggregation if volume grows).
- "Apply master update to a live project" is intentionally not built (system
  rule #3) — only future generations get master edits.
