import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs, query, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract, ContractChangeOrder } from '@/lib/contracts/types';

interface Props {
  open: boolean;
  onClose: () => void;
  subContract: Contract;       // The sub's own contract — used to infer project + trade
  submitterName: string;
  submitterContactId?: string;
}

function newId() { return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

// Sub-side change order intake. Records the request directly on the
// client_build contract for the same project (status: pending,
// source: 'sub'). Admin then decides to forward to client or reject.
export function ChangeOrderRequestModal({ open, onClose, subContract, submitterName, submitterContactId }: Props) {
  const { toast } = useToast();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!description.trim() || !Number.isFinite(amt) || amt === 0) {
      toast({ title: 'Description and amount required', variant: 'destructive' });
      return;
    }
    if (!subContract.projectId) {
      toast({ title: 'Sub contract missing project', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      // Find the client_build contract for this project — that's where
      // change orders accrue against revenue.
      const snap = await getDocs(query(
        collection(db, 'contracts'),
        where('projectId', '==', subContract.projectId),
        where('type', '==', 'client_build'),
      ));
      if (snap.empty) {
        toast({
          title: 'No client contract found',
          description: 'Tyler hasn\'t drafted a client build agreement on this project yet. Send him a message.',
          variant: 'destructive',
        });
        return;
      }
      const clientContract = snap.docs[0];
      const existing = (clientContract.data() as any).changeOrders || [];
      const newCo: ContractChangeOrder = {
        id: newId(),
        number: existing.length + 1,
        description: description.trim(),
        amount: amt,
        status: 'pending',
        source: 'sub',
        submittedByContactId: submitterContactId,
        submittedByName: submitterName,
        submittedAt: new Date().toISOString(),
        trade: subContract.trade,
        adminAcceptedForClient: false,
      };
      await updateDoc(doc(db, 'contracts', clientContract.id), {
        changeOrders: [...existing, newCo],
        updatedAt: serverTimestamp(),
      } as any);
      toast({
        title: 'Price change submitted',
        description: 'Tyler will review and decide whether to forward to the client.',
      });
      setDescription('');
      setAmount('');
      onClose();
    } catch (e: any) {
      toast({ title: 'Submit failed', description: e?.message || 'Unknown', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request a price change</DialogTitle>
          <DialogDescription>
            Submit a change to the contract amount for{subContract.trade ? <strong> {subContract.trade}</strong> : ''} on {subContract.projectName || 'this project'}.
            Goes to Tyler for review first; if approved he'll forward it to the client.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>What changed?</Label>
            <Textarea
              rows={3}
              placeholder="e.g. Added 200 LF of trim due to revised layout — added material + 16 hrs labor."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label>Price change ($)</Label>
            <Input
              type="number"
              step="50"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Use a negative number if it's a credit"
            />
            <p className="text-xs text-gray-500 mt-1">+ for additions, − for credits.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="text-white" style={{ backgroundColor: '#C9A96E' }}>
            {submitting ? 'Submitting…' : 'Submit to Tyler'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
