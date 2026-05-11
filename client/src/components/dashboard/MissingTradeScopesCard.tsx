import { useEffect, useState } from 'react';
import {
  collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TradeRow {
  id: string;
  name: string;
  defaultScope: string;
}

// Low-priority nudge: surfaces trades that DO have subs assigned but DON'T yet
// have a default scope template. Tyler asked us to build out templates over
// time without forcing it; this card lets him knock them out one at a time.
export function MissingTradeScopesCard() {
  const { toast } = useToast();
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [tradeNamesWithSubs, setTradeNamesWithSubs] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Trades from Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'trades'), snap => {
      setTrades(snap.docs.map(d => {
        const data = d.data() as any;
        return { id: d.id, name: String(data.name || ''), defaultScope: String(data.defaultScope || '') };
      }));
    }, () => {});
    return () => unsub();
  }, []);

  // Subs/vendors so we know which trades are actually in use.
  useEffect(() => {
    const roles = ['subcontractor', 'vendor'];
    const unsubs = roles.map(role => {
      const q = query(collection(db, 'contacts'), where('role', '==', role));
      return onSnapshot(q, snap => {
        const names = new Set<string>();
        snap.forEach(d => {
          const data = d.data() as any;
          const arr: string[] = Array.isArray(data.trades) ? data.trades : [];
          const legacy = String(data.trade || '').trim();
          [...arr, ...(legacy ? [legacy] : [])].forEach(t => {
            const trimmed = String(t).trim();
            if (trimmed) names.add(trimmed);
          });
        });
        setTradeNamesWithSubs(prev => {
          // Merge in this role's contributions while keeping the others.
          const next = new Set(prev);
          // Drop names that no longer appear from THIS role's contacts isn't
          // possible without remembering per-role sources, so just union for
          // simplicity. Stale rows don't hurt — the trade row needs subs from
          // *any* role to be relevant anyway.
          names.forEach(n => next.add(n));
          return next;
        });
      });
    });
    return () => unsubs.forEach(u => u());
  }, []);

  const missing = trades.filter(t => t.name && !t.defaultScope && tradeNamesWithSubs.has(t.name));

  const save = async (t: TradeRow) => {
    const text = (editing[t.id] || '').trim();
    if (!text) return;
    setSavingId(t.id);
    try {
      await updateDoc(doc(db, 'trades', t.id), {
        defaultScope: text,
        updatedAt: serverTimestamp(),
      });
      setEditing(e => {
        const next = { ...e };
        delete next[t.id];
        return next;
      });
      toast({ title: `Saved default scope for ${t.name}` });
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message || '', variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  if (missing.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 mb-4">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 text-left"
      >
        <Sparkles className="w-4 h-4 text-[#C9A96E] flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800">
            Build out scope templates ({missing.length} trade{missing.length === 1 ? '' : 's'} missing)
          </p>
          <p className="text-xs text-gray-500">
            Low-priority — write a default scope for each trade so future bid packages auto-fill.
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 max-h-96 overflow-y-auto">
          {missing.map(t => (
            <div key={t.id} className="border rounded p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium">{t.name}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  disabled={!editing[t.id]?.trim() || savingId === t.id}
                  onClick={() => save(t)}
                >
                  <Save className="w-3 h-3" />
                  {savingId === t.id ? 'Saving…' : 'Save'}
                </Button>
              </div>
              <Textarea
                rows={2}
                value={editing[t.id] || ''}
                onChange={e => setEditing(prev => ({ ...prev, [t.id]: e.target.value }))}
                placeholder={`Default scope for ${t.name} — quantities, materials, timeline expectations.`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
