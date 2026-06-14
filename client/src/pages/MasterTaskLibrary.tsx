// ─────────────────────────────────────────────────────────────────────────────
// Master Task Library — admin page (/master-tasks)
//
// The company's single editable playbook of TEMPLATES. Admins view, filter, add,
// edit, archive, and reorder tasks here. Edits affect FUTURE project generations
// only — never live projects (system rule §8). Reads come live from Firestore;
// mutations go through the taskLibrary API.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus,
  Search,
  Pencil,
  Archive,
  ArchiveRestore,
  ArrowUp,
  ArrowDown,
  GripVertical,
  ClipboardList,
  Camera,
  DollarSign,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  TASK_PHASES,
  PHASE_ORDER,
  TASK_ROLES,
  SUGGESTED_TAGS,
  type MasterTask,
  type TaskPhase,
} from '@shared/taskLibrary-types';
import { MasterTaskModal } from '@/components/taskLibrary/MasterTaskModal';
import { AudienceBadges, AudienceLegend } from '@/components/taskLibrary/AudienceBadges';
import {
  archiveMasterTask,
  unarchiveMasterTask,
  reorderMasterTasks,
  seedMasterLibrary,
} from '@/lib/taskLibrary/api';

export default function MasterTaskLibrary() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<MasterTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [reqFilter, setReqFilter] = useState('all'); // all | required | optional
  const [inspectionOnly, setInspectionOnly] = useState(false);
  const [drawOnly, setDrawOnly] = useState(false);
  const [clientVisibleOnly, setClientVisibleOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MasterTask | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'masterTasks'), orderBy('order', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as MasterTask[]);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (!showArchived && t.archivedAt) return false;
      if (showArchived && !t.archivedAt) return false;
      if (phaseFilter !== 'all' && t.phase !== phaseFilter) return false;
      if (roleFilter !== 'all' && t.recommendedRole !== roleFilter && t.defaultAssigneeRole !== roleFilter) return false;
      if (tagFilter !== 'all' && !(t.tags || []).includes(tagFilter)) return false;
      if (reqFilter === 'required' && t.isRequired === false) return false;
      if (reqFilter === 'optional' && t.isRequired !== false) return false;
      if (inspectionOnly && !t.inspectionRequired) return false;
      if (drawOnly && !t.drawMilestoneRelevant) return false;
      if (clientVisibleOnly && !t.clientVisible) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !t.title?.toLowerCase().includes(s) &&
          !t.taskCode?.toLowerCase().includes(s) &&
          !t.description?.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [tasks, showArchived, phaseFilter, roleFilter, tagFilter, reqFilter, inspectionOnly, drawOnly, clientVisibleOnly, search]);

  // Group filtered tasks by phase, ordered by lifecycle then `order`.
  const grouped = useMemo(() => {
    const map = new Map<TaskPhase, MasterTask[]>();
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

  const activeCount = tasks.filter((t) => !t.archivedAt).length;

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const r = await seedMasterLibrary();
      toast({ title: 'Baseline template loaded', description: `${r.created} tasks added.` });
    } catch (e: any) {
      toast({ title: 'Seed failed', description: e.message, variant: 'destructive' });
    } finally {
      setSeeding(false);
    }
  };

  const handleArchive = async (t: MasterTask) => {
    try {
      if (t.archivedAt) {
        await unarchiveMasterTask(t.id);
        toast({ title: 'Task restored' });
      } else {
        await archiveMasterTask(t.id);
        toast({ title: 'Task archived', description: 'It will not be copied into new projects.' });
      }
    } catch (e: any) {
      toast({ title: 'Action failed', description: e.message, variant: 'destructive' });
    }
  };

  // Persist a new within-phase ordering (shared by arrows + drag-and-drop).
  const persistOrder = async (reordered: MasterTask[]) => {
    try {
      await reorderMasterTasks(reordered.map((t) => t.id));
    } catch (e: any) {
      toast({ title: 'Reorder failed', description: e.message, variant: 'destructive' });
    }
  };

  // Move a task up/down within its phase by swapping order with its neighbor.
  const handleMove = (phaseTasks: MasterTask[], index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= phaseTasks.length) return;
    const reordered = [...phaseTasks];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    persistOrder(reordered);
  };

  // Drag-and-drop reorder (grab the side handle). Same-phase only — the board
  // groups by phase, so dragging across phases is ignored (use Edit to change a
  // task's phase). Order is relative within a phase, matching the arrows.
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
    persistOrder(reordered);
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <ClipboardList className="h-7 w-7 text-[#C9A96E]" />
              Master Task Library
            </h1>
            <p className="text-gray-600 mt-1">
              The company's editable playbook for building a home. {activeCount} active task{activeCount === 1 ? '' : 's'}.
              Edits apply to future projects only.
            </p>
          </div>
          <div className="flex gap-2">
            {activeCount === 0 && (
              <Button variant="outline" onClick={handleSeed} disabled={seeding}>
                {seeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Load baseline template
              </Button>
            )}
            <Button
              className="bg-[#C9A96E] hover:bg-[#b8975c]"
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Task
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                className="pl-8"
                placeholder="Search title, code, description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <FilterSelect value={phaseFilter} onChange={setPhaseFilter} placeholder="All phases" options={TASK_PHASES as readonly string[]} />
            <FilterSelect value={roleFilter} onChange={setRoleFilter} placeholder="All roles" options={TASK_ROLES as readonly string[]} />
            <FilterSelect value={tagFilter} onChange={setTagFilter} placeholder="All tags" options={SUGGESTED_TAGS as readonly string[]} />
            <Select value={reqFilter} onValueChange={setReqFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Required & optional</SelectItem>
                <SelectItem value="required">Required only</SelectItem>
                <SelectItem value="optional">Optional only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <ToggleFilter label="Inspection" checked={inspectionOnly} onChange={setInspectionOnly} />
            <ToggleFilter label="Draw milestone" checked={drawOnly} onChange={setDrawOnly} />
            <ToggleFilter label="Client visible" checked={clientVisibleOnly} onChange={setClientVisibleOnly} />
            <ToggleFilter label="Show archived" checked={showArchived} onChange={setShowArchived} />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading library…
          </div>
        ) : activeCount === 0 && !showArchived ? (
          <EmptyState onSeed={handleSeed} seeding={seeding} onAdd={() => { setEditing(null); setModalOpen(true); }} />
        ) : grouped.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No tasks match your filters.</div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="space-y-6">
              <AudienceLegend />
              {grouped.map(([phase, phaseTasks]) => (
                <div key={phase} className="bg-white border rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#141414] text-white flex items-center justify-between">
                    <h2 className="font-semibold">{phase}</h2>
                    <span className="text-xs text-slate-300">{phaseTasks.length} task{phaseTasks.length === 1 ? '' : 's'}</span>
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
                                className={`px-4 py-3 flex items-start gap-2 bg-white hover:bg-gray-50 ${
                                  snapshot.isDragging ? 'shadow-lg ring-1 ring-[#C9A96E]' : ''
                                }`}
                              >
                                {/* Drag handle — grab the side to reorder */}
                                <div
                                  {...dragProvided.dragHandleProps}
                                  title="Drag to reorder"
                                  className="pt-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </div>
                                {/* Up/down arrows (keyboard / no-mouse alternative) */}
                                <div className="flex flex-col gap-0.5 pt-1">
                                  <button
                                    onClick={() => handleMove(phaseTasks, i, -1)}
                                    disabled={i === 0}
                                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleMove(phaseTasks, i, 1)}
                                    disabled={i === phaseTasks.length - 1}
                                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <code className="text-xs text-gray-400">{t.taskCode}</code>
                                    <span className="font-medium">{t.title}</span>
                                    <TaskBadges task={t} />
                                  </div>
                                  {t.description && (
                                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>
                                  )}
                                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                    <AudienceBadges task={t} size="xs" />
                                    {(t.tags || []).map((tag) => (
                                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => { setEditing(t); setModalOpen(true); }}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleArchive(t)}>
                                    {t.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                                  </Button>
                                </div>
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
      </div>

      <MasterTaskModal open={modalOpen} onClose={() => setModalOpen(false)} task={editing} />
    </AppLayout>
  );
}

function FilterSelect({
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
      <SelectTrigger className="w-[170px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
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

export function TaskBadges({ task }: { task: MasterTask }) {
  return (
    <span className="flex items-center gap-1 flex-wrap">
      {task.isRequired !== false ? (
        <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">Required</Badge>
      ) : (
        <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-[10px] px-1.5 py-0">Optional</Badge>
      )}
      {task.qualityGate && (
        <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0 gap-0.5">
          <ShieldCheck className="h-2.5 w-2.5" /> Gate
        </Badge>
      )}
      {task.inspectionRequired && (
        <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 text-[10px] px-1.5 py-0">Inspection</Badge>
      )}
      {task.drawMilestoneRelevant && (
        <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0 gap-0.5">
          <DollarSign className="h-2.5 w-2.5" /> Draw
        </Badge>
      )}
      {task.requiredPhotos > 0 && (
        <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-[10px] px-1.5 py-0 gap-0.5">
          <Camera className="h-2.5 w-2.5" /> {task.requiredPhotos}
        </Badge>
      )}
    </span>
  );
}

function EmptyState({ onSeed, seeding, onAdd }: { onSeed: () => void; seeding: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ClipboardList className="h-14 w-14 text-gray-300 mb-4" />
      <h3 className="text-lg font-semibold text-gray-700">Your library is empty</h3>
      <p className="text-sm text-gray-500 mb-5 max-w-md">
        Load the baseline custom-home process template to get started, or add your first task manually.
      </p>
      <div className="flex gap-3">
        <Button className="bg-[#C9A96E] hover:bg-[#b8975c]" onClick={onSeed} disabled={seeding}>
          {seeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Load baseline template
        </Button>
        <Button variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" /> Add task manually
        </Button>
      </div>
    </div>
  );
}
