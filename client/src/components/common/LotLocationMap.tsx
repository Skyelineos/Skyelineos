// Lot location picker/viewer built on plain Leaflet (no API key) with free Esri
// satellite imagery — ideal for empty lots that don't have a street address yet.
// Editable when `onChange` is passed (drag the pin or click the map); read-only
// otherwise.

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LatLng { lat: number; lng: number }

interface Props {
  value?: LatLng | null;
  onChange?: (v: LatLng) => void;
  height?: number;
  className?: string;
}

// Mapleton, UT — Skyeline's home base — used as the default center until a pin is set.
const DEFAULT_CENTER: LatLng = { lat: 40.1299, lng: -111.5705 };

const PIN_HTML = `
<svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,.4));">
  <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z" fill="#C9A96E" stroke="#141414" stroke-width="1.2"/>
  <circle cx="12" cy="9" r="2.5" fill="#141414"/>
</svg>`;

export function LotLocationMap({ value, onChange, height = 320, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center = value || DEFAULT_CENTER;
    const map = L.map(containerRef.current, { center: [center.lat, center.lng], zoom: value ? 18 : 13 });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Imagery © Esri', maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;

    const editable = !!onChangeRef.current;
    const icon = L.divIcon({ className: '', html: PIN_HTML, iconSize: [30, 30], iconAnchor: [15, 30] });
    const marker = L.marker([center.lat, center.lng], { draggable: editable, icon, opacity: value ? 1 : 0.6 }).addTo(map);
    markerRef.current = marker;

    if (editable) {
      const emit = (lat: number, lng: number) => { marker.setOpacity(1); onChangeRef.current?.({ lat, lng }); };
      marker.on('dragend', () => { const p = marker.getLatLng(); emit(p.lat, p.lng); });
      map.on('click', (e: L.LeafletMouseEvent) => { marker.setLatLng(e.latlng); emit(e.latlng.lat, e.latlng.lng); });
    }
    // Leaflet needs a size recalculation when it mounts inside a flex/hidden parent.
    setTimeout(() => map.invalidateSize(), 120);

    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external value changes onto the marker/view.
  useEffect(() => {
    if (value && markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([value.lat, value.lng]).setOpacity(1);
      mapRef.current.setView([value.lat, value.lng], Math.max(mapRef.current.getZoom(), 16));
    }
  }, [value?.lat, value?.lng]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className={`rounded-lg overflow-hidden border border-gray-200 ${className || ''}`}
    />
  );
}
