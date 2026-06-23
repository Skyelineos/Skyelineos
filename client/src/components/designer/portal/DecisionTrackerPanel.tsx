// Designer Portal — Decision Tracker panel for one room.
import { useState } from 'react';
import { Check, Clock, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { fireTrigger } from '@/lib/notifications';
import type {
  DecisionStatus,
  DesignDecision,
} from '@/lib/designer/portalTypes';
import {
  createDecision,
  deleteDecision,
  notifyClientDecided,
  setDecisionStatus,
} from '@/lib/designer/portalService';
import { EmptyState, StatusBadge } from './shared';

interface Props {
  projectId: string;
  projectName: string;
  roomId: string;
  roomName: string;
  decisions: DesignDecision[];
  canEdit: boolean;
  canReview: boolean;
}

export function DecisionTrackerPanel({
  projectId,
  projectName,
  roomId,
  roomName,
  decisions,
  canEdit,
  canReview,
}: Props) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);

  async function setStatus(
    d: DesignDecision,
    status: DecisionStatus,
    note?: string
  ) {
    try {
      await setDecisionStatus(projectId, d.id, status, note);
      if (canReview && status !== 'pending') {
        const decision =
          status === 'needsRevision' ? 'requested a revision on' : status;
        void notifyClientDecided(projectId, {
          itemName: d.title,
          room: roomName,
          projectName,
          decision,
        });
      }
    } catch (e: any) {
      toast({
        title: 'Update failed',
        description: e?.message,
        variant: 'destructive',
      });
    }
  }

  const open = decisions.filter(
    (d) => d.status === 'pending' || d.status === 'needsRevision'
  );
  const resolved = decisions.filter(
    (d) => d.status === 'approved' || d.status === 'rejected'
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
          Decisions ({decisions.length})
        </h4>
        {canEdit && (
          <Button size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> New decision
          </Button>
        )}
      </div>

      {!decisions.length && (
        <EmptyState
          icon={Clock}
          title="No decisions tracked"
          hint={
            canEdit
              ? 'Log design decisions that need an answer.'
              : 'Decisions needing your input will show here.'
          }
        />
      )}

      {open.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400">OPEN</p>
          {open.map((d) => (
            <DecisionCard
              key={d.id}
              d={d}
              canEdit={canEdit}
              canReview={canReview}
              onStatus={setStatus}
              onDelete={() => deleteDecision(projectId, d.id)}
            />
          ))}
        </div>
      )}
      {resolved.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400">RESOLVED</p>
          {resolved.map((d) => (
            <DecisionCard
              key={d.id}
              d={d}
              canEdit={canEdit}
              canReview={canReview}
              onStatus={setStatus}
              onDelete={() => deleteDecision(projectId, d.id)}
            />
          ))}
        </div>
      )}

      {adding && (
        <NewDecisionDialog
          projectId={projectId}
          roomId={roomId}
          roomName={roomName}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function DecisionCard({
  d,
  canEdit,
  canReview,
  onStatus,
  onDelete,
}: {
  d: DesignDecision;
  canEdit: boolean;
  canReview: boolean;
  onStatus: (d: DesignDecision, s: DecisionStatus, note?: string) => void;
  onDelete: () => void;
}) {
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [note, setNote] = useState('');
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-gray-900">{d.title}</p>
            <StatusBadge status={d.status} />
          </div>
          {d.description && (
            <p className="text-sm text-gray-600 mt-1">{d.description}</p>
          )}
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
            {d.requestedByName && <span>Requested by {d.requestedByName}</span>}
            {d.dueDate && <span>Due {fmtDate(d.dueDate)}</span>}
            {d.timelineImpact && (
              <span className="text-amber-600">
                Timeline: {d.timelineImpact}
              </span>
            )}
            {d.budgetImpact != null && (
              <span className="text-gray-500">
                Budget impact {formatCurrency(d.budgetImpact)}
              </span>
            )}
          </div>
          {d.status === 'needsRevision' && d.revisionNotes && (
            <p className="text-xs text-orange-600 mt-1">
              Revision: {d.revisionNotes}
            </p>
          )}
          {d.status === 'approved' && d.approvedByName && (
            <p className="text-xs text-emerald-600 mt-1">
              Approved by {d.approvedByName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(canReview || canEdit) && d.status !== 'approved' && (
            <Button
              size="sm"
              className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onStatus(d, 'approved')}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
          )}
          {(canReview || canEdit) && d.status === 'pending' && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-orange-600 border-orange-200"
                onClick={() => setRevisionOpen(true)}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-red-600 border-red-200"
                onClick={() => onStatus(d, 'rejected')}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-gray-300"
              onClick={onDelete}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <Dialog open={revisionOpen} onOpenChange={setRevisionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request revision</DialogTitle>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What needs to change?"
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevisionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onStatus(d, 'needsRevision', note);
                setRevisionOpen(false);
                setNote('');
              }}
              disabled={!note.trim()}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function fmtDate(v: any): string {
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

function NewDecisionDialog({
  projectId,
  roomId,
  roomName,
  onClose,
}: {
  projectId: string;
  roomId: string;
  roomName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    timelineImpact: '',
    budgetImpact: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) {
      toast({ title: 'Add a title', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createDecision(projectId, {
        roomId,
        roomName,
        title: form.title,
        description: form.description || undefined,
        dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
        timelineImpact: form.timelineImpact || undefined,
        budgetImpact: form.budgetImpact
          ? parseFloat(form.budgetImpact)
          : undefined,
      });
      // Wave-2: notify the project's homeowner(s) that a selection is due.
      // The server resolves client_of_project from projectId so no client list
      // is sent here.
      if (form.dueDate) {
        await fireTrigger({
          kind: 'selection_due',
          projectId,
          payload: {
            selectionName: form.title,
            dueDate: form.dueDate,
            projectName: '',
            link: '/portal?tab=decisions',
          },
        });
      }
      toast({ title: 'Decision created' });
      onClose();
    } catch (e: any) {
      toast({
        title: 'Create failed',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New decision — {roomName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Decision title *"
          />
          <Textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Describe what needs to be decided…"
            rows={3}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Due date
              </span>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Budget impact ($)
              </span>
              <Input
                value={form.budgetImpact}
                onChange={(e) => set('budgetImpact', e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>
          <Input
            value={form.timelineImpact}
            onChange={(e) => set('timelineImpact', e.target.value)}
            placeholder="Timeline impact (optional)"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
