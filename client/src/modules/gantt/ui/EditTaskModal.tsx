// Edit / delete an existing task. Opened by clicking a bar or task row.
import React, { useEffect, useState } from 'react';
import { format, addDays, parseISO, differenceInCalendarDays } from 'date-fns';
import { useGantt } from '../state';
import type { WbsTask } from '../types';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';

interface EditTaskModalProps {
  task: WbsTask | null;
  onClose: () => void;
}

const STATUS_OPTIONS = [
  { value: 'on_track', label: 'On track' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'pending_approval', label: 'Pending approval' },
] as const;

export function EditTaskModal({ task, onClose }: EditTaskModalProps) {
  const { tasks, setTasks } = useGantt();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('none');
  const [locked, setLocked] = useState(false);

  const isParent = !!task && !!task.children && task.children.length > 0;

  useEffect(() => {
    if (!task) return;
    const dur =
      task.durationDays ??
      Math.max(1, differenceInCalendarDays(parseISO(task.endDate), parseISO(task.startDate)) + 1);
    setName(task.name);
    setStartDate(task.startDate);
    setDurationDays(dur);
    setProgress(task.progress ?? 0);
    setStatus(task.status ?? 'none');
    setLocked(!!task.locked);
  }, [task]);

  // Recursively map the tree, applying `fn` to the matching node.
  const mapTree = (nodes: WbsTask[], id: string, fn: (n: WbsTask) => WbsTask): WbsTask[] =>
    nodes.map((n) => {
      if (n.id === id) return fn(n);
      if (n.children) return { ...n, children: mapTree(n.children, id, fn) };
      return n;
    });

  const removeFromTree = (nodes: WbsTask[], id: string): WbsTask[] =>
    nodes
      .filter((n) => n.id !== id)
      .map((n) => (n.children ? { ...n, children: removeFromTree(n.children, id) } : n));

  const handleSave = () => {
    if (!task) return;
    if (!name.trim()) {
      toast({ title: 'Name required', description: 'Give the task a name.', variant: 'destructive' });
      return;
    }
    const end = isParent
      ? task.endDate
      : format(addDays(parseISO(startDate), Math.max(0, durationDays - 1)), 'yyyy-MM-dd');

    setTasks(
      mapTree(tasks, task.id, (n) => ({
        ...n,
        name: name.trim(),
        startDate: isParent ? n.startDate : startDate,
        endDate: end,
        durationDays: isParent ? n.durationDays : durationDays,
        progress: Math.min(100, Math.max(0, progress)),
        status: status === 'none' ? undefined : (status as WbsTask['status']),
        locked,
      }))
    );
    toast({ title: 'Task updated', description: `"${name.trim()}" saved.` });
    onClose();
  };

  const handleDelete = () => {
    if (!task) return;
    setTasks(removeFromTree(tasks, task.id));
    toast({ title: 'Task deleted', description: `"${task.name}" removed.` });
    onClose();
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>
            {isParent ? 'Phase dates are derived from its tasks.' : 'Update the task’s details.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Task name" />
          </div>

          {!isParent && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Duration (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={durationDays}
                  onChange={(e) => setDurationDays(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>
          )}

          {!isParent && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Progress (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="No status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No status</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {!isParent && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <Checkbox checked={locked} onCheckedChange={(c) => setLocked(!!c)} />
              Lock dates during recalculation
            </label>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={handleDelete}>
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
