// Ingestion Lab — admin-only sandbox at /admin/ingestion-lab.
//
// Top of page: metrics strip (raw counts by source, processed total,
// pending counts per lane, last-* timestamps).
// Tabs:
//   - Connectors   — OAuth + manual ingest + brain pass triggers
//   - Auto-Filed   — read-only table of items the brain auto-filed
//   - Review Queue — cards with Approve/Correct/Reject
//   - Ask Queue    — cards with the brain's clarification question
//
// All data is read live from Firestore via onSnapshot listeners. Writes
// happen via Cloud Function calls (see ConnectorsTab) or direct Firestore
// updates gated by the processed_items update rule (review actions).

import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, onSnapshot, query as fsQuery,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Beaker, Inbox, Brain, Clock, AlertCircle } from 'lucide-react';
import { ConnectorsTab } from '@/components/ingestionLab/ConnectorsTab';
import { AutoFiledTab } from '@/components/ingestionLab/AutoFiledTab';
import { ReviewQueueTab } from '@/components/ingestionLab/ReviewQueueTab';
import { AskQueueTab } from '@/components/ingestionLab/AskQueueTab';
import type { IngestionConfig, RawItem, ProcessedItem } from '@/components/ingestionLab/types';

const CONFIG_PATH = ['ingestion_lab', 'config'] as const;
const DATA_PARENT = ['ingestion_lab', 'data'] as const;

export default function IngestionLab() {
  const [config, setConfig] = useState<IngestionConfig | null>(null);
  const [rawItems, setRawItems] = useState<RawItem[]>([]);
  const [processedItems, setProcessedItems] = useState<ProcessedItem[]>([]);
  const [loaded, setLoaded] = useState<{ config: boolean; raw: boolean; processed: boolean }>(
    { config: false, raw: false, processed: false },
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const configRef = doc(db, CONFIG_PATH[0], CONFIG_PATH[1]);
    const unsubConfig = onSnapshot(
      configRef,
      (snap) => {
        setConfig((snap.exists() ? (snap.data() as IngestionConfig) : {}) as IngestionConfig);
        setLoaded((s) => ({ ...s, config: true }));
      },
      (e) => setError(e.message),
    );

    const rawRef = collection(db, DATA_PARENT[0], DATA_PARENT[1], 'raw_items');
    const unsubRaw = onSnapshot(
      fsQuery(rawRef),
      (snap) => {
        const items: RawItem[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setRawItems(items);
        setLoaded((s) => ({ ...s, raw: true }));
      },
      (e) => setError(e.message),
    );

    const processedRef = collection(db, DATA_PARENT[0], DATA_PARENT[1], 'processed_items');
    const unsubProcessed = onSnapshot(
      fsQuery(processedRef),
      (snap) => {
        const items: ProcessedItem[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setProcessedItems(items);
        setLoaded((s) => ({ ...s, processed: true }));
      },
      (e) => setError(e.message),
    );

    return () => {
      unsubConfig();
      unsubRaw();
      unsubProcessed();
    };
  }, []);

  const metrics = useMemo(() => {
    const rawBySource = { gmail: 0, drive: 0, imessage: 0, icloud: 0, upload: 0 };
    for (const item of rawItems) {
      const s = item.source as keyof typeof rawBySource;
      if (s in rawBySource) rawBySource[s] += 1;
    }
    const processedCount = processedItems.length;
    const laneCounts = { auto_filed: 0, review_queue: 0, ask_queue: 0 };
    for (const item of processedItems) {
      if (item.reviewStatus === 'pending' && item.lane in laneCounts) {
        laneCounts[item.lane as keyof typeof laneCounts] += 1;
      }
    }
    return { rawBySource, processedCount, laneCounts };
  }, [rawItems, processedItems]);

  const reviewItems = useMemo(
    () => processedItems.filter((p) => p.lane === 'review_queue' && p.reviewStatus === 'pending'),
    [processedItems],
  );
  const askItems = useMemo(
    () => processedItems.filter((p) => p.lane === 'ask_queue' && p.reviewStatus === 'pending'),
    [processedItems],
  );
  const autoFiledItems = useMemo(
    () => processedItems.filter((p) => p.lane === 'auto_filed'),
    [processedItems],
  );

  const allLoaded = loaded.config && loaded.raw && loaded.processed;

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Beaker className="w-7 h-7 text-[#C9A96E]" />
              <h1 className="text-2xl font-bold text-gray-900">Ingestion Lab</h1>
            </div>
            <p className="text-gray-500 text-sm">
              Admin-only sandbox for Gmail / Drive / iMessage / iCloud → Claude extraction →
              three-lane review. Isolated from production data — writes only to{' '}
              <code className="text-xs">ingestion_lab/</code>.
            </p>
          </div>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800">Could not load lab data</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <p className="text-xs text-red-600 mt-2">
                  This page requires admin role. Confirm your user has{' '}
                  <code>role === 'admin'</code> in <code>users/{'{uid}'}</code>.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Metrics strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            icon={<Inbox className="w-5 h-5 text-[#C9A96E]" />}
            label="Raw items ingested"
            value={rawItems.length}
            sub={
              `gmail ${metrics.rawBySource.gmail} · drive ${metrics.rawBySource.drive} · ` +
              `imsg ${metrics.rawBySource.imessage} · icloud ${metrics.rawBySource.icloud}`
            }
          />
          <MetricCard
            icon={<Brain className="w-5 h-5 text-[#C9A96E]" />}
            label="Processed"
            value={metrics.processedCount}
            sub={
              `auto ${metrics.laneCounts.auto_filed} · review ${metrics.laneCounts.review_queue} ` +
              `· ask ${metrics.laneCounts.ask_queue}`
            }
          />
          <MetricCard
            icon={<Clock className="w-5 h-5 text-[#C9A96E]" />}
            label="Last brain pass"
            value={formatTimestamp(config?.lastBrainPassAt) || '—'}
            sub={
              config?.spendDate
                ? `$${(config.spendTodayUsd ?? 0).toFixed(4)} / $${(config.dailyBudgetUsd ?? 5).toFixed(2)} today`
                : 'never'
            }
            small
          />
          <MetricCard
            icon={<Inbox className="w-5 h-5 text-[#C9A96E]" />}
            label="Pending review"
            value={metrics.laneCounts.review_queue + metrics.laneCounts.ask_queue}
            sub={`${metrics.laneCounts.review_queue} review · ${metrics.laneCounts.ask_queue} ask`}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="connectors">
          <TabsList>
            <TabsTrigger value="connectors">Connectors</TabsTrigger>
            <TabsTrigger value="autofiled">
              Auto-Filed ({autoFiledItems.length})
            </TabsTrigger>
            <TabsTrigger value="review">
              Review Queue ({reviewItems.length})
            </TabsTrigger>
            <TabsTrigger value="ask">
              Ask Queue ({askItems.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connectors" className="mt-4">
            {allLoaded ? (
              <ConnectorsTab config={config} rawCounts={metrics.rawBySource} />
            ) : (
              <p className="text-sm text-gray-500">Loading…</p>
            )}
          </TabsContent>

          <TabsContent value="autofiled" className="mt-4">
            <AutoFiledTab items={autoFiledItems} />
          </TabsContent>

          <TabsContent value="review" className="mt-4">
            <ReviewQueueTab items={reviewItems} rawItems={rawItems} />
          </TabsContent>

          <TabsContent value="ask" className="mt-4">
            <AskQueueTab items={askItems} rawItems={rawItems} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  small?: boolean;
}

function MetricCard({ icon, label, value, sub, small }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        </div>
        <p className={`font-bold text-gray-900 mt-1 ${small ? 'text-base' : 'text-2xl'}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function formatTimestamp(ts: any): string {
  if (!ts) return '';
  // Firestore Timestamp
  if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
  // ISO or millis
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}
