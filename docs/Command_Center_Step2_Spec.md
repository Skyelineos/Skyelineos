# Command Center — Step 2 Spec: Ingestion Pipeline Stages

**Status:** Design only. NO code in this commit.
**Depends on:** `docs/Command_Center_Step1_Schema_Map.md` — read that first.
**What this changes vs the Step 1 doc:** Step 1 was *what does the data model
look like today?* Step 2 is *what stages does an inbound message pass through,
and what are the identity / provenance / confidence guarantees at each
boundary?* — the ChatGPT critique landed. Classification alone is not enough.

---

## 0. Why re-scope

The Step 1 doc treated ingestion as: raw → classify → route. That's the
Ingestion-Lab shape and it's fine for a spike. Production ingestion needs
more:

1. **Identity is load-bearing.** If we can't say who sent a message, we
   can't answer any downstream question about it. Identity resolution
   must be its own stage with its own confidence.
2. **Provenance survives every transform.** Every artifact downstream
   must carry a pointer back to the exact raw doc + byte offset that
   produced it. No orphaned "the AI said" outputs.
3. **Confidence never gets flattened.** Every extracted item is
   confidence-tagged 0–1 and downstream surfaces read that tag rather
   than treating the item as certain.
4. **Fact vs. task vs. opinion vs. intention vs. approval.** These are
   five distinct downstream shapes and the pipeline names them
   explicitly. Collapsing them into a generic "action item" loses too
   much signal.

The pipeline: **Raw Event Store → Normalization → Identity Resolution →
Project Assignment → Fact Extraction → Task Detection → Approval
Detection → Executive Summary**. Each stage has its own input / output
schema, failure mode, tier assignment, and a confidence output that
never collapses.

---

## 1. Stage catalog

### Stage 1 — Raw Event Store

**Purpose.** Verbatim persistence of the inbound payload before ANY
parsing or LLM touches it. Satisfies RAW-WRITE-FIRST.

**Input schema.**
Whatever the channel adapter delivers. Email = provider blob. SMS =
Twilio webhook body. Voice = Twilio recording + transcript URL.
Telegram = webhook JSON. Portal message = client-side POST.

**Output schema.**
`inbound_raw/{rawId}` per Step 1 §E.1. Doc ID deterministic
(`${channel}__${sourceRef}`) so retries are idempotent. `verified: false`
until the write is confirmed via read-back.

**Failure mode.**
If the write fails, the caller MUST retry. If retry limit exceeded, the
payload is queued to a durable dead-letter (Cloud Task) and the
channel adapter surfaces a 503 to the provider so they'll retry too.
No message is ever silently dropped.

**Tier assignment.** Tier 1 (code only). No LLM.

**Confidence output.** N/A — this stage is verbatim persistence, no
interpretation.

---

### Stage 2 — Normalization

**Purpose.** Turn provider-specific payloads into a common canonical
shape the rest of the pipeline can consume. Also does the deterministic
sender normalization (E.164 phone, lowercase email) so Stage 3 can
query cleanly.

**Input schema.** `inbound_raw/{rawId}` (verbatim from Stage 1).

**Output schema.**
```
NormalizedMessage {
  rawId: string,             // FK back to inbound_raw
  channel: 'email' | 'sms' | 'voice' | 'telegram' | 'portal' | 'webform',
  sender: {
    channelSpecific: string, // exact address from provider
    normalized: string,      // E.164 for phone, lowercased for email
    displayName?: string,
  },
  recipient: { address, normalized },
  subject?: string,
  body: string,               // plain text; HTML/audio stripped or transcribed
  bodyTruncated?: boolean,
  attachments: Array<{ filename, contentType, size, storagePath }>,
  timestamp: {
    receivedAt: Timestamp,   // provider's clock
    ingestedAt: Timestamp,   // our clock
  },
}
```

**Failure mode.**
- Malformed payload — log to `inbound_raw.errors[]`, mark
  `processed_status='failed'`, DO NOT advance to Stage 3.
- HTML-only email with no plain-text alt — run through a plain-text
  extractor; if that fails, use HTML with a warning.
- Voice transcript missing — hold the record in
  `processed_status='raw'` and re-poll for the transcript when Twilio
  posts it (webhook Stage 1 already covers this).

**Tier assignment.** Tier 1 (code only). Any HTML/text conversion is a
deterministic library call, not an LLM.

**Confidence output.** N/A — deterministic transform.

---

### Stage 3 — Identity Resolution

**Purpose.** Answer "who sent this?" Deterministic FIRST, LLM-augmented
only when deterministic can't answer.

**Input schema.** `NormalizedMessage` from Stage 2 (only `sender.normalized`
matters).

**Output schema.**
```
IdentityResolution {
  rawId: string,
  contactId?: string,              // contacts/{id} — set when resolved
  contactRole?: string,            // 'client'|'sub'|'designer'|'admin'|'lead'|'gc'|'pm'
  linkedUserId?: string,           // Firebase auth uid, when the contact
                                   // has been linked to a real auth account
  method: 'deterministic-phone'
        | 'deterministic-email'
        | 'linked-uid'
        | 'llm-name-match'         // Tier 2 fallback
        | 'unresolved',
  confidence: number,              // 0..1
  candidates?: Array<{             // when >1 hit, list them so a staff
    contactId, name, role, score   // reviewer can disambiguate
  }>,
}
```

**Algorithm.**
1. Query `contacts` on `phoneE164` (SMS/voice) or `emailLower` (email).
   Exactly 1 hit → confidence 1.0, method 'deterministic-*'.
2. 0 hits → check `linkedUserId` on any contact matching the raw
   auth uid (portal-message channel only). Exactly 1 hit → confidence
   0.95, method 'linked-uid'.
3. Still 0 → skip to Stage 4 with `contactId: null, method: 'unresolved',
   confidence: 0`. Do NOT invoke Tier 2 for identity unless the message
   contains a self-identification string like "This is Jane from XYZ".
4. 2+ hits at Step 1 → return top candidates + confidence 0.5,
   method 'deterministic-phone' (or -email) with `candidates[]`
   populated. Staff routing picks the winner.
5. **Tier 2 fallback** — invoke Haiku only when Stage 4 fails to route
   AND the message body contains a proper-noun that might match a
   contact name. Haiku is scored with a proper-noun/company-name
   comparison, confidence output 0..0.7 (never higher than
   deterministic).

**Failure mode.**
Unresolved is OK. The pipeline continues; the message lands in a
"needs staff routing" queue with all context intact. Never blocks.

**Tier assignment.** Tier 1 (code) for steps 1–4. Tier 2 (Haiku) only
for step 5, gated on strict conditions to keep cost near-zero on the
happy path.

**Confidence output.**
- Deterministic phone/email single hit: 1.0
- Linked-uid: 0.95
- Deterministic multi-hit: 0.5
- LLM name-match: 0.3–0.7
- Unresolved: 0.0 (with candidates[]==[])

---

### Stage 4 — Project Assignment

**Purpose.** Answer "which project does this belong to?" Requires
identity from Stage 3 in most paths.

**Input schema.** `IdentityResolution` + the `NormalizedMessage.body`.

**Output schema.**
```
ProjectAssignment {
  rawId: string,
  projectId?: string,
  method: 'contact-single-project'    // identity resolved, contact on 1 project
        | 'contact-multi-project'     // identity resolved, contact on N — need disambiguation
        | 'body-mention'              // body mentions "Veliz build" and Veliz is 1 project
        | 'llm-context-match'         // Tier 2 fallback
        | 'unresolved',
  confidence: number,                 // 0..1
  candidates?: Array<{ projectId, name, score }>,
}
```

**Algorithm.**
1. Identity resolved (Stage 3 confidence ≥ 0.9): query `projects` with
   `clientIds` array-contains `contactId`. Exactly 1 hit → confidence
   1.0, method 'contact-single-project'.
2. Multi-hit → confidence 0.5, method 'contact-multi-project',
   `candidates[]` populated. Prefer the project with the most recent
   activity (last `updatedAt` timestamp).
3. Identity unresolved OR contact on 0 projects: scan the body for
   project-nickname mentions (case-insensitive against every
   project's `name` field, first-word matches only). Single hit →
   confidence 0.7, method 'body-mention'.
4. **Tier 2 fallback** — Haiku takes the body + a short list of the
   staff's active project names and outputs which is most likely with
   a confidence 0..0.8. Never used when Steps 1–3 succeed.
5. Nothing works → `method: 'unresolved', confidence: 0`. Message
   lands in "needs staff routing" — same queue as Stage 3 unresolved.

**Failure mode.** Same as identity — unresolved is fine, staff routing
covers it.

**Tier assignment.** Tier 1 for 1–3, Tier 2 for 4.

**Confidence output.**
- Deterministic single-project: 1.0
- Body mention single-hit: 0.7
- LLM context match: 0.3–0.8
- Multi-hit candidates: 0.5
- Unresolved: 0.0

---

### Stage 5 — Fact Extraction

**Purpose.** Pull STRUCTURED FACTS from the body — dates, dollar
amounts, product names, vendor names, phone numbers, addresses. These
are things that are literally in the message, not inferred. They land
as read-only facts on the message, NEVER modify project state on
their own.

**Input schema.** `NormalizedMessage.body` + `ProjectAssignment.projectId`.

**Output schema.**
```
FactSet {
  rawId: string,
  facts: Array<{
    type: 'date' | 'money' | 'phone' | 'address' | 'product'
        | 'vendor_name' | 'quantity' | 'measurement',
    value: string,                  // canonical string form
    span: { start, end },           // char offsets in the body
    confidence: number,             // 0..1
    normalizedValue?: string | number, // e.g. ISO date, cents, E.164
  }>,
}
```

**Algorithm.**
- Deterministic regexes catch phone / dollar / date / measurement
  patterns. Confidence 0.9+.
- Tier 2 Haiku extracts product/vendor/address mentions from the body
  with a bounded JSON schema. Confidence output honored 0.5–0.9.
- Never speculates. If Haiku "thinks" a spend was mentioned but the
  body doesn't contain a $ amount, the extractor emits nothing rather
  than a guess.

**Failure mode.** Extraction is best-effort. Missing a fact is fine;
inventing one is not. If Haiku hallucinates a $ amount without a
span match in the body, drop the fact.

**Tier assignment.** Tier 1 for regex, Tier 2 for structured JSON
extraction.

**Confidence output.** Per-fact 0..1. Regex facts default 0.9+;
LLM facts capped at 0.9 unless span-verified.

---

### Stage 6 — Task Detection

**Purpose.** Identify actionable items — things someone owes someone
by some date. Explicitly different from Stage 5 facts and Stage 7
approvals.

**Input schema.** `NormalizedMessage.body` + `IdentityResolution` +
`ProjectAssignment`.

**Output schema.**
```
TaskCandidates {
  rawId: string,
  tasks: Array<{
    title: string,                  // imperative — "Call plumber about drain"
    ownerRef?: {                    // who owes it
      contactId?: string,           // deterministic when resolved
      display?: string,             // fallback when the body names someone
                                     // we don't have as a contact yet
    },
    dueDate?: string,               // ISO date; extracted from body
    sourceSpan: { start, end },     // exact quote that triggered it
    confidence: number,             // 0..1
    category: 'task' | 'promise' | 'intention',
    // ↑ task = explicit "you need to do X"
    //   promise = sender committed to doing X ("I'll get you the quote Fri")
    //   intention = fuzzy — "we should probably also do Y"
  }>,
}
```

**Algorithm.**
Tier 2 Haiku with a strict JSON schema. Prompt requires each task to
carry a `sourceSpan` that quotes the body text — if the span doesn't
verify, drop the task. Owner is resolved deterministically against
Stage 3 identity when the sender names themselves, or fuzzy-matched
against project people when a role/name is mentioned.

**Failure mode.** No tasks emitted is FINE. Tasks with a confidence
below the auto-file threshold land in the review queue. Tasks above
the threshold land as `actionItems/{id}` docs but ONLY when the
category is 'task' or 'promise' — 'intention' rows always land in
review no matter how confident.

**Tier assignment.** Tier 2 (Haiku). Tier 3 (Sonnet) escalation ONLY
when the message is >3 paragraphs long or contains conditional logic
("if X then Y") that Haiku struggled to parse cleanly.

**Confidence output.** Per-task 0..1. Auto-file threshold 0.85 for
'task' and 'promise'; 'intention' rows always go to review.

---

### Stage 7 — Approval Detection

**Purpose.** Identify formal approvals / rejections in the message
body. These are the highest-stakes extractions and get their own
stage precisely because collapsing them into "task detection" loses
the semantic weight.

**Input schema.** `NormalizedMessage.body` + `ProjectAssignment` +
`IdentityResolution`.

**Output schema.**
```
ApprovalCandidates {
  rawId: string,
  approvals: Array<{
    kind: 'estimate' | 'change_order' | 'selection' | 'contract' | 'other',
    subjectRef?: {                  // link to the doc being approved
      collection: string,
      id: string,
      confidence: number,           // 0..1 — how sure we are we matched the doc
    },
    action: 'approved' | 'rejected' | 'requested_changes',
    sourceSpan: { start, end },
    confidence: number,             // 0..1 for the approval itself
    notes?: string,                 // any qualification the client added
  }>,
}
```

**Algorithm.**
Tier 3 Sonnet, ALWAYS. Approvals are consequential — cost of a false
positive is a decision-log entry that says the client approved
something they didn't. Sonnet with tool_use returns strict JSON
including a subject-ref match: given the body plus a listing of
recent unsigned estimates/COs/selections on the project, Sonnet
selects the one it thinks is being approved and scores the match.

**Failure mode.** Any approval below confidence 0.85 lands in the
review queue with all context. Never auto-writes a decision or
status change from confidence < 0.9. Even at confidence 1.0, an
approval extracted from an inbound email writes a
`decisions/{id}` record with `visibility='internal'` — a HUMAN
still has to promote it to a real status change on the estimate/CO/
selection.

**Tier assignment.** Tier 3 (Sonnet) always.

**Confidence output.**
- Approval + subject-ref match both 1.0 → auto-log
  `decisions/{id}` with kind matched to the approval kind, still
  visibility='internal' pending human promotion.
- Anything below → review queue.

---

### Stage 8 — Executive Summary

**Purpose.** The daily briefing. NOT run per-message. Runs once/day
per active project + one company-wide summary. Consumes the
accumulated Stages 3–7 output over the last N hours.

**Input schema.**
```
DailyDigestInput {
  projectId: string,               // or 'company' for the top-level
  windowStart: Timestamp,
  windowEnd: Timestamp,
  factSets: FactSet[],
  taskCandidates: TaskCandidates[],
  approvalCandidates: ApprovalCandidates[],
  decisions: ClientDecision[],     // FROM the decision log wired in Priority A
  identityResolutions: IdentityResolution[],
  projectAssignments: ProjectAssignment[],
}
```

**Output schema.**
```
DailyBriefing {
  projectId: string,
  window: { start, end },
  headline: string,                // 1 sentence, Tyler-voice
  approvalsPending: Array<{ ...ApprovalCandidate }>,
  tasksNeedingOwner: Array<{ ...TaskCandidate }>,
  factsWorthNoting: Array<{ ...Fact }>,
  ambiguousIdentity: Array<{ ...IdentityResolution }>,
  unassigned: Array<{ ...NormalizedMessage }>,
  writtenAt: Timestamp,
  costUsd: number,
}
```

**Tier assignment.** Tier 3 (Sonnet) for the assembly. Never Opus
unless the staff explicitly asks "give me the deep read of the last
7 days" — that's a Tier 4 on-demand path.

**Failure mode.** Best-effort. A failed daily briefing doesn't affect
any Stage 1–7 output; those already landed.

---

## 2. Confidence propagation

**Rule: confidence never gets flattened.** Every derived artifact
carries the min-confidence of its inputs. A task extracted at
confidence 0.9 whose owner was identity-resolved at 0.5 has final
confidence 0.5 — the weakest link governs.

Downstream surfaces (UI, decision-log, dashboards) read the
per-artifact confidence and display it. Nothing surface-facing
converts confidence to a binary "yes/no" — the UI shows a chip like
"0.55 — needs review" or "0.98 — auto-filed" so the operator always
knows what got auto vs what needs eyes.

---

## 3. Fact / task / opinion / intention / approval — the five shapes

| Shape | Definition | Downstream write |
|---|---|---|
| **Fact** | Literal string extracted from body | `inbound_raw/{id}.facts[]` (read-only) |
| **Task** | Explicit "you need to do X" | `actionItems/{id}` when ≥ 0.85 |
| **Promise** | Sender committed to doing X | `actionItems/{id}` when ≥ 0.85, category='promise' |
| **Intention** | Fuzzy "we should probably" | Review queue only, never auto-writes |
| **Opinion** | Value judgment ("I like it") | `inbound_raw/{id}.facts[]` with type='opinion' |
| **Approval** | Formal sign-off | `decisions/{id}` visibility='internal' when ≥ 0.9 |

Approvals are the only shape that produces a durable business-state
side-effect (via the decision log), and even they require a human to
promote from internal → client-visible + a real status change on the
source doc.

---

## 4. Failure-mode contract

Every stage's failure mode falls into one of three categories:

- **Silent no-op** — stage output is empty, downstream stages proceed
  with whatever they have. Examples: Stage 5 finds no facts; Stage
  6 finds no tasks.
- **Downgrade** — stage output has degraded confidence and lands in
  the review queue. Examples: Stage 3 identity multi-hit; Stage 7
  approval below 0.9.
- **Halt + queue** — stage cannot proceed. Message stays at prior
  `processed_status` and gets re-tried later. Examples: Stage 1
  storage write fails; Stage 2 malformed payload with no recovery.

A ZERO-COST FAILURE MODE (silent no-op) is preferred at every stage.
Ambitious extraction is not the goal — accurate extraction is.

---

## 5. Cost projection revisited

The Step 1 doc quoted ~$0.22/day @ 100 msg/day. That estimate treated
Tier 3 as ~4% of traffic. With Stage 7's "approvals ALWAYS Sonnet"
rule, Tier 3 climbs a bit — but only for messages that PASS Stages
3–4 with high identity + project confidence AND contain a body
pattern the Stage 7 pre-filter thinks is approval-adjacent.

Revised estimate:
- Tier 1 (code): 60% → $0
- Tier 2 (Haiku): 30% → $0.029/day
- Tier 3 (Sonnet for approvals + escalations): 8% → $0.096/day
- Tier 4 (Opus on-demand): 2% → $0.27/day
- Total: **~$0.40/day → $12/month** @ 100 msg/day

Still trivial. Closing Gap #1 (E.164 phone normalization) and Gap #2
(email lowercase) remains the load-bearing cost lever.

---

## 6. What Step 2 does NOT include (deliberate deferrals)

- **Channel adapter code.** Each channel (email/SMS/voice/Telegram/
  portal/webform) needs its own adapter that lands the payload in
  Stage 1. Those are individual commits after this spec approves.
- **Auth for portal + webform channels.** Signed webhook secrets
  per channel; deferred until adapters exist.
- **BigQuery mirror for search.** The decision-log Priority A gets us
  a searchable UI-side surface for now. BigQuery is a v3 upgrade.
- **Opus-tier daily briefings.** Sonnet is enough for the daily; Opus
  only on explicit staff ask.
- **Feedback loop.** Human reviewer decisions on the review queue
  should feed back into per-project pattern learning — deferred to
  Step 3.

---

## 7. Approval gate for Step 3 → 4 build

Before ANY channel adapter code lands, Tyler approves this spec.
Approval means:

- Naming of the stages ✓
- Shape of each output schema ✓
- Confidence contract (never flatten, always propagate min) ✓
- Fact/task/promise/intention/opinion/approval taxonomy ✓
- Failure-mode taxonomy (no-op / downgrade / halt+queue) ✓
- Cost model at $0.40/day baseline ✓

After Tyler's green light, the next Step is 1.5 close-outs from Step 1
(phone normalization backfill, email lowercase backfill, project↔
contact link enforcement helper, `inbound_raw` collection creation,
storage rules tighten-up), then Stage 1 channel adapter #1 (email via
Gmail OAuth, since Ingestion Lab already has the plumbing).
