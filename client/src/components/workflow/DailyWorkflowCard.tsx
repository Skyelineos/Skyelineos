// DailyWorkflowCard — Tyler's morning digest for a single project.
//
// Shows: phase, today's tasks (with status pills), materials needing action
// (color-coded by status), subs expected on site today, and any escalations.
//
// Data source: GET /api/projects/:id/daily-workflow (see
// functions/src/tasks/dailyWorkflowRoute.ts).

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, Phone, Truck, Hammer, RefreshCw } from 'lucide-react';
import { authFetch } from '@/lib/authFetch';

// ── Types (mirror dailyWorkflowRoute.ts response) ────────────────────────────
type TaskStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked';
type MaterialStatus = 'NEEDED' | 'ORDERED' | 'CONFIRMED' | 'DELIVERED' | 'DELAYED';

interface DailyWorkflow {
  projectId: string;
  projectName: string;
  date: string;
  phase: string;
  tasksToday: Array<{
    id: string;
    task: string;
    assignedTo: string;
    status: TaskStatus;
    trade: string;
  }>;
  materialsNeedingAction: Array<{
    id: string;
    material: string;
    status: MaterialStatus;
    vendor: string;
    action: string;
  }>;
  escalations: string[];
  subsScheduledToday: Array<{ name: string; trade: string; phone: string }>;
  overdueItems: string[];
}

// ── Color helpers ────────────────────────────────────────────────────────────
function taskStatusVariant(s: TaskStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'complete') return 'default';
  if (s === 'in_progress') return 'secondary';
  if (s === 'blocked') return 'destructive';
  return 'outline';
}

function taskStatusLabel(s: TaskStatus): string {
  if (s === 'not_started') return 'Not started';
  if (s === 'in_progress') return 'In progress';
  if (s === 'complete') return 'Done';
  if (s === 'blocked') return 'Blocked';
  return s;
}

function materialColorClass(s: MaterialStatus): string {
  // Green = delivered, yellow = ordered/confirmed, red = needed/delayed.
  // Matches the construction-yard mental model — Tyler scans this list fast.
  if (s === 'DELIVERED') return 'bg-green-100 text-green-900 border-green-300';
  if (s === 'CONFIRMED') return 'bg-amber-100 text-amber-900 border-amber-300';
  if (s === 'ORDERED') return 'bg-yellow-100 text-yellow-900 border-yellow-300';
  if (s === 'DELAYED') return 'bg-red-100 text-red-900 border-red-300';
  if (s === 'NEEDED') return 'bg-red-50 text-red-800 border-red-200';
  return 'bg-gray-100 text-gray-900 border-gray-300';
}

function prettyPhase(phase: string): string {
  return phase
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Component ────────────────────────────────────────────────────────────────
export interface DailyWorkflowCardProps {
  projectId: string;
  // Optional preloaded workflow (for the multi-project page that fetches in
  // bulk). If absent, the card fetches its own data.
  initialWorkflow?: DailyWorkflow;
}

export function DailyWorkflowCard({ projectId, initialWorkflow }: DailyWorkflowCardProps) {
  const [workflow, setWorkflow] = useState<DailyWorkflow | null>(initialWorkflow || null);
  const [loading, setLoading] = useState(!initialWorkflow);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/projects/${projectId}/daily-workflow`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setWorkflow(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load workflow');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialWorkflow) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error || !workflow) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" /> {error || 'No data'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full" data-testid={`daily-workflow-${workflow.projectId}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{workflow.projectName}</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              {prettyPhase(workflow.phase)} · {workflow.date}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={load} aria-label="Refresh">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Escalations — most urgent, top of card */}
        {workflow.escalations.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 mb-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Escalations
            </div>
            <ul className="space-y-1">
              {workflow.escalations.map((e, i) => (
                <li
                  key={i}
                  className="text-sm border-l-2 border-red-400 pl-2 py-0.5 bg-red-50 rounded-r"
                >
                  {e}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Overdue */}
        {workflow.overdueItems.length > 0 && (
          <section>
            <div className="text-xs font-semibold text-amber-800 mb-1.5">Overdue</div>
            <ul className="space-y-0.5">
              {workflow.overdueItems.map((o, i) => (
                <li key={i} className="text-sm text-amber-900">
                  • {o}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Today's tasks */}
        <section>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
            <Hammer className="h-3.5 w-3.5" /> Today's tasks
          </div>
          {workflow.tasksToday.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">Nothing scheduled today</div>
          ) : (
            <ul className="space-y-1.5">
              {workflow.tasksToday.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.task}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.trade.toLowerCase()} · {t.assignedTo}
                    </div>
                  </div>
                  <Badge variant={taskStatusVariant(t.status)} className="shrink-0">
                    {taskStatusLabel(t.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Materials */}
        <section>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
            <Truck className="h-3.5 w-3.5" /> Materials
          </div>
          {workflow.materialsNeedingAction.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">All caught up</div>
          ) : (
            <ul className="space-y-1.5">
              {workflow.materialsNeedingAction.map((m) => (
                <li
                  key={m.id}
                  className={`text-sm border rounded px-2 py-1.5 ${materialColorClass(m.status)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">{m.material}</div>
                    <span className="text-xs font-semibold uppercase shrink-0">
                      {m.status}
                    </span>
                  </div>
                  <div className="text-xs mt-0.5">
                    {m.vendor ? `${m.vendor} — ` : ''}
                    {m.action}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Subs on site today */}
        <section>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
            <Phone className="h-3.5 w-3.5" /> Subs expected today
          </div>
          {workflow.subsScheduledToday.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No subs scheduled</div>
          ) : (
            <ul className="space-y-1">
              {workflow.subsScheduledToday.map((s, i) => (
                <li key={`${s.name}-${i}`} className="text-sm flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({s.trade.toLowerCase()})
                  </span>
                  {s.phone && (
                    <a
                      href={`tel:${s.phone}`}
                      className="text-xs text-blue-600 hover:underline ml-auto"
                    >
                      {s.phone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

export default DailyWorkflowCard;
