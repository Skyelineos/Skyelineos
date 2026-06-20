# Communication Center — Schema & Architecture Reference

The Communication Center is the lifecycle-spanning "permanent memory" for every
lead and project: one conversation store that begins when someone becomes a lead
and carries forward — as the *same* thread — through design → estimate → contract
→ construction → warranty → long-term support.

This is the durable reference (like `ingestion-lab-schema.md`). It tracks what
ships per phase. **Phase 1 is implemented; Phases 2–4 are planned.**

## Design principles
1. **Extend, don't fork.** Built on the proven project-channels model
   (`lib/messaging/firestore.ts`), the `notifications/{id}` → `dispatch` fan-out,
   and (for Phase 3) the Ingestion-Lab brain. No parallel messaging stack.
2. **Originals are immutable.** Human messages are append-only. AI output is a
   *separate* record that references — never mutates — the source message.
3. **Rules are the gate.** Visibility is enforced in `firestore.rules`, not just
   the UI.

## The lifecycle key: `subjectRef`
A thread is **not** nested under a project. It is a top-level document keyed by:

```
subjectRef:   { type: 'lead' | 'client' | 'project', id: string }
subjectChain: string[]   // e.g. ['lead:abc', 'project:xyz'] — full lifecycle trail
```

When a lead converts, `repointThreadSubject()` sets `subjectRef` to the new
subject and appends to `subjectChain`. The conversation carries forward intact;
history is never copied or orphaned. (The automatic conversion trigger is a
Phase 2 Cloud Function; Phase 1 ships the data model + the client helper.)

## Collections

```
communications/{threadId}
communications/{threadId}/messages/{messageId}
communications/{threadId}/extractions/{extractionId}   (AI output — Phase 3; CF-write-only)
```

### `communications/{threadId}` — thread
| Field | Notes |
|---|---|
| `subjectRef` | `{ type, id }` — lead / client / project |
| `subjectChain` | full lifecycle trail (`['lead:..','project:..']`) |
| `subjectLabel` | denormalized name for list display |
| `title` | conversation title |
| `category` | General · Sales · Design · Selections · Budget · Schedule · Construction · Trade Coordination · Change Orders · Issues · Warranty · Internal |
| `kind` | `thread` \| `phone_call` \| `meeting` \| `voice_memo` |
| `memberUids[]` | visibility membership (mirrors channels) |
| `visibility` | `internal` \| `client` \| `trade` \| `restricted` |
| `tradeIds[]` | trade tagging → vendor records (filter + future notify) |
| `status` | `open` \| `resolved` \| `archived` |
| `priority?` | `low`\|`normal`\|`high`\|`urgent` |
| `lastMessageAt`, `lastMessageText` | denormalized preview for the list |
| `createdAt`, `createdBy`, `createdByName` | |

### `communications/{threadId}/messages/{messageId}` — item (append-only)
| Field | Notes |
|---|---|
| `type` | `text`\|`file`\|`photo`\|`video`\|`audio`\|`call_log`\|`meeting_record`\|`system`\|`ai_note` |
| `text` | body |
| `authorUid`, `authorName`, `authorRole` | |
| `mentions[]` | uids @-tagged → notified |
| `tradeIds[]` | trade references |
| `attachments[]` | `{ name, url, storagePath, contentType, size }` |
| `parentId?` | threaded replies |
| `visibility?` | overrides the thread's when set |
| `source` | `app`\|`phone`\|`meeting`\|`ingestion`\|`ai` |
| `createdAt` | |

### `communications/{threadId}/extractions/{id}` — AI output (Phase 3, schema reserved)
`entityType` (`action_item`\|`decision_made`\|`decision_needed`\|`commitment`\|
`change_order_signal`\|`issue`\|`schedule_change`\|`vendor_mention`),
`sourceMessageId`, `projectId?`, `ownerUid?`, `tradeIds[]`, `payload`,
`confidence`, `needsClarification`, `lane` (`auto`\|`review`\|`ask`),
`visibility:'internal'`, `status` (`open`\|`linked`\|`done`\|`dismissed`),
`linkedRef?`. **Cloud-Function-written only**; staff may update only the
disposition fields. Mirrors the Ingestion-Lab three-lane model.

## Access control (`firestore.rules`)
- Thread **read**: `isGC()` OR (member AND visibility ∈ {client, trade, restricted}).
  `internal`/`restricted` are staff/explicit-member only.
- Thread **create**: `isGC()` and `createdBy == auth.uid`.
- Thread **update**: staff freely; members only `memberUids` / `lastMessage*`
  (post + @mention add) — never title/category/visibility.
- Thread **delete**: admin only.
- Message **read**: same as thread (`get()` on parent).
- Message **create**: member or staff, `authorUid == auth.uid`, `source != 'ai'`.
- Message **update/delete**: staff or author.
- `extractions`: read staff-only; create/delete **false** (CF/admin-SDK only);
  staff update limited to `status`/`linkedRef`/`reviewedAt`/`reviewedByUid`.

## Indexes (`firestore.indexes.json`)
`communications` composites: `(subjectRef.type, subjectRef.id, lastMessageAt DESC)`,
`(category, lastMessageAt DESC)`, `(memberUids CONTAINS, lastMessageAt DESC)`,
`(tradeIds CONTAINS, lastMessageAt DESC)`.

## Storage
Attachments under `communications/{threadId}/...` (`storage.rules` opens this to
any authed user; per-thread visibility is enforced by the Firestore rules).

## Notifications
@mentions reuse the existing fan-out: `notifyThreadMentions()` writes
`notifications/{id}` (kind `message_mention`, deep-link
`/communications?thread=<id>`) → `dispatch.ts` sends email/SMS/push. No new infra.

## Code map (Phase 1)
| File | Role |
|---|---|
| `client/src/lib/communications/firestore.ts` | types, CRUD, listeners, `subjectRef` + lifecycle helpers, mention notify |
| `client/src/lib/communications/upload.ts` | resumable attachment upload |
| `client/src/components/communications/CommThreadView.tsx` | message stream + composer (@mention, attachments, visibility badge) |
| `client/src/components/communications/NewThreadModal.tsx` | create thread against any subject |
| `client/src/pages/CommunicationCenter.tsx` | hub: list + filter + search + thread view (route `/communications`) |
| `firestore.rules` / `firestore.indexes.json` / `storage.rules` | access + query + storage |

Route: **`/communications`** (admin/gc/projectManager), nav under the sidebar
"Communication" group. `/messages` (project channels) and `/comms-log` remain.

## Search
Phase 1 = client-side filter over the most-recently-active threads + previews
(title / subject / category / last-message). Full-text / semantic search
(Typesense/Meilisearch or embeddings) is deferred — flagged so the model doesn't
paint into a corner.

## Phase 2 additions (done)

**Surfaces.** One reusable `CommunicationPanel` (list + thread view + new/call/
meeting) powers four places: the global hub (`/communications`), the per-project
page (`/projects/:id/communications`, sidebar → Field → Communication), the
contact detail view (Communication button → drawer), and Sales lead cards (kebab
→ Messages → drawer). MobileNav gets a Communication Center entry.

**Client messenger (priority).** `ClientMessenger` replaces the client portal
Messages tab — an iMessage-style mobile-first composer (photo / camera / video /
file + Send) that get-or-creates the project's General `client`-visible thread via
`ensureSubjectThread`. No categories, no dropdowns; the project is known from
context. Uses the Firebase **auth uid** for membership so rules pass.

**Phone calls & meetings.** Logged as typed threads (`kind: 'phone_call' |
'meeting'`) so they're searchable in the Center. Structured facts (participants,
occurredAt, summary, followUp) live on the thread; notes become the first
message. Meetings accept audio/video uploads; `transcriptStatus` + `aiSummary`
are reserved Phase-3 placeholders.

**Action Items** — `actionItems` collection (title, description, assignee,
dueDate, projectId/clientId, sourceThreadId/sourceMessageId, status). Staff-only.
`linkedTaskId` + `createdViaAi` are reserved hooks (no Schedule/Tasks/AI wiring).

**Client Decision Log** — `decisions` collection (title, summary, decidedOn,
project/client, relatedRoom/Selection/Trade, source*). Staff-only, traceable to
source thread.

**Trade tagging** — `tradeIds` on threads (vendor contact ids), edited via the
staff `ThreadToolsBar`, filterable; vendors come from the contacts directory.

New rules: `actionItems`, `decisions` (staff CRUD, admin delete); thread `create`
relaxed so portal members can start a client/trade-visible thread (powers the
client messenger). New indexes: `actionItems` + `decisions` by project/client/
sourceThread. Messages gained `senderType` + `sourceType`.

## Phase status
- **Phase 1 (done):** cleanup of dead messaging stack · lifecycle thread model ·
  hub + nav + route · messages + attachments · @mention notifications · rules +
  indexes + storage · search foundation · extraction/decision schema reserved.
- **Phase 2 (done):** client messenger · per-project / per-client / per-lead
  surfaces · phone-call + meeting records · action items + decision log · trade
  tagging · search over threads/calls/meetings · visibility enforcement.
- **Phase 3 (done — AI layer, slice 1):** staff-triggered **extraction** +
  **summaries** that reuse the Anthropic client already bound to `api`.
- **Phase 3 (remaining):** meeting transcription (needs an STT vendor — deferred);
  automatic / scheduled triggers; auto re-point Cloud Function on lead→project
  conversion; action-item→task / decision deep-links; semantic search.
- **Phase 4:** trade notification workflows · approval requests · project-memory
  AI · SMS/email inbound into threads.

## Phase 3 additions (done)

**Decisions:** extraction + summaries first · **manual** "Analyze"/"Summarize"
trigger · **review-queue gating** (AI never auto-applies) · transcription deferred.

**Backend** (`functions/src/communications/`, folded into the shared `api` Express
app — no new Cloud Run; `ANTHROPIC_API_KEY` already bound, so no new secret /
ApiStorage entry):
- `staffAuth.ts` — `staffOnly` middleware (admin/gc/projectManager via Firestore role).
- `extractionPrompt.ts` — system prompt + `extract_communications` tool (entity
  types: action_item, commitment, decision_made/needed, change_order_signal,
  issue, schedule_change, vendor_mention) + transcript builder.
- `aiBrain.ts` — Claude `claude-sonnet-4-6` tool_use extraction + plain summaries;
  rolling **daily budget guard** ($5 default) in `communications_ai_config/global`;
  de-dupes against open suggestions on re-run.
- `routes.ts` → `POST /api/communications/threads/:id/analyze`,
  `.../:id/summarize`, `POST /api/communications/summarize-project`.

**Data:** extraction writes land in the Phase-1-reserved
`communications/{threadId}/extractions/{id}` with `status:'open'`, `lane:'review'`,
`createdViaAi:true` — the **review queue**. Confirm → creates a real `actionItem`
or `decision` (reusing the Phase-2 libs) + marks the extraction `status:'linked'`
with `linkedRef` (rules already permit those exact fields). Dismiss → `dismissed`.
Thread summaries persist to `thread.aiSummary` (internal-only). No new index
(extractions queried by `createdAt` only, filtered to `open` client-side).

**UI:** `ThreadToolsBar` gains **Analyze** + **Summarize** buttons, the AI-summary
banner (internal-only), and the suggestion **review list** (Confirm / Dismiss per
item). `CommunicationPanel` gains a project-level **Summarize** for project subjects.
Client calls go through `lib/communications/ai.ts` via `authFetch` (ID token);
Claude runs server-side only.

**Safety:** original messages never mutated; AI output is separate records,
internal-only, and gated behind human confirmation.
