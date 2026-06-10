// Convert a saved schedule template (flat WbsTask list from `scheduleTemplates`)
// into the GeneratedSchedule the client view + commencement seeding consume.
//
// Templates are a flat list of tasks with dependency links. Our starter templates
// mark phase rows with `isPhase` (name like "■ FRAMING"); steps follow until the
// next phase row. Templates without phase rows fall back to a single phase.
// All dates are re-anchored from the template's earliest date to the project's
// target start.

import type { GeneratedSchedule, ScheduledPhase, ScheduledTrade } from './types';

export interface TemplateTask {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  isPhase?: boolean;
  decision?: boolean;
  status?: string;
}

function parseISO(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1));
}
function toISO(d: Date): string { return d.toISOString().slice(0, 10); }
function shift(iso: string, days: number): string {
  const d = parseISO(iso); d.setUTCDate(d.getUTCDate() + days); return toISO(d);
}
function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}
function stripPhaseName(name: string): string {
  return name.replace(/^[■▪●\s]+/, '').trim();
}

/**
 * Build a GeneratedSchedule from a template's tasks, anchored at `targetStart`.
 */
export function templateToSchedule(
  tasks: TemplateTask[],
  targetStart: string,
): GeneratedSchedule {
  const dated = tasks.filter(t => t.startDate && t.endDate);
  if (dated.length === 0) {
    return { startDate: targetStart, endDate: targetStart, totalDays: 0, phases: [], tradeCount: 0 };
  }
  // Re-anchor: how far to slide every date so the earliest lands on targetStart.
  const minStart = dated.reduce((m, t) => (t.startDate! < m ? t.startDate! : m), dated[0].startDate!);
  const delta = daysBetween(minStart, targetStart);

  const phases: ScheduledPhase[] = [];
  let current: ScheduledPhase | null = null;
  let tradeCount = 0;

  const ensureDefaultPhase = () => {
    if (!current) {
      current = { phase: 'Schedule', startDate: targetStart, endDate: targetStart, durationDays: 0, trades: [] };
      phases.push(current);
    }
    return current;
  };

  for (const t of tasks) {
    const start = t.startDate ? shift(t.startDate, delta) : targetStart;
    const end = t.endDate ? shift(t.endDate, delta) : start;
    const isPhaseRow = t.isPhase || /^[■▪●]/.test(t.name);

    if (isPhaseRow) {
      current = { phase: stripPhaseName(t.name) || 'Phase', startDate: start, endDate: end, durationDays: (t.durationDays ?? daysBetween(start, end) + 1), trades: [] };
      phases.push(current);
      continue;
    }
    const phase = ensureDefaultPhase();
    const trade: ScheduledTrade = {
      trade: t.name,
      phase: phase.phase,
      amount: 0,
      lineCount: 1,
      startDate: start,
      endDate: end,
      durationDays: t.durationDays ?? (daysBetween(start, end) + 1),
      ...(t.decision || t.status === 'pending_approval' ? { decision: true } : {}),
    };
    phase.trades.push(trade);
    tradeCount++;
  }

  // Tighten each phase's span to its children (when it has any).
  for (const p of phases) {
    if (p.trades.length) {
      p.startDate = p.trades.reduce((m, t) => (t.startDate < m ? t.startDate : m), p.trades[0].startDate);
      p.endDate = p.trades.reduce((m, t) => (t.endDate > m ? t.endDate : m), p.trades[0].endDate);
      p.durationDays = daysBetween(p.startDate, p.endDate) + 1;
    }
  }

  const allStart = phases.reduce((m, p) => (p.startDate < m ? p.startDate : m), phases[0].startDate);
  const allEnd = phases.reduce((m, p) => (p.endDate > m ? p.endDate : m), phases[0].endDate);

  return {
    startDate: allStart,
    endDate: allEnd,
    totalDays: daysBetween(allStart, allEnd),
    phases,
    tradeCount,
  };
}
