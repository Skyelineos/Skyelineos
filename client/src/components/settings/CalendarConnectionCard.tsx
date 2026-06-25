import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, CalendarDays, Link2, RefreshCw, AlertCircle } from 'lucide-react';

// Google Calendar connection card.
// Uses the same ingestionLab OAuth flow as Gmail/Drive — the server mints an
// authorize URL and the user is redirected to Google, then back to
// /api/ingestionLab/oauth/calendar/callback, which stores the refresh token
// in ingestion_lab/config.calendar.
// The card reads that doc to show connection status.

export function CalendarConnectionCard() {
  const [conn, setConn] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fast one-time fetch first
    getDoc(doc(db, 'ingestion_lab', 'config'))
      .then(snap => { setConn(snap.exists() ? (snap.data() as any)?.calendar ?? null : null); setLoading(false); })
      .catch(() => setLoading(false));
    // Keep real-time for updates
    const unsub = onSnapshot(
      doc(db, 'ingestion_lab', 'config'),
      snap => { setConn(snap.exists() ? (snap.data() as any)?.calendar ?? null : null); setLoading(false); },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('You must be logged in as admin to connect Calendar.');
      const token = await user.getIdToken();
      const res = await fetch('/api/ingestionLab/oauth/calendar/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server error ${res.status}`);
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (e: any) {
      setError(e?.message || 'Failed to start authorization');
      setConnecting(false);
    }
  };

  const isConnected = !!(conn?.refreshToken && conn?.accessToken);
  const expiresAt: number | null = conn?.expiresAt?.toMillis
    ? conn.expiresAt.toMillis()
    : typeof conn?.expiresAt === 'number'
    ? conn.expiresAt
    : null;
  const tokenFresh = expiresAt != null && expiresAt > Date.now();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-blue-600" />
          Google Calendar
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
          Automatically add task due-dates to Google Calendar when you assign work to your team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : isConnected ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Connected account" value={conn.email || '—'} />
              <Detail
                label="Access token"
                value={tokenFresh ? 'Valid' : 'Will auto-refresh'}
                warn={!tokenFresh}
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <Button
              onClick={connect}
              variant="outline"
              className="gap-1.5"
              disabled={connecting}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${connecting ? 'animate-spin' : ''}`} />
              {connecting ? 'Redirecting…' : 'Reconnect'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Connect Skyeline OS to Google Calendar. You'll be sent to Google to authorize, then
              bounced back here. Task due-dates will auto-appear on your calendar when assigned.
            </p>
            {error && (
              <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <Button
              onClick={connect}
              className="gap-1.5"
              disabled={connecting}
            >
              <Link2 className="w-4 h-4" />
              {connecting ? 'Redirecting to Google…' : 'Connect Google Calendar'}
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
