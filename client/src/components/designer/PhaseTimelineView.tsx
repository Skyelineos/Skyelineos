import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query as fsQuery } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PHASES, PHASE_ORDER, type BuildPhase } from '@/data/selectionsTemplate';
import { AlertCircle, Clock, CheckCircle2, Circle } from 'lucide-react';

interface Props {
  projectId: string;
  /** Optional: today's date for "what's overdue" calculations. Defaults to now. */
  asOf?: Date;
  /** Optional: the project's planned start date for each phase, used to flag overdue */
  phaseDeadlines?: Partial<Record<BuildPhase, Date>>;
}

interface SelectionDoc {
  id: string;
  category: string;
  subcategory?: string;
  room: string;
  item: string;
  phase: BuildPhase;
  decisionOwner: string;
  status: string;
  allowanceAmount?: number | null;
  actualCost?: number | null;
}

const TERMINAL_STATUSES = new Set(['Selected', 'Ordered', 'Received', 'Installed']);

/**
 * Phase Timeline — designer/builder dashboard view.
 * Shows, per phase: how many selections are locked, how many are in progress,
 * how many are overdue (past the phase's deadline and not locked), and total
 * allowance vs actual spend.
 */
export default function PhaseTimelineView({ projectId, asOf = new Date(), phaseDeadlines = {} }: Props) {
  const { data: selections = [], isLoading } = useQuery<SelectionDoc[]>({
    queryKey: ['project-selections', projectId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'projects', projectId, 'selections'));
      return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    },
  });

  const byPhase = useMemo(() => {
    const map: Record<BuildPhase, SelectionDoc[]> = {} as any;
    PHASES.forEach(p => (map[p] = []));
    selections.forEach(s => {
      if (PHASE_ORDER[s.phase] !== undefined) map[s.phase].push(s);
    });
    return map;
  }, [selections]);

  if (isLoading) return <div className="text-sm text-muted-foreground p-6">Loading selections timeline…</div>;
  if (selections.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No selections yet on this project. Use <strong>Seed standard selections</strong> to get started.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {PHASES.map(phase => {
        const items = byPhase[phase];
        if (!items.length) return null;
        const locked = items.filter(i => TERMINAL_STATUSES.has(i.status)).length;
        const inProgress = items.filter(i => i.status === 'In Discussion').length;
        const notStarted = items.filter(i => i.status === 'Not Started').length;
        const deadline = phaseDeadlines[phase];
        const overdue = deadline && deadline < asOf
          ? items.filter(i => !TERMINAL_STATUSES.has(i.status)).length
          : 0;
        const allowance = items.reduce((s, i) => s + (i.allowanceAmount || 0), 0);
        const actual = items.reduce((s, i) => s + (i.actualCost || 0), 0);
        const pct = items.length ? Math.round((locked / items.length) * 100) : 0;

        return (
          <Card key={phase} data-testid={`phase-${phase}`}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  {pct === 100 ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                  {phase}
                </span>
                <span className="flex items-center gap-2">
                  {overdue > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="w-3 h-3" /> {overdue} overdue
                    </Badge>
                  )}
                  {deadline && (
                    <Badge variant="outline" className="gap-1">
                      <Clock className="w-3 h-3" /> locks {deadline.toLocaleDateString()}
                    </Badge>
                  )}
                  <Badge>{locked} / {items.length} locked</Badge>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={pct} />
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span><strong className="text-foreground">{notStarted}</strong> not started</span>
                <span><strong className="text-foreground">{inProgress}</strong> in discussion</span>
                <span><strong className="text-foreground">{locked}</strong> locked</span>
                {allowance > 0 && (
                  <span className="ml-auto">
                    Allowance <strong className="text-foreground">${allowance.toLocaleString()}</strong>
                    {' · '}
                    Spent <strong className={actual > allowance ? 'text-destructive' : 'text-foreground'}>${actual.toLocaleString()}</strong>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
