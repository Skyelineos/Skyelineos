import { useEffect, useState } from 'react';
import { financeRequest } from '@/lib/financeRequest';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Link2, RefreshCw, Unlink, AlertCircle, Download } from 'lucide-react';
import { QboCustomerImportDialog } from './QboCustomerImportDialog';

export function QboConnectionCard() {
  const [conn, setConn] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Selection-flow modal state. The "Sync Customers → Projects" one-click
  // button used to fire a bulk import inline; now the user opens this
  // dialog, picks which customers to bring over, and the dialog itself runs
  // the POST. `lastImport` is the post-close summary so the user can still
  // see what happened without re-opening the modal.
  const [importOpen, setImportOpen] = useState(false);
  const [lastImport, setLastImport] = useState<
    | { synced: number; created: number; updated: number; errors: number }
    | null
  >(null);

  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!user) return;
    financeRequest('/api/qbo/connection').then(result => { if (active) setConn(result); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.firebaseUid]);

  const connect = async () => {
    try {
      const result = await financeRequest<{ url: string }>('/api/qbo/oauth/start', {});
      window.location.assign(result.url);
    } catch (e) { setError((e as Error).message); }
  };
  const disconnect = async () => {
    if (!confirm('Disconnect this QuickBooks company from SkyelineOS?')) return;
    try {
      await financeRequest('/api/qbo/disconnect', {});
      setConn({ connected: false });
    } catch (e) { setError((e as Error).message); }
  };

  const isConnected = !!conn?.connected;
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
          {!isConnected && !loading && !error && (
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
        {error && <p role="alert">{error}</p>}
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
              <Button disabled={!isAdmin} onClick={connect} variant="outline" className="gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                Reconnect
              </Button>
              {/* Brand gold import button — #C9A96E is Skyeline's primary accent.
                  Opens a modal where the user picks which QBO customers to
                  bring over as Skyeline projects (replaces the old one-click
                  bulk sync that imported everything indiscriminately). */}
              <Button
                onClick={() => setImportOpen(true)}
                className="gap-1.5 font-sans text-white hover:bg-[#A8864A]"
                style={{ backgroundColor: '#C9A96E' }}
              >
                <Download className="w-3.5 h-3.5" />
                Import from QuickBooks
              </Button>
              <Button disabled={!isAdmin} onClick={disconnect} variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
                <Unlink className="w-3.5 h-3.5" />
                Disconnect
              </Button>
            </div>
            {lastImport && (
              <div className="flex items-start gap-2 p-2.5 bg-green-50 border border-green-200 rounded text-xs text-green-800 font-sans">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  ✓ {lastImport.synced} customer{lastImport.synced === 1 ? '' : 's'} imported
                  {' '}({lastImport.created} new, {lastImport.updated} updated
                  {lastImport.errors > 0 ? `, ${lastImport.errors} error${lastImport.errors === 1 ? '' : 's'}` : ''})
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Connect Skyeline OS to QuickBooks. You'll be sent to Intuit to authorize, then bounced back here.
            </p>
            <Button disabled={!isAdmin} onClick={connect} className="gap-1.5" style={{ backgroundColor: '#2ca01c', color: 'white' }}>
              <Link2 className="w-4 h-4" />
              Connect to QuickBooks
            </Button>
          </div>
        )}
      </CardContent>
      <QboCustomerImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(stats) => setLastImport({
          synced: stats.synced,
          created: stats.created,
          updated: stats.updated,
          errors: stats.errors,
        })}
      />
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
