/**
 * Project Schedule Progress View
 *
 * The honest-progress surface. Mounted on the GC project overview AND on the
 * client portal. Reads tasks from the `tasks/` collection (same store the live
 * Tasks page reads/writes from) and groups them by build phase to produce:
 *
 *   - per-phase counts (total / done / awaiting_signoff / in_progress / pending)
 *   - per-phase pct = done / total * 100 (signed-off tasks only — that's what
 *     makes this view honest. Awaiting sign-off counts as "in progress" from
 *     the client's perspective until GC/PM approves.)
 *   - current phase = earliest phase with done < total
 *   - "Coming up next" — next 1-2 phases with remaining work
 *
 * Audience modes:
 *   - 'gc'     — full detail incl. assignee names
 *   - 'client' — assignee names hidden; per-phase task list compressed to
 *                a "{count} in progress" summary instead of named items
 *
 * Layout:
 *   - Mobile (default): vertical strip; past phases collapsed; current phase
 *     prominent with golden accent; future phases compact
 *   - Desktop (md:+):   horizontal swimlane with per-phase progress bar
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, Circle, ChevronDown, ChevronUp, Calendar, AlertCircle } from 'lucide-react';
import { normalizeTaskStatus, type TaskStatus } from '@/lib/taskStatus';

// Canonical build-phase ordering. Tasks store their phase via the `phase`
// field; we fall back to `category` then '__unphased' so nothing disappears.
// Comparisons are case-insensitive + non-alphanumeric-tolerant.
const PHASE_ORDER: string[] = [
  'Pre-Build',
  'Foundation',
  'Framing',
  'MEP',
  'Drywall',
  'Finishes',
  'Punch List',
  'Closeout',
];

const PHASE_ALIASES: Record<string, string> = {
  prebuild: 'Pre-Build',
  prestart: 'Pre-Build',
  presite: 'Pre-Build',
  pre_site: 'Pre-Build',
  precon: 'Pre-Build',
  preconstruction: 'Pre-Build',
  planning: 'Pre-Build',
  foundation: 'Foundation',
  concrete: 'Foundation',
  framing: 'Framing',
  drywall: 'Drywall',
  insulation: 'Drywall',
  mep: 'MEP',
  mechanical: 'MEP',
  electrical: 'MEP',
  plumbing: 'MEP',
  hvac: 'MEP',
  finish: 'Finishes',
  finishes: 'Finishes',
  finishwork: 'Finishes',
  finish_work: 'Finishes',
  punch: 'Punch List',
  punchlist: 'Punch List',
  punch_list: 'Punch List',
  closeout: 'Closeout',
  warranty: 'Closeout',
};

function canonicalPhase(raw: string | undefined | null): string {
  const v = String(raw || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (!v) return 'Other';
  if (PHASE_ALIASES[v]) return PHASE_ALIASES[v];
  // Exact case-insensitive match against the canonical list
  for (const p of PHASE_ORDER) {
    if (p.toLowerCase().replace(/[^a-z0-9]/g, '') === v) return p;
  }
  // Bucket anything we can't map under 'Other' so it still shows up.
  return 'Other';
}

interface TaskDoc {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  phase?: string;
  category?: string;
  assignedToName?: string;
  assignedSubName?: string;
  dueDate?: string;
  startDate?: string;
  endDate?: string;
}

interface PhaseSummary {
  name: string;
  total: number;
  done: number;
  awaiting: number;
  inProgress: number;
  pending: number; // todo + blocked
  pct: number;
  tasks: TaskDoc[];
}

function fmtDate(v: any): string {
  if (!v) return '';
  const ms = typeof v?.toMillis === 'function' ? v.toMillis() : Date.parse(String(v));
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface ProjectProgressViewProps {
  projectId: string;
  audience: 'gc' | 'client';
}

export function ProjectProgressView({ projectId, audience }: ProjectProgressViewProps) {
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    const q = query(collection(db, 'tasks'), where('projectId', '==', projectId));
    const unsubTasks = onSnapshot(
      q,
      snap => {
        setTasks(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubProj = onSnapshot(doc(db, 'projects', projectId), snap => {
      setProject(snap.exists() ? snap.data() : null);
    }, () => {});
    return () => { unsubTasks(); unsubProj(); };
  }, [projectId]);

  // Group tasks into PhaseSummary objects in canonical order.
  const summaries: PhaseSummary[] = useMemo(() => {
    const byPhase = new Map<string, TaskDoc[]>();
    for (const t of tasks) {
      const ph = canonicalPhase(t.phase || t.category);
      const list = byPhase.get(ph) || [];
      list.push(t);
      byPhase.set(ph, list);
    }
    const phasesInUse = [...PHASE_ORDER, 'Other'].filter(p => byPhase.has(p));
    return phasesInUse.map(name => {
      const ts = byPhase.get(name) || [];
      let done = 0, awaiting = 0, inProgress = 0, pending = 0;
      for (const t of ts) {
        const s: TaskStatus = normalizeTaskStatus(t.status);
        if (s === 'done') done++;
        else if (s === 'awaiting_signoff') awaiting++;
        else if (s === 'in_progress') inProgress++;
        else pending++;
      }
      const total = ts.length;
      const pct = total === 0 ? 0 : Math.round((done / total) * 100);
      return { name, total, done, awaiting, inProgress, pending, pct, tasks: ts };
    });
  }, [tasks]);

  // "Current" phase = earliest phase with remaining work.
  const currentPhase = useMemo(() => {
    for (const s of summaries) if (s.done < s.total) return s.name;
    return summaries[summaries.length - 1]?.name || null;
  }, [summaries]);

  // Coming-up = next 1-2 phases AFTER current that still have pending work.
  const comingUp = useMemo(() => {
    if (!currentPhase) return [];
    const idx = summaries.findIndex(s => s.name === currentPhase);
    const out: string[] = [];
    for (let i = idx + 1; i < summaries.length && out.length < 2; i++) {
      if (summaries[i].pending + summaries[i].inProgress + summaries[i].awaiting > 0) {
        out.push(summaries[i].name);
      }
    }
    return out;
  }, [summaries, currentPhase]);

  const startDate = project?.startDate || project?.start_date;
  const targetDate = project?.targetCompletion || project?.target_completion || project?.endDate;

  // Empty/no-schedule state.
  if (!loading && summaries.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#C9A96E]" />
            Progress at a glance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!startDate ? (
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-4">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Set the project start date in Project Setup to see the schedule view.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No tasks scheduled yet. Add tasks to see phase progress here.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Total progress across all phases (signed-off only).
  const totalTasks = summaries.reduce((a, s) => a + s.total, 0);
  const totalDone = summaries.reduce((a, s) => a + s.done, 0);
  const totalPct = totalTasks === 0 ? 0 : Math.round((totalDone / totalTasks) * 100);

  return (
    <Card className="pb-safe">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#C9A96E]" />
            Progress at a glance
          </div>
          <span className="text-sm font-normal text-gray-500">
            {totalDone} of {totalTasks} signed off ({totalPct}%)
          </span>
        </CardTitle>
        {(startDate || targetDate) && (
          <p className="text-xs text-gray-500 mt-1">
            {startDate ? <>Project start: <span className="font-medium text-gray-700">{fmtDate(startDate)}</span></> : null}
            {startDate && targetDate ? ' · ' : null}
            {targetDate ? <>Target completion: <span className="font-medium text-gray-700">{fmtDate(targetDate)}</span></> : null}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {/* ─── Mobile: vertical strip ─────────────────────────────────────── */}
        <div className="md:hidden space-y-3">
          {summaries.map(phase => {
            const isCurrent = phase.name === currentPhase;
            const isPast = phase.total > 0 && phase.done === phase.total;
            const isFuture = !isCurrent && !isPast;
            const isExpanded = isCurrent || !!expanded[phase.name];
            return (
              <button
                key={phase.name}
                type="button"
                onClick={() => setExpanded(e => ({ ...e, [phase.name]: !e[phase.name] }))}
                className={`w-full text-left rounded-xl border p-3 min-h-[44px] transition-shadow ${
                  isCurrent ? 'border-[#C9A96E] bg-amber-50 shadow-sm ring-1 ring-[#C9A96E]/40' :
                  isPast ? 'border-gray-200 bg-gray-50' :
                  'border-gray-200 bg-white'
                }`}
                aria-expanded={isExpanded}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isPast ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    ) : isCurrent ? (
                      <Clock className="h-4 w-4 text-[#C9A96E] flex-shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-gray-300 flex-shrink-0" />
                    )}
                    <span className={`font-semibold truncate ${isCurrent ? 'text-gray-900' : isPast ? 'text-gray-600' : 'text-gray-500'}`}>
                      {phase.name}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-[#C9A96E] text-white rounded-full px-2 py-0.5 ml-1">
                        Now
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500">{phase.done}/{phase.total}</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </div>
                {isPast ? (
                  <p className="text-xs text-gray-500 mt-1 ml-6">All done</p>
                ) : isFuture ? (
                  <p className="text-xs text-gray-500 mt-1 ml-6">Coming up · {phase.total} task{phase.total === 1 ? '' : 's'}</p>
                ) : null}
                {/* progress bar */}
                <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${isCurrent ? 'bg-[#C9A96E]' : isPast ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    style={{ width: `${phase.pct}%` }}
                  />
                </div>
                {isExpanded && phase.total > 0 && (
                  <PhaseTaskList phase={phase} audience={audience} />
                )}
              </button>
            );
          })}
        </div>

        {/* ─── Desktop: horizontal swimlane ───────────────────────────────── */}
        <div className="hidden md:grid gap-3" style={{ gridTemplateColumns: `repeat(${summaries.length}, minmax(0, 1fr))` }}>
          {summaries.map(phase => {
            const isCurrent = phase.name === currentPhase;
            const isPast = phase.total > 0 && phase.done === phase.total;
            return (
              <div
                key={phase.name}
                className={`rounded-xl border p-3 min-h-[160px] flex flex-col ${
                  isCurrent ? 'border-[#C9A96E] bg-amber-50 ring-1 ring-[#C9A96E]/40' :
                  isPast ? 'border-gray-200 bg-gray-50' :
                  'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {isPast ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                  ) : isCurrent ? (
                    <Clock className="h-3.5 w-3.5 text-[#C9A96E] flex-shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                  )}
                  <span className="text-xs font-semibold truncate">{phase.name}</span>
                </div>
                {isCurrent && (
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-[#C9A96E] text-white rounded-full px-2 py-0.5 self-start mb-1">
                    Now
                  </span>
                )}
                {/* Vertical-ish bar */}
                <div className="my-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${isCurrent ? 'bg-[#C9A96E]' : isPast ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    style={{ width: `${phase.pct}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-600 mb-1">{phase.done}/{phase.total} done · {phase.pct}%</p>
                <div className="text-[11px] text-gray-500 flex-1 space-y-0.5">
                  {phase.awaiting > 0 && <p className="text-amber-700">{phase.awaiting} awaiting sign-off</p>}
                  {phase.inProgress > 0 && <p className="text-blue-700">{phase.inProgress} in progress</p>}
                  {phase.pending > 0 && <p className="text-gray-500">{phase.pending} pending</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Coming-up roll-up — applies to both layouts */}
        {comingUp.length > 0 && (
          <p className="mt-4 text-xs text-gray-500">
            Coming up next: <span className="font-medium text-gray-700">{comingUp.join(', ')}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Per-phase expansion. Client mode hides assignee names entirely. */
function PhaseTaskList({ phase, audience }: { phase: PhaseSummary; audience: 'gc' | 'client' }) {
  // Client mode: don't list individual task names. Just show summary counts.
  if (audience === 'client') {
    return (
      <div className="mt-3 ml-6 text-xs text-gray-600 space-y-0.5">
        {phase.awaiting > 0 && <p className="text-amber-700">{phase.awaiting} task{phase.awaiting === 1 ? '' : 's'} awaiting GC sign-off</p>}
        {phase.inProgress > 0 && <p>{phase.inProgress} task{phase.inProgress === 1 ? '' : 's'} in progress</p>}
        {phase.pending > 0 && <p>{phase.pending} task{phase.pending === 1 ? '' : 's'} not yet started</p>}
        {phase.done > 0 && <p className="text-emerald-700">{phase.done} task{phase.done === 1 ? '' : 's'} complete</p>}
      </div>
    );
  }
  // GC mode: list tasks with assignee + due date
  return (
    <ul className="mt-3 ml-6 space-y-1">
      {phase.tasks.slice(0, 10).map(t => {
        const status: TaskStatus = normalizeTaskStatus(t.status);
        const name = t.title || t.name || '(untitled task)';
        const who = t.assignedToName || t.assignedSubName || '';
        return (
          <li key={t.id} className="text-xs flex items-start gap-2">
            <span className={`flex-shrink-0 mt-1 inline-block w-1.5 h-1.5 rounded-full ${
              status === 'done' ? 'bg-emerald-500' :
              status === 'awaiting_signoff' ? 'bg-amber-500' :
              status === 'in_progress' ? 'bg-blue-500' :
              status === 'blocked' ? 'bg-red-500' :
              'bg-gray-300'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 truncate">{name}</p>
              {who && <p className="text-gray-500 text-[11px]">{who}</p>}
            </div>
            {t.dueDate && <span className="text-gray-400 text-[11px] flex-shrink-0">{t.dueDate}</span>}
          </li>
        );
      })}
      {phase.tasks.length > 10 && (
        <li className="text-[11px] text-gray-400">+ {phase.tasks.length - 10} more</li>
      )}
    </ul>
  );
}
