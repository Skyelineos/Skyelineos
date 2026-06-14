// Money helpers for schedules: allocate estimate dollars across phases and roll
// them up into a revenue/profit forecast. `revenue` (the draw due per phase) is
// client-safe; `cost`/`profit` are GC-only.

import type { GeneratedSchedule } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Allocate `total` across `weights` proportionally (falls back to even split). */
export function allocate(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const each = total / Math.max(1, weights.length);
    return weights.map(() => each);
  }
  return weights.map(w => (w / sum) * total);
}

/**
 * Given phases that already have `revenue` (and optionally `cost`) set, compute
 * each phase's profit and the schedule-level roll-ups.
 */
export function rollupFinancials(s: GeneratedSchedule): void {
  let rev = 0, cost = 0, haveRev = false, haveCost = false;
  for (const p of s.phases) {
    if (typeof p.revenue === 'number') { rev += p.revenue; haveRev = true; }
    if (typeof p.cost === 'number') { cost += p.cost; haveCost = true; }
    if (typeof p.revenue === 'number' && typeof p.cost === 'number') p.profit = round2(p.revenue - p.cost);
  }
  if (haveRev) s.revenue = round2(rev);
  if (haveCost) {
    s.cost = round2(cost);
    s.profit = round2(rev - cost);
    s.marginPct = rev > 0 ? round2(((rev - cost) / rev) * 100) : 0;
  }
}

/** Strip GC-only money (cost/profit/margin) so a schedule is safe to expose to a client. */
export function clientSafeSchedule(s: GeneratedSchedule): GeneratedSchedule {
  return {
    ...s,
    cost: undefined,
    profit: undefined,
    marginPct: undefined,
    phases: s.phases.map(p => ({ ...p, cost: undefined, profit: undefined })),
  };
}
