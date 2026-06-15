// Add / edit modal for a Master Task. Admin-only. Writes go through the
// taskLibrary API (server bumps version on edit). On success the parent's live
// Firestore subscription picks up the change automatically.
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  TASK_PHASES,
  TASK_ROLES,
  RISK_LEVELS,
  SUGGESTED_TAGS,
  type MasterTask,
} from '@shared/taskLibrary-types';
import { createMasterTask, updateMasterTask } from '@/lib/taskLibrary/api';

interface Props {
  open: boolean;
  onClose: () => void;
  task?: MasterTask | null; // present = edit mode
  defaultPhase?: string;    // preselect a phase for a NEW task
}

const blankForm = {
  taskCode: '',
  title: '',
  description: '',
  phase: TASK_PHASES[1] as string,
  recommendedRole: 'gc',
  defaultAssigneeRole: 'gc',
  defaultDurationDays: 1,
  suggestedStartOffset: 0,
  dependencies: [] as string[],
  acceptanceCriteria: [] as { id?: string; text: string; done: boolean }[],
  requiredPhotos: 0,
  requiredDocuments: [] as string[],
  inspectionRequired: false,
  drawMilestoneRelevant: false,
  clientVisible: false,
  subcontractorVisible: false,
  designerVisible: false,
  isRequired: true,
  tags: [] as string[],
  appliesWhen: '',
  riskLevel: 'low' as string,
  qualityGate: false,
};

export function MasterTaskModal({ open, onClose, task, defaultPhase }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...blankForm });
  const [saving, setSaving] = useState(false);
  const [newCriterion, setNewCriterion] = useState('');
  const [newDoc, setNewDoc] = useState('');
  const [newDep, setNewDep] = useState('');
  const [customTag, setCustomTag] = useState('');

  useEffect(() => {
    if (task) {
      setForm({
        taskCode: task.taskCode || '',
        title: task.title || '',
        description: task.description || '',
        phase: task.phase,
        recommendedRole: task.recommendedRole || 'gc',
        defaultAssigneeRole: task.defaultAssigneeRole || 'gc',
        defaultDurationDays: task.defaultDurationDays || 1,
        suggestedStartOffset: task.suggestedStartOffset || 0,
        dependencies: task.dependencies || [],
        acceptanceCriteria: (task.acceptanceCriteria || []).map((c) => ({ ...c })),
        requiredPhotos: task.requiredPhotos || 0,
        requiredDocuments: task.requiredDocuments || [],
        inspectionRequired: !!task.inspectionRequired,
        drawMilestoneRelevant: !!task.drawMilestoneRelevant,
        clientVisible: !!task.clientVisible,
        subcontractorVisible: !!task.subcontractorVisible,
        designerVisible: !!task.designerVisible,
        isRequired: task.isRequired !== false,
        tags: task.tags || [],
        appliesWhen: task.appliesWhen || '',
        riskLevel: task.riskLevel || 'low',
        qualityGate: !!task.qualityGate,
      });
    } else {
      setForm({ ...blankForm, ...(defaultPhase ? { phase: defaultPhase } : {}) });
    }
  }, [task, open, defaultPhase]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const toggleTag = (tag: string) =>
    set('tags', form.tags.includes(tag) ? form.tags.filter((t) => t !== tag) : [...form.tags, tag]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (task) {
        await updateMasterTask(task.id, form);
        toast({ title: 'Master task updated' });
      } else {
        await createMasterTask(form);
        toast({ title: 'Master task created' });
      }
      onClose();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Master Task' : 'Add Master Task'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Task Code</Label>
              <Input
                value={form.taskCode}
                onChange={(e) => set('taskCode', e.target.value)}
                placeholder="Auto"
                disabled={!!task}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phase</Label>
              <Select value={form.phase} onValueChange={(v) => set('phase', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PHASES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Risk Level</Label>
              <Select value={form.riskLevel} onValueChange={(v) => set('riskLevel', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Recommended Role</Label>
              <Select value={form.recommendedRole} onValueChange={(v) => set('recommendedRole', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Default Assignee Role</Label>
              <Select value={form.defaultAssigneeRole} onValueChange={(v) => set('defaultAssigneeRole', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Duration (days)</Label>
              <Input
                type="number"
                value={form.defaultDurationDays}
                onChange={(e) => set('defaultDurationDays', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label>Start Offset (days)</Label>
              <Input
                type="number"
                value={form.suggestedStartOffset}
                onChange={(e) => set('suggestedStartOffset', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label>Required Photos</Label>
              <Input
                type="number"
                value={form.requiredPhotos}
                onChange={(e) => set('requiredPhotos', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Applies When</Label>
            <Input
              value={form.appliesWhen}
              onChange={(e) => set('appliesWhen', e.target.value)}
              placeholder="e.g. Hillside or basement sites"
            />
          </div>

          {/* Acceptance criteria */}
          <div className="space-y-2">
            <Label>Acceptance Criteria</Label>
            <div className="space-y-1">
              {form.acceptanceCriteria.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 px-2 py-1 bg-gray-50 rounded">{c.text}</span>
                  <button
                    onClick={() =>
                      set('acceptanceCriteria', form.acceptanceCriteria.filter((_, j) => j !== i))
                    }
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                placeholder="Add criterion…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCriterion.trim()) {
                    set('acceptanceCriteria', [...form.acceptanceCriteria, { text: newCriterion.trim(), done: false }]);
                    setNewCriterion('');
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (newCriterion.trim()) {
                    set('acceptanceCriteria', [...form.acceptanceCriteria, { text: newCriterion.trim(), done: false }]);
                    setNewCriterion('');
                  }
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Required documents */}
          <div className="space-y-2">
            <Label>Required Documents</Label>
            <div className="flex flex-wrap gap-1">
              {form.requiredDocuments.map((d, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  {d}
                  <button onClick={() => set('requiredDocuments', form.requiredDocuments.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newDoc} onChange={(e) => setNewDoc(e.target.value)} placeholder="Add document…" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (newDoc.trim()) {
                    set('requiredDocuments', [...form.requiredDocuments, newDoc.trim()]);
                    setNewDoc('');
                  }
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Dependencies */}
          <div className="space-y-2">
            <Label>Dependencies (task codes)</Label>
            <div className="flex flex-wrap gap-1">
              {form.dependencies.map((d, i) => (
                <Badge key={i} variant="outline" className="gap-1">
                  {d}
                  <button onClick={() => set('dependencies', form.dependencies.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newDep} onChange={(e) => setNewDep(e.target.value)} placeholder="e.g. PRE-010" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (newDep.trim()) {
                    set('dependencies', [...form.dependencies, newDep.trim().toUpperCase()]);
                    setNewDep('');
                  }
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    form.tags.includes(tag)
                      ? 'bg-[#C9A96E] text-white border-[#C9A96E]'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-[#C9A96E]'
                  }`}
                >
                  {tag}
                </button>
              ))}
              {form.tags
                .filter((t) => !(SUGGESTED_TAGS as readonly string[]).includes(t))
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className="px-2 py-0.5 rounded-full text-xs border bg-[#C9A96E] text-white border-[#C9A96E]"
                  >
                    {t} ×
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                placeholder="Custom tag…"
                className="h-8"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const t = customTag.trim();
                  if (t && !form.tags.includes(t)) set('tags', [...form.tags, t]);
                  setCustomTag('');
                }}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Flags */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <FlagRow label="Required task" checked={form.isRequired} onChange={(v) => set('isRequired', v)} />
            <FlagRow label="Quality gate" checked={form.qualityGate} onChange={(v) => set('qualityGate', v)} />
            <FlagRow label="Inspection required" checked={form.inspectionRequired} onChange={(v) => set('inspectionRequired', v)} />
            <FlagRow label="Draw milestone relevant" checked={form.drawMilestoneRelevant} onChange={(v) => set('drawMilestoneRelevant', v)} />
            <FlagRow label="Client visible" checked={form.clientVisible} onChange={(v) => set('clientVisible', v)} />
            <FlagRow label="Subcontractor visible" checked={form.subcontractorVisible} onChange={(v) => set('subcontractorVisible', v)} />
            <FlagRow label="Designer visible" checked={form.designerVisible} onChange={(v) => set('designerVisible', v)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#C9A96E] hover:bg-[#b8975c]">
            {saving ? 'Saving…' : task ? 'Save Changes' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlagRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      {label}
    </label>
  );
}
