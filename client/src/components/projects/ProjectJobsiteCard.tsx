// GC-side jobsite location widget for the project overview. Shows exactly where
// the build is on a map and gives a one-tap "Open Directions" that launches the
// device's default maps app (Apple Maps on iOS, Google Maps elsewhere).
//
// Defaults to read-only "view" mode. "Set / edit pin" flips it to edit mode so
// the GC can drop or drag the pin (and fill the address fields) — useful for
// legacy projects that were created with only a text address and no pin. Saves
// to projects/{id}.buildLocation via saveBuildLocation.

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Edit, Navigation } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { BuildLocation } from '@/components/common/BuildLocation';
import {
  type BuildLocation as BLType, locationFromProject, saveBuildLocation,
  logLocationEvent, hasPin, directionsUrl,
} from '@/lib/buildLocation';

export function ProjectJobsiteCard({ project, projectId }: { project: any; projectId: string }) {
  const { user } = useAuth();
  const [loc, setLoc] = useState<BLType>(() => locationFromProject(project));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Refresh from the project doc when it (re)loads, unless mid-edit.
  useEffect(() => {
    if (!editing) setLoc(locationFromProject(project));
  }, [project, editing]);

  const save = async () => {
    setSaving(true);
    try {
      const byUserId = user?.id?.toString();
      await saveBuildLocation(projectId, loc, byUserId);
      await logLocationEvent(projectId, {
        type: hasPin(loc) ? 'pin_moved' : 'address_edited',
        byUserId,
        byName: user?.name,
        details: 'Updated from project overview',
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setLoc(locationFromProject(project));
    setEditing(false);
  };

  return (
    <Card className="bg-gray-50">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[#C9A96E]" /> Jobsite Location
        </CardTitle>
        <div className="flex items-center gap-2">
          {!editing && hasPin(loc) && (
            <a href={directionsUrl(loc)} target="_blank" rel="noreferrer">
              <Button type="button" size="sm" className="gap-1.5" style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
                <Navigation className="w-4 h-4" /> Directions
              </Button>
            </a>
          )}
          {!editing && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
              <Edit className="w-3.5 h-3.5" /> {hasPin(loc) ? 'Edit pin' : 'Set pin'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Key forces a clean remount when toggling view↔edit so the map binds
            its click/drag handlers for the correct mode. */}
        <BuildLocation
          key={editing ? 'edit' : 'view'}
          mode={editing ? 'edit' : 'view'}
          value={loc}
          onChange={setLoc}
        />
        {editing && (
          <div className="flex gap-2 mt-3">
            <Button type="button" onClick={save} disabled={saving} style={{ backgroundColor: '#C9A96E', color: '#141414' }} className="font-semibold">
              {saving ? 'Saving…' : 'Save Location'}
            </Button>
            <Button type="button" variant="ghost" onClick={cancel} disabled={saving}>Cancel</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
