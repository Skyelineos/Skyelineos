import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { collection, getDocs, orderBy, query, limit, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { BarChart2, Briefcase, DollarSign, CheckSquare, FileText, ClipboardList, CheckCircle, Receipt, GitPullRequest, AlertTriangle } from 'lucide-react';
import { computeScheduleSlip, getStatusLabel } from '@/lib/projectUtils';

interface KPIs {
  activeProjects: number;
  totalContractValue: number;
  openTasks: number;
  pendingEstimates: number;
  siteLogItems: number;
  resolvedIssues: number;
  unpaidBills: number;
  pendingChangeOrders: number;
  overdueProjects: number;
}

interface OverdueProject {
  id: string;
  name: string;
  status: string;
  daysOverdue: number;
}

interface StatusCount {
  [status: string]: number;
}

interface SiteLogEntry {
  id: string;
  projectName?: string;
  createdByName?: string;
  createdAt?: { toDate: () => Date } | null;
  title?: string;
}

function KpiCard({ label, value, icon: Icon, gold }: { label: string; value: string | number; icon: React.ElementType; gold?: boolean }) {
  return (
    <Card className="border border-gray-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: gold ? '#C9A96E22' : '#6366f111' }}
          >
            <Icon className="w-4 h-4" style={{ color: gold ? '#C9A96E' : '#6366f1' }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-sm text-gray-600 capitalize shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-right text-sm font-medium text-gray-700 shrink-0">{count}</span>
    </div>
  );
}

const PROJECT_COLORS: Record<string, string> = {
  active: '#22c55e',
  completed: '#6366f1',
  planning: '#C9A96E',
  punch_list: '#f59e0b',
  closeout: '#3b82f6',
  on_hold: '#f59e0b',
  cancelled: '#ef4444',
  archived: '#9ca3af',
};

const ESTIMATE_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  sent: '#3b82f6',
  accepted: '#22c55e',
  rejected: '#ef4444',
};

export default function Reports() {
  const { toast } = useToast();
  const [kpis, setKpis] = useState<KPIs>({
    activeProjects: 0,
    totalContractValue: 0,
    openTasks: 0,
    pendingEstimates: 0,
    siteLogItems: 0,
    resolvedIssues: 0,
    unpaidBills: 0,
    pendingChangeOrders: 0,
    overdueProjects: 0,
  });
  const [projectByStatus, setProjectByStatus] = useState<StatusCount>({});
  const [estimateByStatus, setEstimateByStatus] = useState<StatusCount>({});
  const [recentLogs, setRecentLogs] = useState<SiteLogEntry[]>([]);
  const [overdue, setOverdue] = useState<OverdueProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [projSnap, estSnap, taskSnap, logSnap, billSnap, coSnap] = await Promise.all([
          getDocs(collection(db, 'projects')),
          getDocs(collection(db, 'estimates')),
          getDocs(collection(db, 'tasks')),
          getDocs(query(collection(db, 'siteLogs'), orderBy('createdAt', 'desc'), limit(5))),
          getDocs(query(collection(db, 'financials'), where('type', '==', 'bill'))),
          getDocs(collection(db, 'changeOrders')),
        ]);

        let contractValue = 0;
        const pByStatus: StatusCount = {};
        const overdueList: OverdueProject[] = [];
        projSnap.docs.forEach(d => {
          const data = d.data() as { name?: string; status?: string; contractAmount?: number; targetCompletion?: string; estimatedBudget?: number };
          const s = data.status || 'unknown';
          pByStatus[s] = (pByStatus[s] || 0) + 1;
          contractValue += data.contractAmount || data.estimatedBudget || 0;
          const slip = computeScheduleSlip(data.targetCompletion, s, 0);
          if (slip && slip.tone === 'red') {
            overdueList.push({ id: d.id, name: data.name || 'Untitled', status: s, daysOverdue: Math.abs(slip.days) });
          }
        });
        overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue);

        const eByStatus: StatusCount = {};
        estSnap.docs.forEach(d => {
          const s = (d.data() as { status?: string }).status || 'draft';
          eByStatus[s] = (eByStatus[s] || 0) + 1;
        });

        let openTasks = 0;
        taskSnap.docs.forEach(d => {
          const s = (d.data() as { status?: string }).status || '';
          if (s !== 'completed' && s !== 'done') openTasks += 1;
        });

        let resolvedIssues = 0;
        let siteLogItems = 0;
        logSnap.docs.forEach(d => {
          siteLogItems += 1;
          if ((d.data() as { status?: string }).status === 'resolved') resolvedIssues += 1;
        });

        let unpaidBills = 0;
        billSnap.docs.forEach(d => {
          const data = d.data() as { status?: string; amount?: number };
          if (data.status !== 'paid') unpaidBills += data.amount || 0;
        });

        let pendingChangeOrders = 0;
        coSnap.docs.forEach(d => {
          if ((d.data() as { status?: string }).status === 'pending') pendingChangeOrders += 1;
        });

        setKpis({
          activeProjects: pByStatus['active'] || 0,
          totalContractValue: contractValue,
          openTasks,
          pendingEstimates: eByStatus['sent'] || 0,
          siteLogItems,
          resolvedIssues,
          unpaidBills,
          pendingChangeOrders,
          overdueProjects: overdueList.length,
        });
        setProjectByStatus(pByStatus);
        setEstimateByStatus(eByStatus);
        setRecentLogs(logSnap.docs.map(d => ({ id: d.id, ...d.data() } as SiteLogEntry)));
        setOverdue(overdueList);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const maxProj = Math.max(...Object.values(projectByStatus), 1);
  const maxEst = Math.max(...Object.values(estimateByStatus), 1);

  function fmtDate(entry: SiteLogEntry) {
    if (!entry.createdAt) return '—';
    try { return entry.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    catch { return '—'; }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-sm text-gray-500 mt-0.5">Project analytics and performance overview</p>
          </div>
          <Button variant="outline" onClick={() => toast({ title: 'Export coming soon' })} className="gap-2">
            <BarChart2 className="w-4 h-4" /> Export
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading reports…</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <KpiCard label="Active Projects" value={kpis.activeProjects} icon={Briefcase} gold />
              <KpiCard label="Contract Value" value={'$' + (kpis.totalContractValue / 1000).toFixed(0) + 'k'} icon={DollarSign} gold />
              <KpiCard label="Open Tasks" value={kpis.openTasks} icon={CheckSquare} />
              <KpiCard label="Pending Estimates" value={kpis.pendingEstimates} icon={FileText} />
              <KpiCard label="Unpaid Bills" value={'$' + (kpis.unpaidBills / 1000).toFixed(0) + 'k'} icon={Receipt} />
              <KpiCard label="Pending COs" value={kpis.pendingChangeOrders} icon={GitPullRequest} />
              <KpiCard label="Site Log Items" value={kpis.siteLogItems} icon={ClipboardList} />
              <KpiCard label="Resolved Issues" value={kpis.resolvedIssues} icon={CheckCircle} gold />
              <KpiCard label="Overdue Projects" value={kpis.overdueProjects} icon={AlertTriangle} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Projects by Status */}
              <Card className="border border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Projects by Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.keys(projectByStatus).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No project data</p>
                  ) : (
                    Object.entries(projectByStatus).map(([s, c]) => (
                      <BarRow key={s} label={s.replace('_', ' ')} count={c} max={maxProj} color={PROJECT_COLORS[s] || '#9ca3af'} />
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Estimates Pipeline */}
              <Card className="border border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Estimates Pipeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.keys(estimateByStatus).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No estimate data</p>
                  ) : (
                    Object.entries(estimateByStatus).map(([s, c]) => (
                      <BarRow key={s} label={s} count={c} max={maxEst} color={ESTIMATE_COLORS[s] || '#9ca3af'} />
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Schedule Health: overdue projects */}
            {overdue.length > 0 && (
              <Card className="border border-red-200 bg-red-50/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    Schedule Health — Overdue
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-red-100">
                    {overdue.slice(0, 8).map(p => (
                      <a key={p.id} href={`/projects/${p.id}/overview`} className="flex items-center gap-4 px-5 py-3 hover:bg-red-100/40 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                          <p className="text-xs text-gray-500">{getStatusLabel(p.status)}</p>
                        </div>
                        <span className="text-xs font-semibold text-red-700 shrink-0">{p.daysOverdue}d overdue</span>
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Activity */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Recent Site Log Activity</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {recentLogs.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No recent activity</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {recentLogs.map(log => (
                      <div key={log.id} className="flex items-center gap-4 px-5 py-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                          <ClipboardList className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{log.title || 'Site Log Entry'}</p>
                          <p className="text-xs text-gray-400">{log.projectName || '—'} · {log.createdByName || '—'}</p>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">{fmtDate(log)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
