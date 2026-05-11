import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  collection, getDocs, onSnapshot, orderBy, query, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calculator, FileText, GitPullRequest, TrendingUp, ArrowRight, Plus, DollarSign,
} from 'lucide-react';

interface Props {
  projectId: string;
  projectName?: string;
  // Actuals from the project doc — falls back to 0 if missing.
  spent?: number;
}

interface EstimateRow {
  id: string;
  title?: string;
  total?: number;
  status?: string;
  pipelineStage?: string;
  markup?: number;
  createdAt?: any;
}

interface CORow {
  id: string;
  title?: string;
  amount?: number;
  status?: string;
}

const fmt = (n: number) =>
  `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function ProjectFinancialsCard({ projectId, projectName, spent = 0 }: Props) {
  const [, setLocation] = useLocation();
  const [estimate, setEstimate] = useState<EstimateRow | null>(null);
  const [allEstimates, setAllEstimates] = useState<EstimateRow[]>([]);
  const [changeOrders, setChangeOrders] = useState<CORow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'estimates'),
          where('projectId', '==', projectId),
        ));
        if (cancelled) return;
        const rows: EstimateRow[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        // Pick the most recent by createdAt (Firestore timestamps sort fine).
        rows.sort((a, b) => {
          const at = (a.createdAt?.toMillis?.() ?? 0);
          const bt = (b.createdAt?.toMillis?.() ?? 0);
          return bt - at;
        });
        setAllEstimates(rows);
        setEstimate(rows[0] || null);
      } catch {
        setEstimate(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Live subscription to change orders for this project so the totals update
  // as you approve / reject COs.
  useEffect(() => {
    if (!projectId) return;
    const q = query(collection(db, 'changeOrders'), where('projectId', '==', projectId));
    const unsub = onSnapshot(q, snap => {
      setChangeOrders(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    }, () => {});
    return () => unsub();
  }, [projectId]);

  const estimateTotal = Number(estimate?.total || 0);
  // Approved change orders contribute to revenue. Pending/rejected are tracked separately.
  const approvedCOAmount = changeOrders
    .filter(c => String(c.status || '').toLowerCase() === 'approved')
    .reduce((s, c) => s + Number(c.amount || 0), 0);
  const pendingCOAmount = changeOrders
    .filter(c => {
      const s = String(c.status || '').toLowerCase();
      return s === 'pending' || s === '' || s === 'submitted';
    })
    .reduce((s, c) => s + Number(c.amount || 0), 0);
  const contractAmount = estimateTotal + approvedCOAmount;
  const projectedProfit = contractAmount - spent;
  const profitPct = contractAmount > 0 ? (projectedProfit / contractAmount) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Financials
            </CardTitle>
            <CardDescription>
              Estimate + change orders + spent — at a glance.
            </CardDescription>
          </div>
          {estimate ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation(`/estimates?openEstimate=${estimate.id}`)}
              className="gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              Open Estimate
              <ArrowRight className="w-3 h-3" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setLocation(`/estimates?newForProject=${projectId}&projectName=${encodeURIComponent(projectName || '')}`)}
              className="gap-1.5 text-white"
              style={{ backgroundColor: '#C9A96E' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Create Estimate
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : !estimate ? (
          <div className="border border-dashed rounded-lg p-4 text-center bg-amber-50 border-amber-200">
            <Calculator className="w-6 h-6 text-amber-600 mx-auto mb-1.5" />
            <p className="text-sm font-medium text-amber-900">No estimate attached yet</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Create one for {projectName || 'this project'} to track contract value, change orders, and profit.
            </p>
            <Button
              size="sm"
              className="mt-3 gap-1.5 text-white"
              style={{ backgroundColor: '#C9A96E' }}
              onClick={() => setLocation(`/estimates?newForProject=${projectId}&projectName=${encodeURIComponent(projectName || '')}`)}
            >
              <Plus className="w-3.5 h-3.5" />
              Create Estimate
            </Button>
          </div>
        ) : (
          <>
            {/* Stat tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Estimate" value={fmt(estimateTotal)} sub={estimate.title || 'Active estimate'} />
              <Stat label="Approved COs" value={fmt(approvedCOAmount)} sub={`${changeOrders.filter(c => String(c.status || '').toLowerCase() === 'approved').length} approved`} />
              <Stat label="Contract Amount" value={fmt(contractAmount)} sub="Estimate + approved COs" tone="primary" />
              <Stat label="Projected Profit" value={fmt(projectedProfit)} sub={`${profitPct.toFixed(1)}% margin`} tone={projectedProfit >= 0 ? 'good' : 'bad'} />
            </div>

            {/* Spent vs contract */}
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Spent to date</span>
                <span className="font-mono font-medium">{fmt(spent)}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded mt-2 overflow-hidden">
                <div
                  className={`h-full ${spent > contractAmount ? 'bg-red-500' : spent / Math.max(contractAmount, 1) > 0.85 ? 'bg-amber-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(100, contractAmount > 0 ? (spent / contractAmount) * 100 : 0)}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                {contractAmount > 0
                  ? `${((spent / contractAmount) * 100).toFixed(0)}% of contract`
                  : 'No contract amount yet'}
              </p>
            </div>

            {/* Change order block */}
            {changeOrders.length > 0 && (
              <div className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <GitPullRequest className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-medium">Change Orders</span>
                    <Badge variant="secondary" className="text-[10px]">{changeOrders.length}</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1 h-7"
                    onClick={() => setLocation('/change-orders')}
                  >
                    View all
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
                <div className="text-xs text-gray-600 grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-gray-400 uppercase tracking-wide text-[10px]">Approved</p>
                    <p className="font-mono font-medium text-green-700">{fmt(approvedCOAmount)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 uppercase tracking-wide text-[10px]">Pending</p>
                    <p className="font-mono font-medium text-amber-700">{fmt(pendingCOAmount)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 uppercase tracking-wide text-[10px]">Net Impact</p>
                    <p className="font-mono font-medium">{approvedCOAmount >= 0 ? '+' : ''}{fmt(approvedCOAmount)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Quick links to other financial views for this project */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setLocation(`/projects/${projectId}/budget`)}>
                <TrendingUp className="w-3.5 h-3.5" /> Budget vs Actual
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setLocation('/bills')}>
                <FileText className="w-3.5 h-3.5" /> Bills
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setLocation('/finance')}>
                <DollarSign className="w-3.5 h-3.5" /> Finance Hub
              </Button>
              {allEstimates.length > 1 && (
                <span className="text-[11px] text-gray-400 self-center ml-auto">
                  {allEstimates.length} estimates on this project
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'primary' | 'good' | 'bad';
}) {
  const toneCls = tone === 'primary'
    ? 'border-[#C9A96E] bg-[#FFF8E7]/60'
    : tone === 'good'
    ? 'border-green-200 bg-green-50/60'
    : tone === 'bad'
    ? 'border-red-200 bg-red-50/60'
    : 'border-gray-200 bg-white';
  return (
    <div className={`rounded-lg border p-2.5 ${toneCls}`}>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-base font-semibold font-mono mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
