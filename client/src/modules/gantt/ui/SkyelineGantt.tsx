// SkyelineGantt — clean, lightweight construction Gantt renderer.
// No external Gantt engine: indented task tree + scaled timeline, drag-to-move
// and drag-to-resize, summary bars, milestone diamonds, dependency connectors
// and a Today line. Designed to feel simple and intuitive (the "no 200 buttons"
// brief). Reads/writes the shared useGantt store directly.
import React, { useMemo, useRef, useState, useLayoutEffect } from 'react';
import {
  parseISO,
  format,
  differenceInCalendarDays,
  addDays,
  startOfMonth,
  startOfWeek,
  startOfYear,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachDayOfInterval,
  eachYearOfInterval,
} from 'date-fns';
import {
  ChevronRight, ChevronDown, Plus, Trash2, Pencil,
  IndentIncrease, IndentDecrease, CornerDownRight,
} from 'lucide-react';
import { useGantt } from '../state';
import type { WbsTask, Zoom } from '../types';

// ---- layout constants ------------------------------------------------------
const ROW_H = 38;
const HEADER_H = 56;
const BAR_H = 18;
const LEFT_W = 300;
const PAD_DAYS = 7; // padding on each side of the date range

const PX_PER_DAY: Record<Zoom, number> = { Day: 34, Week: 12, Month: 4.6 };

// brand + status palette
const BRAND_BLACK = '#141414';
const BRAND_GOLD = '#C9A96E';
const STATUS = {
  on_track: { bar: '#16a34a', fill: '#15803d' },
  delayed: { bar: '#dc2626', fill: '#b91c1c' },
  pending_approval: { bar: '#d97706', fill: '#b45309' },
  critical: { bar: '#ef4444', fill: '#dc2626' },
  default: { bar: '#3f9c5a', fill: '#2f7d46' },
} as const;

// ---- flattened row model ---------------------------------------------------
interface Row {
  task: WbsTask;
  depth: number;
  isParent: boolean;
  isMilestone: boolean;
  start: Date;
  end: Date;
  visible: boolean;
}

function isLeaf(t: WbsTask) {
  return !t.children || t.children.length === 0;
}

// Resolve a task's effective span. Parents span their descendants.
function spanOf(t: WbsTask): { start: Date; end: Date } {
  if (isLeaf(t)) {
    return { start: parseISO(t.startDate), end: parseISO(t.endDate) };
  }
  let min = parseISO(t.startDate);
  let max = parseISO(t.endDate);
  const walk = (node: WbsTask) => {
    const s = parseISO(node.startDate);
    const e = parseISO(node.endDate);
    if (s < min) min = s;
    if (e > max) max = e;
    node.children?.forEach(walk);
  };
  t.children?.forEach(walk);
  return { start: min, end: max };
}

function flatten(tasks: WbsTask[], collapsed: Set<string>): Row[] {
  const rows: Row[] = [];
  const walk = (nodes: WbsTask[], depth: number, parentVisible: boolean) => {
    nodes.forEach((task) => {
      const parent = !isLeaf(task);
      const { start, end } = spanOf(task);
      const milestone =
        isLeaf(task) &&
        (task.durationDays === 0 || differenceInCalendarDays(end, start) === 0 &&
          task.name.length < 40 && /milestone|complete|approval|award|permit|inspection/i.test(task.name));
      rows.push({ task, depth, isParent: parent, isMilestone: !!milestone, start, end, visible: parentVisible });
      if (task.children && task.children.length) {
        walk(task.children, depth + 1, parentVisible && !collapsed.has(task.id));
      }
    });
  };
  walk(tasks, 0, true);
  return rows.filter((r) => r.visible);
}

// ---- timeline scale --------------------------------------------------------
interface Seg {
  label: string;
  left: number;
  width: number;
}

function buildScale(rangeStart: Date, rangeEnd: Date, zoom: Zoom, pxPerDay: number) {
  const x = (d: Date) => differenceInCalendarDays(d, rangeStart) * pxPerDay;
  const top: Seg[] = [];
  const bottom: Seg[] = [];

  if (zoom === 'Month') {
    eachYearOfInterval({ start: rangeStart, end: rangeEnd }).forEach((y) => {
      const s = y < rangeStart ? rangeStart : startOfYear(y);
      const next = startOfYear(addDays(y, 366));
      const e = next > rangeEnd ? rangeEnd : next;
      top.push({ label: format(y, 'yyyy'), left: x(s), width: x(e) - x(s) });
    });
    eachMonthOfInterval({ start: rangeStart, end: rangeEnd }).forEach((m) => {
      const s = m < rangeStart ? rangeStart : startOfMonth(m);
      const next = startOfMonth(addDays(m, 32));
      const e = next > rangeEnd ? rangeEnd : next;
      bottom.push({ label: format(m, 'MMM'), left: x(s), width: x(e) - x(s) });
    });
  } else if (zoom === 'Week') {
    eachMonthOfInterval({ start: rangeStart, end: rangeEnd }).forEach((m) => {
      const s = m < rangeStart ? rangeStart : startOfMonth(m);
      const next = startOfMonth(addDays(m, 32));
      const e = next > rangeEnd ? rangeEnd : next;
      top.push({ label: format(m, 'MMM yyyy'), left: x(s), width: x(e) - x(s) });
    });
    eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 }).forEach((w) => {
      const s = w < rangeStart ? rangeStart : startOfWeek(w, { weekStartsOn: 1 });
      const e = addDays(s, 7);
      bottom.push({ label: format(s, 'd'), left: x(s), width: Math.max(0, x(e) - x(s)) });
    });
  } else {
    eachMonthOfInterval({ start: rangeStart, end: rangeEnd }).forEach((m) => {
      const s = m < rangeStart ? rangeStart : startOfMonth(m);
      const next = startOfMonth(addDays(m, 32));
      const e = next > rangeEnd ? rangeEnd : next;
      top.push({ label: format(m, 'MMM yyyy'), left: x(s), width: x(e) - x(s) });
    });
    eachDayOfInterval({ start: rangeStart, end: rangeEnd }).forEach((d) => {
      bottom.push({ label: format(d, 'd'), left: x(d), width: pxPerDay });
    });
  }
  return { top, bottom };
}

// ---- WBS tree editing helpers ---------------------------------------------
let _idSeq = 0;
function genId(): string {
  _idSeq += 1;
  return `t_${Date.now().toString(36)}_${_idSeq}`;
}
function cloneTree(t: WbsTask[]): WbsTask[] {
  return t.map((n) => ({ ...n, children: n.children ? cloneTree(n.children) : undefined }));
}
interface Ctx {
  siblings: WbsTask[];
  index: number;
  parent: WbsTask | null;
}
function findCtx(tasks: WbsTask[], id: string, parent: WbsTask | null = null): Ctx | null {
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) return { siblings: tasks, index: i, parent };
    const ch = tasks[i].children;
    if (ch) {
      const r = findCtx(ch, id, tasks[i]);
      if (r) return r;
    }
  }
  return null;
}
function newLeaf(startISO: string, duration = 1): WbsTask {
  const start = parseISO(startISO);
  const end = addDays(start, Math.max(0, duration - 1));
  return {
    id: genId(),
    name: '',
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
    durationDays: duration,
    progress: 0,
  };
}
function latestEnd(tasks: WbsTask[]): string | null {
  let latest: string | null = null;
  const walk = (ns: WbsTask[]) =>
    ns.forEach((n) => {
      if (!latest || n.endDate > latest) latest = n.endDate;
      n.children && walk(n.children);
    });
  walk(tasks);
  return latest;
}
function renameTask(tasks: WbsTask[], id: string, name: string): WbsTask[] {
  const t = cloneTree(tasks);
  const c = findCtx(t, id);
  if (c) c.siblings[c.index].name = name;
  return t;
}
function setTaskDuration(tasks: WbsTask[], id: string, duration: number): WbsTask[] {
  const t = cloneTree(tasks);
  const c = findCtx(t, id);
  if (c) {
    const n = c.siblings[c.index];
    n.durationDays = Math.max(1, duration);
    n.endDate = format(addDays(parseISO(n.startDate), n.durationDays - 1), 'yyyy-MM-dd');
  }
  return t;
}
function addSiblingAfter(tasks: WbsTask[], id: string): { tasks: WbsTask[]; id: string } {
  const t = cloneTree(tasks);
  const c = findCtx(t, id);
  const ref = c ? c.siblings[c.index] : null;
  const leaf = newLeaf(ref ? ref.endDate : format(new Date(), 'yyyy-MM-dd'), ref?.durationDays ?? 1);
  if (c) c.siblings.splice(c.index + 1, 0, leaf);
  else t.push(leaf);
  return { tasks: t, id: leaf.id };
}
function addChildTask(tasks: WbsTask[], parentId: string): { tasks: WbsTask[]; id: string } {
  const t = cloneTree(tasks);
  const c = findCtx(t, parentId);
  if (!c) return { tasks: t, id: '' };
  const p = c.siblings[c.index];
  const last = p.children && p.children.length ? p.children[p.children.length - 1] : null;
  const leaf = newLeaf(last ? last.endDate : p.startDate, 1);
  p.children = [...(p.children || []), leaf];
  return { tasks: t, id: leaf.id };
}
function addRootTask(tasks: WbsTask[]): { tasks: WbsTask[]; id: string } {
  const leaf = newLeaf(latestEnd(tasks) || format(new Date(), 'yyyy-MM-dd'), 1);
  return { tasks: [...cloneTree(tasks), leaf], id: leaf.id };
}
function removeTask(tasks: WbsTask[], id: string): WbsTask[] {
  const t = cloneTree(tasks);
  const c = findCtx(t, id);
  if (c) c.siblings.splice(c.index, 1);
  return t;
}
function indentTask(tasks: WbsTask[], id: string): WbsTask[] {
  const t = cloneTree(tasks);
  const c = findCtx(t, id);
  if (!c || c.index === 0) return tasks; // needs a previous sibling to nest under
  const prev = c.siblings[c.index - 1];
  const [node] = c.siblings.splice(c.index, 1);
  prev.children = [...(prev.children || []), node];
  return t;
}
function outdentTask(tasks: WbsTask[], id: string): WbsTask[] {
  const t = cloneTree(tasks);
  const c = findCtx(t, id);
  if (!c || !c.parent) return tasks; // already at root
  const parentCtx = findCtx(t, c.parent.id);
  if (!parentCtx) return tasks;
  const [node] = c.siblings.splice(c.index, 1);
  parentCtx.siblings.splice(parentCtx.index + 1, 0, node);
  return t;
}

interface DragState {
  id: string;
  mode: 'move' | 'start' | 'end';
  startX: number;
  origStart: string;
  origEnd: string;
}

interface SkyelineGanttProps {
  onAddTask: () => void;
  onEditTask?: (task: WbsTask) => void;
}

export const SkyelineGantt: React.FC<SkyelineGanttProps> = ({ onAddTask, onEditTask }) => {
  const { tasks, links, zoom, showCritical, showBaseline, showWeekends, metrics, setTasks, setLinks } = useGantt();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragOffsetDays, setDragOffsetDays] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const movedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Begin inline-editing a row's name.
  const beginEdit = (id: string, name: string) => {
    setEditingId(id);
    setDraftName(name);
    setSelectedId(id);
  };
  // Commit the in-progress name edit against the freshest task tree.
  const commitName = (id: string, name: string) => {
    setTasks(renameTask(useGantt.getState().tasks, id, name.trim() || 'Untitled task'));
  };
  const addRoot = () => {
    const { tasks: next, id } = addRootTask(useGantt.getState().tasks);
    setTasks(next);
    beginEdit(id, '');
  };
  const addAfter = (afterId: string) => {
    const { tasks: next, id } = addSiblingAfter(useGantt.getState().tasks, afterId);
    setTasks(next);
    beginEdit(id, '');
  };
  const addChild = (parentId: string) => {
    const { tasks: next, id } = addChildTask(useGantt.getState().tasks, parentId);
    setTasks(next);
    if (id) beginEdit(id, '');
  };
  const removeRow = (id: string) => {
    setTasks(removeTask(useGantt.getState().tasks, id));
    setLinks(links.filter((l) => l.sourceId !== id && l.targetId !== id));
    if (editingId === id) setEditingId(null);
  };
  const indent = (id: string) => setTasks(indentTask(useGantt.getState().tasks, id));
  const outdent = (id: string) => setTasks(outdentTask(useGantt.getState().tasks, id));
  const setDuration = (id: string, d: number) => setTasks(setTaskDuration(useGantt.getState().tasks, id, d));

  const pxPerDay = PX_PER_DAY[zoom];
  const rows = useMemo(() => flatten(tasks, collapsed), [tasks, collapsed]);

  // overall date range across all tasks (+ padding)
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (rows.length === 0) {
      const now = new Date();
      return { rangeStart: addDays(now, -PAD_DAYS), rangeEnd: addDays(now, 60) };
    }
    let min = rows[0].start;
    let max = rows[0].end;
    rows.forEach((r) => {
      if (r.start < min) min = r.start;
      if (r.end > max) max = r.end;
    });
    return { rangeStart: addDays(min, -PAD_DAYS), rangeEnd: addDays(max, PAD_DAYS) };
  }, [rows]);

  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart));
  const timelineW = totalDays * pxPerDay;
  const bodyH = rows.length * ROW_H;
  const xOf = (d: Date) => differenceInCalendarDays(d, rangeStart) * pxPerDay;
  const scale = useMemo(
    () => buildScale(rangeStart, rangeEnd, zoom, pxPerDay),
    [rangeStart, rangeEnd, zoom, pxPerDay]
  );

  const todayX = xOf(new Date());
  const todayInRange = todayX >= 0 && todayX <= timelineW;

  // Effective status palette for a row. Explicit status wins; otherwise a
  // leaf task that's past its end date and not yet complete is auto-flagged
  // as behind schedule (red), so slipping work stands out at a glance.
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const paletteFor = (row: Row): { bar: string; fill: string } => {
    if (showCritical && metrics?.criticalIds.has(row.task.id)) return STATUS.critical;
    if (row.task.status) return STATUS[row.task.status];
    if (!row.isParent && (row.task.progress ?? 0) < 100 && row.end < today0) return STATUS.delayed;
    return STATUS.default;
  };

  // Scroll so "today" is roughly a third of the way in — once, after the
  // (async-loaded) tasks first populate.
  const didCenter = useRef(false);
  useLayoutEffect(() => {
    if (didCenter.current || rows.length === 0 || !scrollRef.current) return;
    didCenter.current = true;
    if (todayInRange) scrollRef.current.scrollLeft = Math.max(0, todayX - 240);
  }, [rows.length, todayInRange, todayX]);

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ---- drag handling -------------------------------------------------------
  const findAndUpdate = (id: string, start: string, end: string) => {
    const update = (nodes: WbsTask[]): WbsTask[] =>
      nodes.map((n) => {
        if (n.id === id) return { ...n, startDate: start, endDate: end };
        if (n.children) return { ...n, children: update(n.children) };
        return n;
      });
    setTasks(update(tasks));
  };

  const onBarPointerDown = (
    e: React.PointerEvent,
    row: Row,
    mode: DragState['mode']
  ) => {
    if (row.isParent) return; // summaries are derived, not draggable
    e.stopPropagation();
    movedRef.current = false;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({
      id: row.task.id,
      mode,
      startX: e.clientX,
      origStart: row.task.startDate,
      origEnd: row.task.endDate,
    });
    setSelectedId(row.task.id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.startX) > 3) movedRef.current = true;
    setDragOffsetDays(Math.round((e.clientX - drag.startX) / pxPerDay));
  };

  const commitDrag = () => {
    if (!drag) return;
    const delta = dragOffsetDays;
    if (delta !== 0) {
      let s = parseISO(drag.origStart);
      let en = parseISO(drag.origEnd);
      if (drag.mode === 'move') {
        s = addDays(s, delta);
        en = addDays(en, delta);
      } else if (drag.mode === 'start') {
        s = addDays(s, delta);
        if (s > en) s = en;
      } else {
        en = addDays(en, delta);
        if (en < s) en = s;
      }
      findAndUpdate(drag.id, format(s, 'yyyy-MM-dd'), format(en, 'yyyy-MM-dd'));
    }
    setDrag(null);
    setDragOffsetDays(0);
  };

  // live span for a row taking an in-progress drag into account
  const liveSpan = (row: Row): { start: Date; end: Date } => {
    if (!drag || drag.id !== row.task.id) return { start: row.start, end: row.end };
    let s = parseISO(drag.origStart);
    let en = parseISO(drag.origEnd);
    const d = dragOffsetDays;
    if (drag.mode === 'move') {
      s = addDays(s, d);
      en = addDays(en, d);
    } else if (drag.mode === 'start') {
      s = addDays(s, d);
      if (s > en) s = en;
    } else {
      en = addDays(en, d);
      if (en < s) en = s;
    }
    return { start: s, end: en };
  };

  // ---- dependency connectors ----------------------------------------------
  const rowIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.task.id, i));
    return m;
  }, [rows]);

  const connectors = useMemo(() => {
    const lines: { id: string; d: string }[] = [];
    links.forEach((l) => {
      const si = rowIndex.get(l.sourceId);
      const ti = rowIndex.get(l.targetId);
      if (si === undefined || ti === undefined) return;
      const src = rows[si];
      const tgt = rows[ti];
      const x1 = xOf(src.end) + pxPerDay; // end of source (inclusive day)
      const y1 = si * ROW_H + ROW_H / 2;
      const x2 = xOf(tgt.start);
      const y2 = ti * ROW_H + ROW_H / 2;
      const midX = Math.max(x1 + 8, x2 - 8);
      lines.push({
        id: `${l.sourceId}-${l.targetId}`,
        d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`,
      });
    });
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, rows, pxPerDay, rangeStart]);

  const completed = useMemo(() => {
    let total = 0;
    let done = 0;
    const walk = (nodes: WbsTask[]) =>
      nodes.forEach((n) => {
        if (isLeaf(n)) {
          total++;
          if ((n.progress ?? 0) >= 100) done++;
        }
        n.children && walk(n.children);
      });
    walk(tasks);
    return { total, done };
  }, [tasks]);

  if (rows.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-3">
        <p className="text-sm">No activities yet — start building the schedule.</p>
        <button
          onClick={addRoot}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: BRAND_BLACK }}
        >
          <Plus className="h-4 w-4" /> Add first activity
        </button>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="relative h-full w-full overflow-auto bg-white select-none"
      onPointerMove={onPointerMove}
      onPointerUp={commitDrag}
      onPointerLeave={() => drag && commitDrag()}
    >
      <div style={{ width: LEFT_W + timelineW, position: 'relative' }}>
        {/* ===== Header row (sticky top) ===== */}
        <div
          className="sticky top-0 z-30 flex"
          style={{ height: HEADER_H }}
        >
          {/* left header corner */}
          <div
            className="sticky left-0 z-40 flex items-end border-b border-r bg-white px-4 pb-2"
            style={{ width: LEFT_W }}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Task
            </span>
          </div>
          {/* scale */}
          <div className="relative border-b bg-white" style={{ width: timelineW }}>
            {scale.top.map((s, i) => (
              <div
                key={`t${i}`}
                className="absolute top-0 flex h-1/2 items-center border-r border-gray-100 px-2 text-xs font-semibold text-gray-700"
                style={{ left: s.left, width: s.width }}
              >
                {s.width > 28 ? s.label : ''}
              </div>
            ))}
            {scale.bottom.map((s, i) => (
              <div
                key={`b${i}`}
                className="absolute bottom-0 flex h-1/2 items-center justify-center border-r border-gray-100 text-[11px] text-gray-400"
                style={{ left: s.left, width: s.width }}
              >
                {s.width > 16 ? s.label : ''}
              </div>
            ))}
          </div>
        </div>

        {/* ===== Body ===== */}
        <div className="flex items-start" style={{ height: bodyH + ROW_H }}>
          {/* left task panel (sticky left) — editable WBS grid */}
          <div
            className="sticky left-0 z-20 border-r bg-white"
            style={{ width: LEFT_W }}
          >
            {rows.map((row) => {
              const dotColor = row.isMilestone ? BRAND_GOLD : paletteFor(row).bar;
              const isEditing = editingId === row.task.id;
              const dur =
                row.task.durationDays ??
                Math.max(1, differenceInCalendarDays(row.end, row.start) + 1);
              return (
                <div
                  key={row.task.id}
                  className={`group/row relative flex items-center gap-1.5 border-b border-gray-50 pr-1 ${
                    selectedId === row.task.id ? 'bg-amber-50' : 'hover:bg-gray-50'
                  }`}
                  style={{ height: ROW_H, paddingLeft: 6 + row.depth * 16 }}
                  onClick={() => setSelectedId(row.task.id)}
                >
                  {row.isParent ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCollapse(row.task.id); }}
                      className="flex h-4 w-4 min-h-0 min-w-0 shrink-0 items-center justify-center text-gray-400 hover:text-gray-700"
                    >
                      {collapsed.has(row.task.id)
                        ? <ChevronRight className="h-3.5 w-3.5" />
                        : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  ) : (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: row.isMilestone ? 'transparent' : dotColor,
                        border: row.isMilestone ? `2px solid ${BRAND_GOLD}` : 'none',
                        transform: row.isMilestone ? 'rotate(45deg)' : 'none',
                      }}
                    />
                  )}

                  {isEditing ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => { commitName(row.task.id, draftName); setEditingId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitName(row.task.id, draftName);
                          addAfter(row.task.id); // rapid entry: commit + open next row
                        } else if (e.key === 'Tab') {
                          e.preventDefault();
                          commitName(row.task.id, draftName);
                          if (e.shiftKey) outdent(row.task.id); else indent(row.task.id);
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                        } else if (e.key === 'Backspace' && draftName === '') {
                          e.preventDefault();
                          removeRow(row.task.id);
                        }
                      }}
                      className="min-h-0 min-w-0 flex-1 rounded border border-amber-300 bg-white px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-amber-300"
                      placeholder="Activity name…"
                    />
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); beginEdit(row.task.id, row.task.name); }}
                      className={`min-h-0 min-w-0 flex-1 truncate text-left text-sm ${
                        row.isParent ? 'font-semibold text-gray-900' : 'text-gray-700'
                      }`}
                      title={row.task.name || 'Untitled'}
                    >
                      {row.task.name || <span className="text-gray-400 italic">Untitled</span>}
                    </button>
                  )}

                  {/* duration cell */}
                  {!row.isParent && !row.isMilestone && (
                    <input
                      type="number"
                      min={1}
                      value={dur}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setDuration(row.task.id, parseInt(e.target.value) || 1)}
                      className="w-9 min-h-0 shrink-0 rounded border border-transparent bg-transparent px-0.5 text-right text-xs text-gray-500 hover:border-gray-200 focus:border-amber-300 focus:outline-none"
                      title="Duration (days)"
                    />
                  )}

                  {/* hover row actions — absolutely positioned so they never
                      squeeze the name column. */}
                  <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-gray-100 bg-white/95 px-0.5 shadow-sm group-hover/row:flex">
                    {[
                      { t: 'Add sub-task', I: CornerDownRight, on: () => addChild(row.task.id), c: 'hover:text-gray-700' },
                      { t: 'Outdent', I: IndentDecrease, on: () => outdent(row.task.id), c: 'hover:text-gray-700' },
                      { t: 'Indent', I: IndentIncrease, on: () => indent(row.task.id), c: 'hover:text-gray-700' },
                      { t: 'Details', I: Pencil, on: () => onEditTask?.(row.task), c: 'hover:text-gray-700' },
                      { t: 'Delete', I: Trash2, on: () => removeRow(row.task.id), c: 'hover:text-red-600' },
                    ].map(({ t, I, on, c }) => (
                      <button
                        key={t}
                        title={t}
                        onClick={(e) => { e.stopPropagation(); on(); }}
                        className={`flex h-6 w-6 min-h-0 min-w-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 ${c}`}
                      >
                        <I className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* add-activity row */}
            <button
              onClick={addRoot}
              className="flex w-full min-h-0 items-center gap-1.5 px-3 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-700"
              style={{ height: ROW_H }}
            >
              <Plus className="h-4 w-4" /> Add activity
            </button>
          </div>

          {/* timeline body */}
          <div className="relative" style={{ width: timelineW, height: bodyH }}>
            {/* vertical month/week gridlines */}
            {scale.top.map((s, i) => (
              <div
                key={`g${i}`}
                className="absolute top-0 border-r border-gray-100"
                style={{ left: s.left + s.width, height: bodyH }}
              />
            ))}
            {/* weekend shading */}
            {showWeekends && zoom !== 'Month' &&
              eachDayOfInterval({ start: rangeStart, end: rangeEnd })
                .filter((d) => d.getDay() === 0 || d.getDay() === 6)
                .map((d, i) => (
                  <div
                    key={`w${i}`}
                    className="absolute top-0 bg-gray-50"
                    style={{ left: xOf(d), width: pxPerDay, height: bodyH }}
                  />
                ))}
            {/* row separators + zebra */}
            {rows.map((row, i) => (
              <div
                key={`r${row.task.id}`}
                className={`absolute left-0 border-b border-gray-50 ${
                  selectedId === row.task.id ? 'bg-amber-50/40' : ''
                }`}
                style={{ top: i * ROW_H, height: ROW_H, width: timelineW }}
              />
            ))}

            {/* dependency connectors */}
            <svg
              className="pointer-events-none absolute left-0 top-0"
              width={timelineW}
              height={bodyH}
            >
              <defs>
                <marker
                  id="sl-arrow"
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill="#cbd5e1" />
                </marker>
              </defs>
              {connectors.map((c) => (
                <path
                  key={c.id}
                  d={c.d}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                  markerEnd="url(#sl-arrow)"
                />
              ))}
            </svg>

            {/* today line */}
            {todayInRange && (
              <div
                className="pointer-events-none absolute top-0 z-10"
                style={{ left: todayX, height: bodyH }}
              >
                <div className="h-full w-px bg-sky-500" />
                <div className="absolute -top-0 -translate-x-1/2 rounded-b bg-sky-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Today
                </div>
              </div>
            )}

            {/* bars */}
            {rows.map((row, i) => {
              const { start, end } = liveSpan(row);
              const left = xOf(start);
              const width = Math.max(pxPerDay, (differenceInCalendarDays(end, start) + 1) * pxPerDay);
              const top = i * ROW_H + (ROW_H - BAR_H) / 2;
              const progress = Math.min(100, Math.max(0, row.task.progress ?? 0));

              // milestone diamond
              if (row.isMilestone) {
                const size = 14;
                return (
                  <div
                    key={`bar${row.task.id}`}
                    className="absolute z-10 cursor-pointer"
                    style={{
                      left: left - size / 2,
                      top: i * ROW_H + (ROW_H - size) / 2,
                      width: size,
                      height: size,
                      background: BRAND_GOLD,
                      transform: 'rotate(45deg)',
                      borderRadius: 2,
                    }}
                    title={`${row.task.name} — ${format(start, 'MMM d, yyyy')}`}
                    onPointerDown={(e) => onBarPointerDown(e, row, 'move')}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!movedRef.current) onEditTask?.(row.task);
                    }}
                  />
                );
              }

              // parent summary bar (thin brand-black)
              if (row.isParent) {
                return (
                  <div
                    key={`bar${row.task.id}`}
                    className="absolute z-10"
                    style={{ left, top: top + BAR_H / 2 - 3, width, height: 6 }}
                  >
                    <div className="h-full w-full rounded-sm" style={{ background: BRAND_BLACK }} />
                    {/* end caps */}
                    <div className="absolute -left-px -top-1 h-3 w-1.5" style={{ background: BRAND_BLACK }} />
                    <div className="absolute -right-px -top-1 h-3 w-1.5" style={{ background: BRAND_BLACK }} />
                  </div>
                );
              }

              // leaf task bar
              const palette = paletteFor(row);
              const dragging = drag?.id === row.task.id;

              // baseline variance label
              let variance: { text: string; color: string } | null = null;
              if (showBaseline && row.task.baselineEnd) {
                const d = differenceInCalendarDays(end, parseISO(row.task.baselineEnd));
                if (d !== 0)
                  variance = {
                    text: `${d > 0 ? '+' : ''}${d}d`,
                    color: d > 0 ? '#dc2626' : '#16a34a',
                  };
              }

              return (
                <div
                  key={`bar${row.task.id}`}
                  className={`group absolute z-10 cursor-grab rounded-md ${
                    dragging ? 'cursor-grabbing ring-2 ring-amber-300' : ''
                  }`}
                  style={{
                    left,
                    top,
                    width,
                    height: BAR_H,
                    background: palette.bar,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                    opacity: dragging ? 0.85 : 1,
                  }}
                  title={`${row.task.name}\n${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')} · ${progress}%`}
                  onPointerDown={(e) => onBarPointerDown(e, row, 'move')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(row.task.id);
                    if (!movedRef.current) onEditTask?.(row.task);
                  }}
                >
                  {/* progress fill */}
                  <div
                    className="h-full rounded-l-md"
                    style={{
                      width: `${progress}%`,
                      background: palette.fill,
                      borderTopRightRadius: progress >= 100 ? 6 : 0,
                      borderBottomRightRadius: progress >= 100 ? 6 : 0,
                    }}
                  />
                  {/* resize handles */}
                  <div
                    className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
                    style={{ background: 'rgba(255,255,255,0.5)' }}
                    onPointerDown={(e) => onBarPointerDown(e, row, 'start')}
                  />
                  <div
                    className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
                    style={{ background: 'rgba(255,255,255,0.5)' }}
                    onPointerDown={(e) => onBarPointerDown(e, row, 'end')}
                  />
                  {/* label to the right */}
                  <span
                    className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap text-xs text-gray-600"
                  >
                    {variance && (
                      <span style={{ color: variance.color, fontWeight: 600 }}>{variance.text} </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
