import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { authFetch } from '@/lib/authFetch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Link2, RefreshCw, Unlink, AlertCircle, Loader2, Users } from 'lucide-react';

// Connect-to-QuickBooks UI. Reads /qboConnections/global to show status.
// "Connect" button redirects to /qbo/oauth/start which Intuit then bounces
// back to /qbo/oauth/callback (served by the api Cloud Function).
export function QboConnectionCard() {
  const [conn, setConn] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // "Sync Customers → Projects" state. `result` holds the last summary
  // (or error message) so the user can see how the last sync went without
  // it auto-clearing on every render.
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<
    | { ok: true; synced: number; created: number; updated: number; errors: number }
    | { ok: false; message: string }
    | null
  >(null);

  useEffect(() => {
    // One-time fetch for fast initial load, then real-time updates
    getDoc(doc(db, 'qboConnections', 'global'))
      .then(snap => { setConn(snap.exists() ? snap.data() : null); setLoading(false); })
      .catch(() => setLoading(false));
    // Real-time listener for reconnect/disconnect events
    const unsub = onSnapshot(doc(db, 'qboConnections', 'global'),
      snap => { setConn(snap.exists() ? snap.data() : null); setLoading(false); },
      () => setLoading(false));
    return unsub;
  }, []);

  const connect = () => {
    // Bounce to the OAuth start endpoint — Cloud Function-served, will
    // redirect to Intuit's consent screen, which then comes back to
    // /qbo/oauth/callback to land the tokens.
    window.location.href = 'https://skyelineos.web.app/qbo/oauth/start';
  };

  // Pull every QBO Customer/Job into Skyeline as a Project. Runs the
  // server-side bulk upsert, then renders
  //   ✓ 12 projects synced (3 new, 9 updated)
  // next to the button. Errors show inline so the user doesn't have to open
  // devtools to debug a 409 / 500.
  const syncCustomers = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await authFetch('/api/qbo/sync-customers', { method: 'GET' });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setSyncResult({
          ok: false,
          message: json?.error || `Sync failed (${res.status})`,
        });
      } else {
        setSyncResult({
          ok: true,
          synced: Number(json.synced) || 0,
          created: Number(json.created) || 0,
          updated: Number(json.updated) || 0,
          errors: Number(json.errors) || 0,
        });
      }
    } catch (e: any) {
      setSyncResult({ ok: false, message: e?.message || 'Network error' });
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect QuickBooks? You\'ll need to reconnect to push bills or invoices.')) return;
    try {
      // Soft-disconnect by clearing tokens. We keep the doc so re-connecting
      // is auditable.
      await updateDoc(doc(db, 'qboConnections', 'global'), {
        accessToken: '',
        refreshToken: '',
        disconnectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any);
    } catch (e: any) {
      alert(`Disconnect failed: ${e?.message || 'unknown'}`);
    }
  };

  const isConnected = !!(conn && conn.accessToken && !conn.disconnectedAt);
  const expiresInDays = conn?.refreshTokenExpiresAt
    ? Math.round((conn.refreshTokenExpiresAt - Date.now()) / 86400000)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-green-600 text-white text-xs font-bold">QB</span>
          QuickBooks Online
          {isConnected && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Connected
            </Badge>
          )}
          {!isConnected && (
            <Badge variant="outline" className="bg-gray-50 text-gray-700">
              Not connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Push bills and client invoices straight to QuickBooks so you + your CFO aren't double-entering.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : isConnected ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="QBO realm" value={conn.realmId || '—'} />
              <Detail label="Environment" value={conn.env || 'sandbox'} />
              <Detail
                label="Refresh token expires"
                value={expiresInDays != null ? `in ${expiresInDays} day${expiresInDays === 1 ? '' : 's'}` : '—'}
                warn={expiresInDays != null && expiresInDays < 14}
              />
              <Detail label="Scope" value={(conn.scope || 'accounting').replace('com.intuit.quickbooks.', '')} />
            </div>
            {expiresInDays != null && expiresInDays < 14 && (
              <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>The refresh token expires soon. Reconnect within the next {expiresInDays} day{expiresInDays === 1 ? '' : 's'} to avoid losing the connection.</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={connect} variant="outline" className="gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                Reconnect
              </Button>
              {/* Brand gold sync button — #C9A96E is Skyeline's primary accent. */}
              <Button
                onClick={syncCustomers}
                disabled={syncing}
                className="gap-1.5 text-[#141414] hover:opacity-90"
                style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              >
                {syncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Users className="w-3.5 h-3.5" />
                )}
                {syncing ? 'Syncing…' : 'Sync Customers → Projects'}
              </Button>
              <Button onClick={disconnect} variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
                <Unlink className="w-3.5 h-3.5" />
                Disconnect
              </Button>
            </div>
            {syncResult && syncResult.ok && (
              <div className="flex items-start gap-2 p-2.5 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  ✓ {syncResult.synced} project{syncResult.synced === 1 ? '' : 's'} synced
                  {' '}({syncResult.created} new, {syncResult.updated} updated
                  {syncResult.errors > 0 ? `, ${syncResult.errors} error${syncResult.errors === 1 ? '' : 's'}` : ''})
                </span>
              </div>
            )}
            {syncResult && !syncResult.ok && (
              <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{syncResult.message}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Connect Skyeline OS to QuickBooks. You'll be sent to Intuit to authorize, then bounced back here.
            </p>
            <Button onClick={connect} className="gap-1.5" style={{ backgroundColor: '#2ca01c', color: 'white' }}>
              <Link2 className="w-4 h-4" />
              Connect to QuickBooks
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-sm font-medium ${warn ? 'text-amber-700' : 'text-gray-900'}`}>{value}</div>
    </div>
  );
}
