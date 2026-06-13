# Client Portal — Soft Sales Pitch (pre-project one-pagers)

**Status:** Built 2026-06-13. Lives in the client portal's no-project / pre-construction state.

## What it is
An interactive "Explore Skyeline" section shown to a homeowner **before they have an
active project**. It's a soft sales pitch made of one-pager cards — each answers the
questions a prospective client has about working with Skyeline Homes. Every section
has a slot for a **video** (added later) and any number of **downloadable documents**.

## Where it renders
`client/src/pages/SkyelineClientPortal.tsx` — the dashboard tab, in two states:
1. No project yet (`!selectedProjectId`) — primary use case.
2. Project exists but isn't set up yet (`!projectIsSetUp`).

Both render `<SalesPitchSection />` beneath `ClientWelcomePreview`.

## Components & data
- `client/src/lib/salesPitch.ts` — types, Firestore I/O, file upload/delete helpers, and
  `DEFAULT_SECTIONS` (the built-in starter one-pager copy).
- `client/src/components/client-portal/SalesPitchSection.tsx` — the client-facing card grid +
  one-pager reader modal + staff edit affordances.
- `client/src/components/client-portal/SalesPitchEditDialog.tsx` — staff editor (copy, icon,
  video URL, document upload, published toggle, delete).
- `client/src/components/client-portal/salesPitchIcons.tsx` — icon-name → lucide component map.

## Content model
Root-level Firestore collection **`salesPitchSections`** (same for every prospective client):

```ts
{ order, icon, title, tagline, intro, faqs: {q,a}[], videoUrl?, documents: {name,url,path}[], published }
```

Files upload to Storage under `salesPitch/{sectionId}/...`.

### Fallback / seeding
When the collection is empty, the UI renders `DEFAULT_SECTIONS` directly so clients never
see a blank screen. Staff get a **"Publish starter content"** button that writes those
drafts into Firestore (`seedDefaultSections`) so they become editable.

## Who can edit
Staff only — `canEdit = user.role === 'admin' || 'gc'`. Real clients (role `client`) see a
clean, read-only experience. Staff reach the client portal via admin impersonation, so edit
controls key off the **real** logged-in role, not the impersonated identity.

- Pencil on each card → edit that section.
- "Add section" → create a new one.
- Delete lives inside the editor.
- Unpublished sections are hidden from clients; staff see them with a "Hidden" badge.

## Security rules
- `firestore.rules`: `salesPitchSections` — read `isSignedIn()`, write `isGC()`.
- `storage.rules`: `salesPitch/{allPaths=**}` — read public, write authenticated (UI gates
  upload/delete to staff).

Deploy with `npm run deploy:rules` (Firestore) — note the Storage rules ship via
`firebase deploy --only storage` if not already covered by the deploy scripts.

## Notes / future
- The eight starter sections (How We Build, Pricing & Transparency, Design & Selections,
  Your Portal & Communication, Timeline, Warranty & After-Care, Why Skyeline, Getting
  Started) are **editable drafts** — copy should be tuned to the owner's ChatGPT brief.
- Videos: paste a YouTube/Vimeo/MP4 URL per section; until then a tasteful "coming soon"
  slot shows.
