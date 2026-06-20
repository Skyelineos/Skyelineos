// Designer Portal — Selection Tracker panel for one room.
// Reads/writes the existing projects/{id}/selections collection (additive fields).
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileText,
  Link2,
  Pencil,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { MOODBOARD_CATEGORIES } from '@/lib/designer/portalTypes';
import {
  SELECTION_DESIGN_STATUSES,
  SELECTION_MILESTONES,
  computeVariance,
  selectionHasRequiredLink,
  type DesignSelection,
  type SelectionDesignStatus,
} from '@/lib/designer/portalTypes';
import {
  createSelection,
  fetchProjectAllowances,
  fetchProjectTasks,
  notifyClientDecided,
  notifyDesignReviewRequested,
  setSelectionStatus,
  updateSelection,
  verifySelectionLink,
  type AllowanceLine,
  type ScheduleTaskRef,
} from '@/lib/designer/portalService';
import { AiActionsMenu } from './AiActionsMenu';
import { EmptyState, StatusBadge } from './shared';

interface Props {
  projectId: string;
  projectName: string;
  roomId: string;
  roomName: string;
  selections: DesignSelection[];
  canEdit: boolean;
  canReview: boolean;
}

export function SelectionTrackerPanel({
  projectId,
  projectName,
  roomId,
  roomName,
  selections,
  canEdit,
  canReview,
}: Props) {
  const [editing, setEditing] = useState<DesignSelection | null>(null);
  const [adding, setAdding] = useState(false);

  const overAllowance = selections.filter((s) => computeVariance(s) > 0).length;
  const missingLinks = selections.filter(
    (s) => !selectionHasRequiredLink(s)
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
            Selections ({selections.length})
          </h4>
          {overAllowance > 0 && (
            <Badge tone="red">{overAllowance} over allowance</Badge>
          )}
          {missingLinks > 0 && (
            <Badge tone="amber">{missingLinks} missing links</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AiActionsMenu
            scope="room"
            context={{ projectId, roomId, roomName }}
          />
          {canEdit && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setAdding(true)}
            >
              <Plus className="w-4 h-4" /> Add selection
            </Button>
          )}
        </div>
      </div>

      {!selections.length && (
        <EmptyState
          icon={Link2}
          title="No selections for this room"
          hint={
            canEdit
              ? 'Track products, allowances, and approvals here.'
              : 'Selections will appear as the designer adds them.'
          }
        />
      )}

      <div className="space-y-3">
        {selections.map((s) => (
          <SelectionRow
            key={s.id}
            projectId={projectId}
            projectName={projectName}
            roomName={roomName}
            selection={s}
            canEdit={canEdit}
            canReview={canReview}
            onEdit={() => setEditing(s)}
          />
        ))}
      </div>

      {(adding || editing) && (
        <SelectionDialog
          projectId={projectId}
          roomId={roomId}
          roomName={roomName}
          existing={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'red' | 'amber';
}) {
  const cls =
    tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      <AlertTriangle className="w-3 h-3" /> {children}
    </span>
  );
}

function SelectionRow({
  projectId,
  projectName,
  roomName,
  selection: s,
  canEdit,
  canReview,
  onEdit,
}: {
  projectId: string;
  projectName: string;
  roomName: string;
  selection: DesignSelection;
  canEdit: boolean;
  canReview: boolean;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const variance = computeVariance(s);
  const over = variance > 0;
  const hasLink = selectionHasRequiredLink(s);
  const status = (s.designStatus || 'notStarted') as SelectionDesignStatus;
  const canAdvance = hasLink; // gate: can't go inReview/approved without a link/flag

  async function advance(next: SelectionDesignStatus) {
    if ((next === 'inReview' || next === 'approved') && !hasLink) {
      toast({
        title: 'Add a product or spec link first',
        description: 'Or mark the selection Custom / TBD / N/A.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await setSelectionStatus(projectId, s, next);
      const vars = {
        itemName: s.itemName || s.category || 'a selection',
        room: roomName,
        projectName,
      };
      if (next === 'inReview' && canEdit) {
        void notifyDesignReviewRequested(projectId, vars);
      } else if (canReview && next === 'approved') {
        void notifyClientDecided(projectId, { ...vars, decision: 'approved' });
      } else if (canReview && next === 'notStarted') {
        void notifyClientDecided(projectId, { ...vars, decision: 'rejected' });
      }
    } catch (e: any) {
      toast({
        title: 'Update failed',
        description: e?.message,
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-gray-900">
              {s.itemName || s.category || 'Untitled selection'}
            </p>
            <StatusBadge status={status} />
            {s.isTBD && (
              <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
                TBD
              </span>
            )}
            {s.isCustom && (
              <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
                Custom
              </span>
            )}
            {s.isNotApplicable && (
              <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
                N/A
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {[s.category, s.vendor].filter(Boolean).join(' · ')}
          </p>

          {/* Budget line */}
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="text-gray-500">
              Allowance{' '}
              <span className="font-medium text-gray-800 tabular-nums">
                {formatCurrency(s.allowanceAmount || 0)}
              </span>
            </span>
            <span className="text-gray-500">
              Selected{' '}
              <span className="font-medium text-gray-800 tabular-nums">
                {formatCurrency(s.selectedAmount || 0)}
              </span>
            </span>
            <span
              className={
                over
                  ? 'text-red-600 font-semibold tabular-nums'
                  : 'text-emerald-600 font-medium tabular-nums'
              }
            >
              {over ? '+' : ''}
              {formatCurrency(variance)}
            </span>
          </div>

          {/* Warnings */}
          <div className="flex flex-wrap gap-2 mt-2">
            {!hasLink && (
              <Badge tone="amber">Missing product / spec link</Badge>
            )}
            {over && <Badge tone="red">Over allowance</Badge>}
            {s.dueDate && (
              <span className="text-xs text-gray-400">
                Due {fmtDate(s.dueDate)}
              </span>
            )}
            {s.requiredBeforeTrade && (
              <span className="text-xs text-gray-400">
                Needed before {s.requiredBeforeTrade}
              </span>
            )}
            {s.linkedScheduleMilestone && (
              <span className="text-xs text-indigo-500">
                → {s.linkedScheduleMilestone}
              </span>
            )}
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-3 mt-2">
            {s.productUrl && (
              <a
                href={s.productUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 inline-flex items-center gap-0.5"
              >
                <ExternalLink className="w-3 h-3" /> Product
              </a>
            )}
            {s.specSheetUrl && (
              <a
                href={s.specSheetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 inline-flex items-center gap-0.5"
              >
                <FileText className="w-3 h-3" /> Spec sheet
              </a>
            )}
            {s.vendorUrl && (
              <a
                href={s.vendorUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 inline-flex items-center gap-0.5"
              >
                <ExternalLink className="w-3 h-3" /> Vendor
              </a>
            )}
            {(s.productUrl || s.specSheetUrl) && canEdit && (
              <button
                onClick={() =>
                  verifySelectionLink(projectId, s.id, !s.linkVerified)
                }
                className={`text-xs inline-flex items-center gap-0.5 ${s.linkVerified ? 'text-emerald-600' : 'text-gray-400'}`}
              >
                <ShieldCheck className="w-3 h-3" />{' '}
                {s.linkVerified ? 'Link verified' : 'Mark verified'}
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2">
          {canEdit && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-gray-400"
                onClick={onEdit}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Select
                value={status}
                onValueChange={(v) => advance(v as SelectionDesignStatus)}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SELECTION_DESIGN_STATUSES.map((st) => (
                    <SelectItem
                      key={st}
                      value={st}
                      disabled={
                        (st === 'inReview' || st === 'approved') && !canAdvance
                      }
                    >
                      {labelFor(st)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {canReview && status !== 'approved' && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
                disabled={!hasLink}
                onClick={() => advance('approved')}
              >
                <Check className="w-3.5 h-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-red-600 border-red-200"
                onClick={() => advance('notStarted')}
              >
                <X className="w-3.5 h-3.5" /> Reject
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function labelFor(s: SelectionDesignStatus): string {
  return {
    notStarted: 'Not Started',
    inReview: 'In Review',
    approved: 'Approved',
    ordered: 'Ordered',
    installed: 'Installed',
  }[s];
}

function fmtDate(v: any): string {
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

function SelectionDialog({
  projectId,
  roomId,
  roomName,
  existing,
  onClose,
}: {
  projectId: string;
  roomId: string;
  roomName: string;
  existing: DesignSelection | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    itemName: existing?.itemName || '',
    category: existing?.category || 'Custom',
    vendor: existing?.vendor || '',
    productUrl: existing?.productUrl || '',
    specSheetUrl: existing?.specSheetUrl || '',
    vendorUrl: existing?.vendorUrl || '',
    allowanceAmount:
      existing?.allowanceAmount != null ? String(existing.allowanceAmount) : '',
    selectedAmount:
      existing?.selectedAmount != null ? String(existing.selectedAmount) : '',
    requiredBeforeTrade: existing?.requiredBeforeTrade || '',
    linkedScheduleMilestone: existing?.linkedScheduleMilestone || '',
    linkedScheduleTaskId: existing?.linkedScheduleTaskId || '',
    linkedEstimateId: existing?.linkedEstimateId || '',
    linkedEstimateLineId: existing?.linkedEstimateLineId || '',
    timelineImpact: existing?.timelineImpact || '',
    notes: existing?.notes || '',
    isCustom: existing?.isCustom || false,
    isTBD: existing?.isTBD || false,
    isNotApplicable: existing?.isNotApplicable || false,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Budget + schedule link sources (best-effort; empty when none/unauthorized).
  const [allowances, setAllowances] = useState<AllowanceLine[]>([]);
  const [tasks, setTasks] = useState<ScheduleTaskRef[]>([]);
  useEffect(() => {
    let active = true;
    fetchProjectAllowances(projectId).then((a) => {
      if (active) setAllowances(a);
    });
    fetchProjectTasks(projectId).then((t) => {
      if (active) setTasks(t);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  function linkAllowance(lineId: string) {
    if (lineId === 'none') {
      setForm((f) => ({
        ...f,
        linkedEstimateId: '',
        linkedEstimateLineId: '',
      }));
      return;
    }
    const a = allowances.find((x) => x.lineId === lineId);
    if (!a) return;
    setForm((f) => ({
      ...f,
      linkedEstimateId: a.estimateId,
      linkedEstimateLineId: a.lineId,
      allowanceAmount: String(a.amount),
    }));
  }

  // Schedule link: real tasks use the value `task:<id>`; the canonical
  // SELECTION_MILESTONES use their own name. Reference-only (no automation).
  function onMilestoneChange(v: string) {
    if (v === 'none') {
      setForm((f) => ({
        ...f,
        linkedScheduleMilestone: '',
        linkedScheduleTaskId: '',
      }));
    } else if (v.startsWith('task:')) {
      const id = v.slice(5);
      const t = tasks.find((x) => x.id === id);
      setForm((f) => ({
        ...f,
        linkedScheduleTaskId: id,
        linkedScheduleMilestone: t?.name || '',
      }));
    } else {
      setForm((f) => ({
        ...f,
        linkedScheduleMilestone: v,
        linkedScheduleTaskId: '',
      }));
    }
  }
  const milestoneValue = form.linkedScheduleTaskId
    ? `task:${form.linkedScheduleTaskId}`
    : form.linkedScheduleMilestone || 'none';

  const draft: Partial<DesignSelection> = {
    ...form,
    allowanceAmount: parseFloat(form.allowanceAmount) || 0,
    selectedAmount: parseFloat(form.selectedAmount) || 0,
  };
  const variance = computeVariance(draft);
  const hasLink = selectionHasRequiredLink(draft);

  async function save() {
    if (!form.itemName.trim()) {
      toast({ title: 'Name the selection', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<DesignSelection> = {
        roomId,
        room: roomName,
        itemName: form.itemName.trim(),
        category: form.category,
        vendor: form.vendor || undefined,
        productUrl: form.productUrl || undefined,
        specSheetUrl: form.specSheetUrl || undefined,
        vendorUrl: form.vendorUrl || undefined,
        allowanceAmount: parseFloat(form.allowanceAmount) || 0,
        selectedAmount: parseFloat(form.selectedAmount) || 0,
        requiredBeforeTrade: form.requiredBeforeTrade || undefined,
        linkedScheduleMilestone: form.linkedScheduleMilestone || undefined,
        linkedScheduleTaskId: form.linkedScheduleTaskId || undefined,
        linkedEstimateId: form.linkedEstimateId || undefined,
        linkedEstimateLineId: form.linkedEstimateLineId || undefined,
        timelineImpact: form.timelineImpact || undefined,
        notes: form.notes || undefined,
        isCustom: form.isCustom,
        isTBD: form.isTBD,
        isNotApplicable: form.isNotApplicable,
      };
      if (existing) await updateSelection(projectId, existing.id, payload);
      else await createSelection(projectId, payload);
      toast({ title: existing ? 'Selection updated' : 'Selection added' });
      onClose();
    } catch (e: any) {
      toast({
        title: 'Save failed',
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? 'Edit selection' : 'Add selection'} — {roomName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {allowances.length > 0 && (
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Link to estimate allowance
              </span>
              <Select
                value={form.linkedEstimateLineId || 'none'}
                onValueChange={linkAllowance}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not linked (manual)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked (manual)</SelectItem>
                  {allowances.map((a) => (
                    <SelectItem key={a.lineId} value={a.lineId}>
                      {a.description || a.trade || 'Allowance'} —{' '}
                      {formatCurrency(a.amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.linkedEstimateLineId && (
                <p className="mt-1 text-xs text-emerald-600">
                  Allowance sourced from the estimate.
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Item name *
              </span>
              <Input
                value={form.itemName}
                onChange={(e) => set('itemName', e.target.value)}
                placeholder="e.g. Kitchen faucet"
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Category
              </span>
              <Select
                value={form.category}
                onValueChange={(v) => set('category', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOODBOARD_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Vendor
              </span>
              <Input
                value={form.vendor}
                onChange={(e) => set('vendor', e.target.value)}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Allowance ($)
              </span>
              <Input
                value={form.allowanceAmount}
                onChange={(e) => set('allowanceAmount', e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Selected ($)
              </span>
              <Input
                value={form.selectedAmount}
                onChange={(e) => set('selectedAmount', e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>

          <div
            className={`text-sm rounded-lg px-3 py-2 ${variance > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}
          >
            Variance:{' '}
            <span className="font-semibold tabular-nums">
              {variance > 0 ? '+' : ''}
              {formatCurrency(variance)}
            </span>
            {variance > 0 && ' — over allowance'}
          </div>

          <Input
            value={form.productUrl}
            onChange={(e) => set('productUrl', e.target.value)}
            placeholder="Product URL"
          />
          <Input
            value={form.specSheetUrl}
            onChange={(e) => set('specSheetUrl', e.target.value)}
            placeholder="Spec sheet URL"
          />
          <Input
            value={form.vendorUrl}
            onChange={(e) => set('vendorUrl', e.target.value)}
            placeholder="Vendor URL"
          />

          {!hasLink && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Needs a product/spec link
              (or a Custom/TBD/N/A flag) before it can move to In Review or
              Approved.
            </p>
          )}

          <div className="flex flex-wrap gap-4">
            <span className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isCustom}
                onCheckedChange={(v) => set('isCustom', !!v)}
              />{' '}
              Custom
            </span>
            <span className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isTBD}
                onCheckedChange={(v) => set('isTBD', !!v)}
              />{' '}
              TBD
            </span>
            <span className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isNotApplicable}
                onCheckedChange={(v) => set('isNotApplicable', !!v)}
              />{' '}
              N/A
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Required before trade
              </span>
              <Input
                value={form.requiredBeforeTrade}
                onChange={(e) => set('requiredBeforeTrade', e.target.value)}
                placeholder="e.g. Cabinets"
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Schedule milestone
              </span>
              <Select value={milestoneValue} onValueChange={onMilestoneChange}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={`task:${t.id}`}>
                      {t.isMilestone ? '◆ ' : ''}
                      {t.name}
                    </SelectItem>
                  ))}
                  {SELECTION_MILESTONES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Notes"
            rows={2}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Add selection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
