// Settings → Defaults. Designate which templates auto-seed into every NEW
// project (Gantt schedule, task list, estimate to clone) and whether to seed the
// client "selections needed" list. Unset = fall back to the built-in starters.

import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getProjectDefaults, saveProjectDefaults, type ProjectDefaults } from '@/lib/projectDefaults';
import { Layers, Star } from 'lucide-react';

interface Opt { id: string; name: string }

const STARTER = '__starter__';

export function ProjectDefaultsSettings() {
  const { toast } = useToast();
  const [estimates, setEstimates] = useState<Opt[]>([]);
  const [defaults, setDefaults] = useState<ProjectDefaults>({ seedSelections: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [ests, current] = await Promise.all([
          getDocs(query(collection(db, 'estimates'), orderBy('createdAt', 'desc'), limit(50))).catch(() => null),
          getProjectDefaults(),
        ]);
        if (ests) setEstimates(ests.docs.map(d => ({ id: d.id, name: (d.data() as any).title || (d.data() as any).projectName || 'Estimate' })));
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
        {/* Schedule + task defaults are now published from the Templates tab. */}
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-500">
          <span className="font-medium text-gray-700">Schedule (Gantt) &amp; task list defaults</span> are set in the
          <span className="font-medium text-gray-700"> Templates</span> tab — open a Schedule or Job template and click the
          <Star className="inline h-3 w-3 mx-0.5 fill-amber-500 stroke-amber-500" />“Set as default” star. New projects seed
          from whatever's marked default there (or the built-in starter if none is).
        </div>

        {/* Default estimate */}
        <div>
          <Label className="text-sm">Default estimate (cloned)</Label>
          <Select
            value={defaults.estimateTemplateId || STARTER}
            onValueChange={v => setDefaults(d => ({ ...d, estimateTemplateId: v === STARTER ? undefined : v }))}
          >
            <SelectTrigger className="bg-white mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={STARTER}>None (don’t seed an estimate)</SelectItem>
              {estimates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400 mt-1">Pick an existing estimate to clone into every new project.</p>
        </div>

        {/* Selections toggle */}
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
