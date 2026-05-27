# Client Onboarding Wizard Design — Phase 1E

**Status:** Drafted 2026-05-24.
**Authoritative decision:** [D-014 in `docs/decisions.md`](./decisions.md).
**Related design docs:**
- [`docs/selections-design.md`](./selections-design.md) — D-002 — onboarding outputs feed selection decisions
- [`docs/ai-rendering-studio-design.md`](./ai-rendering-studio-design.md) — D-004 — AI generates placeholder library + later receives inspirations as prompts
- [`docs/sub-portal-design.md`](./sub-portal-design.md) — D-012 — sub portal built in parallel, independent code paths

This document specifies the 7-step wizard a homeowner completes after Skyeline opens their project. Outputs feed `project.defaultTier`, the designer's selection-option curation, and (downstream) the AI Rendering Studio's project context.

---

## 1. Goals + non-goals

### Goals (v1)
- Client completes the wizard in one or more sittings (pause/resume).
- By end of wizard: tier locked, POH intent captured, contract signed (if ready), photo preferences captured, external inspirations linked.
- Designer + GC see partial completion in real time as the client progresses (no waiting for full submission).
- Designer can begin curating selection options before the client finishes the wizard.

### Non-goals (v1)
- Curated, photographer-quality inspiration library — AI placeholders for now.
- Pinterest API scrape — URLs stored as plain links for the designer to view.
- Multi-language wizard — English only for now.
- Couple/partner co-fill — single client account fills it; partners can review via shared login if they share an account.

---

## 2. Personas

**The client (homeowner).** Often a couple, with one designated portal user. May be tech-savvy or not. Wants: clear questions, fast progress, sense that their preferences matter.

**The designer (Nicole, plus future hires).** Reviews responses + photo ratings to shape selection-option proposals. Needs: photo preference data in usable form (love + like aggregates per category; pass + strong-pass also tracked for what to avoid).

**The GC (Tyler).** Reviews tier decision + POH intent + signs contract on his side. Needs: dashboard view of every active client's onboarding progress.

---

## 3. Wizard step detail

### Step 1 — Welcome
Read-only summary card:
- Project name + address
- GC name + photo + contact link
- Designer name + photo + contact link (if assigned; otherwise "Designer to be confirmed")
- Estimated start month
- "Get started" CTA → Step 2

### Step 2 — Tier qualification quiz

**Question set (subject to refinement with Nicole):**

1. "What's your overall finish budget range?" — radio: Under $50k / $50–100k / $100–250k / $250k+
2. "Which best describes your taste?" — multi-select: Timeless / Modern / Traditional / Transitional / Mountain Modern / Farmhouse / Custom-Other
3. "How important is it that your home feels distinctly above standard builder homes?" — slider 1-10
4. "Are there must-have premium upgrades (high-end appliances, luxury fixtures, custom millwork, etc.)?" — checkbox grid
5. "Are you open to in-house designer guidance on finish selections, or have you already decided most things?" — radio: Lean on us / Mix / I have a clear vision
6. "Is the house intended to be on the Parade of Homes circuit or used as a feature property?" — yes/no (informs both tier + Step 3)

**System recommendation logic** (initial heuristic — refine post-launch):
- Parade Home: budget $250k+, importance ≥ 9, parade intent yes
- Mid Luxury: budget $100k–250k, importance 6–9
- Low Luxury: budget under $100k, importance under 6

Recommendation shown with reasoning: "Based on your answers, we'd suggest **Mid Luxury Level** for this home. You can accept or override."

Client clicks Accept → sets `project.defaultTier` + `project.tierAcceptedBy: 'client'`.
Client picks different tier → sets `project.defaultTier: <picked>` + `project.tierOverriddenAt`.

GC retains override power on the project settings page regardless.

### Step 3 — Parade of Homes intent

Only shown if Step 2 question 6 = yes, OR client explicitly says yes here.

Fields:
- **Target POH show year** — dropdown of upcoming years
- **Estimated home size (sqft)** — numeric input
- **Estimated finish budget per sqft** — numeric input
- **Estimated furniture budget** — numeric input
- **Anything you want to highlight** — text area

System shows soft qualification check against placeholder thresholds (~$300/sqft + $150K furniture budget). If thresholds met: "Looks like a strong POH candidate — we'll confirm officially after design selections." If not met: "We can still pursue POH submission; we'll discuss with you whether to scope up or aim for a different show category."

(Skyeline + Nicole will refine these thresholds. Stored on the response doc so the heuristic can be updated without rewriting old answers.)

### Step 4 — Contract signing

**Three sub-states depending on contract readiness:**

a) **Contract is ready + unsigned.** Embedded `<SignaturePad />` (D-015). Shows contract PDF on left, signature canvas on right. Client reads, types name, draws signature, clicks "I consent to electronic signing" checkbox, clicks Sign. Audit metadata captured.

b) **Contract is signed (returning user, this step already done).** Shows "Contract signed on YYYY-MM-DD. View signed copy" link.

c) **Contract not ready.** "Your contract is in preparation. We'll notify you the moment it's ready to sign." Allows client to proceed to next steps; this step shows a "Pending — return to sign" badge in the wizard nav.

GC + their representatives (admin / projectManager) get a separate notification when the client signs, prompting them to counter-sign.

### Step 5 — Design preference photo quiz

**UI:** Tinder-style swipe deck or fast-rate grid (depends on screen size). Each photo shown one or a few at a time. Rating buttons: 💖 Love / 👍 Like / 👎 Pass / 🚫 Strong pass.

**Categories (v1 cards):**
1. Bathrooms — Primary
2. Bathrooms — Secondary
3. Kitchens — Cabinetry
4. Kitchens — Backsplash + Counter
5. Great room / Living
6. Primary bedroom
7. Exterior — Siding + Stone
8. Exterior — Roof + Color palette
9. Finish carpentry — Trim + Millwork
10. Lighting fixtures
11. Tile + Flooring
12. Hardware + Fixtures

**~15 photos per category for v1 (~180 total).**

**v1 photo source:** AI-generated placeholders via the existing Rendering Studio pipeline (D-004). Generation prompts cover each tier within each category, so the library spans the visual range. Stored in `inspirationLibrary/{id}` with metadata: category, tier, style tags, source: 'ai_generated'.

**Phase 2:** Nicole + Tyler upload real Skyeline portfolio photos + curated stock; library entries get replaced (old AI placeholders flagged inactive).

**Result storage:** each rating saved to `projects/{p}/inspirations/{auto-id}` with: `inspirationLibraryRefId`, `category`, `rating`, `ratedAt`. Allows the designer to aggregate "client loves 8 out of 15 farmhouse-style kitchen photos" without re-rendering.

### Step 6 — External inspiration capture

**Two sub-sections:**

a) **Pinterest boards.** Text input array, "Add another." Each entry: URL + optional category tag + optional notes. Stored as inspiration entries with source: 'pinterest_link'.

b) **Upload your own photos.** Drag-and-drop or file picker, up to 30 images. Each upload prompts for category tag + optional notes. Stored to Firebase Storage + inspiration doc with source: 'client_upload'.

c) **Free-text "what I'm going for"** — large textarea below the upload zone. Stored as `clientOnboarding.responses.directionNotes`.

### Step 7 — Review + submit

Read-only summary of all answers, photos rated count per category, inspirations attached count, contract status. CTA: "Submit & notify our team."

Submission:
- Sets `clientOnboarding.responses.status: 'submitted'`
- Sets `clientOnboarding.responses.submittedAt`
- Notifies designer (in-app + email) + GC (in-app + email)
- Wizard becomes read-only with edit-individual-section affordances for client (some answers will need updating during the project, e.g. inspirations)

---

## 4. Data model

### `projects/{projectId}/clientOnboarding/responses`
Singleton doc. One per project.

```ts
{
  id: 'responses',
  projectId: string,
  status: 'in_progress' | 'submitted',
  startedAt: Timestamp,
  submittedAt?: Timestamp,
  lastUpdatedAt: Timestamp,
  lastUpdatedStep: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  
  step2: {
    completedAt?: Timestamp,
    budgetRange: 'under_50k' | '50_100k' | '100_250k' | '250k_plus',
    tasteTags: string[],
    aboveBuilderImportance: number,    // 1–10
    mustHaveUpgrades: string[],
    designerGuidance: 'lean_on_us' | 'mix' | 'clear_vision',
    paradeOfHomesInterest: boolean,
    recommendedTier: 'parade' | 'midLuxury' | 'lowLuxury',
    pickedTier: 'parade' | 'midLuxury' | 'lowLuxury',
  },
  
  step3?: {                            // only if POH intent
    completedAt: Timestamp,
    targetShowYear: number,
    estimatedSqft: number,
    estimatedFinishBudgetPerSqft: number,
    estimatedFurnitureBudget: number,
    highlights: string,
    qualificationCheckPassed: boolean, // soft check at submission time
  },
  
  step4: {
    contractStatus: 'not_ready' | 'awaiting_client_signature' | 'awaiting_gc_countersign' | 'fully_executed',
    contractId?: string,               // ref to contracts/{id}
    clientSignedAt?: Timestamp,
  },
  
  step5: {
    completedAt?: Timestamp,
    totalPhotosRated: number,
    perCategory: Record<string, {
      love: number,
      like: number,
      pass: number,
      strongPass: number,
    }>,
  },
  
  step6: {
    completedAt?: Timestamp,
    pinterestUrls: string[],
    uploadedPhotosCount: number,
    directionNotes: string,
  },
  
  step7?: {
    submittedAt: Timestamp,
    notifiedDesigner: boolean,
    notifiedGC: boolean,
  },
}
```

### `projects/{projectId}/inspirations/{auto-id}`
Per-inspiration doc.

```ts
{
  id: string,
  source: 'photo_quiz' | 'pinterest_link' | 'client_upload' | 'designer_added',
  category: string,
  
  // photo_quiz:
  inspirationLibraryRefId?: string,
  rating?: 'love' | 'like' | 'pass' | 'strong_pass',
  
  // pinterest_link:
  pinterestUrl?: string,
  
  // client_upload + designer_added:
  imageStoragePath?: string,
  imageDownloadUrl?: string,
  
  notes?: string,
  addedBy: string,                    // uid
  addedByRole: 'client' | 'designer' | 'gc',
  addedAt: Timestamp,
}
```

### `inspirationLibrary/{id}`
Admin-managed (root-level — shared across projects). Photos for the preference quiz.

```ts
{
  id: string,
  category: string,                   // matches step 5 category list
  tier: 'parade' | 'midLuxury' | 'lowLuxury',
  styleTags: string[],                // farmhouse, modern, traditional, etc.
  imageStoragePath: string,
  imageDownloadUrl: string,
  source: 'ai_generated' | 'skyeline_portfolio' | 'curated_stock',
  generatedPrompt?: string,           // for ai_generated, store the prompt
  active: boolean,                    // soft-delete to phase out AI placeholders later
  addedBy: string,
  addedAt: Timestamp,
}
```

### `contracts/{contractId}`
See D-015 for full shape. Created by GC ahead of step 4; referenced by `clientOnboarding.responses.step4.contractId`.

---

## 5. Routes + endpoints

### Client-facing
- `/client/onboarding/:projectId` — wizard root. Reads `clientOnboarding/responses`, renders the appropriate step.
- `/client/onboarding/:projectId/contract/:contractId` — embedded signing view (uses D-015 widget).

### GC + Designer
- `/dashboard/clients/:projectId/onboarding-status` — read-only view of client's progress + responses.
- `/admin/inspiration-library` — manage the photo library (upload, retire, regenerate).

### Backend endpoints (all under existing `api` Express function)
- `POST /api/onboarding/:projectId/step/:n` — save step answers.
- `POST /api/onboarding/:projectId/submit` — final submission, triggers notifications.
- `POST /api/inspirations/:projectId` — add an inspiration (Pinterest URL or uploaded photo).
- `POST /api/inspiration-library/seed` — admin trigger to generate the AI-placeholder library.

---

## 6. Permissions (Firestore rules summary)

- `projects/{p}/clientOnboarding/responses` — client (owner) read+write own; designer + gc + pm read; client cannot read after submitted (except for view-only).
- `projects/{p}/inspirations/{id}` — client read+write own additions; designer read+write all; gc + pm read all. Designer can add `source: 'designer_added'` entries during the project.
- `inspirationLibrary/{id}` — staff read+write; clients read active entries only (they should never see the raw library outside the quiz UX).

---

## 7. Slicing plan

### Slice 1 — Wizard scaffolding + tier qualification
- Route + page scaffold
- Wizard navigation + pause/resume mechanics
- Step 1 (welcome) + Step 2 (tier quiz)
- `clientOnboarding/responses` doc create + step 2 save
- `project.defaultTier` set on step 2 completion
- Permission rules

### Slice 2 — POH intent + photo preference quiz
- Step 3 (POH intent)
- Step 5 (photo preference quiz UI + ratings)
- `inspirationLibrary` seeding endpoint with AI-generated placeholders (depends on AI Rendering Studio Slice 1 or use direct DALL-E call with a placeholder prompt set)
- `projects/{p}/inspirations` doc creation per rating

### Slice 3 — External inspirations
- Step 6 (Pinterest + upload + notes)
- Firebase Storage upload integration
- Designer dashboard view of inspirations grouped by category

### Slice 4 — Contract signing (depends on D-015 / Phase 1F)
- Step 4 contract signing using the D-015 signature widget
- Multi-party flow: client signs → GC countersign → fully executed

### Slice 5 — Review + submit + notifications + designer view
- Step 7 review screen
- Submission notification (email + in-app for designer + GC)
- GC dashboard "Client onboarding status" card per project
- Designer dashboard inspiration board view

---

## 8. Open follow-ups

- **D-014-f — Quiz photo count per category.** I defaulted to ~15. Nicole may want more for variety or fewer to keep velocity high. Confirm during Slice 2.
- **D-014-g — Recommendation logic refinement.** Initial heuristic in Step 2 is a placeholder. Refine after Nicole + Tyler see real client answers + the gap between recommended and picked tier.
- **D-014-h — Couple/partner accounts.** Single client account for v1; if both partners want simultaneous access, they share one login. Phase 2 = multi-user-per-client-account.
- **D-014-i — Wizard editability after submit.** What can the client edit post-submission? Likely: inspirations always, photo ratings until project hits a milestone, POH intent until POH submission deadline approaches. Lock everything else.
- **D-014-j — Mobile vs desktop UX.** Wizard must work on mobile (clients often fill these on their phone). Validate during Slice 1 build.

---

## 9. Cross-references

- `docs/decisions.md` D-014 — authoritative decision.
- `docs/decisions.md` D-015 — native signature widget (powers Step 4).
- `docs/decisions.md` D-002 — selections; designer uses inspirations from this wizard to curate options.
- `docs/decisions.md` D-004 — AI Rendering Studio; generates the v1 placeholder library + later receives inspirations as prompt context.
- `docs/decisions.md` D-013 — pricing model; `project.defaultTier` set here drives downstream markup math.
