import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { listTemplates } from '@/modules/gantt/useSchedulePersistence';
import { applyTemplateToProject } from '@/modules/gantt/applyTemplateToProject';
import type { ProjectSetupDraft, ProjectMilestone } from '@/types/projectSetup';

/**
 * Step 6 — Timeline.
 *
 * Captures:
 *   - Projected start date — drives sub bid sequencing + client move-in math
 *   - Key milestones — drives client schedule view, sub bid timing, GC
 *     Gantt seeding
 *
 * Default milestones reflect a standard custom-home build sequence
 * (foundation → framing → rough-in → drywall → finish → walkthrough).
 * The user can rename, reorder, drop, or add their own. Target date
 * on each milestone is optional but useful for the GC's seed Gantt.
 */

const DEFAULT_MILESTONES: { name: string; offsetDays: number }[] = [
  { name: 'Foundation', offsetDays: 14 },
  { name: 'Framing', offsetDays: 45 },
  { name: 'Rough-in (MEP)', offsetDays: 90 },
  { name: 'Drywall', offsetDays: 140 },
  { name: 'Finish', offsetDays: 200 },
  { name: 'Final walkthrough', offsetDays: 260 },
];

interface Props {
  draft: ProjectSetupDraft;
  onChange: (next: ProjectSetupDraft) => void;
}

export function Step6Timeline({ draft, onChange }: Props) {
  const milestones = draft.milestones || [];
  const patch = (p: Partial<ProjectSetupDraft>) => onChange({ ...draft, ...p });

  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    listTemplates().then(ts => setTemplates(ts.map(t => ({ id: t.id, name: t.name })))).catch(() => {});
  }, []);

  // Pick a standard schedule template → seed the project's Gantt (re-anchored to
  // the start date). If it's not quite right, the GC edits it in the Gantt.
  const pickTemplate = async (id: string) => {
    patch({ scheduleTemplateId: id });
    if (id && draft.id) {
      const ok = await applyTemplateToProject(draft.id, id, draft.startDate, { onlyIfEmpty: false });
      if (ok) toast({ title: 'Schedule seeded from template', description: 'Open "Edit in Gantt" to fine-tune it for this job.' });
    }
  };

  const setStartDate = (date: string) => {
    patch({ startDate: date });
  };

  const seedDefaultMilestones = () => {
    const base = draft.startDate ? new Date(draft.startDate) : new Date();
    const seeded: ProjectMilestone[] = DEFAULT_MILESTONES.map((m, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + m.offsetDays);
      return {
        id: `m-${Date.now()}-${i}`,
        name: m.name,
        targetDate: d.toISOString().slice(0, 10),
        status: 'planned',
      };
    });
    patch({ milestones: seeded });
  };

  const addBlankMilestone = () => {
    patch({
      milestones: [
        ...milestones,
        {
          id: `m-${Date.now()}-${milestones.length}`,
          name: '',
          targetDate: '',
          status: 'planned',
        },
      ],
    });
  };

  const updateMilestone = (id: string, p: Partial<ProjectMilestone>) => {
    patch({
      milestones: milestones.map(m => m.id === id ? { ...m, ...p } : m),
    });
  };

  const removeMilestone = (id: string) => {
    patch({ milestones: milestones.filter(m => m.id !== id) });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-semibold text-[#141414]">Timeline</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          When the build starts and the big checkpoints along the way. Drives the client's schedule view and seeds the GC Gantt.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="proj-start">Projected start date</Label>
          <Input
            id="proj-start"
            type="date"
            value={draft.startDate || ''}
            onChange={e => setStartDate(e.target.value)}
            className="mt-1.5"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Subs anchor their bid timeline to this. Easy to adjust later.
          </p>
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            size="sm"
            onClick={seedDefaultMilestones}
            disabled={milestones.length > 0}
            className="gap-1.5"
          >
            <Calendar className="w-4 h-4" />
            Seed default milestones
          </Button>
        </div>
      </div>

      {/* Start from a standard schedule template */}
      <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
        <Label>Start from a schedule template</Label>
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          <select
            value={draft.scheduleTemplateId || ''}
            onChange={e => pickTemplate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white min-w-[220px]"
          >
            <option value="">None — build manually</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {draft.id && draft.scheduleTemplateId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate(`/projects/${draft.id}/schedule`)}
              className="gap-1.5"
            >
              <Calendar className="w-4 h-4" /> Edit in Gantt
            </Button>
          )}
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          Seeds this project's Gantt from a standard template (House Build, Remodel…), anchored to the start date.
          Not quite right for this job? Click <strong>Edit in Gantt</strong> to adjust it.
        </p>
      </div>

      {/* Milestone list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm font-semibold">Key milestones</Label>
          {milestones.length > 0 && (
            <Button variant="outline" size="sm" onClick={addBlankMilestone} className="gap-1">
              <Plus className="w-3.5 h-3.5" /> Add milestone
            </Button>
          )}
        </div>

        {milestones.length === 0 ? (
          <Card className="p-6 text-center bg-gray-50/50 border-dashed">
            <p className="text-sm text-gray-600">
              No milestones yet. Seed the defaults above (you can rename / adjust each), or add custom ones one at a time.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={addBlankMilestone}
              className="mt-3 gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add a milestone
            </Button>
          </Card>
        ) : (
          <div className="border rounded-lg divide-y">
            {milestones.map((m, idx) => (
              <div key={m.id} className="flex items-center gap-2 px-3 py-2">
                <span className="text-xs text-gray-400 font-mono w-6">{idx + 1}.</span>
                <Input
                  value={m.name}
                  onChange={e => updateMilestone(m.id, { name: e.target.value })}
                  placeholder="Milestone name"
                  className="flex-1 h-8 text-sm"
                />
                <Input
                  type="date"
                  value={m.targetDate}
                  onChange={e => updateMilestone(m.id, { targetDate: e.target.value })}
                  className="w-40 h-8 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeMilestone(m.id)}
                  className="text-gray-300 hover:text-red-500"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
