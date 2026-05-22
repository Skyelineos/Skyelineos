import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { CheckCircle2, DollarSign, Palette, AlertCircle } from 'lucide-react';
import type { SelectionBid, SelectionLifecycle } from '@/types/selections-template-extensions';

interface Props {
  projectId: string;
}

interface SelectionRow {
  id: string;
  item?: string;
  category?: string;
  subcategory?: string;
  room?: string;
  phase?: string;
  allowanceAmount?: number | null;
  bids?: SelectionBid[];
  lifecycle?: SelectionLifecycle;
  acceptedBidId?: string;
  designSignoff?: any;
  costSignoff?: any;
  gcApproved?: boolean;
  notes?: string;
  items?: Array<{ id: string; productName: string; vendor: string; imageUrls?: string[] }>;
  selectedOptionId?: string;
}

/**
 * Contractor sign-off queue.
 *
 * Shows selections in two states the GC needs to act on:
 *  1. "Bids-Received" — vendor bids are in, contractor reviews cost + design and approves
 *  2. "Pending design sign-off only" or "Pending cost sign-off only" — partial approvals
 *
 * The GC can approve cost, approve design, or do both in one click. Selection only
 * becomes orderable when BOTH are signed off (gcApproved = true).
 */
export default function ContractorSignoffQueue({ projectId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading } = useQuery<SelectionRow[]>({
    queryKey: ['signoff-queue', projectId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'projects', projectId, 'selections'));
      return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    },
  });

  const queue = useMemo(
    () => rows.filter(r =>
      r.lifecycle === 'Bids-Received' ||
      (r.designSignoff && !r.costSignoff) ||
      (r.costSignoff && !r.designSignoff)
    ),
    [rows]
  );

  const signoffMutation = useMutation({
    mutationFn: async ({
      selectionId, kind, bidId, note,
    }: { selectionId: string; kind: 'design' | 'cost' | 'both'; bidId?: string; note?: string }) => {
      const ref = doc(db, 'projects', projectId, 'selections', selectionId);
      const sig = { by: user?.firebaseUid || 'unknown', at: serverTimestamp(), ...(note ? { note } : {}) };
      const existing = rows.find(r => r.id === selectionId);
      const wantsDesign = kind === 'design' || kind === 'both';
      const wantsCost = kind === 'cost' || kind === 'both';
      const update: any = { updatedAt: serverTimestamp() };
      if (wantsDesign) update.designSignoff = sig;
      if (wantsCost) update.costSignoff = sig;
      if (bidId) update.acceptedBidId = bidId;
      // If after this update both will be set, mark gcApproved
      const designOk = wantsDesign || !!existing?.designSignoff;
      const costOk = wantsCost || !!existing?.costSignoff;
      if (designOk && costOk) {
        update.gcApproved = true;
        update.gcApprovedAt = serverTimestamp();
        update.gcApprovedBy = user?.firebaseUid || 'unknown';
        update.lifecycle = 'GC-Approved';
        update.status = 'Selected';
      }
      await updateDoc(ref, update);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['signoff-queue', projectId] });
      qc.invalidateQueries({ queryKey: ['project-selections', projectId] });
      toast({ title: 'Sign-off recorded' });
    },
    onError: (e: any) => toast({ title: 'Sign-off failed', description: e?.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading sign-off queue…</div>;
  if (queue.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Nothing waiting for your sign-off right now. Items appear here when vendor bids arrive and the cost + design are ready for your review.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Pending your sign-off</h3>
        <Badge>{queue.length} item{queue.length === 1 ? '' : 's'}</Badge>
      </div>
      {queue.map(sel => {
        const finalBids = (sel.bids || []).filter(b => b.stage === 'final' && b.status !== 'declined' && b.status !== 'expired');
        const cheapestBid = finalBids.length ? finalBids.reduce((m, b) => b.amount < m.amount ? b : m) : null;
        const pickedOption = sel.items?.find(o => o.id === sel.selectedOptionId);
        const draft = noteDrafts[sel.id] || '';
        return (
          <Card key={sel.id} data-testid={`signoff-${sel.id}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>{sel.item || 'Selection'}</span>
                <Badge variant="outline">{sel.phase}</Badge>
              </CardTitle>
              <div className="text-xs text-muted-foreground">{sel.room} · {sel.category}{sel.subcategory ? ' · ' + sel.subcategory : ''}</div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-2"><Palette className="w-3 h-3" /> Design pick</div>
                  {pickedOption ? (
                    <>
                      {pickedOption.imageUrls?.[0] && <img src={pickedOption.imageUrls[0]} alt="" className="w-full h-32 object-cover rounded mb-2" />}
                      <div className="text-sm font-medium">{pickedOption.productName}</div>
                      <div className="text-xs text-muted-foreground">{pickedOption.vendor}</div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground italic">No final pick recorded yet</div>
                  )}
                  {sel.designSignoff && <Badge className="mt-2 bg-green-100 text-green-800">Design signed off</Badge>}
                </div>

                <div className="border rounded p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-2"><DollarSign className="w-3 h-3" /> Bids ({finalBids.length} final)</div>
                  {finalBids.length === 0 ? (
                    <div className="text-sm text-muted-foreground italic">No final bids logged yet</div>
                  ) : (
                    <ul className="text-sm space-y-1">
                      {finalBids.map(b => (
                        <li key={b.id} className={`flex items-center justify-between gap-2 p-1.5 rounded ${b.id === cheapestBid?.id ? 'bg-green-50' : ''}`}>
                          <span>{b.vendorName}</span>
                          <span className="font-medium">${b.amount.toLocaleString()}{b.leadTimeDays ? ` · ${b.leadTimeDays}d` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {sel.allowanceAmount != null && cheapestBid && (
                    <div className={`text-xs mt-2 ${cheapestBid.amount > sel.allowanceAmount ? 'text-amber-700' : 'text-green-700'}`}>
                      {cheapestBid.amount > sel.allowanceAmount
                        ? `+$${(cheapestBid.amount - sel.allowanceAmount).toLocaleString()} over allowance`
                        : `$${(sel.allowanceAmount - cheapestBid.amount).toLocaleString()} under allowance`}
                    </div>
                  )}
                  {sel.costSignoff && <Badge className="mt-2 bg-green-100 text-green-800">Cost signed off</Badge>}
                </div>
              </div>

              <Textarea
                placeholder="Note on this sign-off (optional)"
                value={draft}
                onChange={e => setNoteDrafts(prev => ({ ...prev, [sel.id]: e.target.value }))}
                rows={2}
              />

              <div className="flex flex-wrap gap-2 justify-end">
                {!sel.designSignoff && (
                  <Button variant="outline" size="sm" disabled={signoffMutation.isPending}
                    onClick={() => signoffMutation.mutate({ selectionId: sel.id, kind: 'design', note: draft || undefined })}>
                    Approve design
                  </Button>
                )}
                {!sel.costSignoff && (
                  <Button variant="outline" size="sm" disabled={signoffMutation.isPending || !cheapestBid}
                    onClick={() => signoffMutation.mutate({ selectionId: sel.id, kind: 'cost', bidId: cheapestBid?.id, note: draft || undefined })}>
                    Approve cost{cheapestBid ? ` ($${cheapestBid.amount.toLocaleString()})` : ''}
                  </Button>
                )}
                <Button size="sm" disabled={signoffMutation.isPending || !cheapestBid}
                  onClick={() => signoffMutation.mutate({ selectionId: sel.id, kind: 'both', bidId: cheapestBid?.id, note: draft || undefined })}
                  data-testid={`btn-signoff-both-${sel.id}`}>
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Sign off cost + design
                </Button>
              </div>
              {!cheapestBid && (
                <div className="text-xs text-amber-700 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Need at least one final bid logged before cost can be signed off.
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
