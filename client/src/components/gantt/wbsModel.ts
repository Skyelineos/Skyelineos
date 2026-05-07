// src/components/gantt/wbsModel.ts
import { format, parseISO, addDays, min, max } from 'date-fns';
import type { WbsTask } from '@/types/wbs';

export interface FlatRow {
  task: WbsTask;
  wbs: string;
  depth: number;
  index: number;        // visible row index for plotting
}

export function computeWbs(
  roots: WbsTask[],
  parentPrefix: string[] = [],
  out: { [id: string]: string } = {}
) {
  roots.forEach((t, i) => {
    const num = String(i + 1);
    const code = [...parentPrefix, num].join('.');
    out[t.id] = code;
    if (t.children?.length) computeWbs(t.children, [...parentPrefix, num], out);
  });
  return out;
}

export function flattenVisible(
  roots: WbsTask[],
  collapsed: Record<string, boolean>
): FlatRow[] {
  const wbsMap = computeWbs(roots);
  const rows: FlatRow[] = [];
  let idx = 0;

  const walk = (nodes: WbsTask[], depth: number) => {
    nodes.forEach((t) => {
      const isSummary = !!t.children?.length;
      t._isSummary = isSummary;
      rows.push({ task: t, wbs: wbsMap[t.id], depth, index: idx++ });
      if (isSummary && !collapsed[t.id]) walk(t.children!, depth + 1);
    });
  };
  walk(roots, 0);
  return rows;
}

export function getVisibleDateRange(rows: FlatRow[]) {
  if (!rows.length) {
    const today = new Date();
    return {
      minDate: format(addDays(today, -7), 'yyyy-MM-dd'),
      maxDate: format(addDays(today, 30), 'yyyy-MM-dd'),
    };
  }
  const starts = rows.map(r => parseISO(r.task.startDate));
  const ends   = rows.map(r => parseISO(r.task.endDate));
  const minD = starts.reduce((a,b)=>min([a,b]));
  const maxD = ends.reduce((a,b)=>max([a,b]));
  return {
    minDate: format(addDays(minD, -3), 'yyyy-MM-dd'),
    maxDate: format(addDays(maxD,  7), 'yyyy-MM-dd'),
  };
}