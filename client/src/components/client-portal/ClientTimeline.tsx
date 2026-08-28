/**
 * ClientTimeline — Pillar 2: Timeline Clarity
 *
 * A premium homeowner-facing timeline that gives crystal-clear answers to:
 *   "Where are we right now?"
 *   "When will we be done?"
 *   "What just happened on my home?"
 *
 * Data sources:
 *   - Project doc (currentPhase, progress, startDate, estimatedCompletion)
 *   - Tasks collection (per-phase milestone progress)
 *   - Decisions collection (recent client-visible progress updates from GC)
 *   - EstimatedSchedule phases (if GC has published one)
 */

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  CheckCircle2,
  Clock,
  Circle,
  Calendar,
  Construction,
  ChevronDown,
  ChevronUp,
  Flag,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { CLIENT_PHASES } from '@/lib/clientPhases';
import { normalizeTaskStatus } from '@/lib/taskStatus';
import type { GeneratedSchedule, ScheduledPhase } from '@/lib/schedule/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectData {
  name?: string;
  currentPhase?: string;
  progress?: number;
  startDate?: string;
  estimatedCompletion?: string;
  actualCompletion?: string;
  estimatedSchedule?: GeneratedSchedule;
  estimatedSchedulePublishedAt?: any;
}

interface TaskDoc {
  id: string;
  phase?: string;
  category?: string;
  status?: string;
}

interface UpdateItem {
  id: string;
  title?: string;
  summary?: string;
  kind?: string;
  createdAt?: any;
  createdByName?: string;
}

interface MilestoneStatus {
  phase: string;
  status: 'done' | 'active' | 'upcoming';
  targetDate?: string;
  phasePct?: number;
  total?: number;
  done?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function fmtDateShort(iso: string | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function fmtRelative(ts: any): string {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function daysUntil(iso: string | undefined): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / 86400000);
}

function phaseIconFor(kind?: string) {
  switch (kind) {
    case 'selection':     return Sparkles;
    case 'change_order':  return BookOpen;
    case 'approval':      return CheckCircle2;
    default:              return BookOpen;
  }
}

// ─── Milestone Row ────────────────────────────────────────────────────────────

function MilestoneRow({
  milestone,
  isLast,
}: {
  milestone: MilestoneStatus;
  isLast: boolean;
}) {
  const { phase, status, targetDate, phasePct, total, done } = milestone;

  const icon = (() => {
    if (status === 'done')    return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
    if (status === 'active')  return <Clock className="w-5 h-5" style={{ color: '#C9A96E' }} />;
    return <Circle className="w-5 h-5 text-gray-300" />;
  })();

  const connectorColor =
    status === 'done' ? 'bg-emerald-400' :
    status === 'active' ? 'bg-gradient-to-b from-[#C9A96E] to-gray-200' :
    'bg-gray-200';

  return (
    <div className="flex gap-4">
      {/* Connector + icon column */}
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 flex-shrink-0"
          style={{
            borderColor: status === 'done' ? '#10b981' : status === 'active' ? '#C9A96E' : '#e5e7eb',
            backgroundColor: status === 'done' ? '#ecfdf5' : status === 'active' ? 'rgba(201,169,110,0.08)' : '#f9fafb',
          }}>
          {icon}
        </div>
        {!isLast && (
          <div className={`w-0.5 flex-1 mt-1 min-h-[32px] ${connectorColor}`} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-8 min-w-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`font-semibold text-sm ${
                status === 'done' ? 'text-gray-500 line-through-none' :
                status === 'active' ? 'text-gray-900' :
                'text-gray-400'
              }`}
              style={status === 'active' ? { fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', fontWeight: 700 } : {}}>
                {phase}
              </h3>
              {status === 'active' && (
                <span className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2.5 py-0.5"
                  style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
                  Now
                </span>
              )}
              {status === 'done' && (
                <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
                  Complete
                </span>
              )}
            </div>
            {/* Task progress bar for active/upcoming with tasks */}
            {(status === 'active' || status === 'done') && typeof total === 'number' && total > 0 && (
              <div className="mt-2">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <span>{done} of {total} tasks complete</span>
                  {typeof phasePct === 'number' && <span>· {phasePct}%</span>}
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-48">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${phasePct ?? 0}%`,
                      backgroundColor: status === 'done' ? '#10b981' : '#C9A96E',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          {/* Target date */}
          {targetDate && (
            <p className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
              {status === 'done' ? 'Completed' : 'Target:'} {fmtDateShort(targetDate)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ClientTimelineProps {
  projectId: string;
}

export default function ClientTimeline({ projectId }: ClientTimelineProps) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatesExpanded, setUpdatesExpanded] = useState(false);

  // Project doc
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      doc(db, 'projects', projectId),
      snap => {
        setProject(snap.exists() ? (snap.data() as ProjectData) : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [projectId]);

  // Tasks (for milestone progress)
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(collection(db, 'tasks'), where('projectId', '==', projectId)),
      snap => setTasks(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      () => {}
    );
    return unsub;
  }, [projectId]);

  // Recent client-visible decisions/updates from GC
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'decisions'),
        where('projectId', '==', projectId),
        where('visibility', '==', 'client-visible'),
        orderBy('createdAt', 'desc'),
        limit(5)
      ),
      snap => setUpdates(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      () => {}
    );
    return unsub;
  }, [projectId]);

  // ── Compute milestone list ─────────────────────────────────────────────────

  // Per-phase task rollup (map canonical CLIENT_PHASES names loosely)
  const tasksByPhase = useMemo(() => {
    const byPhase: Record<string, { total: number; done: number }> = {};
    for (const t of tasks) {
      const raw = (t.phase || t.category || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      // Try to match to CLIENT_PHASES
      let matched: string | undefined;
      for (const cp of CLIENT_PHASES) {
        if (cp.toLowerCase().replace(/[^a-z0-9]/g, '') === raw) {
          matched = cp;
          break;
        }
      }
      const ph = matched || (t.phase || t.category || 'Other');
      if (!byPhase[ph]) byPhase[ph] = { total: 0, done: 0 };
      byPhase[ph].total++;
      if (normalizeTaskStatus(t.status) === 'done') byPhase[ph].done++;
    }
    return byPhase;
  }, [tasks]);

  // Build milestone data from estimatedSchedule phases (if published) or fallback to CLIENT_PHASES
  const milestones = useMemo<MilestoneStatus[]>(() => {
    const currentPhase = project?.currentPhase || '';
    const currentIdx = CLIENT_PHASES.indexOf(currentPhase);

    // Use estimatedSchedule phases for target dates if available
    const schedPhases: Record<string, ScheduledPhase> = {};
    if (project?.estimatedSchedule?.phases) {
      for (const sp of project.estimatedSchedule.phases) {
        schedPhases[sp.phase] = sp;
      }
    }

    return CLIENT_PHASES.map((phase, i): MilestoneStatus => {
      const status: 'done' | 'active' | 'upcoming' =
        currentIdx >= 0
          ? i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'upcoming'
          : 'upcoming';

      const taskData = tasksByPhase[phase];
      const total = taskData?.total;
      const done = taskData?.done;
      const phasePct = (typeof total === 'number' && total > 0)
        ? Math.round((done! / total) * 100)
        : undefined;

      // Best-effort target date from schedule phases
      let targetDate: string | undefined;
      for (const [key, sp] of Object.entries(schedPhases)) {
        if (key.toLowerCase().includes(phase.toLowerCase()) ||
            phase.toLowerCase().includes(key.toLowerCase())) {
          targetDate = status === 'done' ? sp.endDate : sp.startDate;
          break;
        }
      }

      return { phase, status, targetDate, phasePct, total, done };
    });
  }, [project, tasksByPhase]);

  const currentPhase = project?.currentPhase;
  const currentIdx = currentPhase ? CLIENT_PHASES.indexOf(currentPhase) : -1;
  const progress = project?.progress ?? 0;
  const estCompletion = project?.estimatedCompletion;
  const daysLeft = daysUntil(estCompletion);
  const completed = !!project?.actualCompletion;

  // Timeline progress percentage (calendar-based)
  let timelinePct = 0;
  if (project?.startDate && estCompletion) {
    const start = new Date(project.startDate).getTime();
    const end = new Date(estCompletion).getTime();
    timelinePct = Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: '#C9A96E' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Current Phase Banner ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
        style={{ background: 'linear-gradient(135deg, #1b1b1b 0%, #2d2519 100%)' }}>
        {/* Decorative glow */}
        <div className="pointer-events-none absolute -top-8 -right-8 w-48 h-48 rounded-full blur-3xl opacity-30"
          style={{ backgroundColor: '#C9A96E' }} />

        <div className="relative">
          {completed ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-gray-400 uppercase tracking-widest">Build Complete</p>
                <p className="font-heading text-3xl sm:text-4xl font-bold text-white mt-0.5">
                  Congratulations! 🏠
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  Completed {fmtDate(project?.actualCompletion)}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium uppercase tracking-widest mb-2"
                    style={{ color: '#C9A96E' }}>
                    Currently Underway
                  </p>
                  <div className="flex items-center gap-3">
                    <Construction className="w-6 h-6 text-white flex-shrink-0" />
                    <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white">
                      {currentPhase || 'Pre-Construction'}
                    </h2>
                  </div>
                  {currentIdx >= 0 && (
                    <p className="text-sm text-gray-400 mt-2">
                      Phase {currentIdx + 1} of {CLIENT_PHASES.length}
                      {progress > 0 ? ` · ${progress}% overall complete` : ''}
                    </p>
                  )}
                </div>

                {/* Completion date card */}
                {estCompletion && (
                  <div className="rounded-xl p-4 flex-shrink-0"
                    style={{ backgroundColor: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.3)' }}>
                    <p className="text-xs font-medium uppercase tracking-wider mb-1"
                      style={{ color: '#C9A96E' }}>
                      Est. Completion
                    </p>
                    <p className="font-heading text-xl font-bold text-white leading-tight">
                      {fmtDate(estCompletion)}
                    </p>
                    {daysLeft !== null && (
                      <p className="text-xs mt-1"
                        style={{ color: daysLeft < 0 ? '#f87171' : daysLeft <= 30 ? '#fbbf24' : '#9ca3af' }}>
                        {daysLeft < 0
                          ? `${Math.abs(daysLeft)} days past estimate`
                          : daysLeft === 0
                          ? 'Today!'
                          : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} away`}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Overall progress bar */}
              {progress > 0 && (
                <div className="mt-5">
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progress}%`, backgroundColor: '#C9A96E' }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1.5">
                    <span>{project?.startDate ? fmtDateShort(project.startDate) : 'Start'}</span>
                    <span style={{ color: '#C9A96E' }}>{progress}%</span>
                    <span>{estCompletion ? fmtDateShort(estCompletion) : 'Completion'}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Vertical Milestone Timeline ──────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-6">
          <Calendar className="w-5 h-5" style={{ color: '#C9A96E' }} />
          <h2 className="font-heading text-xl font-bold text-gray-900">Build Milestones</h2>
        </div>

        <div>
          {milestones.map((m, i) => (
            <MilestoneRow
              key={m.phase}
              milestone={m}
              isLast={i === milestones.length - 1}
            />
          ))}
        </div>

        {/* Published schedule note */}
        {project?.estimatedSchedule && (
          <div className="mt-2 pt-4 border-t border-gray-100">
            {(() => {
              const at = project.estimatedSchedulePublishedAt;
              const ms = at?.toMillis?.() ?? (at ? Date.parse(at) : NaN);
              return Number.isFinite(ms) ? (
                <p className="text-xs text-gray-400">
                  Schedule published{' '}
                  {new Date(ms).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </p>
              ) : null;
            })()}
          </div>
        )}
      </div>

      {/* ── Projected Completion ─────────────────────────────────────────── */}
      {estCompletion && !completed && (
        <div className="rounded-2xl border p-6 flex items-center gap-4"
          style={{ borderColor: 'rgba(201,169,110,0.4)', backgroundColor: '#FAFAF6' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(201,169,110,0.12)' }}>
            <Flag className="w-7 h-7" style={{ color: '#C9A96E' }} />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">
              Projected Completion
            </p>
            <p className="font-heading text-2xl sm:text-3xl font-bold"
              style={{ color: '#141414' }}>
              {fmtDate(estCompletion)}
            </p>
            {daysLeft !== null && daysLeft > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                {daysLeft} days from today
              </p>
            )}
            {daysLeft !== null && daysLeft < 0 && (
              <p className="text-sm text-red-500 mt-0.5">
                {Math.abs(daysLeft)} days past original estimate — check with your GC
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Recent Progress Updates ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <button
          type="button"
          className="flex items-center justify-between w-full"
          onClick={() => setUpdatesExpanded(v => !v)}
          aria-expanded={updatesExpanded || updates.length > 0}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{ color: '#C9A96E' }} />
            <h2 className="font-heading text-xl font-bold text-gray-900">Recent Updates</h2>
            {updates.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(201,169,110,0.15)', color: '#8a6a3a' }}>
                {updates.length}
              </span>
            )}
          </div>
          {updates.length > 0 && (
            updatesExpanded
              ? <ChevronUp className="w-4 h-4 text-gray-400" />
              : <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {updates.length === 0 ? (
          <div className="mt-4 text-center py-6">
            <Sparkles className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              Progress updates from your GC will appear here.
            </p>
          </div>
        ) : (
          <div className={`mt-4 space-y-3 ${!updatesExpanded ? 'max-h-[300px] overflow-hidden' : ''}`}>
            {updates.map(u => {
              const Icon = phaseIconFor(u.kind);
              return (
                <div key={u.id}
                  className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: 'rgba(201,169,110,0.12)' }}>
                    <Icon className="w-4 h-4" style={{ color: '#C9A96E' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{u.title || 'Update'}</p>
                    {u.summary && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{u.summary}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {fmtRelative(u.createdAt)}
                      {u.createdByName ? ` · ${u.createdByName}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
            {!updatesExpanded && updates.length > 2 && (
              <button
                type="button"
                onClick={() => setUpdatesExpanded(true)}
                className="w-full text-sm font-medium py-2 text-center"
                style={{ color: '#8a6a3a' }}>
                Show all {updates.length} updates
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
