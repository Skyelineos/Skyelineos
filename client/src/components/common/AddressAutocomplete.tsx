// Address input that suggests previously-used addresses from the database as you
// type. Pulls distinct addresses from the `clients` and `projects` collections
// (single-tenant, so the full set is small) and caches them module-wide so the
// fetch happens once per session. Drop-in replacement for a plain address input.

import { useEffect, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Input } from '@/components/ui/input';
import { MapPin } from 'lucide-react';

// Module-level cache so every address field shares one load.
let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;

function pushAddr(set: Set<string>, ...parts: (string | undefined)[]) {
  const joined = parts.filter(p => p && String(p).trim()).map(p => String(p).trim()).join(', ');
  if (joined) set.add(joined);
}

async function loadKnownAddresses(): Promise<string[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const set = new Set<string>();
    try {
      const [clients, projects] = await Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'projects')),
      ]);
      clients.forEach(d => {
        const c = d.data() as any;
        pushAddr(set, c.jobAddress || c.address);
        pushAddr(set, c.jobAddress || c.address, c.city, c.state, c.zip);
      });
      projects.forEach(d => {
        const p = d.data() as any;
        pushAddr(set, p.address || p.jobAddress);
        pushAddr(set, p.address || p.jobAddress, p.city, p.state, p.zip);
      });
    } catch {
      /* best-effort — suggestions are a convenience, not required */
    }
    cache = Array.from(set).sort((a, b) => a.localeCompare(b));
    return cache;
  })();
  return inflight;
}

/** Clear the cache (e.g. after creating a new project) so fresh addresses appear. */
export function refreshAddressCache() { cache = null; inflight = null; }

interface Props {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
}

export function AddressAutocomplete({ value, onChange, id, placeholder, className }: Props) {
  const [all, setAll] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadKnownAddresses().then(list => { if (!cancelled) setAll(list); });
    return () => { cancelled = true; };
  }, []);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = value.trim().toLowerCase();
  const suggestions = q.length >= 2
    ? all.filter(a => a.toLowerCase().includes(q) && a.toLowerCase() !== q).slice(0, 8)
    : [];

  const pick = (s: string) => { onChange(s); setOpen(false); setHighlight(-1); };

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open || suggestions.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); pick(suggestions[highlight]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-auto">
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={e => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${
                i === highlight ? 'bg-[#C9A96E]/10 text-[#141414]' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
