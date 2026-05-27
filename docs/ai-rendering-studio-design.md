# Skyeline OS — AI Rendering Studio Design

**Status:** Authoritative design. Awaiting payment-rail and a handful of UX answers before implementation.
**Drafted:** 2026-05-22.
**Authoritative decision record:** `docs/decisions.md` §D-004 + §D-006 + §D-007.

---

## Goal

A client-facing studio that generates photorealistic interior renderings from a project's selections. Uses Claude (via Anthropic) as a router that picks the best image-gen provider per request. Replaces the existing dead `AIRenderingStudio.tsx` UI and extends the existing `POST /api/ai/render` backend.

---

## 1. Why a router pattern?

Anthropic's Claude **does not generate images** directly — Claude is a text + vision model that reads images. Image generation requires routing to an external provider. The choices that make sense for interior renderings:

| Provider | Model | Strengths | Cost (approx, 2026 prices) |
|---|---|---|---|
| OpenAI | DALL-E 3 (HD) | Good general realism; tight prompt following | ~$0.080/image at 1792×1024 |
| OpenAI | gpt-image-1 | Newer; better composition + text rendering | comparable, varies |
| Replicate | FLUX 1.1 Pro | Best photorealistic for architecture/interiors today; cheaper | ~$0.04/image |
| Replicate | Stable Diffusion XL variants | Cheaper; more controllable with LoRAs (e.g. specific aesthetics) | $0.01–0.05/image |
| Adobe Firefly | Commercial-safe outputs | Important if Skyeline ever publishes renderings or uses them in client-facing print collateral | varies |

The router pattern means: for each request, Claude reads the prompt + context (room type, style, selections) and decides which provider/model is best. Two viable interpretations:

**(a) Claude as classifier** (recommended): Claude returns a structured `{ provider, model, refinedPrompt, reasoning }` choice. Backend invokes the chosen provider. Pros: easy to tune, transparent, swap providers without UI change.

**(b) Claude as prompt enhancer + fixed model**: Claude rewrites the user's prompt for max photorealistic quality, backend always sends to FLUX 1.1 Pro. Pros: simpler, fewer moving parts. Cons: no graceful failover when FLUX has issues; no ability to pick best model per style.

**Recommendation: (a).** Slightly more setup but much more flexibility.

Default routing rules (configurable in `ingestion_lab/`-style config doc):

- Photorealistic interior, contemporary style → FLUX 1.1 Pro
- Photorealistic interior, traditional/farmhouse → DALL-E 3 (better at warm wood + ornate trim)
- Sketch / line-art / mood board → DALL-E 3
- Outdoor (curb appeal, landscape) → FLUX 1.1 Pro
- Detail shot (single surface, e.g. backsplash close-up) → FLUX 1.1 Pro
- Anything stylistically unusual → Claude routes per request

---

## 2. Quotas

| Role | Free quota | Overage | Visibility |
|---|---|---|---|
| **Client** | 5 rooms × 10 iterations per room, per project | $500 per additional room, $250 per additional "wall" rendering | Visible to client + designer + GC |
| **Designer** | Configurable per designer by GC (default 20 renderings/project, per D-004-d recommendation) | n/a (over quota → blocked, ask GC) | Visible per project assignment |
| **GC (Tyler)** | Unlimited | n/a | **Private by default** — can be marked public per rendering |
| **projectManager** | Same as designer default unless GC overrides | n/a | Same as designer |
| **admin** | Unlimited | n/a | Same as GC |

### "Room" vs. "wall"

- **Room rendering** — full interior perspective (room corner, hero shot). Counts against `roomCount`.
- **Wall rendering** — single elevation (e.g., the kitchen island wall, or just the backsplash + cabinets). Counts against `wallCount`.

Recommendation: Claude can decide which one to render based on prompt + context, but the UI prompts the user to choose explicitly so they know which quota they're spending against (D-004-b).

---

## 3. Workflow

1. Client (or designer/GC) navigates to the Studio for a project.
2. **First-time per-project**: warning modal explaining the limits and paywall. Acknowledge → set `studioOnboardedAt` on the user-project pair so the warning never re-shows for that project.
3. Project room picker: Kitchen / Primary Bath / Living / Dining / Exterior / etc. List comes from the project's selections data (rooms with non-empty selections).
4. Studio canvas for the selected room. Shows:
   - Current selections summary for the room (auto-populated input).
   - Style picker ("modern transitional" / "farmhouse" / "industrial" / custom text).
   - Type picker (room / wall close-up).
   - Quota status: "3 of 5 rooms used. 7 iterations left on Kitchen."
   - Generate button.
5. **On Generate**:
   - **Quota check (server-side).** If under quota → continue. If at quota → paywall modal (Stripe Elements; per D-007 outcome — could be accrued instead in Phase 1). User confirms payment → continue.
   - **Router call.** Backend sends `{ prompt, roomType, style, selections, renderType }` to Claude. Claude returns `{ provider, model, refinedPrompt, reasoning }`.
   - **Provider call.** Backend invokes chosen provider with refined prompt. Awaits result (5–30s depending on provider).
   - **Persistence.** Write rendering doc to `projects/{projectId}/renderings/{renderingId}` with full metadata.
   - **Return URL.** Client gets the image; renders in studio canvas.
6. **Iterate.** Client can re-roll the same prompt (counts as iteration), tweak the prompt and retry (also iteration), or save and start a new room.
7. **Save / share.** Save adds to the project gallery, visible per the visibility rules.

---

## 4. Data model

### Rendering doc

```
projects/{projectId}/renderings/{renderingId}
```

```ts
interface Rendering {
  id: string;
  projectId: string;
  roomId?: string;            // links to the project's "rooms" if you have a rooms collection; otherwise free text in `roomLabel`
  roomLabel: string;          // "Kitchen" / "Primary Bath" / "Living Room"
  renderType: 'room' | 'wall';
  createdBy: string;          // uid
  createdByRole: 'client' | 'designer' | 'gc' | 'projectManager' | 'admin';
  visibility: 'public' | 'private';
  createdAt: any;             // serverTimestamp
  prompt: string;             // full text shown to user
  refinedPrompt: string;      // what Claude actually sent to the provider
  provider: 'dalle-3' | 'gpt-image-1' | 'flux-1.1-pro' | 'sdxl' | 'firefly' | string;
  routerReasoning?: string;   // why Claude chose this provider
  routerModel?: string;       // 'claude-sonnet-4-6' etc.
  selections: string[];       // selectionIds referenced
  style: string;
  imageUrl: string;           // Firebase Storage public URL
  thumbnailUrl?: string;
  iterationOf?: string;       // parent renderingId if this is a re-roll
  quotaCount: { type: 'room' | 'wall'; counted: boolean };
  paywallCharge?: {
    type: 'stripe' | 'accrued';
    chargeId?: string;        // Stripe paymentIntent id
    accruedToProjectId?: string;  // if accrued path
    amount: number;
  };
  costUsd: number;            // provider cost; for budget tracking
  generationTimeMs: number;
}
```

### Per-project quota state (denormalized for fast reads)

```
projects/{projectId}/renderings_quota/summary
```

```ts
interface QuotaSummary {
  client: { rooms: { used: number; quotaTotal: 5; overageRooms: number }, walls: { used: number; overageWalls: number } };
  byDesigner: Record<string, { used: number; quotaTotal: number }>;   // designerUid → state
  gc: { used: number };          // for analytics only; no cap
  lastUpdated: any;
  totalCostUsd: number;
}
```

A Cloud Function trigger (`onRenderingWrite`) recomputes this on every rendering write.

### Per-designer quota config

```
designerSettings/{designerUid}
  - renderingQuotaPerProject: number   // default 20
  - notes?: string
  - setBy: string                       // gc uid
  - setAt: any
```

Settings UI at `/settings/designers` (GC only).

---

## 5. Visibility rules

- **Client renderings** → visible to client + designer + GC + projectManager.
- **Designer renderings** → visible to client + designer + GC + projectManager.
- **GC renderings** → **private by default** (not visible to client). GC can flip individual renderings to `public` to share with the client.
- **Admin renderings** → same as GC.

Firestore rules enforce visibility on read:

```js
match /projects/{projectId}/renderings/{renderingId} {
  function r() { return resource.data; }
  function project() { return get(/databases/$(database)/documents/projects/$(projectId)).data; }
  allow read: if isGC() || isAdmin() || isProjectManager()
    || (r().visibility == 'public' && (
      (isClient() && project().clientId == request.auth.uid)
      || (isDesigner() && request.auth.uid in project().assignedUserIds)
    ));
  allow create: if /* per-role quota check is server-side; rule just gates basic auth */
    isGC() || isProjectManager() || isAdmin() || isClient() || isDesigner();
  allow update: if r().createdBy == request.auth.uid || isGC() || isAdmin();
  allow delete: if r().createdBy == request.auth.uid || isGC() || isAdmin();
}
```

Quota enforcement is server-side in the `/api/ai/render` route. Don't try to enforce in rules — too easy to bypass.

---

## 6. Backend changes

`functions/src/index.ts` extends the existing `POST /api/ai/render` route with:

1. **Auth + project access check** (verify Bearer token → user has access to projectId).
2. **Quota check** — read `projects/{p}/renderings_quota/summary`, evaluate against requester's role/quota. If at quota, return `402 Payment Required` with `paywallAmount` so the client can present Stripe; on payment confirmation, retry with `paywallChargeId` in the body to bypass the quota check.
3. **Router call** — new `routeRenderRequest({prompt, roomType, style, selections, renderType})` function that calls Claude with the EXTRACTION_TOOL-style forced JSON output and returns `{ provider, model, refinedPrompt, reasoning }`.
4. **Provider invocation** — existing DALL-E + Replicate code paths; add gpt-image-1 and SDXL handlers per the router's pick.
5. **Persist** the rendering doc + bump cost tracking + invoke `onRenderingWrite` (which updates the quota summary).
6. **Return** the image URL + metadata.

### New secrets needed (already in setup-runbook.md §L + §M)

- `OPENAI_API_KEY` (for DALL-E 3 + gpt-image-1)
- `REPLICATE_API_TOKEN` (for FLUX, SDXL)
- Anthropic key already bound — Claude router uses the same `ANTHROPIC_API_KEY`.

### Daily/monthly cost cap

Mirror the Ingestion Lab pattern: `renderings_config/budget` with `dailyBudgetUsd` + `spendTodayUsd` + rolling-window logic. Default $20/day across all providers. Abort with `503` if cap hit. GC sees a warning banner.

---

## 7. UI plan

Replace `client/src/components/designer/AIRenderingStudio.tsx` (dead Coming Soon UI) with `client/src/pages/RenderingStudio.tsx`. Routes:

```
/projects/:id/renderings              → StudioHome (room picker + gallery)
/projects/:id/renderings/:roomId      → RoomCanvas (generate + iterate for one room)
/settings/designers                   → DesignerQuotasPage (GC only)
```

Components:

- `StudioHome.tsx` — room picker, gallery of saved renderings, quota status banner, "Start renderings" warning modal (first-time).
- `RoomCanvas.tsx` — full studio canvas with current selections snapshot, style picker, render-type picker, generate button, iteration history, quota meter, paywall modal.
- `RenderingCard.tsx` — single rendering tile with image + metadata + visibility toggle (if GC) + delete (per role).
- `RenderingsGallery.tsx` — grid view across rooms for the project.
- `DesignerQuotasPage.tsx` — per-designer table with editable quota numbers.

Add a route guard: client/designer/GC/PM/admin can all hit `/projects/:id/renderings`. Visibility filter applied at fetch time per §5.

---

## 8. Phased rollout

### Slice 1 — backend router + minimal UI
- Extend `/api/ai/render` with Claude router + quota check (accrue-only paywall; no Stripe yet).
- New `projects/{p}/renderings` collection + rules + indexes.
- `onRenderingWrite` Cloud Function to maintain quota summary.
- `RenderingStudio` page with room picker + simple generate/iterate UI.
- GC view + client view (visibility rules enforced).
- Warning modal + quota meter.
- Persistence + gallery.
- Default daily cost cap ($20/day).

### Slice 2 — designer quotas + settings UI
- `designerSettings/{uid}` collection.
- `/settings/designers` page.
- Designer quota enforcement.

### Slice 3 — payment rail integration
- Tie into Slice 4 of `selections-design.md` payment work.
- Stripe paymentIntent on paywall hit; webhook updates rendering doc with `paywallCharge.chargeId`.
- Refund handling for cancelled / disputed.

### Slice 4 — polish
- Save to favorites, batch download as PDF mood board, share via tokenized link.
- Cost analytics dashboard for GC ("$X spent this month across N renderings").
- Auto-render trigger on selection lock ("Want a rendering of the locked spec?")

---

## 9. Open follow-ups (need user input)

These are raised by `docs/decisions.md` §D-004 + §D-007. Some are deferrable to Slice 3; flagged.

- **D-004-a / D-007-a** — Payment rail: real-time Stripe charge per overage, or accrue to project ledger and settle at close? (Affects Slice 1 vs. Slice 3 separation.)
- **D-004-b** — Room vs. wall: who decides per request? Recommend: UI picker, with Claude suggesting a default based on the prompt.
- **D-004-c** — If client stops paying, do they lose access to previously-generated renderings? Recommend: no — keep paid-for renderings forever.
- **D-004-d** — Designer default quota: confirm 20 renderings/project?
- **D-004-e** — Designers gifting quota to clients: skip for v1, confirm?
- **D-004-f** — Rendering deletion: client soft-delete only; GC hard-delete; designer soft-delete. Confirm.
- **D-004-g** — Re-roll same prompt counts as iteration (1 of 10/room). Confirm.
- **D-004-h** — Claude router prompt design: needs first draft + few-shot examples. Recommend writing alongside Slice 1.
- **D-004-i** — Storage retention for renderings: live forever during active project; archive 12 months after `completedAt`; hard-delete after 7 years. (Tied to `open-questions.md §H2`.)
- **New — Custom domain / share links.** Do we want clients to share renderings publicly (e.g., on Instagram tagging)? If yes, watermark and Firebase Storage public URLs are fine. If "client only," shareable links need tokenization.
- **New — Selection-driven auto-rendering.** When a selection locks, should the system offer to auto-generate a rendering using the locked spec? (Tie-in between this and `selections-design.md`.)
- **New — How does the router handle a provider outage?** Today, if OpenAI is down, the request fails. Should we fall back to Replicate transparently?
- **New — Adobe Firefly / commercial-safe outputs.** If Skyeline ever uses renderings in client-facing collateral (print, web, social), we need Firefly's commercial-safe trained-on-licensed-data guarantee. DALL-E and FLUX outputs are okay for personal client use but commercial reuse is murkier. Worth provisioning?

---

## 10. Cost model

Per-rendering cost (provider-side):
- DALL-E 3 HD: ~$0.08
- FLUX 1.1 Pro: ~$0.04
- Anthropic router call (Claude Sonnet 4.6): ~$0.005 (input ~500 tokens, output ~150 tokens, $3 in + $15 out per M tokens)

Average per rendering: **~$0.10 all-in.**

Per client at quota: 5 rooms × 10 iterations = 50 renderings → **~$5 in provider cost.** Even a heavy client running full quota is ~$5 of cost.

Per overage: $500 client charge per room (which is at most ~$1 of provider cost) → **~$499 margin per overage room.** This is a high-margin feature for Skyeline; the paywall is more about anchoring expectations than recovering cost.

Tyler's unlimited renderings: at ~$0.10/each, 100 renderings/month = $10/month. Negligible.
