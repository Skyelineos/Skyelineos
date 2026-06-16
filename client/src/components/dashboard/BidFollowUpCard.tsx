import { useEffect, useState } from 'react';
import { collectionGroup, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Mail, CheckCircle } from 'lucide-react';

// Bid Follow-Up Needed
//
// Surfaces bid invites where a sub was asked, the request is still
// open, the request is at least 5 days old, and the dueByDate hasn't
// passed yet. Tyler keeps losing track of "X invited, Y responded,
// follow up with Z" — this card answers that at a glance.
//
// Data shape: /projects/{projectId}/bidRequests/{requestId} doc with
//   status: 'open' | 'closed' | 'awarded'
//   createdAt: Timestamp
//   dueDate: 'YYYY-MM-DD'
//   projectName, trade
//   vendors: VendorRecipientStored[] with { vendorName, bidStatus }
//     bidStatus: 'pending' | 'viewed' | 'submitted' | 'declined' | 'expired'
//
// "Send reminder" is stubbed (console.log only) — wiring the actual
// reminder send is a future Stream's job.

interface BidFollowUpRow {
  key: string;            // for React list key
  projectId: string;
  bidRequestId: string;
  projectName: string;
  trade: string;
  vendorName: string;
  daysSinceInvited: number;
  bidStatus: string;
}

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return null;
}

export function BidFollowUpCard() {
  const [rows, setRows] = useState<BidFollowUpRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Query all open bidRequests across all projects. We filter the
    // "stale" + "still actionable" bits client-side because Firestore
    // can't do range queries on multiple fields without compound indexes
    // we don't want to add for a dashboard surface.
    let unsub: (() => void) | null = null;
    try {
      const q = query(
        collectionGroup(db, 'bidRequests'),
        where('status', '==', 'open'),
      );
      unsub = onSnapshot(q, snap => {
        const now = Date.now();
        const todayYMD = new Date().toISOString().slice(0, 10);
        const out: BidFollowUpRow[] = [];
        snap.docs.forEach(d => {
          const data: any = d.data();
          const createdAt = tsToDate(data.createdAt);
          if (!createdAt) return;
          const ageMs = now - createdAt.getTime();
          if (ageMs < FIVE_DAYS_MS) return;
          const dueDate: string | undefined = data.dueDate;
          if (dueDate && dueDate < todayYMD) return;
          const projectId: string =
            data.projectId || (d.ref.parent.parent?.id ?? '');
          const projectName: string = data.projectName || 'Untitled project';
          const trade: string = data.trade || data.scope || 'General';
          const vendors: any[] = Array.isArray(data.vendors) ? data.vendors : [];
          const daysSinceInvited = Math.floor(ageMs / (24 * 60 * 60 * 1000));
          if (vendors.length === 0) {
            // Old-shape doc with only invitedSubIds — surface a single row
            // labelled by trade so it doesn't get hidden.
            const invited: string[] = Array.isArray(data.invitedSubIds)
              ? data.invitedSubIds
              : [];
            if (invited.length === 0) return;
            out.push({
              key: `${d.id}-legacy`,
              projectId,
              bidRequestId: d.id,
              projectName,
              trade,
              vendorName: `${invited.length} invited`,
              daysSinceInvited,
              bidStatus: 'pending',
            });
            return;
          }
          vendors.forEach((v, idx) => {
            const bidStatus = String(v.bidStatus || 'pending').toLowerCase();
            if (bidStatus === 'submitted' || bidStatus === 'declined') return;
            out.push({
              key: `${d.id}-${idx}`,
              projectId,
              bidRequestId: d.id,
              projectName,
              trade,
              vendorName: v.vendorName || v.name || 'Unknown vendor',
              daysSinceInvited,
              bidStatus,
            });
          });
        });
        // Worst-first (longest since invited)
        out.sort((a, b) => b.daysSinceInvited - a.daysSinceInvited);
        setRows(out.slice(0, 8));
        setLoading(false);
      }, () => setLoading(false));
    } catch {
      setLoading(false);
    }
    return () => { if (unsub) unsub(); };
  }, []);

  const handleReminder = (row: BidFollowUpRow) => {
    // Stub — wiring the actual reminder send is a future Stream.
    // The button still surfaces intent + records intent in console for
    // QA repro.
    // eslint-disable-next-line no-console
    console.log('[BidFollowUpCard] reminder requested (stub)', {
      projectId: row.projectId,
      bidRequestId: row.bidRequestId,
      vendorName: row.vendorName,
    });
  };

  if (loading) {
    return (
      <Card className="animate-pulse rounded-xl">
        <CardHeader>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50 rounded-xl">
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-fluid-lg">
            <Mail className="h-5 w-5 flex-shrink-0 text-green-700" />
            <span className="min-w-0 text-wrap">Bid Follow-Up</span>
          </CardTitle>
          <CardDescription className="text-fluid-sm">All caught up</CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="h-4 w-4" />
            <span className="text-fluid-sm">All bid invites responded — nice.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl">
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-fluid-lg">
          <Mail className="h-5 w-5 flex-shrink-0" />
          <span className="min-w-0 text-wrap">Bid Follow-Up</span>
        </CardTitle>
        <CardDescription className="text-fluid-sm">
          {rows.length} sub{rows.length === 1 ? '' : 's'} haven&apos;t responded
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div className="space-y-2">
          {rows.map(r => (
            <div
              key={r.key}
              className="flex items-center justify-between gap-2 min-w-0 py-2 border-b last:border-b-0 border-gray-100"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-fluid-sm font-medium min-w-0 text-wrap">
                    {r.vendorName}
                  </span>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {r.trade}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 text-wrap">
                  {r.projectName} · {r.daysSinceInvited}d since invited
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0"
                onClick={() => handleReminder(r)}
              >
                <Bell className="h-3 w-3 mr-1" />
                Remind
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
