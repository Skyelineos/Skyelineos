// Designer Portal — AI placeholder actions.
//
// The repo's only live AI integration today is server-side bill OCR
// (functions/src/bills/) and the Ingestion Lab brain pass — neither exposes a
// client-callable "summarize this room" endpoint. So these are deliberate
// placeholders: stable function signatures + UI hooks the real Claude calls can
// drop into later (fold a route into the shared `api` Express app, per CLAUDE.md).

export type AiActionKey =
  | 'summarizeRoom'
  | 'summarizeMoodBoard'
  | 'extractDecisions'
  | 'createSelectionChecklist'
  | 'findUnansweredQuestions'
  | 'flagTimelineRisks'
  | 'findMissingProductLinks'
  | 'identifyBudgetOverages'
  | 'generateClientDesignSummary'
  | 'moveDiscussionToRoom';

export interface AiActionDef {
  key: AiActionKey;
  label: string;
  description: string;
  /** Scope this action is meaningful at. */
  scope: 'room' | 'moodBoard' | 'discussion';
}

export const AI_ACTIONS: AiActionDef[] = [
  {
    key: 'summarizeRoom',
    label: 'Summarize Room',
    description: 'Generate a plain-language status summary of this room.',
    scope: 'room',
  },
  {
    key: 'summarizeMoodBoard',
    label: 'Summarize Mood Board',
    description: 'Summarize the design direction and items on the mood board.',
    scope: 'moodBoard',
  },
  {
    key: 'extractDecisions',
    label: 'Extract Decisions',
    description: 'Pull open design decisions out of the discussion thread.',
    scope: 'discussion',
  },
  {
    key: 'createSelectionChecklist',
    label: 'Create Selection Checklist',
    description: 'Draft the selections this room still needs.',
    scope: 'room',
  },
  {
    key: 'findUnansweredQuestions',
    label: 'Find Unanswered Questions',
    description: 'Surface client/designer questions with no reply.',
    scope: 'discussion',
  },
  {
    key: 'flagTimelineRisks',
    label: 'Flag Timeline Risks',
    description: 'Identify selections/decisions that threaten the schedule.',
    scope: 'room',
  },
  {
    key: 'findMissingProductLinks',
    label: 'Find Missing Product Links',
    description: 'List selections missing a product or spec link.',
    scope: 'room',
  },
  {
    key: 'identifyBudgetOverages',
    label: 'Identify Budget Overages',
    description: 'List selections over their allowance.',
    scope: 'room',
  },
  {
    key: 'generateClientDesignSummary',
    label: 'Generate Client Design Summary',
    description: 'Draft a client-facing recap of the design so far.',
    scope: 'room',
  },
  {
    key: 'moveDiscussionToRoom',
    label: 'Move Discussion To Room',
    description: 'Suggest which general messages belong in this room.',
    scope: 'discussion',
  },
];

export interface AiActionResult {
  ok: boolean;
  placeholder: boolean;
  message: string;
}

export interface AiActionContext {
  projectId: string;
  roomId?: string;
  roomName?: string;
  moodBoardId?: string;
}

export async function runAiAction(
  action: AiActionKey,
  ctx: AiActionContext
): Promise<AiActionResult> {
  const def = AI_ACTIONS.find((a) => a.key === action);

  const res = await fetch(`/api/designer/ai/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: ctx.projectId,
      roomId: ctx.roomId,
      roomName: ctx.roomName,
      moodBoardId: ctx.moodBoardId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    return {
      ok: false,
      placeholder: false,
      message: err.error || `${def?.label ?? action} failed`,
    };
  }

  const data = await res.json();
  return {
    ok: true,
    placeholder: false,
    message: data.result || 'Done.',
  };
}
