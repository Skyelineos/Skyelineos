import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { collection, query, where, onSnapshot, collectionGroup } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign } from 'lucide-react';

// AR/AP Rollup — "who owes me what right now"
//
// AR = Accounts Receivable (money flowing IN). Sourced from two places:
//   1. financials where type == 'invoice' AND status != 'paid'
//   2. project draws where status in ('pending','requested')
// We sum amount/total fields with a few field-name fallbacks because
// the financials/draws docs were written by different code paths over
// time and field names drifted a bit.
//
// AP = Accounts Payable (money flowing OUT). Sourced from:
//   - financials where type == 'bill' AND status == 'unpaid'
//
// "Days overdue" = count of AR rows where dueDate < today.
//
// This card is read-only — no writes, no schema changes. Mounted on
// the dashboard gated on canAccessFinancials() (GC/admin only).
export function ArApRollupCard() {
  const [, setLocation] = useLocation();
  const [ar, setAr] = useState(0);
  const [ap, setAp] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [drawsAr, setDrawsAr] = useState(0);
  const [loading, setLoading] = useState(true);

  // AR — unpaid invoices in /financials
  useEffect(() => {
    const q = query(
      collection(db, 'financials'),
      where('type', '==', 'invoice'),
    );
    const unsub = onSnapshot(q, snap => {
      const todayYMD = new Date().toISOString().slice(0, 10);
      let total = 0;
      let overdue = 0;
      snap.docs.forEach(d => {
        const data: any = d.data();
        const status = String(data.status || '').toLowerCase();
        if (status === 'paid') return;
        const amount = Number(data.amount ?? data.total ?? 0);
        const paidToDate = Number(data.paidToDate ?? 0);
        const outstanding = Math.max(0, amount - paidToDate);
        total += outstanding;
        if (data.dueDate && String(data.dueDate) < todayYMD && outstanding > 0) {
          overdue += 1;
        }
      });
      setAr(total);
      setOverdueCount(overdue);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  // AR — pending/requested draws across all projects (collectionGroup).
  // Draws live in projects/{id}/draws — pending or requested means the
  // client owes us money on that draw.
  useEffect(() => {
    try {
      const q = query(
        collectionGroup(db, 'draws'),
        where('status', 'in', ['pending', 'requested']),
      );
      const unsub = onSnapshot(q, snap => {
        let total = 0;
        snap.docs.forEach(d => {
          const data: any = d.data();
          const amount = Number(data.amount ?? data.total ?? data.requestedAmount ?? 0);
          total += amount;
        });
        setDrawsAr(total);
      }, () => {});
      return unsub;
    } catch {
      // Missing collectionGroup index — silently ignore, AR will just be
      // invoice-only. The card still works.
    }
  }, []);

  // AP — unpaid bills in /financials
  useEffect(() => {
    const q = query(
      collection(db, 'financials'),
      where('type', '==', 'bill'),
      where('status', '==', 'unpaid'),
    );
    const unsub = onSnapshot(q, snap => {
      let total = 0;
      snap.docs.forEach(d => {
        const data: any = d.data();
        const amount = Number(data.amount ?? data.total ?? 0);
        const paidToDate = Number(data.paidToDate ?? 0);
        total += Math.max(0, amount - paidToDate);
      });
      setAp(total);
    }, () => {});
    return unsub;
  }, []);

  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

  const arTotal = ar + drawsAr;

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

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow touch-target rounded-xl"
      onClick={() => setLocation('/financials')}
    >
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-fluid-lg">
          <DollarSign className="h-5 w-5 flex-shrink-0" />
          <span className="min-w-0 text-wrap">AR / AP</span>
        </CardTitle>
        <CardDescription className="text-fluid-sm">Outstanding receivables &amp; bills</CardDescription>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <p className="text-fluid-sm text-gray-600 text-wrap">AR outstanding</p>
            <p className="text-fluid-lg font-bold text-green-700">{fmt(arTotal)}</p>
            {overdueCount > 0 && (
              <Badge variant="destructive" className="mt-1 text-xs">
                {overdueCount} overdue
              </Badge>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-fluid-sm text-gray-600 text-wrap">AP outstanding</p>
            <p className="text-fluid-lg font-bold text-orange-700">{fmt(ap)}</p>
          </div>
        </div>
        {arTotal === 0 && ap === 0 && (
          <p className="text-fluid-sm text-gray-400 mt-3 text-wrap">
            No outstanding receivables or bills.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
