import { useEffect, useMemo, useState } from 'react';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import {
  type Contract,
  contractTotal, contractPaid,
} from '@/lib/contracts/types';

const fmt = (n: number) =>
  `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Profit-against-contracts widget for a project. Pulls every contract on
// this project and computes:
//   revenue = sum of client_build contract totals (incl. approved COs)
//   cost    = sum of sub + designer contract totals
//   profit  = revenue − cost
//   cashIn  = sum of paid milestones on client_build
//   cashOut = sum of paid milestones on sub + designer
export function ContractProfitCard({ projectId }: { projectId: string }) {
  const [contracts, setContracts] = useState<Contract[]>([]);

  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(collection(db, 'contracts'), where('projectId', '==', projectId)),
      snap => setContracts(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
    );
    return () => unsub();
  }, [projectId]);

  const stats = useMemo(() => {
    const client = contracts.filter(c => c.type === 'client_build');
    const subs = contracts.filter(c => c.type === 'subcontractor');
    const designers = contracts.filter(c => c.type === 'designer');

    const revenue = client.reduce((s, c) => s + contractTotal(c), 0);
    const subsCost = subs.reduce((s, c) => s + contractTotal(c), 0);
    const designerCost = designers.reduce((s, c) => s + contractTotal(c), 0);
    const cost = subsCost + designerCost;
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    const cashIn = client.reduce((s, c) => s + contractPaid(c), 0);
    const cashOut = subs.reduce((s, c) => s + contractPaid(c), 0)
      + designers.reduce((s, c) => s + contractPaid(c), 0);
    const cashOnHand = cashIn - cashOut;

    const allBudgetsFinalized = client.length > 0 && client.every(c => c.budgetMode === 'finalized');
    const hasContracts = contracts.length > 0;

    return {
      revenue, subsCost, designerCost, cost, profit, margin,
      cashIn, cashOut, cashOnHand,
      allBudgetsFinalized, hasContracts,
      clientCount: client.length,
      subCount: subs.length,
      designerCount: designers.length,
    };
  }, [contracts]);

  if (!stats.hasContracts) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-gray-400 text-center">
          No contracts on this project yet. Profit will compute once contracts are drafted.
        </CardContent>
      </Card>
    );
  }

  const profitTone = stats.profit >= 0 ? 'text-green-700' : 'text-red-600';
  const cashTone = stats.cashOnHand >= 0 ? 'text-green-700' : 'text-amber-700';

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#C9A96E]" />
            Profit vs. contracts
          </h3>
          {!stats.allBudgetsFinalized && (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 gap-1">
              <AlertTriangle className="w-3 h-3" />
              Estimates still soft
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Revenue (client)" value={fmt(stats.revenue)} sub={`${stats.clientCount} contract${stats.clientCount === 1 ? '' : 's'}`} />
          <Stat label="Cost (subs + designers)" value={fmt(stats.cost)} sub={`${stats.subCount} sub · ${stats.designerCount} designer`} />
          <Stat
            label="Gross profit"
            value={fmt(stats.profit)}
            sub={`${stats.margin.toFixed(1)}% margin`}
            tone={profitTone}
          />
          <Stat
            label="Cash on hand"
            value={fmt(stats.cashOnHand)}
            sub={`In ${fmt(stats.cashIn)} · Out ${fmt(stats.cashOut)}`}
            tone={cashTone}
          />
        </div>

        {/* Visual bar */}
        {stats.revenue > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Revenue allocation</span>
              <span>{fmt(stats.revenue)}</span>
            </div>
            <div className="h-4 bg-gray-100 rounded overflow-hidden flex">
              <div
                className="bg-amber-300"
                style={{ width: `${Math.min((stats.subsCost / stats.revenue) * 100, 100)}%` }}
                title={`Subs: ${fmt(stats.subsCost)}`}
              />
              <div
                className="bg-violet-300"
                style={{ width: `${Math.min((stats.designerCost / stats.revenue) * 100, 100)}%` }}
                title={`Designers: ${fmt(stats.designerCost)}`}
              />
              <div
                className={`${stats.profit >= 0 ? 'bg-green-400' : 'bg-red-400'}`}
                style={{ width: `${Math.min(Math.abs((stats.profit / stats.revenue) * 100), 100)}%` }}
                title={`Profit: ${fmt(stats.profit)}`}
              />
            </div>
            <div className="flex items-center gap-3 text-[10px] text-gray-500 pt-0.5">
              <Legend swatch="bg-amber-300" label="Subs" />
              <Legend swatch="bg-violet-300" label="Designers" />
              <Legend swatch={stats.profit >= 0 ? 'bg-green-400' : 'bg-red-400'} label={stats.profit >= 0 ? 'Profit' : 'Overrun'} />
            </div>
          </div>
        )}

        {!stats.allBudgetsFinalized && (
          <p className="text-xs text-amber-700 border-t border-gray-100 pt-2">
            <AlertTriangle className="inline w-3 h-3 mr-0.5" />
            One or more contracts are still soft — these numbers are estimates only.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${tone || 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-2 h-2 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}
