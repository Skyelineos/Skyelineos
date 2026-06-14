// Address search for the jobsite "Set pin" flow. As you type it shows
// suggestions from two sources:
//   • Google Places (live, high-quality US address autocomplete) — proxied
//     through our Cloud Function so the Maps API key never reaches the browser.
//     Picking one drops the map pin on exact coordinates and fills the address
//     fields.
//   • Saved addresses (instant, offline) — addresses Skyeline has already used,
//     pulled from the clients/projects collections. Used as a fallback and a
//     fast path for repeat job sites.
//
// If Places isn't configured (or the user is offline) the field degrades
// gracefully to saved-address suggestions only.

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2, Database } from 'lucide-react';
import { loadKnownAddresses } from './AddressAutocomplete';
import {
  placesAutocomplete, placeDetails, newSessionToken,
  type PlacePrediction,
} from '@/lib/places';

export interface AddressParts {
  line1?: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
}
export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
  address?: AddressParts;
}

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** A suggestion was explicitly chosen — commit full address + coordinates. */
  onSelect: (r: GeoResult) => void;
  /** Reserved for future "nudge the pin as you type" behavior. Currently the
   *  pin is placed only on an explicit pick (precise, no jumping) so this is
   *  unused — kept for call-site compatibility. */
  onPreview?: (r: GeoResult) => void;
  id?: string;
  placeholder?: string;
  className?: string;
}

interface Row {
  key: string;
  primary: string;
  secondary?: string;
  source: 'db' | 'place';
  placeId?: string;
  dbText?: string;
}

export function AddressSearchInput({ value, onChange, onSelect, id, placeholder, className }: Props) {
  const [known, setKnown] = useState<string[]>([]);
  const [places, setPlaces] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // One Places billing session per "type → pick" sequence; rotated after a pick.
  const sessionRef = useRef<string>(newSessionToken());

  useEffect(() => {
    let cancelled = false;
    loadKnownAddresses().then((l) => !cancelled && setKnown(l));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = value.trim();
  const ql = q.toLowerCase();

  // Debounced live Places autocomplete once the query looks specific enough.
  useEffect(() => {
    if (q.length < 3) { setPlaces([]); setLoading(false); return; }
    setLoading(true);
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const results = await placesAutocomplete(q, sessionRef.current, ctrl.signal);
      if (ctrl.signal.aborted) return;
      // null = Places unavailable → leave the (empty) list; DB rows still show.
      setPlaces(results || []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const dbMatches: Row[] = ql.length >= 2
    ? known
        .filter((a) => a.toLowerCase().includes(ql) && a.toLowerCase() !== ql)
        .slice(0, 3)
        .map((a) => ({ key: `db:${a}`, primary: a, source: 'db', dbText: a }))
    : [];
  const placeRows: Row[] = places.map((p) => ({
    key: `place:${p.placeId}`,
    primary: p.primaryText || p.description,
    secondary: p.secondaryText,
    source: 'place',
    placeId: p.placeId,
  }));
  const rows: Row[] = [...placeRows, ...dbMatches];

  const commitDetails = async (placeId: string, fallbackLabel: string) => {
    const d = await placeDetails(placeId, sessionRef.current);
    sessionRef.current = newSessionToken(); // close the billing session
    if (d && typeof d.lat === 'number' && typeof d.lng === 'number') {
      onChange(d.address.line1 || d.formatted || fallbackLabel);
      onSelect({ label: d.formatted || fallbackLabel, lat: d.lat, lng: d.lng, address: d.address });
    } else {
      onChange(fallbackLabel);
    }
  };

  const choose = async (row: Row) => {
    setOpen(false);
    setHighlight(-1);
    if (row.source === 'place' && row.placeId) {
      await commitDetails(row.placeId, row.primary);
      return;
    }
    // Saved address: just text. Try to resolve it to coordinates via Places so a
    // repeat job site still drops a pin; if Places is off, the text stands alone.
    onChange(row.dbText || row.primary);
    const preds = await placesAutocomplete(row.dbText || row.primary, sessionRef.current);
    if (preds && preds[0]) await commitDetails(preds[0].placeId, row.dbText || row.primary);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          className={className}
          autoComplete="off"
          onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open || rows.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, rows.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); choose(rows[highlight]); }
            else if (e.key === 'Escape') setOpen(false);
          }}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        )}
      </div>
      {open && rows.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg max-h-72">
          {rows.map((row, i) => (
            <button
              key={row.key}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); choose(row); }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                i === highlight ? 'bg-[#C9A96E]/10 text-[#141414]' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {row.source === 'db' ? (
                <Database className="h-3.5 w-3.5 flex-shrink-0 text-[#C9A96E]" />
              ) : (
                <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block truncate">{row.primary}</span>
                {row.secondary && <span className="block truncate text-[11px] text-gray-400">{row.secondary}</span>}
              </span>
              {row.source === 'db' && <span className="ml-auto text-[10px] uppercase text-gray-400">saved</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
