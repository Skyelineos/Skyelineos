// EstimatesTab — homeowner-facing view of estimates the GC has sent on their
// project. Subscribed to estimates where projectId == X AND status != 'draft'
// (so we hide drafts the GC hasn't sent yet). Each card shows the title,
// total, sent date, status badge, and — for status === 'sent' — Approve /
// Decline / Request-changes actions.
//
// Approve / Decline / Request-changes call POST /api/estimates/:id/client-response.
// estimates/{id} has a GC-only Firestore rule, so the homeowner cannot write
// directly; the server endpoint verifies the caller is on the project's client
// audience and writes the status + clientResponseMessage on their behalf.

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { authFetch } from '@/lib/authFetch';
import {
  CheckCircle2,
  XCircle,
  MessageSquareWarning,
  Download,
  FileText,
  Clock,
  Loader2,
} from 'lucide-react';

interface EstimateDoc {
  id: string;
  title?: string;
  status?: 'sent' | 'accepted' | 'rejected' | 'revised' | 'draft' | string;
  totalAmount?: number;
  sentAt?: any;
  sentTo?: string;
  sentByName?: string;
  pdfDownloadUrl?: string;
  clientResponseAt?: any;
  clientResponseMessage?: string;
  notes?: string;
  validUntil?: string;
  projectId?: string;
}

interface EstimatesTabProps {
  projectId: string;
}

function fmtCurrency(n: number | undefined | null): string {
  const v = typeof n === 'number' ? n : Number(n || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v);
}

function fmtDate(ts: any): string {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  sent:     { label: 'Awaiting your review', cls: 'bg-amber-100 text-amber-800' },
  accepted: { label: 'Accepted',               cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'Declined',               cls: 'bg-red-100 text-red-800' },
  revised:  { label: 'Changes requested',      cls: 'bg-blue-100 text-blue-800' },
};

export default function EstimatesTab({ projectId }: EstimatesTabProps) {
  const { toast } = useToast();
  const [estimates, setEstimates] = useState<EstimateDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [requestModal, setRequestModal] = useState<{ id: string; title: string } | null>(null);
  const [requestMessage, setRequestMessage] = useState('');

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    // Server-side filter only on projectId — the `status not draft` filter is
    // applied client-side so we don't need a composite index just for one
    // boolean predicate, and so the list keeps live-updating as statuses change.
    const q = query(collection(db, 'estimates'), where('projectId', '==', projectId));
    const unsub = onSnapshot(
      q,
      (snap: any) => {
        const rows: EstimateDoc[] = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        setEstimates(
          rows
            .filter(r => r.status && r.status !== 'draft')
            .sort((a, b) => {
              const ta = a.sentAt?.toMillis?.() ?? 0;
              const tb = b.sentAt?.toMillis?.() ?? 0;
              return tb - ta;
            }),
        );
        setLoading(false);
      },
      (err: any) => {
        console.error('[EstimatesTab] snapshot error', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [projectId]);

  const sentEstimates = useMemo(() => estimates, [estimates]);

  const respond = async (estimateId: string, action: 'approve' | 'decline' | 'request_changes', message?: string) => {
    setSubmittingId(estimateId);
    try {
      const res = await authFetch(`/api/estimates/${encodeURIComponent(estimateId)}/client-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, message }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || `Request failed (HTTP ${res.status}).`);
      }
      toast({
        title:
          action === 'approve' ? 'Estimate approved' :
          action === 'decline' ? 'Estimate declined' :
          'Changes requested',
        description: 'Your GC has been notified.',
      });
    } catch (e: any) {
      console.error('[EstimatesTab] respond failed:', e);
      toast({
        title: 'Could not submit your response',
        description: e?.message || 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setSubmittingId(null);
    }
  };

  if (!projectId) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center max-w-xl mx-auto">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No project selected yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Estimates</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : sentEstimates.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No estimates yet</p>
            <p className="text-sm text-gray-400 mt-1">
              When your GC sends an estimate, it will appear here for review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sentEstimates.map(est => {
            const statusKey = String(est.status || 'sent');
            const style = STATUS_STYLE[statusKey] || { label: statusKey, cls: 'bg-gray-100 text-gray-700' };
            const isAwaiting = statusKey === 'sent';
            const sentLabel = fmtDate(est.sentAt);
            return (
              <Card key={est.id}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <h3 className="text-base font-semibold text-gray-900 truncate">
                          {est.title || 'Estimate'}
                        </h3>
                        <Badge className={style.cls}>{style.label}</Badge>
                      </div>
                      <div className="text-sm text-gray-600 mt-1 flex items-center gap-3 flex-wrap">
                        <span className="font-medium text-gray-900">{fmtCurrency(est.totalAmount)}</span>
                        {sentLabel ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            Sent {sentLabel}{est.sentByName ? ` by ${est.sentByName}` : ''}
                          </span>
                        ) : null}
                      </div>
                      {est.clientResponseMessage ? (
                        <div className="mt-2 rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-800">
                          <span className="font-medium">Your message:</span> {est.clientResponseMessage}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      {est.pdfDownloadUrl ? (
                        <Button asChild variant="outline" size="sm">
                          <a href={est.pdfDownloadUrl} target="_blank" rel="noreferrer">
                            <Download className="w-3.5 h-3.5 mr-1.5" /> Download PDF
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {isAwaiting && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Button
                        onClick={() => respond(est.id, 'approve')}
                        disabled={submittingId === est.id}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {submittingId === est.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                          <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setRequestModal({ id: est.id, title: est.title || 'Estimate' });
                          setRequestMessage('');
                        }}
                        disabled={submittingId === est.id}
                      >
                        <MessageSquareWarning className="w-4 h-4 mr-1.5" />
                        Request changes
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => respond(est.id, 'decline')}
                        disabled={submittingId === est.id}
                        className="border-red-200 text-red-700 hover:bg-red-50"
                      >
                        <XCircle className="w-4 h-4 mr-1.5" />
                        Decline
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Request-changes modal — message is required so the GC has context. */}
      <Dialog open={!!requestModal} onOpenChange={(o) => { if (!o) setRequestModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Tell your GC what you'd like changed on <span className="font-medium">{requestModal?.title}</span>.
            </p>
            <Textarea
              rows={5}
              value={requestMessage}
              onChange={(e) => setRequestMessage(e.target.value)}
              placeholder="For example: please remove the granite countertop line and re-quote with quartz."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestModal(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!requestModal || !requestMessage.trim()) return;
                const id = requestModal.id;
                setRequestModal(null);
                await respond(id, 'request_changes', requestMessage.trim());
              }}
              disabled={!requestMessage.trim() || submittingId === requestModal?.id}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
