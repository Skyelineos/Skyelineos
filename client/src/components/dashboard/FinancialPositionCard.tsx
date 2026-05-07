import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocation } from 'wouter';
import { Landmark, TrendingUp, TrendingDown, RefreshCw, Pencil, Check } from 'lucide-react';

interface FinancialPosition {
  cashOnHand: number;
  ar: number;         // accounts receivable (outstanding invoices)
  ap: number;         // accounts payable (what we owe subs/vendors)
  lastUpdated?: string;
  source?: 'manual' | 'quickbooks';
}

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function FinancialPositionCard() {
  const [, setLocation] = useLocation();
  const [position, setPosition] = useState<FinancialPosition>({ cashOnHand: 0, ar: 0, ap: 0 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ cashOnHand: '', ap: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Load manual cash/AP override from settings
        const snap = await getDoc(doc(db, 'settings', 'financialPosition'));
        const manual = snap.exists() ? snap.data() as FinancialPosition : { cashOnHand: 0, ap: 0 };

        // Calculate AR from outstanding invoices (live from Firestore)
        const invSnap = await getDocs(collection(db, 'invoices'));
        const ar = invSnap.docs.reduce((s, d) => {
          const data = d.data();
          if (data.status === 'sent' || data.status === 'overdue') return s + (data.amount || 0);
          return s;
        }, 0);

        setPosition({
          cashOnHand: manual.cashOnHand || 0,
          ar,
          ap: manual.ap || 0,
          lastUpdated: manual.lastUpdated,
          source: manual.source || 'manual',
        });
      } catch {
        // silently fail — show zeros
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft({ cashOnHand: String(position.cashOnHand), ap: String(position.ap) });
    setEditing(true);
  };

  const saveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaving(true);
    try {
      const data = {
        cashOnHand: parseFloat(draft.cashOnHand.replace(/[^0-9.]/g, '')) || 0,
        ap: parseFloat(draft.ap.replace(/[^0-9.]/g, '')) || 0,
        source: 'manual' as const,
        lastUpdated: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
      };
      await setDoc(doc(db, 'settings', 'financialPosition'), { ...data, updatedAt: serverTimestamp() });
      setPosition(p => ({ ...p, ...data }));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const net = position.cashOnHand + position.ar - position.ap;

  if (loading) {
    return (
      <Card className="rounded-xl animate-pulse">
        <CardHeader className="p-4 md:p-6">
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow touch-target rounded-xl"
      onClick={() => setLocation('/finance')}
    >
      <CardHeader className="p-4 md:p-6 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-fluid-lg">
            <Landmark className="h-5 w-5 flex-shrink-0" />
            <span>Financial Position</span>
          </CardTitle>
          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
            {position.lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:block">Updated {position.lastUpdated}</span>
            )}
            {!editing ? (
              <button onClick={openEdit} className="p-1.5 rounded hover:bg-gray-100">
                <Pencil className="w-3.5 h-3.5 text-gray-400" />
              </button>
            ) : (
              <button onClick={saveEdit} disabled={saving} className="p-1.5 rounded hover:bg-green-50">
                <Check className="w-3.5 h-3.5 text-green-600" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6 pt-2 space-y-3">
        {/* Cash on Hand */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
            <span className="text-sm text-gray-600">Cash on Hand</span>
          </div>
          {editing ? (
            <Input
              className="h-7 w-32 text-right text-sm font-semibold"
              value={draft.cashOnHand}
              onChange={e => setDraft(d => ({ ...d, cashOnHand: e.target.value }))}
              placeholder="0"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="text-base font-bold text-blue-600">{fmt(position.cashOnHand)}</span>
          )}
        </div>

        {/* Accounts Receivable */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <span className="text-sm text-gray-600">A/R — Outstanding</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            <span className="text-base font-bold text-green-600">{fmt(position.ar)}</span>
          </div>
        </div>

        {/* Accounts Payable */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            <span className="text-sm text-gray-600">A/P — Owed to Subs</span>
          </div>
          {editing ? (
            <Input
              className="h-7 w-32 text-right text-sm font-semibold"
              value={draft.ap}
              onChange={e => setDraft(d => ({ ...d, ap: e.target.value }))}
              placeholder="0"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              <span className="text-base font-bold text-red-500">{fmt(position.ap)}</span>
            </div>
          )}
        </div>

        {/* Divider + Net */}
        <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Net Position</span>
          <span className={`text-lg font-bold ${net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {net >= 0 ? '' : '−'}{fmt(Math.abs(net))}
          </span>
        </div>

        {position.source === 'manual' && (
          <p className="text-xs text-gray-400">Cash &amp; A/P entered manually · A/R pulled from invoices</p>
        )}
      </CardContent>
    </Card>
  );
}
