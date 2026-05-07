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
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

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
  dueDate: ''
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
  const { toast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');

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

  const openAddDialog = () => {
    setEditingTask(null);
    setFormData(defaultForm());
    setDialogOpen(true);
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
      dueDate: task.dueDate || ''
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
        await updateDoc(doc(db, 'tasks', editingTask.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        toast({ title: 'Task updated' });
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...formData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
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
  const filteredTasks = tasks.filter(t => {
    const matchSearch = searchTerm === '' ||
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.projectName && t.projectName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.assignedToName && t.assignedToName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchProject = projectFilter === 'all' || t.projectId === projectFilter;
    return matchSearch && matchStatus && matchPriority && matchProject;
  });

  const tasksByStatus = (status: TaskStatus) => filteredTasks.filter(t => t.status === status);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckSquare className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Tasks</h1>
            <Badge variant="secondary" className="text-sm">{filteredTasks.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode(viewMode === 'kanban' ? 'list' : 'kanban')}
            >
              {viewMode === 'kanban' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </Button>
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
          /* Kanban View */
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
    </AppLayout>
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
