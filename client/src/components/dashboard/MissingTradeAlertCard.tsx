import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MultiTradeSelector } from '@/components/contacts/MultiTradeSelector';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

interface MissingTradeContact {
  id: string;
  name: string;
  company?: string;
  role: string;
}

// Banner that surfaces subs / vendors who are missing a trade. Trades are
// required so the bid-package flow can target subs by specialty — this card
// nudges the user to backfill any historical contacts in one click each.
export function MissingTradeAlertCard() {
  const [missing, setMissing] = useState<MissingTradeContact[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    // No compound index needed — we run two listeners and merge.
    const roles = ['subcontractor', 'vendor'];
    const unsubs = roles.map(role => {
      const q = query(collection(db, 'contacts'), where('role', '==', role));
      return onSnapshot(q, snap => {
        setMissing(prev => {
          const fromOtherRole = prev.filter(c => c.role !== role);
          const fromThisRole = snap.docs
            .map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter(c => {
              const arr: string[] = Array.isArray(c.trades) ? c.trades : [];
              const legacy = String(c.trade || '').trim();
              return arr.length === 0 && !legacy;
            })
            .map(c => ({ id: c.id, name: c.name || '(unnamed)', company: c.company, role }));
          return [...fromOtherRole, ...fromThisRole];
        });
      });
    });
    return () => unsubs.forEach(u => u());
  }, []);

  const setTrades = async (id: string, trades: string[]) => {
    if (trades.length === 0) return;
    setSavingId(id);
    try {
      await updateDoc(doc(db, 'contacts', id), {
        trades,
        // Mirror first into legacy field for older readers.
        trade: trades[0],
        updatedAt: serverTimestamp(),
      });
    } finally {
      setSavingId(null);
    }
  };

  if (missing.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 mb-4">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 text-left"
      >
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">
            {missing.length} {missing.length === 1 ? 'sub/vendor is' : 'subs/vendors are'} missing a trade
          </p>
          <p className="text-xs text-amber-700/80">
            Trades are required so they can be matched to bid packages. Categorize now.
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-amber-700" />
        ) : (
          <ChevronDown className="w-4 h-4 text-amber-700" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
          {missing.map(c => (
            <div
              key={c.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white border border-amber-200 rounded p-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {c.company ? `${c.company} · ` : ''}
                  {c.role === 'vendor' ? 'Vendor' : 'Subcontractor'}
                </p>
              </div>
              <div className="sm:w-72">
                <MultiTradeSelector
                  value={[]}
                  onValueChange={trades => setTrades(c.id, trades)}
                />
              </div>
              {savingId === c.id && (
                <span className="text-xs text-gray-500">Saving…</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
