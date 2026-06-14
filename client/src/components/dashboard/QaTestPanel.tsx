import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { PlayCircle, Lock, Loader2, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';

// Admin-only dashboard panel: "Test app" kicks off the QA sweep (GitHub Action
// driving Playwright against live), and the panel shows the live run status +
// the deploy lock so you know nothing's shipping mid-test.

interface QaCheck { name: string; status: string; ms?: number; error?: string | null; }
interface QaRun {
  id: string;
  status?: 'queued' | 'running' | 'passed' | 'failed' | 'error';
  triggeredBy?: string;
  summary?: { total: number; passed: number; failed: number; errored: number };
  checks?: QaCheck[];
  error?: string;
}

export function QaTestPanel() {
  const { toast } = useToast();
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<QaRun | null>(null);
  const [lock, setLock] = useState<{ locked?: boolean; reason?: string } | null>(null);

  useEffect(() => {
    const unsubRun = onSnapshot(
      query(collection(db, 'qa_runs'), orderBy('triggeredAt', 'desc'), limit(1)),
      snap => setRun(snap.docs[0] ? { id: snap.docs[0].id, ...(snap.docs[0].data() as any) } : null),
      () => {/* rules may block until first run exists */},
    );
    const unsubLock = onSnapshot(doc(db, 'system', 'deployLock'),
      snap => setLock(snap.exists() ? (snap.data() as any) : { locked: false }),
      () => {},
    );
    return () => { unsubRun(); unsubLock(); };
  }, []);

  const inFlight = run?.status === 'queued' || run?.status === 'running';

  const startTest = async () => {
    setStarting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch('/api/qa/trigger', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `Failed (${resp.status})`);
      toast({ title: 'Test started', description: 'The QA sweep is running — results will appear below. Deploys are paused until it finishes.' });
    } catch (e: any) {
      toast({ title: 'Could not start test', description: e?.message || '', variant: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  const releaseLock = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/qa/lock', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: false }),
      });
      toast({ title: 'Deploy lock released' });
    } catch (e: any) {
      toast({ title: 'Could not release lock', description: e?.message || '', variant: 'destructive' });
    }
  };

  const s = run?.summary;
  const failing = (run?.checks || []).filter(c => c.status !== 'ok' && c.status !== 'skip');

  return (
    <Card className="border-2" style={{ borderColor: 'rgba(201,169,110,0.4)' }}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" style={{ color: '#C9A96E' }} />
            <span className="font-semibold">App QA</span>
            {inFlight && <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Running</Badge>}
          </div>
          <Button onClick={startTest} disabled={starting || inFlight} className="gap-2" style={{ backgroundColor: '#141414' }}>
            {starting || inFlight ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {inFlight ? 'Test in progress…' : 'Test app'}
          </Button>
        </div>

        {lock?.locked && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            <span className="flex items-center gap-2"><Lock className="h-4 w-4" /> Deploys paused — {lock.reason || 'QA in progress'}.</span>
            <Button size="sm" variant="ghost" onClick={releaseLock}>Release</Button>
          </div>
        )}

        {!run && <p className="text-sm text-gray-500">No test runs yet. Click <strong>Test app</strong> to walk every screen across roles and surface broken pages, errors, and slow loads.</p>}

        {run && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <StatusPill status={run.status} />
              {s && (
                <span className="text-gray-600">
                  {s.passed} passed · <span className={s.failed ? 'text-amber-700 font-medium' : ''}>{s.failed} failed</span>
                  {s.errored ? <> · <span className="text-red-700 font-medium">{s.errored} errored</span></> : null}
                </span>
              )}
              {run.triggeredBy && <span className="text-xs text-gray-400">by {run.triggeredBy}</span>}
            </div>
            {run.error && <p className="text-sm text-red-600">{run.error}</p>}
            {failing.length > 0 && (
              <div className="rounded-md border border-gray-200 divide-y max-h-60 overflow-y-auto">
                {failing.slice(0, 25).map((c, i) => (
                  <div key={i} className="px-3 py-1.5 text-xs flex items-start justify-between gap-2">
                    <span className="font-mono text-gray-700">{c.name}</span>
                    <span className="text-right">
                      <span className="text-amber-700 font-medium">{c.status}</span>
                      {c.error && <span className="block text-gray-400 max-w-xs truncate">{c.error}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status?: string }) {
  if (status === 'passed') return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 gap-1"><CheckCircle2 className="h-3 w-3" /> Passed</Badge>;
  if (status === 'failed') return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 gap-1"><AlertTriangle className="h-3 w-3" /> Issues found</Badge>;
  if (status === 'error') return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 gap-1"><AlertTriangle className="h-3 w-3" /> Run error</Badge>;
  if (status === 'running' || status === 'queued') return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Running</Badge>;
  return <Badge variant="outline">{status || 'unknown'}</Badge>;
}
