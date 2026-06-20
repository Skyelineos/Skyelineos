// AI Inbox — a single reviewable item.
//
// Shows the brain's extraction, lets an admin correct the finance fields +
// project match, and Approve / Reject / Reprocess. Approve calls the Cloud
// Function (which performs the QuickBooks write server-side) — the browser
// never talks to QBO directly.

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Check, X, RefreshCw, ChevronDown, ChevronUp, Building2, Tag, DollarSign,
  CircleAlert, FileText, Mail, Link2, Paperclip, ExternalLink, Inbox,
} from 'lucide-react';
import {
  AiInboxItem, CATEGORY_LABELS, CATEGORY_OPTIONS, FINANCIAL_CATEGORIES,
} from './types';

interface ProjectOption { id: string; name: string }

interface Props {
  item: AiInboxItem;
  projects: ProjectOption[];
  qboConnected: boolean;
}

const GOLD = '#C9A96E';
const BLACK = '#141414';

export function InboxItemCard({ item, projects, qboConnected }: Props) {
  const { getIdToken } = useAuth();
  const { toast } = useToast();
  const x = item.extraction;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Editable correction fields seed from the extraction.
  const [category, setCategory] = useState(item.category || x?.category || 'general');
  const [amount, setAmount] = useState(x?.amountUsd != null ? String(x.amountUsd) : '');
  const [vendor, setVendor] = useState(x?.vendorName || '');
  const [account, setAccount] = useState(x?.qboAccountSuggestion || '');
  const [invoiceNo, setInvoiceNo] = useState(x?.invoiceNumber || '');
  const [projectId, setProjectId] = useState(item.projectId || x?.projectId || '');

  const isFinancial = FINANCIAL_CATEGORIES.has(category);
  const settled = item.reviewStatus === 'approved' || item.reviewStatus === 'corrected' || item.reviewStatus === 'rejected';

  // Build a correction payload only with keys the user actually changed.
  const correction = useMemo(() => {
    const c: any = {};
    if (category !== (x?.category || 'general')) c.category = category;
    const amtNum = amount.trim() === '' ? null : Number(amount);
    if ((x?.amountUsd ?? null) !== amtNum) c.amountUsd = amtNum;
    if ((vendor || '') !== (x?.vendorName || '')) c.vendorName = vendor || null;
    if ((account || '') !== (x?.qboAccountSuggestion || '')) c.qboAccountSuggestion = account || null;
    if ((invoiceNo || '') !== (x?.invoiceNumber || '')) c.invoiceNumber = invoiceNo || null;
    if ((projectId || '') !== (x?.projectId || '')) {
      c.projectId = projectId || null;
      c.projectName = projects.find((p) => p.id === projectId)?.name || null;
    }
    return c;
  }, [category, amount, vendor, account, invoiceNo, projectId, x, projects]);

  async function call(path: string, body?: any) {
    const token = await getIdToken();
    if (!token) throw new Error('Not signed in');
    const r = await fetch(path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  }

  async function approve() {
    setBusy('approve');
    try {
      const data = await call(`/api/ai-inbox/${item.id}/approve`, {
        correction: Object.keys(correction).length ? correction : undefined,
      });
      if (data.qboSyncStatus === 'synced') {
        toast({ title: 'Approved & synced', description: `${data.qboEntityType} ${data.qboEntityId} created in QuickBooks.` });
      } else if (data.qboSyncStatus === 'skipped') {
        toast({ title: 'Approved', description: `Filed (no QuickBooks entry: ${data.skippedReason || 'non-financial'}).` });
      } else {
        toast({ title: 'Approved', description: 'Item approved.' });
      }
    } catch (e: any) {
      toast({ title: 'Approve failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy('reject');
    try {
      await call(`/api/ai-inbox/${item.id}/reject`);
      toast({ title: 'Rejected', description: 'Item moved to Rejected.' });
    } catch (e: any) {
      toast({ title: 'Reject failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function reprocess() {
    setBusy('reprocess');
    try {
      await call(`/api/ai-inbox/${item.id}/reprocess`);
      toast({ title: 'Reprocessed', description: 'The brain re-read this item.' });
    } catch (e: any) {
      toast({ title: 'Reprocess failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  const confidencePct = Math.round((item.confidence ?? x?.confidence ?? 0) * 100);

  return (
    <Card className="border-gray-200">
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {item.source === 'gmail' ? <Mail className="w-5 h-5" style={{ color: GOLD }} /> : <FileText className="w-5 h-5" style={{ color: GOLD }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="border-gray-300 text-gray-700">
                {CATEGORY_LABELS[item.category || category] || item.category || category}
              </Badge>
              {item.projectName ? (
                <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                  <Building2 className="w-3 h-3 mr-1" />{item.projectName}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  <CircleAlert className="w-3 h-3 mr-1" />No project match
                </Badge>
              )}
              {item.amountUsd != null && (
                <Badge variant="outline" className="border-gray-300 text-gray-800 font-mono">
                  <DollarSign className="w-3 h-3 mr-0.5" />{Number(item.amountUsd).toFixed(2)}
                </Badge>
              )}
              <span className="text-xs text-gray-400 ml-auto">{confidencePct}% conf.</span>
            </div>
            <p className="font-medium text-gray-900 mt-1 truncate">{item.subject || x?.summary || '(no subject)'}</p>
            <p className="text-sm text-gray-500 truncate">
              {item.from?.name ? `${item.from.name} · ` : ''}{item.from?.email || ''}
              {item.mailbox ? <span className="inline-flex items-center gap-1 ml-2 text-gray-400"><Inbox className="w-3 h-3" />{item.mailbox}</span> : null}
            </p>
            {x?.summary && <p className="text-sm text-gray-600 mt-1">{x.summary}</p>}
          </div>
        </div>

        {/* Invoice-behind-a-link callout — needs a human to fetch the PDF */}
        {item.hasInvoiceLink && (
          <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5 text-amber-800">
            <Link2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Invoice is behind a link — open it, download the PDF, then attach + reprocess.</span>
            {item.invoiceLinkUrl && (
              <a href={item.invoiceLinkUrl} target="_blank" rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 font-medium underline shrink-0">
                Open <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Attachments — view the actual invoice/receipt */}
        {Array.isArray(item.attachments) && item.attachments.filter((a) => a.url).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {item.attachments.filter((a) => a.url).map((a, i) => (
              <a key={i} href={a.url || undefined} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 border border-gray-200 rounded px-2 py-1 text-gray-700 hover:bg-gray-50">
                <Paperclip className="w-3 h-3" /> {a.filename}
                {a.sentToClaude ? <span className="text-green-600" title="Read by AI">·✓read</span> : null}
              </a>
            ))}
          </div>
        )}

        {/* Brain signals: gmail label rec + clarification + qbo sync state */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {item.gmailLabelRecommendation && (
            <span className="inline-flex items-center gap-1 text-gray-600">
              <Tag className="w-3 h-3" /> Label: <code className="bg-gray-100 px-1 rounded">{item.gmailLabelRecommendation}</code>
            </span>
          )}
          {item.qboSyncStatus === 'synced' && (
            <Badge className="bg-green-100 text-green-800 border-green-200" variant="outline">QBO: {item.qboEntityType} #{item.qboEntityId}</Badge>
          )}
          {item.qboSyncStatus === 'error' && (
            <Badge className="bg-red-100 text-red-800 border-red-200" variant="outline" title={item.qboSyncError}>QBO sync error</Badge>
          )}
          {item.processingError && (
            <Badge className="bg-orange-100 text-orange-800 border-orange-200" variant="outline">{item.processingError}</Badge>
          )}
          {x?.needsClarification && x?.clarificationQuestion && (
            <span className="text-amber-700">❓ {x.clarificationQuestion}</span>
          )}
        </div>

        {/* Editable correction grid — only when not yet settled */}
        {!settled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
            <Field label="Category">
              <select
                className="w-full h-9 rounded-md border border-gray-200 px-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </Field>
            <Field label="Project">
              <select
                className="w-full h-9 rounded-md border border-gray-200 px-2 text-sm"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">— none —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Vendor">
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor name" className="h-9" />
            </Field>
            {isFinancial && (
              <>
                <Field label="Amount (USD)">
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="0.00" className="h-9" />
                </Field>
                <Field label="QBO Account">
                  <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="e.g. Materials" className="h-9" />
                </Field>
                <Field label="Invoice #">
                  <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="optional" className="h-9" />
                </Field>
              </>
            )}
          </div>
        )}

        {/* Raw body toggle */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-gray-500 inline-flex items-center gap-1 hover:text-gray-700"
        >
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {open ? 'Hide' : 'View'} raw content
        </button>
        {open && (
          <pre className="text-xs bg-gray-50 border border-gray-100 rounded p-2 whitespace-pre-wrap max-h-64 overflow-auto text-gray-700">
            {item.bodyText || '(no body captured)'}
          </pre>
        )}

        {/* Actions */}
        {!settled ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              onClick={approve}
              disabled={busy !== null || (isFinancial && !qboConnected)}
              className="gap-1 text-white"
              style={{ backgroundColor: BLACK }}
              title={isFinancial && !qboConnected ? 'Connect QuickBooks first to sync financial items' : undefined}
            >
              <Check className="w-4 h-4" />
              {busy === 'approve' ? 'Approving…' : isFinancial ? 'Approve & Sync to QBO' : 'Approve'}
            </Button>
            <Button onClick={reject} disabled={busy !== null} variant="outline" className="gap-1">
              <X className="w-4 h-4" /> Reject
            </Button>
            <Button onClick={reprocess} disabled={busy !== null} variant="outline" className="gap-1">
              <RefreshCw className={`w-4 h-4 ${busy === 'reprocess' ? 'animate-spin' : ''}`} /> Reprocess
            </Button>
            {isFinancial && !qboConnected && (
              <span className="text-xs text-amber-600">QuickBooks not connected — connect it in Settings to sync.</span>
            )}
          </div>
        ) : (
          <div className="pt-1">
            <Badge
              variant="outline"
              className={
                item.reviewStatus === 'rejected'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-green-200 bg-green-50 text-green-700'
              }
            >
              {item.reviewStatus === 'rejected' ? 'Rejected' : item.reviewStatus === 'corrected' ? 'Approved (corrected)' : 'Approved'}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}
