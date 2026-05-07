import React, { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Loader2, Calendar as CalendarIcon, List, Filter } from 'lucide-react';
import { Link } from 'wouter';
import { differenceInDays } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../hooks/use-toast';
// FullCalendar styles are automatically imported with the component

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  projectId: number;
  projectName?: string;
  status: string;
  priority: string;
  progress: number;
  assignedTo?: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps: {
    taskId: number;
    originalTask: any;
  };
}

interface GlobalScheduleCalendarProps {
  projectId?: string;
}

export function GlobalScheduleCalendar({ projectId }: GlobalScheduleCalendarProps = {}) {
  // Fetch tasks from multiple projects or specific project
  const { data: tasks = [], isLoading, error } = useQuery<any[]>({
    queryKey: projectId ? [`/api/projects/${projectId}/schedule`] : ['/api/tasks/all-active'],
    queryFn: async () => {
      if (projectId) {
        const response = await fetch(`/api/projects/${projectId}/schedule`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          },
        });
        if (!response.ok) throw new Error('Failed to fetch project schedule');
        const data = await response.json();
        return data.tasks || [];
      } else {
        // Fallback to global tasks if no projectId
        const response = await fetch('/api/tasks/all-active', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          },
        });
        if (!response.ok) throw new Error('Failed to fetch tasks');
        return response.json();
      }
    },
    retry: 2,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: false,
  });
  
  const [filterProject, setFilterProject] = useState<string>('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Task update mutation for drag-and-drop with project-specific endpoint
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates, taskProjectId }: { taskId: number; updates: any; taskProjectId: number }) => {
      const response = await fetch(`/api/projects/${taskProjectId}/tasks/${taskId}/dates`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update task dates');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate both global and project-specific queries
      queryClient.invalidateQueries({ queryKey: ['project-schedule', variables.taskProjectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/all-active'] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule`] });
      }
      toast({
        title: "Task Updated",
        description: "Task dates have been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update task dates",
        variant: "destructive",
      });
    },
  });

  // Convert tasks to FullCalendar events
  const events: CalendarEvent[] = useMemo(() => {
    if (!tasks) return [];

    return tasks
      .filter(task => filterProject === 'all' || task.projectId.toString() === filterProject)
      .map(task => {
        // Get colors based on status
        let backgroundColor = '#3174ad';
        let borderColor = '#3174ad';
        let textColor = 'white';

        switch (task.status) {
          case 'Complete':
          case 'completed':
            backgroundColor = '#10b981';
            borderColor = '#059669';
            break;
          case 'In Progress':
          case 'in_progress':
            backgroundColor = '#f59e0b';
            borderColor = '#d97706';
            break;
          case 'On Hold':
          case 'on_hold':
            backgroundColor = '#ef4444';
            borderColor = '#dc2626';
            break;
          case 'Not Started':
          case 'not_started':
            backgroundColor = '#6b7280';
            borderColor = '#4b5563';
            break;
        }

        return {
          id: task.id.toString(),
          title: `${task.title} (P${task.projectId})`,
          start: task.startDate,
          end: task.endDate,
          projectId: task.projectId,
          status: task.status,
          priority: task.priority,
          progress: task.progress || 0,
          assignedTo: task.assignedTo,
          backgroundColor,
          borderColor,
          textColor,
          extendedProps: {
            taskId: task.id,
            originalTask: task,
          },
        };
      });
  }, [tasks, filterProject]);

  // Get unique projects for filter
  const projects = useMemo(() => {
    if (!tasks) return [];
    const uniqueProjects = new Map();
    tasks.forEach((task: any) => {
      if (!uniqueProjects.has(task.projectId)) {
        uniqueProjects.set(task.projectId, {
          id: task.projectId,
          name: `Project ${task.projectId}`, // You might want to fetch actual project names
        });
      }
    });
    return Array.from(uniqueProjects.values());
  }, [tasks]);

  // Handle event drop (drag and drop)
  const handleEventDrop = async (info: any) => {
    const { event } = info;
    const taskId = event.extendedProps.taskId;
    const originalTask = event.extendedProps.originalTask;
    const taskProjectId = event.extendedProps.originalTask.projectId;
    
    try {
      // Update the task with new dates
      const newStartDate = event.start.toISOString().split('T')[0];
      const newEndDate = event.end ? event.end.toISOString().split('T')[0] : newStartDate;

      await updateTaskMutation.mutateAsync({
        taskId,
        taskProjectId,
        updates: {
          startDate: newStartDate,
          endDate: newEndDate,
        },
      });

      toast({
        title: "Task Updated",
        description: `${event.title} has been rescheduled`,
      });

      // Optionally trigger cascade updates if there are dependencies
      // This would require additional logic based on your backend implementation
      
    } catch (error) {
      console.error('Failed to update task:', error);
      
      // Revert the change on error
      info.revert();
      
      toast({
        title: "Update Failed",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle event resize
  const handleEventResize = async (info: any) => {
    const { event } = info;
    const taskId = event.extendedProps.taskId;
    const taskProjectId = event.extendedProps.originalTask.projectId;
    
    try {
      const newEndDate = event.end ? event.end.toISOString().split('T')[0] : event.start.toISOString().split('T')[0];

      await updateTaskMutation.mutateAsync({
        taskId,
        taskProjectId,
        updates: {
          endDate: newEndDate,
        },
      });

      toast({
        title: "Task Duration Updated",
        description: `${event.title} duration has been updated`,
      });
      
    } catch (error) {
      console.error('Failed to resize task:', error);
      
      // Revert the change on error
      info.revert();
      
      toast({
        title: "Update Failed",
        description: "Failed to update task duration. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle event click
  const handleEventClick = (info: any) => {
    const { event } = info;
    const projectId = event.extendedProps.originalTask.projectId;
    
    // Navigate to project schedule view
    window.location.href = `/projects/${projectId}/schedule`;
  };



  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Global Schedule Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600">Loading schedule data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Global Schedule Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <p className="text-red-600 mb-4">Failed to load schedule data</p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Global Schedule Calendar
            <div className="w-2 h-2 bg-green-500 rounded-full" title="Connected for real-time updates" />
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* Project Filter */}
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="px-3 py-1 border rounded-md text-sm"
            >
              <option value="all">All Projects</option>
              {projects.map(project => (
                <option key={project.id} value={project.id.toString()}>
                  {project.name}
                </option>
              ))}
            </select>

            {/* Note: View switching is now handled by FullCalendar's built-in header toolbar */}
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>Total Tasks: {events.length}</span>
          <span>Projects: {projects.length}</span>
          <span>
            Completed: {events.filter(e => e.status === 'completed').length}
          </span>
          <span>
            In Progress: {events.filter(e => e.status === 'in_progress').length}
          </span>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="h-[600px] p-4">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            events={events}
            editable={true}
            droppable={true}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
            eventClick={handleEventClick}
            height="auto"
            dayMaxEvents={3}
            eventDisplay="block"
            eventTextColor="white"
            eventTimeFormat={{
              hour: 'numeric',
              minute: '2-digit',
              omitZeroMinute: true,
              meridiem: 'short'
            }}
            slotMinTime="06:00:00"
            slotMaxTime="20:00:00"
            weekends={true}
            businessHours={{
              daysOfWeek: [1, 2, 3, 4, 5], // Monday - Friday
              startTime: '08:00',
              endTime: '18:00',
            }}
            eventClassNames={(arg) => {
              const priority = arg.event.extendedProps.originalTask?.priority;
              return priority === 'critical' ? 'critical-task' : '';
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}