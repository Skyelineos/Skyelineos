// Reusable build/jobsite location workflow. One component, three modes:
//   - edit:    admin/PM enters the address + drops/drags the pin
//   - confirm: homeowner reviews and Confirms or Requests a Correction
//   - view:    subs/staff see the confirmed location + get directions
//
// Map: MapLibre GL JS with free OpenFreeMap street tiles + an Esri satellite
// toggle (great for bare lots). No API key.

import { useEffect, useRef, useState } from 'react';
// MapLibre is imported for TYPES ONLY here (fully elided at build time). The
// actual library + its CSS are loaded via dynamic import() inside the init
// effect below, so they code-split into their own lazy chunk and NEVER enter
// the app's startup bundle. A top-level value import of maplibre-gl once hung
// the entire app on the loading screen — do not reintroduce one.
import type maplibregl from 'maplibre-gl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Navigation, Satellite, Map as MapIcon } from 'lucide-react';
import { AddressSearchInput, type GeoResult } from '@/components/common/AddressSearchInput';
import {
  type BuildLocation as BL, STATUS_META, locationStatus, formatAddress,
  directionsUrl, hasPin,
} from '@/lib/buildLocation';

const STREET_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const SATELLITE_STYLE: any = {
  version: 8,
  sources: {
    sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Imagery © Esri',
    },
  },
  layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
};
// Mapleton, UT — Skyeline's home base — default center until a pin is set.
const DEFAULT_CENTER: [number, number] = [-111.5705, 40.1299];

interface Props {
  value: BL;
  mode: 'edit' | 'confirm' | 'view';
  onChange?: (loc: BL) => void;
  onConfirm?: () => void;
  onRequestCorrection?: (notes: string) => void;
  className?: string;
}

export function BuildLocationStatusBadge({ status }: { status: BL['status'] }) {
  const meta = STATUS_META[status || 'unconfirmed'];
  return <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${meta.className}`}>{meta.label}</span>;
}

export function BuildLocation({ value, mode, onChange, onConfirm, onRequestCorrection, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const maplibreRef = useRef<typeof maplibregl | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Latest value, so map click/drag handlers (bound once at mount) merge onto
  // the CURRENT form state instead of a stale snapshot from mount time.
  const valueRef = useRef(value);
  valueRef.current = value;

  const [satellite, setSatellite] = useState(true);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionNotes, setCorrectionNotes] = useState('');

  const editable = mode === 'edit';
  const status = locationStatus(value);
  const patch = (p: Partial<BL>) => onChangeRef.current?.({ ...valueRef.current, ...p });

  // Create the marker on first use, or move it if it already exists. We never
  // show a marker until there's a real pin (or the user clicks) — otherwise an
  // empty location would render a stray pin on the default center, which looks
  // like data the user never entered.
  const placePin = (lng: number, lat: number, fromUser: boolean) => {
    const maplib = maplibreRef.current;
    const map = mapRef.current;
    if (!maplib || !map) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      const marker = new maplib.Marker({ color: '#C9A96E', draggable: editable })
        .setLngLat([lng, lat])
        .addTo(map);
      if (editable) {
        marker.on('dragend', () => {
          const p = marker.getLngLat();
          patch({ latitude: p.lat, longitude: p.lng });
        });
      }
      markerRef.current = marker;
    }
    if (fromUser) patch({ latitude: lat, longitude: lng });
  };

  // Move the map + pin to a geocoded spot. `commit` fills the address fields
  // too (explicit pick); a preview just repositions the pin as the user types.
  const goToGeo = (r: GeoResult, commit: boolean) => {
    const next: Partial<BL> = { latitude: r.lat, longitude: r.lng };
    if (commit && r.address) {
      if (r.address.line1) next.addressLine1 = r.address.line1;
      if (r.address.city) next.city = r.address.city;
      if (r.address.state) next.state = r.address.state;
      if (r.address.zip) next.zipCode = r.address.zip;
      if (r.address.county) next.county = r.address.county;
    } else {
      // Preview: fill blank sub-fields so the form stays in sync, but never
      // overwrite what the GC has already typed.
      if (r.address?.city && !value.city) next.city = r.address.city;
      if (r.address?.state && !value.state) next.state = r.address.state;
      if (r.address?.zip && !value.zipCode) next.zipCode = r.address.zip;
      if (r.address?.county && !value.county) next.county = r.address.county;
    }
    patch(next);
    mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 17, duration: 800 });
  };

  // Init map once. MapLibre + its CSS are loaded via dynamic import() so they
  // are code-split into a lazy chunk that only downloads when this component
  // actually mounts — never part of the app's startup bundle.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    let mapInstance: maplibregl.Map | null = null;

    (async () => {
      const { default: maplibregl } = await import('maplibre-gl');
      await import('maplibre-gl/dist/maplibre-gl.css');
      // Bail if the component unmounted (or another effect already built a map)
      // while the chunk was downloading.
      if (cancelled || !containerRef.current || mapRef.current) return;
      maplibreRef.current = maplibregl;

      const v = valueRef.current;
      const center: [number, number] = hasPin(v)
        ? [v.longitude as number, v.latitude as number]
        : DEFAULT_CENTER;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: SATELLITE_STYLE,
        center,
        zoom: hasPin(v) ? 17 : 12,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;
      mapInstance = map;

      // Only show a marker when there's an actual pin — no stray default pin.
      if (hasPin(v)) placePin(v.longitude as number, v.latitude as number, false);

      if (editable) {
        map.on('click', (e) => placePin(e.lngLat.lng, e.lngLat.lat, true));
      }
      setTimeout(() => map.resize(), 150);
    })();

    return () => {
      cancelled = true;
      mapInstance?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Satellite/street toggle.
  useEffect(() => {
    mapRef.current?.setStyle(satellite ? SATELLITE_STYLE : (STREET_STYLE as any));
  }, [satellite]);

  // Reflect external pin changes — value loaded async, or a Places result
  // picked (which sets coords without touching the map directly).
  useEffect(() => {
    if (!mapRef.current) return;
    if (hasPin(value)) {
      placePin(value.longitude as number, value.latitude as number, false);
      mapRef.current.setCenter([value.longitude as number, value.latitude as number]);
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.latitude, value.longitude]);

  return (
    <div className={`space-y-3 ${className || ''}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <BuildLocationStatusBadge status={status} />
        {mode !== 'edit' && hasPin(value) && (
          <a href={directionsUrl(value)} target="_blank" rel="noreferrer">
            <Button type="button" variant="outline" size="sm" className="gap-1.5">
              <Navigation className="w-4 h-4" /> Open Directions
            </Button>
          </a>
        )}
      </div>

      {/* Address */}
      {editable ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Address line 1</Label>
            <AddressSearchInput
              value={value.addressLine1 || ''}
              onChange={(t) => patch({ addressLine1: t })}
              onSelect={(r) => goToGeo(r, true)}
              onPreview={(r) => goToGeo(r, false)}
              placeholder="Start typing an address — the pin follows"
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Suggestions come from your saved addresses and live map search; pick one to drop the pin.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label>Address line 2</Label>
            <Input value={value.addressLine2 || ''} onChange={e => patch({ addressLine2: e.target.value })} placeholder="Unit / lot detail (optional)" className="mt-1" />
          </div>
          <div><Label>City</Label><Input value={value.city || ''} onChange={e => patch({ city: e.target.value })} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>State</Label><Input value={value.state || ''} onChange={e => patch({ state: e.target.value })} className="mt-1" /></div>
            <div><Label>Zip</Label><Input value={value.zipCode || ''} onChange={e => patch({ zipCode: e.target.value })} className="mt-1" /></div>
          </div>
          <div><Label>County</Label><Input value={value.county || ''} onChange={e => patch({ county: e.target.value })} className="mt-1" /></div>
          <div><Label>Subdivision</Label><Input value={value.subdivision || ''} onChange={e => patch({ subdivision: e.target.value })} className="mt-1" /></div>
          <div><Label>Lot #</Label><Input value={value.lotNumber || ''} onChange={e => patch({ lotNumber: e.target.value })} className="mt-1" /></div>
          <div><Label>Parcel #</Label><Input value={value.parcelNumber || ''} onChange={e => patch({ parcelNumber: e.target.value })} className="mt-1" /></div>
        </div>
      ) : (
        <div className="text-sm text-gray-700">
          <p className="font-medium">{formatAddress(value) || 'No address yet — see the pin below.'}</p>
          {(value.lotNumber || value.subdivision) && (
            <p className="text-xs text-gray-500 mt-0.5">
              {[value.subdivision && `${value.subdivision}`, value.lotNumber && `Lot ${value.lotNumber}`].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Map */}
      <div className="relative">
        <div ref={containerRef} style={{ height: 300 }} className="rounded-lg overflow-hidden border border-gray-200" />
        <button
          type="button"
          onClick={() => setSatellite(s => !s)}
          className="absolute top-2 left-2 z-10 bg-white/95 border border-gray-200 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm flex items-center gap-1.5 hover:bg-white"
        >
          {satellite ? <><MapIcon className="w-3.5 h-3.5" /> Street</> : <><Satellite className="w-3.5 h-3.5" /> Satellite</>}
        </button>
        {editable && (
          <div className="absolute bottom-2 left-2 z-10 bg-white/95 border border-gray-200 rounded-md px-2.5 py-1 text-[11px] text-gray-600 shadow-sm">
            Click the map or drag the pin to set the lot
          </div>
        )}
      </div>

      {/* Confirm-mode actions */}
      {mode === 'confirm' && status !== 'confirmed' && (
        <div className="space-y-2">
          {!showCorrection ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={onConfirm}
                style={{ backgroundColor: '#C9A96E' }}
                className="text-[#141414] font-semibold hover:opacity-90"
              >
                Confirm Location
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCorrection(true)}>
                Request Correction
              </Button>
            </div>
          ) : (
            <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
              <Label>What's wrong with this location?</Label>
              <textarea
                value={correctionNotes}
                onChange={e => setCorrectionNotes(e.target.value)}
                rows={3}
                placeholder="e.g. The pin is on the neighboring lot — ours is one parcel north."
                className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E]"
              />
              <div className="flex gap-2">
                <Button type="button" onClick={() => { onRequestCorrection?.(correctionNotes); setShowCorrection(false); setCorrectionNotes(''); }}>
                  Send Correction
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCorrection(false)}>Cancel</Button>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-500">Please confirm so the team builds in exactly the right place.</p>
        </div>
      )}

      {mode === 'confirm' && status === 'confirmed' && (
        <p className="text-sm text-green-700 font-medium">✓ You confirmed this build location. Thank you!</p>
      )}

      {value.correctionNotes && status === 'correction_requested' && (
        <p className="text-xs text-red-700 bg-red-50 rounded-md px-3 py-2">
          Correction requested: {value.correctionNotes}
        </p>
      )}
    </div>
  );
}
