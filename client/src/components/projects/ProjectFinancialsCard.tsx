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
  // EstimateBuilder.handleSave writes `totalAmount`; the legacy
  // SimplifiedEstimateForm / EstimateManagement code writes `totalCost`
  // (+ `estimatedAmount`). Some imported / hand-rolled docs may still
  // carry a bare `total`. We read all four so a dashboard never shows
  // $0 just because the writer used a different field name.
  totalAmount?: number;
  totalCost?: number;
  estimatedAmount?: number;
  total?: number;
  // Cost breakdown — EstimateBuilder persists these alongside totalAmount.
  // Required to compute projected profit honestly (we cannot derive profit
  // from contract amount alone).
  subtotal?: number;          // sum of billable line items before OH + profit
  overhead?: number;          // percent
  profit?: number;            // percent — GC's target margin
  status?: string;            // 'draft' | 'sent' | 'accepted' | 'rejected' | 'revised' | …
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

  // Read every field name we've seen estimates persist their total under.
  // Number(...) coerces string-typed legacy values; `|| 0` guards NaN.
  const estimateTotal =
    Number(
      estimate?.totalAmount ??
      estimate?.totalCost ??
      estimate?.estimatedAmount ??
      estimate?.total ??
      0,
    ) || 0;
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
  // Contract amount is ZERO until the client has signed/approved the
  // estimate. Before signoff, the estimate is just a proposed number —
  // dropping it into Contract Amount makes the dashboard look like the
  // GC has $X locked in when they don't. Once the estimate flips to
  // 'accepted' (set by POST /api/estimates/:id/client-response when the
  // homeowner approves it in the client portal), contract amount = the
  // estimate total plus any approved change orders.
  const estimateStatus = String(estimate?.status || '').toLowerCase();
  const SIGNED_STATUSES = new Set(['accepted', 'approved', 'signed']);
  const contractSigned = !!estimate && SIGNED_STATUSES.has(estimateStatus);
  const contractAmount = contractSigned ? estimateTotal + approvedCOAmount : 0;

  // Projected profit is the profit BAKED INTO the estimate — the GC's
  // target margin on the work as priced. Independent of spend. From
  // EstimateBuilder.calcTotals:
  //   profitAmt = (subtotal + subtotal*overhead/100) * (profit/100)
  // Older / imported estimates that didn't persist subtotal + overhead +
  // profit fall back to a conservative 0 rather than misreporting.
  const estSubtotal = Number(estimate?.subtotal ?? 0) || 0;
  const estOverheadPct = Number(estimate?.overhead ?? 0) || 0;
  const estProfitPct = Number(estimate?.profit ?? 0) || 0;
  const projectedProfit =
    estSubtotal > 0 && estProfitPct > 0
      ? (estSubtotal + estSubtotal * (estOverheadPct / 100)) * (estProfitPct / 100)
      : 0;
  const profitPct = estProfitPct;
  // Actual profit lives on a future card — comes from invoicing/AP/AR
  // once the build is moving. We surface a placeholder ribbon below so
  // Tyler can see where it'll land.
  const actualProfitAvailable = false; // wire when invoicing surfaces land

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
              <Stat
                label={contractSigned ? 'Contract Amount' : 'Contract Amount (pending)'}
                value={fmt(contractAmount)}
                sub={contractSigned
                  ? 'Estimate + approved COs'
                  : 'Pending client signoff'}
                tone={contractSigned ? 'primary' : undefined}
                dimmed={!contractSigned}
              />
              <Stat
                label="Projected Profit"
                value={fmt(projectedProfit)}
                sub={projectedProfit > 0
                  ? `${profitPct.toFixed(1)}% of contract — from estimate`
                  : (estSubtotal === 0
                      ? 'Add line items to forecast profit'
                      : 'No profit % set on estimate')}
                tone={projectedProfit > 0 ? 'good' : undefined}
              />
            </div>

            {/* Actual profit placeholder — comes from invoicing / AP / AR
                once the project is moving. Distinct from projected so Tyler
                can see the difference between the plan and reality. */}
            <div className="flex items-center justify-between text-xs border border-dashed border-gray-200 rounded-md px-3 py-2 bg-gray-50/50 text-gray-500">
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                Actual Profit
              </span>
              <span>{actualProfitAvailable ? '' : 'Available after first invoice'}</span>
            </div>

            {/* Spent vs contract */}
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Spent to date</span>
                <span className="font-mono font-medium">{fmt(spent)}</span>
              </div>
              {(() => {
                const denom = contractAmount > 0 ? contractAmount : estimateTotal;
                const pct = denom > 0 ? Math.min(100, (spent / denom) * 100) : 0;
                const over = denom > 0 && spent > denom;
                return (
                  <div className="h-2 bg-gray-200 rounded mt-2 overflow-hidden">
                    <div
                      className={`h-full ${over ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                );
              })()}
              <p className="text-[11px] text-gray-500 mt-1">
                {contractAmount > 0
                  ? `${((spent / contractAmount) * 100).toFixed(0)}% of contract`
                  : estimateTotal > 0
                    ? `${((spent / estimateTotal) * 100).toFixed(0)}% of estimate (contract not signed yet)`
                    : 'No contract or estimate to compare against'}
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
  label, value, sub, tone, dimmed,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'primary' | 'good' | 'bad';
  dimmed?: boolean;
}) {
  const toneCls = tone === 'primary'
    ? 'border-[#C9A96E] bg-[#FFF8E7]/60'
    : tone === 'good'
    ? 'border-green-200 bg-green-50/60'
    : tone === 'bad'
    ? 'border-red-200 bg-red-50/60'
    : 'border-gray-200 bg-white';
  const dimCls = dimmed ? 'opacity-60 grayscale' : '';
  return (
    <div className={`rounded-lg border p-2.5 ${toneCls} ${dimCls}`}>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-base font-semibold font-mono mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
