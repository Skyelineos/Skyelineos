import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { addDays, format } from 'date-fns';
import { Trash2 } from 'lucide-react';

interface ScheduleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskData: any) => void;
  onDelete?: (taskId: number) => void;
  task?: any;
  projectId: number;
  isLoading: boolean;
}

export default function ScheduleEditorModal({ 
  isOpen, 
  onClose, 
  onSave, 
  onDelete,
  task, 
  projectId, 
  isLoading 
}: ScheduleEditorModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    trade: '',
    contactId: '',
    startDate: '',
    duration: 1,
    status: 'Scheduled',
    description: '',
    notes: '',
    color: '#3B82F6', // Default blue color
  });
  const { toast } = useToast();

  // Fetch contacts for subcontractor selection
  const { data: contacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
  });

  // Filter subcontractors with safe property access
  const subcontractors = Array.isArray(contacts) ? contacts.filter((contact: any) => 
    contact && typeof contact.role === 'string' && contact.role === 'subcontractor'
  ) : [];

  // Common trade types
  const tradeTypes = [
    'Excavation',
    'Foundation',
    'Framing',
    'Plumbing',
    'Electrical',
    'HVAC',
    'Insulation',
    'Drywall',
    'Flooring',
    'Cabinets',
    'Painting',
    'Final Inspection',
  ];

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || '',
        trade: task.trade || '',
        contactId: task.contactId?.toString() || 'none',
        startDate: task.startDate ? format(new Date(task.startDate), 'yyyy-MM-dd') : '',
        duration: task.duration || 1,
        status: task.status || 'Scheduled',
        description: task.description || '',
        notes: task.notes || '',
        color: task.color || '#3B82F6',
      });
    } else {
      // Reset form for new task
      const today = new Date();
      setFormData({
        title: '',
        trade: '',
        contactId: 'none',
        startDate: format(today, 'yyyy-MM-dd'),
        duration: 1,
        status: 'Scheduled',
        description: '',
        notes: '',
        color: '#3B82F6',
      });
    }
  }, [task, isOpen]);

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const calculateEndDate = () => {
    if (!formData.startDate || !formData.duration || formData.duration < 1) {
      return null;
    }
    
    try {
      const startDate = new Date(formData.startDate);
      if (isNaN(startDate.getTime())) {
        return null;
      }
      const endDate = addDays(startDate, formData.duration - 1);
      return endDate;
    } catch (error) {
      console.error('Error calculating end date:', error);
      return null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast({
        title: "Validation Error",
        description: "Task title is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.trade.trim()) {
      toast({
        title: "Validation Error",
        description: "Trade is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.startDate) {
      toast({
        title: "Validation Error",
        description: "Start date is required.",
        variant: "destructive",
      });
      return;
    }

    const endDate = calculateEndDate();
    if (!endDate) {
      toast({
        title: "Validation Error",
        description: "Invalid start date or duration.",
        variant: "destructive",
      });
      return;
    }

    const taskData = {
      title: formData.title.trim(),
      trade: formData.trade.trim(),
      contactId: formData.contactId && formData.contactId !== 'none' && !isNaN(parseInt(formData.contactId)) 
        ? parseInt(formData.contactId) 
        : null,
      startDate: formData.startDate,
      endDate: endDate.toISOString(),
      duration: formData.duration,
      status: formData.status,
      description: formData.description.trim(),
      notes: formData.notes.trim(),
      color: formData.color,
      createdBy: 1, // TODO: Get from auth context
    };

    onSave(taskData);
  };

  const endDate = calculateEndDate();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{task ? 'Edit Task' : 'Create New Task'}</DialogTitle>
            <DialogDescription>
              {task ? 'Update the task details below.' : 'Add a new task to the project schedule.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Task Title */}
            <div className="grid gap-2">
              <Label htmlFor="title">Task Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="e.g., Framing Work"
              />
            </div>

            {/* Trade */}
            <div className="grid gap-2">
              <Label htmlFor="trade">Trade *</Label>
              <Select
                value={formData.trade}
                onValueChange={(value) => handleInputChange('trade', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a trade" />
                </SelectTrigger>
                <SelectContent>
                  {tradeTypes.map(trade => (
                    <SelectItem key={trade} value={trade}>{trade}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Subcontractor */}
            <div className="grid gap-2">
              <Label htmlFor="contactId">Subcontractor</Label>
              <SubcontractorComboBox
                subcontractors={[{id: 'none', name: 'No subcontractor assigned', company: 'None'}, ...subcontractors]}
                value={formData.contactId}
                onValueChange={(value) => handleInputChange('contactId', value)}
                placeholder="Select a subcontractor (optional)"
              />
            </div>

            {/* Date and Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleInputChange('startDate', e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="duration">Duration (days) *</Label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  max="365"
                  value={formData.duration}
                  onChange={(e) => handleInputChange('duration', parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            {/* Calculated End Date */}
            {endDate && (
              <div className="text-sm text-gray-600">
                End Date: {format(endDate, 'MMM d, yyyy')}
              </div>
            )}

            {/* Status */}
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => handleInputChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Complete">Complete</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Color */}
            <div className="grid gap-2">
              <Label htmlFor="color">Task Color</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => handleInputChange('color', e.target.value)}
                  className="w-16 h-8 p-1 border rounded cursor-pointer"
                />
                <div className="flex gap-1">
                  {/* Preset colors */}
                  {['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#F97316', '#06B6D4', '#84CC16'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer hover:border-gray-500"
                      style={{ backgroundColor: color }}
                      onClick={() => handleInputChange('color', color)}
                      title={`Set color to ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Brief description of the work to be done"
                rows={2}
              />
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Additional notes or special instructions"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            <div>
              {/* Delete button - only show when editing existing task */}
              {task && onDelete && (
                <Button 
                  type="button" 
                  variant="destructive" 
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to delete the task "${task.title}"? This action cannot be undone.`)) {
                      onDelete(task.id);
                      onClose();
                    }
                  }}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Task
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}