// Adapter: the live work-schedule Gantt (WbsTask tree) → the client-safe
// GeneratedSchedule the portal renders. This is what makes the GC's real
// schedule the source of truth for the client (one snapshot on publish).
//
// Mapping:
//   - A top-level task WITH children is treated as a phase; its leaf
//     descendants become the trades under it.
//   - Flat top-level leaf tasks are grouped under a single "Build Schedule"
//     phase so nothing is lost.
// No cost/profit is ever carried across — the client view is revenue/â€‘free.

import type { WbsTask } from '@/modules/gantt/types';
import type { GeneratedSchedule, ScheduledPhase, ScheduledTrade } from './types';

const DAY = 86400000;

function toMs(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function durationDays(start?: string, end?: string): number {
  const s = toMs(start), e = toMs(end);
  if (s == null || e == null) return 1;
  return Math.max(1, Math.round((e - s) / DAY) + 1);
}

// Leaf descendants of a task (the actual trade rows).
function leaves(task: WbsTask): WbsTask[] {
  if (!task.children || task.children.length === 0) return [task];
  return task.children.flatMap(leaves);
}

// A task is a client-facing decision/selection step if its name hints at one.
function isDecision(name: string): boolean {
  return /\b(selection|decision|choose|pick|approve|finalize)\b/i.test(name || '');
}

function tradeFrom(task: WbsTask, phaseName: string): ScheduledTrade {
  return {
    trade: task.name || 'Work',
    phase: phaseName,
    amount: 0,
    lineCount: 1,
    startDate: (task.startDate || '').slice(0, 10),
    endDate: (task.endDate || '').slice(0, 10),
    durationDays: task.durationDays ?? durationDays(task.startDate, task.endDate),
    decision: isDecision(task.name),
  };
}

function spanOf(trades: ScheduledTrade[]): { start: string; end: string } {
  const starts = trades.map(t => toMs(t.startDate)).filter((n): n is number => n != null);
  const ends = trades.map(t => toMs(t.endDate)).filter((n): n is number => n != null);
  const start = starts.length ? new Date(Math.min(...starts)).toISOString().slice(0, 10) : '';
  const end = ends.length ? new Date(Math.max(...ends)).toISOString().slice(0, 10) : '';
  return { start, end };
}

export function wbsToClientSchedule(tasks: WbsTask[]): GeneratedSchedule | null {
  if (!tasks || tasks.length === 0) return null;

  const phases: ScheduledPhase[] = [];
  const flatLeaves: WbsTask[] = [];

  for (const t of tasks) {
    if (t.children && t.children.length > 0) {
      const trades = leaves(t).map(leaf => tradeFrom(leaf, t.name || 'Phase'));
      const { start, end } = spanOf(trades);
      phases.push({
        phase: t.name || 'Phase',
        startDate: start,
        endDate: end,
        durationDays: durationDays(start, end),
        trades,
      });
    } else {
      flatLeaves.push(t);
    }
  }

  if (flatLeaves.length > 0) {
    const trades = flatLeaves.map(leaf => tradeFrom(leaf, 'Build Schedule'));
    const { start, end } = spanOf(trades);
    phases.push({
      phase: 'Build Schedule',
      startDate: start,
      endDate: end,
      durationDays: durationDays(start, end),
      trades,
    });
  }

  if (phases.length === 0) return null;

  const { start, end } = spanOf(phases.flatMap(p => p.trades));
  const tradeCount = new Set(phases.flatMap(p => p.trades.map(t => t.trade))).size;

  return {
    startDate: start,
    endDate: end,
    totalDays: durationDays(start, end),
    phases,
    tradeCount,
  };
}

// Stable short signature of a client schedule (phase/trade names + dates) so the
// GC can be told when the live Gantt has drifted from what the client last saw.
export function scheduleSignature(schedule: GeneratedSchedule | null | undefined): string {
  if (!schedule) return '';
  const parts: string[] = [];
  for (const p of schedule.phases || []) {
    for (const t of p.trades || []) {
      parts.push(`${p.phase}|${t.trade}|${t.startDate}|${t.endDate}`);
    }
  }
  const raw = parts.sort().join('~');
  // djb2 hash → short hex, enough for equality checks.
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
