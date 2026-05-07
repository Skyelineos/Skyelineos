import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubcontractorComboBox } from '@/components/ui/subcontractor-combobox';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Calendar, Clock, DollarSign, User, Plus, CheckCircle } from 'lucide-react';

interface TaskFormData {
  title: string;
  trade: string;
  description: string;
  duration: number;
  startDate: string;
  endDate: string;
  estimatedCost: number;
  assignedContactId: string;
  notes: string;
  color: string;
  status: string;
}

interface EstimateItem {
  id: number;
  trade: string;
  vendor: string;
  description: string;
  estimatedCost: number;
  duration: number;
  status: string;
}

interface Estimate {
  id: number;
  name: string;
  totalCost: number;
  totalDuration: number;
  items: EstimateItem[];
}

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskAdded: () => void;
  projectId: number;
}

const TRADE_OPTIONS = [
  'Excavation', 'Foundation', 'Framing', 'Plumbing', 'Electrical', 'HVAC', 
  'Insulation', 'Drywall', 'Flooring', 'Cabinets', 'Painting', 'Landscaping',
  'Roofing', 'Windows', 'Doors', 'Permits', 'Inspection', 'Cleanup'
];

const TASK_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F59E0B', '#84CC16', '#6366F1', '#06B6D4'
];

const STATUS_OPTIONS = [
  { value: 'Scheduled', label: 'Scheduled' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Complete', label: 'Complete' },
  { value: 'Delayed', label: 'Delayed' }
];

export function AddTaskModal({ isOpen, onClose, onTaskAdded, projectId }: AddTaskModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('manual');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEstimateItems, setSelectedEstimateItems] = useState<number[]>([]);

  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    trade: '',
    description: '',
    duration: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    estimatedCost: 0,
    assignedContactId: '',
    notes: '',
    color: TASK_COLORS[0],
    status: 'Scheduled'
  });

  // Fetch estimates for the project
  const { data: estimates = [], isLoading: estimatesLoading } = useQuery({
    queryKey: [`/api/projects/${projectId}/estimates`],
    enabled: isOpen && activeTab === 'estimates'
  });

  // Fetch contacts for assignment
  const { data: contacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
    enabled: isOpen
  });

  // Auto-calculate end date when start date or duration changes
  useEffect(() => {
    if (formData.startDate && formData.duration) {
      const startDate = new Date(formData.startDate);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + formData.duration - 1);
      setFormData(prev => ({
        ...prev,
        endDate: endDate.toISOString().split('T')[0]
      }));
    }
  }, [formData.startDate, formData.duration]);

  const handleInputChange = (field: keyof TaskFormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleManualTaskSubmit = async () => {
    if (!formData.title || !formData.trade || !formData.startDate) {
      toast({
        title: "Missing Information",
        description: "Please fill in title, trade, and start date.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: formData.title,
          trade: formData.trade,
          description: formData.description,
          duration: formData.duration,
          startDate: formData.startDate,
          endDate: formData.endDate,
          estimatedCost: formData.estimatedCost,
          contactId: formData.assignedContactId && formData.assignedContactId !== 'none' ? parseInt(formData.assignedContactId) : null,
          notes: formData.notes,
          color: formData.color,
          status: formData.status
        })
      });

      toast({
        title: "Task Added",
        description: `${formData.title} has been added to the timeline.`
      });

      onTaskAdded();
      onClose();
      resetForm();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add task. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEstimateItemsSubmit = async () => {
    if (selectedEstimateItems.length === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select at least one estimate item.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Get selected estimate items details
      const selectedItems = estimates.flatMap(est => 
        est.items.filter(item => selectedEstimateItems.includes(item.id))
      );

      // Create tasks from selected estimate items
      for (const item of selectedItems) {
        await apiRequest(`/api/projects/${projectId}/tasks`, {
          method: 'POST',
          body: JSON.stringify({
            title: `${item.trade} - ${item.description}`,
            trade: item.trade,
            description: item.description,
            duration: item.duration || 3,
            startDate: formData.startDate,
            estimatedCost: item.estimatedCost,
            estimateItemId: item.id,
            notes: `Created from estimate item: ${item.vendor}`,
            color: TASK_COLORS[Math.floor(Math.random() * TASK_COLORS.length)],
            status: 'Scheduled'
          })
        });
      }

      toast({
        title: "Tasks Added",
        description: `${selectedItems.length} task(s) created from estimate items.`
      });

      onTaskAdded();
      onClose();
      setSelectedEstimateItems([]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create tasks from estimates.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      trade: '',
      description: '',
      duration: 1,
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      estimatedCost: 0,
      assignedContactId: 'none',
      notes: '',
      color: TASK_COLORS[0],
      status: 'Scheduled'
    });
    setSelectedEstimateItems([]);
    setActiveTab('manual');
  };

  const toggleEstimateItem = (itemId: number) => {
    setSelectedEstimateItems(prev => 
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const subcontractors = contacts.filter(contact => contact.contactType === 'subcontractor');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Tasks to Timeline</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual Task</TabsTrigger>
            <TabsTrigger value="estimates">From Estimates</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Create Manual Task
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Task Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      placeholder="Enter task title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="trade">Trade</Label>
                    <Select value={formData.trade} onValueChange={(value) => handleInputChange('trade', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select trade" />
                      </SelectTrigger>
                      <SelectContent>
                        {TRADE_OPTIONS.map(trade => (
                          <SelectItem key={trade} value={trade}>{trade}</SelectItem>
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
                    placeholder="Task description"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => handleInputChange('startDate', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="duration">Duration (Days)</Label>
                    <Input
                      id="duration"
                      type="number"
                      min="1"
                      value={formData.duration}
                      onChange={(e) => handleInputChange('duration', parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      readOnly
                      className="bg-gray-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="estimatedCost">Estimated Cost</Label>
                    <Input
                      id="estimatedCost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.estimatedCost}
                      onChange={(e) => handleInputChange('estimatedCost', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="assignedTo">Assign to Subcontractor</Label>
                    <SubcontractorComboBox
                      subcontractors={[{id: 'none', name: 'No assignment', company: 'None'}, ...subcontractors]}
                      value={formData.assignedContactId}
                      onValueChange={(value) => handleInputChange('assignedContactId', value)}
                      placeholder="Select subcontractor"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(status => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="color">Task Color</Label>
                    <div className="flex gap-2 mt-2">
                      {TASK_COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          className={`w-8 h-8 rounded-full border-2 ${
                            formData.color === color ? 'border-gray-900' : 'border-gray-300'
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => handleInputChange('color', color)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder="Additional notes"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="estimates" className="space-y-4">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Create Tasks from Estimates
                </CardTitle>
              </CardHeader>
              <CardContent>
                {estimatesLoading ? (
                  <div>Loading estimates...</div>
                ) : estimates.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No estimates found for this project
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="mb-4">
                      <Label htmlFor="baseStartDate">Base Start Date</Label>
                      <Input
                        id="baseStartDate"
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => handleInputChange('startDate', e.target.value)}
                        className="max-w-xs"
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        Tasks will be scheduled starting from this date
                      </p>
                    </div>

                    <div className="space-y-3">
                      {estimates.map((estimate) => (
                        <div key={estimate.id} className="border rounded-lg p-4">
                          <h4 className="font-semibold mb-2">{estimate.name}</h4>
                          <div className="space-y-2">
                            {estimate.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-3 border rounded cursor-pointer hover:bg-gray-50"
                                onClick={() => toggleEstimateItem(item.id)}
                              >
                                <div className="flex items-center space-x-3">
                                  <Checkbox
                                    checked={selectedEstimateItems.includes(item.id)}
                                    onChange={() => toggleEstimateItem(item.id)}
                                  />
                                  <div>
                                    <p className="font-medium">{item.title || item.trade}</p>
                                    <p className="text-sm text-gray-600">{item.description}</p>
                                    {item.vendor && (
                                      <p className="text-xs text-gray-500">Vendor: {item.vendor}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <Badge variant="outline" className="mb-1">
                                    {item.status}
                                  </Badge>
                                  <div className="flex items-center gap-4 text-sm text-gray-600">
                                    <div className="flex items-center gap-1">
                                      <DollarSign className="h-3 w-3" />
                                      ${item.estimatedCost?.toLocaleString() || 0}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {item.duration || 3} days
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {selectedEstimateItems.length > 0 && (
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <p className="text-sm text-theme-primary">
                          {selectedEstimateItems.length} estimate item(s) selected for task creation
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={activeTab === 'manual' ? handleManualTaskSubmit : handleEstimateItemsSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Adding...' : activeTab === 'manual' ? 'Add Task' : 'Create Tasks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}