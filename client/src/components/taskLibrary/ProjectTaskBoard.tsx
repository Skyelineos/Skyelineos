// ─────────────────────────────────────────────────────────────────────────────
// Project Task Board — grouped-by-phase view of a project's task list
//
// Reads projectTasks live from Firestore. Filter by role/status/phase/inspection/
// visibility. Click a task to open the detail drawer. Add project-specific custom
// tasks. Shows a progress summary across all tasks.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus,
  Sparkles,
  Search,
  Camera,
  ShieldCheck,
  DollarSign,
  Calendar,
  AlertTriangle,
  GripVertical,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  TASK_PHASES,
  PHASE_ORDER,
  TASK_ROLES,
  PROJECT_TASK_STATUSES,
  STATUS_BADGE_CLASS,
  PRIORITY_BADGE_CLASS,
  type ProjectTask,
  type TaskPhase,
} from '@shared/taskLibrary-types';
import { ProjectTaskDrawer } from './ProjectTaskDrawer';
import { AudienceBadges, AudienceLegend } from './AudienceBadges';
import { addCustomProjectTask, reorderProjectTasks } from '@/lib/taskLibrary/api';

interface Props {
  projectId: string;
  onRequestGenerate: () => void;
}

export function ProjectTaskBoard({ projectId, onRequestGenerate }: Props) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [inspectionOnly, setInspectionOnly] = useState(false);
  const [clientVisibleOnly, setClientVisibleOnly] = useState(false);
  const [subVisibleOnly, setSubVisibleOnly] = useState(false);

  const [selected, setSelected] = useState<ProjectTask | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'projectTasks'), where('projectId', '==', projectId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ProjectTask[]);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [projectId]);

  // Keep the open drawer's task in sync with live data.
  useEffect(() => {
    if (selected) {
      const fresh = tasks.find((t) => t.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (roleFilter !== 'all' && t.assignedRole !== roleFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (phaseFilter !== 'all' && t.phase !== phaseFilter) return false;
      if (inspectionOnly && !t.inspectionRequired) return false;
      if (clientVisibleOnly && !t.clientVisible) return false;
      if (subVisibleOnly && !t.subcontractorVisible) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!t.title?.toLowerCase().includes(s) && !t.taskCode?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [tasks, roleFilter, statusFilter, phaseFilter, inspectionOnly, clientVisibleOnly, subVisibleOnly, search]);

  const grouped = useMemo(() => {
    const map = new Map<TaskPhase, ProjectTask[]>();
    for (const t of filtered) {
      const arr = map.get(t.phase as TaskPhase) || [];
      arr.push(t);
      map.set(t.phase as TaskPhase, arr);
    }
    map.forEach((arr) => arr.sort((a, b) => (a.order || 0) - (b.order || 0)));
    return Array.from(map.entries()).sort(
      (a, b) => (PHASE_ORDER[a[0]] ?? 99) - (PHASE_ORDER[b[0]] ?? 99),
    );
  }, [filtered]);

  const completed = tasks.filter((t) => t.status === 'Complete').length;
  const skipped = tasks.filter((t) => t.status === 'Skipped').length;
  const blocked = tasks.filter((t) => t.status === 'Blocked').length;
  const denom = tasks.length - skipped;
  const pct = denom > 0 ? Math.round((100 * completed) / denom) : 0;

  const openTask = (t: ProjectTask) => {
    setSelected(t);
    setDrawerOpen(true);
  };

  // Drag-and-drop reorder within a phase (grab the side handle). Same-phase only
  // — order is relative within a phase. Persists via the batch reorder endpoint.
  const handleDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId !== destination.droppableId) return;
    if (source.index === destination.index) return;
    const entry = grouped.find(([phase]) => phase === source.droppableId);
    if (!entry) return;
    const reordered = [...entry[1]];
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);
    reorderProjectTasks(projectId, reordered.map((t) => t.id)).catch((e: any) =>
      toast({ title: 'Reorder failed', description: e.message, variant: 'destructive' }),
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading tasks…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Progress summary */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-gray-700">
            {completed} of {denom} complete{skipped > 0 ? ` · ${skipped} skipped` : ''}
            {blocked > 0 ? ` · ${blocked} blocked` : ''}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onRequestGenerate}>
              <Sparkles className="h-4 w-4 mr-1.5" /> Generate from Master
            </Button>
            <Button size="sm" className="bg-[#C9A96E] hover:bg-[#b8975c]" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Task
            </Button>
          </div>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input className="pl-8" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <BoardSelect value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" options={PROJECT_TASK_STATUSES as readonly string[]} />
        <BoardSelect value={phaseFilter} onChange={setPhaseFilter} placeholder="All phases" options={TASK_PHASES as readonly string[]} />
        <BoardSelect value={roleFilter} onChange={setRoleFilter} placeholder="All roles" options={TASK_ROLES as readonly string[]} />
      </div>
      <div className="flex flex-wrap gap-4 text-sm -mt-2">
        <ToggleFilter label="Inspection" checked={inspectionOnly} onChange={setInspectionOnly} />
        <ToggleFilter label="Client visible" checked={clientVisibleOnly} onChange={setClientVisibleOnly} />
        <ToggleFilter label="Sub visible" checked={subVisibleOnly} onChange={setSubVisibleOnly} />
      </div>

      <AudienceLegend />

      {/* Board */}
      {grouped.length === 0 ? (
        <div className="text-center py-16 text-gray-500">No tasks match your filters.</div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="space-y-5">
            {grouped.map(([phase, phaseTasks]) => (
              <div key={phase} className="bg-white border rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-[#141414] text-white flex items-center justify-between">
                  <h2 className="font-semibold text-sm">{phase}</h2>
                  <span className="text-xs text-slate-300">
                    {phaseTasks.filter((t) => t.status === 'Complete').length}/{phaseTasks.length}
                  </span>
                </div>
                <Droppable droppableId={phase}>
                  {(dropProvided) => (
                    <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="divide-y">
                      {phaseTasks.map((t, i) => (
                        <Draggable key={t.id} draggableId={t.id} index={i}>
                          {(dragProvided, snapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={`px-3 py-3 flex items-center gap-2 bg-white hover:bg-gray-50 ${
                                snapshot.isDragging ? 'shadow-lg ring-1 ring-[#C9A96E]' : ''
                              }`}
                            >
                              {/* Drag handle — grab the side to reorder */}
                              <div
                                {...dragProvided.dragHandleProps}
                                title="Drag to reorder"
                                className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0"
                              >
                                <GripVertical className="h-4 w-4" />
                              </div>
                              {/* Clickable content opens the detail drawer */}
                              <button onClick={() => openTask(t)} className="flex-1 min-w-0 text-left">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <code className="text-[11px] text-gray-400">{t.taskCode}</code>
                                  <span className="font-medium text-sm">{t.title}</span>
                                  {t.isCustomTask && (
                                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">Custom</Badge>
                                  )}
                                  {t.qualityGate && <ShieldCheck className="h-3.5 w-3.5 text-purple-500" />}
                                  {t.inspectionRequired && (
                                    <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 text-[10px] px-1.5 py-0">
                                      {t.inspectionStatus?.replace(/_/g, ' ')}
                                    </Badge>
                                  )}
                                  {t.drawMilestoneRelevant && <DollarSign className="h-3.5 w-3.5 text-green-500" />}
                                  {t.requiredPhotos > 0 && (
                                    <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                      <Camera className="h-3 w-3" />
                                      {(t.uploadedPhotos || []).length}/{t.requiredPhotos}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                                  <span>{t.assignedRole}</span>
                                  {t.dueDate && (
                                    <span className="flex items-center gap-0.5">
                                      <Calendar className="h-3 w-3" /> {t.dueDate}
                                    </span>
                                  )}
                                  {t.status === 'Blocked' && (
                                    <span className="flex items-center gap-0.5 text-red-500">
                                      <AlertTriangle className="h-3 w-3" /> blocked
                                    </span>
                                  )}
                                  <AudienceBadges task={t} size="xs" />
                                </div>
                              </button>
                              <Badge variant="outline" className={`${PRIORITY_BADGE_CLASS[t.priority]} text-[10px] px-1.5 py-0 border-0`}>
                                {t.priority}
                              </Badge>
                              <Badge variant="outline" className={`${STATUS_BADGE_CLASS[t.status]} text-[11px] whitespace-nowrap`}>
                                {t.status}
                              </Badge>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {dropProvided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}

      <ProjectTaskDrawer
        projectId={projectId}
        task={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <AddCustomTaskModal
        projectId={projectId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => toast({ title: 'Custom task added' })}
      />
    </div>
  );
}

function BoardSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: readonly string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ToggleFilter({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer text-gray-600">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      {label}
    </label>
  );
}

function AddCustomTaskModal({
  projectId,
  open,
  onClose,
  onAdded,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<string>(TASK_PHASES[1]);
  const [assignedRole, setAssignedRole] = useState('gc');
  const [dueDate, setDueDate] = useState('');
  const [clientVisible, setClientVisible] = useState(false);
  const [subVisible, setSubVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle('');
    setDescription('');
    setPhase(TASK_PHASES[1]);
    setAssignedRole('gc');
    setDueDate('');
    setClientVisible(false);
    setSubVisible(false);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await addCustomProjectTask(projectId, {
        title,
        description,
        phase,
        assignedRole,
        dueDate: dueDate || null,
        clientVisible,
        subcontractorVisible: subVisible,
      });
      onAdded();
      reset();
      onClose();
    } catch (e: any) {
      toast({ title: 'Add failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Custom Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phase</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PHASES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Assigned Role</Label>
              <Select value={assignedRole} onValueChange={setAssignedRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="flex gap-4 text-sm pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox checked={clientVisible} onCheckedChange={(v) => setClientVisible(!!v)} /> Client visible
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox checked={subVisible} onCheckedChange={(v) => setSubVisible(!!v)} /> Sub visible
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#C9A96E] hover:bg-[#b8975c]">
            {saving ? 'Adding…' : 'Add Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
