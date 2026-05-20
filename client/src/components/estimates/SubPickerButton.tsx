import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Check, Search, HardHat, X } from 'lucide-react';

interface SubContact {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  trades?: string[];
  type?: string;
  role?: string;
}

interface Props {
  assignedSubIds?: string[];
  trade?: string;
  onChange: (next: string[]) => void;
}

/**
 * Cell-sized button that opens a popover for assigning subcontractors to an
 * estimate line. Subs are pulled from the `contacts` collection where
 * type='sub' OR role='sub'. Subs tagged with a matching trade float to the
 * top of the list. Persists the picked IDs via assignedSubIds on the line.
 */
export function SubPickerButton({ assignedSubIds, trade, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [subs, setSubs] = useState<SubContact[]>([]);
  const assigned = useMemo(() => new Set(assignedSubIds || []), [assignedSubIds]);

  useEffect(() => {
    // Pull every sub-type contact. Two parallel listeners (one on type='sub',
    // one on role='sub') so legacy data keyed either way still appears.
    const a = query(collection(db, 'contacts'), where('type', '==', 'sub'));
    const b = query(collection(db, 'contacts'), where('role', '==', 'sub'));
    const cache = new Map<string, SubContact>();
    const apply = () => setSubs(Array.from(cache.values()));
    const unsubA = onSnapshot(a, snap => {
      snap.docs.forEach(d => cache.set(d.id, { id: d.id, ...(d.data() as any) }));
      apply();
    });
    const unsubB = onSnapshot(b, snap => {
      snap.docs.forEach(d => cache.set(d.id, { id: d.id, ...(d.data() as any) }));
      apply();
    });
    return () => { unsubA(); unsubB(); };
  }, []);

  const tradeKey = (trade || '').trim().toLowerCase();
  const filtered = subs
    .filter(s => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (s.name || '').toLowerCase().includes(q)
        || (s.company || '').toLowerCase().includes(q)
        || (s.email || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      // Trade-matching first, then assigned, then alphabetical
      const aMatch = tradeKey && (a.trades || []).some(t => t.toLowerCase() === tradeKey) ? 0 : 1;
      const bMatch = tradeKey && (b.trades || []).some(t => t.toLowerCase() === tradeKey) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      const aSel = assigned.has(a.id) ? 0 : 1;
      const bSel = assigned.has(b.id) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return (a.name || '').localeCompare(b.name || '');
    });

  const toggle = (id: string) => {
    const next = new Set(assigned);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next));
  };

  const clearAll = () => onChange([]);

  const count = assigned.size;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`h-8 w-8 flex items-center justify-center rounded border transition-colors relative ${
            count > 0
              ? 'border-[#C9A96E] bg-amber-50 text-amber-700'
              : 'border-gray-200 text-gray-400 hover:border-[#C9A96E] hover:text-amber-700 hover:bg-amber-50'
          }`}
          title={count > 0 ? `${count} sub${count === 1 ? '' : 's'} assigned` : 'Assign subcontractor(s)'}
        >
          <HardHat className="w-4 h-4" />
          {count > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
            >
              {count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-2 border-b" style={{ borderColor: '#E5E7EB' }}>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search subs${trade ? ` for ${trade}` : ''}…`}
              className="pl-8 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {subs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6 px-3">
              No subcontractors yet. Add some in <strong>Contacts</strong> and tag them with <code className="text-xs px-1 bg-gray-100 rounded">type=sub</code>.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6 px-3">No subs match "{search}".</p>
          ) : (
            <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
              {filtered.map(s => {
                const checked = assigned.has(s.id);
                const matchesTrade = tradeKey && (s.trades || []).some(t => t.toLowerCase() === tradeKey);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={`w-full text-left flex items-start gap-2 px-3 py-2 hover:bg-amber-50/50 ${checked ? 'bg-amber-50/40' : ''}`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-[#C9A96E] border-[#C9A96E]' : 'border-gray-300'}`}>
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-gray-900">
                        {s.name || '(no name)'}
                        {matchesTrade && (
                          <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(201,169,110,0.15)', color: '#8B6F3F' }}>
                            {trade}
                          </span>
                        )}
                      </p>
                      {s.company && <p className="text-xs text-gray-500 truncate">{s.company}</p>}
                      {(s.email || s.phone) && (
                        <p className="text-[11px] text-gray-400 truncate">
                          {[s.email, s.phone].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {count > 0 && (
          <div className="p-2 border-t flex items-center justify-between text-xs" style={{ borderColor: '#E5E7EB' }}>
            <span className="text-gray-600">{count} assigned</span>
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-gray-500 hover:text-red-600"
              type="button"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
