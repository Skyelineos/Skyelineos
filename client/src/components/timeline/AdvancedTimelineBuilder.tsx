import React, { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameDay, addDays, differenceInDays, startOfWeek, addMonths } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { generateAutoSchedule, validateAutoScheduleInputs, getScheduleSummary } from "@/utils/autoScheduler";
import { AutoScheduleDialog } from "./AutoScheduleDialog";
import { CsvImportDialog } from "./CsvImportDialog";
import ScheduleEditorModal from "../schedule/ScheduleEditorModal";
import DependencyArrows from "./DependencyArrows";
import DependencyEditModal from "./DependencyEditModal";
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar,
  Maximize,
  X,
  Clock,
  Users,
  AlertTriangle,
  Target,
  Settings,
  MoreVertical,
  ArrowRight,
  Link,
  Network,
  Link2,
  FileText,
  Zap,
  Move,
  RotateCcw,
  Save,
  Sparkles,
  Play
} from "lucide-react";

// Interfaces
interface DependencyArrow {
  fromTaskId: number;
  toTaskId: number;
  type: 'FS' | 'SS' | 'FF' | 'SF'; // Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish
  lag: number; // days
}

interface Task {
  id: number;
  projectId: number;
  sectionId: number | null;
  title: string;
  trade: string;
  contactId: number | null;
  estimateItemId: number | null;
  startDate: Date;
  endDate: Date;
  duration: number;
  status: string;
  description: string | null;
  orderIndex: number | null;
  dependencies: string | null;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// Enhanced Drag State Interface with Smooth Following
interface DragState {
  isDragging: boolean;
  taskId: number | null;
  dragType: 'move' | 'resize-start' | 'resize-end' | 'reorder' | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startDate: Date | null;
  originalTask: Task | null;
  previewPosition: { left: number; top: number; width: number } | null;
  targetRowIndex: number | null;
}

// Live tooltip state
interface DragTooltip {
  visible: boolean;
  x: number;
  y: number;
  startDate: string;
  endDate: string;
}

// Visual drag preview state
interface DragPreview {
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  task: Task | null;
  projectedStartDate: Date | null;
  projectedEndDate: Date | null;
}

interface DependencyLine {
  fromTaskId: number;
  toTaskId: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface EstimateItem {
  id: string;
  title: string;
  description: string;
  quantity: number;
  unit: string;
  estimatedDuration: number;
}

interface AdvancedTimelineBuilderProps {
  projectId: number;
  readonly?: boolean;
  fullscreen?: boolean;
  onFullscreenToggle?: () => void;
  onTaskEdit?: (task: Task) => void;
  onTaskCreate?: (task: Partial<Task>) => void;
  onTaskDelete?: (taskId: number) => void;
  onTaskUpdate?: (task: Task) => void;
}

// Color mappings
const getTradeColor = (trade: string): string => {
  const tradeColors: { [key: string]: string } = {
    'Permits': '#8B5CF6',
    'Excavation': '#8B4513',
    'Concrete': '#6B7280',
    'Framing': '#D97706',
    'Roofing': '#DC2626',
    'Plumbing': '#2563EB',
    'Electrical': '#FBBF24',
    'HVAC': '#059669',
    'Insulation': '#F472B6',
    'Drywall': '#E5E7EB',
    'Flooring': '#92400E',
    'Painting': '#7C3AED',
    'Trim': '#B45309',
    'Landscaping': '#16A34A',
    'Cleanup': '#6B7280'
  };
  
  return tradeColors[trade] || '#6B7280';
};

const getStatusColor = (status: string): string => {
  const statusColors: { [key: string]: string } = {
    'not-started': '#6B7280',
    'in-progress': '#F59E0B',
    'completed': '#10B981',
    'on-hold': '#EF4444',
    'cancelled': '#6B7280'
  };
  
  return statusColors[status] || '#6B7280';
};

// Gantt Timeline Component
interface GanttTimelineProps {
  tasks: Task[];
  onTaskEdit?: (task: Task) => void;
  onTaskUpdate?: (task: Task) => void;
  onTaskDelete?: (taskId: number) => void;
  readonly?: boolean;
}

const GanttTimeline: React.FC<GanttTimelineProps> = ({ 
  tasks, 
  onTaskEdit, 
  onTaskUpdate, 
  onTaskDelete,
  readonly = false 
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    taskId: null,
    dragType: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    startDate: null,
    originalTask: null,
    previewPosition: null,
    targetRowIndex: null
  });
  const [dragTooltip, setDragTooltip] = useState<DragTooltip>({
    visible: false,
    x: 0,
    y: 0,
    startDate: '',
    endDate: ''
  });
  const [dragPreview, setDragPreview] = useState<DragPreview>({
    visible: false,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    task: null,
    projectedStartDate: null,
    projectedEndDate: null
  });
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showDependencyMode, setShowDependencyMode] = useState(false);
  const [pendingDependency, setPendingDependency] = useState<{ from: number } | null>(null);
  const [showAutoScheduleDialog, setShowAutoScheduleDialog] = useState(false);
  const [timelineViewMode, setTimelineViewMode] = useState<'week' | 'month'>('month');
  
  // Dependency management state
  const [showDependencies, setShowDependencies] = useState(true);
  const [editingDependency, setEditingDependency] = useState<DependencyArrow | null>(null);
  const [showDependencyEditModal, setShowDependencyEditModal] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Dynamic view dates based on timeline mode and current month
  const { viewStartDate, viewEndDate } = useMemo(() => {
    if (timelineViewMode === 'week') {
      // Show current week with 2 weeks before and after for context
      const startOfCurrentWeek = startOfWeek(currentMonth);
      const start = addDays(startOfCurrentWeek, -14); // 2 weeks before
      const end = addDays(startOfCurrentWeek, 28); // 4 weeks total
      return { viewStartDate: start, viewEndDate: end };
    } else {
      // Month view: Show 3 months centered on current month
      const start = startOfMonth(addMonths(currentMonth, -1));
      const end = endOfMonth(addMonths(currentMonth, 1));
      return { viewStartDate: start, viewEndDate: end };
    }
  }, [timelineViewMode, currentMonth]);

  // Generate date range for timeline header
  const timelineDates = eachDayOfInterval({ start: viewStartDate, end: viewEndDate });
  const totalDays = timelineDates.length;

  // Calculate task positions
  const getTaskPosition = (task: Task) => {
    const taskStart = typeof task.startDate === 'string' ? parseISO(task.startDate) : task.startDate;
    const taskEnd = typeof task.endDate === 'string' ? parseISO(task.endDate) : task.endDate;
    
    const startDiff = differenceInDays(taskStart, viewStartDate);
    const taskDuration = differenceInDays(taskEnd, taskStart) + 1; // +1 to include both start and end dates
    
    const left = Math.max(0, (startDiff / totalDays) * 100);
    const width = Math.min(100 - left, (taskDuration / totalDays) * 100);
    
    return { left, width };
  };

  // Calculate dependency lines
  const dependencyLines = useMemo((): DependencyLine[] => {
    const lines: DependencyLine[] = [];
    
    tasks.forEach((task, taskIndex) => {
      if (task.dependencies) {
        const dependencyIds = typeof task.dependencies === 'string' 
          ? task.dependencies.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
          : [];
        
        dependencyIds.forEach(depId => {
          const depTask = tasks.find(t => t.id === depId);
          const depTaskIndex = tasks.findIndex(t => t.id === depId);
          
          if (depTask && depTaskIndex !== -1) {
            const fromPosition = getTaskPosition(depTask);
            const toPosition = getTaskPosition(task);
            
            lines.push({
              fromTaskId: depTask.id,
              toTaskId: task.id,
              fromX: fromPosition.left + fromPosition.width,
              fromY: (depTaskIndex + 0.5) * 60,
              toX: toPosition.left,
              toY: (taskIndex + 0.5) * 60
            });
          }
        });
      }
    });
    
    return lines;
  }, [tasks, viewStartDate, viewEndDate]);

  // Enhanced mouse event handlers for smooth drag and drop
  const handleMouseDown = useCallback((event: React.MouseEvent, task: Task, dragType: 'move' | 'resize-start' | 'resize-end') => {
    if (readonly) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Don't start dragging immediately - wait for movement threshold
    setDragState({
      isDragging: false, // Start as false - will become true after drag threshold
      taskId: task.id,
      dragType,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      startDate: typeof task.startDate === 'string' ? parseISO(task.startDate) : task.startDate,
      originalTask: { ...task },
      previewPosition: null,
      targetRowIndex: null
    });
    
    setSelectedTaskId(task.id);
  }, [readonly]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!dragState.taskId) return;
    
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Drag threshold - only start dragging after moving 5 pixels
    const DRAG_THRESHOLD = 5;
    
    // If we haven't started dragging yet and we're below threshold, don't do anything
    if (!dragState.isDragging && dragDistance < DRAG_THRESHOLD) {
      return;
    }
    
    // If we haven't started dragging yet but we're above threshold, start dragging
    if (!dragState.isDragging && dragDistance >= DRAG_THRESHOLD) {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const task = tasks.find(t => t.id === dragState.taskId);
      if (!task) return;
      
      // Initialize drag preview and tooltip
      const taskPosition = getTaskPosition(task);
      const timelineWidth = rect.width - 256;
      const taskWidth = (taskPosition.width / 100) * timelineWidth;
      
      setDragPreview({
        visible: true,
        x: event.clientX - (taskWidth / 2),
        y: event.clientY - 25,
        width: taskWidth,
        height: 50,
        task: { ...task },
        projectedStartDate: typeof task.startDate === 'string' ? parseISO(task.startDate) : task.startDate,
        projectedEndDate: typeof task.endDate === 'string' ? parseISO(task.endDate) : task.endDate
      });
      
      setDragTooltip({
        visible: true,
        x: event.clientX + 10,
        y: event.clientY - 50,
        startDate: format(typeof task.startDate === 'string' ? parseISO(task.startDate) : task.startDate, 'MMM dd'),
        endDate: format(typeof task.endDate === 'string' ? parseISO(task.endDate) : task.endDate, 'MMM dd')
      });
      
      // Mark as dragging
      setDragState(prev => ({ ...prev, isDragging: true }));
    }
    
    if (!dragState.originalTask || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const timelineWidth = rect.width - 256; // Subtract task names column width
    const dayWidth = timelineWidth / timelineDates.length;
    const daysDelta = Math.round(deltaX / dayWidth);
    
    // Update current mouse position for smooth following
    setDragState(prev => ({
      ...prev,
      currentX: event.clientX,
      currentY: event.clientY
    }));
    
    const task = tasks.find(t => t.id === dragState.taskId);
    if (!task) return;
    
    let projectedStartDate = dragState.startDate!;
    let projectedEndDate = typeof dragState.originalTask.endDate === 'string' ? 
      parseISO(dragState.originalTask.endDate) : dragState.originalTask.endDate;
    
    // Calculate projected dates based on drag type
    switch (dragState.dragType) {
      case 'move':
        projectedStartDate = addDays(dragState.startDate!, daysDelta);
        const taskDuration = differenceInDays(
          typeof dragState.originalTask.endDate === 'string' ? parseISO(dragState.originalTask.endDate) : dragState.originalTask.endDate,
          typeof dragState.originalTask.startDate === 'string' ? parseISO(dragState.originalTask.startDate) : dragState.originalTask.startDate
        );
        projectedEndDate = addDays(projectedStartDate, taskDuration);
        
        // Handle vertical reordering
        if (Math.abs(deltaY) > 30) { // 30px threshold for reordering
          const rowHeight = 60;
          // Calculate the offset from the timeline content area (accounting for headers and controls)
          const timelineContentTop = rect.top + 180; // Adjust for sticky headers and controls
          const relativeY = event.clientY - timelineContentTop;
          const targetRowIndex = Math.max(0, Math.min(tasks.length - 1, 
            Math.floor(relativeY / rowHeight)
          ));
          setDragState(prev => ({ ...prev, targetRowIndex }));
        }
        break;
        
      case 'resize-start':
        projectedStartDate = addDays(dragState.startDate!, daysDelta);
        break;
        
      case 'resize-end':
        const originalStart = typeof dragState.originalTask.startDate === 'string' ? 
          parseISO(dragState.originalTask.startDate) : dragState.originalTask.startDate;
        projectedEndDate = addDays(originalStart, Math.max(1, dragState.originalTask.duration + daysDelta));
        break;
    }
    
    // Update live tooltip
    setDragTooltip({
      visible: true,
      x: event.clientX + 10,
      y: event.clientY - 50,
      startDate: format(projectedStartDate, 'MMM dd'),
      endDate: format(projectedEndDate, 'MMM dd')
    });

    // Update drag preview position and projected dates
    if (dragPreview.visible) {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (rect) {
        const timelineWidth = rect.width - 256;
        let previewWidth = dragPreview.width;
        let previewX = event.clientX - (previewWidth / 2);

        // Handle resize operations differently - anchor to one end
        if (dragState.dragType === 'resize-start' || dragState.dragType === 'resize-end') {
          const projectedDuration = differenceInDays(projectedEndDate, projectedStartDate) + 1;
          const dayWidth = timelineWidth / timelineDates.length;
          previewWidth = Math.max(20, projectedDuration * dayWidth);
          
          // Calculate preview position based on projected dates, not cursor position
          const startDaysFromTimeline = differenceInDays(projectedStartDate, timelineDates[0]);
          previewX = rect.left + 256 + (startDaysFromTimeline * dayWidth);
        }

        setDragPreview(prev => ({
          ...prev,
          x: previewX,
          y: event.clientY - 25,
          width: previewWidth,
          projectedStartDate,
          projectedEndDate
        }));
      }
    }
    
    // Only update task data on mouse up to prevent too many updates
  }, [dragState, tasks, timelineDates, dragPreview.visible, dragPreview.width, getTaskPosition]);

  const handleMouseUp = useCallback(() => {
    // If we have a taskId but weren't dragging, this was a click - handle it as task selection/edit
    if (dragState.taskId && !dragState.isDragging) {
      const task = tasks.find(t => t.id === dragState.taskId);
      if (task) {
        if (showDependencyMode) {
          if (pendingDependency) {
            // Complete dependency creation
            const fromTask = tasks.find(t => t.id === pendingDependency.from);
            if (fromTask && fromTask.id !== task.id && onTaskUpdate) {
              const existingDeps = task.dependencies ? task.dependencies.split(',').map(id => id.trim()) : [];
              if (!existingDeps.includes(pendingDependency.from.toString())) {
                const updatedTask = {
                  ...task,
                  dependencies: [...existingDeps, pendingDependency.from.toString()].join(', ')
                };
                onTaskUpdate(updatedTask);
              }
            }
            setPendingDependency(null);
            setShowDependencyMode(false);
          } else {
            // Start dependency creation
            setPendingDependency({ from: task.id });
          }
        } else if (!readonly && onTaskEdit) {
          onTaskEdit(task);
        }
      }
      
      // Reset drag state for click
      setDragState({
        isDragging: false,
        taskId: null,
        dragType: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        startDate: null,
        originalTask: null,
        previewPosition: null,
        targetRowIndex: null
      });
      return;
    }
    
    if (!dragState.isDragging || !dragState.originalTask || !onTaskUpdate) {
      setDragState({
        isDragging: false,
        taskId: null,
        dragType: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        startDate: null,
        originalTask: null,
        previewPosition: null,
        targetRowIndex: null
      });
      setDragTooltip({ visible: false, x: 0, y: 0, startDate: '', endDate: '' });
      setDragPreview({
        visible: false,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        task: null,
        projectedStartDate: null,
        projectedEndDate: null
      });
      return;
    }
    
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const timelineWidth = rect.width - 256;
    const deltaX = dragState.currentX - dragState.startX;
    const dayWidth = timelineWidth / timelineDates.length;
    const daysDelta = Math.round(deltaX / dayWidth);
    
    const task = tasks.find(t => t.id === dragState.taskId);
    if (!task) return;
    
    let updatedTask = { ...task };
    
    // Apply the final drag transformation
    switch (dragState.dragType) {
      case 'move':
        const newStartDate = addDays(dragState.startDate!, daysDelta);
        const taskDuration = differenceInDays(
          typeof dragState.originalTask.endDate === 'string' ? parseISO(dragState.originalTask.endDate) : dragState.originalTask.endDate,
          typeof dragState.originalTask.startDate === 'string' ? parseISO(dragState.originalTask.startDate) : dragState.originalTask.startDate
        );
        updatedTask.startDate = newStartDate;
        updatedTask.endDate = addDays(newStartDate, taskDuration);
        
        // Handle reordering if target row is different
        if (dragState.targetRowIndex !== null) {
          const currentIndex = tasks.findIndex(t => t.id === task.id);
          if (dragState.targetRowIndex !== currentIndex) {
            // Create a copy of all tasks to recalculate order indices
            const reorderedTasks = [...tasks];
            
            // Remove the task from its current position
            const taskToMove = reorderedTasks.splice(currentIndex, 1)[0];
            
            // Insert it at the target position
            reorderedTasks.splice(dragState.targetRowIndex, 0, taskToMove);
            
            // Update order indices for all affected tasks
            reorderedTasks.forEach((t, index) => {
              if (t.id === task.id) {
                updatedTask.orderIndex = index;
              } else if (onTaskUpdate) {
                // Update other tasks' order indices if they changed
                const originalIndex = tasks.findIndex(orig => orig.id === t.id);
                if (originalIndex !== index) {
                  // Use setTimeout to avoid multiple simultaneous updates
                  setTimeout(() => {
                    onTaskUpdate({ ...t, orderIndex: index });
                  }, 10);
                }
              }
            });
          }
        }
        break;
        
      case 'resize-start':
        const newStart = addDays(dragState.startDate!, daysDelta);
        const originalEnd = typeof dragState.originalTask.endDate === 'string' ? parseISO(dragState.originalTask.endDate) : dragState.originalTask.endDate;
        const newDuration = Math.max(1, differenceInDays(originalEnd, newStart));
        updatedTask.startDate = newStart;
        updatedTask.duration = newDuration;
        break;
        
      case 'resize-end':
        const originalStart = typeof dragState.originalTask.startDate === 'string' ? parseISO(dragState.originalTask.startDate) : dragState.originalTask.startDate;
        const newEnd = addDays(originalStart, Math.max(1, dragState.originalTask.duration + daysDelta));
        updatedTask.endDate = newEnd;
        updatedTask.duration = Math.max(1, differenceInDays(newEnd, originalStart));
        break;
    }
    
    onTaskUpdate(updatedTask);
    
    // Reset drag state
    setDragState({
      isDragging: false,
      taskId: null,
      dragType: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      startDate: null,
      originalTask: null,
      previewPosition: null,
      targetRowIndex: null
    });
    
    // Hide tooltip and preview
    setDragTooltip({ visible: false, x: 0, y: 0, startDate: '', endDate: '' });
    setDragPreview({
      visible: false,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      task: null,
      projectedStartDate: null,
      projectedEndDate: null
    });
  }, [dragState, tasks, onTaskUpdate, timelineDates, showDependencyMode, pendingDependency, setPendingDependency, setShowDependencyMode, onTaskEdit, readonly]);

  const handleTaskRightClick = (task: Task, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (!readonly && onTaskDelete) {
      if (window.confirm(`Are you sure you want to delete the task "${task.title}"? This action cannot be undone.`)) {
        onTaskDelete(task.id);
      }
    }
  };

  const handleKeyPress = React.useCallback((event: KeyboardEvent) => {
    if (event.key === 'Delete' && selectedTaskId && !readonly && onTaskDelete) {
      const selectedTask = tasks.find(t => t.id === selectedTaskId);
      if (selectedTask) {
        if (window.confirm(`Are you sure you want to delete the task "${selectedTask.title}"? This action cannot be undone.`)) {
          onTaskDelete(selectedTaskId);
          setSelectedTaskId(null);
        }
      }
    }
  }, [selectedTaskId, tasks, readonly, onTaskDelete]);

  // Add event listeners for drag and drop and keyboard shortcuts
  React.useEffect(() => {
    if (dragState.taskId) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState.taskId, handleMouseMove, handleMouseUp]);

  // Add keyboard event listener for Delete key
  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);

  if (tasks.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No tasks to display in timeline</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-hidden" ref={timelineRef}>
      {/* Enhanced Controls */}
      {!readonly && (
        <div className="p-3 bg-gray-50 border-b space-y-3">
          {/* Main Controls Row */}
          <div className="flex items-center gap-2">
            <Button
              variant={showDependencyMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setShowDependencyMode(!showDependencyMode);
                setPendingDependency(null);
              }}
              className="flex items-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {showDependencyMode ? 'Exit Link Mode' : 'Link Tasks'}
            </Button>

            <Button
              variant={showDependencies ? "default" : "outline"}
              size="sm"
              onClick={() => setShowDependencies(!showDependencies)}
              className="flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              {showDependencies ? 'Hide Arrows' : 'Show Arrows'}
            </Button>
            
            {pendingDependency && (
              <div className="text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Click a task to link from Task #{pendingDependency.from}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPendingDependency(null);
                    setShowDependencyMode(false);
                  }}
                  className="ml-2 h-auto p-1"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
            
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
              <Move className="w-3 h-3" />
              <span>Drag to move • Drag edges to resize</span>
            </div>
          </div>

          {/* Help Text Row */}
          {showDependencyMode && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm text-blue-800 font-medium mb-2">How to Link Tasks (Dependencies):</div>
              <div className="text-xs text-blue-700 space-y-1">
                <div>1. Click the <strong>first task</strong> (what needs to be done first)</div>
                <div>2. Click the <strong>second task</strong> (what depends on the first task)</div>
                <div>3. The second task will automatically start after the first task finishes</div>
                <div className="text-blue-600 font-medium mt-2">
                  Example: Click "Foundation" then "Framing" → Framing will start after Foundation is complete
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Enhanced Timeline Header */}
      <div className="timeline-dates-header flex bg-gray-50 border-b sticky top-0 z-20">
        {/* Task Labels Column */}
        <div className="w-64 flex-shrink-0 bg-white border-r">
          <div className="h-16 flex items-center px-4 font-semibold text-sm border-b">
            <div className="flex items-center gap-2">
              <span>Tasks</span>
              <Badge variant="secondary" className="text-xs">
                {timelineViewMode === 'week' ? 'Week' : 'Month'} View
              </Badge>
            </div>
          </div>
        </div>
        
        {/* Date Headers */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex h-16" style={{ minWidth: `${timelineDates.length * (timelineViewMode === 'week' ? Math.max(60, 800 / totalDays) : Math.max(30, 800 / totalDays))}px` }}>
            {timelineDates.map((date, index) => {
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              const isFirstOfMonth = date.getDate() === 1;
              const cellWidth = timelineViewMode === 'week' ? 
                Math.max(60, 800 / totalDays) : 
                Math.max(30, 800 / totalDays);
              
              return (
                <div
                  key={date.toISOString()}
                  className={`flex-shrink-0 border-l h-full flex flex-col items-center justify-center text-xs relative ${
                    isToday(date) ? 'bg-blue-100 text-blue-800 font-semibold' : 
                    isWeekend ? 'bg-gray-100 text-gray-500' : 'text-gray-600'
                  } ${isFirstOfMonth ? 'border-l-2 border-gray-400' : ''}`}
                  style={{ minWidth: `${cellWidth}px` }}
                >
                  {isFirstOfMonth && (
                    <div className="absolute -top-4 text-xs font-semibold text-gray-800">
                      {format(date, 'MMM')}
                    </div>
                  )}
                  <div className="mb-1">{format(date, 'EEE')}</div>
                  <div className={isToday(date) ? 'font-bold' : ''}>{format(date, 'd')}</div>
                  {timelineViewMode === 'week' && (
                    <div className="text-xs opacity-75 mt-1">
                      {format(date, 'MMM')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Task Rows with SVG Overlay for Dependencies */}
      <div className="relative">
        {/* Dependency Lines SVG */}
        {dependencyLines.length > 0 && (
          <svg
            className="absolute inset-0 pointer-events-none z-10"
            style={{ height: tasks.length * 60 }}
          >
            {dependencyLines.map((line, index) => (
              <g key={`${line.fromTaskId}-${line.toTaskId}-${index}`}>
                {/* Dependency line */}
                <path
                  d={`M ${256 + (line.fromX * 8)} ${line.fromY} 
                      L ${256 + (line.toX * 8) - 10} ${line.toY}`}
                  stroke="#3B82F6"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                />
                {/* Arrow marker */}
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="10"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 10 3.5, 0 7"
                      fill="#3B82F6"
                    />
                  </marker>
                </defs>
              </g>
            ))}
          </svg>
        )}

        {/* Task Rows */}
        <div className="divide-y">
          {tasks.map((task, taskIndex) => {
            const position = getTaskPosition(task);
            const isSelected = selectedTaskId === task.id;
            const isDependencySource = pendingDependency?.from === task.id;
            const isDropTarget = dragState.isDragging && dragState.targetRowIndex === taskIndex;
            
            return (
              <div key={task.id} className={`flex hover:bg-gray-50 group ${
                isDropTarget ? 'bg-blue-50 border-blue-200 border-2' : ''
              }`} style={{ height: '60px' }}>
                {/* Drop indicator */}
                {isDropTarget && (
                  <div className="absolute left-0 right-0 h-1 bg-blue-400 z-30 -mt-1" />
                )}
                
                {/* Task Name Column */}
                <div className="w-64 p-3 border-r bg-white">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-sm flex-shrink-0 transition-all duration-200 ${
                        isSelected ? 'ring-2 ring-blue-400' : ''
                      } ${isDependencySource ? 'ring-2 ring-green-400 animate-pulse' : ''} ${
                        showDependencyMode && !isDependencySource ? 'hover:ring-2 hover:ring-blue-300' : ''
                      }`}
                      style={{ backgroundColor: getTradeColor(task.trade) }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-sm truncate" title={task.title}>
                          {task.title}
                        </div>
                        {isDependencySource && (
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Select next task to link to this one" />
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{task.trade}</div>
                      {task.dependencies && (
                        <div className="text-xs text-blue-600 bg-blue-50 px-1 rounded">
                          Waits for: {task.dependencies}
                        </div>
                      )}
                      {showDependencyMode && !task.dependencies && (
                        <div className="text-xs text-gray-400 italic">Click to link tasks</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Timeline Column */}
                <div className="flex-1 min-w-0 relative overflow-x-auto">
                  <div className="h-full flex" style={{ minWidth: `${timelineDates.length * (timelineViewMode === 'week' ? Math.max(60, 800 / totalDays) : Math.max(30, 800 / totalDays))}px` }}>
                    {/* Date Grid Background */}
                    {timelineDates.map((date) => {
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                      const cellWidth = timelineViewMode === 'week' ? 
                        Math.max(60, 800 / totalDays) : 
                        Math.max(30, 800 / totalDays);
                      
                      return (
                        <div
                          key={date.toISOString()}
                          className={`flex-shrink-0 border-l h-full ${
                            isToday(date) ? 'bg-blue-50 border-blue-200' : 
                            isWeekend ? 'bg-gray-50' : ''
                          }`}
                          style={{ minWidth: `${cellWidth}px` }}
                        />
                      );
                    })}
                    
                    {/* Enhanced Task Bar with Smooth Drag Preview */}
                    <div
                      className={`absolute top-2 bottom-2 rounded-md transition-all duration-200 group-hover:shadow-lg ${
                        isSelected ? 'ring-2 ring-blue-400 shadow-lg' : ''
                      } ${isDependencySource ? 'ring-2 ring-green-400' : ''} ${
                        showDependencyMode ? 'cursor-crosshair' : 'cursor-move'
                      } ${dragState.isDragging && dragState.taskId === task.id ? 'opacity-30' : ''}`}
                      style={{
                        left: `${position.left}%`,
                        width: `${position.width}%`,
                        backgroundColor: getTradeColor(task.trade),
                        opacity: dragState.isDragging && dragState.taskId === task.id ? 0.3 : 
                                (task.status === 'completed' ? 0.8 : 1),
                        minWidth: '20px',
                        zIndex: isSelected ? 20 : 10
                      }}
                      onContextMenu={(e) => handleTaskRightClick(task, e)}
                      onMouseDown={(e) => handleMouseDown(e, task, 'move')}
                      title={`${task.title} (${task.duration} days) • Click to edit`}
                    >
                      {/* Task Content */}
                      <div className="h-full flex items-center px-2 relative">
                        <span className="text-white text-xs font-medium truncate">
                          {task.title}
                        </span>
                        {task.status === 'completed' && (
                          <div className="ml-auto">
                            <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full" />
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Resize Handles - Only show when not in dependency mode */}
                      {!readonly && !showDependencyMode && (
                        <>
                          {/* Left resize handle */}
                          <div
                            className="absolute left-0 top-0 bottom-0 w-2 bg-white bg-opacity-30 cursor-w-resize opacity-0 group-hover:opacity-100 transition-opacity"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleMouseDown(e, task, 'resize-start');
                            }}
                            title="Resize start date"
                          />
                          
                          {/* Right resize handle */}
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 bg-white bg-opacity-30 cursor-e-resize opacity-0 group-hover:opacity-100 transition-opacity"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleMouseDown(e, task, 'resize-end');
                            }}
                            title="Resize end date"
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline Navigation and View Controls */}
      <div className="border-t p-3 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="w-4 h-4" />
            <span>
              {format(viewStartDate, 'MMM dd, yyyy')} - {format(viewEndDate, 'MMM dd, yyyy')}
            </span>
          </div>
          
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-white rounded-md border p-1">
            <Button
              variant={timelineViewMode === 'week' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTimelineViewMode('week')}
              className="h-7 px-3 text-xs"
            >
              Week View
            </Button>
            <Button
              variant={timelineViewMode === 'month' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTimelineViewMode('month')}
              className="h-7 px-3 text-xs"
            >
              Month View
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const offset = timelineViewMode === 'week' ? -7 : -30;
              setCurrentMonth(addDays(currentMonth, offset));
            }}
          >
            ← Previous {timelineViewMode === 'week' ? 'Week' : 'Month'}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentMonth(new Date());
            }}
          >
            Today
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const offset = timelineViewMode === 'week' ? 7 : 30;
              setCurrentMonth(addDays(currentMonth, offset));
            }}
          >
            Next {timelineViewMode === 'week' ? 'Week' : 'Month'} →
          </Button>
        </div>
      </div>

      {/* Live Drag Tooltip */}
      {dragTooltip.visible && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg pointer-events-none"
          style={{
            left: `${dragTooltip.x}px`,
            top: `${dragTooltip.y}px`,
            transform: 'translateX(-50%)'
          }}
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-3 h-3" />
            <span>{dragTooltip.startDate} → {dragTooltip.endDate}</span>
          </div>
          <div className="text-xs opacity-75 mt-1">
            {dragState.dragType === 'move' ? 'Moving task' : 
             dragState.dragType === 'resize-start' ? 'Adjusting start' : 'Adjusting end'}
          </div>
        </div>
      )}

      {/* Row Reorder Indicator */}
      {dragState.isDragging && dragState.targetRowIndex !== null && (
        <div
          className="fixed left-0 right-0 h-1 bg-blue-400 opacity-75 pointer-events-none z-40"
          style={{
            top: `${400 + (dragState.targetRowIndex * 60)}px` // Adjust for header height
          }}
        />
      )}

      {/* Visual Drag Preview - Floating Task Box */}
      {dragPreview.visible && dragPreview.task && (
        <div
          className="fixed pointer-events-none z-50 rounded-md shadow-2xl border-2 border-blue-400"
          style={{
            left: `${dragPreview.x}px`,
            top: `${dragPreview.y}px`,
            width: `${dragPreview.width}px`,
            height: `${dragPreview.height}px`,
            backgroundColor: getTradeColor(dragPreview.task.trade),
            opacity: 0.9,
            transform: 'scale(1.05)', // Slightly larger for better visibility
            transition: 'none' // No transition for smooth following
          }}
        >
          <div className="h-full flex items-center px-3 relative">
            <span className="text-white text-sm font-medium truncate">
              {dragPreview.task.title}
            </span>
            <div className="ml-auto text-white text-xs opacity-75">
              {dragPreview.projectedStartDate && dragPreview.projectedEndDate && 
                `${differenceInDays(dragPreview.projectedEndDate, dragPreview.projectedStartDate) + 1}d`
              }
            </div>
            
            {/* Drag type indicator */}
            <div className="absolute -top-6 left-0 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg">
              {dragState.dragType === 'move' ? '↔️ Moving' : 
               dragState.dragType === 'resize-start' ? '⬅️ Start' : 
               dragState.dragType === 'resize-end' ? '➡️ End' : 'Dragging'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export function AdvancedTimelineBuilder({ 
  projectId, 
  readonly = false, 
  fullscreen = false, 
  onFullscreenToggle,
  onTaskEdit,
  onTaskCreate,
  onTaskDelete,
  onTaskUpdate 
}: AdvancedTimelineBuilderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tradeFilter, setTradeFilter] = useState('all');
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [showEstimateDialog, setShowEstimateDialog] = useState(false);
  const [showAutoScheduleDialog, setShowAutoScheduleDialog] = useState(false);
  const [showCsvImportDialog, setShowCsvImportDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ taskId: number; taskTitle: string } | null>(null);
  
  // Data fetching - Force fresh data for timeline
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: [`/api/projects/${projectId}/tasks`],
    staleTime: 0, // Always consider stale to force fresh data
    gcTime: 0, // Don't cache tasks
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 1000, // Frequent updates
  });

  // Debug logging for timeline tasks
  React.useEffect(() => {
    // Target operation completed
  }, [tasks, projectId]);

  const { data: estimates = [] } = useQuery<any[]>({
    queryKey: [`/api/estimates`],
  });

  const { data: project } = useQuery<any>({
    queryKey: [`/api/projects/${projectId}`],
  });

  // Available estimate items for task creation and auto-scheduling (filtered by current project)
  const availableEstimates = useMemo(() => {
    const items: any[] = [];
    // Filter estimates to only include those for the current project
    const projectEstimates = estimates.filter((estimate: any) => 
      estimate.projectId === parseInt(projectId.toString()) || estimate.projectId === projectId
    );
    
    projectEstimates.forEach((estimate: any) => {
      if (estimate.categories && Array.isArray(estimate.categories)) {
        estimate.categories.forEach((category: any) => {
          if (category.items && Array.isArray(category.items)) {
            category.items.forEach((item: any) => {
              if (item.title && item.id) {
                items.push({
                  id: item.id,
                  name: item.title,
                  trade: category.name || 'General',
                  category: category.name,
                  duration: item.estimatedDuration || Math.ceil((item.quantity || 1) / 10),
                  status: item.status || 'pending',
                  assignedContactId: item.assignedContactId,
                  description: item.description || '',
                  quantity: item.quantity || 1,
                  unit: item.unit || 'unit',
                  estimatedDuration: item.estimatedDuration || Math.ceil((item.quantity || 1) / 10)
                });
              }
            });
          }
        });
      }
    });
    return items;
  }, [estimates, projectId]);

  // Create a lookup map for estimate items by ID
  const estimateItemsMap = useMemo(() => {
    const map = new Map<string, { name: string; trade: string }>();
    availableEstimates.forEach(item => {
      map.set(item.id, { name: item.name, trade: item.trade });
    });
    return map;
  }, [availableEstimates]);

  // Helper function to get display name for task dependencies
  const getTaskDisplayName = useCallback((task: Task) => {
    if (task.estimateItemId) {
      const estimateItem = estimateItemsMap.get(task.estimateItemId.toString());
      if (estimateItem) {
        return `${estimateItem.name} - ${estimateItem.trade}`;
      }
    }
    // Fallback to task title and trade if estimate item not found
    return `${task.title} - ${task.trade}`;
  }, [estimateItemsMap]);

  // Parse dependencies from tasks
  const dependencies = useMemo(() => {
    const deps: DependencyArrow[] = [];
    tasks.forEach(task => {
      if (task.dependencies && typeof task.dependencies === 'string') {
        const dependencyIds = task.dependencies.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        dependencyIds.forEach(fromTaskId => {
          // Default to Finish-to-Start with no lag for existing dependencies
          deps.push({
            fromTaskId,
            toTaskId: task.id,
            type: 'FS',
            lag: 0
          });
        });
      }
    });
    return deps;
  }, [tasks]);

  // Handle dependency edit
  const handleDependencyEdit = useCallback((dependency: DependencyArrow) => {
    setEditingDependency(dependency);
    setShowDependencyEditModal(true);
  }, []);

  // Handle dependency save
  const handleDependencySave = useCallback((dependency: DependencyArrow) => {
    // Update the task's dependencies string
    const toTask = tasks.find(t => t.id === dependency.toTaskId);
    if (toTask && onTaskUpdate) {
      const existingDeps = toTask.dependencies && typeof toTask.dependencies === 'string' 
        ? toTask.dependencies.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) 
        : [];
      
      // Remove existing dependency for this fromTask
      const filteredDeps = existingDeps.filter(id => id !== dependency.fromTaskId);
      
      // Add the new dependency
      filteredDeps.push(dependency.fromTaskId);
      
      const updatedTask = {
        ...toTask,
        dependencies: filteredDeps.join(', ')
      };
      
      onTaskUpdate(updatedTask);
    }
    setShowDependencyEditModal(false);
    setEditingDependency(null);
  }, [tasks, onTaskUpdate]);

  // Handle dependency delete
  const handleDependencyDelete = useCallback((fromTaskId: number, toTaskId: number) => {
    const toTask = tasks.find(t => t.id === toTaskId);
    if (toTask && onTaskUpdate) {
      const existingDeps = toTask.dependencies && typeof toTask.dependencies === 'string' 
        ? toTask.dependencies.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) 
        : [];
      const updatedDependencies = existingDeps.filter(id => id !== fromTaskId);
      
      const updatedTask = {
        ...toTask,
        dependencies: updatedDependencies.length > 0 ? updatedDependencies.join(', ') : ''
      };
      
      onTaskUpdate(updatedTask);
    }
    setShowDependencyEditModal(false);
    setEditingDependency(null);
  }, [tasks, onTaskUpdate]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task: Task) => {
      const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (task.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
      const matchesTrade = tradeFilter === 'all' || task.trade === tradeFilter;
      
      return matchesSearch && matchesStatus && matchesTrade;
    });
  }, [tasks, searchTerm, statusFilter, tradeFilter]);

  // Auto-schedule mutation
  const autoScheduleMutation = useMutation({
    mutationFn: async (scheduledTasks: any[]) => {
      const promises = scheduledTasks.map(task => 
        apiRequest('POST', `/api/projects/${projectId}/tasks`, {
          projectId,
          title: task.title,
          trade: task.trade,
          startDate: task.startDate.toISOString(),
          endDate: task.endDate.toISOString(),
          duration: task.duration,
          status: task.status,
          dependencies: task.dependencies,
          description: task.description,
          orderIndex: task.orderIndex,
          contactId: task.contactId
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({
        title: "Success",
        description: "Auto-schedule generated successfully",
      });
      setShowAutoScheduleDialog(false);
    },
    onError: (error: any) => {
      console.error('Auto-schedule error:', error);
      toast({
        title: "Error",
        description: "Failed to generate auto-schedule",
        variant: "destructive",
      });
    },
  });

  // CSV import mutation
  const csvImportMutation = useMutation({
    mutationFn: async (importedTasks: any[]) => {
      const promises = importedTasks.map(task => 
        apiRequest('POST', `/api/projects/${projectId}/tasks`, {
          projectId,
          title: task.title,
          trade: task.trade,
          startDate: task.startDate?.toISOString() || new Date().toISOString(),
          endDate: task.startDate ? 
            new Date(task.startDate.getTime() + task.duration * 24 * 60 * 60 * 1000).toISOString() :
            new Date(Date.now() + task.duration * 24 * 60 * 60 * 1000).toISOString(),
          duration: task.duration,
          status: 'not-started',
          dependencies: task.dependencies.join(', '),
          description: task.description,
          orderIndex: task.orderIndex
        })
      );
      return Promise.all(promises);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({
        title: "Success",
        description: `Successfully imported ${data.length} tasks from CSV`,
      });
      setShowCsvImportDialog(false);
    },
    onError: (error: any) => {
      console.error('CSV import error:', error);
      toast({
        title: "Error",
        description: "Failed to import CSV schedule",
        variant: "destructive",
      });
    },
  });

  // Task creation mutation
  const createTaskMutation = useMutation({
    mutationFn: async (taskData: any) => {
      return apiRequest('POST', `/api/projects/${projectId}/tasks`, taskData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({
        title: "Success",
        description: "Task created successfully",
      });
      setShowCreateTaskDialog(false);
    },
    onError: (error: any) => {
      console.error('Create task error:', error);
      toast({
        title: "Error",
        description: "Failed to create task",
        variant: "destructive",
      });
    },
  });

  // Task update mutation
  const updateTaskMutation = useMutation({
    mutationFn: async (taskData: any) => {
      return apiRequest('PUT', `/api/projects/${projectId}/tasks/${taskData.id}`, taskData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({
        title: "Success",
        description: "Task updated successfully",
      });
      setEditingTask(null);
    },
    onError: (error: any) => {
      console.error('Update task error:', error);
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      });
    },
  });

  // Mutations
  const createFromEstimateMutation = useMutation({
    mutationFn: async (item: any) => {
      const newTask = {
        projectId,
        title: item.title || item.name,
        description: item.description,
        trade: item.trade || 'General',
        duration: item.estimatedDuration || item.duration,
        status: 'not-started',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + (item.estimatedDuration || item.duration) * 24 * 60 * 60 * 1000).toISOString(),
        estimateItemId: item.id
      };

      return apiRequest('POST', `/api/projects/${projectId}/tasks`, newTask);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({ title: "Task created successfully from estimate item" });
      setShowEstimateDialog(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create task", 
        description: error?.message || "Unknown error occurred",
        variant: "destructive" 
      });
    }
  });

  if (tasksLoading) {
    return <div className="flex items-center justify-center p-8">Loading timeline...</div>;
  }

  const containerClass = fullscreen 
    ? "fixed inset-0 z-50 bg-white overflow-auto"
    : "space-y-6";

  return (
    <div className={containerClass}>
      {/* Fixed Timeline Header with Actions */}
      <div className="timeline-header sticky top-0 z-10 bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                {project?.name && (
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-sm">
                    {project.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-semibold">
                    {fullscreen ? 'Advanced Timeline Builder' : 'Project Timeline'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Last updated: {new Date().toLocaleTimeString()} • {filteredTasks.length} tasks
                  </p>
                </div>
              </div>
            </div>
            
            {fullscreen && onFullscreenToggle && (
              <Button variant="outline" onClick={onFullscreenToggle}>
                <X className="w-4 h-4 mr-2" />
                Exit Fullscreen
              </Button>
            )}
          </div>
          
          {/* Action Buttons Row */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={() => setShowAutoScheduleDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
              disabled={readonly || availableEstimates.length === 0}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Auto-Generate Schedule
            </Button>
            
            <Button
              onClick={() => setShowCsvImportDialog(true)}
              variant="outline"
              size="sm"
              disabled={readonly}
              className="text-purple-600 border-purple-200 hover:bg-purple-50"
            >
              <FileText className="w-4 h-4 mr-2" />
              Import CSV Schedule
            </Button>
            
            <Button
              onClick={() => setShowCreateTaskDialog(true)}
              variant="outline"
              size="sm"
              disabled={readonly}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
            
            <Button
              onClick={() => setShowEstimateDialog(true)}
              variant="outline"
              size="sm"
              disabled={readonly || availableEstimates.length === 0}
            >
              <Link className="w-4 h-4 mr-2" />
              From Estimates ({availableEstimates.length})
            </Button>
            
            <Button
              onClick={() => {
                // Export CSV functionality  
                const csvData = filteredTasks.map(task => ({
                  'Task Name': task.title,
                  'Trade': task.trade,
                  'Status': task.status,
                  'Start Date': task.startDate ? format(typeof task.startDate === 'string' ? parseISO(task.startDate) : task.startDate, 'yyyy-MM-dd') : '',
                  'End Date': task.endDate ? format(typeof task.endDate === 'string' ? parseISO(task.endDate) : task.endDate, 'yyyy-MM-dd') : '',
                  'Duration (days)': task.duration || 0,
                  'Description': task.description || ''
                }));
                
                const csv = [
                  Object.keys(csvData[0] || {}).join(','),
                  ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
                ].join('\n');
                
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${project?.name || 'project'}-timeline-${format(new Date(), 'yyyy-MM-dd')}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
                
                toast({
                  title: "Export Complete",
                  description: "Timeline exported as CSV file",
                });
              }}
              variant="outline"
              size="sm"
              disabled={filteredTasks.length === 0}
              className="text-green-600 border-green-200 hover:bg-green-50"
            >
              <FileText className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            
            {!fullscreen && onFullscreenToggle && (
              <Button variant="outline" size="sm" onClick={onFullscreenToggle} className="ml-auto">
                <Maximize className="w-4 h-4 mr-2" />
                Fullscreen
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className={fullscreen ? "p-6 pt-0" : "pt-0"}>
        {/* Search and Filters Section */}
        <div className="w-full bg-white border-b pb-4 mb-4 px-6 pt-4">
          {/* Search and Filter Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search tasks, subcontractors, trades..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-80"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchTerm('')}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="not-started">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                      Not Started
                    </div>
                  </SelectItem>
                  <SelectItem value="in-progress">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      In Progress
                    </div>
                  </SelectItem>
                  <SelectItem value="completed">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      Completed
                    </div>
                  </SelectItem>
                  <SelectItem value="on-hold">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                      On Hold
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select value={tradeFilter} onValueChange={setTradeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Trade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Trades</SelectItem>
                  <SelectItem value="Permits">Permits</SelectItem>
                  <SelectItem value="Excavation">Excavation</SelectItem>
                  <SelectItem value="Concrete">Concrete</SelectItem>
                  <SelectItem value="Framing">Framing</SelectItem>
                  <SelectItem value="Roofing">Roofing</SelectItem>
                  <SelectItem value="Plumbing">Plumbing</SelectItem>
                  <SelectItem value="Electrical">Electrical</SelectItem>
                  <SelectItem value="HVAC">HVAC</SelectItem>
                  <SelectItem value="Drywall">Drywall</SelectItem>
                  <SelectItem value="Flooring">Flooring</SelectItem>
                  <SelectItem value="Painting">Painting</SelectItem>
                  <SelectItem value="Landscaping">Landscaping</SelectItem>
                </SelectContent>
              </Select>

              {(searchTerm || statusFilter !== 'all' || tradeFilter !== 'all') && (
                <Badge variant="secondary" className="text-sm">
                  {filteredTasks.length} of {tasks.length} tasks shown
                </Badge>
              )}
            </div>

            {/* Export Options */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Export as CSV functionality
                  const csvData = filteredTasks.map(task => ({
                    'Task Name': task.title,
                    'Trade': task.trade,
                    'Status': task.status,
                    'Start Date': task.startDate ? format(typeof task.startDate === 'string' ? parseISO(task.startDate) : task.startDate, 'yyyy-MM-dd') : '',
                    'End Date': task.endDate ? format(typeof task.endDate === 'string' ? parseISO(task.endDate) : task.endDate, 'yyyy-MM-dd') : '',
                    'Duration (days)': task.duration || 0,
                    'Description': task.description || ''
                  }));
                  
                  const csv = [
                    Object.keys(csvData[0] || {}).join(','),
                    ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
                  ].join('\n');
                  
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${project?.name || 'project'}-timeline-${format(new Date(), 'yyyy-MM-dd')}.csv`;
                  a.click();
                  window.URL.revokeObjectURL(url);
                  
                  toast({
                    title: "Export Complete",
                    description: "Timeline exported as CSV file",
                  });
                }}
                disabled={filteredTasks.length === 0}
                className="text-green-600 border-green-200 hover:bg-green-50"
              >
                <FileText className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Horizontally Scrollable Gantt Chart - Only this area scrolls horizontally */}
        <div className="gantt-scroll-wrapper bg-white border rounded-lg overflow-hidden">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Let's build your schedule!</h3>
              <p className="text-gray-600 mb-6 max-w-md">
                Start by adding tasks manually, importing from CSV, or generating from your estimates.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button 
                  onClick={() => setShowCreateTaskDialog(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={readonly}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Task
                </Button>
                {availableEstimates.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setShowAutoScheduleDialog(true)}
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                    disabled={readonly}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Auto-Generate from Estimates
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setShowCsvImportDialog(true)}
                  className="text-purple-600 border-purple-200 hover:bg-purple-50"
                  disabled={readonly}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Import CSV
                </Button>
              </div>
            </div>
          ) : (
            <div className="gantt-chart overflow-x-auto relative" id="gantt-container">
              <GanttTimeline
                tasks={filteredTasks}
                onTaskEdit={onTaskEdit}
                onTaskUpdate={onTaskUpdate}
                onTaskDelete={(taskId: number) => {
                  const task = filteredTasks.find(t => t.id === taskId);
                  if (task) {
                    setShowDeleteConfirm({ taskId, taskTitle: task.title });
                  }
                }}
                readonly={readonly}
              />
              {/* Dependency Arrows Overlay */}
              {showDependencies && dependencies.length > 0 && (
                <DependencyArrows
                  dependencies={dependencies}
                  tasks={filteredTasks}
                  containerId="gantt-container"
                  onEdit={handleDependencyEdit}
                  onDelete={handleDependencyDelete}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Task Editor Modal */}
      <ScheduleEditorModal
        isOpen={showCreateTaskDialog || !!editingTask}
        onClose={() => {
          setShowCreateTaskDialog(false);
          setEditingTask(null);
        }}
        onSave={editingTask ? 
          (taskData) => {
            updateTaskMutation.mutate({
              ...editingTask,
              ...taskData
            });
          } : 
          (taskData) => {
            createTaskMutation.mutate({
              projectId,
              ...taskData,
              orderIndex: tasks.length
            });
          }
        }
        task={editingTask}
        projectId={projectId}
        isLoading={createTaskMutation.isPending || updateTaskMutation.isPending}
      />

      {/* Auto-Schedule Dialog */}
      <Dialog open={showAutoScheduleDialog} onOpenChange={setShowAutoScheduleDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              Auto-Generate Project Schedule
            </DialogTitle>
          </DialogHeader>
          <AutoScheduleDialog 
            availableEstimates={availableEstimates}
            projectStartDate={project?.startDate ? new Date(project.startDate) : new Date()}
            onGenerate={(scheduledTasks) => {
              autoScheduleMutation.mutate(scheduledTasks);
            }}
            onCancel={() => setShowAutoScheduleDialog(false)}
            isGenerating={autoScheduleMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={showCsvImportDialog} onOpenChange={setShowCsvImportDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              Import Schedule from CSV
            </DialogTitle>
          </DialogHeader>
          <CsvImportDialog 
            projectStartDate={project?.startDate ? new Date(project.startDate) : new Date()}
            onImport={(importedTasks) => {
              csvImportMutation.mutate(importedTasks);
            }}
            onCancel={() => setShowCsvImportDialog(false)}
            isImporting={csvImportMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Estimate Dialog */}
      <Dialog open={showEstimateDialog} onOpenChange={setShowEstimateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Tasks from Estimates</DialogTitle>
          </DialogHeader>
          
          <div className="max-h-96 overflow-y-auto">
            <div className="space-y-2">
              {availableEstimates.map((item: EstimateItem) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <h4 className="font-medium">{item.title}</h4>
                    <p className="text-sm text-gray-500">{item.description}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                      <span>Qty: {item.quantity || 1} {item.unit || 'unit'}</span>
                      <span>Est. Duration: {item.estimatedDuration || Math.ceil((item.quantity || 1) / 10)} days</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => createFromEstimateMutation.mutate(item)}
                    disabled={createFromEstimateMutation.isPending}
                  >
                    Create Task
                  </Button>
                </div>
              ))}
            </div>
            
            {availableEstimates.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No estimate items available for task creation</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the task "{showDeleteConfirm?.taskTitle}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteConfirm(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (showDeleteConfirm && onTaskDelete) {
                  onTaskDelete(showDeleteConfirm.taskId);
                  setShowDeleteConfirm(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dependency Edit Modal */}
      <DependencyEditModal
        isOpen={showDependencyEditModal}
        onClose={() => {
          setShowDependencyEditModal(false);
          setEditingDependency(null);
        }}
        dependency={editingDependency}
        tasks={tasks}
        onSave={handleDependencySave}
        onDelete={handleDependencyDelete}
      />
    </div>
  );
}