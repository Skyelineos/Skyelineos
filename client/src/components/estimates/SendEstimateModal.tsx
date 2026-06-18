// SendEstimateModal — the modal Tyler opens from the EstimateBuilder "Send to
// Client" button. Handles:
//   1. Pre-filling the recipient email from the estimate / project doc.
//   2. Optional personal note appended to the SendGrid email body.
//   3. Optional PDF attachment: generates with EstimatePDFService.getPDFBlob,
//      uploads to projects/{id}/estimates/{eid}.pdf via uploadEstimatePdf.
//   4. POST /api/estimates/:id/send-to-client — the server updates the doc,
//      emails the client, and fires the 'estimate_sent' notification.
//
// On success the modal closes and the EstimateBuilder list re-renders via
// the existing onSnapshot subscription. Errors stay surfaced inline.

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { authFetch } from '@/lib/authFetch';
import { EstimatePDFService, type EstimatePDFData } from '@/components/pdf/EstimatePDFService';
import { uploadEstimatePdf } from '@/lib/estimates/uploadEstimatePdf';
import { Send, Mail, Paperclip, Loader2 } from 'lucide-react';

export interface SendEstimateModalEstimate {
  id: string;
  title: string;
  projectId?: string;
  projectName?: string;
  clientName?: string;
  clientEmail?: string;
  totalAmount?: number;
  status?: string;
  lineItems?: Array<{
    trade?: string;
    description?: string;
    subName?: string;
    qty?: number;
    unit?: string;
    unitCost?: number;
    total?: number;
  }>;
  notes?: string;
  validUntil?: string;
}

interface SendEstimateModalProps {
  open: boolean;
  onClose: () => void;
  estimate: SendEstimateModalEstimate | null;
  /** Optional fallback email pulled from the parent's project context. */
  defaultRecipientEmail?: string;
  /** Called on success so the caller can refresh / toast. */
  onSent?: (info: { sentTo: string }) => void;
}

function fmtCurrency(n: number | undefined | null): string {
  const v = typeof n === 'number' ? n : Number(n || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v);
}

export function SendEstimateModal({
  open,
  onClose,
  estimate,
  defaultRecipientEmail,
  onSent,
}: SendEstimateModalProps) {
  const { toast } = useToast();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);
  const [stage, setStage] = useState<'idle' | 'pdf' | 'upload' | 'send'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRecipientEmail(estimate?.clientEmail || defaultRecipientEmail || '');
    setMessage('');
    setAttachPdf(true);
    setSending(false);
    setStage('idle');
    setErrorMsg(null);
  }, [open, estimate?.id, estimate?.clientEmail, defaultRecipientEmail]);

  const total = useMemo(() => fmtCurrency(estimate?.totalAmount), [estimate?.totalAmount]);

  const handleSend = async () => {
    if (!estimate?.id) {
      setErrorMsg('No estimate to send.');
      return;
    }
    const email = recipientEmail.trim();
    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid recipient email.');
      return;
    }
    setSending(true);
    setErrorMsg(null);

    try {
      let pdfStoragePath: string | undefined;
      let pdfDownloadUrl: string | undefined;

      if (attachPdf) {
        if (!estimate.projectId) {
          throw new Error('This estimate has no project — PDF attachment needs a project to store it under.');
        }
        setStage('pdf');
        const pdfData: EstimatePDFData = {
          projectName: estimate.projectName || estimate.title || 'Project',
          clientName: estimate.clientName || '',
          title: estimate.title,
          totalCost: estimate.totalAmount,
          items: (estimate.lineItems || []).map(li => ({
            trade: li.trade || '',
            vendor: li.subName,
            description: li.description || '',
            cost: typeof li.total === 'number' ? li.total : Number(li.total || 0),
          })),
        };
        const blob = await EstimatePDFService.getPDFBlob(pdfData);

        setStage('upload');
        const uploaded = await uploadEstimatePdf(estimate.projectId, estimate.id, blob);
        pdfStoragePath = uploaded.storagePath;
        pdfDownloadUrl = uploaded.downloadUrl;
      }

      setStage('send');
      const res = await authFetch(`/api/estimates/${encodeURIComponent(estimate.id)}/send-to-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: email,
          message: message.trim() || undefined,
          pdfStoragePath,
          pdfDownloadUrl,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || `Send failed (HTTP ${res.status}).`);
      }

      // Server returns emailSent + emailError. Surface a clear toast either way.
      if (json.emailSent === false && json.emailError) {
        toast({
          title: 'Estimate marked as sent — email failed',
          description: String(json.emailError),
          variant: 'destructive',
        });
      } else {
        toast({
          title: `Estimate sent to ${email}`,
          description: json.attachmentSkippedReason
            ? `Note: ${json.attachmentSkippedReason}`
            : 'The client will receive an email and an in-app notification.',
        });
      }
      onSent?.({ sentTo: email });
      onClose();
    } catch (e: any) {
      console.error('SendEstimateModal failed:', e);
      setErrorMsg(e?.message || 'Something went wrong sending the estimate.');
    } finally {
      setSending(false);
      setStage('idle');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-md w-full p-0 flex flex-col max-h-[100dvh] sm:max-h-[90vh]">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="font-heading text-lg flex items-center gap-2">
            <Send className="w-4 h-4" /> Send Estimate to Client
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {estimate ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <div className="font-medium text-gray-900">{estimate.title}</div>
              <div className="text-gray-600 mt-0.5">{estimate.projectName || ''}</div>
              <div className="mt-1 font-semibold text-gray-900">{total}</div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="send-est-email" className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Recipient email
            </Label>
            <Input
              id="send-est-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="client@example.com"
              autoComplete="email"
              disabled={sending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="send-est-message">Personal note (optional)</Label>
            <Textarea
              id="send-est-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Thanks for the meeting yesterday — here's the estimate we discussed."
              disabled={sending}
            />
            <p className="text-xs text-gray-500">Appended to the email body.</p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-gray-500" />
              <div>
                <div className="text-sm font-medium text-gray-900">Attach PDF</div>
                <div className="text-xs text-gray-500">Generate + attach a copy of the estimate.</div>
              </div>
            </div>
            <Switch
              checked={attachPdf}
              onCheckedChange={setAttachPdf}
              disabled={sending || !estimate?.projectId}
            />
          </div>
          {!estimate?.projectId ? (
            <p className="text-xs text-amber-600">
              PDF attachment disabled — this estimate isn't linked to a project yet.
            </p>
          ) : null}

          {errorMsg ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMsg}
            </div>
          ) : null}
        </div>

        <DialogFooter className="px-6 py-4 border-t gap-2 sticky bottom-0 bg-white">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !estimate?.id || !recipientEmail.trim()}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {sending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {stage === 'pdf' ? 'Building PDF…' :
                 stage === 'upload' ? 'Uploading…' :
                 stage === 'send' ? 'Sending…' : 'Working…'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Send className="w-4 h-4" /> Send
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
