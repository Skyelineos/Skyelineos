// ─────────────────────────────────────────────────────────────────────────────
// Promote Improvement to Master — admin review modal
//
// For a single closeout suggestion, the admin picks an action and (where needed)
// provides a small payload, then approves/rejects. Approving applies the change
// to the Master Task Library server-side. Improvements are NEVER auto-applied.
// ─────────────────────────────────────────────────────────────────────────────
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { ImprovementAction, TaskImprovement } from '@shared/taskLibrary-types';
import { resolveImprovement } from '@/lib/taskLibrary/api';

const ACTION_LABELS: Record<ImprovementAction, string> = {
  add_new_master_task: 'Add as new master task',
  update_existing_master_task: 'Update existing master task',
  add_tag: 'Add tag to master task',
  add_acceptance_criteria: 'Add acceptance criteria',
  add_required_photo_doc: 'Add required photo / document',
  mark_optional: 'Mark master task optional',
  mark_required: 'Mark master task required',
  reject: 'Reject suggestion',
  note_for_review: 'Leave note for future review',
};

// Default action per improvement kind — a sensible starting point.
const DEFAULT_ACTION: Record<string, ImprovementAction> = {
  custom_task_added: 'add_new_master_task',
  frequently_skipped: 'mark_optional',
  delayed: 'update_existing_master_task',
  caused_change_order: 'add_acceptance_criteria',
  blocked: 'note_for_review',
  missing_acceptance_criteria: 'add_acceptance_criteria',
  extra_photos_docs: 'add_required_photo_doc',
  warranty_issue: 'add_acceptance_criteria',
};

interface Props {
  improvement: TaskImprovement | null;
  open: boolean;
  onClose: () => void;
}

export function PromoteImprovementsModal({ improvement, open, onClose }: Props) {
  const { toast } = useToast();
  const [action, setAction] = useState<ImprovementAction>('note_for_review');
  const [adminNote, setAdminNote] = useState('');
  const [tag, setTag] = useState('');
  const [criterion, setCriterion] = useState('');
  const [requiredPhotos, setRequiredPhotos] = useState('');
  const [document, setDocument] = useState('');
  const [duration, setDuration] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (improvement) {
      setAction(DEFAULT_ACTION[improvement.kind] || 'note_for_review');
      setAdminNote('');
      setTag('');
      setCriterion('');
      setRequiredPhotos(String(improvement.suggestedData?.suggestedRequiredPhotos ?? ''));
      setDocument('');
      setDuration('');
    }
  }, [improvement, open]);

  if (!improvement) return null;

  const handleResolve = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      if (action === 'add_tag') payload.tag = tag.trim();
      if (action === 'add_acceptance_criteria') payload.text = criterion.trim();
      if (action === 'add_required_photo_doc') {
        if (requiredPhotos) payload.requiredPhotos = Number(requiredPhotos);
        if (document.trim()) payload.document = document.trim();
      }
      if (action === 'update_existing_master_task') {
        if (duration) payload.defaultDurationDays = Number(duration);
        if (adminNote) payload.improvementNotes = adminNote;
      }
      await resolveImprovement(improvement.id, action, payload, adminNote);
      toast({ title: 'Improvement resolved', description: ACTION_LABELS[action] });
      onClose();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Promote Improvement to Master</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-gray-50 border rounded-md p-3 text-sm">
            <div className="font-medium text-gray-800">{improvement.title || improvement.taskCode}</div>
            <p className="text-gray-600 mt-1">{improvement.summary}</p>
          </div>

          <div className="space-y-1">
            <Label>Action</Label>
            <Select value={action} onValueChange={(v) => setAction(v as ImprovementAction)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ACTION_LABELS) as ImprovementAction[]).map((a) => (
                  <SelectItem key={a} value={a}>{ACTION_LABELS[a]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {action === 'add_tag' && (
            <div className="space-y-1">
              <Label>Tag</Label>
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. hillside" />
            </div>
          )}
          {action === 'add_acceptance_criteria' && (
            <div className="space-y-1">
              <Label>Criterion</Label>
              <Input value={criterion} onChange={(e) => setCriterion(e.target.value)} placeholder="New acceptance criterion" />
            </div>
          )}
          {action === 'add_required_photo_doc' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Required Photos</Label>
                <Input type="number" value={requiredPhotos} onChange={(e) => setRequiredPhotos(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Document</Label>
                <Input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="Doc name" />
              </div>
            </div>
          )}
          {action === 'update_existing_master_task' && (
            <div className="space-y-1">
              <Label>New default duration (days)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          )}
          {action === 'add_new_master_task' && (
            <p className="text-xs text-gray-500">
              The custom project task will be copied into the master library as a new optional task.
            </p>
          )}

          <div className="space-y-1">
            <Label>Admin Note (optional)</Label>
            <Textarea rows={2} value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleResolve} disabled={saving} className="bg-[#C9A96E] hover:bg-[#b8975c]">
            {saving ? 'Applying…' : action === 'reject' ? 'Reject' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
