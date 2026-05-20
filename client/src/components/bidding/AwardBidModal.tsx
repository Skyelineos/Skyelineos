import { useEffect, useMemo, useState } from 'react';
import {
  collection, addDoc, doc, updateDoc, serverTimestamp, query, where, onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Award, Calculator, Percent, Plus, FilePlus2, AlertCircle } from 'lucide-react';
import type { PortalBid } from './types';

interface Props {
  open: boolean;
  bid: PortalBid | null;
  onClose: () => void;
}

interface EstimateDoc {
  id: string;
  title?: string;
  projectId?: string;
  lineItems?: EstimateLine[];
  trade?: string;
}

interface EstimateLine {
  id: string;
  trade?: string;
  description?: string;
  qty?: number;
  unit?: string;
  unitCost?: number;
  subCost?: number;
  total?: number;
  awardedBidId?: string;
  assignedSubIds?: string[];
  markupPctLine?: number;
  [key: string]: any;
}

type PriceMode = 'keep' | 'passthrough' | 'markup';

const NEW_LINE = '__new_line__';
const NEW_ESTIMATE = '__new_estimate__';

export function AwardBidModal({ open, bid, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [estimates, setEstimates] = useState<EstimateDoc[]>([]);
  const [estimateId, setEstimateId] = useState<string>('');
  const [lineId, setLineId] = useState<string>('');
  const [priceMode, setPriceMode] = useState<PriceMode>('keep');
  const [markupPct, setMarkupPct] = useState<number>(15);
  const [working, setWorking] = useState(false);

  // Live list of estimates for this project. Drives the "which estimate?"
  // picker. If none exist, we fall back to the "create new estimate" path.
  useEffect(() => {
    if (!open || !bid?.projectId) { setEstimates([]); return; }
    const q = query(collection(db, 'estimates'), where('projectId', '==', bid.projectId));
    const unsub = onSnapshot(q,
      snap => setEstimates(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<EstimateDoc, 'id'>) }))),
      () => setEstimates([]),
    );
    return () => unsub();
  }, [open, bid?.projectId]);

  // Reset every time we open with a new bid.
  useEffect(() => {
    if (!open) return;
    setEstimateId('');
    setLineId('');
    setPriceMode('keep');
    setMarkupPct(15);
  }, [open, bid?.id]);

  // Auto-pick the first estimate as soon as the list loads (if there's only
  // one, we just go with it; the user can change it).
  useEffect(() => {
    if (!estimateId && estimates.length === 1) setEstimateId(estimates[0].id);
  }, [estimates, estimateId]);

  if (!bid) return null;

  const subtotal = bid.totalAmount || 0;
  const tradeKey = (bid.trade || '').toLowerCase().trim();
  const selectedEstimate = estimates.find(e => e.id === estimateId);
  const linesInEstimate = selectedEstimate?.lineItems || [];
  // Float trade-matching lines to top of the line picker.
  const sortedLines = [...linesInEstimate].sort((a, b) => {
    const am = (a.trade || '').toLowerCase() === tradeKey ? 0 : 1;
    const bm = (b.trade || '').toLowerCase() === tradeKey ? 0 : 1;
    if (am !== bm) return am - bm;
    return (a.description || '').localeCompare(b.description || '');
  });
  const selectedLine = sortedLines.find(l => l.id === lineId);

  // Compute what the line's subCost and unitCost will be after applying the
  // bid + the chosen client-price mode. Used for the preview row.
  const preview = useMemo(() => {
    if (lineId === NEW_LINE) {
      const newSubCost = subtotal;
      const newUnitCost = priceMode === 'keep' ? 0
        : priceMode === 'passthrough' ? newSubCost
        : newSubCost * (1 + markupPct / 100);
      return { newSubCost, newUnitCost, qty: 1, line: null as EstimateLine | null };
    }
    if (!selectedLine) return null;
    const qty = selectedLine.qty && selectedLine.qty > 0 ? selectedLine.qty : 1;
    const newSubCost = subtotal / qty;
    const currentUnitCost = selectedLine.unitCost ?? 0;
    const newUnitCost =
      priceMode === 'keep'        ? currentUnitCost
      : priceMode === 'passthrough' ? newSubCost
      :                             newSubCost * (1 + markupPct / 100);
    return { newSubCost, newUnitCost, qty, line: selectedLine };
  }, [selectedLine, lineId, subtotal, priceMode, markupPct]);

  const handleAward = async () => {
    if (!user) return;
    if (!estimateId) { toast({ title: 'Pick an estimate', variant: 'destructive' }); return; }
    if (!lineId) { toast({ title: 'Pick a line — or add as a new line', variant: 'destructive' }); return; }
    setWorking(true);
    try {
      if (estimateId === NEW_ESTIMATE) {
        // Fallback path — create a fresh estimate seeded from the bid lines.
        await createEstimateFromBid();
      } else {
        // Primary path — patch one line of an existing estimate.
        await applyToEstimateLine();
      }
      await markBidAwarded();
      toast({
        title: 'Bid awarded',
        description: estimateId === NEW_ESTIMATE
          ? 'New estimate created from the bid.'
          : (lineId === NEW_LINE ? 'Added as a new line on the estimate.' : 'Estimate line updated with bid cost.'),
      });
      onClose();
    } catch (e: any) {
      toast({ title: 'Award failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const markBidAwarded = async () => {
    await updateDoc(doc(db, 'bids', bid.id), {
      status: 'awarded',
      awardedAt: serverTimestamp(),
      awardedByUserId: user?.id?.toString() || user?.email || 'unknown',
    });
    if (bid.bidRequestId && bid.projectId) {
      try {
        await updateDoc(doc(db, 'projects', bid.projectId, 'bidRequests', bid.bidRequestId), {
          status: 'awarded',
          awardedBidId: bid.id,
          updatedAt: serverTimestamp(),
        });
      } catch { /* bidRequest may not exist */ }
    }
    if (bid.subContactId) {
      try {
        await createNotification({
          userId: bid.subContactId,
          kind: 'system',
          title: `Bid awarded: ${bid.trade}`,
          body: `Your bid for ${bid.projectName || 'this project'} was awarded. You'll receive the subcontractor agreement before work begins.`,
          link: '/subcontractor-portal/bids',
          projectId: bid.projectId,
          refType: 'task',
          refId: bid.id,
          fromUserName: user?.name || 'Skyeline Homes',
        });
      } catch { /* notification is non-critical */ }
    }
  };

  const applyToEstimateLine = async () => {
    if (!preview) throw new Error('No preview computed');
    const est = estimates.find(e => e.id === estimateId);
    if (!est) throw new Error('Estimate not found');
    const subId = bid.subContactId;

    let newLines: EstimateLine[];
    if (lineId === NEW_LINE) {
      // Append a brand-new line built from the bid.
      const newLine: EstimateLine = {
        id: crypto.randomUUID(),
        trade: bid.trade || '',
        description: `${bid.subName || 'Subcontractor'} — ${bid.trade || 'work'}`,
        qty: 1,
        unit: 'lump sum',
        subCost: preview.newSubCost,
        unitCost: preview.newUnitCost,
        total: preview.newUnitCost,
        awardedBidId: bid.id,
        assignedSubIds: subId ? [subId] : [],
        lineStatus: 'inc',
        kind: 'subcontractor',
      };
      newLines = [...(est.lineItems || []), newLine];
    } else {
      newLines = (est.lineItems || []).map(l => {
        if (l.id !== lineId) return l;
        const mergedSubs = subId
          ? Array.from(new Set([...(l.assignedSubIds || []), subId]))
          : (l.assignedSubIds || []);
        const qty = l.qty && l.qty > 0 ? l.qty : 1;
        return {
          ...l,
          subCost: preview.newSubCost,
          unitCost: preview.newUnitCost,
          total: qty * preview.newUnitCost,
          awardedBidId: bid.id,
          assignedSubIds: mergedSubs,
        };
      });
    }
    await updateDoc(doc(db, 'estimates', estimateId), {
      lineItems: newLines,
      updatedAt: serverTimestamp(),
    });
  };

  const createEstimateFromBid = async () => {
    if (!user) return;
    const newLine: EstimateLine = {
      id: crypto.randomUUID(),
      trade: bid.trade || '',
      description: `${bid.subName || 'Subcontractor'} — ${bid.trade || 'work'}`,
      qty: 1,
      unit: 'lump sum',
      subCost: subtotal,
      unitCost: priceMode === 'keep' ? subtotal : (priceMode === 'passthrough' ? subtotal : subtotal * (1 + markupPct / 100)),
      total: priceMode === 'keep' ? subtotal : (priceMode === 'passthrough' ? subtotal : subtotal * (1 + markupPct / 100)),
      awardedBidId: bid.id,
      assignedSubIds: bid.subContactId ? [bid.subContactId] : [],
      lineStatus: 'inc',
      kind: 'subcontractor',
    };
    await addDoc(collection(db, 'estimates'), {
      title: `${bid.trade || 'Trade'} — ${bid.projectName || 'Project'}`,
      projectId: bid.projectId,
      projectName: bid.projectName,
      lineItems: [newLine],
      sourceBidId: bid.id,
      sourceVendor: bid.subName,
      sourceVendorContactId: bid.subContactId,
      status: 'draft',
      createdAt: serverTimestamp(),
      createdBy: user.id?.toString() || user.email || 'unknown',
    });
  };

  // ── UI ─────────────────────────────────────────────────────────────────
  const fmt = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !working) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-[#C9A96E]" />
            Award bid
          </DialogTitle>
          <DialogDescription>
            Apply <strong>{bid.subName}</strong>'s bid for <strong>{bid.trade}</strong> ({fmt(subtotal)}) to an estimate line, then decide what to charge the client.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bid summary card */}
          <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">{bid.subName}</div>
              {bid.subCompany && <div className="text-xs text-gray-500">{bid.subCompany}</div>}
              <Badge variant="outline" className="mt-1">{bid.trade}</Badge>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Bid total</div>
              <div className="text-xl font-bold font-mono">{fmt(subtotal)}</div>
            </div>
          </div>

          {/* Estimate picker */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-gray-500">Which estimate?</Label>
            {estimates.length === 0 ? (
              <div className="flex items-start gap-2 p-3 rounded border border-amber-200 bg-amber-50 text-amber-900 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>No estimates exist for this project yet. The bid will create a new estimate.</span>
              </div>
            ) : (
              <Select value={estimateId} onValueChange={v => { setEstimateId(v); setLineId(''); }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Pick an estimate" /></SelectTrigger>
                <SelectContent>
                  {estimates.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title || '(untitled estimate)'} <span className="text-xs text-gray-400 ml-1">· {(e.lineItems || []).length} line{(e.lineItems || []).length === 1 ? '' : 's'}</span>
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_ESTIMATE}>
                    <span className="flex items-center gap-1.5 font-medium text-amber-800">
                      <FilePlus2 className="w-3.5 h-3.5" /> Create a new estimate from this bid
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Line picker — only shown when an existing estimate is selected */}
          {estimateId && estimateId !== NEW_ESTIMATE && (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-gray-500">Which line?</Label>
              {sortedLines.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No lines on this estimate yet. The bid will be added as a new line.</p>
              ) : null}
              <Select value={lineId} onValueChange={setLineId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={sortedLines.length === 0 ? 'Add as new line' : 'Pick a line'} /></SelectTrigger>
                <SelectContent>
                  {sortedLines.map(l => {
                    const matches = (l.trade || '').toLowerCase() === tradeKey;
                    return (
                      <SelectItem key={l.id} value={l.id}>
                        <span className="flex items-center gap-1.5">
                          <span className="truncate max-w-[300px]">
                            {(l.trade || 'untraded')} — {l.description || '(no description)'}
                          </span>
                          {matches && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(201,169,110,0.15)', color: '#8B6F3F' }}>trade match</span>}
                        </span>
                      </SelectItem>
                    );
                  })}
                  <SelectItem value={NEW_LINE}>
                    <span className="flex items-center gap-1.5 font-medium text-amber-800">
                      <Plus className="w-3.5 h-3.5" /> Add as a new line on this estimate
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Price-decision panel — what does the client see? */}
          {(preview || estimateId === NEW_ESTIMATE) && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#C9A96E]" />
                <h3 className="font-semibold text-gray-900">What does the homeowner see?</h3>
              </div>
              <p className="text-xs text-gray-500">
                The bid total becomes the line's <strong>Builder Cost</strong> (internal). Choose what to put in the client-facing <strong>Owner Price</strong>.
              </p>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <PriceModeButton
                  selected={priceMode === 'keep'}
                  onClick={() => setPriceMode('keep')}
                  label="Keep current price"
                  hint={preview?.line ? `${fmt((preview.line.unitCost || 0) * (preview.line.qty || 1))} stays` : 'No change'}
                />
                <PriceModeButton
                  selected={priceMode === 'passthrough'}
                  onClick={() => setPriceMode('passthrough')}
                  label="Pass-through"
                  hint="Owner Price = Builder Cost"
                />
                <PriceModeButton
                  selected={priceMode === 'markup'}
                  onClick={() => setPriceMode('markup')}
                  label="Add markup %"
                  hint="Owner Price = Cost × (1 + %)"
                />
              </div>

              {priceMode === 'markup' && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs flex-shrink-0">Contractor markup %</Label>
                  <div className="relative w-24">
                    <Input
                      type="number"
                      value={markupPct || ''}
                      onChange={e => setMarkupPct(parseFloat(e.target.value) || 0)}
                      className="h-8 text-right pr-6"
                    />
                    <Percent className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  </div>
                </div>
              )}

              {/* Preview row */}
              {preview && (
                <div className="bg-gradient-to-br from-[#FFF8E7] to-white border-[#C9A96E]/30 border rounded p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Builder Cost / unit (internal)</span>
                    <span className="font-mono">{fmt(preview.newSubCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Owner Price / unit (client sees)</span>
                    <span className="font-mono">{fmt(preview.newUnitCost)}</span>
                  </div>
                  {preview.qty > 1 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>× Qty {preview.qty}</span>
                      <span className="font-mono">Total Owner Price {fmt(preview.qty * preview.newUnitCost)}</span>
                    </div>
                  )}
                  {priceMode !== 'keep' && (
                    <div className="text-[11px] text-gray-500 pt-1 border-t border-[#C9A96E]/20">
                      Skyeline profit = (Sell − Cost) × Qty = <strong>{fmt((preview.newUnitCost - preview.newSubCost) * preview.qty)}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={working}>Cancel</Button>
          <Button
            onClick={handleAward}
            disabled={working || (!estimateId && estimates.length > 0) || (estimateId && estimateId !== NEW_ESTIMATE && !lineId)}
            className="gap-2 text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            <Award className="w-4 h-4" />
            {working ? 'Awarding…' : 'Award bid'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceModeButton({ selected, onClick, label, hint }: {
  selected: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded border p-2 transition-colors ${
        selected
          ? 'border-[#C9A96E] bg-amber-50 text-amber-900'
          : 'border-gray-200 hover:border-[#C9A96E] hover:bg-amber-50/40'
      }`}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{hint}</div>
    </button>
  );
}
