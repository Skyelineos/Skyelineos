// Aggregate budget + draws → per-trade progress. Pure function, no Firestore.

import type { BudgetSnapshot } from '@/lib/estimates/types';
import { rollupEstimate, tradeLabel as canonicalTradeLabel } from '@/lib/estimates/markup';
import type { Draw, TradeProgress } from './types';

const PENDING_STATUSES: Draw['status'][] = ['draft', 'pending', 'submitted'];
const COUNTED_STATUSES: Draw['status'][] = ['approved', 'paid'];

export function tradeProgress(
  budget: BudgetSnapshot | undefined,
  draws: Draw[],
): TradeProgress[] {
  if (!budget) return [];

  // Roll up the frozen budget line items so we know each trade's contract value
  // and profit portion. We pass the frozen markupConfig from the snapshot so
  // the math matches what was signed (even if the estimate's current config
  // has changed since).
  const rollup = rollupEstimate(budget.lineItems as any, budget.markupConfig);

  const tradeKeys = new Set([
    ...Object.keys(rollup.byTrade),
    ...draws.map(d => d.trade ?? '').filter(Boolean),
  ]);

  return Array.from(tradeKeys).map(trade => {
    const bucket = rollup.byTrade[trade];
    const tradeDraws = draws.filter(d => d.trade === trade);
    const drawsCounted = tradeDraws.filter(d => COUNTED_STATUSES.includes(d.status)).reduce((s, d) => s + d.amount, 0);
    const drawsPending = tradeDraws.filter(d => PENDING_STATUSES.includes(d.status)).reduce((s, d) => s + d.amount, 0);
    const budgetAmount = bucket?.price ?? 0;
    return {
      trade,
      tradeLabel: canonicalTradeLabel(trade) || 'Uncategorized',
      budgetAmount,
      budgetCost: bucket?.cost ?? 0,
      budgetProfit: bucket?.profit ?? 0,
      drawsTotal: drawsCounted,
      drawsPending,
      remaining: Math.max(0, budgetAmount - drawsCounted - drawsPending),
      drawCount: tradeDraws.length,
    };
  }).sort((a, b) => b.budgetAmount - a.budgetAmount);
}

export function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}
