// Pay-app submission form for the sub portal.
//
// Sub picks a project from their AWARDED list, fills invoice number / amount /
// percent complete / description, optionally attaches a PDF or photo, hits
// Submit. submitSubInvoice() handles Storage + server. On success the form
// resets and the parent's "recent submissions" list refreshes.

import { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  FileText, Loader2, Upload, X, DollarSign, Send, AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  submitSubInvoice, isSubInvoiceAttachmentAllowed,
} from '@/lib/subInvoices/submitSubInvoice';

interface AwardedProject {
  id: string;
  name: string;
}

export interface SubInvoiceFormProps {
  subContactId: string;
  awardedProjects: AwardedProject[];
  defaultProjectId?: string;
  onSubmitted?: () => void;
}

export function SubInvoiceForm(props: SubInvoiceFormProps) {
  const { subContactId, awardedProjects, defaultProjectId, onSubmitted } = props;
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [projectId, setProjectId] = useState<string>(defaultProjectId || awardedProjects[0]?.id || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [percentComplete, setPercentComplete] = useState<string>('100');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  function handleFile(file: File) {
    if (!isSubInvoiceAttachmentAllowed(file)) {
      toast({
        title: 'File not allowed',
        description: 'Must be a PDF or image and under 10MB.',
        variant: 'destructive',
      });
      return;
    }
    setAttachment(file);
  }

  function reset() {
    setInvoiceNumber('');
    setAmount('');
    setPercentComplete('100');
    setDescription('');
    setAttachment(null);
    setProgress(0);
  }

  async function handleSubmit() {
    if (!subContactId) {
      toast({
        title: 'Account not linked yet',
        description: 'Your portal login is not linked to a contact record yet.',
        variant: 'destructive',
      });
      return;
    }
    if (!projectId) {
      toast({ title: 'Pick a project', variant: 'destructive' });
      return;
    }
    if (!invoiceNumber.trim()) {
      toast({ title: 'Invoice number required', variant: 'destructive' });
      return;
    }
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) {
      toast({ title: 'Amount must be positive', variant: 'destructive' });
      return;
    }
    const pct = parseFloat(percentComplete);
    if (!isFinite(pct) || pct < 0 || pct > 100) {
      toast({ title: 'Percent complete must be 0–100', variant: 'destructive' });
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      const res = await submitSubInvoice({
        subContactId,
        projectId,
        invoiceNumber,
        amount: amt,
        percentComplete: pct,
        description,
        attachment: attachment || undefined,
        onProgress: setProgress,
      });
      toast({
        title: 'Invoice submitted',
        description: `#${res.invoiceNumber} for $${res.amount.toLocaleString()} is in the GC's queue.`,
      });
      reset();
      onSubmitted?.();
    } catch (e: any) {
      toast({ title: 'Submission failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  if (awardedProjects.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
          <p className="text-gray-700 font-medium">No awarded projects yet</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            You can submit a pay application once Skyeline Homes awards you a bid. Until then,
            check the <strong>Bid Requests</strong> tab for open invitations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Send className="w-4 h-4 text-[#C9A96E]" />
          Submit a Pay Application
        </CardTitle>
        <CardDescription>
          Your submission lands in Skyeline's Bills queue. They'll review, approve, and pay through
          the normal channel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">Project *</Label>
          <Select value={projectId} onValueChange={setProjectId} disabled={busy}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a project" />
            </SelectTrigger>
            <SelectContent>
              {awardedProjects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Invoice # *</Label>
            <Input
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-1042"
              disabled={busy}
            />
          </div>
          <div>
            <Label className="text-xs">Amount * (USD)</Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              disabled={busy}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Percent complete: {percentComplete}%</Label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={percentComplete}
            onChange={e => setPercentComplete(e.target.value)}
            className="w-full"
            disabled={busy}
          />
        </div>

        <div>
          <Label className="text-xs">Description</Label>
          <Textarea
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Scope of work covered by this draw…"
            disabled={busy}
          />
        </div>

        <div>
          <Label className="text-xs">Attach invoice PDF or photo (optional)</Label>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          {!attachment ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full rounded-lg border-2 border-dashed border-gray-200 py-4 hover:border-[#C9A96E] hover:bg-[#FFF8E7] transition-colors text-sm text-gray-600"
            >
              <Upload className="w-5 h-5 mx-auto mb-1 text-[#C9A96E]" />
              Click to attach a file
            </button>
          ) : (
            <div className="flex items-center justify-between bg-gray-50 rounded border p-2 text-sm">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="truncate max-w-xs">{attachment.name}</span>
                <span className="text-xs text-gray-400">
                  {(attachment.size / 1024).toFixed(0)} KB
                </span>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-700"
                onClick={() => setAttachment(null)}
                disabled={busy}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {busy && (
          <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {attachment ? `Uploading attachment… ${Math.round(progress)}%` : 'Submitting…'}
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={busy}
          className="w-full gap-2 text-white"
          style={{ backgroundColor: '#C9A96E' }}
        >
          <DollarSign className="w-4 h-4" /> Submit Pay Application
        </Button>
      </CardContent>
    </Card>
  );
}
