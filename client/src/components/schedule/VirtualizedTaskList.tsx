import { memo, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { format, differenceInDays, isAfter, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { tradeLabel } from '@/lib/estimates/markup';

interface Task {
  id: string | number;
  title: string;
  description?: string;
  projectId: string | number;
  projectName: string;
  startDate: string;
  endDate: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'on_hold' | 'overdue';
  priority: 'low' | 'normal' | 'high' | 'critical';
  assignedTo?: string;
  estimatedCost?: number;
  actualCost?: number;
  progress?: number;
  trade?: string;
  weatherDependent?: boolean;
  dependencies?: string[];
}

interface VirtualizedTaskListProps {
  tasks: Task[];
  height: number;
  className?: string;
  onTaskClick?: (task: Task) => void;
  onTaskEdit?: (taskId: string | number) => void;
  showProject?: boolean;
  groupBy?: 'none' | 'project' | 'status' | 'trade' | 'date';
  filterStatus?: string[];
  searchTerm?: string;
}

/**
 * Virtualized task list component optimized for project schedules
 * 
 * Features:
 * - Handles thousands of tasks without performance degradation
 * - Color-coded status indicators
 * - Progress bars and cost tracking
 * - Dependency indicators
 * - Weather-dependent task markers
 * - Flexible grouping and filtering
 * - Search functionality
 */
export const VirtualizedTaskList = memo(({
  tasks,
  height,
  className,
  onTaskClick,
  onTaskEdit,
  showProject = true,
  groupBy = 'none',
  filterStatus,
  searchTerm
}: VirtualizedTaskListProps) => {

  // Filter and process tasks
  const processedTasks = useMemo(() => {
    let filtered = [...tasks];

    // Apply status filter
    if (filterStatus && filterStatus.length > 0) {
      filtered = filtered.filter(task => filterStatus.includes(task.status));
    }

    // Apply search filter
    if (searchTerm && searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(task => 
        task.title.toLowerCase().includes(search) ||
        task.description?.toLowerCase().includes(search) ||
        task.projectName.toLowerCase().includes(search) ||
        task.trade?.toLowerCase().includes(search) ||
        task.assignedTo?.toLowerCase().includes(search)
      );
    }

    // Sort by start date by default
    filtered.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    return filtered;
  }, [tasks, filterStatus, searchTerm]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'scheduled':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'on_hold':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'overdue':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-red-600';
      case 'high':
        return 'text-orange-600';
      case 'normal':
        return 'text-gray-600';
      case 'low':
        return 'text-gray-400';
      default:
        return 'text-gray-600';
    }
  };

  const getTaskDuration = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = differenceInDays(end, start) + 1;
    return days === 1 ? '1 day' : `${days} days`;
  };

  const isOverdue = (endDate: string, status: string) => {
    return status !== 'completed' && isBefore(new Date(endDate), new Date());
  };

  const formatTaskDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  const renderTask = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const task = processedTasks[index];
    const overdue = isOverdue(task.endDate, task.status);
    const progress = task.progress || 0;

    return (
      <div 
        style={{
          ...style,
          padding: '12px 16px',
        }}
        className={cn(
          "border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors",
          overdue && "bg-red-50"
        )}
        onClick={() => onTaskClick?.(task)}
      >
        <div className="flex items-start justify-between">
          {/* Task Info */}
          <div className="flex-1 min-w-0 pr-4">
            {/* Title and Project */}
            <div className="flex items-center space-x-2 mb-1">
              <h4 className="font-medium text-sm text-gray-900 truncate">
                {task.title}
              </h4>
              
              {/* Priority indicator */}
              {task.priority !== 'normal' && (
                <span className={cn(
                  "text-xs font-bold",
                  getPriorityColor(task.priority)
                )}>
                  {task.priority === 'critical' ? '🔴' : 
                   task.priority === 'high' ? '🟠' : 
                   task.priority === 'low' ? '🔵' : ''}
                </span>
              )}

              {/* Weather dependent indicator */}
              {task.weatherDependent && (
                <span className="text-xs" title="Weather Dependent">🌦️</span>
              )}

              {/* Dependencies indicator */}
              {task.dependencies && task.dependencies.length > 0 && (
                <span className="text-xs" title={`${task.dependencies.length} dependencies`}>
                  🔗
                </span>
              )}
            </div>

            {/* Project name */}
            {showProject && (
              <p className="text-xs text-gray-500 mb-1">
                📁 {task.projectName}
              </p>
            )}

            {/* Description */}
            {task.description && (
              <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                {task.description}
              </p>
            )}

            {/* Dates and Duration */}
            <div className="flex items-center space-x-4 text-xs text-gray-500 mb-2">
              <span>{formatTaskDate(task.startDate)}</span>
              <span>→</span>
              <span>{formatTaskDate(task.endDate)}</span>
              <span>•</span>
              <span>{getTaskDuration(task.startDate, task.endDate)}</span>
            </div>

            {/* Progress bar */}
            {progress > 0 && (
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-600">Progress</span>
                  <span className="text-gray-800 font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1" />
              </div>
            )}

            {/* Additional Info */}
            <div className="flex items-center space-x-4 text-xs text-gray-600">
              {task.trade && (
                <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">
                  {tradeLabel(task.trade)}
                </span>
              )}
              
              {task.assignedTo && (
                <span>👤 {task.assignedTo}</span>
              )}

              {task.estimatedCost && (
                <span>💰 ${task.estimatedCost.toLocaleString()}</span>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex-shrink-0 ml-4">
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs",
                getStatusColor(overdue ? 'overdue' : task.status)
              )}
            >
              {overdue ? 'OVERDUE' : task.status.replace('_', ' ').toUpperCase()}
            </Badge>
            
            {/* Edit button */}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 text-gray-400 hover:text-gray-600 transition-colors h-auto p-1"
              onClick={(e) => {
                e.stopPropagation();
                onTaskEdit?.(task.id);
              }}
              title="Edit task"
            >
              ✏️
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (!processedTasks || processedTasks.length === 0) {
    return (
      <div className={cn(
        "flex items-center justify-center h-full text-gray-500",
        className
      )}>
        <div className="text-center">
          <div className="text-lg mb-2">📅</div>
          <div className="text-sm">
            {searchTerm || filterStatus?.length ? 'No tasks match your filters' : 'No tasks scheduled'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {!searchTerm && !filterStatus?.length && 'Create your first task to get started'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Summary header */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm text-gray-600">
        Showing {processedTasks.length} task{processedTasks.length !== 1 ? 's' : ''}
        {searchTerm && ` matching "${searchTerm}"`}
        {filterStatus?.length && ` with status: ${filterStatus.join(', ')}`}
      </div>
      
      <List
        height={height - 40} // Account for header
        width="100%"
        itemCount={processedTasks.length}
        itemSize={120} // Standard task row height
        className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
        overscanCount={5}
      >
        {renderTask}
      </List>
    </div>
  );
});

VirtualizedTaskList.displayName = 'VirtualizedTaskList';

/**
 * Task list filter utilities
 */
export const TaskFilters = {
  byStatus: (tasks: Task[], statuses: string[]) => 
    tasks.filter(task => statuses.includes(task.status)),
    
  byPriority: (tasks: Task[], priorities: string[]) =>
    tasks.filter(task => priorities.includes(task.priority)),
    
  byDateRange: (tasks: Task[], startDate: Date, endDate: Date) =>
    tasks.filter(task => {
      const taskStart = new Date(task.startDate);
      const taskEnd = new Date(task.endDate);
      return (isAfter(taskStart, startDate) || taskStart.getTime() === startDate.getTime()) &&
             (isBefore(taskEnd, endDate) || taskEnd.getTime() === endDate.getTime());
    }),
    
  byProject: (tasks: Task[], projectIds: (string | number)[]) =>
    tasks.filter(task => projectIds.includes(task.projectId)),
    
  bySearch: (tasks: Task[], searchTerm: string) => {
    const search = searchTerm.toLowerCase();
    return tasks.filter(task => 
      task.title.toLowerCase().includes(search) ||
      task.description?.toLowerCase().includes(search) ||
      task.projectName.toLowerCase().includes(search) ||
      task.trade?.toLowerCase().includes(search) ||
      task.assignedTo?.toLowerCase().includes(search)
    );
  }
};