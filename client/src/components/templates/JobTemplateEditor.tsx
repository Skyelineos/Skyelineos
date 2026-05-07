import { useState, useEffect, useRef, useMemo } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, getDocs,
  deleteDoc, doc, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createNotificationsBatch } from '@/lib/notifications';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft, Plus, Settings, GripVertical, Trash2, ListChecks,
  Edit3, Send, Calendar, Link2, Tag, User, Building2, Bell, X, Check,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  category: string;
  description?: string;
}

type AssigneeRole = '' | 'gc' | 'projectManager' | 'sub' | 'designer' | 'client';
type DateType = 'fixed' | 'dependent';
type TaskCategory =
  | 'Administration' | 'Schedule' | 'Cashflow Setup' | 'Selections'
  | 'Safety/QC' | 'Foundation' | 'Framing' | 'MEP' | 'Finishes'
  | 'Closing' | 'Other';

const TASK_CATEGORIES: TaskCategory[] = [
  'Administration', 'Schedule', 'Cashflow Setup', 'Selections',
  'Safety/QC', 'Foundation', 'Framing', 'MEP', 'Finishes', 'Closing', 'Other',
];

const ASSIGNEE_ROLES: { value: AssigneeRole; label: string }[] = [
  { value: '',                label: '— Unassigned —' },
  { value: 'gc',              label: 'GC / Builder' },
  { value: 'projectManager',  label: 'Project Manager' },
  { value: 'sub',             label: 'Subcontractor' },
  { value: 'designer',        label: 'Designer' },
  { value: 'client',          label: 'Client / Homeowner' },
];

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

interface JobTask {
  id: string;
  name: string;
  description?: string;
  category?: TaskCategory;
  department?: string;
  assigneeRole?: AssigneeRole;
  tags?: string[];
  dateType?: DateType;
  daysOffset: number;        // days after job start (fixed) OR after dependsOn task (dependent)
  dependsOn?: string;        // task id (only when dateType === 'dependent')
  checklist?: ChecklistItem[];
  checklistCount: number;    // cached length
  notifyOnAssign?: boolean;
  notifyOnDue?: boolean;
  notifyOnComplete?: boolean;
  order: number;
}

// ─── Top-level tabs (filter by category) ──────────────────────────────────────

const FILTER_TABS: { key: string; label: string; categories: TaskCategory[] | 'all' }[] = [
  { key: 'all',         label: 'All Tasks',     categories: 'all' },
  { key: 'schedule',    label: 'Schedule',      categories: ['Schedule', 'Foundation', 'Framing', 'MEP', 'Finishes'] },
  { key: 'cashflow',    label: 'Cashflow',      categories: ['Cashflow Setup'] },
  { key: 'selections',  label: 'Selections',    categories: ['Selections'] },
  { key: 'safety',      label: 'Safety / QC',   categories: ['Safety/QC'] },
  { key: 'admin',       label: 'Administration',categories: ['Administration', 'Closing', 'Other'] },
];

function newId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

// ─── Task row ────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  allTasks,
  onEdit,
  onDelete,
}: {
  task: JobTask;
  allTasks: JobTask[];
  onEdit: (task: JobTask) => void;
  onDelete: (id: string) => void;
}) {
  const dependentTask = task.dependsOn ? allTasks.find(t => t.id === task.dependsOn) : null;
  const scheduleLabel = task.dateType === 'dependent' && dependentTask
    ? `${task.daysOffset >= 0 ? '+' : ''}${task.daysOffset}d after "${dependentTask.name}"`
    : `${task.daysOffset} days after start`;

  const assigneeLabel = ASSIGNEE_ROLES.find(r => r.value === task.assigneeRole)?.label;

  return (
    <div
      className="flex items-center gap-3 py-2.5 px-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 group cursor-pointer"
      onClick={() => onEdit(task)}
    >
      <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-800 truncate">{task.name}</span>
          {task.category && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide shrink-0">
              {task.category}
            </Badge>
          )}
          {(task.checklistCount ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
              <ListChecks className="w-3 h-3" />
              {task.checklistCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            {task.dateType === 'dependent' ? <Link2 className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
            {scheduleLabel}
          </span>
          {assigneeLabel && task.assigneeRole && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" /> {assigneeLabel}
            </span>
          )}
          {(task.tags?.length ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <Tag className="w-3 h-3" /> {task.tags!.length} tag{task.tags!.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onEdit(task); }}
        className="p-1.5 rounded text-gray-300 hover:text-gray-700 transition-colors"
      >
        <Edit3 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDelete(task.id); }}
        className="p-1.5 rounded text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Task edit modal ─────────────────────────────────────────────────────────

function TaskEditModal({
  open, task, allTasks, templateId, onClose,
}: {
  open: boolean;
  task: JobTask | null;
  allTasks: JobTask[];
  templateId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<JobTask | null>(task);
  const [tagInput, setTagInput] = useState('');
  const [checklistInput, setChecklistInput] = useState('');

  useEffect(() => {
    setDraft(task ? { ...task } : null);
    setTagInput('');
    setChecklistInput('');
  }, [task]);

  if (!draft) return null;

  const update = (patch: Partial<JobTask>) => setDraft({ ...draft, ...patch });

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    const tags = [...(draft.tags || []), t];
    update({ tags });
    setTagInput('');
  };

  const removeTag = (i: number) => {
    const tags = (draft.tags || []).filter((_, idx) => idx !== i);
    update({ tags });
  };

  const addChecklistItem = () => {
    const label = checklistInput.trim();
    if (!label) return;
    const item: ChecklistItem = { id: newId(), label, done: false };
    const checklist = [...(draft.checklist || []), item];
    update({ checklist, checklistCount: checklist.length });
    setChecklistInput('');
  };

  const removeChecklistItem = (id: string) => {
    const checklist = (draft.checklist || []).filter(i => i.id !== id);
    update({ checklist, checklistCount: checklist.length });
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast({ title: 'Task name required', variant: 'destructive' });
      return;
    }
    try {
      const { id, ...rest } = draft;
      await updateDoc(doc(db, 'templates', templateId, 'jobTasks', id), rest as any);
      toast({ title: 'Task saved' });
      onClose();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  // Tasks that can be picked as dependencies (exclude this task; would be a self-cycle)
  const depCandidates = allTasks.filter(t => t.id !== draft.id);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>Set scheduling, assignment, checklist items, and notifications.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="task-name">Name</Label>
            <Input id="task-name" value={draft.name} onChange={e => update({ name: e.target.value })} />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              rows={3}
              value={draft.description || ''}
              onChange={e => update({ description: e.target.value })}
              placeholder="What needs to happen for this task to be done?"
            />
          </div>

          {/* Category + Department */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={draft.category || ''} onValueChange={v => update({ category: v as TaskCategory })}>
                <SelectTrigger><SelectValue placeholder="— Choose —" /></SelectTrigger>
                <SelectContent>
                  {TASK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="task-dept">Department</Label>
              <Input
                id="task-dept"
                value={draft.department || ''}
                onChange={e => update({ department: e.target.value })}
                placeholder="e.g. Office, Field"
              />
            </div>
          </div>

          {/* Assignee */}
          <div>
            <Label>Default Assignee Role</Label>
            <Select
              value={draft.assigneeRole || ''}
              onValueChange={v => update({ assigneeRole: v as AssigneeRole })}
            >
              <SelectTrigger><SelectValue placeholder="— Unassigned —" /></SelectTrigger>
              <SelectContent>
                {ASSIGNEE_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400 mt-1">
              When this template is applied to a job, you'll map each role to a specific person.
            </p>
          </div>

          {/* Date Type */}
          <div>
            <Label>Schedule</Label>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => update({ dateType: 'fixed', dependsOn: undefined })}
                className={`flex-1 px-3 py-2 text-sm rounded border transition-colors ${
                  (draft.dateType || 'fixed') === 'fixed'
                    ? 'border-[#C9A96E] bg-[#FFF8E7] text-[#141414] font-medium'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                Date Based
              </button>
              <button
                type="button"
                onClick={() => update({ dateType: 'dependent' })}
                className={`flex-1 px-3 py-2 text-sm rounded border transition-colors ${
                  draft.dateType === 'dependent'
                    ? 'border-[#C9A96E] bg-[#FFF8E7] text-[#141414] font-medium'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Link2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                Schedule Item Based
              </button>
            </div>

            {draft.dateType === 'dependent' ? (
              <div className="mt-2 grid grid-cols-3 gap-2 items-end">
                <div className="col-span-1">
                  <Label htmlFor="dep-days" className="text-xs">Days after</Label>
                  <Input
                    id="dep-days"
                    type="number"
                    value={draft.daysOffset}
                    onChange={e => update({ daysOffset: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Linked task</Label>
                  <Select
                    value={draft.dependsOn || ''}
                    onValueChange={v => update({ dependsOn: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="— Pick a task —" /></SelectTrigger>
                    <SelectContent>
                      {depCandidates.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex items-end gap-2">
                <div className="w-32">
                  <Label htmlFor="fix-days" className="text-xs">Days after start</Label>
                  <Input
                    id="fix-days"
                    type="number"
                    value={draft.daysOffset}
                    onChange={e => update({ daysOffset: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <span className="text-xs text-gray-500 pb-2.5">days after the job start date</span>
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <Label>Tags</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Type a tag and press Enter"
              />
              <Button type="button" variant="outline" size="sm" onClick={addTag}>Add</Button>
            </div>
            {(draft.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {draft.tags!.map((t, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {t}
                    <button onClick={() => removeTag(i)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Checklist */}
          <div>
            <Label>Checklist</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={checklistInput}
                onChange={e => setChecklistInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                placeholder="Sub-item — press Enter to add"
              />
              <Button type="button" variant="outline" size="sm" onClick={addChecklistItem}>Add</Button>
            </div>
            {(draft.checklist?.length ?? 0) > 0 && (
              <div className="mt-2 space-y-1 border rounded-lg p-2 bg-gray-50">
                {draft.checklist!.map(item => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <Check className="w-3.5 h-3.5 text-gray-300" />
                    <span className="flex-1">{item.label}</span>
                    <button onClick={() => removeChecklistItem(item.id)} className="text-gray-300 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
            <Label className="flex items-center gap-1.5 text-blue-900">
              <Bell className="w-3.5 h-3.5" /> Notifications
            </Label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm text-blue-900">
                <input
                  type="checkbox"
                  checked={!!draft.notifyOnAssign}
                  onChange={e => update({ notifyOnAssign: e.target.checked })}
                />
                Notify assignee when task is assigned
              </label>
              <label className="flex items-center gap-2 text-sm text-blue-900">
                <input
                  type="checkbox"
                  checked={!!draft.notifyOnDue}
                  onChange={e => update({ notifyOnDue: e.target.checked })}
                />
                Notify on the due date
              </label>
              <label className="flex items-center gap-2 text-sm text-blue-900">
                <input
                  type="checkbox"
                  checked={!!draft.notifyOnComplete}
                  onChange={e => update({ notifyOnComplete: e.target.checked })}
                />
                Notify GC when marked complete
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} className="text-white" style={{ backgroundColor: '#C9A96E' }}>
            Save Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Apply-template-to-job modal ─────────────────────────────────────────────

function ApplyToJobModal({
  open, templateId, tasks, onClose,
}: {
  open: boolean;
  templateId: string;
  tasks: JobTask[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'projects'), orderBy('name')));
        setProjects(snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name || 'Untitled' })));
      } catch {}
    })();
  }, [open]);

  const apply = async () => {
    if (!selectedProjectId) {
      toast({ title: 'Pick a project first', variant: 'destructive' });
      return;
    }
    if (!startDate) {
      toast({ title: 'Pick a start date', variant: 'destructive' });
      return;
    }
    setApplying(true);
    try {
      // Compute due dates in topological order (dependents resolve after their parents)
      const start = new Date(startDate);
      const dueByTaskId = new Map<string, Date>();
      const tasksById = new Map(tasks.map(t => [t.id, t]));

      const resolveDue = (task: JobTask, visiting = new Set<string>()): Date => {
        if (dueByTaskId.has(task.id)) return dueByTaskId.get(task.id)!;
        if (visiting.has(task.id)) {
          // Cycle — fall back to fixed offset to avoid infinite loop
          const d = new Date(start);
          d.setDate(d.getDate() + task.daysOffset);
          return d;
        }
        visiting.add(task.id);
        let due: Date;
        if (task.dateType === 'dependent' && task.dependsOn && tasksById.has(task.dependsOn)) {
          const parentDue = resolveDue(tasksById.get(task.dependsOn)!, visiting);
          due = new Date(parentDue);
          due.setDate(due.getDate() + (task.daysOffset || 0));
        } else {
          due = new Date(start);
          due.setDate(due.getDate() + (task.daysOffset || 0));
        }
        visiting.delete(task.id);
        dueByTaskId.set(task.id, due);
        return due;
      };

      const batch = writeBatch(db);
      const tasksCol = collection(db, 'tasks');

      for (const task of tasks) {
        const due = resolveDue(task);
        const newTaskRef = doc(tasksCol);
        batch.set(newTaskRef, {
          name: task.name,
          description: task.description || '',
          projectId: selectedProjectId,
          category: task.category || 'Other',
          assigneeRole: task.assigneeRole || '',
          tags: task.tags || [],
          dueDate: due.toISOString().slice(0, 10),
          startDate: startDate,
          status: 'todo',
          priority: 'medium',
          checklist: task.checklist || [],
          notifyOnAssign: !!task.notifyOnAssign,
          notifyOnDue: !!task.notifyOnDue,
          notifyOnComplete: !!task.notifyOnComplete,
          sourceTemplateId: templateId,
          sourceTaskId: task.id,
          createdAt: serverTimestamp(),
          visibleToClient: task.assigneeRole === 'client',
        });
      }

      await batch.commit();

      // Summary notification to the applier
      if (user) {
        const userId = user.id?.toString() || user.email || '';
        const projName = projects.find(p => p.id === selectedProjectId)?.name || 'project';
        const tasksWithNotify = tasks.filter(t => t.notifyOnAssign).length;
        await createNotificationsBatch([{
          userId,
          kind: 'system',
          title: `Template applied to ${projName}`,
          body: `${tasks.length} tasks created (${tasksWithNotify} flagged for assign-time notifications). Open Tasks to assign each role to a specific person.`,
          link: `/projects/${selectedProjectId}/overview`,
          projectId: selectedProjectId,
          refType: 'task',
          fromUserName: 'System',
        }]);
      }

      toast({ title: `Applied! ${tasks.length} tasks created.` });
      onClose();
    } catch (e: any) {
      toast({ title: 'Apply failed', description: e.message, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply Template to Job</DialogTitle>
          <DialogDescription>
            Pick a project and start date. {tasks.length} tasks will be created with due dates calculated from the schedule rules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Project</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger><SelectValue placeholder="— Pick a project —" /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="start-date">Job Start Date</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              All "Date Based" tasks calculate their due date from this anchor.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={apply} disabled={applying} className="text-white gap-1.5" style={{ backgroundColor: '#22c55e' }}>
            <Send className="w-3.5 h-3.5" />
            {applying ? 'Applying…' : `Create ${tasks.length} Tasks`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main editor ─────────────────────────────────────────────────────────────

export function JobTemplateEditor({
  template,
  onBack,
}: {
  template: Template;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<JobTask[]>([]);
  const [templateName, setTemplateName] = useState(template.name);
  const [editingName, setEditingName] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [editingTask, setEditingTask] = useState<JobTask | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'templates', template.id, 'jobTasks'), orderBy('order', 'asc')),
      snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as JobTask))),
      () => {},
    );
    return () => unsub();
  }, [template.id]);

  useEffect(() => { if (editingName && nameRef.current) nameRef.current.focus(); }, [editingName]);

  const filteredTasks = useMemo(() => {
    const tab = FILTER_TABS.find(t => t.key === activeFilter);
    if (!tab || tab.categories === 'all') return tasks;
    const cats = new Set(tab.categories);
    return tasks.filter(t => t.category && cats.has(t.category));
  }, [tasks, activeFilter]);

  const taskCountByFilter = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of FILTER_TABS) {
      if (f.categories === 'all') counts[f.key] = tasks.length;
      else {
        const cats = new Set(f.categories);
        counts[f.key] = tasks.filter(t => t.category && cats.has(t.category)).length;
      }
    }
    return counts;
  }, [tasks]);

  async function addTask() {
    try {
      await addDoc(collection(db, 'templates', template.id, 'jobTasks'), {
        name: 'New Task',
        daysOffset: 0,
        dateType: 'fixed',
        checklist: [],
        checklistCount: 0,
        order: tasks.length,
        createdAt: serverTimestamp(),
      });
    } catch {
      toast({ title: 'Error adding task', variant: 'destructive' });
    }
  }

  async function deleteTask(id: string) {
    try {
      await deleteDoc(doc(db, 'templates', template.id, 'jobTasks', id));
    } catch {
      toast({ title: 'Error deleting task', variant: 'destructive' });
    }
  }

  async function saveTemplateName() {
    if (!templateName.trim()) return setTemplateName(template.name);
    try {
      await updateDoc(doc(db, 'templates', template.id), { name: templateName.trim() });
    } catch {
      toast({ title: 'Error updating name', variant: 'destructive' });
    }
    setEditingName(false);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            Job Templates
          </button>
          <span className="text-gray-300">/</span>
          {editingName ? (
            <input
              ref={nameRef}
              className="text-xl font-bold text-gray-900 bg-transparent border-b-2 border-[#C9A96E] outline-none px-1"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              onBlur={saveTemplateName}
              onKeyDown={e => { if (e.key === 'Enter') saveTemplateName(); if (e.key === 'Escape') { setTemplateName(template.name); setEditingName(false); } }}
            />
          ) : (
            <h1
              className="text-xl font-bold text-gray-900 cursor-pointer hover:text-[#C9A96E] transition-colors"
              onClick={() => setEditingName(true)}
              title="Click to rename"
            >
              {templateName}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={addTask} className="gap-2 text-white" style={{ backgroundColor: '#22c55e' }}>
            <Plus className="w-4 h-4" /> Task
          </Button>
          <Button
            onClick={() => setApplyOpen(true)}
            disabled={tasks.length === 0}
            className="gap-2 text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            <Send className="w-4 h-4" /> Apply to Job
          </Button>
          <Button variant="outline" className="gap-2">
            <Settings className="w-4 h-4" /> Settings
          </Button>
        </div>
      </div>

      {/* Filter tab bar */}
      <div className="flex gap-0 border-b border-gray-200 mt-4 overflow-x-auto">
        {FILTER_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveFilter(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              activeFilter === t.key
                ? 'border-[#C9A96E] text-[#C9A96E]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">{taskCountByFilter[t.key] ?? 0}</Badge>
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-auto mt-4">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              {tasks.length === 0 ? 'No tasks yet' : 'No tasks in this category'}
            </p>
            <p className="text-sm mt-1">
              {tasks.length === 0 ? 'Click "+ Task" to add the first one' : 'Try the All Tasks tab'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
              <div className="w-4 shrink-0" />
              <div className="flex-1">Task / Schedule / Assignee</div>
              <div className="w-16 text-right">Actions</div>
            </div>
            {filteredTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                allTasks={tasks}
                onEdit={t => setEditingTask(t)}
                onDelete={deleteTask}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <TaskEditModal
        open={!!editingTask}
        task={editingTask}
        allTasks={tasks}
        templateId={template.id}
        onClose={() => setEditingTask(null)}
      />
      <ApplyToJobModal
        open={applyOpen}
        templateId={template.id}
        tasks={tasks}
        onClose={() => setApplyOpen(false)}
      />
    </div>
  );
}
