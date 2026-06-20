/**
 * Budget heat map for a single project.
 *
 * For each category we have estimate line items + actual spend:
 *   - Estimated:  sum of estimate line items in that category (latest estimate)
 *   - Spent:      sum of bills/invoices/POs in that category for this project
 *   - Variance:   spent − estimated  (red over budget, green under, gray on-track)
 *
 * Categories are derived from the line items themselves — we read the estimate
 * once, group line items by their `trade` (the canonical bucket used elsewhere
 * in the app, e.g. EstimateBuilder, JobTemplateEditor's per-category tabs).
 * Then bills/POs are bucketed by their stored `category` / `trade` field.
 *
 * Empty state: when no estimate exists, we render an actionable CTA to create
 * one — same pattern as ProjectFinancialsCard.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calculator, BarChart3, ArrowRight } from 'lucide-react';

interface Props {
  projectId: string;
  projectName?: string;
}

interface LineItem {
  trade?: string;
  category?: string;
  total?: number;
  qty?: number;
  unitCost?: number;
}

interface CostRow {
  trade?: string;
  category?: string;
  amount?: number;
  total?: number;
}

const fmt = (n: number) =>
  `$${Math.round(n || 0).toLocaleString()}`;

const NUM = (v: any) => Number(v ?? 0) || 0;

function bucketKey(li: LineItem | CostRow): string {
  return String(li.trade || li.category || 'Uncategorized').trim() || 'Uncategorized';
}

function lineItemAmount(li: LineItem): number {
  if (NUM(li.total) > 0) return NUM(li.total);
  return NUM(li.qty) * NUM(li.unitCost);
}

export function ProjectBudgetHeatMap({ projectId, projectName }: Props) {
  const [, setLocation] = useLocation();
  const [estimateItems, setEstimateItems] = useState<LineItem[] | null>(null);
  const [actuals, setActuals] = useState<CostRow[]>([]);

  // Latest estimate's line items
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'estimates'),
          where('projectId', '==', projectId),
        ));
        const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        rows.sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        const latest: any = rows[0];
        if (!latest) {
          setEstimateItems([]);
          return;
        }
        const items: LineItem[] = Array.isArray(latest.lineItems) ? latest.lineItems : [];
        setEstimateItems(items);
      } catch (e) {
        console.warn('[BudgetHeatMap] estimate load failed', e);
        setEstimateItems([]);
      }
    })();
  }, [projectId]);

  // Actual spend — bills + invoices for this project. We try both collections;
  // missing-collection errors fall through silently.
  useEffect(() => {
    if (!projectId) return;
    const unsubs: Array<() => void> = [];
    const merge = (rows: CostRow[]) => {
      setActuals(prev => {
        const map = new Map<string, CostRow>();
        prev.forEach((r, i) => map.set(`prev:${i}`, r));
        rows.forEach((r, i) => map.set(`new:${i}`, r));
        return Array.from(map.values());
      });
    };
    for (const coll of ['bills', 'invoices', 'purchaseOrders']) {
      try {
        const unsub = onSnapshot(
          query(collection(db, coll), where('projectId', '==', projectId)),
          snap => {
            const rows: CostRow[] = snap.docs.map(d => {
              const data = d.data() as any;
              return {
                trade: data.trade,
                category: data.category,
                amount: data.amount,
                total: data.total ?? data.totalAmount,
              };
            });
            merge(rows);
          },
          () => {},
        );
        unsubs.push(unsub);
      } catch {}
    }
    return () => { unsubs.forEach(u => u()); setActuals([]); };
  }, [projectId]);

  const rows = useMemo(() => {
    if (!estimateItems) return [];
    const buckets = new Map<string, { estimated: number; spent: number }>();
    for (const li of estimateItems) {
      const k = bucketKey(li);
      const b = buckets.get(k) || { estimated: 0, spent: 0 };
      b.estimated += lineItemAmount(li);
      buckets.set(k, b);
    }
    for (const a of actuals) {
      const k = bucketKey(a);
      const b = buckets.get(k) || { estimated: 0, spent: 0 };
      b.spent += NUM(a.total) + NUM(a.amount);
      buckets.set(k, b);
    }
    const out = Array.from(buckets.entries())
      .map(([trade, b]) => ({
        trade,
        estimated: b.estimated,
        spent: b.spent,
        variance: b.spent - b.estimated,
        pct: b.estimated > 0 ? Math.round((b.spent / b.estimated) * 100) : 0,
      }))
      .sort((a, b) => Math.max(b.estimated, b.spent) - Math.max(a.estimated, a.spent));
    return out;
  }, [estimateItems, actuals]);

  // Loading state — estimateItems === null
  if (estimateItems === null) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#C9A96E]" />
            Budget heat map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-2 w-full bg-gray-100 rounded animate-pulse" />
          <div className="h-2 w-3/4 bg-gray-100 rounded animate-pulse mt-2" />
          <div className="h-2 w-1/2 bg-gray-100 rounded animate-pulse mt-2" />
        </CardContent>
      </Card>
    );
  }

  // No estimate yet — CTA
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#C9A96E]" />
            Budget heat map
          </CardTitle>
        </CardHeader>
        <CardContent className="border border-dashed border-amber-200 bg-amber-50 rounded-lg p-5 text-center">
          <Calculator className="w-6 h-6 text-amber-600 mx-auto mb-1.5" />
          <p className="text-sm font-medium text-amber-900">Set up your estimate to begin tracking variance</p>
          <p className="text-xs text-amber-800 mt-0.5">
            Once line items exist on an estimate, this heat map shows over- and under-spend
            per trade as bills + POs come in.
          </p>
          <Button
            size="sm"
            className="mt-3 gap-1.5 text-white"
            style={{ backgroundColor: '#C9A96E' }}
            onClick={() => setLocation(`/estimates?newForProject=${projectId}&projectName=${encodeURIComponent(projectName || '')}`)}
          >
            Create estimate <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#C9A96E]" />
          Budget heat map
          <span className="text-xs text-gray-400 ml-1">{rows.length} categor{rows.length === 1 ? 'y' : 'ies'}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {rows.map(r => {
            const overBudget = r.spent > r.estimated && r.estimated > 0;
            const warn = !overBudget && r.estimated > 0 && r.pct >= 85;
            const tone =
              overBudget ? 'bg-red-500'
              : warn ? 'bg-amber-500'
              : 'bg-green-500';
            const bgPct = r.estimated > 0 ? Math.min(100, Math.round((r.spent / r.estimated) * 100)) : 0;
            return (
              <div key={r.trade}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-gray-700 truncate">{r.trade}</span>
                  <span className="text-gray-500 font-mono">
                    {fmt(r.spent)} <span className="text-gray-400">/ {fmt(r.estimated)}</span>
                    {r.estimated > 0 && (
                      <span className={`ml-2 ${overBudget ? 'text-red-600' : warn ? 'text-amber-700' : 'text-green-700'}`}>
                        {overBudget ? '+' : ''}{r.estimated > 0 ? `${r.pct}%` : ''}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full ${tone} transition-all`} style={{ width: `${bgPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-gray-400">
          Spend includes bills, invoices, and POs tagged to this project + category.
        </p>
      </CardContent>
    </Card>
  );
}

export default ProjectBudgetHeatMap;
