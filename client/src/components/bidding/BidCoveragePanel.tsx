// BidCoveragePanel
//
// Shows Tyler, at a glance, every trade we need on a project and which ones
// still don't have bids. Lives at the top of the project Bids tab so the
// gaps are the first thing he sees when he walks the job.
//
// Status colors mirror the rest of the bid flow:
//   🔴 MISSING    - no bid request sent
//   🟡 INVITED    - sent, waiting on subs
//   🔵 SUBMITTED  - at least one sub responded
//   🟣 ANALYZED   - we've run analysis
//   🟢 AWARDED    - trade is locked in
//
// Backend: GET /api/projects/:id/bids/coverage (see bidCoverageRoute.ts)

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Send, AlertCircle, CheckCircle2, Clock, FileSearch, Inbox, RefreshCw } from 'lucide-react';
import { SendBidPackageModal } from './SendBidPackageModal';

type CoverageStatus = 'MISSING' | 'INVITED' | 'SUBMITTED' | 'ANALYZED' | 'AWARDED';

interface CoverageRow {
  trade: string;        // phase id, e.g. 'FOUNDATION'
  label: string;        // human label, e.g. 'Foundation / Concrete'
  status: CoverageStatus;
  bidRequestId: string | null;
  vendorCount: number;
  lowestBid: number | null;
  awardedBid: number | null;
  awardedTo: string | null;
}

interface CoverageResponse {
  projectId: string;
  projectName: string;
  trades: CoverageRow[];
  summary: {
    total: number;
    awarded: number;
    analyzed: number;
    submitted: number;
    invited: number;
    missing: number;
  };
}

interface Props {
  projectId: string;
}

// Small helpers — kept local so we don't drag in a money-format util just
// for two cells.
function fmtMoney(n: number | null): string {
  if (n === null || n === undefined) return '—';
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const STATUS_META: Record<CoverageStatus, { label: string; dot: string; badge: string; icon: typeof Inbox }> = {
  MISSING:   { label: 'Missing',   dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200',           icon: AlertCircle },
  INVITED:   { label: 'Invited',   dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700 border-amber-200',     icon: Clock },
  SUBMITTED: { label: 'Submitted', dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700 border-blue-200',        icon: Inbox },
  ANALYZED:  { label: 'Analyzed',  dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700 border-purple-200',  icon: FileSearch },
  AWARDED:   { label: 'Awarded',   dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700 border-green-200',     icon: CheckCircle2 },
};

export function BidCoveragePanel({ projectId }: Props) {
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);

  async function load(silent = false) {
    if (!projectId) return;
    if (silent) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const json = (await apiRequest(`/api/projects/${projectId}/bids/coverage`)) as CoverageResponse;
      setData(json);
    } catch (e: any) {
      setError(e?.message || 'Failed to load bid coverage');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // After the user closes the send-bid modal, refresh coverage so a brand
  // new MISSING trade can flip to INVITED without a full page reload.
  function handleSendModalClose() {
    setSendModalOpen(false);
    void load(true);
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Bid Coverage</CardTitle>
          <CardDescription>Loading trade coverage…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-red-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            Bid Coverage
          </CardTitle>
          <CardDescription className="text-red-600">
            {error || 'Could not load coverage.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { trades, summary, projectName } = data;
  const covered = summary.total - summary.missing;
  const coveragePct = summary.total > 0 ? Math.round((covered / summary.total) * 100) : 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Bid Coverage
                <span className="text-xs font-normal text-gray-500">
                  {projectName ? `· ${projectName}` : ''}
                </span>
              </CardTitle>
              <CardDescription>
                {covered} of {summary.total} trades covered
                {summary.missing > 0 && (
                  <> — <span className="text-red-600 font-medium">{summary.missing} missing</span></>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => void load(true)}
                disabled={refreshing}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Coverage bar — green = awarded/analyzed, blue = submitted,
              amber = invited, red strip on the right = missing. Lets Tyler
              eyeball "where are we?" without reading any numbers. */}
          <div className="mt-3 h-2 w-full bg-gray-100 rounded overflow-hidden flex">
            <div className="bg-green-500" style={{ width: `${(summary.awarded / summary.total) * 100}%` }} />
            <div className="bg-purple-500" style={{ width: `${(summary.analyzed / summary.total) * 100}%` }} />
            <div className="bg-blue-500" style={{ width: `${(summary.submitted / summary.total) * 100}%` }} />
            <div className="bg-amber-500" style={{ width: `${(summary.invited / summary.total) * 100}%` }} />
            <div className="bg-red-500" style={{ width: `${(summary.missing / summary.total) * 100}%` }} />
          </div>

          {/* Status chips summary */}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {summary.awarded} Awarded
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              {summary.analyzed} Analyzed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {summary.submitted} Submitted
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {summary.invited} Invited
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {summary.missing} Missing
            </span>
            <span className="ml-auto text-gray-500">{coveragePct}% covered</span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="divide-y border-t">
            {trades.map((row) => {
              const meta = STATUS_META[row.status];
              const Icon = meta.icon;
              return (
                <div
                  key={row.trade}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {row.label}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-medium border ${meta.badge}`}
                      >
                        <Icon className="w-2.5 h-2.5 mr-1" />
                        {meta.label}
                      </Badge>
                    </div>
                    {row.status !== 'MISSING' && (
                      <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {row.vendorCount > 0 && <span>{row.vendorCount} vendor{row.vendorCount === 1 ? '' : 's'}</span>}
                        {row.lowestBid !== null && row.status !== 'AWARDED' && (
                          <span>Low: {fmtMoney(row.lowestBid)}</span>
                        )}
                        {row.status === 'AWARDED' && (
                          <>
                            {row.awardedTo && <span className="text-green-700 font-medium">{row.awardedTo}</span>}
                            {row.awardedBid !== null && <span>{fmtMoney(row.awardedBid)}</span>}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {row.status === 'MISSING' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => setSendModalOpen(true)}
                    >
                      <Send className="w-3 h-3 mr-1" />
                      Request Bid
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Reuses the existing send-bid modal — opens with no trade pre-selected
          so Tyler can pick from the dropdown. (Modal currently doesn't accept
          a trade prop; if/when it does, wire it here.) */}
      <SendBidPackageModal
        open={sendModalOpen}
        projectId={projectId}
        onClose={handleSendModalClose}
      />
    </>
  );
}
