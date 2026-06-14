// Lightweight job-site pin picker. A map you click (or drag the pin on) to set
// an exact lat/lng for a location — for use anywhere an address is entered
// (lead form, quick project create, etc.) without the heavier BuildLocation
// component's full address-field set.
//
// MapLibre + its CSS are loaded via dynamic import() inside the init effect so
// they code-split into a lazy chunk and never enter the app startup bundle. A
// top-level value import of maplibre-gl once hung the whole app on the loading
// screen (see CHECKPOINT.md) — do not reintroduce one.

import { useEffect, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import { Button } from '@/components/ui/button';
import { Navigation, Satellite, Map as MapIcon, Crosshair, X } from 'lucide-react';
import { placesAutocomplete, placeDetails, newSessionToken } from '@/lib/places';

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
  latitude?: number | null;
  longitude?: number | null;
  /** Address used by "Find address" geocoding + initial centering. */
  address?: string;
  onChange: (coords: { latitude: number | null; longitude: number | null }) => void;
  height?: number;
  className?: string;
}

/** Best-effort forward geocode via the Google Places proxy (key stays
 *  server-side). Returns [lng, lat]. Null if Places is off — manual drop still
 *  works. */
async function geocode(address: string): Promise<[number, number] | null> {
  const token = newSessionToken();
  const preds = await placesAutocomplete(address, token);
  if (!preds || !preds[0]) return null;
  const d = await placeDetails(preds[0].placeId, token);
  if (d && typeof d.lat === 'number' && typeof d.lng === 'number') return [d.lng, d.lat];
  return null;
}

export function MapPinPicker({ latitude, longitude, address, onChange, height = 240, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const maplibreRef = useRef<typeof maplibregl | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [satellite, setSatellite] = useState(true);
  const [locating, setLocating] = useState(false);

  const hasPin = typeof latitude === 'number' && typeof longitude === 'number';

  // Place or move the marker, creating it on first use.
  const placePin = (lng: number, lat: number) => {
    const maplib = maplibreRef.current;
    const map = mapRef.current;
    if (!maplib || !map) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      const marker = new maplib.Marker({ color: '#C9A96E', draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        onChangeRef.current({ latitude: p.lat, longitude: p.lng });
      });
      markerRef.current = marker;
    }
    onChangeRef.current({ latitude: lat, longitude: lng });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    let mapInstance: maplibregl.Map | null = null;

    (async () => {
      const { default: maplib } = await import('maplibre-gl');
      await import('maplibre-gl/dist/maplibre-gl.css');
      if (cancelled || !containerRef.current || mapRef.current) return;
      maplibreRef.current = maplib;

      const center: [number, number] = hasPin
        ? [longitude as number, latitude as number]
        : DEFAULT_CENTER;
      const map = new maplib.Map({
        container: containerRef.current,
        style: SATELLITE_STYLE,
        center,
        zoom: hasPin ? 17 : 11,
        attributionControl: { compact: true },
      });
      map.addControl(new maplib.NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;
      mapInstance = map;

      if (hasPin) {
        const marker = new maplib.Marker({ color: '#C9A96E', draggable: true })
          .setLngLat(center)
          .addTo(map);
        marker.on('dragend', () => {
          const p = marker.getLngLat();
          onChangeRef.current({ latitude: p.lat, longitude: p.lng });
        });
        markerRef.current = marker;
      }

      // Click anywhere to drop / move the pin.
      map.on('click', (e) => placePin(e.lngLat.lng, e.lngLat.lat));
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

  // Reflect external pin changes (e.g. value loaded async / cleared).
  useEffect(() => {
    if (!mapRef.current) return;
    if (hasPin) {
      if (markerRef.current) {
        markerRef.current.setLngLat([longitude as number, latitude as number]);
      } else if (maplibreRef.current) {
        placePin(longitude as number, latitude as number);
      }
      mapRef.current.setCenter([longitude as number, latitude as number]);
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);

  const findAddress = async () => {
    if (!address?.trim()) return;
    setLocating(true);
    const hit = await geocode(address.trim());
    setLocating(false);
    if (hit && mapRef.current) {
      mapRef.current.flyTo({ center: hit, zoom: 17 });
      placePin(hit[0], hit[1]);
    }
  };

  const clearPin = () => {
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
    onChangeRef.current({ latitude: null, longitude: null });
  };

  return (
    <div className={`space-y-2 ${className || ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {address?.trim() && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={findAddress} disabled={locating}>
            <Crosshair className="w-3.5 h-3.5" />
            {locating ? 'Locating…' : 'Find address on map'}
          </Button>
        )}
        {hasPin && (
          <>
            <a
              href={`https://www.google.com/maps/?q=${latitude},${longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button type="button" variant="outline" size="sm" className="gap-1.5">
                <Navigation className="w-3.5 h-3.5" /> Preview
              </Button>
            </a>
            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-red-600 hover:text-red-700" onClick={clearPin}>
              <X className="w-3.5 h-3.5" /> Clear pin
            </Button>
          </>
        )}
      </div>

      <div className="relative">
        <div ref={containerRef} style={{ height }} className="rounded-lg overflow-hidden border border-gray-200" />
        <button
          type="button"
          onClick={() => setSatellite(s => !s)}
          className="absolute top-2 left-2 z-10 bg-white/95 border border-gray-200 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm flex items-center gap-1.5 hover:bg-white"
        >
          {satellite ? <><MapIcon className="w-3.5 h-3.5" /> Street</> : <><Satellite className="w-3.5 h-3.5" /> Satellite</>}
        </button>
        <div className="absolute bottom-2 left-2 z-10 bg-white/95 border border-gray-200 rounded-md px-2.5 py-1 text-[11px] text-gray-600 shadow-sm">
          {hasPin ? 'Drag the pin or click to move it' : 'Click the map to drop the job-site pin'}
        </div>
      </div>
    </div>
  );
}
