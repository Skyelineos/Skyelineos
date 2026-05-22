import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Mail, MessageSquare, Send } from 'lucide-react';
import { nanoid } from 'nanoid';
import type { SelectionBid } from '@/types/selections-template-extensions';

interface PreferredVendor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  trade?: string;
}

interface Props {
  projectId: string;
  selectionId: string;
  selectionTitle: string;
  selectionSpecs: string;
  stage: 'rough' | 'final';
  preferredVendors: PreferredVendor[];
  /** Optional override for who's sending */
  requesterName?: string;
  /** Project name for the email body */
  projectName?: string;
}

/**
 * "Request bid" / "Request bid update" — opens a dialog letting the user
 * pick which preferred vendors to ask, then:
 *   1) Logs pending SelectionBid records on the selection (one per vendor)
 *   2) Opens mailto: links with a pre-filled body for each vendor with an email
 *   3) For vendors with phone but no email, shows the SMS body to copy-paste
 *
 * Future: a Cloud Function will replace the mailto: with actual SendGrid + Twilio sends.
 */
export default function RequestBidUpdate({
  projectId, selectionId, selectionTitle, selectionSpecs, stage,
  preferredVendors, requesterName = 'Skyeline Homes', projectName = 'your project',
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set(preferredVendors.map(v => v.id)));
  const [customMessage, setCustomMessage] = useState('');
  const [dueDays, setDueDays] = useState(stage === 'rough' ? 7 : 5);

  const togglePick = (id: string) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };

  const emailSubject = stage === 'rough'
    ? `Rough bid request — ${selectionTitle} — ${projectName}`
    : `Updated bid request — ${selectionTitle} (specs locked) — ${projectName}`;

  const emailBody = (vendorName: string) =>
    `Hi ${vendorName},\n\n` +
    (stage === 'rough'
      ? `We're working up early numbers for ${projectName}. Could you send us a rough bid on the following based on the plans?\n\n`
      : `The specs on ${selectionTitle} are now locked. Could you update your previous rough bid with final pricing?\n\n`) +
    `Item: ${selectionTitle}\n` +
    `Specs:\n${selectionSpecs || '(see attached plans / linked product)'}\n\n` +
    (customMessage ? `Notes: ${customMessage}\n\n` : '') +
    `Please reply with your bid amount, lead time, and any clarifying questions by ${
      new Date(Date.now() + dueDays * 86400000).toLocaleDateString()
    }.\n\n` +
    `Thanks,\n${requesterName}`;

  const smsBody = (vendorName: string) =>
    `Hi ${vendorName}, ${stage === 'rough' ? 'rough bid request' : 'updated bid request'} on ${selectionTitle} for ${projectName}. ` +
    `Reply with bid + lead time by ${new Date(Date.now() + dueDays * 86400000).toLocaleDateString()}. — ${requesterName}`;

  const requestMutation = useMutation({
    mutationFn: async () => {
      const chosen = preferredVendors.filter(v => picked.has(v.id));
      if (chosen.length === 0) throw new Error('Pick at least one vendor.');
      const ref = doc(db, 'projects', projectId, 'selections', selectionId);
      const newBids: SelectionBid[] = chosen.map(v => ({
        id: nanoid(10),
        vendorId: v.id,
        vendorName: v.name,
        vendorEmail: v.email,
        vendorPhone: v.phone,
        stage,
        amount: 0,
        notes: customMessage || undefined,
        requestedAt: serverTimestamp() as any,
        submittedAt: null as any,
        status: 'pending',
      }));
      await updateDoc(ref, {
        bids: arrayUnion(...newBids),
        lifecycle: stage === 'rough' ? 'Awaiting-Bids' : 'Awaiting-Bids',
        updatedAt: serverTimestamp(),
      });
      // Open mailto: for vendors with emails — browser opens 1 per click in this tab,
      // so we batch them as a single comma-separated TO line for now.
      const toLine = chosen.filter(v => v.email).map(v => v.email).join(',');
      if (toLine) {
        const subject = encodeURIComponent(emailSubject);
        const body = encodeURIComponent(emailBody('team'));
        window.open(`mailto:${toLine}?subject=${subject}&body=${body}`, '_blank');
      }
      return { count: chosen.length, smsTargets: chosen.filter(v => v.phone && !v.email) };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['signoff-queue', projectId] });
      qc.invalidateQueries({ queryKey: ['gc-design-snapshot', projectId] });
      toast({
        title: `Logged ${r.count} bid request${r.count === 1 ? '' : 's'}`,
        description: r.smsTargets.length
          ? `${r.smsTargets.length} vendor(s) have phone only — copy the SMS body to send manually.`
          : 'Email draft opened in your mail client.',
      });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: 'Could not send', description: e?.message, variant: 'destructive' }),
  });

  if (preferredVendors.length === 0) {
    return (
      <Button variant="outline" size="sm" disabled title="No preferred vendors set for this category yet">
        <Send className="w-4 h-4 mr-1" /> Request bid
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid={`btn-request-bid-${selectionId}`}>
        <Send className="w-4 h-4 mr-1" /> {stage === 'rough' ? 'Request rough bid' : 'Request updated bid'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{stage === 'rough' ? 'Request rough bid' : 'Request updated bid'}: {selectionTitle}</DialogTitle>
            <DialogDescription>
              {stage === 'rough'
                ? 'Send rough bid request to preferred vendors. They quote off the plans before selections lock.'
                : 'Specs are locked. Ask preferred vendors to update their previous rough bid with final pricing.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-3">
              {preferredVendors.map(v => (
                <label key={v.id} className="flex items-start gap-2 cursor-pointer">
                  <Checkbox checked={picked.has(v.id)} onCheckedChange={() => togglePick(v.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{v.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      {v.email ? <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {v.email}</span> : null}
                      {v.phone ? <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {v.phone}</span> : null}
                      {!v.email && !v.phone && <span className="text-amber-700">no contact info</span>}
                    </div>
                  </div>
                  {v.trade && <Badge variant="outline" className="text-xs">{v.trade}</Badge>}
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="dueDays" className="text-xs">Reply by (days)</Label>
                <Input id="dueDays" type="number" min={1} max={30} value={dueDays} onChange={(e) => setDueDays(parseInt(e.target.value || '7'))} />
              </div>
            </div>

            <div>
              <Label htmlFor="msg" className="text-xs">Notes for vendors (optional)</Label>
              <Textarea id="msg" value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} rows={3} placeholder="Any context you want every vendor to see" />
            </div>

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Preview email body</summary>
              <pre className="whitespace-pre-wrap mt-2 p-2 bg-muted/40 rounded">{emailBody('[vendor]')}</pre>
              <summary className="cursor-pointer mt-2">Preview SMS body</summary>
              <pre className="whitespace-pre-wrap mt-2 p-2 bg-muted/40 rounded">{smsBody('[vendor]')}</pre>
            </details>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={requestMutation.isPending}>Cancel</Button>
            <Button onClick={() => requestMutation.mutate()} disabled={requestMutation.isPending || picked.size === 0}>
              <Send className="w-4 h-4 mr-1" /> Log {picked.size} request{picked.size === 1 ? '' : 's'} + open email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
