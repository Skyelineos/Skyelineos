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
import { Inbox, Brain, DollarSign, CheckCircle2, AlertCircle, Plug, Zap } from 'lucide-react';
import { InboxItemCard } from '@/components/aiInbox/InboxItemCard';
import type { AiInboxItem, AiInboxConfig } from '@/components/aiInbox/types';

const GOLD = '#C9A96E';

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
    const approved: AiInboxItem[] = [];
    const rejected: AiInboxItem[] = [];
    for (const it of items) {
      const status = it.reviewStatus;
      if (status === 'rejected') { rejected.push(it); continue; }
      if (status === 'approved' || status === 'corrected') { approved.push(it); continue; }
      if (it.lane === 'auto_filed') { autoFiled.push(it); continue; }
      needsReview.push(it);
    }
    const sortByTime = (a: AiInboxItem, b: AiInboxItem) =>
      tsMillis(b.ingestedAt) - tsMillis(a.ingestedAt);
    needsReview.sort(sortByTime); autoFiled.sort(sortByTime);
    approved.sort(sortByTime); rejected.sort(sortByTime);
    return { needsReview, autoFiled, approved, rejected };
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
          <TabsContent value="approved" className="mt-4">
            <ItemList items={buckets.approved} projects={projects} qboConnected={qbo.connected} loaded={loaded} emptyLabel="No approved items yet." />
          </TabsContent>
          <TabsContent value="rejected" className="mt-4">
            <ItemList items={buckets.rejected} projects={projects} qboConnected={qbo.connected} loaded={loaded} emptyLabel="No rejected items." />
          </TabsContent>
          <TabsContent value="setup" className="mt-4">
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
  "from": { "email": "vendor@acme.com", "name": "Acme Supply" },
  "subject": "Invoice #1234",
  "text": "<plain-text email body>",
  "gmailLabels": ["INBOX", "Invoices"],
  "attachments": [{ "filename": "inv.pdf", "mimeType": "application/pdf" }],
  "receivedAt": "2026-06-20T15:00:00Z"
}`}
          </pre>
        </div>
        <ul className="list-disc pl-5 space-y-1 text-gray-600">
          <li>Items are deduplicated on <code>messageId</code> — n8n can retry safely.</li>
          <li>The brain runs inline; the response includes the recommended Gmail label so n8n can apply it back in Gmail.</li>
          <li>Financial items always land in <strong>Needs Review</strong>; nothing syncs to QuickBooks without your approval here.</li>
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
