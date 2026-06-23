# Bid-package portal visibility — investigation (TASK-0003)

**Date:** 2026-06-23 · **Status:** investigation complete, NO production fix shipped
**Symptom (Tyler, confirmed):** A sub clicks the bid-package email link, signs into
the sub portal, and **the bid request itself is invisible** — not just the documents
inside it. Zero successful bid submissions have ever happened.

## TL;DR

1. **The recipient-resolution code is already correct** and has been deployed since
   Session 8. TASK-0003's primary hypothesis ("the send path only writes the email,
   or only the contact ID") is **false** — the send path writes all three identifiers.
   There is no recipient-resolution fix to ship.
2. **The true root cause of the invisible request could not be confirmed** because the
   build environment has **no valid GC/admin credentials** (the documented `testgc`
   account returns HTTP 400 at sign-in; no `.env.local`). Confirming it requires a
   read-only query against prod Firestore as the affected sub.
3. **The secondary docs-visibility fix proposed by TASK-0002 (auto-promote `inSsot`)
   is insufficient on its own** — a second rule gate, `isOnProjectFs`, also blocks
   bid-invited subs, and they are never added to `assignedUserIds`.
4. Per the dispatch instruction ("if the bug is different from the hypothesis, STOP and
   report instead of guessing — don't ship a fix to a wrong diagnosis"), **no
   speculative production change was made.** This PR delivers the diagnosis plus two
   ready-to-run scripts.

## What the code actually does (verified by reading)

### Write path — `functions/src/bids/sendBidRequestRoute.ts:582-591`
```js
for (const v of augmentedVendors) {
  if (v.contactId) { invitedSubIds.push(v.contactId); invitedSubContactIds.push(v.contactId); }
  if (v.linkedUserId) invitedSubIds.push(v.linkedUserId);
  if (v.email) invitedSubIds.push(v.email.toLowerCase().trim());
}
```
All three identifiers (contact-doc ID, linked Auth UID if known, lowercased+trimmed
email) are written. `SendBidPackageModal.tsx` passes `contactId`, `email`, and
`linkedUserId` for every vendor, so the inputs are present.

### Read path — `client/src/components/bidding/SubBidRequestsTab.tsx:196-202`
```js
const search = Array.from(new Set([selfUid, selfEmail].filter(Boolean)));
query(collectionGroup(db, 'bidRequests'),
      where('invitedSubIds', 'array-contains-any', search),
      orderBy('createdAt', 'desc'));
```
`selfEmail = (auth.currentUser?.email || '').toLowerCase().trim()`. A sub who signs
up with the same email the GC used resolves on the lowercased-email match.

### Rule — `firestore.rules:811-820`
```
allow read: if isGC() || isDesigner()
  || (isSignedIn() && ( request.auth.uid in resource.data.invitedSubIds
      || (request.auth.token.email != null
          && request.auth.token.email.lower() in resource.data.invitedSubIds) ));
```
Matches on uid OR lowercased email — consistent with both the write and the query.

### Index — `firestore.indexes.json:423-435`
A `COLLECTION_GROUP` index on `invitedSubIds (CONTAINS)` + `createdAt (DESC)` exists,
which the `array-contains-any` + `orderBy` query requires. Added in Session 8.

**Conclusion:** write ⇄ query ⇄ rule ⇄ index are mutually consistent for the standard
case (sub signs in with the same email the GC entered). The recipient-resolution layer
is not where a code bug lives.

## The duplicate rule block (real smell, NOT the bug)

There are **two** `match /projects/{projectId}/bidRequests/{requestId}` blocks:
- `firestore.rules:584-588` — `allow read: if isGC() || isDesigner();` (older)
- `firestore.rules:811-820` — adds the sub-by-invitedSubIds read (Session 8)

Both are siblings under the single `match /databases/{database}/documents` root.
Firestore **ORs** `allow` rules across sibling match blocks, so the sub read at 811 is
granted regardless of 584. The duplicate is confusing and worth consolidating, but it
does **not** block subs. (Recommended cleanup: delete the 584-588 block; behaviour-neutral.)

## Why the invisible-request symptom is real but unconfirmed here

Given the code chain is correct and deployed, the remaining real-world explanations
all need prod inspection that requires credentials this environment lacks:

- The GC may have created the contact with an email that differs from the one the sub
  actually signed up with (the "Claim profile" path exists for exactly this). Tyler's
  test uses the same address, so this would need confirming against the real contact doc.
- The sub may have signed in with a federated (Google) identity whose token email
  differs in case/alias from `invitedSubIds`.
- A prod-only gate (App Check / index build still pending / data shape drift).

The shipped `scripts/diag-bid-visibility.mjs` answers this in one run: it dumps the
`invitedSubIds` of recent real sends and re-runs the exact portal query to prove the
index is live. **It needs valid GC creds to run** (see Blocker).

## Secondary: docs/selections inside the request

- **Attached plans already render** — `SubBidSubmissionForm.tsx:637+` renders
  `request.plans` inline (URLs are long-lived Storage download tokens). This works
  without `inSsot` or project membership.
- **"Project Files" query** (`SubBidSubmissionForm.tsx:209-212`) hits `/documents`
  with no `inSsot` filter and is silently caught (`:222`).
- **Attached selections** (`:244-245`) `getDoc` each `projects/{p}/selections/{id}`,
  silently caught (`:271`).

Both `/documents` (`firestore.rules:520-521`) and `/selections` (`:614-615`) require
**`inSsot == true` AND `isOnProjectFs(projectId)`** for a sub. `isOnProjectFs`
(`:126`) requires `request.auth.uid in projects/{pid}.assignedUserIds`. A grep shows
`assignedUserIds` is only ever written for GC/PM/staff (Sales.tsx, UserManagement.tsx)
— **never for bid-invited subs**. So:

> Auto-promoting `inSsot` on attach (TASK-0002 fix A / TASK-0003 step 5) is **necessary
> but not sufficient**. Even with `inSsot: true`, a bidding sub fails `isOnProjectFs`
> and the reads stay permission-denied.

### Recommended real fix (needs a decision, possibly UX/permission-scoped)
Pick one — do not ship blindly:
- **(Preferred) Token-keyed Cloud Function read.** Have `SubBidSubmissionForm` fetch
  attached docs/selections via an admin-SDK endpoint keyed off the invite token — the
  same pattern `/api/bid-requests/by-token/:token` already uses for the public
  `BidRespond` page. No rule/membership change; scoped exactly to what was attached.
- **(Avoid) Add invited subs to `assignedUserIds`.** Would satisfy `isOnProjectFs` but
  grants broad project-resource read access far beyond the attached items — a
  permission-scope expansion that is approval-required under DECISION-0005.
- Combine the chosen path with `inSsot` auto-promote so the SSOT flag reflects intent.

## Blocker that stopped end-to-end verification

The required live test-send (and the read-only prod diagnostic) need a Firebase ID
token for a GC/admin account. In this environment:
- No `.env.local` and no `E2E_ADMIN_*` / `SMOKE_*` env vars are set.
- The documented `testgc@skyelineos.com` test account returns **HTTP 400
  (invalid login)** at `/sign-in` (password rotated / account changed).

So `scripts/probe-bid-package-test-send.mjs` was authored but **not executed**, and no
email was sent. Both scripts are ready to run the moment valid creds are provided via
`.env.local` (see `scripts/e2e/README.md`) or env vars.

## Deliverables in this PR

- `scripts/diag-bid-visibility.mjs` — READ-ONLY. Dumps recent `bidRequests`
  `invitedSubIds` + proves the collectionGroup index is live. (Run first — it confirms
  the true cause of the invisible request.)
- `scripts/probe-bid-package-test-send.mjs` — the step-6 test-send harness. Self-cleaning
  `__e2e` data, sends a real email to `tyjorho@gmail.com`, prints bidRequestId + magic
  link + recipient.
- `docs/bid-visibility-investigation.md` — this document.

**No production logic or rules changes.** See "TL;DR" for why.

## Suggested next steps (for the next dispatch, with creds)
1. Set `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` in `.env.local`.
2. Run `node scripts/diag-bid-visibility.mjs` → read the `invitedSubIds` of Tyler's
   actual recent send and the index probe result. This pinpoints the invisible-request
   cause (email mismatch vs. index vs. data shape).
3. Run `node scripts/probe-bid-package-test-send.mjs` → confirm the happy path end-to-end.
4. For docs visibility, implement the token-keyed Cloud Function read above.
