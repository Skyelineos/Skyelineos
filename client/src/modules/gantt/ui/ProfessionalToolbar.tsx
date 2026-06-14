// ProfessionalToolbar.tsx - Enhanced controls for WBS Gantt
import React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  GitBranch, 
  Play, 
  Save, 
  FileText, 
  Image,
  ZoomIn,
  ZoomOut,
  Expand,
  Shrink,
  Target,
  Clock
} from 'lucide-react';
import type { GanttRef } from './ProfessionalGantt';

interface ProfessionalToolbarProps {
  ganttRef: React.RefObject<GanttRef>;
  zoom: 'Day' | 'Week' | 'Month';
  showWeekends: boolean;
  showCritical: boolean;
  showBaseline: boolean;
  taskCount: number;
  onZoomChange: (zoom: 'Day' | 'Week' | 'Month') => void;
  onToggleWeekends: () => void;
  onToggleCritical: () => void;
  onToggleBaseline: () => void;
  onAutoSchedule: () => void;
  onCaptureBaseline: () => void;
  onExportPNG: () => void;
  onExportPDF: () => void;
}

export default function ProfessionalToolbar({
  ganttRef,
  zoom,
  showWeekends,
  showCritical,
  showBaseline,
  taskCount,
  onZoomChange,
  onToggleWeekends,
  onToggleCritical,
  onToggleBaseline,
  onAutoSchedule,
  onCaptureBaseline,
  onExportPNG,
  onExportPDF
}: ProfessionalToolbarProps) {

  const handleCollapseAll = () => {
    ganttRef.current?.collapseAll();
  };

  const handleExpandAll = () => {
    ganttRef.current?.expandAll();
  };

  const handleZoomToFit = () => {
    ganttRef.current?.zoomToFit();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-gradient-to-r from-slate-50 to-gray-50 border-b rounded-t-lg">
      {/* View Scale Controls */}
      <div className="flex items-center gap-1">
        <Button 
          variant={zoom === 'Day' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => onZoomChange('Day')}
        >
          Day
        </Button>
        <Button 
          variant={zoom === 'Week' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => onZoomChange('Week')}
        >
          Week
        </Button>
        <Button 
          variant={zoom === 'Month' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => onZoomChange('Month')}
        >
          Month
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Tree Controls */}
      <div className="flex items-center gap-1">
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleExpandAll}
          className="flex items-center gap-1"
        >
          <Expand className="w-3 h-3" />
          Expand All
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleCollapseAll}
          className="flex items-center gap-1"
        >
          <Shrink className="w-3 h-3" />
          Collapse All
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleZoomToFit}
          className="flex items-center gap-1"
        >
          <Target className="w-3 h-3" />
          Zoom to Fit
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Display Options */}
      <Button 
        variant={showWeekends ? 'default' : 'outline'} 
        size="sm"
        onClick={onToggleWeekends}
        className="flex items-center gap-1"
      >
        <Calendar className="w-3 h-3" />
        {showWeekends ? 'Hide Weekends' : 'Show Weekends'}
      </Button>
      
      <Button 
        variant={showCritical ? 'default' : 'outline'} 
        size="sm"
        onClick={onToggleCritical}
        className="flex items-center gap-1"
      >
        <GitBranch className="w-3 h-3" />
        Critical Path
      </Button>
      
      <Button 
        variant={showBaseline ? 'default' : 'outline'} 
        size="sm"
        onClick={onToggleBaseline}
        className="flex items-center gap-1"
      >
        <Clock className="w-3 h-3" />
        Baseline
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Schedule Actions */}
      <Button 
        variant="outline" 
        size="sm"
        onClick={onAutoSchedule}
        className="flex items-center gap-1"
      >
        <Play className="w-3 h-3" />
        Auto Schedule
      </Button>
      
      <Button 
        variant="outline" 
        size="sm"
        onClick={onCaptureBaseline}
        className="flex items-center gap-1"
      >
        <Save className="w-3 h-3" />
        Capture Baseline
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Export Options */}
      <Button 
        variant="outline" 
        size="sm"
        onClick={onExportPNG}
        className="flex items-center gap-1"
      >
        <Image className="w-3 h-3" />
        PNG
      </Button>
      
      <Button 
        variant="outline" 
        size="sm"
        onClick={onExportPDF}
        className="flex items-center gap-1"
      >
        <FileText className="w-3 h-3" />
        PDF
      </Button>

      {/* Status Indicators */}
      <div className="ml-auto flex items-center gap-2">
        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
          {taskCount} tasks
        </Badge>
        {showCritical && (
          <Badge variant="destructive" className="text-xs">
            Critical Path Active
          </Badge>
        )}
        {showBaseline && (
          <Badge variant="secondary" className="text-xs">
            Baseline Tracking
          </Badge>
        )}
      </div>
    </div>
  );
}