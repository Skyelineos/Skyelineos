import { useState, useRef, useEffect } from 'react';
import { useAdvancedGantt, type GanttTask } from '@/hooks/useAdvancedGantt';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, ChevronLeft, ChevronRight, Settings, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface GanttChartProps {
  initialTasks?: GanttTask[];
  onTaskSelect?: (task: GanttTask | null) => void;
  onTaskUpdate?: (task: GanttTask) => void;
  className?: string;
}

export function GanttChart({ 
  initialTasks = [], 
  onTaskSelect, 
  onTaskUpdate,
  className 
}: GanttChartProps) {
  const {
    tasks,
    viewConfig,
    timelineColumns,
    criticalPath,
    selectedTask,
    updateTask,
    updateViewConfig,
    getTaskPosition,
    handleTaskDrag,
    setSelectedTask
  } = useAdvancedGantt(initialTasks);

  const [isScrolling, setIsScrolling] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleTaskClick = (task: GanttTask) => {
    setSelectedTask(task.id === selectedTask ? null : task.id);
    onTaskSelect?.(task.id === selectedTask ? null : task);
  };

  const renderTask = (task: GanttTask) => {
    const position = getTaskPosition(task);
    const isSelected = selectedTask === task.id;
    const isCritical = position.isCritical;
    
    return (
      <div
        key={task.id}
        className={cn(
          'absolute h-8 rounded flex items-center px-2 text-xs font-medium cursor-pointer transition-all',
          'hover:shadow-lg hover:z-10',
          isSelected && 'ring-2 ring-blue-500 z-20',
          isCritical ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
        )}
        style={{
          left: `${(position.left / timelineColumns.length) * 100}%`,
          width: `${(position.width / timelineColumns.length) * 100}%`,
          minWidth: '60px'
        }}
        onClick={() => handleTaskClick(task)}
      >
        <div className="flex-1 truncate">
          {task.name}
        </div>
        <div className="ml-1 text-xs opacity-80">
          {task.progress}%
        </div>
      </div>
    );
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Project Gantt Chart
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateViewConfig({ showCriticalPath: !viewConfig.showCriticalPath })}
            >
              {viewConfig.showCriticalPath ? 'Hide' : 'Show'} Critical Path
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* View Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Button
              variant={viewConfig.viewMode === 'day' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateViewConfig({ viewMode: 'day' })}
            >
              Day
            </Button>
            <Button
              variant={viewConfig.viewMode === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateViewConfig({ viewMode: 'week' })}
            >
              Week
            </Button>
            <Button
              variant={viewConfig.viewMode === 'month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateViewConfig({ viewMode: 'month' })}
            >
              Month
            </Button>
          </div>
          
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {format(viewConfig.startDate, 'MMM yyyy')}
            </span>
            <Button variant="ghost" size="sm">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="border-t">
          {/* Timeline Header */}
          <div className="flex border-b bg-gray-50">
            <div className="w-64 p-3 border-r bg-white font-medium">
              Task Name
            </div>
            <div 
              ref={scrollContainerRef}
              className="flex-1 overflow-x-auto"
              onScroll={() => setIsScrolling(true)}
            >
              <div className="flex min-w-[800px]">
                {timelineColumns.map((column, index) => (
                  <div
                    key={index}
                    className={cn(
                      'flex-1 p-2 text-center text-xs border-r',
                      column.isWeekend && 'bg-gray-100'
                    )}
                  >
                    {column.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Tasks */}
          <div className="max-h-96 overflow-y-auto">
            {tasks.map((task, index) => (
              <div key={task.id} className="flex border-b hover:bg-gray-50">
                <div className="w-64 p-3 border-r">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm truncate">
                        {task.name}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        {task.priority && (
                          <Badge 
                            variant="outline" 
                            className={cn('text-xs', getPriorityColor(task.priority))}
                          >
                            {task.priority}
                          </Badge>
                        )}
                        {task.assignee && (
                          <span className="text-xs text-gray-500">
                            {task.assignee}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 relative min-h-[60px] overflow-x-auto">
                  <div className="absolute inset-0">
                    <div className="flex min-w-[800px] h-full">
                      {timelineColumns.map((column, colIndex) => (
                        <div
                          key={colIndex}
                          className={cn(
                            'flex-1 border-r',
                            column.isWeekend && 'bg-gray-100'
                          )}
                        />
                      ))}
                    </div>
                    {renderTask(task)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {tasks.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No tasks yet</p>
              <p className="text-sm mb-4">Add your first task to start planning</p>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Task
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}