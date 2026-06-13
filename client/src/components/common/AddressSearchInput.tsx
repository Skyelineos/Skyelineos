// Address search field for the jobsite "Set pin" flow. As you type it shows
// suggestions from (a) the database of addresses Skyeline has already used and
// (b) live OpenStreetMap (Nominatim) geocoding — each carrying coordinates so
// picking one drops the map pin exactly. It also nudges the pin to the best
// match as you type, so the map tracks what you've entered so far.
//
// No API key. Nominatim is rate-limited (~1 req/sec) so live lookups are
// debounced; the DB suggestions are instant and work offline.
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2, Database } from 'lucide-react';
import { loadKnownAddresses } from './AddressAutocomplete';

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

// Full state-name → USPS abbreviation so geocoded results match how the rest
// of the app stores state (two-letter).
const US_STATE_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
  Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH',
  Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};
const stateAbbr = (s?: string) => (s ? US_STATE_ABBR[s] || s : undefined);

async function nominatimSearch(q: string, signal?: AbortSignal): Promise<GeoResult[]> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=us&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map((d: any) => {
      const a = d.address || {};
      const line1 = [a.house_number, a.road].filter(Boolean).join(' ');
      return {
        label: d.display_name as string,
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon),
        address: {
          line1: line1 || undefined,
          city: a.city || a.town || a.village || a.hamlet || a.suburb,
          state: stateAbbr(a.state),
          zip: a.postcode,
          county: a.county,
        },
      } as GeoResult;
    });
  } catch {
    return []; // live geocoding is a convenience; DB suggestions + manual drop still work
  }
}

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** A suggestion was explicitly chosen — commit full address + coordinates. */
  onSelect: (r: GeoResult) => void;
  /** The best match as the user types — move the pin/map without rewriting text. */
  onPreview?: (r: GeoResult) => void;
  id?: string;
  placeholder?: string;
  className?: string;
}

interface Row {
  key: string;
  label: string;
  source: 'db' | 'geo';
  geo?: GeoResult;
  dbText?: string;
}

export function AddressSearchInput({ value, onChange, onSelect, onPreview, id, placeholder, className }: Props) {
  const [known, setKnown] = useState<string[]>([]);
  const [geo, setGeo] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewedRef = useRef<string>('');

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

  // Debounced live geocoding once the query looks specific enough.
  useEffect(() => {
    if (q.length < 5) { setGeo([]); setLoading(false); return; }
    setLoading(true);
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const results = await nominatimSearch(q, ctrl.signal);
      setGeo(results);
      setLoading(false);
      // Nudge the pin to the top match (only once per distinct query, and only
      // when the text has a number so we don't jump on partial city names).
      if (results[0] && onPreview && /\d/.test(q) && previewedRef.current !== q) {
        previewedRef.current = q;
        onPreview(results[0]);
      }
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const dbMatches: Row[] = ql.length >= 2
    ? known
        .filter((a) => a.toLowerCase().includes(ql) && a.toLowerCase() !== ql)
        .slice(0, 4)
        .map((a) => ({ key: `db:${a}`, label: a, source: 'db', dbText: a }))
    : [];
  const geoRows: Row[] = geo.map((g, i) => ({ key: `geo:${i}:${g.label}`, label: g.label, source: 'geo', geo: g }));
  const rows: Row[] = [...dbMatches, ...geoRows];

  const choose = async (row: Row) => {
    setOpen(false);
    setHighlight(-1);
    if (row.source === 'geo' && row.geo) {
      onChange(row.geo.address?.line1 || row.label);
      onSelect(row.geo);
      return;
    }
    // DB string has no coordinates — geocode it, then commit.
    onChange(row.dbText || row.label);
    const hits = await nominatimSearch(row.dbText || row.label);
    if (hits[0]) onSelect(hits[0]);
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
              <span className="truncate">{row.label}</span>
              {row.source === 'db' && <span className="ml-auto text-[10px] uppercase text-gray-400">saved</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
