// src/modules/gantt/ui/Toolbar.tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useGantt } from '../state';
import { autoSchedule } from '../engine/autoSchedule';
import { captureBaseline } from '../engine/baseline';
import { 
  Calendar, 
  GitBranch, 
  Play, 
  Save, 
  FileText, 
  Image,
  Clock,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { PDFDocument, rgb } from 'pdf-lib';

export default function Toolbar() {
  const { 
    zoom, 
    setFlags, 
    showWeekends, 
    showCritical, 
    showBaseline, 
    showSlack,
    tasks,
    setTasks,
    projectName
  } = useGantt();

  const handleAutoSchedule = async () => {
    try {
      const result = autoSchedule(tasks, { respectLocked: true });
      setTasks(result.tasks);
      
      if (result.metrics.warnings.length > 0) {
        console.warn('Scheduling warnings:', result.metrics.warnings);
      }
    } catch (error) {
      console.error('Auto-schedule failed:', error);
    }
  };

  const handleCaptureBaseline = () => {
    const baselined = captureBaseline(tasks);
    setTasks(baselined);
    setFlags({ showBaseline: true });
  };

  const handleExportPNG = async () => {
    try {
      const ganttElement = document.querySelector('.daypilot-scheduler') as HTMLElement;
      if (!ganttElement) {
        console.warn('Gantt element not found for export');
        return;
      }

      const dataUrl = await toPng(ganttElement, {
        quality: 1.0,
        backgroundColor: '#ffffff',
        width: ganttElement.scrollWidth,
        height: ganttElement.scrollHeight
      });
      
      const link = document.createElement('a');
      link.download = `${projectName.replace(/\s+/g, '-')}-schedule.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('PNG export failed:', error);
    }
  };

  const handleExportPDF = async () => {
    try {
      const ganttElement = document.querySelector('.daypilot-scheduler') as HTMLElement;
      if (!ganttElement) {
        console.warn('Gantt element not found for export');
        return;
      }

      const dataUrl = await toPng(ganttElement, {
        quality: 1.0,
        backgroundColor: '#ffffff'
      });
      
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([842, 595]); // A4 landscape
      
      const pngImage = await pdfDoc.embedPng(dataUrl);
      const { width, height } = pngImage.scale(0.5);
      
      page.drawImage(pngImage, {
        x: 20,
        y: 595 - height - 20,
        width,
        height,
      });
      
      // Add title
      page.drawText(projectName, {
        x: 20,
        y: 570,
        size: 16,
        color: rgb(0, 0, 0),
      });
      
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.download = `${projectName.replace(/\s+/g, '-')}-schedule.pdf`;
      link.href = url;
      link.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF export failed:', error);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 border-b rounded-t-lg">
      {/* View Scale */}
      <div className="flex items-center gap-1">
        <Button 
          variant={zoom === 'Day' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setFlags({ zoom: 'Day' })}
        >
          Day
        </Button>
        <Button 
          variant={zoom === 'Week' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setFlags({ zoom: 'Week' })}
        >
          Week
        </Button>
        <Button 
          variant={zoom === 'Month' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setFlags({ zoom: 'Month' })}
        >
          Month
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* View Options */}
      <Button 
        variant={showWeekends ? 'default' : 'outline'} 
        size="sm"
        onClick={() => setFlags({ showWeekends: !showWeekends })}
        className="flex items-center gap-1"
      >
        <Calendar className="w-4 h-4" />
        {showWeekends ? 'Hide Weekends' : 'Show Weekends'}
      </Button>
      
      <Button 
        variant={showCritical ? 'default' : 'outline'} 
        size="sm"
        onClick={() => setFlags({ showCritical: !showCritical })}
        className="flex items-center gap-1"
      >
        <GitBranch className="w-4 h-4" />
        Critical Path
      </Button>
      
      <Button 
        variant={showSlack ? 'default' : 'outline'} 
        size="sm"
        onClick={() => setFlags({ showSlack: !showSlack })}
        className="flex items-center gap-1"
      >
        <Clock className="w-4 h-4" />
        Slack
      </Button>
      
      <Button 
        variant={showBaseline ? 'default' : 'outline'} 
        size="sm"
        onClick={() => setFlags({ showBaseline: !showBaseline })}
        className="flex items-center gap-1"
      >
        <Save className="w-4 h-4" />
        Baseline
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Actions */}
      <Button 
        variant="outline" 
        size="sm"
        onClick={handleAutoSchedule}
        className="flex items-center gap-1"
      >
        <Play className="w-4 h-4" />
        Auto Schedule
      </Button>
      
      <Button 
        variant="outline" 
        size="sm"
        onClick={handleCaptureBaseline}
        className="flex items-center gap-1"
      >
        <Save className="w-4 h-4" />
        Capture Baseline
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Export */}
      <Button 
        variant="outline" 
        size="sm"
        onClick={handleExportPNG}
        className="flex items-center gap-1"
      >
        <Image className="w-4 h-4" />
        PNG
      </Button>
      
      <Button 
        variant="outline" 
        size="sm"
        onClick={handleExportPDF}
        className="flex items-center gap-1"
      >
        <FileText className="w-4 h-4" />
        PDF
      </Button>

      {/* Status Indicators */}
      <div className="ml-auto flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {tasks.length} tasks
        </Badge>
        {showCritical && (
          <Badge variant="destructive" className="text-xs">
            Critical Path
          </Badge>
        )}
        {showBaseline && (
          <Badge variant="secondary" className="text-xs">
            Baseline
          </Badge>
        )}
      </div>
    </div>
  );
}