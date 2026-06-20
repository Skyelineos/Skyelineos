// AI Inbox — admin-only production finance intake at /admin/ai-inbox.
//
// Gmail (via an n8n workflow) → POST /api/ai-inbox/ingest → Claude extraction →
// project match + QBO categorization suggestion → human review → on approval,
// a Bill (invoices) or Expense (receipts) is written to QuickBooks.
//
// This is the productized successor to the Ingestion Lab spike. It lives in its
// own `ai_inbox_items` namespace and does not touch `ingestion_lab/`.

import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, getDocs, onSnapshot, query as fsQuery, limit as fsLimit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/auth/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Inbox, Brain, DollarSign, CheckCircle2, AlertCircle, Plug, Zap, Mail, Plus, Trash2, Save } from 'lucide-react';
import { InboxItemCard } from '@/components/aiInbox/InboxItemCard';
import type { AiInboxItem, AiInboxConfig, IntakeMailbox } from '@/components/aiInbox/types';
import { MAX_INTAKE_MAILBOXES } from '@/components/aiInbox/types';

const GOLD = '#C9A96E';
const BLACK = '#141414';

export default function AiInbox() {
  const { getIdToken } = useAuth();
  const [items, setItems] = useState<AiInboxItem[]>([]);
  const [config, setConfig] = useState<AiInboxConfig | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [qbo, setQbo] = useState<{ connected: boolean; env: string }>({ connected: false, env: 'sandbox' });
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const itemsRef = collection(db, 'ai_inbox_items');
    const unsubItems = onSnapshot(
      fsQuery(itemsRef),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLoaded(true);
      },
      (e) => setError(e.message),
    );

    const cfgRef = doc(db, 'ai_inbox_config', 'global');
    const unsubCfg = onSnapshot(
      cfgRef,
      (snap) => setConfig((snap.exists() ? (snap.data() as AiInboxConfig) : {}) as AiInboxConfig),
      () => {/* config is optional */},
    );

    // One-time project index for the correction dropdown.
    getDocs(fsQuery(collection(db, 'projects'), fsLimit(200)))
      .then((snap) => {
        const list = snap.docs
          .map((d) => {
            const p: any = d.data();
            return { id: d.id, name: String(p.name || p.projectName || `Project ${d.id.slice(0, 6)}`) };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        setProjects(list);
      })
      .catch(() => {/* non-fatal — dropdown just shows none */});

    return () => { unsubItems(); unsubCfg(); };
  }, []);

  // QBO connection status (gates financial approvals in the cards).
  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const r = await fetch('/api/ai-inbox/status', { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
          const d = await r.json();
          setQbo({ connected: !!d.qboConnected, env: d.qboEnv || 'sandbox' });
        }
      } catch {/* ignore */}
    })();
  }, [getIdToken]);

  const buckets = useMemo(() => {
    const needsReview: AiInboxItem[] = [];
    const autoFiled: AiInboxItem[] = [];
    const ignored: AiInboxItem[] = [];
    const approved: AiInboxItem[] = [];
    const rejected: AiInboxItem[] = [];
    for (const it of items) {
      const status = it.reviewStatus;
      if (status === 'rejected') { rejected.push(it); continue; }
      if (status === 'approved' || status === 'corrected') { approved.push(it); continue; }
      if (it.lane === 'ignored') { ignored.push(it); continue; }
      if (it.lane === 'auto_filed') { autoFiled.push(it); continue; }
      needsReview.push(it);
    }
    const sortByTime = (a: AiInboxItem, b: AiInboxItem) =>
      tsMillis(b.ingestedAt) - tsMillis(a.ingestedAt);
    needsReview.sort(sortByTime); autoFiled.sort(sortByTime); ignored.sort(sortByTime);
    approved.sort(sortByTime); rejected.sort(sortByTime);
    return { needsReview, autoFiled, ignored, approved, rejected };
  }, [items]);

  const moneyPending = useMemo(
    () => buckets.needsReview.filter((i) => i.amountUsd != null).reduce((s, i) => s + (Number(i.amountUsd) || 0), 0),
    [buckets.needsReview],
  );

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Inbox className="w-7 h-7" style={{ color: GOLD }} />
              <h1 className="text-2xl font-bold text-gray-900">AI Inbox</h1>
            </div>
            <p className="text-gray-500 text-sm max-w-3xl">
              Gmail invoices, receipts, bank alerts, Home Depot receipts, and sub/client email
              flow in via n8n, get read by Claude, matched to a project, and pre-categorized for
              QuickBooks. Nothing posts to QuickBooks until you approve it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border"
              style={{
                borderColor: qbo.connected ? '#bbf7d0' : '#fde68a',
                backgroundColor: qbo.connected ? '#f0fdf4' : '#fffbeb',
                color: qbo.connected ? '#15803d' : '#b45309',
              }}
            >
              <Plug className="w-3 h-3" />
              QuickBooks {qbo.connected ? `connected (${qbo.env})` : 'not connected'}
            </span>
          </div>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800">Could not load the AI Inbox</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <p className="text-xs text-red-600 mt-2">
                  This page requires admin role (<code>users/{'{uid}'}.role === 'admin'</code>).
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric icon={<Inbox className="w-5 h-5" style={{ color: GOLD }} />} label="Needs review" value={buckets.needsReview.length} sub={`${buckets.autoFiled.length} auto-filed`} />
          <Metric icon={<DollarSign className="w-5 h-5" style={{ color: GOLD }} />} label="$ awaiting approval" value={`$${moneyPending.toFixed(2)}`} sub="financial items in review" small />
          <Metric icon={<CheckCircle2 className="w-5 h-5" style={{ color: GOLD }} />} label="Approved" value={buckets.approved.length} sub={`${buckets.rejected.length} rejected`} />
          <Metric icon={<Brain className="w-5 h-5" style={{ color: GOLD }} />} label="AI spend today" value={`$${(config?.spendTodayUsd ?? 0).toFixed(4)}`} sub={`budget $${(config?.dailyBudgetUsd ?? 10).toFixed(2)}`} small />
        </div>

        <Tabs defaultValue="review">
          <TabsList>
            <TabsTrigger value="review">Needs Review ({buckets.needsReview.length})</TabsTrigger>
            <TabsTrigger value="autofiled">Auto-Filed ({buckets.autoFiled.length})</TabsTrigger>
            <TabsTrigger value="ignored">Ignored ({buckets.ignored.length})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({buckets.approved.length})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({buckets.rejected.length})</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
          </TabsList>

          <TabsContent value="review" className="mt-4">
            <ItemList items={buckets.needsReview} projects={projects} qboConnected={qbo.connected} loaded={loaded} emptyLabel="Nothing waiting for review." />
          </TabsContent>
          <TabsContent value="autofiled" className="mt-4">
            <ItemList items={buckets.autoFiled} projects={projects} qboConnected={qbo.connected} loaded={loaded} emptyLabel="No auto-filed items yet." />
          </TabsContent>
          <TabsContent value="ignored" className="mt-4">
            <p className="text-xs text-gray-400 mb-3">
              Marketing, newsletters, and spam the AI triaged out of your review queue. Nothing here touches QuickBooks.
              If something real landed here by mistake, change its Category and Approve it.
            </p>
            <ItemList items={buckets.ignored} projects={projects} qboConnected={qbo.connected} loaded={loaded} emptyLabel="Nothing ignored." />
          </TabsContent>
          <TabsContent value="approved" className="mt-4">
            <ItemList items={buckets.approved} projects={projects} qboConnected={qbo.connected} loaded={loaded} emptyLabel="No approved items yet." />
          </TabsContent>
          <TabsContent value="rejected" className="mt-4">
            <ItemList items={buckets.rejected} projects={projects} qboConnected={qbo.connected} loaded={loaded} emptyLabel="No rejected items." />
          </TabsContent>
          <TabsContent value="setup" className="mt-4 space-y-4">
            <MailboxEditor mailboxes={config?.mailboxes || []} getIdToken={getIdToken} />
            <SetupCard qbo={qbo} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function ItemList({
  items, projects, qboConnected, loaded, emptyLabel,
}: {
  items: AiInboxItem[];
  projects: { id: string; name: string }[];
  qboConnected: boolean;
  loaded: boolean;
  emptyLabel: string;
}) {
  if (!loaded) return <p className="text-sm text-gray-500">Loading…</p>;
  if (items.length === 0) return <p className="text-sm text-gray-500">{emptyLabel}</p>;
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <InboxItemCard key={it.id} item={it} projects={projects} qboConnected={qboConnected} />
      ))}
    </div>
  );
}

function MailboxEditor({
  mailboxes,
  getIdToken,
}: {
  mailboxes: IntakeMailbox[];
  getIdToken: () => Promise<string | null>;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<IntakeMailbox[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Seed from config whenever it changes (and we're not mid-edit).
  useEffect(() => {
    if (!dirty) setRows(mailboxes.length ? mailboxes : []);
  }, [mailboxes, dirty]);

  function update(i: number, patch: Partial<IntakeMailbox>) {
    setRows((r) => r.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
    setDirty(true);
  }
  function add() {
    if (rows.length >= MAX_INTAKE_MAILBOXES) return;
    setRows((r) => [...r, { address: '', label: '', enabled: true }]);
    setDirty(true);
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Not signed in');
      const cleaned = rows.filter((m) => m.address.trim());
      const r = await fetch('/api/ai-inbox/mailboxes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailboxes: cleaned }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setRows(data.mailboxes || cleaned);
      setDirty(false);
      toast({ title: 'Intake mailboxes saved', description: `${(data.mailboxes || cleaned).length} mailbox(es) connected.` });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5" style={{ color: GOLD }} />
          <CardTitle>Intake mailboxes</CardTitle>
        </div>
        <CardDescription>
          Connect up to {MAX_INTAKE_MAILBOXES} email addresses that feed this inbox (e.g. accounting@, your inbox, a shared box).
          Add one n8n Gmail trigger per address, each sending <code>"mailbox": "&lt;address&gt;"</code> so items are tagged by which inbox they hit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-gray-500">No mailboxes connected yet.</p>}
        {rows.map((m, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              value={m.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Label (e.g. Accounting)"
              className="h-9 w-40"
            />
            <Input
              value={m.address}
              onChange={(e) => update(i, { address: e.target.value })}
              placeholder="address@skyelinehomes.com"
              className="h-9 flex-1 min-w-[220px]"
            />
            <label className="text-xs text-gray-600 inline-flex items-center gap-1">
              <input type="checkbox" checked={m.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
              enabled
            </label>
            <Button variant="ghost" size="sm" onClick={() => remove(i)} className="text-gray-400 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={add} disabled={rows.length >= MAX_INTAKE_MAILBOXES} className="gap-1">
            <Plus className="w-4 h-4" /> Add mailbox
          </Button>
          <Button onClick={save} disabled={saving || !dirty} className="gap-1 text-white" style={{ backgroundColor: BLACK }}>
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
          </Button>
          {rows.length >= MAX_INTAKE_MAILBOXES && (
            <span className="text-xs text-gray-400">Max {MAX_INTAKE_MAILBOXES} reached.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SetupCard({ qbo }: { qbo: { connected: boolean; env: string } }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5" style={{ color: GOLD }} />
          <CardTitle>n8n ingestion endpoint</CardTitle>
        </div>
        <CardDescription>
          Point your n8n Gmail workflow at this endpoint. Authenticate with the shared secret
          stored in Secret Manager as <code>N8N_INGEST_SECRET</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-gray-700">
        <div>
          <p className="font-medium text-gray-900">Endpoint</p>
          <pre className="text-xs bg-gray-50 border border-gray-100 rounded p-2 mt-1 overflow-auto">
{`POST https://skyelineos.web.app/api/ai-inbox/ingest
Header: X-N8N-Secret: <N8N_INGEST_SECRET>
Content-Type: application/json

{
  "messageId": "<gmail message id>",      // for idempotency
  "threadId": "<gmail thread id>",
  "mailbox": "accounting@skyelinehomes.com", // which intake inbox this hit
  "from": { "email": "vendor@acme.com", "name": "Acme Supply" },
  "subject": "Invoice #1234",
  "text": "<plain-text email body>",
  "gmailLabels": ["INBOX", "Invoices"],
  "attachments": [
    {
      "filename": "invoice.pdf",
      "mimeType": "application/pdf",
      "content": "<base64 of the file>"     // PDFs + images are read by the AI
    }
  ],
  "receivedAt": "2026-06-20T15:00:00Z"
}`}
          </pre>
        </div>
        <ul className="list-disc pl-5 space-y-1 text-gray-600">
          <li>Items are deduplicated on <code>messageId</code> — n8n can retry safely.</li>
          <li>Send the attachment <strong>bytes</strong> as base64 in <code>content</code> — Claude reads the PDF/receipt image directly (amount, vendor, line items). Each file ≤ 25&nbsp;MB.</li>
          <li>Set <code>mailbox</code> per Gmail trigger so items are tagged by which of your connected inboxes they arrived on.</li>
          <li>The brain runs inline; the response includes the recommended Gmail label so n8n can apply it back in Gmail.</li>
          <li>Spam/marketing is auto-triaged to the <strong>Ignored</strong> tab; financial items always land in <strong>Needs Review</strong>. Nothing syncs to QuickBooks without your approval.</li>
          <li>QuickBooks is currently <strong>{qbo.connected ? `connected (${qbo.env})` : 'not connected'}</strong> — connect it in Settings to enable approve-and-sync.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value, sub, small }: { icon: React.ReactNode; label: string; value: number | string; sub?: string; small?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        </div>
        <p className={`font-bold text-gray-900 mt-1 ${small ? 'text-base' : 'text-2xl'}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function tsMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  const n = new Date(ts).getTime();
  return isNaN(n) ? 0 : n;
}
