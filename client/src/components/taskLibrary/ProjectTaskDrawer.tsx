// ─────────────────────────────────────────────────────────────────────────────
// Project Task detail drawer
//
// Edit a single project task: status, assignee, dates, acceptance-criteria
// checklist, notes, photo/document placeholders, inspection status, and
// future-module links. All writes go through the taskLibrary API, which enforces
// the system rules (skip requires reason; quality-gate completion requires all
// acceptance criteria). Editing here NEVER touches the master task.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Camera, FileText, Trash2, Link2, AlertTriangle, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  PROJECT_TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_ROLES,
  INSPECTION_STATUSES,
  STATUS_BADGE_CLASS,
  type ProjectTask,
  type ProjectTaskStatus,
} from '@shared/taskLibrary-types';
import { updateProjectTask, deleteCustomProjectTask } from '@/lib/taskLibrary/api';

interface Props {
  projectId: string;
  task: ProjectTask | null;
  open: boolean;
  onClose: () => void;
}

export function ProjectTaskDrawer({ projectId, task, open, onClose }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<ProjectTask | null>(task);
  const [saving, setSaving] = useState(false);
  const [newCriterion, setNewCriterion] = useState('');

  useEffect(() => {
    setForm(task ? { ...task } : null);
    setNewCriterion('');
  }, [task, open]);

  if (!form) return null;
  const set = (k: keyof ProjectTask, v: any) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const toggleCriterion = (id: string) =>
    set(
      'acceptanceCriteria',
      form.acceptanceCriteria.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
    );

  const skipNeedsReason = form.status === 'Skipped' && !form.changeReason?.trim();
  const gateBlocksComplete =
    form.status === 'Complete' &&
    form.qualityGate &&
    form.acceptanceCriteria.length > 0 &&
    form.acceptanceCriteria.some((c) => !c.done);

  const handleSave = async () => {
    if (skipNeedsReason) {
      toast({ title: 'A reason is required to skip a task.', variant: 'destructive' });
      return;
    }
    if (gateBlocksComplete) {
      toast({
        title: 'Acceptance criteria incomplete',
        description: 'Confirm all acceptance criteria before completing a quality-gate task.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      await updateProjectTask(projectId, form.id, {
        title: form.title,
        description: form.description,
        status: form.status,
        priority: form.priority,
        assignedRole: form.assignedRole,
        assignedUserId: form.assignedUserId,
        assignedSubcontractorId: form.assignedSubcontractorId,
        startDate: form.startDate,
        dueDate: form.dueDate,
        acceptanceCriteria: form.acceptanceCriteria,
        projectSpecificNotes: form.projectSpecificNotes,
        changeReason: form.changeReason,
        inspectionStatus: form.inspectionStatus,
        clientVisible: form.clientVisible,
        subcontractorVisible: form.subcontractorVisible,
        uploadedPhotos: form.uploadedPhotos,
        uploadedDocuments: form.uploadedDocuments,
        // Future-module links (editable here; null until those modules wire in):
        inspectionId: form.inspectionId ?? null,
        drawRequestId: form.drawRequestId ?? null,
        changeOrderId: form.changeOrderId ?? null,
        clientSelectionId: form.clientSelectionId ?? null,
        subcontractorId: form.subcontractorId ?? null,
        warrantyItemId: form.warrantyItemId ?? null,
      });
      toast({ title: 'Task updated' });
      onClose();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!form.isCustomTask) return;
    if (!confirm('Delete this custom task? This cannot be undone.')) return;
    try {
      await deleteCustomProjectTask(projectId, form.id);
      toast({ title: 'Custom task deleted' });
      onClose();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    }
  };

  // Lightweight add-by-URL for photos/documents. Real Firebase Storage upload
  // wires in here later (see spec §9 future integrations).
  const addAttachment = (kind: 'photo' | 'doc') => {
    const url = prompt(`Paste ${kind === 'photo' ? 'photo' : 'document'} URL`);
    if (!url) return;
    const name = url.split('/').pop() || url;
    if (kind === 'photo') set('uploadedPhotos', [...(form.uploadedPhotos || []), { name, url }]);
    else set('uploadedDocuments', [...(form.uploadedDocuments || []), { name, url }]);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs text-gray-400">{form.taskCode}</code>
            {form.isCustomTask && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Custom</Badge>
            )}
            {form.masterTaskId && (
              <span className="text-[10px] text-gray-400">master v{form.masterVersionUsed}</span>
            )}
          </div>
          <SheetTitle className="text-left">{form.title}</SheetTitle>
          <p className="text-xs text-gray-500 text-left">{form.phase}</p>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {form.isCustomTask ? (
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
            </div>
          ) : null}

          {form.description && <p className="text-sm text-gray-600">{form.description}</p>}

          {/* Status + priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v as ProjectTaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Badge variant="outline" className={STATUS_BADGE_CLASS[form.status]}>{form.status}</Badge>

          {/* Skip reason / change reason */}
          {(form.status === 'Skipped' || form.changeReason) && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                Reason {form.status === 'Skipped' && <span className="text-red-500">*</span>}
              </Label>
              <Textarea
                rows={2}
                value={form.changeReason}
                onChange={(e) => set('changeReason', e.target.value)}
                placeholder="Why is this task skipped / changed?"
                className={skipNeedsReason ? 'border-red-300' : ''}
              />
              {skipNeedsReason && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> A reason is required to skip a task.
                </p>
              )}
            </div>
          )}

          {/* Assignment */}
          <div className="space-y-1">
            <Label>Assigned Role</Label>
            <Select value={form.assignedRole} onValueChange={(v) => set('assignedRole', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Assigned User ID</Label>
              <Input
                value={form.assignedUserId || ''}
                onChange={(e) => set('assignedUserId', e.target.value || null)}
                placeholder="user id"
              />
            </div>
            <div className="space-y-1">
              <Label>Subcontractor ID</Label>
              <Input
                value={form.assignedSubcontractorId || ''}
                onChange={(e) => set('assignedSubcontractorId', e.target.value || null)}
                placeholder="sub id"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate || ''} onChange={(e) => set('startDate', e.target.value || null)} />
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate || ''} onChange={(e) => set('dueDate', e.target.value || null)} />
            </div>
          </div>

          <Separator />

          {/* Acceptance criteria checklist */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Acceptance Criteria
              {form.qualityGate && (
                <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]">Quality gate</Badge>
              )}
            </Label>
            {form.acceptanceCriteria.length === 0 && (
              <p className="text-xs text-gray-400">No acceptance criteria.</p>
            )}
            {form.acceptanceCriteria.map((c) => (
              <label key={c.id} className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={c.done} onCheckedChange={() => toggleCriterion(c.id)} className="mt-0.5" />
                <span className={c.done ? 'line-through text-gray-400' : ''}>{c.text}</span>
              </label>
            ))}
            <div className="flex gap-2 pt-1">
              <Input
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                placeholder="Add criterion…"
                className="h-8"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (newCriterion.trim()) {
                    set('acceptanceCriteria', [
                      ...form.acceptanceCriteria,
                      { id: `ac_${Date.now()}`, text: newCriterion.trim(), done: false },
                    ]);
                    setNewCriterion('');
                  }
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator />

          {/* Photos & documents */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <Camera className="h-4 w-4" /> Photos
                <span className="text-xs text-gray-400">
                  ({(form.uploadedPhotos || []).length}/{form.requiredPhotos} required)
                </span>
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={() => addAttachment('photo')}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {(form.uploadedPhotos || []).map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-600 truncate flex-1">{p.name}</a>
                <button onClick={() => set('uploadedPhotos', form.uploadedPhotos.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <FileText className="h-4 w-4" /> Documents
                {form.requiredDocuments?.length > 0 && (
                  <span className="text-xs text-gray-400">({form.requiredDocuments.length} required)</span>
                )}
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={() => addAttachment('doc')}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {(form.requiredDocuments || []).length > 0 && (
              <p className="text-xs text-gray-400">Required: {form.requiredDocuments.join(', ')}</p>
            )}
            {(form.uploadedDocuments || []).map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 truncate flex-1">{d.name}</a>
                <button onClick={() => set('uploadedDocuments', form.uploadedDocuments.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>

          {/* Inspection */}
          {form.inspectionRequired && (
            <>
              <Separator />
              <div className="space-y-1">
                <Label>Inspection Status</Label>
                <Select value={form.inspectionStatus} onValueChange={(v) => set('inspectionStatus', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INSPECTION_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <Separator />

          {/* Notes */}
          <div className="space-y-1">
            <Label>Project-Specific Notes</Label>
            <Textarea
              rows={3}
              value={form.projectSpecificNotes}
              onChange={(e) => set('projectSpecificNotes', e.target.value)}
            />
          </div>

          {/* Visibility */}
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox checked={form.clientVisible} onCheckedChange={(v) => set('clientVisible', !!v)} />
              Client visible
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox checked={form.subcontractorVisible} onCheckedChange={(v) => set('subcontractorVisible', !!v)} />
              Sub visible
            </label>
          </div>

          {/* Future-module links — connect to change orders, draws, selections,
              warranty, schedule as those modules wire in (spec §9). */}
          <Separator />
          <div className="space-y-2">
            <Label className="flex items-center gap-1 text-gray-500">
              <Link2 className="h-4 w-4" /> Module Links
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <LinkField label="Change Order" value={form.changeOrderId} onChange={(v) => set('changeOrderId', v)} />
              <LinkField label="Draw Request" value={form.drawRequestId} onChange={(v) => set('drawRequestId', v)} />
              <LinkField label="Client Selection" value={form.clientSelectionId} onChange={(v) => set('clientSelectionId', v)} />
              <LinkField label="Warranty Item" value={form.warrantyItemId} onChange={(v) => set('warrantyItemId', v)} />
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row justify-between gap-2">
          {form.isCustomTask ? (
            <Button variant="ghost" className="text-red-500 hover:text-red-600" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#C9A96E] hover:bg-[#b8975c]">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function LinkField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[11px] text-gray-400">{label}</Label>
      <Input
        className="h-8 text-xs"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="—"
      />
    </div>
  );
}
