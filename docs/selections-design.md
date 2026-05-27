# Skyeline OS — Selections Design (Four-Stakeholder, Multi-Option, Locked)

**Status:** Authoritative design. Awaiting answers to a small set of follow-ups before Slice 1 implementation begins.
**Drafted:** 2026-05-22.
**Supersedes:** the earlier three-party-selections-design.md (renamed to this file). The model has evolved to four stakeholders (GC, designer, contractor, client) and a multi-option / bid-on-upload / lock-after-signoff workflow.
**Authoritative decision record:** `docs/decisions.md` §D-002 + §D-003.

---

## Goal

Every selection is a collaborative artifact between four stakeholders: **GC (Tyler), designer, contractor, and client.** Each selection contains **multiple options** that competing vendors bid on. When all required parties sign off on an option, the selection **locks** — no further edits except via an authorized **change order.**

Concretely, each selection lifecycle:

1. Created (auto-seeded from template or manual)
2. **Options accumulate** — any stakeholder can upload an option; uploading auto-fires a bid request to the relevant contractor (per `usePreferredVendors(category)`).
3. **Bids come back** — each option carries its own `optionBids[]`.
4. **Discussion + selection** — parties comment, mark preferences, narrow down.
5. **Signoff cycle** — required parties (default: designer + contractor + client; GC can override or initiate) sign off on the chosen option.
6. **Lock** — selection becomes `Locked`. No edits allowed.
7. **Order progression** — contractor moves it through `Ordered → Received → Installed` (these don't unlock).
8. **Change order (optional, any time post-lock)** — any party can initiate a CO that proposes a change. CO has its own signoff cycle. On CO approval, the selection unlocks, the new spec applies, and a new lock is set.

---

## 1. Data model

### Selection doc (`projects/{projectId}/selections/{selectionId}`)

Existing `SelectionTemplateFields` is extended with these fields:

```ts
export type SignoffParty = 'designer' | 'contractor' | 'client' | 'gc';

export interface PartySignoff {
  by: string;
  byName?: string;
  at: any;
  note?: string;
  revisionAtSignoff: number;
}

export interface SelectionOption {
  id: string;
  uploadedBy: string;
  uploadedByRole: SignoffParty | 'projectManager' | 'admin';
  uploadedAt: any;
  productName: string;
  vendor?: string;
  description?: string;
  imageUrls?: string[];
  files?: { name: string; url: string; mime: string }[];
  bids?: OptionBid[];           // bids for THIS option
  bidRequestStatus?: 'pending' | 'requested' | 'received' | 'declined' | 'no_vendor';
  notes?: string;
  isOverageOption: boolean;     // true for the 4th+ option (subject to D-002 fee)
  overageAcknowledgedBy?: string;
  overageAcknowledgedAt?: any;
}

export interface OptionBid {
  id: string;
  vendorId?: string;
  vendorName: string;
  vendorEmail?: string;
  vendorPhone?: string;
  amount: number;
  unit?: string;
  leadTimeDays?: number;
  notes?: string;
  requestedAt: any;
  submittedAt?: any;
  status: 'pending' | 'received' | 'declined' | 'expired' | 'accepted';
}

export interface SelectionRevision {
  revision: number;
  at: any;
  by: string;
  byRole: SignoffParty | 'projectManager' | 'admin';
  changedFields: string[];
  summary?: string;
  invalidatedSignoffs?: SignoffParty[];
  changeOrderId?: string;  // if this revision came from a CO
}

// Additions to SelectionTemplateFields:
{
  // Options + bidding
  options?: SelectionOption[];
  selectedOptionId?: string;        // proposed/chosen; only final at lock
  optionCount?: number;             // denormalized for quick "is 4th option?" checks

  // Signoffs
  signoffs?: {
    designer?: PartySignoff;
    contractor?: PartySignoff;
    client?: PartySignoff;
    gc?: PartySignoff;
  };
  requiredSignoffs?: SignoffParty[];  // default ['designer','contractor','client']
  fullySignedOff?: boolean;
  fullySignedOffAt?: any;

  // Lock state
  lockState?: 'unlocked' | 'locked';
  lockedAt?: any;
  unlockedByChangeOrderId?: string;
  changeOrderIds?: string[];

  // Revisions
  revision?: number;
  revisionHistory?: SelectionRevision[];

  // Edit audit
  lastEditedBy?: string;
  lastEditedByRole?: SignoffParty | 'projectManager' | 'admin';
  lastEditedAt?: any;
  lastEditSummary?: string;

  // Comments denormalization
  commentCount?: number;
  lastCommentAt?: any;
  unreadFor?: { designer?: any; contractor?: any; client?: any; gc?: any };

  // Overage fee accrual (per D-002)
  overageFeeAccrued?: number;       // sum of $500 × (n options - 3)
  overageEvents?: { optionId: string; addedBy: string; addedAt: any; feeAmount: number }[];
}
```

### Comments (subcollection)

```
projects/{projectId}/selections/{selectionId}/comments/{commentId}
```

Threaded via `parentId`, resolvable, denormalized `commentCount` on parent. Same shape as in the prior draft.

### Change orders (`changeOrders/{coId}`)

```ts
interface ChangeOrder {
  id: string;
  projectId: string;
  targetType: 'selection' | 'contract';
  targetId: string;
  proposedChange: {
    summary: string;
    fields?: Record<string, any>;
    newOptionId?: string;
    newSpec?: any;
  };
  costImpact?: number;
  scheduleImpactDays?: number;
  initiatedBy: string;
  initiatedByRole: SignoffParty | 'projectManager' | 'admin';
  initiatedAt: any;
  reason: string;
  signoffs?: {
    designer?: PartySignoff;
    contractor?: PartySignoff;
    client?: PartySignoff;
    gc?: PartySignoff;
  };
  requiredSignoffs?: SignoffParty[];
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'withdrawn';
  approvedAt?: any;
  rejectedAt?: any;
  rejectionReason?: string;
}
```

On approval, a Cloud Function trigger (`onChangeOrderApproved`) applies the change to the target selection: bumps revision, archives prior signoffs, applies `proposedChange.fields` or swaps to `proposedChange.newOptionId`, writes `unlockedByChangeOrderId` for audit, then immediately re-enters the signoff cycle.

---

## 2. The four stakeholders

| Role | What they do | Default signoff slot |
|---|---|---|
| **Designer** | Curates options, recommends. Their domain expertise is the spec. | Required signoff |
| **Contractor** (sub) | Bids on options, signs off on cost + buildability. | Required signoff |
| **Client** | Picks favorites, comments, ultimately approves the spec they'll live with. | Required signoff |
| **GC (Tyler)** | Initiates, edits anything, can override any signoff, can break a lock without a CO (in extremis). | Not in `requiredSignoffs` by default — can be added per selection. GC has admin override regardless. |
| **projectManager** | Acts as GC's delegate for operational work — can upload options on GC's behalf and initiate edits, but **cannot sign off as GC** and cannot break locks (per `docs/decisions.md` §D-001). | Never |

`requiredSignoffs` defaults to `['designer', 'contractor', 'client']` and is set on the seeded selection. It can be overridden per selection (e.g., low-stakes finish where contractor doesn't need to weigh in). GC can edit `requiredSignoffs` at any time; the edit is logged but doesn't bump revision.

---

## 3. The CTAs per party

1. **"I sign off"** — primary, when the current revision has no entry in `signoffs.{myRole}`. Locks the selection if this is the last required signoff.
2. **"Comment"** — never affects signoff state.
3. **"Propose a change"** — pre-lock: bumps revision, invalidates signoffs, notifies all parties. Post-lock: **opens the change order draft form instead.**
4. **"Add option"** — uploads a new option, fires bid request, may trigger overage paywall.
5. **(GC only) "Sign on behalf of <party>"** and **"Break lock"** — override actions with required reason.

---

## 4. Multi-option workflow detail

### Adding an option

Any of {client, designer, contractor, GC, projectManager} can hit "Add option" on a pre-lock selection. UI flow:

1. **If this would be the 4th+ option AND the initiator is the client:**
   - Modal: "Adding a 4th option will incur a $500 fee, payable at project close. The contractor will be asked to provide a bid. Continue?" (Per D-002-b, this might also apply when GC adds on the client's behalf — pending decision.)
   - Acknowledge → record `overageAcknowledgedBy`, accrue `overageFeeAccrued += 500`, append to `overageEvents[]`.
2. **Option upload form**: product name, vendor (optional), description, images, files.
3. **On submit**:
   - Append to `options[]`.
   - `optionCount += 1`.
   - Compute `bidRequestStatus`: resolve preferred vendors via `usePreferredVendors(category)`. If at least one match, status = `pending` and `RequestBidUpdateAuto` fires (existing flow). If zero matches, status = `no_vendor` and GC is notified to pick a vendor.
   - Bump revision (this IS a material change).
4. Existing signoffs invalidated.

### Bid lifecycle for an option

- `pending` — bid request created, not yet sent
- `requested` — email/SMS sent to vendor (via `/api/bid-requests/send`)
- `received` — vendor responded with `amount` + `leadTimeDays`
- `declined` — vendor explicitly said no
- `expired` — no response within window (recommend 14 days default; chase reminder at 7 days)

Multiple vendors can bid on the same option (`options[i].bids[]`). Lowest qualifying bid is auto-flagged as recommended; GC/contractor can mark a different one accepted.

### Selecting an option

A party marks `selectedOptionId = <optionId>`. This is a soft selection (not the lock). When all `requiredSignoffs` are present at the current revision AND `selectedOptionId` matches what each party agreed to, the lock fires.

### Lock fires

- `lockState = 'locked'`, `lockedAt = now`, `fullySignedOff = true`.
- `onSelectionLocked` Firestore trigger:
  - Notifies all stakeholders (in-app + email; SMS for client if opted in).
  - Auto-creates a `purchaseOrder` draft if the contractor's role workflow expects it (existing `purchaseOrders/` collection).
  - Marks any non-accepted bids on other options as `expired`.

### Editing a locked selection

UI surfaces only one CTA: **"Initiate change order."** Other edit affordances are disabled with tooltip "Locked — change order required."

---

## 5. Change order flow

1. Any party (or GC) clicks "Initiate change order" on a locked selection.
2. CO draft form opens — required: reason, proposed change (free text + optionally pick a different option or write a new spec), optional cost/schedule impact.
3. On save: `changeOrders/{coId}` doc created with `status: 'draft'`.
4. Initiator submits → `status: 'pending'`; notifications fire to the same `requiredSignoffs` as the underlying selection (per D-002-d recommendation).
5. Each required party signs off on the CO. Same UI pattern as selection signoff.
6. Once all signed → `status: 'approved'`, `onChangeOrderApproved` Cloud Function:
   - Applies the change to the selection (bump revision, swap option or update fields).
   - Clears `signoffs` on the selection.
   - Sets `lockState = 'unlocked'`, `unlockedByChangeOrderId = coId`, appends to `changeOrderIds[]`.
   - Re-enters the normal signoff cycle to relock.
7. If any party rejects → CO `status: 'rejected'`, no change to the selection, initiator can revise or withdraw.

---

## 6. Lifecycle simplification

Collapsing the prior 9-state `SelectionLifecycle` enum to:

- **`active`** — pre-lock, iteration in progress (at least one required signoff missing)
- **`locked`** — all required signoffs present at current revision
- **`ordered`** / **`received`** / **`installed`** — post-lock contractor progression (do not unlock)

`bids[]` state stays orthogonal: a selection can be `active` and have `Bids-Received` simultaneously. The old `Awaiting-Bids` / `Bids-Received` enum values become per-option `bidRequestStatus` on each `OptionBid`.

---

## 7. Firestore rules

Builds on the earlier draft, with these additions:

```js
match /projects/{projectId}/selections/{selectionId} {
  function project() { return get(/databases/$(database)/documents/projects/$(projectId)).data; }
  function hasProjectAccess() {
    return isGC() || isAdmin()
      || (isProjectManager() && request.auth.uid in project().assignedUserIds)
      || (isClient() && project().clientId == request.auth.uid)
      || (isDesigner() && request.auth.uid in project().assignedUserIds)
      || (isSub() && request.auth.uid in project().assignedUserIds);
  }
  function affected() { return request.resource.data.diff(resource.data).affectedKeys(); }
  function myRole() {
    return (isGC() || isAdmin()) ? 'gc'
      : (isClient() && project().clientId == request.auth.uid) ? 'client'
      : isDesigner() ? 'designer'
      : isSub() ? 'contractor'
      : null;
  }

  allow read: if hasProjectAccess();
  allow create: if isGC() || isProjectManager() || isDesigner() || isAdmin();

  // Signoff-only update (each party touches own slot, locked to current revision)
  allow update: if affected().hasOnly(['signoffs', 'fullySignedOff', 'fullySignedOffAt', 'lockState', 'lockedAt', 'updatedAt'])
    && myRole() != null
    && request.resource.data.signoffs[myRole()] != null
    && request.resource.data.signoffs[myRole()].by == request.auth.uid;

  // GC/admin override: sign on behalf of any party OR break the lock; reason required
  allow update: if (isGC() || isAdmin())
    && request.resource.data.revisionHistory.size() > resource.data.revisionHistory.size();

  // Material edit pre-lock — anyone with project access; revision must increment
  allow update: if hasProjectAccess()
    && resource.data.lockState != 'locked'
    && request.resource.data.revision == resource.data.revision + 1
    && request.resource.data.signoffs.size() == 0;

  // Post-lock progression — GC/projectManager/admin only
  allow update: if (isGC() || isProjectManager() || isAdmin())
    && affected().hasOnly(['orderStatus', 'updatedAt']);

  allow delete: if isGC() || isAdmin();
}

match /changeOrders/{coId} {
  function co() { return resource.data; }
  function project() { return get(/databases/$(database)/documents/projects/$(co().projectId)).data; }
  function hasCoAccess() {
    return isGC() || isAdmin() || isProjectManager()
      || (isClient() && project().clientId == request.auth.uid)
      || ((isDesigner() || isSub()) && request.auth.uid in project().assignedUserIds);
  }
  allow read: if hasCoAccess();
  allow create: if hasCoAccess();
  // Signoff updates per party (same pattern as selection)
  allow update: if hasCoAccess() /* + signoff-only-own constraints */;
  allow delete: if (isGC() || isAdmin()) && co().status == 'draft';
}
```

Full rules block written during Slice 1 implementation.

---

## 8. Indexes

Append to `firestore.indexes.json`:

```json
{ "collectionGroup": "selections", "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "lockState", "order": "ASCENDING" },
    { "fieldPath": "phase", "order": "ASCENDING" }
  ]
},
{ "collectionGroup": "selections", "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "fullySignedOff", "order": "ASCENDING" },
    { "fieldPath": "lastEditedAt", "order": "DESCENDING" }
  ]
},
{ "collectionGroup": "changeOrders", "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "projectId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "initiatedAt", "order": "DESCENDING" }
  ]
},
{ "collectionGroup": "comments", "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "parentId", "order": "ASCENDING" },
    { "fieldPath": "at", "order": "ASCENDING" }
  ]
}
```

---

## 9. Migration

One-time migration script `scripts/migrate-selections-to-four-party.mjs`. For each doc under `projects/*/selections/*`:

1. Set `revision = 1`, `lockState = 'unlocked'` if not present.
2. Map existing signoffs:
   - `signoffs.contractor = costSignoff ?? designSignoff` (preserve `at`, `by`, `note`; `revisionAtSignoff = 1`)
   - `signoffs.designer = designSignoff` if present
   - `signoffs.client = null` (no historical equivalent)
3. Initialize `options[]`:
   - If existing `items[]` has entries, promote each to an `options[]` entry. Preserve `bids` per option if possible; if bids are currently global on the selection, leave them unattached with `bidRequestStatus = 'received'` and a migration note.
   - `optionCount = options.length`.
4. **Per D-002-a recommendation (grandfathering)**: if `gcApproved === true` (legacy contractor-signoff model), set `lockState = 'locked'`, `fullySignedOff = true`, `lockedAt = <original gcApprovedAt>`, and mark with `legacy: { fullyApprovedUnderOldModel: true }`. UI shows "Approved under previous workflow"; per-item "Initiate change order to revise" action is available.
5. Initialize `revisionHistory[0]` with summary `'Imported from contractor-signoff model'`.
6. `requiredSignoffs = ['designer', 'contractor', 'client']` for everything (universal default).
7. Idempotent: skip docs that already have `revision` set.

---

## 10. Reconciling with the `feat/selections-v2-dashboard-reminders` branch

Most v2 components port forward; pieces coupled to `clientApprovalStatus = 'Checking w/ Client'` get replaced with the `lockState` + `signoffs` model. Per-component verdict:

| Component | Status | Effort |
|---|---|---|
| `SelectionsNeededTile` | Keep, re-frame counter | Low |
| `SelectionsBanner` | Keep | None |
| `InAppNotificationCenter` | Keep | None |
| `NotificationPreferences` | Keep | None |
| `RecommendationBadge` | Keep, decouple from approval flag | Low |
| `DesignerRecommendationPanel` | Keep, rename to `OptionRecommendationPanel` (any party can recommend an option, not just designer) | Medium |
| `scheduledSelectionRemindersDaily` | Keep, expand recipients to all 4 parties | Medium |
| `onSelectionUpdated` | Expand — detect revision bumps, lock events, CO events | Medium |
| `bulkSeedSelections` | Keep | None |

Branch port lands in Slice 4 — see §11.

---

## 11. Phased rollout

### Slice 1 — minimum shippable
- Data model fields added (`signoffs`, `requiredSignoffs`, `revision`, `lockState`, `options[]`, `optionCount`, `lastEditedBy*`, `overageFeeAccrued`).
- `SeedSelectionsFromTemplate` extended to set `requiredSignoffs` default.
- `SelectionsManager` rewritten for multi-option list + "Add option" CTA.
- "I sign off" CTAs in DesignerPortal, GCDesignSnapshot, ClientSelectionsTimeline (and SubcontractorPortal per D-002-g answer).
- `RequestBidUpdateAuto` invoked on option upload.
- Overage paywall modal (UI + local accrual; no payment integration yet).
- Lock-on-full-signoff Cloud Function trigger.
- Post-lock edit affordances disabled; "Initiate change order" CTA surfaced.
- Firestore rules updated for signoff-only + lock semantics.
- New selections only — DO NOT touch existing data.

### Slice 2 — comments + change orders
- `comments` subcollection + UI thread per selection.
- `changeOrders` collection + minimal CO authoring UI.
- `onChangeOrderApproved` Cloud Function.
- Audit existing `changeOrders` usage (the contracts module) — see D-003-a.

### Slice 3 — migration + grandfathering
- `migrate-selections-to-four-party.mjs` script.
- "Approved under previous workflow" UI badge.
- "Initiate change order to revise" action on legacy items.

### Slice 4 — payment rail + v2 branch port
- Stripe (or chosen rail per D-007) integration for overage fees.
- v2 dashboard tile, banner, NotificationCenter, designer recommendation panel adapted to lockState/signoffs.
- Daily reminders Cloud Function adapted to per-party signoff backlog.

### Slice 5 — polish + analytics
- Activity feed (revisions + comments + signoffs + COs interleaved).
- Time-to-lock metrics.
- Per-vendor bid response time analytics.
- Bulk actions ("I sign off on all Phase X selections at once").

---

## 12. Open follow-ups (need user input)

These are raised by the decisions in `docs/decisions.md` §D-002 + §D-003. They need answers before Slice 1 ships in its final form (some can be deferred to Slice 4, noted below).

- **D-002-a** — Who pays the $500 overage fee, and when? (Affects Slice 4 payment rail.)
- **D-002-b** — Does the fee apply when GC adds the 4th option on the client's behalf? (Affects Slice 1 UI.)
- **D-002-c** — Refundable if client picks one of the 4th+ options? (Slice 4.)
- **D-002-d** — CO signoff parties: same as the underlying selection, or shorter? (Affects Slice 2.)
- **D-002-e** — On option upload with no preferred vendor for that category: notify GC to pick manually, auto-create a "no vendor" placeholder, or block the upload? (Affects Slice 1 UX.)
- **D-002-f** — Multiple contractors bidding on the same option: ok by default? (Recommend yes.)
- **D-002-g** — Sub-portal: keep at "bid requests only" (current), or expose the selection when they have a bid open? (Recommend expose minimal read of the option they bid on; full selection stays GC/designer/client.)
- **D-003-a** — Does the existing `changeOrders` collection (used by the contracts module) interoperate with this, or do we need a separate `selectionChangeOrders` collection? (Affects Slice 2.)
- **D-003-b** — Multi-target CO support — needed for v1 or deferrable?
- **New — overage paywall UX detail** — show the warning modal once-per-selection or once-per-session? (Recommend once-per-selection.)
- **New — `requiredSignoffs` editability** — if GC changes `requiredSignoffs`, does that invalidate existing signoffs? (Recommend no, but flag any newly added party as "needs to sign.")
- **New — GC self-signoff semantics** — when GC is added to `requiredSignoffs` for a specific selection, does GC's signoff use the `gc` slot OR does the override pathway always work in parallel? (Recommend: `gc` slot is the formal record; override is for crisis only.)
- **New — Sub-onboarding for the bid request flow** — when a contractor receives an auto-bid-request on an option upload, what's their landing experience? Existing sub portal opens to a bid request list; the new flow needs to clearly link "Bid request for selection X, option Y, project Z" so they can context-switch.
