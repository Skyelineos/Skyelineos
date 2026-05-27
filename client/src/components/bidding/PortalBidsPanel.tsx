import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, orderBy,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Hammer, Send, Award, Clock, CheckCircle2, Eye, FileText, Shield, Building2, Trash2,
} from 'lucide-react';
import { SendBidPackageModal } from './SendBidPackageModal';
import { AwardBidModal } from './AwardBidModal';
import { BidRequestDetailModal } from './BidRequestDetailModal';
import type { PortalBid, BidRequest } from './types';

interface Props {
  projectId: string;
  projectName?: string;
}

export function PortalBidsPanel({ projectId, projectName }: Props) {
  const [requests, setRequests] = useState<BidRequest[]>([]);
  const [bids, setBids] = useState<PortalBid[]>([]);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [awardingBid, setAwardingBid] = useState<PortalBid | null>(null);
  const [viewingBid, setViewingBid] = useState<PortalBid | null>(null);
  const [viewingRequest, setViewingRequest] = useState<BidRequest | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleDeleteRequest(req: BidRequest) {
    const ok = window.confirm(
      `Delete this bid request?\n\n  ${req.trade} — sent ${(req.createdAt as any)?.toDate?.()?.toLocaleDateString?.() || ''}\n\nThis will remove the request, any pending invite links, and (if no other trades remain in this package) the parent package shell. Sub-side bid submissions stay intact.`
    );
    if (!ok) return;
    setDeletingId(req.id);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await fetch('/api/bid-requests/delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId, bidRequestId: req.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || `Delete failed (${res.status})`);
      // Optimistic local removal — the onSnapshot listener will also pick up
      // the deletion within a moment, but updating local state immediately
      // makes the tile vanish without waiting on the Firestore round-trip.
      setRequests(prev => prev.filter(r => r.id !== req.id));
      toast({
        title: 'Bid request deleted',
        description: data.parentPackageDeleted
          ? `${req.trade} removed (parent package also cleaned up — it had no other trades).`
          : `${req.trade} removed. ${data.deletedTokens} invite link${data.deletedTokens === 1 ? '' : 's'} invalidated.`,
      });
    } catch (e: any) {
      toast({
        title: 'Could not delete',
        description: e?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  }

  // Bid requests for this project
  useEffect(() => {
    if (!projectId) return;
    const q = query(
      collection(db, 'projects', projectId, 'bidRequests'),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      q,
      snap => {
        setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as BidRequest)));
      },
      err => {
        // Log instead of silently swallowing — a permissions or query error
        // here was previously invisible and would leave stale tiles on screen.
        console.error('[PortalBidsPanel] bidRequests snapshot error:', err);
      },
    );
  }, [projectId]);

  // Portal-submitted bids for this project
  useEffect(() => {
    if (!projectId) return;
    const q = query(
      collection(db, 'bids'),
      where('projectId', '==', projectId),
      where('submittedViaPortal', '==', true),
      orderBy('submittedAt', 'desc'),
    );
    return onSnapshot(q, snap => {
      setBids(snap.docs.map(d => ({ id: d.id, ...d.data() } as PortalBid)));
    }, () => {});
  }, [projectId]);

  // Group bids by trade for comparison
  const bidsByTrade: Record<string, PortalBid[]> = {};
  bids.forEach(b => {
    const key = b.trade || 'Other';
    if (!bidsByTrade[key]) bidsByTrade[key] = [];
    bidsByTrade[key].push(b);
  });
  const trades = Object.keys(bidsByTrade);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Hammer className="w-5 h-5 text-[#C9A96E]" />
              Bid Packages
            </CardTitle>
            <CardDescription>
              Open packages, sub responses, and reminders — click a tile to see who's been invited and who's submitted.
            </CardDescription>
          </div>
          <Button
            onClick={() => setRequestModalOpen(true)}
            className="gap-1.5 text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            <Send className="w-4 h-4" /> Create new bid package
          </Button>
        </CardHeader>
        <CardContent>
          {/* Open requests strip — clickable tiles. Each tile opens the
              BidRequestDetailModal which lists invited subs, submission status,
              and a "Send reminder" button (dispatches email + SMS via the
              shared notifications pipeline). */}
          {requests.length > 0 && (
            <div className="mb-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Open Packages</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {requests.filter(r => r.status === 'open').map(r => {
                  const reqDate = (r.createdAt as any)?.toDate?.()?.toLocaleDateString?.() || '—';
                  const submittedCount = bids.filter(b => (b as any).bidRequestId === r.id).length;
                  const isDeleting = deletingId === r.id;
                  return (
                    <div
                      key={r.id}
                      className={`relative border rounded-lg bg-gray-50 hover:bg-amber-50/40 hover:border-[#C9A96E] transition-colors ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => setViewingRequest(r)}
                        className="w-full p-2.5 pr-9 text-left"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{r.trade}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {submittedCount} / {r.invitedSubIds.length}
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-500 flex items-center justify-between">
                          <span>Sent {reqDate}</span>
                          <span>Due {r.dueDate}</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label="Delete bid request"
                        title="Delete this bid request"
                        disabled={isDeleting}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRequest(r);
                        }}
                        className="absolute top-1.5 right-1.5 p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bids comparison grouped by trade */}
          {trades.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">
              No portal bids yet. Click <strong>Create new bid package</strong> to invite subs.
            </div>
          ) : (
            <div className="space-y-4">
              {trades.map(trade => {
                const tradeBids = bidsByTrade[trade].sort((a, b) => a.totalAmount - b.totalAmount);
                const lowest = tradeBids[0]?.totalAmount;
                return (
                  <div key={trade}>
                    <h3 className="font-semibold text-sm text-gray-900 mb-2">{trade}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-gray-500 uppercase border-b">
                          <tr>
                            <th className="text-left py-1.5">Sub</th>
                            <th className="text-left py-1.5">Compliance</th>
                            <th className="text-right py-1.5">Bid Total</th>
                            <th className="text-left py-1.5">Status</th>
                            <th className="text-right py-1.5">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tradeBids.map(b => {
                            const isLowest = b.totalAmount === lowest;
                            const insOk = b.insurance?.carrier && b.insurance?.policyNumber;
                            const licOk = b.contractorLicense?.number;
                            return (
                              <tr key={b.id} className={`border-b last:border-0 ${isLowest && b.status === 'received' ? 'bg-amber-50' : ''}`}>
                                <td className="py-2">
                                  <div className="font-medium">{b.subName}</div>
                                  {b.subCompany && <div className="text-xs text-gray-500">{b.subCompany}</div>}
                                </td>
                                <td className="py-2">
                                  <div className="flex items-center gap-1">
                                    <Shield className={`w-3 h-3 ${insOk ? 'text-green-500' : 'text-gray-300'}`} />
                                    <Building2 className={`w-3 h-3 ${licOk ? 'text-green-500' : 'text-gray-300'}`} />
                                    {b.agreementAcknowledged && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                                  </div>
                                </td>
                                <td className="py-2 text-right font-mono font-semibold">
                                  ${b.totalAmount.toLocaleString()}
                                  {isLowest && b.status === 'received' && <div className="text-[10px] text-amber-600 uppercase font-bold">lowest</div>}
                                </td>
                                <td className="py-2">
                                  <Badge variant={b.status === 'awarded' ? 'default' : 'outline'} className="text-[10px]">
                                    {b.status}
                                  </Badge>
                                </td>
                                <td className="py-2 text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => setViewingBid(b)}>
                                      <Eye className="w-3.5 h-3.5" />
                                    </Button>
                                    {b.status === 'received' && (
                                      <Button
                                        size="sm"
                                        className="text-white gap-1.5 h-7"
                                        style={{ backgroundColor: '#C9A96E' }}
                                        onClick={() => setAwardingBid(b)}
                                      >
                                        <Award className="w-3 h-3" /> Award
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bid detail viewer */}
      {viewingBid && (
        <BidDetailViewer bid={viewingBid} onClose={() => setViewingBid(null)} />
      )}

      <SendBidPackageModal
        open={requestModalOpen}
        projectId={projectId}
        projectName={projectName}
        onClose={() => setRequestModalOpen(false)}
      />
      <AwardBidModal
        open={!!awardingBid}
        bid={awardingBid}
        onClose={() => setAwardingBid(null)}
      />
      {viewingRequest && (
        <BidRequestDetailModal
          request={viewingRequest}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setViewingRequest(null)}
        />
      )}
    </div>
  );
}

// ─── Bid detail modal ────────────────────────────────────────────────────────

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

function BidDetailViewer({ bid, onClose }: { bid: PortalBid; onClose: () => void }) {
  return (
    <Dialog open={true} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bid.trade} bid · {bid.subName}</DialogTitle>
          <DialogDescription>
            Submitted {bid.submittedAt?.toDate?.().toLocaleDateString() || '—'} · {bid.subCompany || ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Line items */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                <tr>
                  <th className="text-left p-2">Description</th>
                  <th className="text-right p-2 w-16">Qty</th>
                  <th className="text-left p-2 w-20">Unit</th>
                  <th className="text-right p-2 w-24">Unit $</th>
                  <th className="text-right p-2 w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {bid.lineItems.map(l => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="p-2">{l.description}</td>
                    <td className="text-right p-2">{l.qty}</td>
                    <td className="p-2 text-xs">{l.unit}</td>
                    <td className="text-right p-2 font-mono">${l.unitCost.toLocaleString()}</td>
                    <td className="text-right p-2 font-mono">${l.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td colSpan={4} className="p-2 text-right font-semibold">Total</td>
                  <td className="text-right p-2 font-bold font-mono">${bid.totalAmount.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {bid.notes && (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{bid.notes}</p>
            </div>
          )}

          {/* Compliance */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500 flex items-center gap-1 mb-1.5">
                <Shield className="w-3 h-3" /> Insurance
              </p>
              <div className="text-xs space-y-0.5">
                <div><strong>Carrier:</strong> {bid.insurance?.carrier || '—'}</div>
                <div><strong>Policy:</strong> {bid.insurance?.policyNumber || '—'}</div>
                <div><strong>Expires:</strong> {bid.insurance?.expiration || '—'}</div>
                {bid.insurance?.certificateUrl && (
                  <a href={bid.insurance.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-[#C9A96E] hover:underline flex items-center gap-1 mt-1">
                    <FileText className="w-3 h-3" /> View COI
                  </a>
                )}
              </div>
            </div>
            <div className="border rounded p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500 flex items-center gap-1 mb-1.5">
                <Building2 className="w-3 h-3" /> License
              </p>
              <div className="text-xs space-y-0.5">
                <div><strong>Number:</strong> {bid.contractorLicense?.number || '—'}</div>
                <div><strong>State:</strong> {bid.contractorLicense?.state || '—'}</div>
                {bid.contractorLicense?.expiration && (
                  <div><strong>Expires:</strong> {bid.contractorLicense.expiration}</div>
                )}
              </div>
            </div>
          </div>

          {bid.agreementAcknowledged && (
            <div className="bg-green-50 border border-green-200 rounded p-2.5 text-xs text-green-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Sub acknowledged that signing the subcontractor agreement is required before work begins.
            </div>
          )}

          {bid.attachments && bid.attachments.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Attachments</p>
              <div className="flex flex-wrap gap-1.5">
                {bid.attachments.map((a, i) => (
                  <a
                    key={i}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#C9A96E] hover:underline border rounded px-2 py-1"
                  >
                    <FileText className="w-3 h-3" /> {a.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
