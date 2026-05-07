import React, { useRef, useEffect, useState, useCallback } from 'react';
import { format, addDays, differenceInDays, isWeekend, isSameDay } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ZoomIn, ZoomOut, Calendar, Users, Clock, AlertCircle } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  trade: string;
  duration: number;
  startDate: Date;
  endDate: Date;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
  dependencies: string[];
  assignedTo?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  progress?: number; // 0-100
  estimatedCost?: number;
  actualCost?: number;
  weather_dependent?: boolean;
  inspector_required?: boolean;
}

interface GanttChartProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  onTaskDrag?: (taskId: string, newStartDate: Date) => void;
  onTaskResize?: (taskId: string, newDuration: number) => void;
  className?: string;
}

const TRADE_COLORS = {
  'Excavation': '#ea580c',
  'Foundation': '#475569',
  'Framing': '#eab308',
  'Roofing': '#dc2626',
  'Plumbing': '#2563eb',
  'Electrical': '#f59e0b',
  'HVAC': '#16a34a',
  'Insulation': '#ec4899',
  'Drywall': '#6366f1',
  'Flooring': '#9333ea',
  'Painting': '#0d9488',
  'Cabinets': '#059669',
  'Countertops': '#64748b',
  'Landscaping': '#84cc16',
  'Final Inspection': '#e11d48'
};

const STATUS_COLORS = {
  'not_started': '#6b7280',
  'in_progress': '#3b82f6',
  'completed': '#10b981',
  'delayed': '#ef4444'
};

const PRIORITY_INDICATORS = {
  'low': '○',
  'medium': '◐',
  'high': '●',
  'critical': '⚠'
};

export function GanttChart({ 
  tasks, 
  onTaskClick, 
  onTaskDrag, 
  onTaskResize,
  className = '' 
}: GanttChartProps) {
  const [zoom, setZoom] = useState(1);
  const [viewStartDate, setViewStartDate] = useState(new Date());
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartBounds, setChartBounds] = useState({ width: 0, height: 0 });

  // Calculate date range for the chart
  const dateRange = React.useMemo(() => {
    if (tasks.length === 0) {
      const start = new Date();
      return {
        start,
        end: addDays(start, 90),
        totalDays: 90
      };
    }

    const allDates = tasks.flatMap(task => [task.startDate, task.endDate]);
    const earliest = new Date(Math.min(...allDates.map(d => d.getTime())));
    const latest = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    // Add buffer days
    const start = addDays(earliest, -7);
    const end = addDays(latest, 14);
    const totalDays = differenceInDays(end, start);

    return { start, end, totalDays };
  }, [tasks]);

  // Chart dimensions
  const dayWidth = 40 * zoom;
  const taskHeight = 32;
  const taskPadding = 8;
  const headerHeight = 60;
  const labelWidth = 200;

  // Update chart bounds
  useEffect(() => {
    if (chartRef.current) {
      const rect = chartRef.current.getBoundingClientRect();
      setChartBounds({ width: rect.width, height: rect.height });
    }
  }, [zoom, tasks]);

  // Handle task dragging
  const handleMouseDown = useCallback((e: React.MouseEvent, task: Task) => {
    if (!onTaskDrag) return;
    
    e.preventDefault();
    setDraggedTask(task.id);
    
    const rect = chartRef.current?.getBoundingClientRect();
    if (rect) {
      const clickX = e.clientX - rect.left - labelWidth;
      const taskStartX = differenceInDays(task.startDate, dateRange.start) * dayWidth;
      setDragOffset(clickX - taskStartX);
    }
  }, [onTaskDrag, dateRange.start, dayWidth, labelWidth]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggedTask || !onTaskDrag) return;

    const rect = chartRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left - labelWidth - dragOffset;
      const dayIndex = Math.round(mouseX / dayWidth);
      const newStartDate = addDays(dateRange.start, dayIndex);
      
      onTaskDrag(draggedTask, newStartDate);
    }
  }, [draggedTask, onTaskDrag, dateRange.start, dayWidth, dragOffset, labelWidth]);

  const handleMouseUp = useCallback(() => {
    setDraggedTask(null);
    setDragOffset(0);
  }, []);

  // Generate timeline header with month headers
  const renderTimelineHeader = () => {
    const days = [];
    const { start, totalDays } = dateRange;

    for (let i = 0; i < totalDays; i++) {
      const currentDate = addDays(start, i);
      const isToday = isSameDay(currentDate, new Date());
      const isWeekendDay = isWeekend(currentDate);
      const isFirstOfMonth = currentDate.getDate() === 1;
      const prevDate = i > 0 ? addDays(start, i - 1) : null;
      const showMonthHeader = isFirstOfMonth || (i === 0) || (prevDate && format(currentDate, 'MMM yyyy') !== format(prevDate, 'MMM yyyy'));

      days.push(
        <div
          key={i}
          className={`flex flex-col border-r border-gray-200 ${
            isWeekendDay ? 'bg-gray-50' : 'bg-white'
          } ${isToday ? 'bg-blue-50 border-blue-300' : ''}`}
          style={{ minWidth: `${dayWidth}px` }}
        >
          {/* Month header */}
          {showMonthHeader && (
            <div className="text-xs px-1 py-0.5 text-center bg-blue-100 text-blue-800 font-semibold border-b">
              {format(currentDate, 'MMM yyyy')}
            </div>
          )}
          {/* Day with month */}
          <div className={`text-xs font-medium p-1 text-center ${
            isToday ? 'text-theme-primary' : 'text-gray-700'
          }`}>
            {format(currentDate, 'MMM dd')}
          </div>
          {/* Day of week */}
          <div className={`text-xs p-1 text-center ${
            isToday ? 'text-theme-primary' : 'text-gray-500'
          }`}>
            {format(currentDate, 'EEE')}
          </div>
        </div>
      );
    }

    return days;
  };

  // Render task bars
  const renderTaskBars = () => {
    return tasks.map((task, index) => {
      const startDayIndex = differenceInDays(task.startDate, dateRange.start);
      const taskWidth = task.duration * dayWidth;
      const taskColor = TRADE_COLORS[task.trade] || '#6b7280';
      const progress = task.progress || 0;
      
      return (
        <div
          key={task.id}
          className="relative"
          style={{
            top: `${index * (taskHeight + taskPadding)}px`,
            left: `${startDayIndex * dayWidth}px`,
            width: `${taskWidth}px`,
            height: `${taskHeight}px`
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`relative h-full rounded cursor-pointer transition-all duration-200 hover:shadow-lg ${
                  draggedTask === task.id ? 'opacity-70 z-10' : ''
                }`}
                style={{ backgroundColor: taskColor }}
                onMouseDown={(e) => handleMouseDown(e, task)}
                onClick={() => onTaskClick?.(task)}
              >
                {/* Progress bar */}
                {progress > 0 && (
                  <div
                    className="absolute top-0 left-0 h-full bg-white bg-opacity-30 rounded-l"
                    style={{ width: `${progress}%` }}
                  />
                )}
                
                {/* Task content */}
                <div className="flex items-center h-full px-2 text-white text-xs font-medium">
                  <span className="mr-2 text-sm">
                    {PRIORITY_INDICATORS[task.priority]}
                  </span>
                  <span className="truncate flex-1">{task.title}</span>
                  {task.weather_dependent && (
                    <span className="ml-1 text-yellow-300">☀</span>
                  )}
                  {task.inspector_required && (
                    <span className="ml-1 text-red-300">⚠</span>
                  )}
                </div>

                {/* Status indicator */}
                <div
                  className="absolute top-0 right-0 w-2 h-full rounded-r"
                  style={{ backgroundColor: STATUS_COLORS[task.status] }}
                />

                {/* Resize handle */}
                {onTaskResize && (
                  <div
                    className="absolute top-0 right-0 w-2 h-full cursor-ew-resize hover:bg-white hover:bg-opacity-20"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      // Handle resize logic here
                    }}
                  />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <div className="font-semibold">{task.title}</div>
                <div className="text-sm">Trade: {task.trade}</div>
                <div className="text-sm">
                  Duration: {task.duration} days
                </div>
                <div className="text-sm">
                  {format(task.startDate, 'MMM dd')} - {format(task.endDate, 'MMM dd')}
                </div>
                <div className="text-sm">
                  Status: <Badge variant="outline" className="text-xs">{task.status}</Badge>
                </div>
                {task.assignedTo && (
                  <div className="text-sm">Assigned: {task.assignedTo}</div>
                )}
                {task.estimatedCost && (
                  <div className="text-sm">
                    Cost: ${task.estimatedCost.toLocaleString()}
                  </div>
                )}
                {progress > 0 && (
                  <div className="text-sm">Progress: {progress}%</div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      );
    });
  };

  // Render dependency lines
  const renderDependencies = () => {
    const lines = [];
    
    tasks.forEach((task) => {
      task.dependencies.forEach((depId) => {
        const dependency = tasks.find(t => t.id === depId);
        if (!dependency) return;

        const depIndex = tasks.findIndex(t => t.id === depId);
        const taskIndex = tasks.findIndex(t => t.id === task.id);
        
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
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Gantt Chart
          </CardTitle>
          <div className="flex items-center gap-2">
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
        <div 
          ref={chartRef}
          className="relative overflow-auto border rounded-lg"
          style={{ height: '500px' }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Chart header */}
          <div className="sticky top-0 z-20 bg-white border-b">
            <div className="flex">
              <div 
                className="flex-shrink-0 bg-gray-50 border-r border-gray-200 flex items-center justify-center font-medium"
                style={{ width: `${labelWidth}px`, height: `${headerHeight}px` }}
              >
                Tasks
              </div>
              <div className="flex">
                {renderTimelineHeader()}
              </div>
            </div>
          </div>

          {/* Chart body */}
          <div className="relative">
            {/* Task labels */}
            <div className="absolute left-0 top-0 z-10">
              {tasks.map((task, index) => (
                <div
                  key={task.id}
                  className="border-b border-gray-100 flex items-center px-3 cursor-pointer hover:bg-gray-50"
                  style={{
                    width: `${labelWidth}px`,
                    height: `${taskHeight + taskPadding}px`
                  }}
                  onClick={() => onTaskClick?.(task)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: TRADE_COLORS[task.trade] || '#6b7280' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{task.title}</div>
                      <div className="text-xs text-gray-500 truncate">{task.trade}</div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      {task.assignedTo && <Users className="w-3 h-3" />}
                      {task.weather_dependent && <span>☀</span>}
                      {task.inspector_required && <AlertCircle className="w-3 h-3" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Chart grid */}
            <div 
              className="absolute"
              style={{ left: `${labelWidth}px`, top: 0 }}
            >
              {/* Vertical grid lines */}
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                width={dateRange.totalDays * dayWidth}
                height={tasks.length * (taskHeight + taskPadding)}
              >
                {Array.from({ length: dateRange.totalDays }).map((_, i) => {
                  const currentDate = addDays(dateRange.start, i);
                  const isWeekendDay = isWeekend(currentDate);
                  return (
                    <line
                      key={i}
                      x1={i * dayWidth}
                      y1={0}
                      x2={i * dayWidth}
                      y2={tasks.length * (taskHeight + taskPadding)}
                      stroke={isWeekendDay ? '#e5e7eb' : '#f3f4f6'}
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Horizontal grid lines */}
                {tasks.map((_, index) => (
                  <line
                    key={index}
                    x1={0}
                    y1={(index + 1) * (taskHeight + taskPadding)}
                    x2={dateRange.totalDays * dayWidth}
                    y2={(index + 1) * (taskHeight + taskPadding)}
                    stroke="#f3f4f6"
                    strokeWidth="1"
                  />
                ))}

                {/* Today line */}
                {(() => {
                  const todayIndex = differenceInDays(new Date(), dateRange.start);
                  if (todayIndex >= 0 && todayIndex < dateRange.totalDays) {
                    return (
                      <line
                        x1={todayIndex * dayWidth}
                        y1={0}
                        x2={todayIndex * dayWidth}
                        y2={tasks.length * (taskHeight + taskPadding)}
                        stroke="#ef4444"
                        strokeWidth="2"
                        strokeDasharray="4,4"
                      />
                    );
                  }
                  return null;
                })()}

                {/* Dependency lines */}
                {renderDependencies()}
              </svg>

              {/* Task bars */}
              <div className="relative">
                {renderTaskBars()}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 border-2 border-red-600 rounded"></div>
            <span>Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-200 rounded"></div>
            <span>Weekend</span>
          </div>
          <div className="flex items-center gap-2">
            <span>☀</span>
            <span>Weather Dependent</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3 h-3" />
            <span>Inspection Required</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-3 h-3" />
            <span>Assigned</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}