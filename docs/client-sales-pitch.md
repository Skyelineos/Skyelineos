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
- The thirteen starter sections map to the owner's video content strategy — each planned
  video becomes a one-pager now, with a video slot for when it's shot:
  1. The Skyeline Story (hero) · 2. Why Build With Skyeline · 3. The Client Journey ·
  4. Welcome to Skyeline · 5. What Does It Actually Cost? · 6. Biggest Mistakes to Avoid ·
  7. Custom vs. Buying Existing · 8. SkyelineOS Technology · 9. Meet Tyler ·
  10. Meet the Team · 11. Meet Our Trade Partners · 12. What Our Clients Say ·
  13. Design Inspiration.
- Pure outbound-marketing assets from the brief (website-hero placement, ad cuts, the
  30–50 social clips) were intentionally left out of the in-portal pitch — they aren't
  portal-facing. Add them as sections later if desired.
- Copy is an **editable draft** — tune every word from the portal.
- Videos: paste a YouTube/Vimeo/MP4 URL per section; until then a tasteful "coming soon"
  slot shows.
