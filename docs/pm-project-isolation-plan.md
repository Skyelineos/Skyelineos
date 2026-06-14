# Project Manager — project isolation plan

**Status:** Gateway shipped. Full subcollection isolation NOT yet shipped (needs
the Firestore rules emulator to validate safely). This doc is the durable plan.

## Goal
A `projectManager` should only be able to see/touch the jobs they're assigned to
(`projects/{id}.assignedUserIds` contains their uid). Admin + GC see everything.

## What's shipped (safe, no emulator needed)
1. **Client query scoping** — `useOptimizedProjects` filters the projects
   listener by `assignedUserIds array-contains <uid>` for a PM. (PR: PM role work.)
2. **Project-document gateway** — `firestore.rules` on `projects/{projectId}`:
   - `read`: `isGCOnly() || pmInList(resource.data) || client/designer/sub clauses`
   - `create`: `isGCOnly()` (PMs can't create projects — D-001)
   - `update`: `isGCOnly() || pmInList(resource.data)`
   - `pmInList(projectData)` helper: PM ∧ uid ∈ assignedUserIds.

   Because the app loads the project document before rendering any project
   screen, an unassigned PM can't open or edit a project they're not on. This
   closes the **UI-level** leak.

## Why the rest is hard (the blocker)
The role predicates are interlocked:

```
isStaff()    = isGC()                              // admin | gc | projectManager
isDesigner() = (role == 'designer') || isStaff()   // ⟸ PM admitted here
isSub()      = (role == 'sub')      || isStaff()   // ⟸ PM admitted here
```

Almost every project SUBcollection rule (`rooms`, `selections`, `rfis`, `draws`,
`budgetItems`, `takeoffs`, `lumberTakeoffs`, `walkthroughs`, `schedules`,
`channels`, `moveInBinder`, `bidPackages`) grants access via `isGC()` **and/or**
`isDesigner()`/`isSub()`. So a PM is admitted through multiple doors. Swapping
just `isGC()` for a scoped predicate does nothing — the PM still enters via the
`isDesigner()`/`isSub()` fallback.

There is also a class of **top-level, projectId-keyed** collections (`tasks`,
`bids`, `estimates`, `documents`, `changeOrders`, `purchaseOrders`, `invoices`,
`financials`, `siteLogs`) read by unfiltered list queries on company-wide pages
(e.g. `/tasks`). Scoping those for a PM requires the *client* queries to add a
`projectId` constraint first, or the listens will be rejected outright.

## The refactor (do with the emulator)
1. **Add scoped predicates** (projectId in path):
   ```
   isAssignedPM(pid)        = isProjectManager() && uid ∈ get(projects/pid).assignedUserIds
   isProjectScopedStaff(pid)= isGCOnly() || isAssignedPM(pid)
   ```
2. **Remove the PM backdoor** from the shared fallbacks for project rules. Two
   viable shapes:
   - (a) Keep `isDesigner()/isSub()` for real designers/subs only
     (`isStaff()` → `isGCOnly()`), and in every project subcollection rule add
     `isProjectScopedStaff(projectId)` so an assigned PM keeps access. Touches
     ~30 rules. **Recommended.**
   - (b) Introduce `isDesignerOnly()`/`isSubOnly()` (no staff fallback) and use
     those in project rules, leaving `isDesigner()/isSub()` as-is elsewhere.
3. **Top-level projectId-keyed collections:** decide per collection whether a PM
   sees company-wide (current) or only-assigned. If only-assigned, the rule needs
   `isProjectScopedStaff(resource.data.projectId)` AND the client list queries on
   `/tasks`, `/bids`, etc. must add a `projectId in [...assigned]` / per-project
   constraint, or page through assigned projects. This is the largest piece.
4. **collectionGroup caution:** `bidRequests` is queried as a collectionGroup by
   the sub portal. Rules that run `get()` inside a collectionGroup query can
   silently reject docs (see the existing comment on that rule). Do NOT add a
   `get()`-based PM check to `bidRequests`/`bidPackages` without testing the
   collectionGroup path.
5. **Test matrix (emulator, `@firebase/rules-unit-testing`):** for each
   collection × {admin, gc, assignedPM, unassignedPM, designer, sub, client},
   assert read/create/update/delete allow/deny. Especially assert an
   *unassigned* PM is denied on every project subcollection.
6. **Deploy order:** ship client query constraints first, then rules, then smoke
   test a PM login against an assigned and an unassigned project.

## Residual risk while only the gateway is shipped
A PM cannot reach unassigned projects through the app, but a determined PM with
direct Firestore access could still read some unassigned-project *subcollection*
docs via the `isDesigner()/isSub()` fallback. Acceptable for a trusted internal
hire; close it with the refactor above when there's emulator time.
