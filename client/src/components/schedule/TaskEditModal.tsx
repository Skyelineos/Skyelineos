import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Calendar, Clock, Users, Link, X, Plus } from 'lucide-react';
import { Task, Dependency } from '../../hooks/useProjectSchedule';
import { apiRequest } from '../../lib/queryClient';
import { useToast } from '../../hooks/use-toast';
import { DEFAULT_TRADES, normalizeTradeId } from '@/lib/estimates/markup';

interface TaskEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  dependencies: Dependency[];
  allTasks: Task[];
  projectId: number;
  onRefresh: () => void;
}

const taskColors = [
  { name: 'Blue', value: '#3b82f6', bg: 'bg-blue-500' },
  { name: 'Green', value: '#10b981', bg: 'bg-green-500' },
  { name: 'Yellow', value: '#f59e0b', bg: 'bg-yellow-500' },
  { name: 'Red', value: '#ef4444', bg: 'bg-red-500' },
  { name: 'Purple', value: '#8b5cf6', bg: 'bg-purple-500' },
  { name: 'Pink', value: '#ec4899', bg: 'bg-pink-500' },
  { name: 'Indigo', value: '#6366f1', bg: 'bg-indigo-500' },
  { name: 'Gray', value: '#6b7280', bg: 'bg-gray-500' },
];

const taskStatuses = [
  'planned',
  'Scheduled', 
  'In Progress',
  'Complete',
  'On Hold',
  'Delayed'
];

export function TaskEditModal({ 
  isOpen, 
  onClose, 
  task, 
  dependencies, 
  allTasks, 
  projectId, 
  onRefresh 
}: TaskEditModalProps) {
  const [formData, setFormData] = useState({
    text: '',
    start_date: '',
    end_date: '',
    duration: 1,
    progress: 0,
    status: 'planned',
    trade: '',
    description: '',
    color: '#3b82f6'
  });
  
  const [taskDependencies, setTaskDependencies] = useState<number[]>([]);
  const [dependentTasks, setDependentTasks] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (task) {
      setFormData({
        text: task.text || '',
        start_date: task.start_date || '',
        end_date: task.end_date || '',
        duration: task.duration || 1,
        progress: task.progress || 0,
        status: task.status || 'planned',
        // Normalize so old label-stored trades resolve to canonical IDs and the
        // Select shows the right option. Backward compatible with existing data.
        trade: normalizeTradeId(task.trade || ''),
        description: task.description || '',
        color: task.color || '#3b82f6'
      });

      // Find dependencies for this task
      const deps = dependencies.filter(dep => dep.target === task.id).map(dep => dep.source);
      setTaskDependencies(deps);

      // Find tasks that depend on this task
      const dependents = dependencies.filter(dep => dep.source === task.id).map(dep => dep.target);
      setDependentTasks(dependents);
    }
  }, [task, dependencies]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!task) return;

    setIsLoading(true);
    try {
      // Update task
      await apiRequest('PUT', `/api/projects/${projectId}/tasks/${task.id}`, {
        ...formData,
        id: task.id,
        projectId
      });

      toast({
        title: "Task Updated",
        description: "Task has been updated successfully"
      });

      onRefresh();
      onClose();
    } catch (error) {
      console.error('Error updating task:', error);
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addDependency = async (fromTaskId: number) => {
    if (!task || taskDependencies.includes(fromTaskId)) return;

    try {
      await apiRequest('POST', `/api/projects/${projectId}/dependencies`, {
        fromTaskId,
        toTaskId: task.id,
        dependencyType: 'FS',
        lagDays: 0
      });

      setTaskDependencies(prev => [...prev, fromTaskId]);
      toast({
        title: "Dependency Added",
        description: "Task dependency has been created"
      });
      onRefresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add dependency",
        variant: "destructive"
      });
    }
  };

  const removeDependency = async (fromTaskId: number) => {
    if (!task) return;

    try {
      const dependencyId = `${task.id}-${fromTaskId}-0`;
      await apiRequest('DELETE', `/api/dependencies/${dependencyId}`);

      setTaskDependencies(prev => prev.filter(id => id !== fromTaskId));
      toast({
        title: "Dependency Removed",
        description: "Task dependency has been removed"
      });
      onRefresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove dependency",
        variant: "destructive"
      });
    }
  };

  if (!task) return null;

  const availablePrerequisites = allTasks.filter(t => 
    t.id !== task.id && !taskDependencies.includes(t.id)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Edit Task: {task.text}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="taskName">Task Name</Label>
              <Input
                id="taskName"
                value={formData.text}
                onChange={(e) => handleInputChange('text', e.target.value)}
                placeholder="Enter task name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="trade">Trade/Category</Label>
                <Select value={formData.trade || ''} onValueChange={(v) => handleInputChange('trade', v === '__unset__' ? '' : v)}>
                  <SelectTrigger id="trade">
                    <SelectValue placeholder="— select trade —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">— none —</SelectItem>
                    {DEFAULT_TRADES.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taskStatuses.map(status => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Task description..."
                rows={3}
              />
            </div>
          </div>

          {/* Schedule Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Schedule
            </h3>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => handleInputChange('start_date', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => handleInputChange('end_date', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="duration">Duration (days)</Label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  value={formData.duration}
                  onChange={(e) => handleInputChange('duration', parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="progress">Progress ({formData.progress}%)</Label>
              <Input
                id="progress"
                type="range"
                min="0"
                max="100"
                value={formData.progress}
                onChange={(e) => handleInputChange('progress', parseInt(e.target.value))}
                className="mt-2"
              />
            </div>
          </div>

          {/* Color Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Task Color</h3>
            <div className="flex gap-2 flex-wrap">
              {taskColors.map(color => (
                <button
                  key={color.value}
                  onClick={() => handleInputChange('color', color.value)}
                  className={`w-8 h-8 rounded-full border-2 ${color.bg} ${
                    formData.color === color.value ? 'border-gray-800' : 'border-gray-300'
                  }`}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          {/* Dependencies */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Link className="w-5 h-5" />
              Dependencies
            </h3>

            {/* Prerequisites (tasks this task depends on) */}
            <div>
              <Label>Prerequisites (this task depends on):</Label>
              <div className="mt-2 space-y-2">
                {taskDependencies.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {taskDependencies.map(depId => {
                      const depTask = allTasks.find(t => t.id === depId);
                      return depTask ? (
                        <Badge key={depId} variant="outline" className="flex items-center gap-1">
                          {depTask.text}
                          <button
                            onClick={() => removeDependency(depId)}
                            className="ml-1 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No prerequisites</p>
                )}

                {availablePrerequisites.length > 0 && (
                  <Select onValueChange={(value) => addDependency(parseInt(value))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Add prerequisite task..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePrerequisites.map(t => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.text}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Dependent tasks (tasks that depend on this task) */}
            <div>
              <Label>Dependent Tasks (depend on this task):</Label>
              <div className="mt-2">
                {dependentTasks.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {dependentTasks.map(depId => {
                      const depTask = allTasks.find(t => t.id === depId);
                      return depTask ? (
                        <Badge key={depId} variant="secondary">
                          {depTask.text}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No dependent tasks</p>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}