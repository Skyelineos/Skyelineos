import { useState, useEffect } from 'react';
import {
  collection, addDoc, doc, updateDoc, serverTimestamp, getDocs, query, where,
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Award, Sparkles, FileText, Eye, Send, CheckCircle2, Calculator, Percent,
} from 'lucide-react';
import type { PortalBid, MarkupConfig } from './types';

interface Props {
  open: boolean;
  bid: PortalBid | null;
  onClose: () => void;
}

const COMMON_MARKUP_LABELS = [
  'Project Coordination & Material Management',
  'GC Oversight & Insurance Coverage',
  'Material Pickup & Delivery Coordination',
  'Schedule Management & On-site Supervision',
  'Project Coordination Fee',
];

export function AwardBidModal({ open, bid, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [markup, setMarkup] = useState<MarkupConfig>({
    type: 'percent',
    value: 15,
    label: 'Project Coordination & Material Management',
    description: 'Covers GC time spent coordinating, picking up materials, and managing this scope on site.',
    appliesTo: 'all',
    displayMode: 'separateLine',
  });

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open && bid) {
      // reset to default each open
      setMarkup({
        type: 'percent',
        value: 15,
        label: 'Project Coordination & Material Management',
        description: 'Covers GC time spent coordinating, picking up materials, and managing this scope on site.',
        appliesTo: 'all',
        displayMode: 'separateLine',
      });
    }
  }, [open, bid]);

  if (!bid) return null;

  const subtotal = bid.totalAmount || 0;
  const markupAmount = markup.type === 'percent'
    ? subtotal * (markup.value / 100)
    : markup.value;
  const clientTotal = subtotal + markupAmount;

  const handleAward = async () => {
    if (!user) return;
    setCreating(true);
    try {
      // 1. Mark the bid as awarded
      await updateDoc(doc(db, 'bids', bid.id), {
        status: 'awarded',
        awardedAt: serverTimestamp(),
        awardedByUserId: user.id?.toString() || user.email || 'unknown',
        appliedMarkup: markup,
      });

      // 2. Mark the bidRequest as awarded (if linked)
      if (bid.bidRequestId && bid.projectId) {
        try {
          await updateDoc(doc(db, 'projects', bid.projectId, 'bidRequests', bid.bidRequestId), {
            status: 'awarded',
            awardedBidId: bid.id,
            updatedAt: serverTimestamp(),
          });
        } catch {}
      }

      // 3. Create the estimate with vendor lines + markup line
      const finalLines = bid.lineItems.map(l => ({
        id: l.id,
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        unitCost: l.unitCost,
        total: l.total,
        notes: l.notes,
        // Internal tracking — preserve vendor original
        vendorOriginalCost: l.unitCost,
        vendorOriginalTotal: l.total,
        sourceBidId: bid.id,
        sourceVendor: bid.subName,
      }));

      // Markup line(s)
      if (markup.displayMode === 'separateLine' && markupAmount > 0) {
        finalLines.push({
          id: `markup-${Date.now()}`,
          description: markup.label,
          qty: 1,
          unit: 'lump sum',
          unitCost: markupAmount,
          total: markupAmount,
          notes: markup.description || '',
          vendorOriginalCost: 0,
          vendorOriginalTotal: 0,
          sourceBidId: bid.id,
          sourceVendor: 'Skyeline Homes',
          isMarkupLine: true,
        } as any);
      }

      const estimateData = {
        title: `${bid.trade || 'Trade'} — ${bid.projectName || 'Project'}`,
        projectId: bid.projectId,
        projectName: bid.projectName,
        trade: bid.trade,
        sourceBidId: bid.id,
        sourceVendor: bid.subName,
        sourceVendorContactId: bid.subContactId,
        lineItems: finalLines,
        vendorSubtotal: subtotal,
        markup,
        markupAmount,
        clientTotal,
        status: 'draft',
        createdAt: serverTimestamp(),
        createdBy: user.id?.toString() || user.email || 'unknown',
      };
      const estRef = await addDoc(collection(db, 'estimates'), estimateData);

      // 4. Notify the awarded sub w/ agreement reminder
      if (bid.subContactId) {
        await createNotification({
          userId: bid.subContactId,
          kind: 'system',
          title: `Bid awarded: ${bid.trade}`,
          body: `Your bid for ${bid.projectName || 'this project'} was awarded. Before work begins, you'll receive the subcontractor agreement to sign.`,
          link: '/subcontractor-portal/bids',
          projectId: bid.projectId,
          refType: 'task',
          refId: bid.id,
          fromUserName: user.name || 'Skyeline Homes',
        });
      }

      // 5. Notify the GC (self) for confirmation
      toast({
        title: 'Bid awarded + estimate created',
        description: `Vendor: $${subtotal.toLocaleString()} · Markup: $${markupAmount.toLocaleString()} · Client total: $${clientTotal.toLocaleString()}`,
      });
      onClose();
    } catch (e: any) {
      toast({ title: 'Award failed', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-[#C9A96E]" />
            Award Bid & Create Estimate
          </DialogTitle>
          <DialogDescription>
            Award {bid.subName}'s bid for {bid.trade} and convert it into a client-facing estimate with your coordination markup.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bid summary */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-semibold text-gray-900">{bid.subName}</div>
                {bid.subCompany && <div className="text-xs text-gray-500">{bid.subCompany}</div>}
              </div>
              <Badge variant="outline">{bid.trade}</Badge>
            </div>
            <div className="text-xs text-gray-500 mb-2">
              <strong>{bid.lineItems.length}</strong> line items · Submitted {bid.submittedAt?.toDate?.().toLocaleDateString() || '—'}
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-gray-600">Vendor subtotal</span>
              <span className="text-xl font-bold font-mono">${subtotal.toLocaleString()}</span>
            </div>
          </div>

          {/* Markup config */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#C9A96E]" />
              <h3 className="font-semibold text-gray-900">Your Coordination Markup</h3>
            </div>
            <p className="text-xs text-gray-500">
              Adds your fee on top of the vendor's price. Vendor's original numbers stay intact for your records.
            </p>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={markup.type} onValueChange={v => setMarkup(m => ({ ...m, type: v as 'percent' | 'flat' }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage</SelectItem>
                    <SelectItem value="flat">Flat amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{markup.type === 'percent' ? 'Percent (%)' : 'Amount ($)'}</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={markup.value}
                    onChange={e => setMarkup(m => ({ ...m, value: parseFloat(e.target.value) || 0 }))}
                    className="h-9"
                  />
                  {markup.type === 'percent' && <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />}
                </div>
              </div>
              <div>
                <Label className="text-xs">Display</Label>
                <Select value={markup.displayMode} onValueChange={v => setMarkup(m => ({ ...m, displayMode: v as any }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="separateLine">Separate line (transparent)</SelectItem>
                    <SelectItem value="rolledIn">Rolled into base (hidden)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Markup line label (what client sees)</Label>
              <Select value={markup.label} onValueChange={v => setMarkup(m => ({ ...m, label: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMMON_MARKUP_LABELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="mt-2"
                value={markup.label}
                onChange={e => setMarkup(m => ({ ...m, label: e.target.value }))}
                placeholder="Custom label"
              />
            </div>

            <div>
              <Label className="text-xs">Description (optional, internal note)</Label>
              <Textarea
                rows={2}
                value={markup.description || ''}
                onChange={e => setMarkup(m => ({ ...m, description: e.target.value }))}
                placeholder="What this fee covers"
              />
            </div>
          </div>

          {/* Calculation preview */}
          <div className="bg-gradient-to-br from-[#FFF8E7] to-white border-[#C9A96E]/30 border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="w-4 h-4 text-[#C9A96E]" />
              <h3 className="font-semibold text-gray-900">Client-facing total</h3>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Vendor subtotal</span>
                <span className="font-mono">${subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">
                  + {markup.type === 'percent' ? `${markup.value}% markup` : 'Flat markup'}
                  {markup.displayMode === 'rolledIn' && <span className="text-xs text-gray-400 ml-1">(rolled in)</span>}
                </span>
                <span className="font-mono">${markupAmount.toLocaleString()}</span>
              </div>
              <div className="border-t pt-1.5 flex justify-between">
                <span className="font-semibold text-gray-900">Client total</span>
                <span className="font-bold font-mono text-lg">${clientTotal.toLocaleString()}</span>
              </div>
            </div>

            {markup.displayMode === 'separateLine' && (
              <div className="mt-3 pt-3 border-t border-[#C9A96E]/30">
                <p className="text-xs text-gray-500 mb-1.5">Client will see:</p>
                <div className="bg-white rounded p-2 text-xs space-y-0.5">
                  {bid.lineItems.slice(0, 3).map(l => (
                    <div key={l.id} className="flex justify-between">
                      <span className="truncate">{l.description}</span>
                      <span className="font-mono">${l.total.toLocaleString()}</span>
                    </div>
                  ))}
                  {bid.lineItems.length > 3 && <div className="text-gray-400 text-[10px]">+ {bid.lineItems.length - 3} more lines</div>}
                  <div className="flex justify-between text-[#C9A96E] font-semibold pt-1 border-t mt-1">
                    <span>{markup.label}</span>
                    <span className="font-mono">${markupAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleAward}
            disabled={creating}
            className="gap-2 text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            <Award className="w-4 h-4" />
            {creating ? 'Awarding…' : 'Award & Create Estimate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
