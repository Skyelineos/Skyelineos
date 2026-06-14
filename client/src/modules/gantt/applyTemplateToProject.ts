// Apply a saved schedule template to a project's Gantt (schedules/{projectId}),
// re-anchored to the project's start date. Used by the setup wizard's template
// prompt so a new project starts from one of the standard templates.

import { loadTemplate, saveSchedule, loadSchedule } from './useSchedulePersistence';
import type { WbsTask } from './types';

function parseISO(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1));
}
function toISO(d: Date): string { return d.toISOString().slice(0, 10); }
function shiftISO(iso: string, days: number): string {
  const d = parseISO(iso); d.setUTCDate(d.getUTCDate() + days); return toISO(d);
}
function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

function minStart(tasks: WbsTask[]): string | null {
  let m: string | null = null;
  const walk = (ts: WbsTask[]) => {
    for (const t of ts) {
      if (t.startDate && (m === null || t.startDate < m)) m = t.startDate;
      if (t.children?.length) walk(t.children);
    }
  };
  walk(tasks);
  return m;
}

function shiftTasks(tasks: WbsTask[], delta: number): WbsTask[] {
  return tasks.map(t => ({
    ...t,
    startDate: t.startDate ? shiftISO(t.startDate, delta) : t.startDate,
    endDate: t.endDate ? shiftISO(t.endDate, delta) : t.endDate,
    baselineStart: t.baselineStart ? shiftISO(t.baselineStart, delta) : t.baselineStart,
    baselineEnd: t.baselineEnd ? shiftISO(t.baselineEnd, delta) : t.baselineEnd,
    children: t.children?.length ? shiftTasks(t.children, delta) : t.children,
  }));
}

/**
 * Seed a project's schedule from a template, re-anchored to `startDate` (ISO).
 * With `onlyIfEmpty`, it won't overwrite a schedule that already has tasks
 * (so it never clobbers edits the GC made in the Gantt).
 * Returns true if it applied.
 */
export async function applyTemplateToProject(
  projectId: string,
  templateId: string,
  startDate?: string,
  opts?: { onlyIfEmpty?: boolean },
): Promise<boolean> {
  if (!projectId || !templateId) return false;
  if (opts?.onlyIfEmpty) {
    const cur = await loadSchedule(projectId);
    if (cur && cur.tasks.length > 0) return false;
  }
  const tmpl = await loadTemplate(templateId);
  if (!tmpl || !Array.isArray(tmpl.tasks)) return false;

  let tasks = tmpl.tasks;
  const anchor = startDate || toISO(new Date());
  const from = minStart(tasks);
  if (from) tasks = shiftTasks(tasks, daysBetween(from, anchor));

  await saveSchedule(projectId, tasks, tmpl.links ?? []);
  return true;
}
