// Numbered Draw Schedule panel — shows the current open draw (Draw #N) with
// trade line-item breakdown (Central Bank construction-loan format) and a
// stacked history of past numbered draws. Drops into the project Financials
// tab.
//
// Backend: functions/src/expenses/drawRoutes.ts
//   GET  /api/projects/:projectId/draw-periods
//   GET  /api/projects/:projectId/draw-periods/current
//   POST /api/projects/:projectId/draw-periods/:periodId/submit

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Wallet, Send, Receipt, Calendar, Clock, CheckCircle2, Layers,
} from 'lucide-react';

const GOLD = '#C9A96E';
const GOLD_HOVER = '#A8864A';
const DARK = '#141414';

type DrawStatus = 'open' | 'submitted' | 'paid' | 'reconciled';

interface DrawTradeItem {
  trade: string;
  contractAmount: number;
  previouslyDrawn: number;
  thisDrawAmount: number;
  percentComplete: number;
  balance: number;
}

interface DrawExpense {
  id: string;
  vendor: string;
  amount: number;
  date: string;
  category: string;
  tradeCategory?: string;
  description?: string;
  receiptImageUrl: string | null;
}

interface DrawPeriod {
  id: string;
  projectId: string;
  projectName: string;
  drawNumber: number;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  processDate: string;
  status: DrawStatus;
  totalExpenses: number;
  totalInvoices: number;
  totalDraw: number;
  expenseIds: string[];
  invoiceIds: string[];
  tradeLineItems: DrawTradeItem[];
  submittedAt: string | null;
  paidAt: string | null;
  paidDate?: string;
  paidAmount: number | null;
  qboInvoiceId: string | null;
  reconciledAt: string | null;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
}

interface CurrentDrawPeriod extends DrawPeriod {
  expenses: DrawExpense[];
}

export interface DrawSchedulePanelProps {
  projectId: string;
  projectName: string;
}

function fmtCurrency(n: number): string {
  return Number(n || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDateShort(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = parseInt(m[2], 10) - 1;
  return `${months[monthIdx]} ${parseInt(m[3], 10)}, ${m[1]}`;
}

export default function DrawSchedulePanel({
  projectId,
  projectName,
}: DrawSchedulePanelProps) {
  const [current, setCurrent] = useState<CurrentDrawPeriod | null>(null);
  const [history, setHistory] = useState<DrawPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const loadAll = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [currentRes, listRes] = await Promise.all([
        apiRequest(`/api/projects/${projectId}/draw-periods/current`),
        apiRequest(`/api/projects/${projectId}/draw-periods`),
      ]);
      const currentData = await currentRes.json();
      const listData = await listRes.json();
      setCurrent(currentData);
      // History = all periods *except* the current open one, sorted by draw # desc.
      const list: DrawPeriod[] = Array.isArray(listData) ? listData : [];
      const past = list
        .filter((p) => p.id !== currentData?.id)
        .sort((a, b) => (b.drawNumber || 0) - (a.drawNumber || 0));
      setHistory(past);
    } catch (err: any) {
      console.error('[DrawSchedulePanel] load failed:', err);
      toast({
        title: 'Could not load draw schedule',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSubmit = useCallback(async () => {
    if (!current) return;
    if (!window.confirm(
      `Submit Draw #${current.drawNumber} for ${fmtCurrency(current.totalDraw)}? ` +
      `An email will be sent to the client/bank with the trade breakdown.`,
    )) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest(
        `/api/projects/${projectId}/draw-periods/${current.id}/submit`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      const body = await res.json();
      if (body.emailSent) {
        toast({
          title: `Draw #${body.drawNumber} submitted`,
          description: `Email sent to ${body.recipientEmail || 'client'}.`,
        });
      } else {
        toast({
          title: `Draw #${body.drawNumber} marked submitted`,
          description: body.emailError || 'Email not sent — check SendGrid config.',
          variant: 'destructive',
        });
      }
      await loadAll();
    } catch (err: any) {
      toast({
        title: 'Submit failed',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }, [current, projectId, loadAll, toast]);

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <p className="text-sm text-gray-500 text-center font-sans">Loading draw schedule…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="draw-schedule-panel">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${GOLD}1A` }}
        >
          <Wallet className="w-5 h-5" style={{ color: GOLD }} />
        </div>
        <div>
          <h3 className="text-lg font-semibold font-heading" style={{ color: DARK }}>
            Draw Schedule — {projectName}
          </h3>
          <p className="text-xs text-gray-500 font-sans mt-0.5">
            Bi-monthly collection · Numbered draws (#1, #2, #3…)
          </p>
        </div>
      </div>

      {/* ── Current draw card (expanded) ───────────────────────────────── */}
      {current && (
        <CurrentDrawCard
          period={current}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      )}

      {/* ── Past draws (stacked) ───────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <div
          className="px-5 py-3 border-b flex items-center justify-between"
          style={{ borderColor: '#E5E7EB' }}
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4" style={{ color: GOLD }} />
            <h4 className="text-sm font-semibold font-heading" style={{ color: DARK }}>
              Past draws
            </h4>
          </div>
          <Badge variant="outline" className="text-xs font-sans">
            {history.length}
          </Badge>
        </div>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8 font-sans">
              No past draws yet. Once you submit the current draw it'll show up here.
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
              {history.map((p) => (
                <PastDrawRow key={p.id} period={p} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Current draw (expanded) ─────────────────────────────────────────────────

function CurrentDrawCard({
  period,
  onSubmit,
  submitting,
}: {
  period: CurrentDrawPeriod;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const expenses = (period.expenses || []).slice().sort((a, b) =>
    (b.date || '').localeCompare(a.date || ''),
  );
  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      {/* Header: DRAW #N · period · due */}
      <div
        className="px-5 py-4 border-b"
        style={{ borderColor: '#E5E7EB' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2
                className="text-2xl font-bold font-heading"
                style={{ color: DARK }}
                data-testid="current-draw-number"
              >
                DRAW #{period.drawNumber}
              </h2>
              <span className="text-gray-300">•</span>
              <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 font-sans">
                <Calendar className="w-3.5 h-3.5" />
                {period.periodLabel}
              </span>
              <span className="text-gray-300">•</span>
              <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 font-sans">
                <Clock className="w-3.5 h-3.5" />
                Due {fmtDateShort(period.processDate)}
              </span>
            </div>
          </div>
          <DrawStatusBadge status={period.status} />
        </div>
      </div>

      {/* Amount + submit button */}
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden>💰</span>
            <p
              className="text-4xl font-bold tabular-nums font-sans"
              style={{ color: GOLD }}
              data-testid="current-draw-amount"
            >
              {fmtCurrency(period.totalDraw)}
            </p>
          </div>
          {period.status === 'open' && (
            <Button
              onClick={onSubmit}
              disabled={submitting || (period.expenses?.length || 0) === 0}
              className="font-medium font-sans"
              style={{ backgroundColor: GOLD, color: DARK }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = GOLD_HOVER;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = GOLD;
              }}
              data-testid="submit-draw-button"
            >
              <Send className="w-4 h-4 mr-2" />
              {submitting ? 'Submitting…' : 'Submit Draw Request'}
            </Button>
          )}
        </div>

        {/* ── Trade Breakdown ──────────────────────────────────────────── */}
        {period.tradeLineItems && period.tradeLineItems.length > 0 && (
          <div className="mt-6">
            <h4
              className="text-[10px] uppercase tracking-wider text-gray-500 font-medium font-sans mb-2"
            >
              Trade Breakdown
            </h4>
            <div
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: '#E5E7EB' }}
            >
              <div
                className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-medium font-sans border-b bg-gray-50"
                style={{ borderColor: '#E5E7EB' }}
              >
                <div className="col-span-4">Category</div>
                <div className="col-span-2 text-right">Total Cost</div>
                <div className="col-span-2 text-right">Prev Drawn</div>
                <div className="col-span-2 text-right">This Draw</div>
                <div className="col-span-1 text-right">% Comp</div>
                <div className="col-span-1 text-right">Balance</div>
              </div>
              <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
                {period.tradeLineItems.map((t) => (
                  <div
                    key={t.trade}
                    className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm font-sans hover:bg-gray-50"
                  >
                    <div className="col-span-4 font-medium truncate" style={{ color: DARK }}>
                      {t.trade}
                    </div>
                    <div className="col-span-2 text-right text-xs text-gray-600 tabular-nums">
                      {fmtCurrency(t.contractAmount)}
                    </div>
                    <div className="col-span-2 text-right text-xs text-gray-500 tabular-nums">
                      {fmtCurrency(t.previouslyDrawn)}
                    </div>
                    <div className="col-span-2 text-right font-semibold tabular-nums" style={{ color: GOLD }}>
                      {fmtCurrency(t.thisDrawAmount)}
                    </div>
                    <div className="col-span-1 text-right text-xs text-gray-600 tabular-nums">
                      {t.percentComplete}%
                    </div>
                    <div className="col-span-1 text-right text-xs text-gray-500 tabular-nums">
                      {fmtCurrency(t.balance)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Receipts & Invoices ──────────────────────────────────────── */}
        <div className="mt-6">
          <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-medium font-sans mb-2 flex items-center gap-2">
            <Receipt className="w-3 h-3" style={{ color: GOLD }} />
            Receipts &amp; Invoices ({expenses.length} item{expenses.length === 1 ? '' : 's'})
          </h4>
          {expenses.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6 font-sans">
              No receipts captured yet in this period.
            </p>
          ) : (
            <div
              className="rounded-lg border overflow-hidden divide-y"
              style={{ borderColor: '#E5E7EB' }}
            >
              {expenses.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm font-sans hover:bg-gray-50"
                >
                  <div className="col-span-2 text-xs text-gray-600 tabular-nums">
                    {fmtDateShort(e.date).replace(/, \d{4}$/, '')}
                  </div>
                  <div className="col-span-7 min-w-0">
                    <p className="font-medium truncate" style={{ color: DARK }}>
                      {e.vendor || '(no vendor)'}
                      {e.description ? ` – ${e.description}` : ''}
                    </p>
                    {e.tradeCategory && (
                      <p className="text-[11px] text-gray-500 truncate">{e.tradeCategory}</p>
                    )}
                  </div>
                  <div className="col-span-2 text-right tabular-nums font-medium" style={{ color: DARK }}>
                    {fmtCurrency(e.amount)}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {e.receiptImageUrl ? (
                      <a
                        href={e.receiptImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View receipt"
                        className="text-gray-400 hover:text-gray-700"
                      >
                        <Receipt className="w-4 h-4" />
                      </a>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Past draw row ───────────────────────────────────────────────────────────

function PastDrawRow({ period }: { period: DrawPeriod }) {
  const dateLabel = (() => {
    if (period.status === 'paid' || period.status === 'reconciled') {
      return fmtDateShort(period.paidDate || (period.paidAt ? period.paidAt.slice(0, 10) : ''));
    }
    if (period.status === 'submitted' && period.submittedAt) {
      return fmtDateShort(period.submittedAt.slice(0, 10));
    }
    return fmtDateShort(period.processDate);
  })();
  return (
    <div className="px-5 py-3 grid grid-cols-12 gap-2 items-center text-sm font-sans hover:bg-gray-50">
      <div className="col-span-3">
        <p className="font-semibold font-heading" style={{ color: DARK }}>
          Draw #{period.drawNumber}
        </p>
      </div>
      <div className="col-span-3 text-xs text-gray-500">
        {dateLabel}
      </div>
      <div className="col-span-3 text-right tabular-nums font-medium" style={{ color: DARK }}>
        {fmtCurrency(period.totalDraw)}
      </div>
      <div className="col-span-3 flex justify-end">
        <DrawStatusBadge status={period.status} />
      </div>
    </div>
  );
}

// ── Status badge ────────────────────────────────────────────────────────────

function DrawStatusBadge({ status }: { status: DrawStatus }) {
  const map: Record<
    DrawStatus,
    { color: string; bg: string; label: string; icon: React.ReactNode }
  > = {
    open: {
      color: '#4B5563',
      bg: 'rgba(107,114,128,0.12)',
      label: 'Accumulating',
      icon: <Clock className="w-3 h-3" />,
    },
    submitted: {
      color: '#1D4ED8',
      bg: 'rgba(29,78,216,0.12)',
      label: 'Submitted',
      icon: <Send className="w-3 h-3" />,
    },
    paid: {
      color: '#0F6F40',
      bg: 'rgba(15,111,64,0.12)',
      label: '✅ Paid',
      icon: null,
    },
    reconciled: {
      color: GOLD,
      bg: `${GOLD}1F`,
      label: '✓ Reconciled',
      icon: null,
    },
  };
  const m = map[status] || map.open;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium font-sans px-2 py-0.5 rounded"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      {m.icon}
      {m.label}
    </span>
  );
}
