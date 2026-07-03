/**
 * Canonical Decision Log writer.
 *
 * Every material decision on a project — selection approved, CO approved,
 * estimate accepted, sub awarded, scope change confirmed — fires
 * logDecision() alongside its normal write. The result is a searchable
 * audit trail that lives independently of the source docs so a deleted
 * or edited estimate still leaves a fingerprint.
 *
 * Design principles (per the ChatGPT review):
 *   1. The decision doc is the RECORD OF WHAT WAS AGREED. It is not a
 *      notification, not a task, not a comment. Those exist elsewhere.
 *   2. Every decision carries a subjectRef back to the source doc so a
 *      reader can jump straight to the underlying artifact.
 *   3. visibility controls homeowner reach — 'client-visible' shows in
 *      the client portal read view; 'internal' stays staff-side.
 *   4. Never throws to the caller. A decision-log failure MUST NOT block
 *      the primary action. We swallow + warn.
 */

import { auth } from '@/lib/firebase';
import {
  createDecision,
  type ClientDecision,
  type DecisionKind,
  type DecisionVisibility,
} from '@/lib/communications/decisions';

interface LogDecisionInput {
  projectId: string;
  kind: DecisionKind;
  title: string;
  summary?: string;
  subjectRef?: ClientDecision['subjectRef'];
  context?: Record<string, any>;
  attachments?: ClientDecision['attachments'];
  visibility?: DecisionVisibility;   // default 'internal'
  clientId?: string;                 // when the decision is about a specific client
}

export async function logDecision(input: LogDecisionInput): Promise<string | null> {
  try {
    const uid = auth.currentUser?.uid || 'unknown';
    const displayName =
      auth.currentUser?.displayName || auth.currentUser?.email || undefined;
    const id = await createDecision({
      title: input.title,
      summary: input.summary,
      projectId: input.projectId,
      clientId: input.clientId,
      kind: input.kind,
      visibility: input.visibility ?? 'internal',
      subjectRef: input.subjectRef,
      context: input.context,
      attachments: input.attachments,
      createdBy: uid,
      createdByName: displayName,
      decidedOn: new Date().toISOString().slice(0, 10),
    });
    return id;
  } catch (err) {
    // NEVER fail the primary action because the log write hiccupped.
    // Surface for observability but let the flow continue.
    console.warn('[logDecision] failed — primary action already succeeded', err);
    return null;
  }
}
