/**
 * Shared definition of "selection completed" across the client portal,
 * the GC project overview, and any other surface that needs to display
 * how far along the homeowner is on selections.
 *
 * Single source of truth — change the rule HERE and every consumer
 * updates in lockstep.
 */

import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface SelectionLike {
  gcApproved?: boolean;
  clientPreference?: { optionId?: string };
  selectedOptionId?: string;
  lifecycle?: string;
}

/** Lifecycle states that count as "locked in / done" from the
 *  homeowner's POV. */
const FINAL_LIFECYCLE_STATES = new Set([
  'GC-Approved',
  'Ordered',
  'Received',
  'Installed',
]);

/**
 * A selection is "completed by client" if any of these are true:
 *   - GC has signed off (gcApproved)
 *   - The homeowner has expressed a preference (clientPreference.optionId)
 *   - A final option has been recorded (selectedOptionId)
 *   - The selection is in a locked-in lifecycle state
 *
 * Selections without options yet still count toward the TOTAL — they're
 * decisions the homeowner will own eventually, so they belong in the
 * denominator.
 */
export function isSelectionCompletedByClient(s: SelectionLike): boolean {
  if (s.gcApproved) return true;
  if (s.clientPreference?.optionId) return true;
  if (s.selectedOptionId) return true;
  return !!s.lifecycle && FINAL_LIFECYCLE_STATES.has(s.lifecycle);
}

export interface SelectionsProgress {
  completed: number;
  total: number;
  /** Integer 0-100. */
  percent: number;
  /** Color hint for progress bars — keeps the visual language consistent
   *  across the client-side and GC-side surfaces. Brand palette only. */
  toneHex: string;
}

/** Tone scale matches the client-portal progress bar so the GC sees the
 *  same color the homeowner does at any given completion %. */
export function progressToneHex(percent: number): string {
  if (percent >= 100) return '#22c55e';      // green — done
  if (percent >= 66)  return '#C9A96E';      // brand gold — strong progress
  if (percent >= 33)  return '#D9C291';      // soft gold — mid
  return '#E8DCC2';                          // pale gold — early
}

/** Compute progress over an already-loaded array of selections. Pure. */
export function computeSelectionsProgress(selections: SelectionLike[]): SelectionsProgress {
  const total = selections.length;
  const completed = selections.filter(isSelectionCompletedByClient).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percent, toneHex: progressToneHex(percent) };
}

/**
 * Fetch the project's selections subcollection and compute progress.
 * One-shot read — for live updates a caller should subscribe via
 * onSnapshot themselves and feed results through `computeSelectionsProgress`.
 */
export async function fetchSelectionsProgress(projectId: string): Promise<SelectionsProgress> {
  const snap = await getDocs(collection(db, 'projects', projectId, 'selections'));
  const sels = snap.docs.map(d => d.data() as SelectionLike);
  return computeSelectionsProgress(sels);
}
