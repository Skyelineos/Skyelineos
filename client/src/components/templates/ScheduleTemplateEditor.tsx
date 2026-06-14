import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft, Plus, Trash2, Save, List, GanttChartSquare,
  ChevronUp, ChevronDown, ChevronRight as ChevronRightIcon, ChevronLeft as ChevronLeftIcon,
  ZoomIn, ZoomOut, Maximize, Minimize,
} from 'lucide-react';

// ─── Date helpers ────────────────────────────────────────────────────────────
function isoAddDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function isoDiffDays(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}
import type { WbsTask, Link } from '@/modules/gantt/types';

interface Props {
  templateId: string;
  onBack: () => void;
}

// Schedule template editor — toggles between a flat list (great for keyboard
// editing names/durations) and an SVG Gantt with:
//   - hold-Space + drag to pan the chart
//   - dependency arrows drawn between bars
//   - click an arrow to delete the dependency
//   - drag from the circle at the right end of any bar onto another bar to
//     create a new finish-to-start link
// Standalone from the project Gantt's global Zustand store so we don't
// corrupt the live project schedule while editing the template.
export function ScheduleTemplateEditor({ templateId, onBack }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState<WbsTask[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [view, setView] = useState<'list' | 'gantt'>('list');
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'scheduleTemplates', templateId));
        if (cancelled) return;
        if (!snap.exists()) {
          toast({ title: 'Template not found', variant: 'destructive' });
          onBack();
          return;
        }
        const data = snap.data() as any;
        setName(data.name || '');
        setDescription(data.description || '');
        setTasks(Array.isArray(data.tasks) ? data.tasks : []);
        setLinks(Array.isArray(data.links) ? data.links : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [templateId, toast, onBack]);

  const updateTask = (id: string, patch: Partial<WbsTask>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
  };

  const removeTask = (id: string) => {
    if (!confirm('Remove this task from the template?')) return;
    setTasks(prev => prev.filter(t => t.id !== id));
    setLinks(prev => prev.filter(l => l.sourceId !== id && l.targetId !== id));
  };

  const addTask = () => {
    const id = `t_${Date.now()}`;
    setTasks(prev => [
      ...prev,
      {
        id,
        name: 'New task',
        startDate: prev[prev.length - 1]?.endDate || new Date().toISOString().slice(0, 10),
        endDate: prev[prev.length - 1]?.endDate || new Date().toISOString().slice(0, 10),
        durationDays: 1,
      } as WbsTask,
    ]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'scheduleTemplates', templateId), {
        name: name.trim() || 'Untitled schedule',
        description: description.trim(),
        tasks,
        links,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Template saved', description: `${tasks.length} tasks · ${links.length} dependencies.` });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async () => {
    if (!confirm(`Delete "${name}" template? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'scheduleTemplates', templateId));
      toast({ title: 'Template deleted' });
      onBack();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    }
  };

  const handleDeleteLink = (sourceId: string, targetId: string) => {
    setLinks(prev => prev.filter(l => !(l.sourceId === sourceId && l.targetId === targetId)));
  };

  const handleCreateLink = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    // Avoid duplicates.
    setLinks(prev => {
      if (prev.some(l => l.sourceId === sourceId && l.targetId === targetId)) return prev;
      return [...prev, { sourceId, targetId, type: 'FS' }];
    });
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">Loading schedule template…</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ChevronLeft className="w-4 h-4" />
          Templates
        </button>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-xs inline-flex items-center gap-1.5 ${view === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
            <button
              onClick={() => setView('gantt')}
              className={`px-3 py-1.5 text-xs inline-flex items-center gap-1.5 border-l border-gray-200 ${view === 'gantt' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              <GanttChartSquare className="w-3.5 h-3.5" />
              Gantt
            </button>
          </div>
          <Button variant="outline" onClick={removeTemplate} className="text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Tasks</h3>
          <Badge variant="outline" className="text-xs">{tasks.length}</Badge>
          <Badge variant="outline" className="text-xs">{links.length} deps</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={addTask} className="gap-1">
          <Plus className="w-3.5 h-3.5" />
          Add task
        </Button>
      </div>

      {view === 'gantt' ? (
        <GanttView
          tasks={tasks}
          links={links}
          onSelectTask={(id) => {
            setFocusTaskId(id);
            setView('list');
            setTimeout(() => {
              const el = document.getElementById(`task-row-${id}`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
          }}
          onDeleteLink={handleDeleteLink}
          onCreateLink={handleCreateLink}
          onUpdateTask={updateTask}
        />
      ) : (
        <>
          <p className="text-xs text-gray-500 -mt-3">
            Edit task names and durations here. Use the <strong>Gantt</strong> tab
            to wire dependency arrows between tasks.
          </p>
          <Card>
            <CardContent className="p-2">
              {tasks.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">
                  No tasks yet. Click "Add task" to get started.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {tasks.map((t, i) => (
                    <div
                      key={t.id}
                      id={`task-row-${t.id}`}
                      className={`flex items-center gap-2 px-2 py-2 ${focusTaskId === t.id ? 'bg-amber-50 rounded' : ''}`}
                    >
                      <span className="text-xs text-gray-400 w-6 tabular-nums text-right">{i + 1}</span>
                      <Input
                        value={t.name}
                        onChange={e => updateTask(t.id, { name: e.target.value })}
                        className="flex-1"
                        autoFocus={focusTaskId === t.id}
                      />
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          value={t.durationDays ?? 1}
                          onChange={e => {
                            const n = parseInt(e.target.value, 10);
                            if (!Number.isNaN(n) && n >= 1) updateTask(t.id, { durationDays: n });
                          }}
                          className="w-20 text-center"
                        />
                        <span className="text-xs text-gray-500">days</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeTask(t.id)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── SVG Gantt with pan + dependency editing ────────────────────────────────
// Industry-standard Gantt UX (modeled after MS Project, OmniPlan,
// dhtmlx-gantt):
//   - native scroll inside the chart (touch + wheel) with overscroll
//     contained so the page doesn't move when the Gantt scrolls
//   - explicit arrow buttons (↑ ↓ ← →) around the chart edges for tap
//     navigation on iPad
//   - hold Space + mouse-drag to pan on desktop
//   - dependency arrows finish→start (FS) by default
//   - click the × bubble on an arrow to delete that dependency
//   - drag from the ⬤ at a bar's right edge onto another bar to create
//     an FS dependency
// All pointer interactions use document-level listeners (no pointer
// capture) so move/up events fire reliably regardless of where the
// pointer ends up.
function GanttView({
  tasks, links, onSelectTask, onDeleteLink, onCreateLink, onUpdateTask,
}: {
  tasks: WbsTask[];
  links: Link[];
  onSelectTask: (id: string) => void;
  onDeleteLink: (sourceId: string, targetId: string) => void;
  onCreateLink: (sourceId: string, targetId: string) => void;
  onUpdateTask: (id: string, patch: Partial<WbsTask>) => void;
}) {
  // Zoom level — day = 24 px/day, week = 10 px/day, month = 4 px/day.
  const [zoom, setZoom] = useState<'day' | 'week' | 'month'>('week');
  const DAY_PX = zoom === 'day' ? 24 : zoom === 'week' ? 10 : 4;
  // Full-screen takeover so Tyler / a sub can edit the chart on the full
  // iPad viewport without the surrounding app chrome competing for space.
  const [fullscreen, setFullscreen] = useState(false);
  const range = useMemo(() => {
    if (!tasks.length) return null;
    let earliest = tasks[0].startDate;
    let latest = tasks[0].endDate;
    for (const t of tasks) {
      if (t.startDate < earliest) earliest = t.startDate;
      if (t.endDate > latest) latest = t.endDate;
    }
    const dE = new Date(earliest);
    const dL = new Date(latest);
    const days = Math.max(1, Math.round((dL.getTime() - dE.getTime()) / 86400000) + 1);
    return { earliestIso: earliest, latestIso: latest, earliest: dE, latest: dL, days };
  }, [tasks]);

  // Layout constants (DAY_PX is zoom-driven, computed above).
  const ROW_HEIGHT = 26;
  const BAR_PAD_Y = 5;
  const NAME_COL = 220;
  const TOP_PAD = 30;

  // Hold-Space + drag → pan the scroll container (desktop).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const isTypingField = (t: EventTarget | null) =>
      t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingField(e.target)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingField(e.target)) {
        e.preventDefault();
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  const startPan = (clientX: number, clientY: number) => {
    const c = scrollRef.current;
    if (!c) return;
    setPanning(true);
    const startX = clientX, startY = clientY;
    const startSL = c.scrollLeft, startST = c.scrollTop;
    const move = (e: PointerEvent) => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = startSL - (e.clientX - startX);
      scrollRef.current.scrollTop = startST - (e.clientY - startY);
    };
    const up = () => {
      setPanning(false);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  // Drag-from-end-circle to create a dependency.
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragFrom, setDragFrom] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [dragTo, setDragTo] = useState<{ x: number; y: number } | null>(null);

  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // Scroll the chart with the arrow buttons — works on iPad where space
  // isn't available. ~3 task rows / ~3 weeks per click.
  const scrollByChunk = (dx: number, dy: number) => {
    scrollRef.current?.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
  };

  if (!tasks.length || !range) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-gray-400">
        No tasks to chart yet.
      </CardContent></Card>
    );
  }

  // Compute geometry helpers and per-task bar coordinates.
  const totalWidth = NAME_COL + range.days * DAY_PX + 24;
  const totalHeight = TOP_PAD + tasks.length * ROW_HEIGHT + 8;

  const dayOffset = (iso: string) => {
    const d = new Date(iso);
    return Math.round((d.getTime() - range.earliest.getTime()) / 86400000);
  };

  const barRect = (t: WbsTask, i: number) => {
    const x = NAME_COL + dayOffset(t.startDate) * DAY_PX;
    const widthDays = Math.max(1, dayOffset(t.endDate) - dayOffset(t.startDate) + 1);
    const w = Math.max(2, widthDays * DAY_PX);
    const y = TOP_PAD + i * ROW_HEIGHT + BAR_PAD_Y;
    const h = ROW_HEIGHT - BAR_PAD_Y * 2;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  };

  // Month grid lines + labels.
  const monthMarks: { x: number; label: string }[] = [];
  {
    const d = new Date(range.earliest);
    d.setDate(1);
    while (d <= range.latest) {
      const x = NAME_COL + dayOffset(d.toISOString().slice(0, 10)) * DAY_PX;
      const label = d.toLocaleString(undefined, { month: 'short', year: '2-digit' });
      monthMarks.push({ x, label });
      d.setMonth(d.getMonth() + 1);
    }
  }

  const taskIndexById = new Map(tasks.map((t, i) => [t.id, i]));
  const colorFor = (t: WbsTask) =>
    t.status === 'pending_approval' ? '#f59e0b' : '#0ea5e9';

  // Build dependency arrow geometry: from source end → target start, stepped.
  const arrows = links.flatMap((l) => {
    const srcIdx = taskIndexById.get(l.sourceId);
    const tgtIdx = taskIndexById.get(l.targetId);
    if (srcIdx === undefined || tgtIdx === undefined) return [];
    const src = barRect(tasks[srcIdx], srcIdx);
    const tgt = barRect(tasks[tgtIdx], tgtIdx);
    // Finish-to-Start (FS): from src right edge → target left edge.
    // SS: source-left → target-left. Others fall through to FS for now.
    const start = l.type === 'SS'
      ? { x: src.x, y: src.cy }
      : { x: src.x + src.w, y: src.cy };
    const end = { x: tgt.x, y: tgt.cy };
    // Stepped right-angle path: out 6 px, vertical, into 6 px.
    const elbowX = Math.max(start.x + 6, end.x - 6);
    const d = `M ${start.x} ${start.y} L ${elbowX} ${start.y} L ${elbowX} ${end.y} L ${end.x} ${end.y}`;
    const midX = elbowX;
    const midY = (start.y + end.y) / 2;
    return [{ d, midX, midY, sourceId: l.sourceId, targetId: l.targetId }];
  });

  // Hit-test when releasing a drag → which task is under the pointer?
  const taskAtPoint = (sx: number, sy: number): string | null => {
    if (sx < NAME_COL) return null;
    const rowIdx = Math.floor((sy - TOP_PAD) / ROW_HEIGHT);
    if (rowIdx < 0 || rowIdx >= tasks.length) return null;
    return tasks[rowIdx].id;
  };

  const startDepDrag = (taskId: string, originX: number, originY: number) => {
    setDragFrom({ taskId, x: originX, y: originY });
    setDragTo({ x: originX, y: originY });
    const move = (e: PointerEvent) => {
      setDragTo(svgPoint(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      const p = svgPoint(e.clientX, e.clientY);
      const targetId = taskAtPoint(p.x, p.y);
      if (targetId && targetId !== taskId) {
        onCreateLink(taskId, targetId);
      }
      setDragFrom(null);
      setDragTo(null);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  // Drag the body of a bar → shift both start and end dates by N days.
  // Snaps to whole days. Tracks whether the gesture turned into an actual
  // drag (≥4 px movement) so a tap still navigates to List view.
  const startBarMove = (
    taskId: string,
    initialStart: string,
    initialEnd: string,
    clientX: number,
  ) => {
    let dragged = false;
    const startX = clientX;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) < 4) return;
      dragged = true;
      const dDays = Math.round(dx / DAY_PX);
      onUpdateTask(taskId, {
        startDate: isoAddDays(initialStart, dDays),
        endDate: isoAddDays(initialEnd, dDays),
      });
    };
    const up = (_e: PointerEvent) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (!dragged) {
        // Treat as a click → jump to list view.
        onSelectTask(taskId);
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  // Drag the right-edge resize grip → change duration by extending endDate.
  // Snaps to whole days; enforces a minimum 1-day duration.
  const startBarResize = (
    taskId: string,
    initialStart: string,
    initialEnd: string,
    clientX: number,
  ) => {
    const startX = clientX;
    const move = (e: PointerEvent) => {
      const dDays = Math.round((e.clientX - startX) / DAY_PX);
      const newEnd = isoAddDays(initialEnd, dDays);
      // Don't let the bar shrink below the start.
      if (isoDiffDays(initialStart, newEnd) < 0) return;
      const newDuration = isoDiffDays(initialStart, newEnd) + 1;
      onUpdateTask(taskId, {
        endDate: newEnd,
        durationDays: newDuration,
      });
    };
    const up = (_e: PointerEvent) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 bg-white p-2 overflow-auto' : ''}>
    <Card className={fullscreen ? 'h-full flex flex-col' : ''}>
      <CardContent className={`p-0 ${fullscreen ? 'flex-1 flex flex-col min-h-0' : ''}`}>
        {/* Nav arrow + zoom row — works on every device. Sits in the
            chart's header so it doesn't overlay (and steal taps from)
            the scrollable canvas. */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 flex-wrap">
          <span className="text-xs text-gray-600">Scroll:</span>
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => scrollByChunk(-DAY_PX * 21, 0)} aria-label="Left">
            <ChevronLeftIcon className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => scrollByChunk(DAY_PX * 21, 0)} aria-label="Right">
            <ChevronRightIcon className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => scrollByChunk(0, -ROW_HEIGHT * 5)} aria-label="Up">
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => scrollByChunk(0, ROW_HEIGHT * 5)} aria-label="Down">
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>

          <div className="w-px h-5 bg-gray-300 mx-1" />
          <span className="text-xs text-gray-600">Zoom:</span>
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
            {(['day', 'week', 'month'] as const).map(z => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`px-2.5 py-1 text-xs ${zoom === z ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} ${z !== 'day' ? 'border-l border-gray-200' : ''}`}
              >
                {z[0].toUpperCase() + z.slice(1)}
              </button>
            ))}
          </div>

          <span className="ml-auto text-xs text-gray-500">
            {tasks.length} tasks · {links.length} deps
          </span>
          <Button
            size="sm"
            variant={fullscreen ? 'default' : 'outline'}
            className="h-7 gap-1"
            onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? 'Exit full screen' : 'Full screen'}
          >
            {fullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline text-xs">
              {fullscreen ? 'Exit Full Screen' : 'Full Screen'}
            </span>
          </Button>
        </div>

        <div
          ref={scrollRef}
          className={fullscreen ? 'flex-1 min-h-0' : ''}
          style={{
            cursor: spaceHeld ? (panning ? 'grabbing' : 'grab') : undefined,
            overflowX: 'auto',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-x pan-y',
            height: fullscreen ? undefined : '70vh',
          }}
          onPointerDown={(e) => {
            // Hold-Space + drag pans the chart on desktop. Touch is left
            // to native scrolling — the arrow buttons above are the
            // universal nav.
            if (spaceHeld) {
              e.preventDefault();
              startPan(e.clientX, e.clientY);
            }
          }}
        >
          <svg
            ref={svgRef}
            width={totalWidth}
            height={totalHeight}
            style={{ display: 'block', minWidth: totalWidth, minHeight: totalHeight }}
            className="select-none"
          >
            <defs>
              <marker
                id="arrow-head"
                viewBox="0 0 8 8"
                refX="7" refY="4"
                markerWidth="6" markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="#475569" />
              </marker>
            </defs>

            {/* Month grid + labels */}
            {monthMarks.map((m, i) => (
              <g key={i}>
                <line
                  x1={m.x} y1={TOP_PAD - 4}
                  x2={m.x} y2={totalHeight}
                  stroke="#e5e7eb" strokeDasharray="2 4"
                />
                <text x={m.x + 4} y={18} fontSize={10} fill="#6b7280">{m.label}</text>
              </g>
            ))}

            <line x1={0} y1={TOP_PAD} x2={totalWidth} y2={TOP_PAD} stroke="#e5e7eb" />
            <line x1={NAME_COL} y1={0} x2={NAME_COL} y2={totalHeight} stroke="#e5e7eb" />

            {/* Row striping + task names */}
            {tasks.map((t, i) => {
              const y = TOP_PAD + i * ROW_HEIGHT;
              return (
                <g key={`row-${t.id}`}>
                  {i % 2 === 1 && (
                    <rect x={0} y={y} width={totalWidth} height={ROW_HEIGHT} fill="#f9fafb" />
                  )}
                  <text x={6} y={y + ROW_HEIGHT / 2 + 4} fontSize={11} fill="#374151">
                    {(i + 1) + '. ' + (t.name.length > 30 ? t.name.slice(0, 28) + '…' : t.name)}
                  </text>
                </g>
              );
            })}

            {/* Bars + resize grip + end-circles */}
            {tasks.map((t, i) => {
              const r = barRect(t, i);
              const RESIZE_GRIP_W = 6;
              return (
                <g key={`bar-${t.id}`}>
                  {/* Bar body — pointerdown starts a drag-to-move; a tap
                      (< 4 px) is treated as a click → list view. */}
                  <rect
                    x={r.x} y={r.y}
                    width={Math.max(2, r.w - RESIZE_GRIP_W)} height={r.h}
                    rx={3} ry={3}
                    fill={colorFor(t)}
                    className={spaceHeld ? '' : 'cursor-move hover:opacity-80'}
                    onPointerDown={(e) => {
                      if (spaceHeld) return;
                      e.stopPropagation();
                      startBarMove(t.id, t.startDate, t.endDate, e.clientX);
                    }}
                  >
                    <title>{`${t.name} — ${t.startDate} → ${t.endDate} (${t.durationDays} day${(t.durationDays ?? 0) === 1 ? '' : 's'}). Drag to shift dates. Tap to edit.`}</title>
                  </rect>
                  {/* Right-edge resize grip — slightly darker overlay. */}
                  {r.w > RESIZE_GRIP_W * 2 && (
                    <rect
                      x={r.x + r.w - RESIZE_GRIP_W} y={r.y}
                      width={RESIZE_GRIP_W} height={r.h}
                      fill={colorFor(t)}
                      rx={3} ry={3}
                      className={spaceHeld ? '' : 'cursor-ew-resize'}
                      style={{ filter: 'brightness(0.85)' }}
                      onPointerDown={(e) => {
                        if (spaceHeld) return;
                        e.stopPropagation();
                        startBarResize(t.id, t.startDate, t.endDate, e.clientX);
                      }}
                    >
                      <title>Drag to change duration</title>
                    </rect>
                  )}
                  {/* End-circle handle for creating a new dependency */}
                  <circle
                    cx={r.x + r.w} cy={r.cy} r={6}
                    fill="#ffffff" stroke="#0ea5e9" strokeWidth={1.5}
                    className={spaceHeld ? '' : 'cursor-crosshair'}
                    onPointerDown={(e) => {
                      if (spaceHeld) return;
                      e.stopPropagation();
                      e.preventDefault();
                      startDepDrag(t.id, r.x + r.w, r.cy);
                    }}
                  >
                    <title>Drag onto another bar to create a finish-to-start dependency</title>
                  </circle>
                </g>
              );
            })}

            {/* Dependency arrows */}
            {arrows.map((a, i) => (
              <g key={`arrow-${i}`} className="cursor-pointer">
                <path
                  d={a.d}
                  fill="none"
                  stroke="#475569"
                  strokeWidth={1.2}
                  markerEnd="url(#arrow-head)"
                />
                {/* Larger invisible hit target along the path */}
                <path
                  d={a.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={10}
                  style={{ pointerEvents: 'stroke' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this dependency?')) onDeleteLink(a.sourceId, a.targetId);
                  }}
                />
                <circle
                  cx={a.midX} cy={a.midY} r={5}
                  fill="#ffffff" stroke="#475569" strokeWidth={1.2}
                  className="hover:fill-red-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this dependency?')) onDeleteLink(a.sourceId, a.targetId);
                  }}
                >
                  <title>Click to delete dependency</title>
                </circle>
                <text
                  x={a.midX} y={a.midY + 3}
                  fontSize={8} fill="#475569"
                  textAnchor="middle"
                  style={{ pointerEvents: 'none' }}
                >×</text>
              </g>
            ))}

            {/* Live ghost arrow while dragging from an end-circle */}
            {dragFrom && dragTo && (
              <path
                d={`M ${dragFrom.x} ${dragFrom.y} L ${dragTo.x} ${dragTo.y}`}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
          </svg>
        </div>

        <div className="p-3 border-t border-gray-100 text-xs text-gray-500 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-sky-500 inline-block" /> Task
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Client decision
          </span>
          <span>Drag a bar to shift dates · drag the dark right edge to resize</span>
          <span>Drag the ⬤ on a bar's end to add a dependency</span>
          <span>Click the × on an arrow to delete it</span>
          <span>Tap a bar (no drag) to edit in List view</span>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
