// BidComparisonMatrix — a true side-by-side leveling sheet for portal bids.
//
// The existing PortalBidsPanel table is a per-sub SUMMARY grouped by trade
// (one row per sub: total + compliance + award). What it doesn't answer is the
// question a GC actually asks when leveling bids: "where does each sub's number
// diverge, line by line?" This component answers that — subs become columns,
// line items become rows, and each cell is highlighted green (low) / red (high)
// across the row so outliers and scope gaps jump out.
//
// Pure presentational + Firestore-free: it takes the already-loaded bids and
// the same onAward / onView callbacks PortalBidsPanel uses for its summary view.

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Award, Eye, Shield, Building2, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react';
import type { PortalBid } from './types';

interface Props {
  bids: PortalBid[];
  onAward: (bid: PortalBid) => void;
  onView: (bid: PortalBid) => void;
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

// A row in the matrix: one normalized line-item description, with each sub's
// dollar total for that line keyed by bid id (absent = sub didn't bid the line).
interface MatrixRow {
  label: string;
  byBid: Record<string, number>;
}

function buildRows(bids: PortalBid[]): MatrixRow[] {
  const order: string[] = [];
  const rows = new Map<string, MatrixRow>();
  for (const bid of bids) {
    for (const li of bid.lineItems || []) {
      const key = (li.description || 'Unspecified').trim().toLowerCase();
      if (!rows.has(key)) {
        rows.set(key, { label: (li.description || 'Unspecified').trim(), byBid: {} });
        order.push(key);
      }
      const row = rows.get(key)!;
      row.byBid[bid.id] = (row.byBid[bid.id] || 0) + (li.total || 0);
    }
  }
  return order.map(k => rows.get(k)!);
}

// Min/max across the bids that actually quoted a given row, so a single quote
// isn't flagged as both cheapest and most expensive.
function extent(values: number[]): { min: number; max: number } {
  return { min: Math.min(...values), max: Math.max(...values) };
}

function cellClass(value: number | undefined, ext: { min: number; max: number }, quotedCount: number): string {
  if (value == null) return 'text-gray-300';
  if (quotedCount < 2) return '';
  if (value === ext.min) return 'bg-green-50 text-green-800 font-semibold';
  if (value === ext.max) return 'bg-red-50 text-red-700';
  return '';
}

function TradeMatrix({ trade, bids, onAward, onView }: { trade: string } & Props) {
  const sorted = useMemo(
    () => [...bids].sort((a, b) => a.totalAmount - b.totalAmount),
    [bids],
  );
  const rows = useMemo(() => buildRows(sorted), [sorted]);

  const totals = sorted.map(b => b.totalAmount);
  const totalExt = extent(totals);
  const spread = totalExt.max - totalExt.min;
  const spreadPct = totalExt.min > 0 ? (spread / totalExt.min) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-semibold text-sm text-gray-900">{trade}</h3>
        {sorted.length >= 2 && spread > 0 && (
          <span className="text-xs text-gray-500">
            Spread <span className="font-mono font-semibold text-gray-700">{money(spread)}</span>
            {' '}({spreadPct.toFixed(0)}%) across {sorted.length} bids
          </span>
        )}
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-2 font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[180px]">
                Line item
              </th>
              {sorted.map(b => {
                const insOk = b.insurance?.carrier && b.insurance?.policyNumber;
                const licOk = b.contractorLicense?.number;
                return (
                  <th key={b.id} className="p-2 text-right align-bottom min-w-[150px]">
                    <div className="font-semibold text-gray-900 truncate">{b.subName}</div>
                    {b.subCompany && <div className="text-[11px] font-normal text-gray-400 truncate">{b.subCompany}</div>}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <Shield className={`w-3 h-3 ${insOk ? 'text-green-500' : 'text-gray-300'}`} aria-label="Insurance" />
                      <Building2 className={`w-3 h-3 ${licOk ? 'text-green-500' : 'text-gray-300'}`} aria-label="License" />
                      {b.agreementAcknowledged && <CheckCircle2 className="w-3 h-3 text-green-500" aria-label="Agreement acknowledged" />}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const quoted = sorted.map(b => row.byBid[b.id]).filter((v): v is number => v != null);
              const ext = extent(quoted);
              return (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-2 text-gray-700 sticky left-0 bg-white">{row.label}</td>
                  {sorted.map(b => {
                    const v = row.byBid[b.id];
                    return (
                      <td key={b.id} className={`p-2 text-right font-mono ${cellClass(v, ext, quoted.length)}`}>
                        {v == null ? '—' : money(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-gray-50">
              <td className="p-2 font-semibold sticky left-0 bg-gray-50">Bid Total</td>
              {sorted.map(b => {
                const isLow = b.totalAmount === totalExt.min;
                const isHigh = sorted.length >= 2 && b.totalAmount === totalExt.max;
                return (
                  <td
                    key={b.id}
                    className={`p-2 text-right font-mono font-bold ${
                      isLow ? 'text-green-700' : isHigh ? 'text-red-600' : 'text-gray-900'
                    }`}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {sorted.length >= 2 && isLow && <TrendingDown className="w-3.5 h-3.5" />}
                      {isHigh && <TrendingUp className="w-3.5 h-3.5" />}
                      {money(b.totalAmount)}
                    </div>
                    {sorted.length >= 2 && isLow && (
                      <div className="text-[10px] uppercase font-bold text-green-600">lowest</div>
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="p-2 sticky left-0 bg-white" />
              {sorted.map(b => (
                <td key={b.id} className="p-2">
                  <div className="flex items-center justify-end gap-1">
                    <Badge variant={b.status === 'awarded' ? 'default' : 'outline'} className="text-[10px]">
                      {b.status}
                    </Badge>
                    <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => onView(b)} aria-label="View bid detail">
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    {b.status === 'received' && (
                      <Button
                        size="sm"
                        className="text-white gap-1 h-7"
                        style={{ backgroundColor: '#C9A96E' }}
                        onClick={() => onAward(b)}
                      >
                        <Award className="w-3 h-3" /> Award
                      </Button>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function BidComparisonMatrix({ bids, onAward, onView }: Props) {
  // Group by trade — one leveling sheet per trade.
  const byTrade = useMemo(() => {
    const map: Record<string, PortalBid[]> = {};
    for (const b of bids) {
      const key = b.trade || 'Other';
      (map[key] ||= []).push(b);
    }
    return map;
  }, [bids]);

  const trades = Object.keys(byTrade);
  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-400">
        No portal bids to compare yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {trades.map(trade => (
        <TradeMatrix key={trade} trade={trade} bids={byTrade[trade]} onAward={onAward} onView={onView} />
      ))}
    </div>
  );
}
