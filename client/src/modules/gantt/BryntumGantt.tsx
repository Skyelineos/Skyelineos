import React, { useRef, useEffect, useState, useCallback } from 'react';
import { BryntumGantt as BryntumGanttComponent } from '@bryntum/gantt-react';
import { Gantt, ProjectModel } from '@bryntum/gantt';
import type { WbsTask } from '@/types/wbs';
import { toBryntumProjectData, fromBryntumProjectData } from './adapter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  ChevronRight
} from 'lucide-react';

interface BryntumGanttProps {
  projectName: string;
  initialData: WbsTask[];
  onChange?: (updated: WbsTask[]) => void;
  className?: string;
  projectId?: string;
}

const BryntumGantt: React.FC<BryntumGanttProps> = ({
  projectName,
  initialData,
  onChange,
  className = '',
  projectId
}) => {
  const ganttRef = useRef<any>(null);
  const [showCritical, setShowCritical] = useState(false);
  const [showWeekends, setShowWeekends] = useState(true);
  const [zoomLevel, setZoomLevel] = useState('week');
  const [isAutoScheduling, setIsAutoScheduling] = useState(false);

  // Initialize project data
  const projectData = toBryntumProjectData(initialData);

  const ganttConfig = {
    project: {
      calendar: 'general',
      calendars: [
        {
          id: 'general',
          name: 'General',
          intervals: [
            {
              recurrentStartDate: 'on Sat at 0:00',
              recurrentEndDate: 'on Mon at 0:00',
              isWorking: false
            }
          ],
          // Add holidays here later
          nonWorkingDays: {
            0: true, // Sunday
            6: true  // Saturday
          }
        }
      ],
      tasksData: projectData.tasks,
      dependenciesData: projectData.dependencies
    },
    
    columns: [
      { type: 'tree', text: 'Task', field: 'name', width: 300 },
      { type: 'startdate', text: 'Start Date', width: 120 },
      { type: 'enddate', text: 'End Date', width: 120 },
      { type: 'duration', text: 'Duration', width: 100 },
      { type: 'percentdone', text: '%', width: 80 },
      { type: 'predecessor', text: 'Predecessors', width: 120 }
    ],
    
    features: {
      criticalPaths: {
        disabled: !showCritical
      },
      baselines: true,
      dependencies: true,
      percentDone: true,
      taskEdit: {
        items: {
          generalTab: {
            items: {
              nameField: true,
              durationField: true,
              startDateField: true,
              endDateField: true,
              percentDoneField: true,
              effortField: false,
              constraintTypeField: true,
              constraintDateField: true,
              manuallyScheduledField: true
            }
          },
          predecessorsTab: true,
          successorsTab: true,
          notesTab: false,
          advancedTab: false
        }
      },
      taskDrag: {
        constrainDragToTimeline: true,
        showTooltip: true
      },
      taskResize: {
        showTooltip: true
      },
      export: {
        exportServer: false // Use client-side export
      }
    },
    
    viewPreset: zoomLevel === 'day' ? 'dayAndWeek' : 
                zoomLevel === 'month' ? 'monthAndYear' : 'weekAndDayLetter',
    
    weekStartDay: 1, // Monday
    
    // Custom styling
    taskRenderer: ({ taskRecord, renderData }: any) => {
      const isSummary = taskRecord.isParent;
      const isCritical = showCritical && taskRecord.isCritical;
      
      let color = '#0ea5e7'; // Default teal
      if (isSummary) color = '#22c55e'; // Green for summaries
      if (isCritical) color = '#ef4444'; // Red for critical
      
      renderData.style = `background-color: ${color}`;
      
      return '';
    },
    
    // Keyboard shortcuts
    keyMap: {
      'Delete': 'removeTask',
      'Enter': 'editTask',
      'Ctrl+Z': 'undo',
      'Cmd+Z': 'undo',
      'ArrowUp': 'navigateUp',
      'ArrowDown': 'navigateDown'
    }
  };

  // Auto-schedule function
  const handleAutoSchedule = useCallback(async () => {
    if (!ganttRef.current) return;
    
    setIsAutoScheduling(true);
    try {
      await ganttRef.current.project.propagate();
      // Notify parent of changes
      if (onChange) {
        const tasks = ganttRef.current.project.taskStore.records;
        const dependencies = ganttRef.current.project.dependencyStore.records;
        const updatedWbs = fromBryntumProjectData(tasks, dependencies);
        onChange(updatedWbs);
      }
    } catch (error) {
      console.error('Auto-schedule failed:', error);
    } finally {
      setIsAutoScheduling(false);
    }
  }, [onChange]);

  // Toggle critical path
  const handleToggleCritical = useCallback(() => {
    setShowCritical(prev => {
      const newValue = !prev;
      if (ganttRef.current) {
        ganttRef.current.features.criticalPaths.disabled = !newValue;
      }
      return newValue;
    });
  }, []);

  // Zoom functions
  const handleZoomToFit = useCallback(() => {
    if (ganttRef.current) {
      ganttRef.current.zoomToFit();
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    if (ganttRef.current) {
      ganttRef.current.zoomIn();
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (ganttRef.current) {
      ganttRef.current.zoomOut();
    }
  }, []);

  // Add baseline
  const handleAddBaseline = useCallback(() => {
    if (ganttRef.current) {
      ganttRef.current.project.addBaseline();
      ganttRef.current.refresh();
    }
  }, []);

  // Export functions
  const handleExportPDF = useCallback(() => {
    if (ganttRef.current) {
      ganttRef.current.export({
        type: 'pdf',
        fileName: `${projectName}-schedule.pdf`
      });
    }
  }, [projectName]);

  const handleExportPNG = useCallback(() => {
    if (ganttRef.current) {
      ganttRef.current.export({
        type: 'png',
        fileName: `${projectName}-schedule.png`
      });
    }
  }, [projectName]);

  // Collapse/Expand all
  const handleCollapseAll = useCallback(() => {
    if (ganttRef.current) {
      ganttRef.current.collapseAll();
    }
  }, []);

  const handleExpandAll = useCallback(() => {
    if (ganttRef.current) {
      ganttRef.current.expandAll();
    }
  }, []);

  // Toggle weekends
  const handleToggleWeekends = useCallback(() => {
    setShowWeekends(prev => !prev);
    // This would need custom implementation in Bryntum
  }, []);

  return (
    <div className={`flex flex-col bg-white ${className}`}>
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
          <span>Auto-scheduling enabled</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-gray-50">
        {/* View Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCollapseAll}
            className="flex items-center gap-1"
          >
            <ChevronRight className="w-4 h-4" />
            Collapse
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExpandAll}
            className="flex items-center gap-1"
          >
            <ChevronDown className="w-4 h-4" />
            Expand
          </Button>
        </div>

        <div className="w-px h-6 bg-gray-300" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomOut}
            className="flex items-center gap-1"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomToFit}
            className="flex items-center gap-1"
          >
            <Maximize2 className="w-4 h-4" />
            Zoom to Fit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomIn}
            className="flex items-center gap-1"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-gray-300" />

        {/* View Presets */}
        <div className="flex items-center gap-1">
          {['day', 'week', 'month'].map(preset => (
            <Button
              key={preset}
              variant={zoomLevel === preset ? 'default' : 'outline'}
              size="sm"
              onClick={() => setZoomLevel(preset)}
              className="capitalize"
            >
              {preset}
            </Button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-300" />

        {/* Feature Toggles */}
        <Button
          variant={showWeekends ? 'default' : 'outline'}
          size="sm"
          onClick={handleToggleWeekends}
          className="flex items-center gap-1"
        >
          <Calendar className="w-4 h-4" />
          Weekends
        </Button>
        
        <Button
          variant={showCritical ? 'default' : 'outline'}
          size="sm"
          onClick={handleToggleCritical}
          className="flex items-center gap-1"
        >
          <GitBranch className="w-4 h-4" />
          Critical Path
        </Button>

        <div className="w-px h-6 bg-gray-300" />

        {/* Schedule Controls */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleAutoSchedule}
          disabled={isAutoScheduling}
          className="flex items-center gap-1"
        >
          <Play className="w-4 h-4" />
          {isAutoScheduling ? 'Scheduling...' : 'Auto Schedule'}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddBaseline}
          className="flex items-center gap-1"
        >
          <Save className="w-4 h-4" />
          Add Baseline
        </Button>

        <div className="w-px h-6 bg-gray-300" />

        {/* Export Controls */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPDF}
          className="flex items-center gap-1"
        >
          <FileText className="w-4 h-4" />
          PDF
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPNG}
          className="flex items-center gap-1"
        >
          <Image className="w-4 h-4" />
          PNG
        </Button>
      </div>

      {/* Gantt Chart */}
      <div className="flex-1 min-h-96">
        <BryntumGanttComponent
          ref={ganttRef}
          {...ganttConfig}
          onTaskEditStart={(event: any) => {
            console.log('Task edit started:', event.taskRecord);
          }}
          onAfterTaskEdit={(event: any) => {
            console.log('Task edited:', event.taskRecord);
            // Notify parent of changes
            if (onChange) {
              const tasks = ganttRef.current.project.taskStore.records;
              const dependencies = ganttRef.current.project.dependencyStore.records;
              const updatedWbs = fromBryntumProjectData(tasks, dependencies);
              onChange(updatedWbs);
            }
          }}
          onDependencyChange={(event: any) => {
            console.log('Dependency changed:', event);
            // Notify parent of changes
            if (onChange) {
              const tasks = ganttRef.current.project.taskStore.records;
              const dependencies = ganttRef.current.project.dependencyStore.records;
              const updatedWbs = fromBryntumProjectData(tasks, dependencies);
              onChange(updatedWbs);
            }
          }}
        />
      </div>

      {/* Footer Stats */}
      <div className="flex items-center justify-between p-3 border-t bg-gray-50 text-sm text-gray-600">
        <div className="flex items-center gap-6">
          <span>Total Tasks: {projectData.tasks.length}</span>
          <span>Dependencies: {projectData.dependencies.length}</span>
          {showCritical && <span className="text-red-600">Critical Path Active</span>}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-teal-500 rounded"></div>
            <span>Tasks</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>Summaries</span>
          </div>
          {showCritical && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span>Critical</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-400 rounded"></div>
            <span>Dependencies</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BryntumGantt;