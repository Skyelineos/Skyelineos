import React, { useRef, useEffect, useState, useCallback } from 'react';
import { format, addDays, differenceInDays, isWeekend, isSameDay, startOfWeek, endOfWeek, eachWeekOfInterval, eachDayOfInterval } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ZoomIn, ZoomOut, Calendar, Users, Clock, AlertCircle, Plus, CalendarDays } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Task {
  id: string;
  wbs: string;
  title: string;
  owner: string;
  startDate: Date;
  endDate: Date;
  duration: number;
  progress: number;
  phase: string;
  trade: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
  dependencies: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  weather_dependent?: boolean;
  inspector_required?: boolean;
}

interface PhaseGanttChartProps {
  tasks: Task[];
  phases: string[];
  onTaskClick?: (task: Task) => void;
  onTaskDrag?: (taskId: string, newStartDate: Date) => void;
  onTaskResize?: (taskId: string, newDuration: number) => void;
  onAddTask?: (task: Omit<Task, 'id'>) => void;
  className?: string;
}

const PHASE_COLOR_PALETTE = [
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Yellow
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#ec4899', // Pink
  '#84cc16', // Lime
  '#6366f1', // Indigo
];

const getPhaseColor = (phaseIndex: number): string => {
  return PHASE_COLOR_PALETTE[phaseIndex % PHASE_COLOR_PALETTE.length];
};

const STATUS_COLORS = {
  'not_started': '#6b7280',
  'in_progress': '#3b82f6',
  'completed': '#10b981',
  'delayed': '#ef4444'
};

export function PhaseGanttChart({ 
  tasks, 
  phases,
  onTaskClick, 
  onTaskDrag, 
  onTaskResize,
  onAddTask,
  className = '' 
}: PhaseGanttChartProps) {
  const [zoom, setZoom] = useState(1);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'gantt' | 'calendar'>('gantt');
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    owner: '',
    phase: phases[0] || '',
    trade: '',
    duration: 1,
    priority: 'medium' as const
  });
  const chartRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Calculate date range for the chart
  const dateRange = React.useMemo(() => {
    if (tasks.length === 0) {
      const start = new Date();
      return {
        start,
        end: addDays(start, 84), // 12 weeks
        totalDays: 84
      };
    }

    const allDates = tasks.flatMap(task => [task.startDate, task.endDate]);
    const earliest = new Date(Math.min(...allDates.map(d => d.getTime())));
    const latest = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    // Align to week boundaries
    const start = startOfWeek(earliest, { weekStartsOn: 1 }); // Monday
    const end = endOfWeek(addDays(latest, 7), { weekStartsOn: 1 });
    const totalDays = differenceInDays(end, start);

    return { start, end, totalDays };
  }, [tasks]);

  // Calculate weeks per phase dynamically
  const phaseWeekData = React.useMemo(() => {
    const totalWeeks = Math.ceil(dateRange.totalDays / 7);
    const weeksPerPhase = Math.ceil(totalWeeks / phases.length);
    
    return phases.map((phaseName, index) => {
      const remainingWeeks = Math.max(0, totalWeeks - weeksPerPhase * index);
      const phaseWeeks = index === phases.length - 1 
        ? remainingWeeks // Last phase gets all remaining weeks
        : Math.min(weeksPerPhase, remainingWeeks);
      
      return {
        name: phaseName,
        weeks: phaseWeeks,
        color: getPhaseColor(index)
      };
    }).filter(phase => phase.weeks > 0);
  }, [dateRange.totalDays, phases]);

  // Chart dimensions
  const dayWidth = 32 * zoom;
  const taskHeight = 36;
  const taskPadding = 2;
  const labelColumnWidths = {
    wbs: 80,
    title: 200,
    owner: 120,
    startDate: 100,
    endDate: 100,
    duration: 80,
    progress: 100
  };

  // Handle task dragging
  const handleMouseDown = useCallback((e: React.MouseEvent, task: Task) => {
    if (!onTaskDrag) return;
    
    e.preventDefault();
    setDraggedTask(task.id);
    
    const rect = chartRef.current?.getBoundingClientRect();
    if (rect) {
      const totalLabelWidth = Object.values(labelColumnWidths).reduce((a, b) => a + b, 0);
      const clickX = e.clientX - rect.left - totalLabelWidth;
      const taskStartX = differenceInDays(task.startDate, dateRange.start) * dayWidth;
      setDragOffset(clickX - taskStartX);
    }
  }, [onTaskDrag, dateRange.start, dayWidth, labelColumnWidths]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggedTask || !onTaskDrag) return;

    const rect = chartRef.current?.getBoundingClientRect();
    if (rect) {
      const totalLabelWidth = Object.values(labelColumnWidths).reduce((a, b) => a + b, 0);
      const mouseX = e.clientX - rect.left - totalLabelWidth - dragOffset;
      const dayIndex = Math.round(mouseX / dayWidth);
      const newStartDate = addDays(dateRange.start, dayIndex);
      
      onTaskDrag(draggedTask, newStartDate);
    }
  }, [draggedTask, onTaskDrag, dateRange.start, dayWidth, dragOffset, labelColumnWidths]);

  const handleMouseUp = useCallback(() => {
    setDraggedTask(null);
    setDragOffset(0);
  }, []);

  // Add new task handler
  const handleAddTask = () => {
    if (!newTask.title.trim() || !onAddTask) return;
    
    const taskData = {
      wbs: `${tasks.length + 1}`,
      title: newTask.title,
      owner: newTask.owner || 'Unassigned',
      startDate: new Date(),
      endDate: addDays(new Date(), newTask.duration),
      duration: newTask.duration,
      progress: 0,
      phase: newTask.phase,
      trade: newTask.trade || 'General',
      status: 'not_started' as const,
      dependencies: [],
      priority: newTask.priority,
      weather_dependent: false,
      inspector_required: false
    };
    
    onAddTask(taskData);
    setNewTask({
      title: '',
      owner: '',
      phase: phases[0] || '',
      trade: '',
      duration: 1,
      priority: 'medium'
    });
    setShowAddTask(false);
  };

  // Render phase headers
  const renderPhaseHeaders = () => {
    let weekOffset = 0;
    return phaseWeekData.map(phase => {
      const phaseWeeks = phase.weeks;
      const totalDays = phaseWeeks * 7;
      weekOffset += phaseWeeks;
      
      return (
        <th
          key={phase.name}
          className="text-xs font-semibold text-center border border-gray-300"
          style={{ 
            width: `${totalDays * dayWidth}px`,
            backgroundColor: phase.color + '20',
            borderTopColor: phase.color,
            borderTopWidth: '3px'
          }}
        >
          {phase.name}
        </th>
      );
    });
  };

  // Render week headers
  const renderWeekHeaders = () => {
    const weeks = eachWeekOfInterval({
      start: dateRange.start,
      end: dateRange.end
    }, { weekStartsOn: 1 });

    return weeks.map((week, index) => (
      <th
        key={index}
        className="text-xs font-medium text-center border border-gray-300 bg-gray-50"
        style={{ width: `${7 * dayWidth}px` }}
      >
        WEEK {index + 1}
      </th>
    ));
  };

  // Render day headers
  const renderDayHeaders = () => {
    const days = eachDayOfInterval({
      start: dateRange.start,
      end: dateRange.end
    });

    return days.map((day, index) => {
      const isWeekendDay = isWeekend(day);
      if (isWeekendDay) return null; // Skip weekends as per requirement
      
      const dayLetter = format(day, 'EEEEE'); // M, T, W, R, F
      
      return (
        <th
          key={index}
          className={`text-xs font-medium text-center border border-gray-300 ${
            isWeekendDay ? 'bg-gray-100' : 'bg-white'
          }`}
          style={{ width: `${dayWidth}px` }}
        >
          {dayLetter}
        </th>
      );
    });
  };

  // Render task row
  const renderTaskRow = (task: Task, index: number) => {
    const startDayIndex = differenceInDays(task.startDate, dateRange.start);
    const endDayIndex = differenceInDays(task.endDate, dateRange.start);
    const taskDays = endDayIndex - startDayIndex + 1;
    
    // Generate day cells for this task
    const taskCells = [];
    const totalDays = differenceInDays(dateRange.end, dateRange.start) + 1;
    
    for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
      const currentDate = addDays(dateRange.start, dayIndex);
      const isWeekendDay = isWeekend(currentDate);
      if (isWeekendDay) continue; // Skip weekends
      
      const isTaskDay = dayIndex >= startDayIndex && dayIndex <= endDayIndex;
      const isFirstDay = dayIndex === startDayIndex;
      const isLastDay = dayIndex === endDayIndex;
      
      taskCells.push(
        <td
          key={dayIndex}
          className={`border border-gray-200 relative ${
            isWeekendDay ? 'bg-gray-50' : 'bg-white'
          }`}
          style={{ width: `${dayWidth}px`, height: `${taskHeight}px` }}
        >
          {isTaskDay && (
            <div
              className={`absolute inset-1 cursor-move rounded flex items-center justify-center text-xs font-medium text-white shadow-sm ${
                draggedTask === task.id ? 'opacity-50' : ''
              }`}
              style={{
                backgroundColor: STATUS_COLORS[task.status],
                left: isFirstDay ? '2px' : '0px',
                right: isLastDay ? '2px' : '0px'
              }}
              onMouseDown={(e) => handleMouseDown(e, task)}
              onClick={() => onTaskClick?.(task)}
              title={`${task.title} - ${task.progress}% complete`}
            >
              {isFirstDay && (
                <div className="flex items-center gap-1">
                  <span className="truncate">{task.title}</span>
                  {task.weather_dependent && <span title="Weather Dependent">☀</span>}
                  {task.inspector_required && <AlertCircle className="w-3 h-3" />}
                </div>
              )}
              {!isFirstDay && !isLastDay && (
                <div className="w-full h-full bg-current opacity-80"></div>
              )}
            </div>
          )}
        </td>
      );
    }

    return (
      <tr key={task.id} className="hover:bg-gray-50">
        {/* Fixed columns */}
        <td className="border border-gray-200 px-2 py-1 text-xs font-medium" style={{ width: `${labelColumnWidths.wbs}px` }}>
          {task.wbs}
        </td>
        <td className="border border-gray-200 px-2 py-1 text-xs" style={{ width: `${labelColumnWidths.title}px` }}>
          <div className="flex items-center gap-2">
            <span className="truncate">{task.title}</span>
            <Badge variant="outline" className="text-xs">
              {task.priority}
            </Badge>
          </div>
        </td>
        <td className="border border-gray-200 px-2 py-1 text-xs" style={{ width: `${labelColumnWidths.owner}px` }}>
          {task.owner}
        </td>
        <td className="border border-gray-200 px-2 py-1 text-xs" style={{ width: `${labelColumnWidths.startDate}px` }}>
          {format(task.startDate, 'M/d/yy')}
        </td>
        <td className="border border-gray-200 px-2 py-1 text-xs" style={{ width: `${labelColumnWidths.endDate}px` }}>
          {format(task.endDate, 'M/d/yy')}
        </td>
        <td className="border border-gray-200 px-2 py-1 text-xs text-center" style={{ width: `${labelColumnWidths.duration}px` }}>
          {task.duration}
        </td>
        <td className="border border-gray-200 px-2 py-1 text-xs" style={{ width: `${labelColumnWidths.progress}px` }}>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div 
                className="h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${task.progress}%`,
                  backgroundColor: STATUS_COLORS[task.status]
                }}
              />
            </div>
            <span className="text-xs font-medium">{task.progress}%</span>
          </div>
        </td>
        
        {/* Timeline cells */}
        {taskCells}
      </tr>
    );
  };

  // Render dependency lines
  const renderDependencies = () => {
    const lines: JSX.Element[] = [];
    
    tasks.forEach((task, taskIndex) => {
      task.dependencies.forEach((depId) => {
        const dependency = tasks.find(t => t.id === depId);
        if (!dependency) return;

        const depIndex = tasks.findIndex(t => t.id === depId);
        
        const depEndX = (differenceInDays(dependency.endDate, dateRange.start) + 1) * dayWidth;
        const depY = depIndex * (taskHeight + taskPadding) + taskHeight / 2;
        
        const taskStartX = differenceInDays(task.startDate, dateRange.start) * dayWidth;
        const taskY = taskIndex * (taskHeight + taskPadding) + taskHeight / 2;

        lines.push(
          <g key={`${depId}-${task.id}`}>
            {/* Dependency line */}
            <path
              d={`M ${depEndX} ${depY} L ${taskStartX - 10} ${depY} L ${taskStartX - 10} ${taskY} L ${taskStartX} ${taskY}`}
              stroke="#6b7280"
              strokeWidth="2"
              fill="none"
              strokeDasharray="4,4"
            />
            {/* Arrow head */}
            <polygon
              points={`${taskStartX},${taskY} ${taskStartX - 6},${taskY - 3} ${taskStartX - 6},${taskY + 3}`}
              fill="#6b7280"
            />
          </g>
        );
      });
    });

    return lines;
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Phase-Based Gantt Schedule
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'gantt' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('gantt')}
              >
                Gantt
              </Button>
              <Button
                variant={viewMode === 'calendar' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('calendar')}
              >
                <CalendarDays className="w-4 h-4 mr-1" />
                Calendar
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddTask(true)}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </Button>
            <div className="h-4 w-px bg-gray-300" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
              disabled={zoom <= 0.5}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium">{Math.round(zoom * 100)}%</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom(Math.min(2, zoom + 0.25))}
              disabled={zoom >= 2}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === 'gantt' ? (
          /* Gantt Chart Table with Side Scroll */
          <div 
            ref={chartRef}
            className="relative overflow-auto border border-gray-300"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ maxHeight: '600px' }}
          >
            <table className="table-fixed" style={{ minWidth: `${labelColumnWidths.wbs + labelColumnWidths.title + labelColumnWidths.owner + labelColumnWidths.startDate + labelColumnWidths.endDate + labelColumnWidths.duration + labelColumnWidths.progress + (dateRange.totalDays * dayWidth)}px` }}>
              <thead>
                {/* Phase headers */}
                <tr>
                  <th className="border border-gray-300 bg-gray-100 text-xs font-semibold sticky left-0 z-20" style={{ width: `${labelColumnWidths.wbs}px` }}>WBS NUMBER</th>
                  <th className="border border-gray-300 bg-gray-100 text-xs font-semibold sticky left-16 z-20" style={{ width: `${labelColumnWidths.title}px` }}>TASK TITLE</th>
                  <th className="border border-gray-300 bg-gray-100 text-xs font-semibold sticky left-[264px] z-20" style={{ width: `${labelColumnWidths.owner}px` }}>TASK OWNER</th>
                  <th className="border border-gray-300 bg-gray-100 text-xs font-semibold sticky left-[352px] z-20" style={{ width: `${labelColumnWidths.startDate}px` }}>START DATE</th>
                  <th className="border border-gray-300 bg-gray-100 text-xs font-semibold sticky left-[440px] z-20" style={{ width: `${labelColumnWidths.endDate}px` }}>DUE DATE</th>
                  <th className="border border-gray-300 bg-gray-100 text-xs font-semibold sticky left-[528px] z-20" style={{ width: `${labelColumnWidths.duration}px` }}>DURATION</th>
                  <th className="border border-gray-300 bg-gray-100 text-xs font-semibold sticky left-[596px] z-20" style={{ width: `${labelColumnWidths.progress}px` }}>PCT OF TASK COMPLETE</th>
                  {renderPhaseHeaders()}
                </tr>
                
                {/* Week headers */}
                <tr>
                  <th colSpan={7} className="border border-gray-300 sticky left-0 z-20 bg-gray-50"></th>
                  {renderWeekHeaders()}
                </tr>
                
                {/* Day headers */}
                <tr>
                  <th colSpan={7} className="border border-gray-300 sticky left-0 z-20 bg-gray-50"></th>
                  {renderDayHeaders()}
                </tr>
              </thead>
              
              <tbody>
                {tasks.map((task, index) => renderTaskRow(task, index))}
              </tbody>
            </table>

            {/* Dependencies overlay */}
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ zIndex: 5 }}
            >
              {renderDependencies()}
            </svg>
          </div>
        ) : (
          /* Calendar View */
          <div className="p-4">
            <div className="grid grid-cols-7 gap-1 mb-4">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="p-2 text-center text-sm font-semibold bg-gray-100 rounded">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {eachDayOfInterval({
                start: startOfWeek(dateRange.start),
                end: endOfWeek(dateRange.end)
              }).map(day => {
                const dayTasks = tasks.filter(task => 
                  day >= task.startDate && day <= task.endDate
                );
                return (
                  <div key={day.toISOString()} className="min-h-[100px] p-1 border rounded bg-white">
                    <div className="text-sm font-medium mb-1">
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1">
                      {dayTasks.slice(0, 3).map(task => (
                        <div
                          key={task.id}
                          className="text-xs p-1 rounded truncate cursor-pointer"
                          style={{
                            backgroundColor: STATUS_COLORS[task.status] + '20',
                            borderLeft: `3px solid ${STATUS_COLORS[task.status]}`
                          }}
                          onClick={() => onTaskClick?.(task)}
                        >
                          {task.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-xs text-gray-500">
                          +{dayTasks.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add Task Dialog */}
        <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Task</DialogTitle>
              <DialogDescription>
                Create a new task and assign it to a phase.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="task-title">Task Title</Label>
                <Input
                  id="task-title"
                  value={newTask.title}
                  onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter task title"
                />
              </div>
              
              <div>
                <Label htmlFor="task-owner">Task Owner</Label>
                <Input
                  id="task-owner"
                  value={newTask.owner}
                  onChange={(e) => setNewTask(prev => ({ ...prev, owner: e.target.value }))}
                  placeholder="Assign to someone"
                />
              </div>
              
              <div>
                <Label htmlFor="task-phase">Phase</Label>
                <Select value={newTask.phase} onValueChange={(value) => setNewTask(prev => ({ ...prev, phase: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select phase" />
                  </SelectTrigger>
                  <SelectContent>
                    {phases.map(phase => (
                      <SelectItem key={phase} value={phase}>{phase}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="task-trade">Trade</Label>
                <Input
                  id="task-trade"
                  value={newTask.trade}
                  onChange={(e) => setNewTask(prev => ({ ...prev, trade: e.target.value }))}
                  placeholder="e.g., Electrical, Plumbing"
                />
              </div>
              
              <div>
                <Label htmlFor="task-duration">Duration (days)</Label>
                <Input
                  id="task-duration"
                  type="number"
                  min="1"
                  value={newTask.duration}
                  onChange={(e) => setNewTask(prev => ({ ...prev, duration: parseInt(e.target.value) || 1 }))}
                />
              </div>
              
              <div>
                <Label htmlFor="task-priority">Priority</Label>
                <Select value={newTask.priority} onValueChange={(value: any) => setNewTask(prev => ({ ...prev, priority: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
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
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddTask(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddTask} disabled={!newTask.title.trim()}>
                Add Task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span>In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span>Delayed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-500 rounded"></div>
            <span>Not Started</span>
          </div>
          <div className="flex items-center gap-2">
            <span>☀</span>
            <span>Weather Dependent</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3 h-3" />
            <span>Inspection Required</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}