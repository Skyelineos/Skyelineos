import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  BarChart2, TrendingUp, TrendingDown, Briefcase,
  Target, FileSpreadsheet, ArrowUpRight,
} from 'lucide-react';
import {
  type Contract,
  contractTotal, contractPaid,
} from '@/lib/contracts/types';

const fmt = (n: number) =>
  `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;

type ReportKey =
  | 'gain_loss'
  | 'job_est_vs_actual'
  | 'profit_comparison'
  | 'lead_source'
  | 'wip'
  | 'lead_activity';

const REPORTS: Array<{ key: ReportKey; label: string; icon: any; description: string }> = [
  { key: 'gain_loss',         label: 'Builder Gain / Loss',     icon: TrendingUp,    description: 'Total revenue from contracts vs total cost (subs + designers).' },
  { key: 'job_est_vs_actual', label: 'Job Estimated vs Actual', icon: BarChart2,     description: 'Per-project estimate vs contracted amount + spent.' },
  { key: 'profit_comparison', label: 'Profit Comparison',       icon: Target,        description: 'Per-project gross profit and margin %, ranked.' },
  { key: 'lead_source',       label: 'Lead Source',             icon: ArrowUpRight,  description: 'Leads grouped by source, with conversion to "Won".' },
  { key: 'wip',               label: 'Work in Progress (WIP)',  icon: FileSpreadsheet, description: 'Earned revenue (by % complete) minus billed revenue.' },
  { key: 'lead_activity',     label: 'Lead Activity',           icon: Briefcase,     description: 'New leads per month, last 12 months.' },
];

export default function Reports() {
  const [active, setActive] = useState<ReportKey>('gain_loss');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [projects, setProjects]   = useState<any[]>([]);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [leads, setLeads]         = useState<any[]>([]);
  const [bills, setBills]         = useState<any[]>([]);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'contracts'), s => setContracts(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    const u2 = onSnapshot(query(collection(db, 'projects'), orderBy('createdAt', 'desc')), s => setProjects(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    const u3 = onSnapshot(collection(db, 'estimates'), s => setEstimates(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    const u4 = onSnapshot(collection(db, 'clients'),  s => setLeads(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    const u5 = onSnapshot(collection(db, 'bills'),    s => setBills(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, []);

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BarChart2 className="w-7 h-7 text-[#C9A96E]" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-sm text-gray-500">Pre-built reports on profit, jobs, and leads.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          <div className="space-y-1">
            {REPORTS.map(r => {
              const Icon = r.icon;
              const isActive = r.key === active;
              return (
                <button
                  key={r.key}
                  onClick={() => setActive(r.key)}
                  className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-md border transition ${
                    isActive
                      ? 'bg-[#C9A96E] border-[#C9A96E] text-white'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                  <div className="min-w-0">
                    <div className={`text-sm font-medium ${isActive ? 'text-white' : 'text-gray-900'}`}>{r.label}</div>
                    <div className={`text-[11px] mt-0.5 leading-snug ${isActive ? 'text-white/80' : 'text-gray-500'}`}>{r.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div>
            {active === 'gain_loss'         && <GainLossReport contracts={contracts} bills={bills} />}
            {active === 'job_est_vs_actual' && <JobEstVsActualReport projects={projects} estimates={estimates} contracts={contracts} bills={bills} />}
            {active === 'profit_comparison' && <ProfitComparisonReport projects={projects} contracts={contracts} />}
            {active === 'lead_source'       && <LeadSourceReport leads={leads} />}
            {active === 'wip'               && <WipReport projects={projects} contracts={contracts} />}
            {active === 'lead_activity'     && <LeadActivityReport leads={leads} />}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function GainLossReport({ contracts, bills }: { contracts: Contract[]; bills: any[] }) {
  const stats = useMemo(() => {
    const clientContracts = contracts.filter(c => c.type === 'client_build');
    const subContracts    = contracts.filter(c => c.type === 'subcontractor');
    const designerContracts = contracts.filter(c => c.type === 'designer');
    const revenue = clientContracts.reduce((s, c) => s + contractTotal(c), 0);
    const cashIn  = clientContracts.reduce((s, c) => s + contractPaid(c), 0);
    const subsCost = subContracts.reduce((s, c) => s + contractTotal(c), 0);
    const designerCost = designerContracts.reduce((s, c) => s + contractTotal(c), 0);
    const billsTotal = bills.filter((b: any) => b.status === 'paid').reduce((s: number, b: any) => s + (b.amount || 0), 0);
    const totalCost = subsCost + designerCost + billsTotal;
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, cashIn, subsCost, designerCost, billsTotal, totalCost, profit, margin };
  }, [contracts, bills]);

  const tone = stats.profit >= 0 ? 'text-green-700' : 'text-red-600';
  const TrendIcon = stats.profit >= 0 ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardHeader><CardTitle>Builder Gain / Loss</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Revenue (contracts)" value={fmt(stats.revenue)} />
          <Tile label="Cash collected" value={fmt(stats.cashIn)} sub={`${fmtPct(stats.revenue ? (stats.cashIn / stats.revenue) * 100 : 0)} of revenue`} />
          <Tile label="Total cost" value={fmt(stats.totalCost)} sub="Subs + Designers + Paid bills" />
          <Tile label="Net profit" value={fmt(stats.profit)} sub={`${fmtPct(stats.margin)} margin`} icon={<TrendIcon className="w-4 h-4" />} tone={tone} />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Cost breakdown</h3>
          {stats.totalCost === 0 ? (
            <p className="text-sm text-gray-400">No costs recorded yet.</p>
          ) : (
            <div className="space-y-1.5">
              <CostRow label="Subcontractor agreements" value={stats.subsCost} pct={stats.totalCost ? (stats.subsCost / stats.totalCost) * 100 : 0} color="#f59e0b" />
              <CostRow label="Designer agreements"      value={stats.designerCost} pct={stats.totalCost ? (stats.designerCost / stats.totalCost) * 100 : 0} color="#8b5cf6" />
              <CostRow label="Paid bills (non-contract)" value={stats.billsTotal} pct={stats.totalCost ? (stats.billsTotal / stats.totalCost) * 100 : 0} color="#06b6d4" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function JobEstVsActualReport({ projects, estimates, contracts, bills }: {
  projects: any[]; estimates: any[]; contracts: Contract[]; bills: any[];
}) {
  const rows = useMemo(() => {
    return projects.map(p => {
      const est = estimates.find(e => e.projectId === p.id);
      const estTotal = est?.total || est?.amount || 0;
      const clientContract = contracts.find(c => c.projectId === p.id && c.type === 'client_build');
      const contractAmount = clientContract ? contractTotal(clientContract) : 0;
      const projBills = bills.filter((b: any) => b.projectId === p.id);
      const spent = projBills.reduce((s: number, b: any) => s + (b.amount || 0), 0);
      const delta = contractAmount - estTotal;
      return { id: p.id, name: p.name, estTotal, contractAmount, spent, delta };
    }).filter(r => r.estTotal || r.contractAmount || r.spent);
  }, [projects, estimates, contracts, bills]);

  return (
    <Card>
      <CardHeader><CardTitle>Job Estimated vs Actual</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-center py-8">
            <p className="font-medium text-gray-700">No projects with financial data yet</p>
            <p className="text-sm mt-1 text-gray-500">
              Add an estimate, contract, or bill to a project and it'll appear here for comparison.
            </p>
            <button
              onClick={() => window.location.assign('/projects')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: '#C9A96E' }}
            >
              Open projects
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-gray-500 text-left">
                <tr>
                  <th className="py-2 px-2">Project</th>
                  <th className="py-2 px-2 text-right">Estimate</th>
                  <th className="py-2 px-2 text-right">Contract</th>
                  <th className="py-2 px-2 text-right">Spent</th>
                  <th className="py-2 px-2 text-right">Δ vs Est</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="py-2 px-2 font-medium">{r.name}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(r.estTotal)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(r.contractAmount)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(r.spent)}</td>
                    <td className={`py-2 px-2 text-right tabular-nums font-medium ${r.delta > 0 ? 'text-green-700' : r.delta < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {r.delta > 0 ? '+' : ''}{fmt(r.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProfitComparisonReport({ projects, contracts }: { projects: any[]; contracts: Contract[] }) {
  const rows = useMemo(() => {
    return projects.map(p => {
      const client = contracts.filter(c => c.projectId === p.id && c.type === 'client_build');
      const subs   = contracts.filter(c => c.projectId === p.id && c.type === 'subcontractor');
      const designers = contracts.filter(c => c.projectId === p.id && c.type === 'designer');
      const revenue = client.reduce((s, c) => s + contractTotal(c), 0);
      const cost = subs.reduce((s, c) => s + contractTotal(c), 0) + designers.reduce((s, c) => s + contractTotal(c), 0);
      const profit = revenue - cost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return { id: p.id, name: p.name, revenue, cost, profit, margin };
    })
    .filter(r => r.revenue || r.cost)
    .sort((a, b) => b.profit - a.profit);
  }, [projects, contracts]);

  return (
    <Card>
      <CardHeader><CardTitle>Profit Comparison</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No contracted projects yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.id} className="grid grid-cols-12 gap-2 items-center text-sm border-b border-gray-100 py-2">
                <div className="col-span-4 font-medium truncate">{r.name}</div>
                <div className="col-span-2 text-right tabular-nums text-gray-600">{fmt(r.revenue)}</div>
                <div className="col-span-2 text-right tabular-nums text-gray-600">−{fmt(r.cost)}</div>
                <div className={`col-span-2 text-right tabular-nums font-semibold ${r.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(r.profit)}</div>
                <div className={`col-span-2 text-right tabular-nums text-xs font-medium ${r.margin >= 15 ? 'text-green-700' : r.margin >= 5 ? 'text-amber-700' : 'text-red-600'}`}>{fmtPct(r.margin)}</div>
              </div>
            ))}
            <div className="grid grid-cols-12 gap-2 items-center text-sm font-bold pt-3 border-t-2 border-gray-200">
              <div className="col-span-4">Portfolio total</div>
              <div className="col-span-2 text-right tabular-nums">{fmt(rows.reduce((s, r) => s + r.revenue, 0))}</div>
              <div className="col-span-2 text-right tabular-nums">−{fmt(rows.reduce((s, r) => s + r.cost, 0))}</div>
              <div className="col-span-2 text-right tabular-nums text-green-700">{fmt(rows.reduce((s, r) => s + r.profit, 0))}</div>
              <div className="col-span-2 text-right tabular-nums">—</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeadSourceReport({ leads }: { leads: any[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, { total: number; won: number; lost: number; value: number }>();
    for (const l of leads) {
      const source = String(l.leadSource || 'other');
      const cur = map.get(source) || { total: 0, won: 0, lost: 0, value: 0 };
      cur.total += 1;
      if (l.stage === 'won') cur.won += 1;
      if (l.stage === 'lost') cur.lost += 1;
      cur.value += (l.budget || 0);
      map.set(source, cur);
    }
    return Array.from(map.entries())
      .map(([source, v]) => ({ source, ...v, conversion: v.total ? (v.won / v.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [leads]);

  return (
    <Card>
      <CardHeader><CardTitle>Lead Source</CardTitle></CardHeader>
      <CardContent>
        {grouped.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No leads yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-gray-500 text-left">
                <tr>
                  <th className="py-2 px-2">Source</th>
                  <th className="py-2 px-2 text-right">Leads</th>
                  <th className="py-2 px-2 text-right">Won</th>
                  <th className="py-2 px-2 text-right">Lost</th>
                  <th className="py-2 px-2 text-right">Conversion</th>
                  <th className="py-2 px-2 text-right">Pipeline Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grouped.map(r => (
                  <tr key={r.source}>
                    <td className="py-2 px-2 font-medium capitalize">{r.source.replace(/_/g, ' ')}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.total}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-green-700">{r.won}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-red-600">{r.lost}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmtPct(r.conversion)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WipReport({ projects, contracts }: { projects: any[]; contracts: Contract[] }) {
  const rows = useMemo(() => {
    return projects
      .filter(p => p.status === 'active' || p.status === 'planning' || p.status === 'punch_list')
      .map(p => {
        const client = contracts.find(c => c.projectId === p.id && c.type === 'client_build');
        const total = client ? contractTotal(client) : 0;
        const pct = (p.completePct ?? p.progress ?? 0) / 100;
        const earned = total * pct;
        const billed = client ? contractPaid(client) : 0;
        const wip = earned - billed;
        return { id: p.id, name: p.name, total, pct: pct * 100, earned, billed, wip };
      })
      .filter(r => r.total > 0)
      .sort((a, b) => b.wip - a.wip);
  }, [projects, contracts]);

  return (
    <Card>
      <CardHeader><CardTitle>Work in Progress</CardTitle></CardHeader>
      <CardContent>
        <p className="text-xs text-gray-500 mb-4">
          Earned revenue = contract × completion %. WIP = earned − billed. A positive WIP means you've done more work than you've billed for.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No active contracted projects yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-gray-500 text-left">
                <tr>
                  <th className="py-2 px-2">Project</th>
                  <th className="py-2 px-2 text-right">Contract</th>
                  <th className="py-2 px-2 text-right">% Complete</th>
                  <th className="py-2 px-2 text-right">Earned</th>
                  <th className="py-2 px-2 text-right">Billed</th>
                  <th className="py-2 px-2 text-right">WIP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="py-2 px-2 font-medium">{r.name}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(r.total)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmtPct(r.pct)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(r.earned)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(r.billed)}</td>
                    <td className={`py-2 px-2 text-right tabular-nums font-semibold ${r.wip > 0 ? 'text-amber-700' : r.wip < 0 ? 'text-green-700' : 'text-gray-500'}`}>{fmt(r.wip)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeadActivityReport({ leads }: { leads: any[] }) {
  const months = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) {
      const ts = l.createdAt?.toDate ? l.createdAt.toDate() : l.createdAt ? new Date(l.createdAt) : null;
      if (!ts) continue;
      const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;
      m.set(key, (m.get(key) || 0) + 1);
    }
    return Array.from(m.entries()).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12).reverse();
  }, [leads]);
  const maxCount = Math.max(1, ...months.map(([, n]) => n));

  return (
    <Card>
      <CardHeader><CardTitle>Lead Activity (last 12 months)</CardTitle></CardHeader>
      <CardContent>
        {months.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No leads with creation dates yet.</p>
        ) : (
          <div className="space-y-2">
            {months.map(([month, count]) => (
              <div key={month} className="flex items-center gap-3 text-sm">
                <span className="w-20 text-gray-500 tabular-nums">{month}</span>
                <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
                  <div className="h-full bg-[#C9A96E] rounded" style={{ width: `${(count / maxCount) * 100}%` }} />
                </div>
                <span className="w-10 text-right tabular-nums font-medium">{count}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: string; icon?: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-md p-3 bg-white">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-gray-500">{icon}{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-0.5 ${tone || 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}
function CostRow({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-44 text-gray-700">{label}</span>
      <div className="flex-1 bg-gray-100 rounded h-2.5 overflow-hidden">
        <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-24 text-right tabular-nums">{fmt(value)}</span>
      <span className="w-12 text-right text-xs text-gray-500 tabular-nums">{fmtPct(pct)}</span>
    </div>
  );
}
