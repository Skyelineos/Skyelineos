// Read-only jobsite location for anyone assigned to a project — subs, designers,
// PMs, the client. Shows the address, a one-tap "Open Directions" that launches
// the device's maps app (Apple Maps on iOS, Google Maps elsewhere) straight to
// turn-by-turn, and an on-demand map preview.
//
// The map (MapLibre) is lazy: it only mounts when the user taps "Show map", so a
// list of many assigned projects doesn't spin up a map per row. Data access is
// already granted by firestore.rules to assigned users; this is purely the UI.

import { useState } from 'react';
import { MapPin, Navigation, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BuildLocation } from '@/components/common/BuildLocation';
import {
  locationFromProject, formatAddress, directionsUrl, hasPin,
} from '@/lib/buildLocation';

interface Props {
  /** Raw project doc (uses buildLocation, falling back to legacy address). */
  project: any;
  /** Optional override title (defaults to the project name). */
  title?: string;
  /** Optional status/phase chip(s) shown under the address. */
  badge?: React.ReactNode;
  className?: string;
  /** When true, the map is rendered as soon as the card mounts instead of
   *  waiting for a "Show map" tap. Use on the Project Overview where the
   *  pin should be visible at a glance. */
  defaultMapOpen?: boolean;
}

export function JobsiteLocationCard({ project, title, badge, className, defaultMapOpen = false }: Props) {
  const loc = locationFromProject(project);
  const [showMap, setShowMap] = useState(defaultMapOpen);

  const address = formatAddress(loc);
  const pinned = hasPin(loc);
  const hasAnything = !!address || pinned;

  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 ${className || ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-gray-900">
            <MapPin className="w-4 h-4 text-[#C9A96E] shrink-0" />
            <span className="truncate">{title || project?.name || 'Jobsite'}</span>
          </p>
          <p className="mt-0.5 text-sm text-gray-500 break-words">
            {address || (pinned ? 'Pinned location' : 'No location set yet')}
          </p>
          {badge && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{badge}</div>}
        </div>
        {hasAnything && (
          <a href={directionsUrl(loc)} target="_blank" rel="noreferrer" className="shrink-0">
            <Button type="button" size="sm" className="gap-1.5" style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
              <Navigation className="w-4 h-4" /> Directions
            </Button>
          </a>
        )}
      </div>

      {hasAnything && (
        <>
          <button
            type="button"
            onClick={() => setShowMap(s => !s)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#8a6a3a] hover:underline"
          >
            {showMap ? <><ChevronUp className="w-3.5 h-3.5" /> Hide map</> : <><ChevronDown className="w-3.5 h-3.5" /> Show map</>}
          </button>
          {showMap && (
            <div className="mt-3">
              <BuildLocation mode="view" value={loc} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
