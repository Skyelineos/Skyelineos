import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { useCreateTask, type CreateTaskData } from '@/hooks/useCreateTask';
import { useCreateDependency } from '@/hooks/useCreateDependency';
import { useEstimateItems, type EstimateItem } from '@/hooks/useEstimateItems';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Plus, ListChecks, PenTool } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { DEFAULT_TRADES, normalizeTradeId, tradeLabel } from '@/lib/estimates/markup';

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export function AddTaskModal({ isOpen, onClose, projectId }: AddTaskModalProps) {
  const [mode, setMode] = useState<'estimate' | 'manual'>('estimate');
  const [selectedEstimateItem, setSelectedEstimateItem] = useState<EstimateItem | null>(null);
  const [taskData, setTaskData] = useState({
    text: '',
    trade: '',
    contactId: 'none',
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    duration: 1,
    category: '',
    status: 'Scheduled',
    description: '',
    notes: '',
    color: '#3B82F6' // Default blue color
  });

  const createTask = useCreateTask(projectId);
  const createDependency = useCreateDependency(projectId);
  const { toast } = useToast();

  // Fetch estimate items for the project
  const { data: estimateItems = [] } = useEstimateItems(projectId);

  // Fetch contacts for subcontractor selection
  const { data: contacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
  });

  // Filter subcontractors with safe property access
  const subcontractors = Array.isArray(contacts) ? contacts.filter((contact: any) => 
    contact && typeof contact.role === 'string' && contact.role === 'subcontractor'
  ) : [];

  // Canonical trade list (shared with Estimating module so per-trade analytics
  // aggregate correctly across estimates + schedule + bills).
  const tradeTypes = DEFAULT_TRADES;

  // Task colors
  const taskColors = [
    '#8B5CF6', '#3B82F6', '#EF4444', '#10B981', 
    '#F59E0B', '#8B5A2B', '#F97316', '#06B6D4', '#84CC16'
  ];

  // Handle estimate item selection
  const handleEstimateItemSelect = (itemId: string) => {
    const item = estimateItems.find((item: EstimateItem) => item.id.toString() === itemId);
    if (item) {
      setSelectedEstimateItem(item);
      const duration = item.duration || item.defaultDuration || 1;
      setTaskData(prev => ({
        ...prev,
        text: item.trade || item.description || 'Estimate Task',
        duration: duration,
        // Normalize so estimate items saved with legacy labels resolve to IDs.
        trade: normalizeTradeId(item.trade || ''),
        category: item.category || '',
        // Recalculate end date based on new duration
        end: format(addDays(new Date(prev.start), duration), 'yyyy-MM-dd')
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!taskData.text.trim()) {
      toast({
        title: "Validation Error",
        description: "Task name is required",
        variant: "destructive"
      });
      return;
    }

    if (mode === 'manual' && !taskData.trade) {
      toast({
        title: "Validation Error", 
        description: "Trade selection is required for manual entry",
        variant: "destructive"
      });
      return;
    }

    try {
      // Convert task data to match CreateTaskData interface
      const createTaskData: CreateTaskData = {
        text: taskData.text,
        start: taskData.start,
        end: taskData.end,
        duration: taskData.duration,
        category: taskData.category,
        description: taskData.description,
        // Additional fields for enhanced task creation
        trade: taskData.trade,
        contactId: taskData.contactId !== 'none' ? parseInt(taskData.contactId) : undefined,
        status: taskData.status,
        notes: taskData.notes,
        color: taskData.color
      };
      
      const newTask = await createTask.mutateAsync(createTaskData);
      
      // If this is from an estimate item with a predecessor, create the dependency
      if (mode === 'estimate' && selectedEstimateItem?.predecessorTaskId && newTask?.id) {
        try {
          await createDependency.mutateAsync({
            predecessorId: selectedEstimateItem.predecessorTaskId,
            successorId: newTask.id,
            type: 'FS',
            lagDays: 0,
          });
        } catch (depError) {
          console.warn('Failed to create dependency:', depError);
          // Don't fail the whole operation for dependency errors
        }
      }
      
      toast({
        title: "Success",
        description: "Task created successfully"
      });
      handleClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create task",
        variant: "destructive"
      });
    }
  };

  const handleClose = () => {
    setMode('estimate');
    setSelectedEstimateItem(null);
    setTaskData({
      text: '',
      trade: '',
      contactId: 'none',
      start: format(new Date(), 'yyyy-MM-dd'),
      end: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      duration: 1,
      category: '',
      status: 'Scheduled',
      description: '',
      notes: '',
      color: '#3B82F6'
    });
    onClose();
  };

  const handleStartDateChange = (start: string) => {
    const startDate = new Date(start);
    const duration = taskData.duration || 1;
    const endDate = addDays(startDate, duration);
    
    setTaskData(prev => ({
      ...prev,
      start,
      end: format(endDate, 'yyyy-MM-dd')
    }));
  };

  const handleEndDateChange = (end: string) => {
    const startDate = new Date(taskData.start);
    const endDate = new Date(end);
    const duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    
    setTaskData(prev => ({
      ...prev,
      end,
      duration
    }));
  };

  const handleDurationChange = (duration: number) => {
    const startDate = new Date(taskData.start);
    const endDate = addDays(startDate, duration);
    
    setTaskData(prev => ({
      ...prev,
      duration,
      end: format(endDate, 'yyyy-MM-dd')
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add New Task
          </DialogTitle>
          <DialogDescription>
            Create a new task for the project schedule.
          </DialogDescription>
        </DialogHeader>

        <form id="task-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* Mode Selection */}
          <div className="space-y-3">
            <Label>Task Creation Mode</Label>
            <RadioGroup
              value={mode}
              onValueChange={(value: 'estimate' | 'manual') => {
                setMode(value);
                // Reset form when switching modes
                if (value === 'manual') {
                  setSelectedEstimateItem(null);
                  setTaskData(prev => ({
                    ...prev,
                    text: '',
                    duration: 1,
                    trade: '',
                    category: '',
                    end: format(addDays(new Date(prev.start), 1), 'yyyy-MM-dd')
                  }));
                }
              }}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="estimate" id="estimate" />
                <Label htmlFor="estimate" className="flex items-center gap-2 cursor-pointer">
                  <ListChecks className="w-4 h-4" />
                  From Estimate Item
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="manual" />
                <Label htmlFor="manual" className="flex items-center gap-2 cursor-pointer">
                  <PenTool className="w-4 h-4" />
                  Manual Entry
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Estimate Item Selection */}
          {mode === 'estimate' && (
            <div className="space-y-2">
              <Label htmlFor="estimate-item">Select Estimate Item *</Label>
              <Select onValueChange={handleEstimateItemSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an estimate item to schedule" />
                </SelectTrigger>
                <SelectContent>
                  {estimateItems.map((item: EstimateItem) => (
                    <SelectItem key={item.id} value={item.id.toString()}>
                      {item.trade} - {item.description || 'No description'} ({item.duration || 1} days)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="task-title">Task Title *</Label>
            <Input
              id="task-title"
              value={taskData.text}
              onChange={(e) => setTaskData(prev => ({ ...prev, text: e.target.value }))}
              placeholder={mode === 'estimate' ? "Will be filled from estimate item" : "Enter task title"}
              required
              disabled={mode === 'estimate' && !selectedEstimateItem}
            />
          </div>

          {mode === 'manual' && (
            <div className="space-y-2">
              <Label htmlFor="trade">Trade *</Label>
              <Select value={taskData.trade} onValueChange={(value) => setTaskData(prev => ({ ...prev, trade: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a trade" />
                </SelectTrigger>
                <SelectContent>
                  {tradeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === 'estimate' && selectedEstimateItem && (
            <div className="space-y-2">
              <Label>Trade</Label>
              <Input
                value={taskData.trade || 'Not specified'}
                disabled
                className="bg-gray-50"
              />
            </div>
          )}

          {mode === 'manual' && (
            <div className="space-y-2">
              <Label htmlFor="subcontractor">Subcontractor</Label>
              <SubcontractorComboBox
                contacts={subcontractors}
                value={taskData.contactId}
                onValueChange={(value) => setTaskData(prev => ({ ...prev, contactId: value }))}
                placeholder="Select subcontractor (optional)"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date *</Label>
              <Input
                id="start-date"
                type="date"
                value={taskData.start}
                onChange={(e) => handleStartDateChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (days) *</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                value={taskData.duration}
                onChange={(e) => handleDurationChange(parseInt(e.target.value) || 1)}
                required
                disabled={mode === 'estimate' && !selectedEstimateItem}
                className={mode === 'estimate' && selectedEstimateItem ? 'bg-blue-50' : ''}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>End Date: {taskData.end ? format(new Date(taskData.end), 'MMM dd, yyyy') : 'Invalid date'}</Label>
            {mode === 'estimate' && selectedEstimateItem?.predecessorTaskId && (
              <p className="text-sm text-blue-600">
                This task will be scheduled after Task #{selectedEstimateItem.predecessorTaskId}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={taskData.status} onValueChange={(value) => setTaskData(prev => ({ ...prev, status: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="On Hold">On Hold</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Task Color</Label>
            <div className="flex gap-2 flex-wrap">
              {taskColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded border-2 ${
                    taskData.color === color ? 'border-gray-900' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setTaskData(prev => ({ ...prev, color }))}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={taskData.description}
              onChange={(e) => setTaskData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Enter task description"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={taskData.notes}
              onChange={(e) => setTaskData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes or special instructions"
              rows={3}
            />
          </div>

        </form>

        <DialogFooter className="border-t pt-4 mt-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            variant="accent"
            type="submit" 
            form="task-form"
            disabled={createTask.isPending || (mode === 'estimate' && !selectedEstimateItem)}
          >
            {createTask.isPending ? 'Creating...' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}