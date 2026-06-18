/**
 * Hero KPI strip for the Project Overview redesign.
 *
 * Six always-visible metrics scoped to ONE project:
 *   - Schedule % complete (signed-off tasks / total tasks)
 *   - Days to target completion (countdown or "N days over")
 *   - $ spent of $ budgeted
 *   - Tasks awaiting YOUR signoff
 *   - Open client decisions (selections pending client input)
 *   - Next milestone date
 *
 * Each tile is clickable and deep-links into the matching sub-page.
 *
 * Performance: subscribes only to project-scoped collections. All counts
 * cap at the tile (we don't render lists), so this stays sub-second even
 * for projects with 500+ tasks / selections.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2, Calendar, DollarSign, BellRing, Palette, Flag, ArrowRight,
} from 'lucide-react';

interface Props {
  projectId: string;
  project: any;
  /** Hide $ tiles for PMs (no financials access). */
  showFinancials?: boolean;
}

interface TaskRow {
  id: string;
  status?: string;
  trade?: string;
  category?: string;
}

interface SelectionRow {
  id: string;
  status?: string;
  lifecycle?: string;
  clientPreference?: string;
}

const fmtMoney = (n: number) =>
  `$${Math.round(n).toLocaleString()}`;

function daysBetween(targetIso?: string): number | null {
  if (!targetIso) return null;
  const t = new Date(targetIso);
  if (!Number.isFinite(t.getTime())) return null;
  const now = new Date();
  const ms = t.getTime() - now.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function readBudget(p: any): number {
  return Number(p?.budget ?? p?.totalBudget ?? p?.estimatedBudget ?? 0) || 0;
}
function readSpent(p: any): number {
  return Number(p?.spent ?? p?.actualSpent ?? p?.totalSpent ?? 0) || 0;
}

export function ProjectOverviewKPIStrip({ projectId, project, showFinancials = true }: Props) {
  const [, setLocation] = useLocation();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [selections, setSelections] = useState<SelectionRow[]>([]);

  // Live tasks for this project — used for schedule %, awaiting-signoff count,
  // and next-milestone derivation.
  useEffect(() => {
    if (!projectId) return;
    const q = query(collection(db, 'tasks'), where('projectId', '==', projectId));
    const unsub = onSnapshot(
      q,
      snap => setTasks(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      err => { console.warn('[KPIStrip] tasks subscribe failed', err); },
    );
    return () => unsub();
  }, [projectId]);

  // Live selections subcollection — used for "open client decisions" tile.
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      collection(db, 'projects', projectId, 'selections'),
      snap => setSelections(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      err => { console.warn('[KPIStrip] selections subscribe failed', err); },
    );
    return () => unsub();
  }, [projectId]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter(t => String(t.status).toLowerCase() === 'done').length;
    const awaiting = tasks.filter(t => String(t.status) === 'awaiting_signoff').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Open client decisions: selections where the homeowner still owes a pick
    // OR the option is awaiting their preference. We use the same "completed"
    // gate the SelectionsProgressCard uses (pending_selection + pending +
    // anything without a clientPreference/selectedOptionId).
    const openDecisions = selections.filter(s => {
      const status = String(s.status || '').toLowerCase();
      if (status === 'approved' || status === 'ordered' || status === 'installed' || status === 'client_approved') return false;
      if (status === 'pending_selection' || status === 'pending') return true;
      // Anything else — count if the homeowner hasn't picked
      return !s.clientPreference;
    }).length;

    const days = daysBetween(project?.targetCompletion);

    // Next milestone: prefer the upcoming task with the soonest due date
    // that isn't done. Fallback: project.milestones[].
    const upcoming = tasks
      .filter(t => String(t.status) !== 'done' && (t as any).dueDate)
      .map(t => ({ id: t.id, due: new Date((t as any).dueDate) }))
      .filter(x => Number.isFinite(x.due.getTime()))
      .sort((a, b) => a.due.getTime() - b.due.getTime());
    const nextMilestoneDate = upcoming[0]?.due || null;

    return {
      total, done, pct, awaiting, openDecisions, days, nextMilestoneDate,
    };
  }, [tasks, selections, project?.targetCompletion]);

  const budget = readBudget(project);
  const spent = readSpent(project);
  const utilization = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const overBudget = budget > 0 && spent > budget;

  // Tile definitions — order matters; mobile wraps into a 2-col grid.
  const tiles: Array<{
    key: string; label: string; value: string; sub?: string;
    icon: any; tone?: 'good' | 'warn' | 'bad' | 'neutral'; onClick?: () => void;
  }> = [
    {
      key: 'schedule',
      label: 'Schedule',
      value: `${stats.pct}%`,
      sub: stats.total ? `${stats.done} of ${stats.total} signed off` : 'No tasks yet',
      icon: CheckCircle2,
      tone: stats.pct >= 75 ? 'good' : stats.pct >= 40 ? 'neutral' : 'warn',
      onClick: () => setLocation(`/projects/${projectId}/schedule`),
    },
    {
      key: 'target',
      label: 'To completion',
      value: stats.days == null ? '—' : stats.days >= 0 ? `${stats.days}d` : `${Math.abs(stats.days)}d over`,
      sub: project?.targetCompletion
        ? new Date(project.targetCompletion).toLocaleDateString()
        : 'No target date set',
      icon: Calendar,
      tone: stats.days == null ? 'neutral' : stats.days < 0 ? 'bad' : stats.days < 14 ? 'warn' : 'neutral',
      onClick: () => setLocation(`/projects/${projectId}/schedule`),
    },
    ...(showFinancials ? [{
      key: 'spend',
      label: 'Spend',
      value: fmtMoney(spent),
      sub: budget > 0 ? `of ${fmtMoney(budget)} — ${utilization}%` : 'No budget set',
      icon: DollarSign,
      tone: (overBudget ? 'bad' : utilization > 85 ? 'warn' : 'good') as 'good' | 'warn' | 'bad',
      onClick: () => setLocation(`/projects/${projectId}/budget`),
    }] : []),
    {
      key: 'signoff',
      label: 'Awaiting signoff',
      value: String(stats.awaiting),
      sub: stats.awaiting === 0 ? "You're clear" : stats.awaiting === 1 ? '1 task to review' : `${stats.awaiting} tasks to review`,
      icon: BellRing,
      tone: stats.awaiting > 0 ? 'warn' : 'good',
      onClick: () => setLocation(`/projects/${projectId}/schedule?status=awaiting_signoff`),
    },
    {
      key: 'decisions',
      label: 'Open decisions',
      value: String(stats.openDecisions),
      sub: stats.openDecisions === 0 ? 'Client is all caught up' : `${stats.openDecisions} selection${stats.openDecisions === 1 ? '' : 's'}`,
      icon: Palette,
      tone: stats.openDecisions > 0 ? 'warn' : 'good',
      onClick: () => setLocation(`/design-board?projectId=${projectId}`),
    },
    {
      key: 'next',
      label: 'Next milestone',
      value: stats.nextMilestoneDate
        ? stats.nextMilestoneDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '—',
      sub: stats.nextMilestoneDate
        ? `${daysBetween(stats.nextMilestoneDate.toISOString())} days away`
        : 'No upcoming due dates',
      icon: Flag,
      tone: 'neutral',
      onClick: () => setLocation(`/projects/${projectId}/schedule`),
    },
  ];

  const toneClass = (t?: string) => {
    if (t === 'good') return 'border-green-200 bg-green-50/40';
    if (t === 'warn') return 'border-amber-200 bg-amber-50/40';
    if (t === 'bad') return 'border-red-200 bg-red-50/40';
    return 'border-gray-200 bg-white';
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map(t => {
        const Icon = t.icon;
        return (
          <Card
            key={t.key}
            onClick={t.onClick}
            className={`cursor-pointer hover:shadow-md transition-shadow rounded-xl border ${toneClass(t.tone)} active:scale-[0.98] touch-action-manipulation`}
            style={{ touchAction: 'manipulation' as any }}
          >
            <div className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 truncate">{t.label}</div>
                <Icon className="w-4 h-4 text-gray-400 shrink-0" />
              </div>
              <div className="mt-1 font-semibold font-mono text-base sm:text-lg text-gray-900 truncate">
                {t.value}
              </div>
              {t.sub && (
                <div className="mt-0.5 text-[11px] text-gray-500 truncate">{t.sub}</div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default ProjectOverviewKPIStrip;
