// ClientDrawHistory — the client-facing view of construction draws.
//
// Shows past numbered draws as a clean list, plus the in-progress draw with
// a trade breakdown (trade name, % complete, draw amount only).
//
// What the CLIENT must NEVER see here:
//   - subcontractor pricing
//   - margin
//   - vendor names / receipt amounts
//   - internal cost data
//
// Source: projects/{projectId}/drawPeriods/{periodId} (Firestore)
//   Same docs the GC's DrawSchedulePanel writes/reads.

import { useEffect, useState } from 'react';
import {
  collection, doc, onSnapshot, orderBy, query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Wallet, Calendar, Clock, CheckCircle2, FileText, Layers,
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

interface DrawPeriod {
  id: string;
  drawNumber: number;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  processDate: string;
  status: DrawStatus;
  totalDraw: number;
  paidAmount?: number | null;
  paidDate?: string;
  paidAt?: any;
  submittedAt?: any;
  tradeLineItems?: DrawTradeItem[];
}

interface ClientDrawHistoryProps {
  projectId: string;
  /** Owner name (e.g. "Jordan & Jessica Christensen") */
  ownerName?: string;
  /** Full mailing address, e.g. "279 N Clegg Canyon Loop, Mapleton, UT" */
  projectAddress?: string;
  /** Optional handler for "View Supporting Documents" button on the in-progress draw. */
  onViewDocuments?: (drawId: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return Number(n || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDateLong(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}, ${m[1]}`;
}

function tsToYmd(ts: any): string | null {
  if (!ts) return null;
  if (typeof ts === 'string') return ts.slice(0, 10);
  if (typeof ts?.toDate === 'function') {
    try {
      const d = ts.toDate();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return null;
    }
  }
  return null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ClientDrawHistory({
  projectId,
  ownerName,
  projectAddress,
  onViewDocuments,
}: ClientDrawHistoryProps) {
  const [draws, setDraws] = useState<DrawPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    const q = query(
      collection(doc(db, 'projects', projectId), 'drawPeriods'),
      orderBy('drawNumber', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: DrawPeriod[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            drawNumber: Number(data.drawNumber) || 0,
            periodLabel: String(data.periodLabel || ''),
            periodStart: String(data.periodStart || ''),
            periodEnd: String(data.periodEnd || ''),
            processDate: String(data.processDate || ''),
            status: (data.status as DrawStatus) || 'open',
            totalDraw: Number(data.totalDraw) || 0,
            paidAmount: data.paidAmount ?? null,
            paidDate: data.paidDate || tsToYmd(data.paidAt) || undefined,
            paidAt: data.paidAt,
            submittedAt: data.submittedAt,
            tradeLineItems: Array.isArray(data.tradeLineItems)
              ? data.tradeLineItems
              : [],
          };
        });
        setDraws(rows);
        setLoading(false);
      },
      (err) => {
        console.error('[ClientDrawHistory] snapshot error:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [projectId]);

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <p className="text-sm text-gray-500 text-center font-sans">
            Loading draw history…
          </p>
        </CardContent>
      </Card>
    );
  }

  // The "in-progress" draw is the highest-numbered open or submitted draw.
  const inProgress = draws
    .filter((d) => d.status === 'open' || d.status === 'submitted')
    .sort((a, b) => b.drawNumber - a.drawNumber)[0];
  const past = draws
    .filter((d) => d.id !== inProgress?.id)
    .sort((a, b) => a.drawNumber - b.drawNumber);

  return (
    <div className="space-y-6" data-testid="client-draw-history">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${GOLD}1A` }}
        >
          <Wallet className="w-5 h-5" style={{ color: GOLD }} />
        </div>
        <div>
          <h2 className="text-xl font-bold font-heading uppercase tracking-wide" style={{ color: DARK }}>
            Project Draws{ownerName ? ` — ${ownerName}` : ''}
          </h2>
          {projectAddress && (
            <p className="text-sm text-gray-500 font-sans mt-0.5">
              {projectAddress}
            </p>
          )}
        </div>
      </div>

      {/* ── Past draws ──────────────────────────────────────────────────── */}
      {past.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
              {past.map((d) => (
                <PastClientDrawRow key={d.id} draw={d} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {past.length === 0 && !inProgress && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm text-gray-500 text-center font-sans">
              No draws yet. Your first draw will appear here once construction begins.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── In-progress draw ────────────────────────────────────────────── */}
      {inProgress && (
        <InProgressDrawCard
          draw={inProgress}
          onViewDocuments={onViewDocuments}
        />
      )}
    </div>
  );
}

// ── Past draw row (client view) ─────────────────────────────────────────────

function PastClientDrawRow({ draw }: { draw: DrawPeriod }) {
  const dateLabel = (() => {
    if (draw.status === 'paid' || draw.status === 'reconciled') {
      return fmtDateLong(draw.paidDate || tsToYmd(draw.paidAt) || '');
    }
    if (draw.status === 'submitted') {
      return fmtDateLong(tsToYmd(draw.submittedAt) || draw.processDate);
    }
    return fmtDateLong(draw.processDate);
  })();
  return (
    <div className="px-5 py-4 grid grid-cols-12 gap-3 items-center text-sm font-sans hover:bg-gray-50">
      <div className="col-span-3">
        <p className="font-semibold font-heading text-base" style={{ color: DARK }}>
          Draw #{draw.drawNumber}
        </p>
      </div>
      <div className="col-span-4 text-sm text-gray-600">
        {dateLabel}
      </div>
      <div className="col-span-3 text-right tabular-nums font-semibold" style={{ color: DARK }}>
        {fmtCurrency(draw.paidAmount ?? draw.totalDraw)}
      </div>
      <div className="col-span-2 flex justify-end">
        <ClientStatusBadge status={draw.status} />
      </div>
    </div>
  );
}

// ── In-progress draw card (client view) ─────────────────────────────────────

function InProgressDrawCard({
  draw,
  onViewDocuments,
}: {
  draw: DrawPeriod;
  onViewDocuments?: (drawId: string) => void;
}) {
  const items = (draw.tradeLineItems || []).filter(
    (t) => t.thisDrawAmount > 0,
  );
  return (
    <Card
      className="border-0 shadow-sm overflow-hidden"
      style={{ borderTop: `3px solid ${GOLD}` }}
    >
      <div
        className="px-5 py-4 border-b"
        style={{ borderColor: '#E5E7EB' }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium font-sans">
              In Progress
            </p>
            <h3
              className="text-2xl font-bold font-heading uppercase tracking-wide mt-0.5"
              style={{ color: DARK }}
            >
              DRAW #{draw.drawNumber}
            </h3>
            <div className="mt-2 flex items-center gap-3 text-sm text-gray-600 font-sans flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Period: {draw.periodLabel}
              </span>
            </div>
          </div>
          <ClientStatusBadge status={draw.status} />
        </div>
      </div>

      <CardContent className="p-5">
        {/* Amount */}
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium font-sans">
            Estimated Amount
          </p>
          <p
            className="text-3xl font-bold tabular-nums font-sans mt-1"
            style={{ color: GOLD }}
            data-testid="client-current-draw-amount"
          >
            {fmtCurrency(draw.totalDraw)}
          </p>
        </div>

        {/* Trade breakdown — client-safe (trade + % + amount only) */}
        {items.length > 0 && (
          <div className="mb-5">
            <div className="rounded-lg border" style={{ borderColor: '#E5E7EB' }}>
              <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
                {items.map((t) => (
                  <div
                    key={t.trade}
                    className="px-4 py-3 grid grid-cols-12 gap-3 items-center text-sm font-sans"
                  >
                    <div className="col-span-6 font-medium truncate" style={{ color: DARK }}>
                      {t.trade}
                    </div>
                    <div className="col-span-3 text-right tabular-nums font-semibold" style={{ color: DARK }}>
                      {fmtCurrency(t.thisDrawAmount)}
                    </div>
                    <div className="col-span-3 text-right text-xs text-gray-500 tabular-nums">
                      {t.percentComplete}% complete
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {items.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4 font-sans">
            Trade breakdown will appear here as work progresses this period.
          </p>
        )}

        {/* Supporting documents */}
        {onViewDocuments && (
          <div>
            <Button
              variant="outline"
              onClick={() => onViewDocuments(draw.id)}
              className="font-medium font-sans"
              style={{ borderColor: GOLD, color: GOLD_HOVER }}
              data-testid="view-supporting-documents-button"
            >
              <FileText className="w-4 h-4 mr-2" />
              View Supporting Documents
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Status badge (client view, same color system) ───────────────────────────

function ClientStatusBadge({ status }: { status: DrawStatus }) {
  const map: Record<
    DrawStatus,
    { color: string; bg: string; label: string; icon: React.ReactNode }
  > = {
    open: {
      color: '#4B5563',
      bg: 'rgba(107,114,128,0.12)',
      label: 'In Progress',
      icon: <Clock className="w-3 h-3" />,
    },
    submitted: {
      color: '#1D4ED8',
      bg: 'rgba(29,78,216,0.12)',
      label: 'Submitted',
      icon: <Layers className="w-3 h-3" />,
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
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
  };
  const m = map[status] || map.open;
  return (
    <Badge
      className="inline-flex items-center gap-1 text-[11px] font-medium font-sans px-2 py-0.5 rounded border-0"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      {m.icon}
      {m.label}
    </Badge>
  );
}
