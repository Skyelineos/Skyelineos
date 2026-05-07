# Skyeline Odyssey — Claude Code Instructions

## Start of Every Session
1. Read this file (CLAUDE.md)
2. Read CHECKPOINT.md if it exists — resume from where the last session stopped

## Self-Management Rules
1. Every ~50,000 tokens, stop and run `/compact` automatically
2. When context reaches 80% full, save CHECKPOINT.md with current status, then run `/compact` before continuing
3. Never let a file exceed 25,000 tokens — split into modules automatically
4. After completing each major feature, update CHECKPOINT.md with what was just finished
5. If responses are slowing down or repeating, run `/compact` immediately
6. End every session by updating CHECKPOINT.md with exactly where you stopped

## Project
- **Working directory**: `~/Downloads/skyelineos-clean/`
- **Stack**: React 18 + Vite + TypeScript, Firebase Hosting, Cloud Functions (Express), Firestore, Firebase Auth
- **Firebase project**: odyssey-cf118 (prod)
- **Deploy command**: `npm run build && firebase deploy --project odyssey-cf118`

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
