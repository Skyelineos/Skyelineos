// Settings → Defaults. Designate which templates auto-seed into every NEW
// project (Gantt schedule, task list, estimate to clone) and whether to seed the
// client "selections needed" list. Unset = fall back to the built-in starters.

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { getProjectDefaults, saveProjectDefaults, type ProjectDefaults } from '@/lib/projectDefaults';
import { Layers, Star } from 'lucide-react';

export function ProjectDefaultsSettings() {
  const { toast } = useToast();
  const [defaults, setDefaults] = useState<ProjectDefaults>({ seedSelections: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const current = await getProjectDefaults();
        setDefaults({ seedSelections: true, ...current });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveProjectDefaults(defaults);
      toast({ title: 'Project defaults saved', description: 'New projects will seed from these.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || '', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-400 p-4">Loading…</div>;

  return (
    <Card className="bg-gray-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" style={{ color: '#C9A96E' }} />
          Project Defaults
        </CardTitle>
        <CardDescription>
          Every new project starts seeded with these — unless you build/publish its own.
          Leave a picker on “Built-in starter” to use the bundled template.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* All four template defaults are now published from the Templates tab. */}
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-500">
          <span className="font-medium text-gray-700">Schedule, Task list, Estimate &amp; Selections defaults</span> are set in the
          <span className="font-medium text-gray-700"> Templates</span> tab — open a template and click the
          <Star className="inline h-3 w-3 mx-0.5 fill-amber-500 stroke-amber-500" />“Set as default” star. New projects seed
          from whatever's marked default there (or the built-in starter if none is). Use the “Add Standard …” buttons there
          to upload Skyeline's standard templates.
        </div>

        {/* Selections toggle — the one global on/off that isn't a template choice */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Seed “selections needed” list</Label>
            <p className="text-xs text-gray-400 mt-0.5">Pre-load the client decision list from the standard template.</p>
          </div>
          <Switch
            checked={defaults.seedSelections !== false}
            onCheckedChange={v => setDefaults(d => ({ ...d, seedSelections: v }))}
          />
        </div>

        <div className="pt-2">
          <Button onClick={save} disabled={saving} style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
            {saving ? 'Saving…' : 'Save defaults'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
