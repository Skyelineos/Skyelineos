import React from 'react';
import { useLocation } from 'wouter';
import { Palette, AlertCircle, Clock, CheckCircle2, ChevronRight } from 'lucide-react';
import { useSelectionsSummary, PhaseDeadlines } from '@/hooks/useSelectionsSummary';

interface Props {
  projectId: string;
  phaseDeadlines?: PhaseDeadlines;
  /** Override the tab destination (defaults to /client-portal/selections) */
  navigateTo?: string;
}

/**
 * Selections Needed dashboard tile — lives on the client main dashboard.
 *
 * Renders a red counter for items awaiting client decision, a yellow counter
 * for overdue items, and a "next up" preview. Tapping the tile takes the
 * client to the full Selections view.
 *
 * Matches the visual rhythm of Skyeline's existing client dashboard cards
 * (rounded-2xl, gold accent on hover, BC-friendly tap target).
 */
export default function SelectionsNeededTile({
  projectId,
  phaseDeadlines,
  navigateTo = '/client-portal/selections',
}: Props) {
  const [, navigate] = useLocation();
  const s = useSelectionsSummary(projectId, phaseDeadlines);

  const awaitingCount = s.awaitingClient;
  const overdueCount = s.overdue;
  const dueThisWeekCount = s.dueThisWeek;

  // Tile state determines accent color
  const isUrgent = overdueCount > 0;
  const isActive = awaitingCount > 0;

  const accent = isUrgent
    ? 'border-red-300 ring-red-100 bg-red-50/50'
    : isActive
    ? 'border-[#C9A96E] ring-[#C9A96E]/15 bg-[#FBF7EE]'
    : 'border-gray-200 bg-white';

  const headerColor = isUrgent ? 'text-red-700' : isActive ? 'text-[#8a6a3a]' : 'text-gray-700';

  if (s.loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 animate-pulse">
        <div className="h-5 w-32 bg-gray-200 rounded mb-3"></div>
        <div className="h-10 w-20 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate(navigateTo)}
      aria-label="View selections needed"
      className={`group relative w-full text-left rounded-2xl border ${accent} hover:ring-4 transition-all p-6 focus:outline-none focus-visible:ring-4`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Palette className={`w-5 h-5 ${headerColor}`} />
          <h3 className={`text-sm font-semibold uppercase tracking-wide ${headerColor}`}>
            Selections Needed
          </h3>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
      </div>

      {/* Primary counter */}
      <div className="flex items-baseline gap-3 mb-4">
        <div className={`text-5xl font-bold tabular-nums ${isUrgent ? 'text-red-700' : isActive ? 'text-[#8a6a3a]' : 'text-gray-900'}`}>
          {awaitingCount}
        </div>
        <div className="text-sm text-gray-600">
          {awaitingCount === 1 ? 'decision' : 'decisions'} waiting on you
        </div>
      </div>

      {/* Sub-counters */}
      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-gray-200/60">
        <Stat
          icon={<AlertCircle className="w-3.5 h-3.5" />}
          label="Overdue"
          value={overdueCount}
          tone={overdueCount > 0 ? 'red' : 'muted'}
        />
        <Stat
          icon={<Clock className="w-3.5 h-3.5" />}
          label="Due ≤ 7 days"
          value={dueThisWeekCount}
          tone={dueThisWeekCount > 0 ? 'amber' : 'muted'}
        />
        <Stat
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          label="Approved"
          value={s.approved}
          tone="green"
        />
      </div>

      {/* Next up preview */}
      {s.nextDue && (
        <div className="mt-4 pt-4 border-t border-gray-200/60">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Up next</p>
          <p className="text-sm font-medium text-gray-900 truncate">{s.nextDue.item}</p>
          <p className="text-xs text-gray-500">
            {s.nextDue.room}
            {s.nextDue.dueDate && ` · due ${formatDate(s.nextDue.dueDate)}`}
          </p>
        </div>
      )}

      {/* Empty state */}
      {awaitingCount === 0 && overdueCount === 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200/60 flex items-center gap-2 text-sm text-gray-500">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span>You&rsquo;re all caught up</span>
        </div>
      )}
    </button>
  );
}

function Stat({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: 'red' | 'amber' | 'green' | 'muted' }) {
  const colors = {
    red: 'text-red-700',
    amber: 'text-amber-700',
    green: 'text-green-700',
    muted: 'text-gray-500',
  }[tone];
  return (
    <div>
      <div className={`flex items-center gap-1 ${colors}`}>
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-semibold tabular-nums mt-0.5 ${tone === 'muted' ? 'text-gray-400' : 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  );
}

function formatDate(d: Date): string {
  const now = new Date();
  const days = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
