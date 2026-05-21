// Lane resolver for the Ingestion Lab's three-lane review model.
//
// Input  → { category, confidence, needsClarification, projectId }
// Output → 'auto_filed' | 'review_queue' | 'ask_queue'
//
// See docs/ingestion-lab-schema.md for rationale. Two invariants are
// enforced at module load:
//   1. REVIEW_REQUIRED_CATEGORIES ∩ INFORMATIONAL_CATEGORIES == ∅
//   2. Unknown category at high confidence → conservative default: review.

export const REVIEW_REQUIRED_CATEGORIES: ReadonlySet<string> = new Set([
  'invoice',
  'change_order',
  'bid',
  'cost_change',
  'material_selection',
  'schedule_change',
  'commitment',
  'design_decision',
  'client_approval_request',
  'decision_made',
  'decision_needed',
]);

export const INFORMATIONAL_CATEGORIES: ReadonlySet<string> = new Set([
  'general_correspondence',
  'status_update',
  'design_inspiration',
  'schedule_question',
  'photo_share',
  'meeting_summary',
]);

// Auto-file threshold is deliberately high during the spike — we want to
// see the brain's work during tuning, not silently file 1-in-7 items.
// Lowered later once accuracy is trusted.
export const AUTO_FILE_CONFIDENCE_THRESHOLD = 0.9;
export const MIN_CONFIDENCE_FOR_AUTO_OR_REVIEW = 0.5;

export type Lane = 'auto_filed' | 'review_queue' | 'ask_queue';

// Module-load invariant — fail loudly if the two sets ever overlap.
(function assertNoCategoryOverlap() {
  const overlap: string[] = [];
  REVIEW_REQUIRED_CATEGORIES.forEach((c) => {
    if (INFORMATIONAL_CATEGORIES.has(c)) overlap.push(c);
  });
  if (overlap.length > 0) {
    throw new Error(
      `laneResolver: REVIEW_REQUIRED_CATEGORIES and INFORMATIONAL_CATEGORIES overlap on [${overlap.join(
        ', ',
      )}]. Fix the sets before deploying.`,
    );
  }
})();

export function resolveLane(input: {
  category: string;
  confidence: number;
  needsClarification: boolean;
  projectId: string | null;
}): Lane {
  // Ask queue first — these are the strongest forcing conditions.
  if (input.needsClarification) return 'ask_queue';
  if (input.confidence < MIN_CONFIDENCE_FOR_AUTO_OR_REVIEW) return 'ask_queue';
  if (input.projectId == null) return 'ask_queue';

  // Review-required categories always route to review, regardless of
  // confidence. Decisions are too consequential to auto-file in the spike.
  if (REVIEW_REQUIRED_CATEGORIES.has(input.category)) return 'review_queue';

  // Mid-confidence → review.
  if (input.confidence < AUTO_FILE_CONFIDENCE_THRESHOLD) return 'review_queue';

  // High confidence + informational → auto-file.
  if (INFORMATIONAL_CATEGORIES.has(input.category)) return 'auto_filed';

  // Unknown category at high confidence — conservative default. A
  // misclassified item is better seen by a human than auto-filed.
  return 'review_queue';
}

// Helper for the prompt module: the full set of categories the brain
// is allowed to produce.
export function allCategories(): string[] {
  return [...REVIEW_REQUIRED_CATEGORIES, ...INFORMATIONAL_CATEGORIES, 'other'];
}
