// Connectors tab — connect Gmail / Drive via OAuth, view connection status,
// and trigger ingestion + brain pass runs on demand.
//
// Backend endpoints touched here:
//   POST /api/ingestionLab/oauth/{gmail|drive}/start   (returns { url })
//   POST /api/ingestionLab/ingest/{gmail|drive}
//   POST /api/ingestionLab/upload  (not called from UI — external scripts)
//   POST /api/ingestionLab/brain/process

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Mail, HardDrive, MessageSquare, Cloud, Brain, RefreshCw, CheckCircle2, XCircle,
} from 'lucide-react';
import type { IngestionConfig } from './types';

interface ConnectorsTabProps {
  config: IngestionConfig | null;
  rawCounts: { gmail: number; drive: number; imessage: number; icloud: number; upload: number };
}

export function ConnectorsTab({ config, rawCounts }: ConnectorsTabProps) {
  const { getIdToken } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function authedPost(path: string, body?: any) {
    const token = await getIdToken();
    if (!token) throw new Error('Not signed in');
    const r = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  }

  async function startOAuth(provider: 'gmail' | 'drive') {
    setBusy(`connect-${provider}`);
    try {
      const { url } = await authedPost(`/api/ingestionLab/oauth/${provider}/start`);
      if (!url) throw new Error('No URL returned from start endpoint');
      window.location.href = url;
    } catch (e: any) {
      toast({
        title: `Connect ${provider} failed`,
        description: e.message,
        variant: 'destructive',
      });
      setBusy(null);
    }
  }

  async function runIngest(source: 'gmail' | 'drive') {
    setBusy(`ingest-${source}`);
    try {
      const r = await authedPost(`/api/ingestionLab/ingest/${source}`);
      const skipped = r.skipped ?? 0;
      const added = r.new ?? 0;
      const errs = (r.errors || []).length;
      toast({
        title: `${source[0].toUpperCase()}${source.slice(1)} ingestion complete`,
        description: `${added} new, ${skipped} skipped${errs ? `, ${errs} errors` : ''}`,
        variant: errs > 0 ? 'destructive' : undefined,
      });
    } catch (e: any) {
      toast({
        title: `Ingest ${source} failed`,
        description: e.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  }

  async function runBrainPass() {
    setBusy('brain');
    try {
      const r = await authedPost('/api/ingestionLab/brain/process');
      const description =
        `${r.succeeded ?? 0} succeeded, ${r.failed ?? 0} failed. ` +
        `Cost $${(r.costUsd ?? 0).toFixed(4)} ` +
        `(today: $${(r.spendTodayUsd ?? 0).toFixed(4)} / $${(r.dailyBudgetUsd ?? 0).toFixed(2)}).`;
      toast({
        title: `Brain pass: processed ${r.processed ?? 0}`,
        description,
        variant: (r.failed ?? 0) > 0 ? 'destructive' : undefined,
      });
    } catch (e: any) {
      toast({ title: 'Brain pass failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ConnectorCard
          icon={<Mail className="w-6 h-6 text-[#C9A96E]" />}
          title="Gmail"
          subtitle={`Label: Skyeline-Spike · ${rawCounts.gmail} items ingested`}
          connectionLabel={config?.gmail?.email}
          onConnect={() => startOAuth('gmail')}
          onIngest={() => runIngest('gmail')}
          connectBusy={busy === 'connect-gmail'}
          ingestBusy={busy === 'ingest-gmail'}
          ingestDisabled={!config?.gmail?.email}
        />
        <ConnectorCard
          icon={<HardDrive className="w-6 h-6 text-[#C9A96E]" />}
          title="Google Drive"
          subtitle={`Two project folders · ${rawCounts.drive} items ingested`}
          connectionLabel={config?.drive?.email}
          onConnect={() => startOAuth('drive')}
          onIngest={() => runIngest('drive')}
          connectBusy={busy === 'connect-drive'}
          ingestBusy={busy === 'ingest-drive'}
          ingestDisabled={!config?.drive?.email}
        />
        <UploadSourceCard
          icon={<MessageSquare className="w-6 h-6 text-gray-400" />}
          title="iMessage"
          subtitle="Mac chat.db script (not yet built)"
          count={rawCounts.imessage}
        />
        <UploadSourceCard
          icon={<Cloud className="w-6 h-6 text-gray-400" />}
          title="iCloud"
          subtitle="iCloud upload script (not yet built)"
          count={rawCounts.icloud}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#C9A96E]" />
            <CardTitle>Brain Pass</CardTitle>
          </div>
          <CardDescription>
            Process up to 50 unprocessed raw items through the extraction prompt.
            Daily budget: ${config?.dailyBudgetUsd?.toFixed(2) ?? '5.00'} ·
            spent today: ${config?.spendTodayUsd?.toFixed(4) ?? '0.0000'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={runBrainPass}
            disabled={busy === 'brain'}
            className="gap-2 text-white"
            style={{ backgroundColor: '#141414' }}
          >
            <Brain className="w-4 h-4" />
            {busy === 'brain' ? 'Processing…' : 'Run Brain Pass'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

interface ConnectorCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  connectionLabel?: string;
  onConnect: () => void;
  onIngest: () => void;
  connectBusy: boolean;
  ingestBusy: boolean;
  ingestDisabled: boolean;
}

function ConnectorCard({
  icon, title, subtitle, connectionLabel,
  onConnect, onIngest, connectBusy, ingestBusy, ingestDisabled,
}: ConnectorCardProps) {
  const connected = !!connectionLabel;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle>{title}</CardTitle>
          {connected ? (
            <Badge className="ml-auto bg-green-50 text-green-700 border-green-200" variant="outline">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
            </Badge>
          ) : (
            <Badge className="ml-auto bg-gray-50 text-gray-500 border-gray-200" variant="outline">
              <XCircle className="w-3 h-3 mr-1" /> Not connected
            </Badge>
          )}
        </div>
        <CardDescription>{subtitle}</CardDescription>
        {connectionLabel && (
          <p className="text-xs text-gray-500 mt-1">Linked account: <code>{connectionLabel}</code></p>
        )}
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          variant={connected ? 'outline' : 'default'}
          onClick={onConnect}
          disabled={connectBusy}
          className="gap-2"
          style={!connected ? { backgroundColor: '#C9A96E', color: '#141414' } : undefined}
        >
          {connectBusy ? 'Opening Google…' : connected ? 'Reconnect' : `Connect ${title}`}
        </Button>
        <Button
          variant="outline"
          onClick={onIngest}
          disabled={ingestDisabled || ingestBusy}
          className="gap-2"
          title={ingestDisabled ? 'Connect first' : undefined}
        >
          <RefreshCw className={`w-4 h-4 ${ingestBusy ? 'animate-spin' : ''}`} />
          {ingestBusy ? 'Ingesting…' : 'Run Ingestion'}
        </Button>
      </CardContent>
    </Card>
  );
}

interface UploadSourceCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
}

function UploadSourceCard({ icon, title, subtitle, count }: UploadSourceCardProps) {
  return (
    <Card className="bg-gray-50/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-gray-600">{title}</CardTitle>
          <Badge className="ml-auto bg-gray-100 text-gray-500 border-gray-200" variant="outline">
            {count} item{count === 1 ? '' : 's'}
          </Badge>
        </div>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-gray-500">
          Items arrive via <code>POST /api/ingestionLab/upload</code> from external scripts —
          no button here yet.
        </p>
      </CardContent>
    </Card>
  );
}
