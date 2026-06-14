import React, { useState } from 'react';
import { useProjectSchedule } from '../../hooks/useProjectSchedule';
import { format } from 'date-fns';
import { Calendar, Clock, CheckCircle, Circle, AlertCircle, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { apiRequest } from '../../lib/queryClient';

interface ScheduleSectionProps {
  projectId: number;
  readonly?: boolean;
}

const priorityColors = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800'
};

const statusIcons = {
  not_started: Circle,
  in_progress: AlertCircle,
  completed: CheckCircle,
  Scheduled: Circle
};

const statusColors = {
  not_started: 'text-gray-400',
  in_progress: 'text-yellow-500',
  completed: 'text-green-500',
  Scheduled: 'text-blue-500'
};

export default function ScheduleSection({ projectId, readonly = false }: ScheduleSectionProps) {
  const { tasks = [], isLoading, refetch } = useProjectSchedule(projectId);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    duration: 1,
    status: 'not_started',
    priority: 'medium',
    category: '',
    trade: ''
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const phases = tasks.reduce((acc: Record<string, any[]>, task: any) => {
    const phase = task.trade || task.category || 'General';
    if (!acc[phase]) {
      acc[phase] = [];
    }
    acc[phase].push(task);
    return acc;
  }, {} as Record<string, any[]>);

  const handleAddTask = async () => {
    if (!newTask.title || !newTask.startDate || !newTask.endDate || !newTask.trade) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiRequest(`/api/projects/${projectId}/schedule/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newTask,
          progress: 0
        }),
      });

      if (response.ok) {
        setIsAddTaskOpen(false);
        setNewTask({
          title: '',
          description: '',
          startDate: '',
          endDate: '',
          duration: 1,
          status: 'not_started',
          priority: 'medium',
          category: '',
          trade: ''
        });
        refetch();
      }
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Project Schedule</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="h-4 w-4" />
            Day-based scheduling
          </div>
          {!readonly && (
            <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Task</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      placeholder="Enter task title"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      value={newTask.description}
                      onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                      placeholder="Enter task description"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Start Date</label>
                      <Input
                        type="date"
                        value={newTask.startDate}
                        onChange={(e) => setNewTask({ ...newTask, startDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">End Date</label>
                      <Input
                        type="date"
                        value={newTask.endDate}
                        onChange={(e) => setNewTask({ ...newTask, endDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Priority</label>
                      <Select value={newTask.priority} onValueChange={(value) => setNewTask({ ...newTask, priority: value })}>
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
                    <div>
                      <label className="text-sm font-medium">Duration (days)</label>
                      <Input
                        type="number"
                        min="1"
                        value={newTask.duration}
                        onChange={(e) => setNewTask({ ...newTask, duration: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Trade</label>
                    <Select value={newTask.trade} onValueChange={(value) => setNewTask({ ...newTask, trade: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select trade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Foundation">Foundation</SelectItem>
                        <SelectItem value="Framing">Framing</SelectItem>
                        <SelectItem value="Electrical">Electrical</SelectItem>
                        <SelectItem value="Plumbing">Plumbing</SelectItem>
                        <SelectItem value="HVAC">HVAC</SelectItem>
                        <SelectItem value="Drywall">Drywall</SelectItem>
                        <SelectItem value="Flooring">Flooring</SelectItem>
                        <SelectItem value="Painting">Painting</SelectItem>
                        <SelectItem value="Roofing">Roofing</SelectItem>
                        <SelectItem value="Siding">Siding</SelectItem>
                        <SelectItem value="Landscaping">Landscaping</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleAddTask} disabled={isSubmitting} className="flex-1">
                      {isSubmitting ? 'Creating...' : 'Create Task'}
                    </Button>
                    <Button variant="outline" onClick={() => setIsAddTaskOpen(false)} disabled={isSubmitting}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {Object.keys(phases).length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Schedule Created</h3>
            <p className="text-gray-500">
              Create your first schedule items to get started with project planning.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(phases).map(([phase, phaseTasks]) => (
            <div key={phase} className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
                {phase}
              </h3>
              
              <div className="space-y-3">
                {(phaseTasks as any[]).map((task: any) => {
                  const StatusIcon = statusIcons[task.status as keyof typeof statusIcons] || Circle;
                  const statusColor = statusColors[task.status as keyof typeof statusColors] || 'text-gray-400';
                  
                  return (
                    <Card key={task.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <StatusIcon className={`h-5 w-5 ${statusColor}`} />
                              <h4 className="font-medium">{task.title}</h4>
                              {task.priority && (
                                <Badge 
                                  variant="secondary"
                                  className={priorityColors[task.priority as keyof typeof priorityColors]}
                                >
                                  {task.priority}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {task.status}
                              </Badge>
                            </div>
                            
                            {task.description && (
                              <p className="text-sm text-gray-600 mb-3">{task.description}</p>
                            )}
                            
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                <span>
                                  {format(new Date(task.startDate), 'MMM d')} - {format(new Date(task.endDate), 'MMM d')}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                <span>{task.duration} days</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end gap-2">
                            <div className="text-right">
                              <div className="text-sm font-medium">{task.progress || 0}% complete</div>
                              <div className="w-20 bg-gray-200 rounded-full h-2 mt-1">
                                <div
                                  className="bg-blue-600 h-2 rounded-full transition-all"
                                  style={{ width: `${task.progress || 0}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}