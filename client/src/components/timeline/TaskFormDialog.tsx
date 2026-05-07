import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

interface Task {
  id?: number;
  title: string;
  description?: string;
  trade: string;
  subcontractor?: string;
  duration: number;
  startDate: string;
  endDate?: string;
  status: string;
  priority: string;
  notes?: string;
  projectId: number;
  estimateItemId?: number;
}

interface TaskFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  task?: Task | null;
  onTaskSaved: () => void;
}

const TaskFormDialog: React.FC<TaskFormDialogProps> = ({ 
  isOpen, 
  onClose, 
  projectId,
  task,
  onTaskSaved 
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    trade: '',
    subcontractor: '',
    duration: 1,
    startDate: new Date().toISOString().split('T')[0],
    status: 'planned',
    priority: 'medium',
    color: '#3b82f6',
    notes: '',
  });

  React.useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        trade: task.trade || '',
        subcontractor: task.subcontractor || '',
        duration: task.duration || 1,
        startDate: task.startDate ? task.startDate.split('T')[0] : new Date().toISOString().split('T')[0],
        status: task.status || 'planned',
        priority: task.priority || 'medium',
        color: (task as any).color || '#3b82f6',
        notes: task.notes || '',
      });
    } else {
      setFormData({
        title: '',
        description: '',
        trade: '',
        subcontractor: '',
        duration: 1,
        startDate: new Date().toISOString().split('T')[0],
        status: 'planned',
        priority: 'medium',
        color: '#3b82f6',
        notes: '',
      });
    }
  }, [task, isOpen]);

  const saveTask = useMutation({
    mutationFn: async (taskData: any) => {
      const endpoint = task ? `/api/projects/${projectId}/tasks/${task.id}` : `/api/projects/${projectId}/tasks`;
      const method = task ? 'PUT' : 'POST';
      return apiRequest(method, endpoint, {
        ...taskData,
        startDate: new Date(taskData.startDate).toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({
        title: task ? "Task Updated" : "Task Created",
        description: task ? "Task has been updated successfully." : "New task has been created successfully.",
      });
      onTaskSaved();
      onClose();
    },
    onError: (error) => {
      toast({
        title: task ? "Update Failed" : "Creation Failed",
        description: "Failed to save task. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.title.trim()) {
      saveTask.mutate(formData);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const predefinedTrades = [
    'Foundation',
    'Framing',
    'Roofing',
    'Electrical',
    'Plumbing',
    'HVAC',
    'Insulation',
    'Drywall',
    'Flooring',
    'Painting',
    'Cabinetry',
    'Countertops',
    'Tile',
    'Landscaping',
    'Cleanup'
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'Create New Task'}</DialogTitle>
          <DialogDescription>
            Update the task details below.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Task Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="Enter task title..."
              required
              className="text-base"
            />
          </div>

          {/* Trade and Subcontractor */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="trade">Trade *</Label>
              <Select value={formData.trade} onValueChange={(value) => handleInputChange('trade', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a trade" />
                </SelectTrigger>
                <SelectContent>
                  {predefinedTrades.map(trade => (
                    <SelectItem key={trade} value={trade}>
                      {trade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subcontractor">Subcontractor</Label>
              <Input
                id="subcontractor"
                value={formData.subcontractor}
                onChange={(e) => handleInputChange('subcontractor', e.target.value)}
                placeholder="Assign subcontractor..."
                className="text-base"
              />
            </div>
          </div>

          {/* Duration and Start Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (Days) *</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                value={formData.duration}
                onChange={(e) => handleInputChange('duration', parseInt(e.target.value))}
                className="text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => handleInputChange('startDate', e.target.value)}
                className="text-base"
              />
            </div>
          </div>

          {/* Status and Priority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on-hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Brief description of the work to be done..."
              rows={3}
              className="text-base"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Additional notes or special instructions"
              rows={2}
              className="text-base"
            />
          </div>
          
          <DialogFooter className="flex justify-between pt-6 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={saveTask.isPending || !formData.title.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveTask.isPending ? 'Saving...' : (task ? 'Update Task' : 'Create Task')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TaskFormDialog;