import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  X, 
  Save, 
  Plus, 
  Calendar, 
  Users, 
  Filter,
  Grip,
  CheckCircle,
  Play,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { format, addDays, differenceInDays, parseISO, isWeekend } from 'date-fns';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useToast } from '@/hooks/use-toast';

interface Task {
  id: string;
  title: string;
  description: string;
  trade: string;
  duration: number;
  startDate: Date;
  endDate: Date;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
  dependencies: string[];
  assignedTo?: string;
  color?: string;
  estimatedCost?: number;
  notes?: string;
  weather_dependent: boolean;
  inspector_required: boolean;
}

interface ExpandedTimelineViewProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  tasks: Task[];
  onTasksUpdate: (tasks: Task[]) => void;
  onSave?: (tasks: Task[]) => void;
}

const TRADE_COLORS: Record<string, string> = {
  'Excavation': '#8B4513',
  'Foundation': '#4A5568',
  'Framing': '#D69E2E',
  'Electrical': '#3182CE',
  'Plumbing': '#38A169',
  'HVAC': '#805AD5',
  'Insulation': '#E53E3E',
  'Drywall': '#6B46C1',
  'Flooring': '#B83280',
  'Roofing': '#2D3748',
  'Painting': '#ED8936',
  'Kitchen': '#319795',
  'Siding': '#A0AEC0',
  'Concrete': '#718096',
  'Landscaping': '#48BB78',
  'Windows': '#4299E1'
};

const DEFAULT_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#84CC16', '#6366F1'
];

const ExpandedTimelineView: React.FC<ExpandedTimelineViewProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  tasks: initialTasks,
  onTasksUpdate,
  onSave
}) => {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filterTrade, setFilterTrade] = useState<string>('all');
  const [viewStartDate, setViewStartDate] = useState(new Date());
  const [dragState, setDragState] = useState<{
    taskId: string;
    isDragging: boolean;
    isResizing: boolean;
    resizeHandle: 'left' | 'right' | null;
    startX: number;
    originalStart: Date;
    originalDuration: number;
  } | null>(null);
  
  const timelineRef = useRef<HTMLDivElement>(null);

  // Update tasks when props change
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // Calculate timeline bounds for expanded view (more generous)
  const timelineBounds = useMemo(() => {
    if (tasks.length === 0) {
      return {
        start: new Date(),
        end: addDays(new Date(), 120),
        totalDays: 120
      };
    }

    const allDates = tasks.flatMap(task => [task.startDate, task.endDate]);
    const start = new Date(Math.min(...allDates.map(d => d.getTime())));
    const end = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    // More generous padding for expanded view
    const extendedStart = addDays(start, -14);
    const extendedEnd = addDays(end, 60);
    const totalDays = Math.max(differenceInDays(extendedEnd, extendedStart), 150);

    return { start: extendedStart, end: addDays(extendedStart, totalDays), totalDays };
  }, [tasks]);

  // Filter tasks by trade
  const filteredTasks = useMemo(() => {
    if (filterTrade === 'all') return tasks;
    return tasks.filter(task => task.trade === filterTrade);
  }, [tasks, filterTrade]);

  // Get unique trades for filter dropdown
  const trades = useMemo(() => {
    const uniqueTrades = Array.from(new Set(tasks.map(task => task.trade)));
    return uniqueTrades.sort();
  }, [tasks]);

  // Timeline day cells with month headers
  const renderTimelineGrid = () => {
    const days = [];
    const { start, totalDays } = timelineBounds;

    for (let i = 0; i < totalDays; i++) {
      const currentDate = addDays(start, i);
      const isWeekendDay = isWeekend(currentDate);
      const isFirstOfMonth = currentDate.getDate() === 1;
      const prevDate = i > 0 ? addDays(start, i - 1) : null;
      const showMonthHeader = isFirstOfMonth || (i === 0) || (prevDate && format(currentDate, 'MMM yyyy') !== format(prevDate, 'MMM yyyy'));
      
      days.push(
        <div
          key={i}
          className={`min-w-[50px] h-full border-r border-gray-200 flex flex-col ${
            isWeekendDay ? 'bg-gray-50' : 'bg-white'
          }`}
        >
          {/* Month header */}
          {showMonthHeader && (
            <div className="text-xs px-1 py-0.5 text-center bg-blue-100 text-blue-800 font-semibold border-b">
              {format(currentDate, 'MMM yyyy')}
            </div>
          )}
          {/* Day number */}
          <div className="text-xs p-2 text-center border-b bg-gray-50 font-medium">
            {format(currentDate, 'dd')}
          </div>
          {/* Day of week */}
          <div className="text-xs p-1 text-center text-gray-500">
            {format(currentDate, 'EEE')}
          </div>
        </div>
      );
    }

    return days;
  };

  // Mouse handlers for drag and resize
  const handleMouseDown = useCallback((e: React.MouseEvent, task: Task, resizeHandle?: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setDragState({
      taskId: task.id,
      isDragging: !resizeHandle,
      isResizing: !!resizeHandle,
      resizeHandle: resizeHandle || null,
      startX: e.clientX - rect.left,
      originalStart: new Date(task.startDate),
      originalDuration: task.duration
    });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const deltaX = currentX - dragState.startX;
    const daysDelta = Math.round(deltaX / 50); // 50px per day in expanded view
    
    const task = filteredTasks.find(t => t.id === dragState.taskId);
    if (!task) return;
    
    if (dragState.isDragging) {
      const newStartDate = addDays(dragState.originalStart, daysDelta);
      const newEndDate = addDays(newStartDate, task.duration - 1);
      
      setTasks(prev => prev.map(t => 
        t.id === dragState.taskId 
          ? { ...t, startDate: newStartDate, endDate: newEndDate }
          : t
      ));
    } else if (dragState.isResizing) {
      if (dragState.resizeHandle === 'right') {
        const newDuration = Math.max(1, dragState.originalDuration + daysDelta);
        const newEndDate = addDays(dragState.originalStart, newDuration - 1);
        
        setTasks(prev => prev.map(t => 
          t.id === dragState.taskId 
            ? { ...t, duration: newDuration, endDate: newEndDate }
            : t
        ));
      } else if (dragState.resizeHandle === 'left') {
        const newStartDate = addDays(dragState.originalStart, daysDelta);
        const newDuration = Math.max(1, dragState.originalDuration - daysDelta);
        const newEndDate = addDays(newStartDate, newDuration - 1);
        
        setTasks(prev => prev.map(t => 
          t.id === dragState.taskId 
            ? { ...t, startDate: newStartDate, endDate: newEndDate, duration: newDuration }
            : t
        ));
      }
    }
  }, [dragState, filteredTasks]);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  // Global mouse event handlers
  useEffect(() => {
    if (dragState) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!timelineRef.current) return;
        
        const rect = timelineRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const deltaX = currentX - dragState.startX;
        const daysDelta = Math.round(deltaX / 50);
        
        const task = tasks.find(t => t.id === dragState.taskId);
        if (!task) return;
        
        if (dragState.isDragging) {
          const newStartDate = addDays(dragState.originalStart, daysDelta);
          const newEndDate = addDays(newStartDate, task.duration - 1);
          
          setTasks(prev => prev.map(t => 
            t.id === dragState.taskId 
              ? { ...t, startDate: newStartDate, endDate: newEndDate }
              : t
          ));
        } else if (dragState.isResizing) {
          if (dragState.resizeHandle === 'right') {
            const newDuration = Math.max(1, dragState.originalDuration + daysDelta);
            const newEndDate = addDays(dragState.originalStart, newDuration - 1);
            
            setTasks(prev => prev.map(t => 
              t.id === dragState.taskId 
                ? { ...t, duration: newDuration, endDate: newEndDate }
                : t
            ));
          } else if (dragState.resizeHandle === 'left') {
            const newStartDate = addDays(dragState.originalStart, daysDelta);
            const newDuration = Math.max(1, dragState.originalDuration - daysDelta);
            const newEndDate = addDays(newStartDate, newDuration - 1);
            
            setTasks(prev => prev.map(t => 
              t.id === dragState.taskId 
                ? { ...t, startDate: newStartDate, endDate: newEndDate, duration: newDuration }
                : t
            ));
          }
        }
      };

      const handleGlobalMouseUp = () => {
        setDragState(null);
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [dragState, tasks]);

  // Render task bars
  const renderTaskBars = useMemo(() => {
    const { start: timelineStart } = timelineBounds;
    
    return filteredTasks.map((task, index) => {
      const startOffset = differenceInDays(task.startDate, timelineStart);
      
      // Calculate total calendar days for continuous bar
      let totalCalendarDays = 0;
      let workDaysRemaining = task.duration;
      
      for (let dayOffset = 0; workDaysRemaining > 0; dayOffset++) {
        const checkDate = addDays(task.startDate, dayOffset);
        const isWeekendDay = isWeekend(checkDate);
        
        totalCalendarDays++;
        
        if (!isWeekendDay) {
          workDaysRemaining--;
        }
        
        if (dayOffset > 100) break;
      }
      
      // Weekend overlay data
      const weekendOverlays = [];
      for (let dayOffset = 0; dayOffset < totalCalendarDays; dayOffset++) {
        const checkDate = addDays(task.startDate, dayOffset);
        if (isWeekend(checkDate)) {
          weekendOverlays.push({
            left: (startOffset + dayOffset) * 50,
            width: 50
          });
        }
      }
      
      return (
        <div
          key={task.id}
          className="absolute h-16"
          style={{ 
            top: `${index * 64}px`,
            left: '0px',
            right: '0px'
          }}
        >
          <div
            className={`absolute h-12 rounded-md border-2 cursor-pointer group ${
              task.status === 'delayed' ? 'border-red-500 border-dashed' :
              selectedTask?.id === task.id ? 'border-theme-primary shadow-lg' : 'border-white'
            } ${
              dragState?.taskId === task.id ? 'z-50 shadow-2xl' : ''
            } hover:shadow-md ${
              task.status === 'delayed' ? 'animate-pulse' : ''
            }`}
            style={{
              left: `${startOffset * 50}px`,
              width: `${totalCalendarDays * 50}px`,
              top: '8px',
              backgroundColor: task.color || TRADE_COLORS[task.trade] || DEFAULT_COLORS[0]
            }}
            onMouseDown={(e) => handleMouseDown(e, task)}
            onClick={() => setSelectedTask(task)}
          >
            {/* Weekend overlays */}
            {weekendOverlays.map((overlay, overlayIndex) => (
              <div
                key={overlayIndex}
                className="absolute inset-y-0 bg-black bg-opacity-40 pointer-events-none rounded-md"
                style={{
                  left: `${overlay.left - startOffset * 50}px`,
                  width: `${overlay.width}px`
                }}
              />
            ))}
            
            {/* Status indicators */}
            {task.status === 'delayed' && (
              <div className="absolute inset-0 bg-red-500 bg-opacity-20 pointer-events-none rounded-md">
                <div className="absolute top-0 right-0 -mt-1 -mr-1">
                  <AlertTriangle className="w-5 h-5 text-red-600 bg-white rounded-full p-0.5" />
                </div>
              </div>
            )}
            
            {task.status === 'completed' && (
              <div className="absolute top-0 right-0 -mt-1 -mr-1">
                <CheckCircle className="w-5 h-5 text-green-600 bg-white rounded-full" />
              </div>
            )}
            
            {task.status === 'in_progress' && (
              <div className="absolute inset-0 bg-blue-500 bg-opacity-10 pointer-events-none rounded-md">
                <div className="absolute top-0 right-0 -mt-1 -mr-1">
                  <Play className="w-5 h-5 text-theme-primary bg-white rounded-full p-0.5" />
                </div>
              </div>
            )}
            
            {/* Resize handles */}
            <div
              className="absolute left-0 top-0 w-3 h-full cursor-w-resize opacity-0 group-hover:opacity-100 bg-white/30 rounded-l-md"
              onMouseDown={(e) => handleMouseDown(e, task, 'left')}
            />
            
            {/* Task content */}
            <div className="flex items-center h-full px-3 text-sm text-white font-medium truncate pointer-events-none">
              <Grip className="w-4 h-4 mr-2 opacity-70 flex-shrink-0" />
              <span className="truncate">
                {task.title}
              </span>
              <span className="ml-auto text-xs opacity-80">
                {task.duration}d
              </span>
            </div>
            
            <div
              className="absolute right-0 top-0 w-3 h-full cursor-e-resize opacity-0 group-hover:opacity-100 bg-white/30 rounded-r-md"
              onMouseDown={(e) => handleMouseDown(e, task, 'right')}
            />
          </div>
        </div>
      );
    });
  }, [filteredTasks, timelineBounds, selectedTask, dragState, handleMouseDown]);

  // Save changes
  const handleSave = useCallback(async () => {
    try {
      onTasksUpdate(tasks);
      onSave?.(tasks);
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Could not save timeline changes. Please try again.",
        variant: "destructive"
      });
    }
  }, [tasks, onTasksUpdate, onSave, toast]);

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 left-0 w-screen h-screen z-50 bg-white overflow-auto">
      {/* Header Bar */}
      <div className="sticky top-0 z-60 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-theme-primary" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{projectName}</h1>
              <p className="text-sm text-gray-500">Expanded Timeline View</p>
            </div>
            <Badge variant="outline" className="ml-4">
              {filteredTasks.length} {filteredTasks.length === 1 ? 'Task' : 'Tasks'}
            </Badge>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Filter Controls */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <Select value={filterTrade} onValueChange={setFilterTrade}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by trade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Trades</SelectItem>
                  {trades.map(trade => (
                    <SelectItem key={trade} value={trade}>
                      {trade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Start Date */}
            <div className="flex items-center gap-2">
              <Label htmlFor="start-date-expanded">Start Date:</Label>
              <Input
                id="start-date-expanded"
                type="date"
                value={format(viewStartDate, 'yyyy-MM-dd')}
                onChange={(e) => setViewStartDate(parseISO(e.target.value))}
                className="w-44"
              />
            </div>
            
            {/* Action Buttons */}
            <Button
              onClick={handleSave}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </Button>
            
            <Button
              variant="outline"
              onClick={onClose}
              className="flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Collapse View
            </Button>
          </div>
        </div>
      </div>

      {/* Main Timeline Content */}
      <div className="p-6">
        <div className="relative">
          {/* Timeline Header */}
          <div className="flex border-b-2 border-gray-300 mb-4 overflow-x-auto">
            <div className="w-64 flex-shrink-0 bg-gray-50 border-r border-gray-300">
              <div className="p-3 text-sm font-medium text-gray-700">Task</div>
            </div>
            <div className="flex" style={{ minWidth: `${timelineBounds.totalDays * 50}px` }}>
              {renderTimelineGrid()}
            </div>
          </div>

          {/* Task Rows */}
          <div className="relative overflow-x-auto" style={{ minHeight: "600px" }}>
            {/* Grid background */}
            <div 
              className="absolute top-0 left-64 flex border-gray-200"
              style={{ 
                width: `${timelineBounds.totalDays * 50}px`,
                height: `${filteredTasks.length * 64}px`
              }}
            >
              {Array.from({ length: timelineBounds.totalDays }).map((_, i) => {
                const currentDate = addDays(timelineBounds.start, i);
                const isWeekendDay = isWeekend(currentDate);
                return (
                  <div
                    key={i}
                    className={`min-w-[50px] h-full border-r border-gray-200 ${
                      isWeekendDay ? 'bg-gray-50' : 'bg-white'
                    }`}
                  />
                );
              })}
            </div>

            {/* Task Labels */}
            {filteredTasks.map((task, index) => (
              <div key={task.id} className="flex items-center h-16 border-b border-gray-100 relative z-10">
                <div className="w-64 flex-shrink-0 px-4 bg-white border-r border-gray-200">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0"
                      style={{ backgroundColor: task.color || TRADE_COLORS[task.trade] || DEFAULT_COLORS[0] }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{task.title}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span>{task.trade}</span>
                        {task.status === 'delayed' && (
                          <span className="text-red-500 font-medium">DELAYED</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div 
                  className="relative flex-1"
                  style={{ minWidth: `${timelineBounds.totalDays * 50}px` }}
                >
                  {/* Task bar positioned in renderTaskBars */}
                </div>
              </div>
            ))}
            
            {/* Task bars overlay */}
            <div 
              ref={timelineRef}
              className={`absolute top-0 left-64 pointer-events-none z-20 ${
                dragState?.isDragging ? 'cursor-grabbing' : 
                dragState?.isResizing ? 
                  (dragState.resizeHandle === 'left' ? 'cursor-w-resize' : 'cursor-e-resize') : 
                'cursor-default'
              }`}
              style={{ 
                height: `${filteredTasks.length * 64}px`,
                width: `${timelineBounds.totalDays * 50}px`
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <div className="relative w-full h-full pointer-events-auto">
                {renderTaskBars}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpandedTimelineView;