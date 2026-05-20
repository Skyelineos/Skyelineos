# Skyeline OS — Claude Code Instructions

## What this is
Skyeline OS is a **single-tenant construction management app** built for Skyeline Homes (custom home builder in American Fork UT). It is the operating system for one GC business — lead intake → estimates → bid packages to subs → schedule/Gantt → site logs + photos → invoicing → client and designer portals.

**Backend:** Firebase (Firestore + Cloud Functions). All real backend logic lives in `functions/src/`. The `server/` directory you may see in older docs is dead and being removed — do not edit, run, or reference it.

**Multi-tenancy:** Not built and not on the roadmap for the next ~5 years. Don't design for it. But also don't actively make it harder later (no hardcoded "Skyeline" strings where a variable would do, etc.).

## Start of Every Session
1. Read this file (CLAUDE.md)
2. Read CHECKPOINT.md if it exists — resume from where the last session stopped
3. Read PROJECT_OVERVIEW.md for the current module inventory + known issues

## Self-Management Rules
1. Every ~50,000 tokens, stop and run `/compact` automatically
2. When context reaches 80% full, save CHECKPOINT.md with current status, then run `/compact` before continuing
3. Never let a file exceed 25,000 tokens — split into modules automatically
4. After completing each major feature, update CHECKPOINT.md with what was just finished
5. If responses are slowing down or repeating, run `/compact` immediately
6. End every session by updating CHECKPOINT.md with exactly where you stopped

## Project
- **Working directory**: `~/Downloads/skyelineos-clean/`
- **Stack**: React 18 + Vite + TypeScript (client), Firebase Cloud Functions (Node 20, Express) for backend logic, Firestore for data, Firebase Auth for users, Firebase Hosting for static SPA.
- **Firebase project**: `skyelineos` (prod) — https://skyelineos.web.app
- **Deploy command**: `npm run build && firebase deploy --project skyelineos`
  - Rules only: `firebase deploy --only firestore:rules --project skyelineos`
  - Functions only: `firebase deploy --only functions --project skyelineos`
- **Build script** (`package.json` → `build`): Vite builds the client to `dist/public/`. The `esbuild server/index.ts ...` portion of the build script targets the dead `server/` directory and produces an unused artifact at `dist/index.js` — slated for removal in the cleanup PR.
- **Dev script** (`package.json` → `dev`): currently runs `tsx server/index.ts` (the dead server). For real-world dev, run `npm run build` and rely on `firebase emulators:start` or just deploy directly. The dev script will be updated when `server/` is removed.

## Roles
| Value | Display name | Access |
|-------|-------------|--------|
| `admin` | Administrator | Full access |
| `gc` | Skyeline Team | Full project access |
| `pending_gc` | Pending Approval | Blocked until admin approves → promotes to `gc` |
| `client` | Home Owner | Client portal |
| `sub` | Subcontractor | Sub portal |
| `designer` | Designer | Designer portal |

## Architecture
- `client/src/` — React frontend
- `functions/src/index.ts` — All Cloud Function endpoints (Express)
- `shared/` — TypeScript types shared between client and functions
- `client/src/auth/AuthContext.tsx` — Firebase auth + Firestore profile loading
- `client/src/auth/ProtectedRoute.tsx` — Route guard; blocks `pending_gc` users

## Module Status
| Module | Status |
|--------|--------|
| GC Dashboard | ✅ |
| Projects | ✅ |
| Schedule / Gantt | ✅ |
| Contacts / CRM | ✅ |
| Finance / Accounting | ✅ |
| Messaging | ✅ |
| Documents | ✅ |
| Estimates | ✅ |
| Bids | ✅ |
| Client Portal | ✅ |
| Subcontractor Portal | ✅ |
| Designer Portal | ✅ |
| Admin Portal | ✅ |
| Safety Forms | 🔧 Firestore wiring next |
| Timesheets | 🔧 Firestore wiring next |
| Design Board | 🔧 Firestore wiring next |
| Social Media | 🔧 Planned Module 5 |
