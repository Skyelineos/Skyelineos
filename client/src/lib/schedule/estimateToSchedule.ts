// Estimate → schedule generator (pure). Groups an estimate's line items by trade,
// maps each trade to a build phase, lays the phases out sequentially from a target
// start date, and returns a phase-grouped timeline.
//
// Model: phases run in sequence; trades within a phase run in parallel (all span
// the phase window). A phase appears if it has at least one trade OR it's an
// always-include phase (Pre-Construction / Closeout). Durations come from the
// tunable PHASE_DEFAULT_DAYS, overridable per-call.

import type {
  EstimateForSchedule, GeneratedSchedule, ScheduledPhase, ScheduledTrade, BuildPhase,
} from './types';
import {
  PHASE_ORDER, ALWAYS_INCLUDE, PHASE_DEFAULT_DAYS, PHASE_PLACEHOLDER_TASK, phaseForTrade,
} from './tradePhaseMap';

// ── date helpers (calendar days, ISO YYYY-MM-DD, timezone-safe) ───────────────
function parseISO(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1));
}
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}
function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

export interface ScheduleOptions {
  targetStart: string;                              // ISO YYYY-MM-DD anchor
  phaseDays?: Partial<Record<BuildPhase, number>>;  // per-phase duration overrides
}

interface TradeAgg { trade: string; amount: number; lineCount: number; }

/**
 * Generate a phase-grouped schedule from an estimate's line items.
 */
export function estimateToSchedule(
  est: EstimateForSchedule,
  opts: ScheduleOptions,
): GeneratedSchedule {
  const targetStart = opts.targetStart;
  const phaseDur = (p: BuildPhase) =>
    opts.phaseDays?.[p] ?? PHASE_DEFAULT_DAYS[p];

  // 1. Roll included lines up by trade. 'ex' (excluded) and 'note' carry no work.
  const byTrade = new Map<string, TradeAgg>();
  for (const l of est.lineItems ?? []) {
    const status = l.lineStatus ?? 'inc';
    if (status === 'ex' || status === 'note') continue;
    const trade = (l.trade && l.trade.trim()) || 'General';
    const agg = byTrade.get(trade) ?? { trade, amount: 0, lineCount: 0 };
    agg.amount += l.total ?? 0;
    agg.lineCount += 1;
    byTrade.set(trade, agg);
  }

  // 2. Assign each trade to a phase.
  const tradesByPhase = new Map<BuildPhase, TradeAgg[]>();
  for (const agg of Array.from(byTrade.values())) {
    const phase = phaseForTrade(agg.trade);
    const arr = tradesByPhase.get(phase) ?? [];
    arr.push(agg);
    tradesByPhase.set(phase, arr);
  }

  // 3. Which phases appear: any phase with trades, plus the always-include ones.
  const present = new Set<BuildPhase>(ALWAYS_INCLUDE);
  for (const p of Array.from(tradesByPhase.keys())) present.add(p);
  const orderedPhases = PHASE_ORDER.filter(p => present.has(p));

  // 4. Lay phases out sequentially from the target start.
  const phases: ScheduledPhase[] = [];
  let cursor = targetStart;
  let tradeCount = 0;

  for (const phase of orderedPhases) {
    const dur = Math.max(1, phaseDur(phase));
    const phaseStart = cursor;
    const phaseEnd = addDays(phaseStart, dur);

    const aggs = (tradesByPhase.get(phase) ?? [])
      .sort((a, b) => b.amount - a.amount); // biggest scope first

    let trades: ScheduledTrade[];
    if (aggs.length > 0) {
      trades = aggs.map(a => ({
        trade: a.trade,
        phase,
        amount: a.amount,
        lineCount: a.lineCount,
        startDate: phaseStart,
        endDate: phaseEnd,
        durationDays: dur,
      }));
      tradeCount += aggs.length;
    } else {
      // Always-include phase with no matching line items — show a placeholder.
      trades = [{
        trade: PHASE_PLACEHOLDER_TASK[phase],
        phase,
        amount: 0,
        lineCount: 0,
        startDate: phaseStart,
        endDate: phaseEnd,
        durationDays: dur,
      }];
    }

    phases.push({ phase, startDate: phaseStart, endDate: phaseEnd, durationDays: dur, trades });
    cursor = phaseEnd; // next phase begins when this one ends
  }

  const endDate = phases.length ? phases[phases.length - 1].endDate : targetStart;

  return {
    startDate: targetStart,
    endDate,
    totalDays: daysBetween(targetStart, endDate),
    phases,
    tradeCount,
  };
}
