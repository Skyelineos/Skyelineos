# Role Taxonomy Audit

**Status:** Findings only. No code changes have been made. Tyler must review before any refactor begins.

The audit is worse than the original framing implied. There are **20 distinct role string values** in active use, **4 separate `UserRole` TypeScript types**, and **5 separate normalizer implementations** that disagree with each other. The Firestore rules use a different vocabulary than the React route guards, and the Cloud Functions write a role string (`pending_team`) that no other layer recognizes.

---

## 1. Every role string that exists in the codebase

| Value | Where it's written | Where it's read | Notes |
|---|---|---|---|
| `admin` | Universal | Universal | The only role with consistent meaning everywhere. |
| `gc` | App.tsx route guards (allowed-roles arrays), functions/src/index.ts line 1101 + 1606 (auth middleware checks), UserManagement.tsx line 113 (POST body), ContractEditor.tsx line 130, CLAUDE.md | firestore.rules `isGC()` line 20, every page guard, every Cloud Function role check | The de-facto "staff" role today. Lives entirely in raw form — never normalized at write time. |
| `project_manager` | shared/auth-types.ts UserRole, shared/types.ts line 240 UserRole, client/src/lib/queryClient.ts line 124 (test fixture) | normalizers as INPUT only | Type exists but no production code writes it as a user role. |
| `projectManager` (camelCase) | RoleGuard.tsx UserRole type, useRoleAccess.ts UserRole type, App.tsx allowed-roles arrays, roleRedirects.ts `shouldRedirectUser` comparison line 83+91 | All 4 normalizers normalize various inputs INTO this | This is the canonical normalized form on the client. But firestore.rules has never heard of it. |
| `projectmanager` (lowercase) | Output of `roleRedirects.ts` after `.replace(/_/g,'')` | Only its own switch | Dead branch — the redirect helper compares against `'projectManager'` after normalizing to `'projectmanager'`. Never matches. |
| `pm` | shared/auth-types.ts normalizeRole input | nowhere | Documented in roleMap but no code writes it. |
| `client` | AuthContext fallback (line 154), Sales.tsx, ContactsTab, Contacts.tsx, NewClientModal, ClientPortal pages, VcardImportZone, AdminViewContext type | firestore.rules `isClient()` line 24 | Consistent. |
| `homeowner` | nowhere as user role | roleRedirects.ts normalizer INPUT line 20, deriveUserRole INPUT line 28 (Cloud Functions) | Dead input alias — produces `client`. |
| `sub` | functions/src/auth/ensureContactAuth.ts default output (line 40), functions/src/auth/contactAuthBackfill.ts (line 35), SubcontractorPortal.tsx line 621, ImportCenter.tsx seed data, CLAUDE.md, contracts/types.ts | firestore.rules `isSub()` line 32, App.tsx allowed-roles arrays (line 487, 496), Sub portal queries, ClaimContactDialog | Canonical client-side; canonical in rules; **but RoleGuard normalizes it AWAY to `subcontractor`**. |
| `subcontractor` | shared/auth-types.ts UserRole, RoleGuard UserRole, useRoleAccess UserRole, App.tsx allowed-roles arrays, AdminViewContext type, useAutoAdminView, EstimateForm line 260, BidsTab line 475, skyelineSubcontractors.ts, contracts/types.ts | Same files plus normalizers | Co-exists with `sub` everywhere. RoleGuard accepts BOTH for the sub portal route. |
| `designer` | Universal | Universal | Consistent. |
| `accountant` | shared/auth-types.ts UserRole only | shared/auth-types.ts getRolePermissions only | **Orphaned.** No code writes it. No UI accepts it. No route gates on it. |
| `pending_gc` | AuthContext.tsx line 134 + 144 (default for any new Firebase Auth sign-up whose contact wasn't pre-stamped) | ProtectedRoute.tsx line 87 (blocks the user with a pending-approval screen) | Not in any UserRole TypeScript type. Type-unsafe. |
| `pending_team` | functions/src/auth/ensureContactAuth.ts line 34, functions/src/auth/contactAuthBackfill.ts line 29 (when a contact has role `team` or `employee`) | **nowhere** | **Critical:** users with this role have no access path — no rule allows them, no UI checks for them, ProtectedRoute doesn't recognize the pending state. They get the `client` fallback in normalizers. |
| `vendor` | Sales-side contact data, skyelineSubcontractors.ts | roleRedirects normalizer line 24 (→ `subcontractor-portal`), deriveUserRole input line 37 (→ `sub`) | Dead alias — only matters at contact creation, never as a user role. |
| `supplier` | nowhere as user role | deriveUserRole input line 38 (→ `sub`) | Dead alias on the user-role side. |
| `team` | nowhere as user role | deriveUserRole input line 32 (→ `pending_team`) | Dead alias. |
| `employee` | client/src/lib/contracts/types.ts line 107 (contract-author role union) | nowhere as user role | Contract author role is its own little universe — separate from auth user roles. |
| `other` | client/src/components/sales/VcardImportZone.tsx line 290 (when "Add as Contacts" mode is picked) | nowhere | Contact `role` field, not user role. But the contact-auth Cloud Function will see it and map it to `sub` (default branch). Probably wrong. |
| **(missing)** Tyler's proposed `staff` | nowhere yet | nowhere yet | Doesn't exist. |
| **(missing)** Tyler's proposed `pending` | nowhere yet | nowhere yet | Doesn't exist. |

### Surprises Tyler didn't anticipate

> 🚨 **`pending_team`** is written by `functions/src/auth/ensureContactAuth.ts` and `contactAuthBackfill.ts`. Tyler didn't mention this. It's a parallel pending state to `pending_gc` that no client code recognizes. Any contact whose `role` is `team` or `employee` gets stuck in a state that doesn't load any portal.

> 🚨 **`firestore.rules` doesn't know about `projectManager` at all.** It only checks for `'gc'`. If client code writes `projectManager` to a user doc (the normalizers can output that), the user fails `isGC()` and loses GC-level access. Today nothing writes `projectManager` directly to Firestore — but the type implies it's a real value.

> 🚨 **`shouldRedirectUser` in roleRedirects.ts (lines 75–117) is partially dead code.** It compares the input `UserRole` to literal `'projectManager'` (camelCase), but its sibling helper `getDefaultRouteForRole` (and the global normalizers) outputs `'projectmanager'` (lowercase). The two branches that should restrict admin/PM-only routes can never fire correctly.

> 🚨 **`shared/types.ts` line 240 defines a SECOND copy of `UserRole`** identical to `shared/auth-types.ts`. Whichever one a file imports determines its behavior. There's no single source of truth even within the shared/ folder.

> 🚨 **`client/src/types/selections.ts` line 114** has a field `authorRole: string` with the comment `// 'gc' | 'admin' | 'designer' | 'client'`. This is a Firestore-written field on selection docs. Migration must touch this collection too if any docs exist.

> 🚨 **AuthContext "test mode"** (lines 70–95) injects a fake user with `role: 'admin'` from localStorage. After any role refactor, this test path will silently still grant admin access regardless of role-string changes — fine for dev, but it means tests can't validate the new normalization end-to-end.

> 🚨 **`contracts.role`** (`client/src/lib/contracts/types.ts` line 107) is **a separate role union** for contract authors: `'gc' | 'client' | 'subcontractor' | 'designer' | 'employee'`. This is contract-document metadata, not auth role. Don't touch unless we want to unify, but flagging — `'employee'` here is the only place that value exists.

---

## 2. Four parallel UserRole type definitions

```ts
// shared/auth-types.ts:16
type UserRole = 'admin' | 'project_manager' | 'client' | 'subcontractor' | 'designer' | 'accountant';

// shared/types.ts:240   ← DUPLICATE, identical to above
type UserRole = 'admin' | 'project_manager' | 'accountant' | 'client' | 'subcontractor' | 'designer';

// client/src/hooks/useRoleAccess.ts:4
type UserRole = 'client' | 'subcontractor' | 'designer' | 'projectManager' | 'admin';   // no accountant; camelCase

// client/src/components/auth/RoleGuard.tsx:7
type UserRole = 'admin' | 'projectManager' | 'client' | 'subcontractor' | 'designer';   // no accountant; camelCase
```

`roleRedirects.ts` imports `UserRole` from `@/hooks/useRoleAccess` — so it inherits the camelCase set. But `shouldRedirectUser` compares against a string that the normalizer it relies on doesn't produce. Bug in the dead branch.

---

## 3. Five normalizer implementations (all slightly different)

| Function | File | Output set | Fallback | Maps `gc` to | Notes |
|---|---|---|---|---|---|
| `normalizeRole()` | shared/auth-types.ts:18 | snake_case | `client` | does NOT handle `gc` at all → falls through to `client` | Only one that handles `pm`/`project_manager`/`projectManager`. Doesn't handle `homeowner`, `vendor`, `pending_*`. |
| `getUserRole()` (hook) | client/src/hooks/useRoleAccess.ts:14 | camelCase | `client` | `projectManager` | Doesn't handle `homeowner`, `vendor`, `pending_*`, `accountant`. |
| `getUserRole()` (guard) | client/src/components/auth/RoleGuard.tsx:10 | camelCase | `client` | `projectManager` | **Verbatim duplicate** of the hook version. |
| Inline switch | client/src/utils/roleRedirects.ts:13 | (returns route paths) | `/sign-in` | `/projects` | Accepts `homeowner`, `vendor`. Strips `_` THEN compares, but most callers compare against camelCase forms it never outputs. |
| `deriveUserRole()` (functions) | functions/src/auth/{ensureContactAuth,contactAuthBackfill}.ts | snake_case + `pending_team` | `sub` | n/a (input is contact.role, not user.role) | **Different fallback (`sub`).** Outputs `pending_team` for `team`/`employee` inputs. |

---

## 4. Proposed canonical taxonomy

Updated per Tyler's clarification: team members split into 4 distinct roles (not a single `staff` abstraction). Permissions matrix sits on top, layered per-user.

```ts
export type UserRole =
  // Owner — full access; can manage staff and toggle permissions.
  | 'admin'
  // Team-member roles (Skyeline employees + outside accountant).
  // Each has a sensible default permission set; admin can override per user.
  | 'project_manager'    // PM — runs projects end-to-end; estimate/bid/schedule edit.
  | 'office_staff'       // Office — contacts, CRM, documents, scheduling support.
  | 'field_staff'        // Field — superintendents, foremen; schedule + tasks + site logs + photos.
  | 'accountant'         // AP/AR + QBO sync; minimal project edit.
  // External counterparties.
  | 'client'             // Home owner.
  | 'sub'                // Subcontractor / vendor / supplier — sub portal.
  | 'designer'           // Interior designer — designer portal.
  // Onboarding.
  | 'pending';           // Awaiting admin approval — replaces both pending_gc and pending_team.
```

**Naming convention:** snake_case for multi-word roles (`project_manager`, `office_staff`, `field_staff`). Reason: Firestore rules can compare string literals directly without case acrobatics, and snake_case has been the dominant convention in `shared/auth-types.ts` already. The normalizer strips underscores during comparison so `projectManager`, `project-manager`, etc. all still resolve.

### Mapping table (every legacy value → canonical)

| Legacy value (any source) | Canonical | Reasoning |
|---|---|---|
| `admin` | `admin` | Identity. |
| `gc` | **`project_manager`** | The de-facto "Skyeline team" role today had full project access — closest match is PM. Admin reviews after migration and demotes specific people to `office_staff` or `field_staff` if needed. |
| `project_manager`, `projectManager`, `projectmanager`, `pm` | `project_manager` | Identity / casing normalization. |
| `staff` | **`project_manager`** | Catch-all from earlier proposal — assume PM-level until admin says otherwise. |
| `office_staff`, `officeStaff`, `office` | `office_staff` | Identity / casing. |
| `field_staff`, `fieldStaff`, `field` | `field_staff` | Identity / casing. |
| `accountant` | `accountant` | Identity. |
| `client` | `client` | Identity. |
| `homeowner` | **`client`** | Dead alias today. |
| `sub` | `sub` | Identity. |
| `subcontractor` | **`sub`** | Single canonical form. |
| `vendor`, `supplier` | **`sub`** | They share the sub portal today. Contact-role can still distinguish (see §10). |
| `designer` | `designer` | Identity. |
| `pending_gc`, `pending_team` | **`pending`** | Unified pending state. |
| `team`, `employee` | **`pending`** | These came in as *contact* roles for new hires. Migration through admin approval is correct — admin assigns them to `project_manager` / `office_staff` / `field_staff` / `accountant`. |
| anything else | **`pending`** | Fail-closed default. |

---

## 5. Files that need changes

**Type definitions (single source of truth):**
- `shared/auth-types.ts` — replace `UserRole`, `normalizeRole()`, `getRolePermissions()`. Add `pending` to permission map.
- `shared/types.ts:240` — **delete the duplicate UserRole**. Re-export from auth-types.ts instead.
- `client/src/hooks/useRoleAccess.ts` — replace `UserRole`, `getUserRole`, `hasRole`, all `canAccess*` helpers. Use the shared normalizer.
- `client/src/components/auth/RoleGuard.tsx` — delete local `UserRole` and `getUserRole`; import both from shared/auth-types.ts. Update `AdminOnly`, `ProjectManagerOnly` (rename to `StaffOnly`), `SubcontractorOnly` (rename to `SubOnly`), etc.

**Route guards:**
- `client/src/App.tsx` — every `['admin', 'gc', 'projectManager']` array → `['admin', 'project_manager', 'office_staff', 'field_staff']` as the default (all team roles can see it; admin restricts via permissions matrix later). Specific routes get tighter sets: Finance/Accounting → `['admin', 'project_manager', 'accountant']`; Field/Schedule/Tasks → all four staff roles. Every `['admin', 'sub', 'subcontractor']` → `['admin', 'sub']`. (~60 route guard rewrites; some need per-route decisions about which staff roles see them — flag the financial/accounting ones for Tyler's review during Phase 1.)
- `client/src/utils/roleRedirects.ts` — rewrite `getDefaultRouteForRole`, `isAdminOnlyRoute`, `isProjectManagementRoute`, `shouldRedirectUser`. Remove `homeowner`, `vendor` branches.
- `client/src/auth/ProtectedRoute.tsx:87` — `user?.role === 'pending_gc'` → `user?.role === 'pending'`.

**Auth context + sign-up:**
- `client/src/auth/AuthContext.tsx:134, 144` — `pending_gc` → `pending`. Line 154 fallback (`client`) needs decision: keep as `client` or change to `pending`. **Recommend `pending`** — fail closed, not open.

**Pages + components writing role to Firestore:**
- `client/src/pages/Sales.tsx:1401` — `'client'` ✓ canonical
- `client/src/pages/SubcontractorPortal.tsx:621` — `'sub'` ✓ canonical
- `client/src/pages/Contacts.tsx:103, 167` — `'client'` ✓ canonical (these are CONTACT roles, decide whether to unify)
- `client/src/pages/ClientPortal.tsx:57, 66, 75, 86` — `'client'` ✓ (display fixtures)
- `client/src/pages/OdysseyClientPortal.tsx:198` — `'client'` ✓
- `client/src/components/sales/VcardImportZone.tsx:272` — `'client'` ✓ (contacts, not users)
- `client/src/components/sales/VcardImportZone.tsx:290` — `'other'` ⚠️ contact role not in canonical set; decide
- `client/src/components/sales/ManageImportedLeadsDialog.tsx` — same `'other'` usage in `apply('contact')` mode
- `client/src/components/admin/UserManagement.tsx:113` — POST body `role: 'gc'` → `'staff'`
- `client/src/components/dashboard/TeamAccessRequestsCard.tsx:41` — already `'admin'`, but verify the approve flow writes a real role
- `client/src/components/contracts/ContractEditor.tsx:130` — `role: 'gc'` → `'staff'` (if this is user role) or unchanged (if it's contracts' author-role concept)
- `client/src/components/contacts/NewClientModal.tsx:152` — `'client'` ✓
- `client/src/contexts/AdminViewContext.tsx:8, 13, 17, 19, 27, 30` — `'subcontractor'` → `'sub'` (8 occurrences in this one file)
- `client/src/hooks/useAutoAdminView.ts:24` — `'subcontractor'` → `'sub'`
- `client/src/lib/queryClient.ts:124` — test fixture `'project_manager'` → `'staff'`
- `client/src/lib/contracts/types.ts:107` — contract-author union: `'gc'` → `'staff'`, decide about `'employee'`
- `client/src/components/projects/EstimateForm.tsx:260` — `'subcontractor'` → `'sub'`
- `client/src/components/projects/BidsTab.tsx:475` — `'subcontractor'` → `'sub'` (this is legacy bid-tab code; double-check it's still alive)
- `client/src/components/photos/PhotosTab.tsx:59` — hardcoded `'Admin'` (capitalized!) — fix to `'admin'`
- `client/src/types/selections.ts:114` — `authorRole: string` comment + any code that writes this field
- `client/src/App-full-no-auth.tsx:52` — `role: 'admin'` — dead file? confirm before touching
- `client/src/hooks/use-auth-original.ts:114` — `'admin'` ✓, but file looks legacy; consider deleting

**Firestore rules:**
- `firestore.rules:15–32` — `isAdmin()`, `isGC()`, `isClient()`, `isDesigner()`, `isSub()` ALL need rewriting:
  - `isAdmin()` — unchanged
  - **Add `isTeam()`** — `getUserRole() in ['admin', 'project_manager', 'office_staff', 'field_staff', 'accountant']`. This is the new "GC-equivalent" gate. Keep `isGC()` as an alias of `isTeam()` for minimal call-site churn (every existing `isGC()` callsite stays correct), then deprecate the alias in a later cleanup.
  - **Add finer helpers** as needed: `isProjectManager()`, `isAccountant()` for finance-only rules. Don't pre-emptively add `isOfficeStaff()` / `isFieldStaff()` until a rule actually needs them.
  - `isSub()` — currently checks `'sub' || isGC()`; update to `'sub' || isTeam()`.
  - `isClient()`, `isDesigner()` — unchanged literal values.
- Every rule that calls existing helpers cascades for free. About 40 helper calls across the file — all stay correct because we're keeping the function names (with `isGC` as an alias of the new `isTeam`).

**Cloud Functions:**
- `functions/src/auth/ensureContactAuth.ts:25–42` — `deriveUserRole()`: `pending_team` → `pending`. Stop mapping `team`/`employee` to a special pending — they're just `pending`.
- `functions/src/auth/contactAuthBackfill.ts:20–37` — verbatim duplicate of above; same edit. (Consider extracting to a shared helper to avoid future drift.)
- `functions/src/index.ts:1101` — `role === 'admin' ? ['all'] : role === 'gc' ? ['read', 'write'] : ['read']` → `'gc'` becomes `'staff'`
- `functions/src/index.ts:1606` — `if (role === 'admin' || role === 'gc')` → `'staff'`

**Docs:**
- `CLAUDE.md:21–29` — replace the entire role table with the new taxonomy. Also fix the Firebase project ID (says `odyssey-cf118`; live is `skyelineos`).
- `PROJECT_OVERVIEW.md` — update the role references in the overview I just wrote.

---

## 6. Firestore docs that need migration

| Collection | Field | Migration |
|---|---|---|
| `users/{uid}` | `role` | Apply the mapping table from §4 to every doc. Add `updatedAt` server timestamp + `roleMigratedFrom` field for traceability. **Every `gc` user becomes `project_manager` by default** — admin reviews and demotes specific people to `office_staff` / `field_staff` / `accountant` in a follow-up admin UI pass. |
| `users/{uid}` | `permissions` | Audit — old `'gc'` role may have had inferred permissions in code that disappears. With the proposed Phase-2 permissions matrix, every team-role user starts with their role's defaults enabled (PM = full project; office = CRM + docs; field = schedule + site; accountant = finance) and admin toggles overrides per user. |
| `contacts/{id}` | `role` | **Tyler decides.** Two options: (a) leave contacts richer (`vendor`, `supplier`, `subcontractor`, `client`, `homeowner`, `employee`, `team`, `other`) and only normalize at user-creation time; or (b) collapse to the same canonical set as users. **Recommend (a)** — contact-role conveys business info (this person is a `vendor` vs a `subcontractor`) that the auth role would lose. The auth role is what their portal sees; the contact role is what your address book shows. |
| `selections/{id}` | `authorRole` | If any docs exist, rewrite `'gc'` → `'staff'`. |
| `_admin/contactAuthBackfill` | `completed` | Reset to `{completed: false}` so the backfill function re-runs once after the role migration to update its derived `users.role` writes. |

A separate cleanup script should also:
- Delete any `users/{uid}` doc whose role is `pending` AND `createdAt` is more than ~30 days old AND the user has never signed in (`firebase.auth().getUser()`). Reduces stale-account clutter. **Optional.**

---

## 7. Proposed `normalizeRole()` (final form)

```ts
// shared/auth-types.ts
export type UserRole =
  | 'admin'
  | 'project_manager'
  | 'office_staff'
  | 'field_staff'
  | 'accountant'
  | 'client'
  | 'sub'
  | 'designer'
  | 'pending';

// Set of canonical values for runtime checks (e.g. isTeamRole()).
export const TEAM_ROLES: ReadonlySet<UserRole> = new Set([
  'admin', 'project_manager', 'office_staff', 'field_staff', 'accountant',
]);

const LEGACY_TO_CANONICAL: Record<string, UserRole> = {
  // Identity
  admin: 'admin',
  project_manager: 'project_manager',
  office_staff: 'office_staff',
  field_staff: 'field_staff',
  accountant: 'accountant',
  client: 'client',
  sub: 'sub',
  designer: 'designer',
  pending: 'pending',

  // Legacy GC / staff-catchall → project_manager (admin reassigns specific
  // users to office_staff / field_staff after migration).
  gc: 'project_manager',
  staff: 'project_manager',
  pm: 'project_manager',
  projectmanager: 'project_manager',     // case-stripped variant
  projectManager: 'project_manager',     // explicit for readability

  // Casing variants of the new team roles
  officestaff: 'office_staff',
  officeStaff: 'office_staff',
  fieldstaff: 'field_staff',
  fieldStaff: 'field_staff',

  // Legacy sub-like
  subcontractor: 'sub',
  vendor: 'sub',
  supplier: 'sub',

  // Legacy client-like
  homeowner: 'client',

  // Legacy pending-like — both old states + the original contact-role names
  // that the Cloud Function pipeline used.
  pending_gc: 'pending',
  pending_team: 'pending',
  pendinggc: 'pending',
  pendingteam: 'pending',
  team: 'pending',
  employee: 'pending',
};

export function normalizeRole(input: unknown): UserRole {
  if (typeof input !== 'string') return 'pending';                       // fail closed
  const key = input.trim().toLowerCase().replace(/[_-]/g, '');
  // Re-key the legacy map by its stripped form so both 'pending_gc' and 'pendinggc' resolve.
  // (Pre-computed once at module load in the real implementation.)
  for (const [legacy, canonical] of Object.entries(LEGACY_TO_CANONICAL)) {
    if (legacy.toLowerCase().replace(/[_-]/g, '') === key) return canonical;
  }
  return 'pending';                                                       // unknown → fail closed
}
```

**Key choices baked in:**
- **Fail closed:** unknown roles become `pending`, not `client`. An unrecognized role today silently becomes `client` (the worst possible failure mode if the role was supposed to be `admin`).
- **Strip both `_` and `-`** before comparing — covers every observed casing.
- **No fallback chain via guess** — if the input isn't in the table, we don't try to be clever.

---

## 8. Migration script outline

A single Node script using Admin SDK (run from a one-off Cloud Function, since the org IAM block prevents standalone callables):

```
1. Snapshot all users/{uid} docs (collection.get()).
2. For each doc:
   a. const oldRole = doc.data().role;
   b. const newRole = normalizeRole(oldRole);
   c. If oldRole === newRole, skip.
   d. Otherwise write:
        { role: newRole,
          roleMigratedFrom: oldRole,
          roleMigratedAt: serverTimestamp() }
3. Write a marker doc /_admin/roleMigration with counts (changed / unchanged / skipped).
4. Print a summary.
```

**Dry-run mode first.** Add a `?commit=true` query param; without it, the function just logs what it WOULD change. Run dry-run, review output, then re-run with commit.

**Phasing** — to avoid lockouts:

1. **Phase 0 (no risk):** Land the `normalizeRole()` helper in `shared/auth-types.ts` only. Don't touch any callers yet. Ship.
2. **Phase 1 (low risk):** Update CLIENT-SIDE reads to call `normalizeRole()` on `user.role` before comparing. App.tsx, RoleGuard, useRoleAccess, roleRedirects. Old Firestore values keep working because they're normalized at read time. Ship + smoke-test.
3. **Phase 2 (data migration):** Run the migration script (dry-run first, then commit). All Firestore `users.role` values become canonical.
4. **Phase 3 (rules):** Update `firestore.rules` to use canonical strings (`'staff'` instead of `'gc'`). Deploy. **This is the moment a misaligned doc would lock someone out** — but Phase 2 already cleaned them up.
5. **Phase 4 (writes):** Update every place client/functions code WRITES a role string. Cloud Functions `deriveUserRole`. AuthContext sign-up default. Route-guard arrays (just for cleanliness — they'll already work because reads are normalized).
6. **Phase 5 (cleanup):** Delete the legacy aliases from the normalizer. Update CLAUDE.md. Update PROJECT_OVERVIEW.md.

Each phase is independently shippable + revertible. Phase 3 is the one to coordinate carefully.

---

## 9. Risk areas (ordered, highest first)

1. **firestore.rules deploy** — If rules are updated to require `'staff'` but a user doc still has `role: 'gc'`, that user loses all access until the migration script runs. Mitigation: run data migration BEFORE deploying rule changes. Phase 2 → Phase 3, never the reverse.
2. **Test users (`testgc@skyelineos.com`, `testclient@…`, `testdesigner@…`, `testsub@…`)** — Their Firestore user docs will need migration too. Don't forget them. Smoke tests will break if test users get locked out.
3. **`pending_team` users in production** — If any contact came through `ensureContactAuth` with `role: team` or `role: employee`, their user doc has `role: pending_team`. Migration handles this, but they may not have noticed they're locked out. After migration, admin should review the `pending` queue.
4. **`AuthContext.tsx` test-mode bypass** — Once you change `'pending_gc'` → `'pending'` in ProtectedRoute, any localStorage test-mode user with role `pending_gc` will become unblocked unexpectedly (because the check now looks for `pending`, not `pending_gc`). Low practical risk — just delete the test-mode entry in localStorage when in doubt.
5. **`shared/types.ts:240` duplicate UserRole** — If you only update one definition, importers using the other one will get type mismatches at compile time. tsc will complain loudly — easy to catch but ugly.
6. **AdminViewContext** uses string-literal union types — TypeScript will block any rename until that file is updated alongside. Coupled change, not a risk if done together.
7. **Legacy `server/` directory** — has its own role helpers (`server/middleware/requireRole.ts`, `server/types/roles.ts`, etc.). They're not deployed to production today (Firebase Hosting rewrites `/api/*` to the Cloud Function `api`, NOT to anything in `server/`). **Recommend: don't touch `server/`** — but explicitly delete the directory in a separate PR to remove the confusion permanently. Mention it in PROJECT_OVERVIEW.md again.
8. **Custom claims** — I checked: NONE of the code sets Firebase Auth custom claims for roles. All role logic flows through Firestore `users/{uid}.role`. So there's no second authoritative store to migrate. Good.
9. **`functions/src/index.ts` email triage + bid responses** — A couple of lines still hardcode `role === 'gc'` in Express middleware. Plain find/replace.
10. **`selections` collection** — If any docs exist with `authorRole: 'gc'`, they need migration too. Check the collection size first; may be empty in production.

---

## 10. Summary recommendation

The taxonomy is now: `admin | project_manager | office_staff | field_staff | accountant | client | sub | designer | pending` — 9 values. The 6-phase rollout in §8 stands. **Most important rule: data migration before security rule deploy.**

**Two questions still open for Tyler:**

**Q2 — Contact roles vs. user roles: unify or keep separate?**

Today, `contacts.role` carries richer business meaning (`vendor`, `supplier`, `subcontractor`, `client`, `homeowner`, `employee`, `team`, `other`). For example, a "vendor" might be a lumber supplier who never bids — they don't need a `sub` portal account. Two options:

- **(a) Keep separate** — contact roles stay rich and descriptive (vendor ≠ subcontractor in your address book). The contact-auth pipeline normalizes to a user role only at Firebase Auth account creation time. **My recommendation.** Preserves CRM-level distinctions you may want later (e.g. "show me only suppliers"); doesn't bloat the auth role set.
- **(b) Unify** — contact roles must come from the same 9-value set as user roles. Simpler model, but you lose the supplier/vendor distinction in Contacts.

**Q3 — Phase 1 route-guard defaults: which team roles see which pages?**

The audit assumes a permissive default: every team-role sees every team-only route, then admin restricts via the permissions matrix in a later phase. But a few pages need explicit decisions before Phase 1 ships:

| Page | Default access proposal |
|---|---|
| Dashboard | All team roles + admin |
| Projects | All team roles + admin |
| Contacts | All team roles + admin |
| Sales / CRM | All team roles + admin |
| Estimates | `admin`, `project_manager` (others read-only?) |
| Bids | `admin`, `project_manager` |
| Schedule | All team roles + admin |
| Tasks | All team roles + admin |
| Site Logs / Photos | All team roles + admin |
| Documents | All team roles + admin |
| **Finance / Accounting / Bills** | `admin`, `project_manager`, `accountant` |
| **Change Orders** | `admin`, `project_manager` |
| **Settings (company)** | `admin` only |
| **Admin (Users)** | `admin` only |

Tell me to adjust any cells, then I'll proceed with Phase 1.

Awaiting review on Q2 and Q3.
