import React, { useState, useCallback, useMemo, useRef } from 'react';
import type { WbsTask } from '@/types/wbs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Calendar,
  GitBranch,
  Play,
  Save,
  FileText,
  Image,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Edit3
} from 'lucide-react';
import { format, parseISO, addDays, isWeekend, differenceInDays, addBusinessDays } from 'date-fns';
import { toBryntumProjectData, fromBryntumProjectData } from './adapter';

interface ProGanttProps {
  projectName: string;
  initialData: WbsTask[];
  onChange?: (updated: WbsTask[]) => void;
  className?: string;
  projectId?: string;
}

interface FlatTask {
  task: WbsTask;
  level: number;
  expanded: boolean;
  index: number;
  hasChildren: boolean;
  isVisible: boolean;
  isCritical: boolean;
}

const COLORS = {
  task: '#0ea5e7',      // Teal
  summary: '#22c55e',   // Green  
  critical: '#ef4444',  // Red
  dependency: '#f59e0b', // Orange
  weekend: 'rgba(148,163,184,0.12)',
  grid: '#e2e8f0'
};

const ZOOM_LEVELS = {
  day: { days: 1, format: 'MMM d' },
  week: { days: 7, format: 'MMM d' },
  month: { days: 30, format: 'MMM yyyy' }
};

const ProGantt: React.FC<ProGanttProps> = ({
  projectName,
  initialData,
  onChange,
  className = '',
  projectId
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<WbsTask[]>(initialData);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [showCritical, setShowCritical] = useState(false);
  const [showWeekends, setShowWeekends] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<keyof typeof ZOOM_LEVELS>('week');
  const [isAutoScheduling, setIsAutoScheduling] = useState(false);
  const [baseline, setBaseline] = useState<WbsTask[] | null>(null);
  const [editingTask, setEditingTask] = useState<string | null>(null);

  // Calculate project timeline
  const timelineData = useMemo(() => {
    const allTasks = tasks.flatMap(function flatten(task: WbsTask): WbsTask[] {
      return [task, ...(task.children || []).flatMap(flatten)];
    });

    if (allTasks.length === 0) return { start: new Date(), end: new Date(), days: [] };

    const start = new Date(Math.min(...allTasks.map(t => parseISO(t.startDate).getTime())));
    const end = new Date(Math.max(...allTasks.map(t => parseISO(t.endDate).getTime())));
    
    const days = [];
    const zoom = ZOOM_LEVELS[zoomLevel];
    let current = new Date(start);
    
    while (current <= end) {
      days.push(new Date(current));
      current = addDays(current, zoom.days);
    }
    
    return { start, end, days };
  }, [tasks, zoomLevel]);

  // Flatten tasks for display
  const flatTasks = useMemo((): FlatTask[] => {
    const result: FlatTask[] = [];
    let index = 0;

    const flatten = (taskList: WbsTask[], level: number, parentExpanded = true): void => {
      taskList.forEach(task => {
        const expanded = expandedNodes.has(task.id);
        const hasChildren = Boolean(task.children?.length);
        const isVisible = parentExpanded;
        const isCritical = showCritical && Boolean(task.predecessors?.length); // Simplified critical path

        result.push({
          task,
          level,
          expanded,
          index: index++,
          hasChildren,
          isVisible,
          isCritical
        });

        if (hasChildren && expanded && isVisible) {
          flatten(task.children!, level + 1, true);
        }
      });
    };

    flatten(tasks, 0);
    return result.filter(f => f.isVisible);
  }, [tasks, expandedNodes, showCritical]);

  // Auto-scheduling algorithm
  const autoSchedule = useCallback(async () => {
    setIsAutoScheduling(true);
    
    try {
      const updatedTasks = [...tasks];
      
      // Simple forward scheduling algorithm
      const processTask = (task: WbsTask): void => {
        if (task.predecessors?.length) {
          // Find latest predecessor end date
          let latestEnd = parseISO(task.startDate);
          
          task.predecessors.forEach(pred => {
            const predTask = findTaskById(updatedTasks, pred.taskId);
            if (predTask) {
              const predEnd = parseISO(predTask.endDate);
              const adjustedDate = pred.lagDays 
                ? addBusinessDays(predEnd, pred.lagDays)
                : addDays(predEnd, 1);
              
              if (adjustedDate > latestEnd) {
                latestEnd = adjustedDate;
              }
            }
          });
          
          // Update task dates
          const duration = differenceInDays(parseISO(task.endDate), parseISO(task.startDate));
          task.startDate = format(latestEnd, 'yyyy-MM-dd');
          task.endDate = format(addDays(latestEnd, duration), 'yyyy-MM-dd');
        }
        
        // Process children
        task.children?.forEach(processTask);
      };
      
      updatedTasks.forEach(processTask);
      setTasks(updatedTasks);
      onChange?.(updatedTasks);
      
    } catch (error) {
      console.error('Auto-schedule failed:', error);
    } finally {
      setIsAutoScheduling(false);
    }
  }, [tasks, onChange]);

  const findTaskById = (taskList: WbsTask[], id: string): WbsTask | null => {
    for (const task of taskList) {
      if (task.id === id) return task;
      if (task.children) {
        const found = findTaskById(task.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  // Toggle expand/collapse
  const toggleExpanded = useCallback((taskId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  }, []);

  // Expand/Collapse all
  const expandAll = useCallback(() => {
    const allIds = new Set<string>();
    const collectIds = (taskList: WbsTask[]) => {
      taskList.forEach(task => {
        if (task.children?.length) {
          allIds.add(task.id);
          collectIds(task.children);
        }
      });
    };
    collectIds(tasks);
    setExpandedNodes(allIds);
  }, [tasks]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  // Save baseline
  const saveBaseline = useCallback(() => {
    setBaseline([...tasks]);
  }, [tasks]);

  // Export functions
  const exportToPDF = useCallback(async () => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF('landscape');
    
    pdf.setFontSize(16);
    pdf.text(projectName, 20, 20);
    pdf.setFontSize(12);
    pdf.text('Professional Gantt Schedule', 20, 30);
    
    // Add task list
    let yPos = 50;
    flatTasks.forEach(({ task, level }) => {
      const indent = '  '.repeat(level);
      pdf.text(`${indent}${task.name}`, 20, yPos);
      pdf.text(task.startDate, 200, yPos);
      pdf.text(task.endDate, 250, yPos);
      pdf.text(`${task.percent || 0}%`, 300, yPos);
      yPos += 10;
    });
    
    pdf.save(`${projectName}-schedule.pdf`);
  }, [projectName, flatTasks]);

  const exportToPNG = useCallback(async () => {
    if (!containerRef.current) return;
    
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(containerRef.current);
    
    const link = document.createElement('a');
    link.download = `${projectName}-schedule.png`;
    link.href = canvas.toDataURL();
    link.click();
  }, [projectName]);

  // Render task bar
  const renderTaskBar = useCallback((flatTask: FlatTask) => {
    const { task, isCritical } = flatTask;
    const startDate = parseISO(task.startDate);
    const endDate = parseISO(task.endDate);
    const duration = differenceInDays(endDate, startDate) + 1;
    
    const leftPercent = ((startDate.getTime() - timelineData.start.getTime()) / 
                        (timelineData.end.getTime() - timelineData.start.getTime())) * 100;
    const widthPercent = (duration / differenceInDays(timelineData.end, timelineData.start)) * 100;
    
    const isParent = Boolean(task.children?.length);
    const color = isCritical ? COLORS.critical : isParent ? COLORS.summary : COLORS.task;
    
    return (
      <div
        key={`bar-${task.id}`}
        className="absolute h-6 rounded cursor-pointer transition-all hover:brightness-110"
        style={{
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
          backgroundColor: color,
          top: '2px'
        }}
        onClick={() => setSelectedTask(selectedTask === task.id ? null : task.id)}
      >
        {/* Progress bar */}
        {task.percent && (
          <div
            className="h-full bg-black bg-opacity-30 rounded"
            style={{ width: `${task.percent}%` }}
          />
        )}
        
        {/* Baseline comparison */}
        {baseline && (
          <div className="absolute -bottom-1 h-1 bg-gray-400 rounded opacity-60" style={{ width: '100%' }} />
        )}
        
        {/* Task label */}
        <span className="absolute left-2 top-0 text-xs text-white font-medium truncate">
          {task.name}
        </span>
        
        {/* Percent complete */}
        {task.percent && (
          <span className="absolute right-2 top-0 text-xs text-white font-bold">
            {task.percent}%
          </span>
        )}
      </div>
    );
  }, [timelineData, selectedTask, baseline]);

  return (
    <div ref={containerRef} className={`flex flex-col bg-white border rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-900">{projectName}</h2>
          <Badge variant="outline" className="bg-blue-50 text-blue-700">
            Professional Gantt
          </Badge>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Calendar className="w-4 h-4" />
          <span>Tasks: {flatTasks.length}</span>
          {baseline && <Badge variant="secondary">Baseline Set</Badge>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-gray-50">
        {/* Expand/Collapse */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={collapseAll}>
            <ChevronRight className="w-4 h-4" />
            Collapse
          </Button>
          <Button variant="outline" size="sm" onClick={expandAll}>
            <ChevronDown className="w-4 h-4" />
            Expand
          </Button>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => console.log('Zoom out')}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => console.log('Zoom to fit')}>
            <Maximize2 className="w-4 h-4" />
            Fit
          </Button>
          <Button variant="outline" size="sm" onClick={() => console.log('Zoom in')}>
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* View Presets */}
        <div className="flex items-center gap-1">
          {Object.keys(ZOOM_LEVELS).map((level) => (
            <Button
              key={level}
              variant={zoomLevel === level ? 'default' : 'outline'}
              size="sm"
              onClick={() => setZoomLevel(level as keyof typeof ZOOM_LEVELS)}
              className="capitalize"
            >
              {level}
            </Button>
          ))}
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Feature Toggles */}
        <Button
          variant={showWeekends ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowWeekends(!showWeekends)}
        >
          <Calendar className="w-4 h-4" />
          Weekends
        </Button>
        
        <Button
          variant={showCritical ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowCritical(!showCritical)}
        >
          <GitBranch className="w-4 h-4" />
          Critical Path
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Actions */}
        <Button
          variant="outline"
          size="sm"
          onClick={autoSchedule}
          disabled={isAutoScheduling}
        >
          <Play className="w-4 h-4" />
          {isAutoScheduling ? 'Scheduling...' : 'Auto Schedule'}
        </Button>
        
        <Button variant="outline" size="sm" onClick={saveBaseline}>
          <Save className="w-4 h-4" />
          Baseline
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Export */}
        <Button variant="outline" size="sm" onClick={exportToPDF}>
          <FileText className="w-4 h-4" />
          PDF
        </Button>
        
        <Button variant="outline" size="sm" onClick={exportToPNG}>
          <Image className="w-4 h-4" />
          PNG
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-96">
        {/* Tree Grid */}
        <div className="w-96 border-r bg-gray-50">
          {/* Grid Header */}
          <div className="grid grid-cols-12 gap-2 p-2 border-b bg-gray-100 text-xs font-semibold text-gray-700">
            <div className="col-span-5">Task</div>
            <div className="col-span-2">Start</div>
            <div className="col-span-2">End</div>
            <div className="col-span-1">Days</div>
            <div className="col-span-1">%</div>
            <div className="col-span-1">Pred</div>
          </div>
          
          {/* Grid Rows */}
          <div className="overflow-y-auto max-h-96">
            {flatTasks.map((flatTask) => {
              const { task, level, hasChildren, expanded } = flatTask;
              const duration = differenceInDays(parseISO(task.endDate), parseISO(task.startDate)) + 1;
              
              return (
                <div
                  key={task.id}
                  className={`grid grid-cols-12 gap-2 p-2 border-b hover:bg-gray-100 text-xs ${
                    selectedTask === task.id ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => setSelectedTask(task.id)}
                >
                  <div className="col-span-5 flex items-center" style={{ paddingLeft: `${level * 20}px` }}>
                    {hasChildren && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpanded(task.id);
                        }}
                        className="mr-1 p-1 hover:bg-gray-200 rounded"
                      >
                        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>
                    )}
                    <span className={`truncate ${hasChildren ? 'font-semibold' : ''}`}>
                      {task.name}
                    </span>
                  </div>
                  <div className="col-span-2 text-gray-600">
                    {format(parseISO(task.startDate), 'MMM d')}
                  </div>
                  <div className="col-span-2 text-gray-600">
                    {format(parseISO(task.endDate), 'MMM d')}
                  </div>
                  <div className="col-span-1 text-gray-600">{duration}d</div>
                  <div className="col-span-1">
                    <span className={`px-1 rounded text-xs ${
                      (task.percent || 0) === 100 ? 'bg-green-100 text-green-800' : 
                      (task.percent || 0) > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {task.percent || 0}%
                    </span>
                  </div>
                  <div className="col-span-1 text-gray-500">
                    {task.predecessors?.length || 0}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline Chart */}
        <div className="flex-1 overflow-auto">
          {/* Timeline Header */}
          <div className="flex border-b bg-gray-100 sticky top-0 z-10">
            {timelineData.days.map((day, index) => (
              <div
                key={index}
                className={`flex-shrink-0 w-24 p-2 border-r text-xs text-center ${
                  isWeekend(day) && showWeekends ? 'bg-gray-200' : ''
                }`}
              >
                <div className="font-semibold">
                  {format(day, ZOOM_LEVELS[zoomLevel].format)}
                </div>
              </div>
            ))}
          </div>

          {/* Timeline Rows */}
          <div className="relative">
            {flatTasks.map((flatTask, index) => (
              <div
                key={flatTask.task.id}
                className={`relative h-8 border-b flex ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                }`}
              >
                {/* Weekend highlighting */}
                {timelineData.days.map((day, dayIndex) => (
                  <div
                    key={dayIndex}
                    className={`flex-shrink-0 w-24 border-r ${
                      isWeekend(day) && showWeekends ? 'bg-gray-200' : ''
                    }`}
                  />
                ))}
                
                {/* Task bar overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="relative w-full h-full pointer-events-auto">
                    {renderTaskBar(flatTask)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between p-3 border-t bg-gray-50 text-sm">
        <div className="flex items-center gap-4 text-gray-600">
          <span>Total: {flatTasks.length} tasks</span>
          <span>Duration: {differenceInDays(timelineData.end, timelineData.start)} days</span>
          {showCritical && <span className="text-red-600">Critical Path Active</span>}
          {isAutoScheduling && <span className="text-blue-600">Auto-scheduling...</span>}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.task }}></div>
            <span>Tasks</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.summary }}></div>
            <span>Summaries</span>
          </div>
          {showCritical && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.critical }}></div>
              <span>Critical</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProGantt;