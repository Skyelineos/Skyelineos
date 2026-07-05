// BidSolicitationPanel
//
// UI for the Automated Bid Solicitation System. Lives on the project Bids
// tab as the "Solicit Bids" panel. Lets Tyler:
//   • Pick which trades to solicit
//   • Queue the outreach to the seeded Utah County contractor list
//   • See each contractor row with a status badge
//   • Send/resend/remind/delete individual rows
//   • Fire "Send All Queued" once he's happy with the list
//
// Backend: /api/bids/solicit + /api/bids/solicitations/... (see
// functions/src/bids/bidSolicitationRoutes.ts)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Send,
  Bell,
  Trash2,
  RefreshCw,
  Mail,
  MailCheck,
  MailX,
  MailOpen,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

// ─── Types (mirror bidSolicitation.ts) ──────────────────────────────────────

type SolicitationStatus =
  | 'queued'
  | 'sent'
  | 'opened'
  | 'responded'
  | 'declined';

interface TradeMeta {
  slug: string;
  label: string;
  scope: string;
}

interface Solicitation {
  id: string;
  projectId: string;
  projectAddress?: string;
  trade: string;
  tradeLabel?: string;
  contractorName: string;
  contractorEmail: string;
  contractorPhone?: string;
  contractorCity?: string;
  status: SolicitationStatus;
  sentAt?: any;
  respondedAt?: any;
  bidAmount?: number;
  notes?: string;
}

// ─── Status badge styling ───────────────────────────────────────────────────

const STATUS_STYLES: Record<SolicitationStatus, { label: string; className: string; Icon: any }> = {
  queued:    { label: 'Queued',    className: 'bg-gray-100 text-gray-700 border-gray-300', Icon: Mail },
  sent:      { label: 'Sent',      className: 'bg-amber-50 text-amber-800 border-amber-300', Icon: MailCheck },
  opened:    { label: 'Opened',    className: 'bg-blue-50 text-blue-800 border-blue-300', Icon: MailOpen },
  responded: { label: 'Responded', className: 'bg-emerald-50 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  declined:  { label: 'Declined',  className: 'bg-rose-50 text-rose-700 border-rose-300', Icon: MailX },
};

function StatusBadge({ status }: { status: SolicitationStatus }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.queued;
  const Icon = s.Icon;
  return (
    <Badge variant="outline" className={`gap-1 ${s.className}`}>
      <Icon className="h-3 w-3" />
      {s.label}
    </Badge>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

interface BidSolicitationPanelProps {
  projectId: string;
  projectName?: string;
}

export function BidSolicitationPanel({ projectId, projectName }: BidSolicitationPanelProps) {
  const { toast } = useToast();
  const [trades, setTrades] = useState<TradeMeta[]>([]);
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());
  const [solicitations, setSolicitations] = useState<Solicitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  // ── Initial data load ─────────────────────────────────────────────────────
  const refreshSolicitations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/api/bids/solicitations/${projectId}`);
      setSolicitations(Array.isArray(data?.solicitations) ? data.solicitations : []);
    } catch (err: any) {
      toast({
        title: 'Failed to load solicitations',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    // Trades are static — load once.
    (async () => {
      try {
        const data = await apiRequest('/api/bids/trades');
        if (Array.isArray(data?.trades)) setTrades(data.trades);
      } catch (err) {
        console.warn('[BidSolicitationPanel] Failed to load trades', err);
      }
    })();
    refreshSolicitations();
  }, [refreshSolicitations]);

  // ── Derived — rows grouped by trade for display ───────────────────────────
  const rowsByTrade = useMemo(() => {
    const map: Record<string, Solicitation[]> = {};
    for (const s of solicitations) {
      const key = String(s.trade);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [solicitations]);

  // Counts for the top-of-panel summary line.
  const counts = useMemo(() => {
    const c = { total: solicitations.length, queued: 0, sent: 0, responded: 0, declined: 0 };
    for (const s of solicitations) {
      if (s.status === 'queued') c.queued += 1;
      else if (s.status === 'sent' || s.status === 'opened') c.sent += 1;
      else if (s.status === 'responded') c.responded += 1;
      else if (s.status === 'declined') c.declined += 1;
    }
    return c;
  }, [solicitations]);

  // ── Trade selection helpers ───────────────────────────────────────────────
  const toggleTrade = (slug: string) => {
    setSelectedTrades((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };
  const selectAllTrades = () => setSelectedTrades(new Set(trades.map((t) => t.slug)));
  const clearTradeSelection = () => setSelectedTrades(new Set());

  // ── Actions ───────────────────────────────────────────────────────────────
  const queueBidRequests = async () => {
    if (selectedTrades.size === 0) {
      toast({ title: 'Pick at least one trade first' });
      return;
    }
    setQueuing(true);
    try {
      const result = await apiRequest('/api/bids/solicit', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          trades: Array.from(selectedTrades),
        }),
      });
      toast({
        title: 'Bids queued',
        description: `Added ${result?.created ?? 0} contractors across ${selectedTrades.size} trade(s). ${result?.skippedDuplicates ? `Skipped ${result.skippedDuplicates} duplicates.` : ''}`,
      });
      setSelectedTrades(new Set());
      await refreshSolicitations();
    } catch (err: any) {
      toast({
        title: 'Failed to queue bids',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    } finally {
      setQueuing(false);
    }
  };

  const sendAllQueued = async () => {
    if (counts.queued === 0) {
      toast({ title: 'Nothing queued to send' });
      return;
    }
    setSendingAll(true);
    try {
      const result = await apiRequest(`/api/bids/solicit/${projectId}/send-all`, {
        method: 'POST',
      });
      const results = Array.isArray(result?.results) ? result.results : [];
      const sent = results.filter((r: any) => r.sent).length;
      const failed = results.length - sent;
      toast({
        title: 'Batch send complete',
        description: `Sent: ${sent}${failed ? ` · Failed: ${failed}` : ''}`,
        variant: failed > 0 ? 'destructive' : undefined,
      });
      await refreshSolicitations();
    } catch (err: any) {
      toast({
        title: 'Send All failed',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    } finally {
      setSendingAll(false);
    }
  };

  const rowAction = async (
    id: string,
    action: 'send' | 'remind' | 'delete',
  ) => {
    setRowBusy((prev) => ({ ...prev, [id]: true }));
    try {
      if (action === 'delete') {
        await apiRequest(`/api/bids/solicitations/${id}`, { method: 'DELETE' });
        toast({ title: 'Removed from queue' });
      } else if (action === 'send') {
        const res = await apiRequest(`/api/bids/solicitations/${id}/send`, { method: 'POST' });
        toast({
          title: res?.sent ? 'Email sent' : 'Send failed',
          description: res?.error || undefined,
          variant: res?.sent ? undefined : 'destructive',
        });
      } else if (action === 'remind') {
        const res = await apiRequest(`/api/bids/solicitations/${id}/remind`, { method: 'POST' });
        toast({
          title: res?.sent ? 'Reminder sent' : 'Reminder failed',
          description: res?.error || undefined,
          variant: res?.sent ? undefined : 'destructive',
        });
      }
      await refreshSolicitations();
    } catch (err: any) {
      toast({
        title: 'Action failed',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    } finally {
      setRowBusy((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="font-heading text-2xl">Solicit Bids</CardTitle>
            <CardDescription>
              Auto-outreach to Utah County contractors for {projectName || 'this project'}.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshSolicitations}
              disabled={loading}
              data-testid="button-refresh-solicitations"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
            <Button
              className="bg-brand-gold hover:bg-brand-gold/90 text-black"
              size="sm"
              onClick={sendAllQueued}
              disabled={sendingAll || counts.queued === 0}
              data-testid="button-send-all-queued"
            >
              {sendingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="ml-2">Send All Queued ({counts.queued})</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Summary strip */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">Total: {counts.total}</Badge>
          <Badge variant="outline" className="bg-gray-100">Queued: {counts.queued}</Badge>
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300">Sent: {counts.sent}</Badge>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300">Responded: {counts.responded}</Badge>
          {counts.declined > 0 && (
            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300">Declined: {counts.declined}</Badge>
          )}
        </div>

        {/* Trade checklist */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-heading text-lg">Pick trades to solicit</h3>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className="text-brand-gold hover:underline"
                onClick={selectAllTrades}
                data-testid="button-select-all-trades"
              >
                Select all
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                className="text-gray-500 hover:underline"
                onClick={clearTradeSelection}
                data-testid="button-clear-trades"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 border rounded-md p-3 bg-gray-50">
            {trades.map((t) => {
              const checked = selectedTrades.has(t.slug);
              return (
                <label
                  key={t.slug}
                  className={`flex items-center gap-2 text-sm p-2 rounded cursor-pointer transition-colors ${
                    checked ? 'bg-brand-gold/15 border border-brand-gold' : 'bg-white border border-transparent hover:bg-white'
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleTrade(t.slug)}
                    data-testid={`checkbox-trade-${t.slug}`}
                  />
                  <span>{t.label}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              className="bg-brand-gold hover:bg-brand-gold/90 text-black"
              onClick={queueBidRequests}
              disabled={queuing || selectedTrades.size === 0}
              data-testid="button-queue-bid-requests"
            >
              {queuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              <span className="ml-2">Find Contractors &amp; Queue Emails ({selectedTrades.size})</span>
            </Button>
          </div>
        </div>

        {/* Contractor rows */}
        <div className="space-y-4">
          <h3 className="font-heading text-lg">Contractors</h3>

          {loading && solicitations.length === 0 && (
            <div className="text-sm text-gray-500 py-6 text-center">Loading…</div>
          )}

          {!loading && solicitations.length === 0 && (
            <div className="border-2 border-dashed rounded-md p-8 text-center text-sm text-gray-500">
              No contractors queued yet. Pick your trades above and hit “Find Contractors &amp; Queue Emails”.
            </div>
          )}

          {Object.entries(rowsByTrade).map(([tradeKey, rows]) => {
            const meta = trades.find((t) => t.slug === tradeKey);
            return (
              <div key={tradeKey} className="border rounded-md">
                <div className="flex items-center justify-between bg-gray-50 border-b px-4 py-2">
                  <div>
                    <div className="font-heading text-base">{meta?.label || tradeKey}</div>
                    {meta?.scope && <div className="text-xs text-gray-500 mt-0.5">{meta.scope}</div>}
                  </div>
                  <Badge variant="outline">{rows.length}</Badge>
                </div>
                <div className="divide-y">
                  {rows.map((row) => {
                    const busy = !!rowBusy[row.id];
                    return (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        data-testid={`row-solicitation-${row.id}`}
                      >
                        <div className="min-w-[220px]">
                          <div className="font-medium">{row.contractorName}</div>
                          <div className="text-xs text-gray-500">
                            {row.contractorEmail}
                            {row.contractorCity ? ` · ${row.contractorCity}` : ''}
                          </div>
                        </div>
                        <StatusBadge status={row.status} />
                        <div className="flex gap-1">
                          {row.status === 'queued' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rowAction(row.id, 'send')}
                              disabled={busy}
                              data-testid={`button-send-${row.id}`}
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                              <span className="ml-1.5">Send</span>
                            </Button>
                          )}
                          {(row.status === 'sent' || row.status === 'opened') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rowAction(row.id, 'remind')}
                              disabled={busy}
                              data-testid={`button-remind-${row.id}`}
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                              <span className="ml-1.5">Remind</span>
                            </Button>
                          )}
                          {row.status !== 'queued' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rowAction(row.id, 'send')}
                              disabled={busy}
                              data-testid={`button-resend-${row.id}`}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              <span className="ml-1.5">Resend</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            onClick={() => rowAction(row.id, 'delete')}
                            disabled={busy}
                            data-testid={`button-delete-${row.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default BidSolicitationPanel;
