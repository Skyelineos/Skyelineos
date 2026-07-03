// Global expenses view — all expenses across all projects, with filters.
// Per-project expenses live inside the project budget/draw panel.
// This page gives the GC a cross-project AP view.

import { useEffect, useState } from 'react';
import { collection, collectionGroup, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Receipt, Camera, RefreshCw } from 'lucide-react';
import { QuickExpenseCapture } from '@/components/expenses/QuickExpenseCapture';

interface Expense {
  id: string;
  projectId: string;
  projectName: string;
  vendor: string;
  amount: number;
  date: string;
  category: string;
  tradeCategory: string;
  status: string;
  capturedBy: string;
  description: string;
  receiptImageUrl?: string | null;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const STATUS_BADGE: Record<string, { label: string; style: React.CSSProperties }> = {
  pending:     { label: 'Pending',     style: { background: '#f3f4f6', color: '#374151' } },
  reconciled:  { label: 'Reconciled', style: { background: '#d1fae5', color: '#065f46' } },
  void:        { label: 'Void',        style: { background: '#fee2e2', color: '#991b1b' } },
};

export default function Expenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCapture, setShowCapture] = useState(false);
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collectionGroup(db, 'expenses'), orderBy('capturedAt', 'desc'), limit(200))
      );
      const rows: Expense[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setExpenses(rows);
      setTotal(rows.filter(e => e.status !== 'void').reduce((s, e) => s + (Number(e.amount) || 0), 0));
    } catch (e) {
      console.error('[Expenses]', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading text-brand-black">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All paid receipts and credit card purchases across projects</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCapture(true)}
            className="text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            <Camera className="h-4 w-4 mr-1.5" />
            Capture Receipt
          </Button>
        </div>
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Expenses</p>
              <p className="text-2xl font-semibold mt-1" style={{ color: '#C9A96E' }}>{fmt(total)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Pending</p>
              <p className="text-2xl font-semibold mt-1 text-gray-800">
                {fmt(expenses.filter(e => e.status === 'pending').reduce((s, e) => s + (Number(e.amount) || 0), 0))}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Reconciled</p>
              <p className="text-2xl font-semibold mt-1 text-green-700">
                {fmt(expenses.filter(e => e.status === 'reconciled').reduce((s, e) => s + (Number(e.amount) || 0), 0))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expense list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Receipt className="h-4 w-4" style={{ color: '#C9A96E' }} />
            All Expenses ({expenses.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : expenses.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No expenses yet. Tap <strong>Capture Receipt</strong> to log your first one.
            </div>
          ) : (
            <div className="divide-y">
              {expenses.map(e => (
                <div key={e.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-medium text-sm text-gray-900 truncate">{e.vendor || '—'}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{e.category}</Badge>
                      {e.capturedBy === 'sms' && <Badge variant="outline" className="text-[10px] shrink-0 text-blue-700 border-blue-200">SMS</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{e.date}</span>
                      {e.projectName && <><span>·</span><span className="truncate">{e.projectName}</span></>}
                      {e.tradeCategory && <><span>·</span><span>{e.tradeCategory}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <span className="text-sm font-semibold text-gray-900">{fmt(Number(e.amount) || 0)}</span>
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={STATUS_BADGE[e.status]?.style || STATUS_BADGE.pending.style}
                    >
                      {STATUS_BADGE[e.status]?.label || e.status}
                    </span>
                    {e.receiptImageUrl && (
                      <a href={e.receiptImageUrl} target="_blank" rel="noopener noreferrer">
                        <Receipt className="h-3.5 w-3.5 text-muted-foreground hover:text-gray-900" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showCapture && (
        <QuickExpenseCapture
          open={showCapture}
          onClose={() => setShowCapture(false)}
          onSaved={() => { setShowCapture(false); load(); }}
        />
      )}
    </div>
  );
}
