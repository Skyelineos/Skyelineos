// BidDetailSlideOver
//
// A right-side slide-over panel that shows full bid details for a given
// bidRequestId. Opens when the GC clicks a trade row in BidCoveragePanel.
//
// Features:
//  • Sub name / company / trade
//  • Bid total prominently in brand gold
//  • Line items table
//  • Markup breakdown (overhead %, profit %, tax %)
//  • Inclusions / exclusions note
//  • Insurance + license status (green check / red flag)
//  • "Award Bid" → opens AwardBidModal
//  • "Request Revision" → placeholder toast
//  • "Share with Client" → posts to project's #budget channel

import { useEffect, useState } from 'react';
import {
  collection, query, where, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Award, Shield, Building2, CheckCircle2, XCircle, FileText,
  Send, RefreshCw, ChevronLeft, ChevronRight, MessageSquare,
} from 'lucide-react';
import { AwardBidModal } from './AwardBidModal';
import { sendMessage, listenChannels } from '@/lib/messaging/firestore';
import type { PortalBid, BidPricingSnapshot } from './types';

interface Props {
  open: boolean;
  projectId: string;
  bidRequestId: string | null;
  tradeLabel: string;
  onClose: () => void;
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function CompliancePill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 ${
      ok
        ? 'bg-green-50 text-green-700 border border-green-200'
        : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      {ok
        ? <CheckCircle2 className="w-3 h-3" />
        : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}

export function BidDetailSlideOver({ open, projectId, bidRequestId, tradeLabel, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [bids, setBids] = useState<PortalBid[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);                   // which bid is displayed
  const [awardingBid, setAwardingBid] = useState<PortalBid | null>(null);
  const [sharing, setSharing] = useState(false);
  const [budgetChannelId, setBudgetChannelId] = useState<string | null>(null);

  // Load bids whenever the panel opens / bidRequestId changes.
  // NOTE: We query by bidRequestId only (no orderBy) to avoid needing a
  // composite Firestore index. Results are sorted client-side by totalAmount.
  useEffect(() => {
    if (!open || !bidRequestId) { setBids([]); setIdx(0); return; }
    setLoading(true);
    const q = query(
      collection(db, 'bids'),
      where('bidRequestId', '==', bidRequestId),
    );
    getDocs(q)
      .then(snap => {
        const rows = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as PortalBid))
          .sort((a, b) => (a.totalAmount ?? 0) - (b.totalAmount ?? 0));
        setBids(rows);
        // Start on the awarded bid if one exists, else the lowest.
        const awardedIdx = rows.findIndex(b => b.status === 'awarded');
        setIdx(awardedIdx >= 0 ? awardedIdx : 0);
      })
      .catch((err) => {
        console.error('[BidDetailSlideOver] Failed to load bids:', err);
      })
      .finally(() => setLoading(false));
  }, [open, bidRequestId]);

  // Listen for the budget channel id once when the panel opens.
  useEffect(() => {
    if (!open || !projectId) return;
    const unsub = listenChannels(projectId, channels => {
      const budget = channels.find(c => c.kind === 'budget');
      setBudgetChannelId(budget?.id || null);
    });
    return () => unsub();
  }, [open, projectId]);

  const bid = bids[idx] ?? null;

  async function handleShareWithClient() {
    if (!bid || !budgetChannelId) {
      toast({
        title: 'No budget channel found',
        description: 'Ensure the project has a #budget channel.',
        variant: 'destructive',
      });
      return;
    }
    if (!user) return;
    setSharing(true);
    try {
      const inclusions = bid.notes ? bid.notes.slice(0, 200) : 'as specified in scope';
      const exclusions = ''; // sub-submitted exclusions field (future; omit if blank)
      const text = [
        `📋 *${bid.trade || tradeLabel} bid received:* ${fmtMoney(bid.totalAmount)} from ${bid.subName}${bid.subCompany ? ` (${bid.subCompany})` : ''}.`,
        inclusions ? `Includes: ${inclusions}.` : null,
        exclusions ? `Excludes: ${exclusions}.` : null,
        'Recommend awarding — let me know your thoughts.',
      ].filter(Boolean).join(' ');

      await sendMessage(projectId, budgetChannelId, {
        text,
        authorUid: user.id?.toString() || '',
        authorName: user.name || user.email || 'GC',
        authorRole: user.role,
      });
      toast({ title: 'Shared to #budget channel ✓' });
    } catch (e: any) {
      toast({ title: 'Share failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSharing(false);
    }
  }

  function handleRequestRevision() {
    toast({
      title: 'Revision request sent',
      description: `${bid?.subName} will be notified to update their bid.`,
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[520px] overflow-y-auto flex flex-col p-0"
          style={{ backgroundColor: '#FAFAF6' }}
        >
          {/* ── Header ───────────────────────────────────────────── */}
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
            <SheetTitle
              className="font-[Cormorant_Garamond,serif] text-2xl leading-tight text-[#141414]"
            >
              {tradeLabel}
            </SheetTitle>
            <SheetDescription className="text-sm text-gray-500">
              {bids.length === 0 ? 'Loading bids…' : `${bids.length} bid${bids.length === 1 ? '' : 's'} received`}
            </SheetDescription>

            {/* Bid navigator when multiple bids exist */}
            {bids.length > 1 && (
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setIdx(i => Math.max(0, i - 1))}
                  disabled={idx === 0}
                  className="p-1 rounded border disabled:opacity-30 hover:bg-gray-100"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500">
                  {idx + 1} / {bids.length}
                </span>
                <button
                  onClick={() => setIdx(i => Math.min(bids.length - 1, i + 1))}
                  disabled={idx === bids.length - 1}
                  className="p-1 rounded border disabled:opacity-30 hover:bg-gray-100"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-400 ml-1">
                  sorted lowest → highest
                </span>
              </div>
            )}
          </SheetHeader>

          {/* ── Body ─────────────────────────────────────────────── */}
          <div className="flex-1 px-6 py-5 space-y-6 overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading bids…
              </div>
            )}

            {!loading && bids.length === 0 && (
              <div className="text-center text-sm text-gray-400 py-8">
                No bids submitted yet for this trade.
              </div>
            )}

            {bid && (
              <>
                {/* Sub identity */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-[#141414]">{bid.subName}</div>
                    {bid.subCompany && (
                      <div className="text-sm text-gray-500">{bid.subCompany}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[11px]">{bid.trade || tradeLabel}</Badge>
                      {bid.status === 'awarded' && (
                        <Badge className="text-[11px] bg-green-600 text-white border-0">Awarded</Badge>
                      )}
                      {bids.length > 1 && idx === 0 && bid.status !== 'awarded' && (
                        <Badge className="text-[11px] border-0" style={{ backgroundColor: '#C9A96E', color: '#fff' }}>
                          Lowest
                        </Badge>
                      )}
                    </div>
                  </div>
                  {/* Compliance pills */}
                  <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
                    <CompliancePill ok={!!(bid.insurance?.carrier && bid.insurance?.policyNumber)} label="Insurance" />
                    <CompliancePill ok={!!bid.contractorLicense?.number} label="License" />
                  </div>
                </div>

                {/* ── Bid total ─────────────────────────────────── */}
                <div className="rounded-xl border border-[#C9A96E]/30 bg-white px-5 py-4">
                  <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Bid Total</div>
                  <div
                    className="text-4xl font-bold font-[Inter,sans-serif] tracking-tight"
                    style={{ color: '#C9A96E' }}
                  >
                    {fmtMoney(bid.totalAmount)}
                  </div>
                  {bid.subtotal !== undefined && bid.subtotal !== bid.totalAmount && (
                    <div className="text-xs text-gray-400 mt-1">
                      Subtotal {fmtMoney(bid.subtotal)}
                      {bid.taxAmount ? ` + Tax ${fmtMoney(bid.taxAmount)}` : ''}
                    </div>
                  )}
                </div>

                {/* ── Markup breakdown ──────────────────────────── */}
                {bid.pricing && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Pricing Breakdown</div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Overhead', value: bid.pricing.overheadPct },
                        { label: 'Profit', value: bid.pricing.markupPct },
                        { label: 'Tax', value: bid.pricing.taxPct },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-center">
                          <div className="text-lg font-semibold text-[#141414]">{fmtPct(value)}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{label}</div>
                        </div>
                      ))}
                    </div>
                    {bid.pricingSnapshot && (
                      <div className="mt-2 text-[11px] text-gray-400 flex flex-wrap gap-x-4 gap-y-0.5 px-1">
                        <span>Base {fmtMoney(bid.pricingSnapshot.baseSubtotal)}</span>
                        <span>+ Overhead {fmtMoney(bid.pricingSnapshot.overheadAmt)}</span>
                        <span>+ Markup {fmtMoney(bid.pricingSnapshot.markupAmt)}</span>
                        {bid.pricingSnapshot.taxAmt > 0 && (
                          <span>+ Tax {fmtMoney(bid.pricingSnapshot.taxAmt)}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Line items ────────────────────────────────── */}
                {bid.lineItems && bid.lineItems.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Line Items</div>
                    <div className="rounded-lg border border-gray-100 overflow-hidden bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b text-xs text-gray-400 uppercase">
                          <tr>
                            <th className="text-left px-3 py-2">Description</th>
                            <th className="text-right px-3 py-2 w-14">Qty</th>
                            <th className="text-right px-3 py-2 w-20">Unit $</th>
                            <th className="text-right px-3 py-2 w-22">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bid.lineItems.map(l => (
                            <tr key={l.id} className="border-b last:border-0">
                              <td className="px-3 py-2 text-[#141414]">{l.description}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{l.qty}</td>
                              <td className="px-3 py-2 text-right font-mono text-gray-600">{fmtMoney(l.unitCost)}</td>
                              <td className="px-3 py-2 text-right font-mono font-medium">{fmtMoney(l.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2">
                            <td colSpan={3} className="px-3 py-2 text-right font-semibold text-gray-700">Total</td>
                            <td className="px-3 py-2 text-right font-bold font-mono" style={{ color: '#C9A96E' }}>
                              {fmtMoney(bid.totalAmount)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Notes / inclusions / exclusions ──────────── */}
                {bid.notes && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Notes / Inclusions / Exclusions</div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-100 rounded-lg px-4 py-3">
                      {bid.notes}
                    </p>
                  </div>
                )}

                {/* ── Compliance detail ─────────────────────────── */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-gray-100 bg-white px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 flex items-center gap-1 mb-2">
                      <Shield className="w-3 h-3" /> Insurance
                    </div>
                    {bid.insurance?.carrier ? (
                      <div className="space-y-0.5 text-xs">
                        <div className="font-medium text-[#141414]">{bid.insurance.carrier}</div>
                        <div className="text-gray-500">Policy: {bid.insurance.policyNumber || '—'}</div>
                        {bid.insurance.expiration && (
                          <div className="text-gray-500">Exp: {bid.insurance.expiration}</div>
                        )}
                        {bid.insurance.certificateUrl && (
                          <a
                            href={bid.insurance.certificateUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#C9A96E] hover:underline mt-1"
                          >
                            <FileText className="w-3 h-3" /> View COI
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-red-500 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Not provided
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-gray-100 bg-white px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 flex items-center gap-1 mb-2">
                      <Building2 className="w-3 h-3" /> License
                    </div>
                    {bid.contractorLicense?.number ? (
                      <div className="space-y-0.5 text-xs">
                        <div className="font-medium text-[#141414]">{bid.contractorLicense.number}</div>
                        <div className="text-gray-500">{bid.contractorLicense.state}{bid.contractorLicense.type ? ` · ${bid.contractorLicense.type}` : ''}</div>
                        {bid.contractorLicense.expiration && (
                          <div className="text-gray-500">Exp: {bid.contractorLicense.expiration}</div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-red-500 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Not provided
                      </div>
                    )}
                  </div>
                </div>

                {bid.agreementAcknowledged && (
                  <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Sub acknowledged subcontractor agreement requirement.
                  </div>
                )}

                {/* ── Attachments ───────────────────────────────── */}
                {bid.attachments && bid.attachments.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Attachments</div>
                    <div className="flex flex-wrap gap-2">
                      {bid.attachments.map((a, i) => (
                        <a
                          key={i}
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs border rounded-full px-3 py-1 text-[#C9A96E] hover:underline bg-white"
                        >
                          <FileText className="w-3 h-3" />
                          {a.name}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Action footer ─────────────────────────────────────── */}
          {bid && (
            <div className="border-t border-gray-100 px-6 py-4 bg-white space-y-2.5">
              {/* Award — primary CTA */}
              {bid.status !== 'awarded' && (
                <Button
                  className="w-full gap-2 text-white font-semibold h-10"
                  style={{ backgroundColor: '#C9A96E' }}
                  onClick={() => setAwardingBid(bid)}
                >
                  <Award className="w-4 h-4" />
                  Award Bid
                </Button>
              )}
              {bid.status === 'awarded' && (
                <div className="flex items-center justify-center gap-2 text-sm text-green-700 font-medium py-1">
                  <CheckCircle2 className="w-4 h-4" />
                  This bid has been awarded
                </div>
              )}

              {/* Secondary actions */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="gap-1.5 text-xs h-9"
                  onClick={handleRequestRevision}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Request Revision
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5 text-xs h-9 border-[#C9A96E] text-[#C9A96E] hover:bg-amber-50"
                  onClick={handleShareWithClient}
                  disabled={sharing || !budgetChannelId}
                  title={!budgetChannelId ? 'No #budget channel found' : 'Share to #budget channel'}
                >
                  {sharing
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <MessageSquare className="w-3.5 h-3.5" />}
                  Share with Client
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Award modal — triggered by the CTA button above */}
      <AwardBidModal
        open={!!awardingBid}
        bid={awardingBid}
        onClose={() => { setAwardingBid(null); onClose(); }}
      />
    </>
  );
}
