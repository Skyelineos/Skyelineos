# future-features/

Non-MVP features parked here during the 2026-07-04 MVP audit. Everything in
this folder was working (or partially working) code that is **not on the
critical path** for a custom-home builder to manage:

- Projects (Gantt, tasks, budgets, docs, photos)
- Bids (packages, submissions, comparison, award)
- Financials (estimates, invoices, cash flow, POs, bills, expenses)
- Daily digest / tasks
- Client portal, Subcontractor portal, Designer portal
- Communications / Messages
- Documents + Photos
- Settings + Users

## What's here

| Path | Reason parked |
|------|---------------|
| `pages/SocialMedia.tsx` | Social-media publishing workflow — marketing, not build management |
| `pages/ContentStudio.tsx` + `components/content-studio/` | Content generation (giveaway pages, marketing assets) |
| `pages/DesignBoard.tsx` | Style discovery / client-facing Like-Pass board — nice-to-have |
| `pages/Automations.tsx` | Rules/triggers UI — foundational infra not yet critical |
| `pages/Playbook.tsx` + `components/playbook/` | Internal playbook viewer — knowledge base, not workflow |
| `pages/ApiStorage.tsx` | Admin API-key viewer — pure admin |
| `pages/IngestionLab.tsx` + `components/ingestionLab/` | Gmail/Drive/Upload → AI extraction admin tool — power-user only |
| `pages/AiInbox.tsx` + `components/aiInbox/` | AI Inbox admin review/approval queue — power-user, blocks on Ingestion Lab |
| `pages/StyleLibraryAdmin.tsx` | Style curation admin for Design Board |
| `pages/Giveaway.tsx` | Public model-home giveaway page (needs Content Studio to feed it) |
| `pages/Subscriptions.tsx` | Subscription/billing admin — nothing to sell yet |

## Restoring one of these

1. `git mv future-features/pages/<Page>.tsx client/src/pages/<Page>.tsx`
2. If applicable, move the matching `components/<dir>` back to `client/src/components/`
3. In `client/src/App.tsx`, un-comment the `const <Page> = lazy(...)` line and its `<Route>` block (search for `MVP AUDIT`)
4. In `client/src/components/layout/Sidebar.tsx` and `MobileNav.tsx`, un-comment the nav entries
5. `npx vite build` to verify

## Route-side notes

- The **`functions/src/ingestionLab/`** and **`functions/src/aiInbox/`** Cloud
  Functions are still registered in `functions/src/index.ts` — the backend
  ingesters and OAuth handlers were left in place because they're safe when
  idle (no cron, only triggered by removed UI). Delete their `register…()`
  calls if you want to strip the endpoints entirely.
- The **Communication Center AI** routes (`functions/src/communications/`) are
  MVP and stay wired.
