import React, { useRef, useEffect, useState, useCallback } from 'react';
import { gantt } from 'dhtmlx-gantt';
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css';
import { formatISO, parseISO } from 'date-fns';
import { useProjectSchedule, type Task as ScheduleTask, type Dependency as ScheduleDependency } from '../../hooks/useProjectSchedule';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../ui/button';
import { RefreshCw, Plus, Wand2, List, Calendar, BarChart3 } from 'lucide-react';
import { GanttLoadingSkeleton } from './GanttLoadingSkeleton';
import './DhtmlxScheduleSection.css';

interface DhtmlxScheduleSectionProps {
  projectId: number;
  readonly?: boolean;
}

export default function DhtmlxScheduleSection({ projectId, readonly = false }: DhtmlxScheduleSectionProps) {
  const ganttContainer = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ScheduleTask | null>(null);
  const [isTaskEditModalOpen, setIsTaskEditModalOpen] = useState(false);
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'gantt' | 'calendar' | 'list'>('gantt');
  const { toast } = useToast();

  // Hooks for data fetching and mutations
  const { 
    tasks = [], 
    dependencies = [], 
    isLoading, 
    refetch,
    createTask,
    generateSchedule
  } = useProjectSchedule(projectId.toString());

  // Initialize gantt chart
  useEffect(() => {
    if (!ganttContainer.current) return;

    // Basic gantt configuration
    gantt.config.date_format = "%Y-%m-%d";
    gantt.config.xml_date = "%Y-%m-%d";
    gantt.config.row_height = 40;
    gantt.config.task_height = 28;
    gantt.config.grid_width = 350;
    gantt.config.fit_tasks = true;
    gantt.config.auto_scheduling = false;
    gantt.config.auto_types = false;
    gantt.config.show_links = true;
    gantt.config.show_progress = true;
    gantt.config.show_chart = true;
    gantt.config.readonly = readonly;

    // Grid columns configuration
    gantt.config.columns = [
      { name: "text", label: "Task", width: 200, tree: true },
      { name: "start_date", label: "Start", width: 85, align: "center" },
      { name: "duration", label: "Days", width: 65, align: "center" }
    ];

    // Timeline scale
    gantt.config.scale_unit = "week";
    gantt.config.date_scale = "%F %Y";
    gantt.config.subscales = [
      { unit: "day", step: 1, date: "%j %D" }
    ];
    gantt.config.scale_height = 60;

    // Task click event
    gantt.attachEvent("onTaskClick", function(id: string, e: Event) {
      const task = tasks.find((t: ScheduleTask) => t.id === parseInt(id));
      if (task) {
        setSelectedTask(task);
        setIsTaskEditModalOpen(true);
      }
      return true;
    });

    // Initialize gantt
    gantt.init(ganttContainer.current);
    setIsInitialized(true);

    return () => {
      gantt.detachAllEvents();
      gantt.clearAll();
      setIsInitialized(false);
    };
  }, []);

  // Update gantt data when tasks change
  useEffect(() => {
    if (!isInitialized || isLoading || !tasks) return;

    // Transform tasks for gantt
    const ganttTasks = tasks.map((task: ScheduleTask) => ({
      id: task.id.toString(),
      text: task.title,
      start_date: task.startDate,
      end_date: task.endDate,
      duration: task.duration,
      progress: task.progress / 100,
      type: task.category === 'phase' ? 'project' : 'task'
    }));

    // Transform dependencies for gantt
    const ganttLinks = dependencies.map((dep: ScheduleDependency) => ({
      id: dep.id.toString(),
      source: dep.fromTaskId.toString(),
      target: dep.toTaskId.toString(),
      type: "0" // finish_to_start
    }));

    gantt.parse({
      data: ganttTasks,
      links: ganttLinks
    });
  }, [isInitialized, tasks, dependencies, isLoading]);

  // Handle Add Task
  const handleAddTask = useCallback(() => {
    if (readonly) return;
    
    const newTask: ScheduleTask = {
      id: 0,
      projectId: projectId,
      title: 'New Task',
      description: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      duration: 1,
      status: 'not_started',
      progress: 0,
      priority: 'medium',
      category: ''
    };
    
    setSelectedTask(newTask);
    setIsAddTaskModalOpen(true);
  }, [readonly, projectId]);

  // Handle Auto Generate Schedule
  const handleAutoGenerateSchedule = useCallback(async () => {
    if (readonly) return;
    
    try {
      await generateSchedule();
      toast({
        title: "Schedule Generated",
        description: "Successfully auto-generated schedule from estimates.",
      });
      refetch();
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Failed to auto-generate schedule. Please try again.",
        variant: "destructive",
      });
    }
  }, [readonly, generateSchedule, refetch, toast]);

  if (isLoading) {
    return <GanttLoadingSkeleton />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 p-4 bg-background border rounded-lg">
        <div className="flex items-center space-x-2">
          <h2 className="text-lg font-semibold">Project Schedule</h2>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center border rounded-lg p-1">
            <Button
              variant={currentView === 'gantt' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('gantt')}
              className="px-3 py-1"
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              Gantt
            </Button>
            <Button
              variant={currentView === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('calendar')}
              className="px-3 py-1"
            >
              <Calendar className="h-4 w-4 mr-1" />
              Calendar
            </Button>
            <Button
              variant={currentView === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('list')}
              className="px-3 py-1"
            >
              <List className="h-4 w-4 mr-1" />
              List
            </Button>
          </div>

          {!readonly && (
            <>
              <Button
                onClick={handleAddTask}
                size="sm"
                className="px-3 py-2"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Task
              </Button>

              <Button
                onClick={handleAutoGenerateSchedule}
                size="sm"
                variant="outline"
                className="px-3 py-2"
              >
                <Wand2 className="h-4 w-4 mr-1" />
                Generate Schedule
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        {/* Gantt View */}
        {currentView === 'gantt' && (
          <div
            ref={ganttContainer}
            className="dhtmlx-gantt-container w-full h-full"
            style={{ height: '600px', minHeight: '400px' }}
          />
        )}

        {/* Calendar View */}
        {currentView === 'calendar' && (
          <div className="h-full min-h-[600px] p-4">
            <div className="text-center text-gray-500">Calendar View - Coming Soon</div>
          </div>
        )}

        {/* List View */}
        {currentView === 'list' && (
          <div className="h-full min-h-[600px] p-4">
            <div className="space-y-2">
              {tasks.map((task: ScheduleTask) => (
                <div key={task.id} className="p-3 border rounded-lg">
                  <h4 className="font-medium">{task.title}</h4>
                  <p className="text-sm text-gray-600">{task.description}</p>
                  <div className="flex gap-4 text-sm text-gray-500 mt-2">
                    <span>Start: {task.startDate}</span>
                    <span>End: {task.endDate}</span>
                    <span>Progress: {task.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Task Details Modal */}
      {selectedTask && isTaskEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Task Details</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Title</label>
                <p className="text-gray-700">{selectedTask.title}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <p className="text-gray-700">{selectedTask.description || 'No description'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Start Date</label>
                  <p className="text-gray-700">{selectedTask.startDate}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">End Date</label>
                  <p className="text-gray-700">{selectedTask.endDate}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <p className="text-gray-700 capitalize">{selectedTask.status.replace('_', ' ')}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Progress</label>
                  <p className="text-gray-700">{selectedTask.progress}%</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <Button onClick={() => setIsTaskEditModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}