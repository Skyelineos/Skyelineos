import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { createNotification } from '@/lib/notifications';
import { getDefaultAssigneeForTask, inferTaskKindFromTitle } from '@/lib/taskDefaults';
import {
  Plus, Search, CheckSquare, MoreVertical, Edit, Trash2, Calendar, User, List, LayoutGrid
} from 'lucide-react';

type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

interface Task {
  id: string;
  title: string;
  description?: string;
  projectId?: string;
  projectName?: string;
  assignedToId?: string;
  assignedToName?: string;
  // Creator — needed by the "Created by me" quick-filter and so we can
  // skip self-assignment notifications (don't notify yourself).
  createdById?: string;
  createdByName?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  // Workflow category — used by the "Kanban by category" view (mirrors
  // Jack's Sales / Administration / Pre Site / Site / Client board).
  category?: TaskCategory;
  createdAt?: unknown;
  updatedAt?: unknown;
}

type TaskCategory = 'uncategorized' | 'sales' | 'administration' | 'pre_site' | 'site' | 'client';
const CATEGORY_ORDER: TaskCategory[] = ['uncategorized', 'sales', 'administration', 'pre_site', 'site', 'client'];
const CATEGORY_LABEL: Record<TaskCategory, string> = {
  uncategorized: 'Uncategorized',
  sales:         'Sales',
  administration: 'Administration',
  pre_site:      'Pre Site',
  site:          'Site',
  client:        'Client',
};
const CATEGORY_COLOR: Record<TaskCategory, string> = {
  uncategorized: '#94a3b8',
  sales:         '#0ea5e9',
  administration: '#0ea5e9',
  pre_site:      '#ef4444',
  site:          '#ef4444',
  client:        '#22c55e',
};

interface Project {
  id: string;
  name: string;
}

interface AppUser {
  id: string;
  name: string;
  role?: string;
}

type TaskFormData = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

const defaultForm = (): TaskFormData => ({
  title: '',
  description: '',
  projectId: '',
  projectName: '',
  assignedToId: '',
  assignedToName: '',
  status: 'todo',
  priority: 'medium',
  dueDate: '',
  category: 'uncategorized',
});

const STATUS_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
  { key: 'blocked', label: 'Blocked' }
];

function statusBadgeClass(status: TaskStatus): string {
  switch (status) {
    case 'todo': return 'bg-gray-100 text-gray-700';
    case 'in_progress': return 'bg-blue-100 text-blue-700';
    case 'done': return 'bg-green-100 text-green-700';
    case 'blocked': return 'bg-red-100 text-red-700';
  }
}

function priorityBadgeClass(priority: TaskPriority): string {
  switch (priority) {
    case 'low': return 'bg-gray-100 text-gray-600';
    case 'medium': return 'bg-yellow-100 text-yellow-700';
    case 'high': return 'bg-orange-100 text-orange-700';
    case 'urgent': return 'bg-red-100 text-red-700';
  }
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function Tasks() {
  return (
    <AppLayout>
      <TasksContent />
    </AppLayout>
  );
}

// Layout-agnostic body — renders inside whichever layout the caller provides.
// When `projectId` is set, scopes everything to that project: filters, hides
// the project picker, prefills new-task form, and drops the project badge.
export function TasksContent({ projectId: scopedProjectId }: { projectId?: string } = {}) {
  const { toast } = useToast();
  const { user } = useAuth();
  // Current-user identifiers for the "Assigned to me" / "Created by me"
  // quick-filters. We can't fully resolve a sub's contact id here, but for
  // GC/admin (the most common user of the Tasks page) `user.id` and the
  // assignedToId on tasks both come from the same user-doc id space.
  const meId = user?.id?.toString() || '';
  const meName = user?.name || '';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [viewMode, setViewMode] = useState<'kanban' | 'kanban_category' | 'list'>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  // Quick-filter chip — one-of {none, mine, by_me, unassigned, week, overdue}.
  // Layered on top of the status/priority/project dropdowns, so the user can
  // drill in further once a chip is active.
  type QuickFilter = 'none' | 'mine' | 'by_me' | 'unassigned' | 'week' | 'overdue';
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('none');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<TaskFormData>(defaultForm());
  const [isSaving, setIsSaving] = useState(false);

  // Subscribe to tasks
  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
      setIsLoading(false);
    }, () => setIsLoading(false));
    return unsub;
  }, []);

  // Subscribe to projects
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'projects'), (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, name: (d.data() as { name: string }).name })));
    });
    return unsub;
  }, []);

  // Subscribe to users
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => {
        const data = d.data() as { name: string; role?: string };
        return { id: d.id, name: data.name, role: data.role };
      }));
    });
    return unsub;
  }, []);

  const openAddDialog = async () => {
    setEditingTask(null);
    const base = defaultForm();
    if (scopedProjectId) {
      const proj = projects.find(p => p.id === scopedProjectId);
      base.projectId = scopedProjectId;
      base.projectName = proj?.name || '';
    }
    // Open the dialog immediately for snappy UX, then resolve the default
    // assignee and patch it in. If the user already started typing, we
    // patch only the assignee field so we don't clobber their edits.
    setFormData(base);
    setDialogOpen(true);
    if (base.projectId) {
      try {
        const def = await getDefaultAssigneeForTask({
          projectId: base.projectId,
          defaultFallbackUserId: meId,
          defaultFallbackUserName: meName,
        });
        if (def.assignedToId) {
          setFormData(prev => prev.assignedToId
            ? prev   // user already picked someone — don't clobber
            : { ...prev, assignedToId: def.assignedToId, assignedToName: def.assignedToName });
        }
      } catch (e) {
        console.warn('[tasks] default-assignee resolve failed', e);
      }
    } else if (meId) {
      // No project context — default to the current user (most likely the GC).
      setFormData(prev => prev.assignedToId
        ? prev
        : { ...prev, assignedToId: meId, assignedToName: meName });
    }
  };

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      projectId: task.projectId || '',
      projectName: task.projectName || '',
      assignedToId: task.assignedToId || '',
      assignedToName: task.assignedToName || '',
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate || '',
      // Bugfix: category was dropped on every edit — defaulting back to
      // 'uncategorized' on save. Carry it through now.
      category: task.category || 'uncategorized',
    });
    setDialogOpen(true);
  };

  const handleProjectChange = (projectId: string) => {
    const proj = projects.find(p => p.id === projectId);
    setFormData(prev => ({ ...prev, projectId, projectName: proj?.name || '' }));
  };

  const handleAssigneeChange = (userId: string) => {
    const user = users.find(u => u.id === userId);
    setFormData(prev => ({ ...prev, assignedToId: userId, assignedToName: user?.name || '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    setIsSaving(true);
    try {
      if (editingTask) {
        // Detect a re-assignment so we can notify the new assignee. Only
        // fires when the assigneeId actually changed AND it's not the
        // current user assigning to themselves.
        const reassigned = formData.assignedToId
          && formData.assignedToId !== editingTask.assignedToId
          && formData.assignedToId !== meId;
        await updateDoc(doc(db, 'tasks', editingTask.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        if (reassigned && formData.assignedToId) {
          await createNotification({
            userId: formData.assignedToId,
            kind: 'task_assigned',
            title: `Task assigned to you: ${formData.title}`,
            body: formData.description || (formData.projectName ? `Project: ${formData.projectName}` : ''),
            link: '/tasks',
            projectId: formData.projectId || undefined,
            refType: 'task',
            refId: editingTask.id,
            fromUserId: meId,
            fromUserName: meName,
          });
        }
        toast({ title: 'Task updated' });
      } else {
        const ref = await addDoc(collection(db, 'tasks'), {
          ...formData,
          createdById: meId || null,
          createdByName: meName || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        // Notify the assignee on creation unless self-assigned.
        if (formData.assignedToId && formData.assignedToId !== meId) {
          await createNotification({
            userId: formData.assignedToId,
            kind: 'task_assigned',
            title: `Task assigned to you: ${formData.title}`,
            body: formData.description || (formData.projectName ? `Project: ${formData.projectName}` : ''),
            link: '/tasks',
            projectId: formData.projectId || undefined,
            refType: 'task',
            refId: ref.id,
            fromUserId: meId,
            fromUserName: meName,
          });
        }
        toast({ title: 'Task created' });
      }
      setDialogOpen(false);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save task',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (taskId: string) => {
    // Native confirm() flagged by audit doc #7 — keeping for now to avoid
    // pulling AlertDialog into this file mid-batch. Migrated wholesale in
    // the upcoming #7 sweep.
    if (!confirm('Delete this task?')) return;
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
      toast({ title: 'Task deleted' });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete task',
        variant: 'destructive'
      });
    }
  };

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), { status, updatedAt: serverTimestamp() });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update status',
        variant: 'destructive'
      });
    }
  };

  // Filtering
  const todayYMD = new Date().toISOString().slice(0, 10);
  // End-of-week: rolling 7-day window from today. Simpler than week-of-year
  // math and matches how the dashboard "this week" buckets work elsewhere.
  const endOfWeekYMD = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const filteredTasks = tasks.filter(t => {
    const matchSearch = searchTerm === '' ||
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.projectName && t.projectName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.assignedToName && t.assignedToName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchScoped = !scopedProjectId || t.projectId === scopedProjectId;
    const matchProject = projectFilter === 'all' || t.projectId === projectFilter;

    // Quick-filter chip — layered on top of the dropdown filters. Each chip
    // is a one-of (no multi-select) to keep the mental model simple.
    let matchQuick = true;
    switch (quickFilter) {
      case 'mine':
        matchQuick = !!meId && t.assignedToId === meId;
        break;
      case 'by_me':
        matchQuick = !!meId && t.createdById === meId;
        break;
      case 'unassigned':
        matchQuick = !t.assignedToId;
        break;
      case 'week':
        // Due in the next 7 days, not yet done.
        matchQuick = !!t.dueDate && t.dueDate >= todayYMD && t.dueDate <= endOfWeekYMD && t.status !== 'done';
        break;
      case 'overdue':
        matchQuick = !!t.dueDate && t.dueDate < todayYMD && t.status !== 'done';
        break;
    }

    return matchScoped && matchSearch && matchStatus && matchPriority && matchProject && matchQuick;
  });

  const tasksByStatus = (status: TaskStatus) => filteredTasks.filter(t => t.status === status);
  const tasksByCategory = (cat: TaskCategory) => filteredTasks.filter(t => (t.category || 'uncategorized') === cat);

  return (
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckSquare className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Tasks</h1>
            <Badge variant="secondary" className="text-sm">{filteredTasks.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-2.5 py-1 text-xs ${viewMode === 'kanban' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                title="By status"
              >
                Status
              </button>
              <button
                onClick={() => setViewMode('kanban_category')}
                className={`px-2.5 py-1 text-xs border-l border-gray-200 ${viewMode === 'kanban_category' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                title="By category"
              >
                Category
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 text-xs border-l border-gray-200 ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                title="List"
              >
                List
              </button>
            </div>
            <Button
              onClick={openAddDialog}
              className="text-white"
              style={{ backgroundColor: '#C9A96E', borderColor: '#C9A96E' }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
          {!scopedProjectId && (
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Quick-filter chip row — one-of selection so the mental model
            stays simple. Tapping the active chip clears it back to 'none'. */}
        <div className="flex flex-wrap gap-2 -mt-2">
          {(
            [
              { key: 'mine',       label: 'Assigned to me' },
              { key: 'by_me',      label: 'Created by me' },
              { key: 'unassigned', label: 'Unassigned' },
              { key: 'week',       label: 'Due this week' },
              { key: 'overdue',    label: 'Overdue' },
            ] as { key: QuickFilter; label: string }[]
          ).map(chip => {
            const active = quickFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setQuickFilter(active ? 'none' : chip.key)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  active
                    ? 'bg-[#141414] text-white border-[#141414]'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#C9A96E] hover:text-[#141414]'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {STATUS_COLUMNS.map(col => (
              <Card key={col.key}>
                <CardHeader><CardTitle className="text-sm">{col.label}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {[1, 2].map(i => (
                    <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : viewMode === 'kanban' ? (
          /* Kanban by Status */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {STATUS_COLUMNS.map(col => {
              const colTasks = tasksByStatus(col.key);
              return (
                <div key={col.key} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-semibold text-sm text-gray-700">{col.label}</h3>
                    <Badge variant="secondary" className="text-xs">{colTasks.length}</Badge>
                  </div>
                  <div className="space-y-2 min-h-[200px]">
                    {colTasks.length === 0 ? (
                      <div className="h-20 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-sm text-gray-400">
                        No tasks
                      </div>
                    ) : (
                      colTasks.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onEdit={openEditDialog}
                          onDelete={handleDelete}
                          onStatusChange={handleStatusChange}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'kanban_category' ? (
          /* Kanban by Category (Jack-style) */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {CATEGORY_ORDER.map(cat => {
              const colTasks = tasksByCategory(cat);
              const color = CATEGORY_COLOR[cat];
              return (
                <div key={cat} className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1 px-1">
                    <div className="h-1 rounded" style={{ backgroundColor: color }} />
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-xs text-gray-700">{CATEGORY_LABEL[cat]}</h3>
                      <Badge variant="secondary" className="text-[10px]">{colTasks.length}</Badge>
                    </div>
                  </div>
                  <div className="space-y-2 min-h-[150px]">
                    {colTasks.length === 0 ? (
                      <div className="h-16 border-2 border-dashed border-gray-200 rounded-md flex items-center justify-center text-[11px] text-gray-400">
                        Empty
                      </div>
                    ) : (
                      colTasks.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onEdit={openEditDialog}
                          onDelete={handleDelete}
                          onStatusChange={handleStatusChange}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-2">
            {filteredTasks.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <CheckSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No tasks found</h3>
                  <p className="text-gray-600">Add a task or adjust your filters.</p>
                </CardContent>
              </Card>
            ) : (
              filteredTasks.map(task => (
                <Card key={task.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{task.title}</span>
                          <Badge className={`text-xs ${priorityBadgeClass(task.priority)}`}>{task.priority}</Badge>
                          <Badge className={`text-xs ${statusBadgeClass(task.status)}`}>{task.status.replace('_', ' ')}</Badge>
                          {task.projectName && (
                            <Badge variant="outline" className="text-xs">{task.projectName}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          {task.assignedToName && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {task.assignedToName}
                            </span>
                          )}
                          {task.dueDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {task.dueDate}
                            </span>
                          )}
                        </div>
                      </div>
                      <TaskActions task={task} onEdit={openEditDialog} onDelete={handleDelete} onStatusChange={handleStatusChange} />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTask ? 'Edit Task' : 'Add New Task'}</DialogTitle>
              <DialogDescription>
                {editingTask ? 'Update task details' : 'Create a new task'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="task-title">Title *</Label>
                <Input
                  id="task-title"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Project</Label>
                  {scopedProjectId ? (
                    <Input value={formData.projectName || 'This project'} disabled className="bg-gray-50" />
                  ) : (
                    <Select value={formData.projectId || 'none'} onValueChange={v => handleProjectChange(v === 'none' ? '' : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No project</SelectItem>
                        {projects.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label>Assignee</Label>
                  <Select value={formData.assignedToId || 'none'} onValueChange={v => handleAssigneeChange(v === 'none' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {users.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={v => setFormData(prev => ({ ...prev, status: v as TaskStatus }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={formData.priority} onValueChange={v => setFormData(prev => ({ ...prev, priority: v as TaskPriority }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={formData.category || 'uncategorized'} onValueChange={v => setFormData(prev => ({ ...prev, category: v as TaskCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_ORDER.map(cat => (
                      <SelectItem key={cat} value={cat}>{CATEGORY_LABEL[cat]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="task-due">Due Date</Label>
                <Input
                  id="task-due"
                  type="date"
                  value={formData.dueDate}
                  onChange={e => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="text-white"
                  style={{ backgroundColor: '#C9A96E', borderColor: '#C9A96E' }}
                >
                  {isSaving ? 'Saving...' : (editingTask ? 'Update Task' : 'Create Task')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
  );
}

// Task Card component (Kanban)
function TaskCard({
  task,
  onEdit,
  onDelete,
  onStatusChange
}: {
  task: Task;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
}) {
  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onEdit(task)}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-1">
          <p className="font-medium text-sm leading-tight flex-1">{task.title}</p>
          <div onClick={e => e.stopPropagation()}>
            <TaskActions task={task} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} />
          </div>
        </div>
        {task.projectName && (
          <Badge variant="outline" className="text-xs">{task.projectName}</Badge>
        )}
        <div className="flex items-center justify-between">
          <Badge className={`text-xs ${priorityBadgeClass(task.priority)}`}>{task.priority}</Badge>
          {task.assignedToName && (
            <div className="h-6 w-6 rounded-full bg-gray-300 flex items-center justify-center text-xs font-semibold text-gray-700">
              {getInitials(task.assignedToName)}
            </div>
          )}
        </div>
        {task.dueDate && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Calendar className="h-3 w-3" />
            {task.dueDate}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Actions dropdown
function TaskActions({
  task,
  onEdit,
  onDelete,
  onStatusChange
}: {
  task: Task;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(task)}>
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onStatusChange(task.id, 'in_progress')}>
          Mark In Progress
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onStatusChange(task.id, 'done')}>
          Mark Done
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onDelete(task.id)}
          className="text-red-600"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
