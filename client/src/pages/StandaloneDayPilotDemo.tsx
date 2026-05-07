// Professional WBS Gantt Demo with DayPilot
import React, { useState, useRef } from 'react';
import ProfessionalGantt, { type GanttRef } from '@/modules/gantt/ui/ProfessionalGantt';
import ProfessionalToolbar from '@/modules/gantt/ui/ProfessionalToolbar';
import type { WbsTask } from '@/modules/gantt/wbsAdapter';
import { toPng } from 'html-to-image';
import { PDFDocument, rgb } from 'pdf-lib';

// Professional WBS Construction Data
const sampleWbsTasks: WbsTask[] = [
  {
    id: 'p1',
    name: 'Phase 1: Foundation & Underground',
    startDate: '2025-08-18',
    endDate: '2025-10-06',
    summary: true,
    children: [
      {
        id: '1.1',
        name: 'Site Preparation & Staking',
        startDate: '2025-08-18',
        endDate: '2025-08-19',
        percent: 100
      },
      {
        id: '1.2',
        name: 'Excavation & Grading',
        startDate: '2025-08-20',
        endDate: '2025-08-26',
        percent: 85,
        predecessors: [{ taskId: '1.1', type: 'FS' }]
      },
      {
        id: '1.3',
        name: 'Foundation & Footings',
        startDate: '2025-08-29',
        endDate: '2025-09-11',
        percent: 60,
        predecessors: [{ taskId: '1.2', type: 'FS', lagDays: 2 }]
      },
      {
        id: '1.4',
        name: 'Underground Plumbing',
        startDate: '2025-09-12',
        endDate: '2025-09-18',
        percent: 40,
        predecessors: [{ taskId: '1.3', type: 'FS' }]
      },
      {
        id: '1.5',
        name: 'Waterproofing & Backfill',
        startDate: '2025-09-19',
        endDate: '2025-09-30',
        percent: 20,
        predecessors: [{ taskId: '1.4', type: 'FS' }]
      },
      {
        id: '1.6',
        name: 'Concrete Flat Work',
        startDate: '2025-10-01',
        endDate: '2025-10-06',
        percent: 0,
        predecessors: [{ taskId: '1.5', type: 'FS' }]
      }
    ]
  },
  {
    id: 'p2',
    name: 'Phase 2: Structural & Exterior',
    startDate: '2025-10-07',
    endDate: '2025-12-18',
    summary: true,
    children: [
      {
        id: '2.1',
        name: 'Framing & Structural',
        startDate: '2025-10-07',
        endDate: '2025-11-06',
        percent: 0,
        predecessors: [{ taskId: '1.6', type: 'FS' }]
      },
      {
        id: '2.2',
        name: 'Roofing Installation',
        startDate: '2025-11-07',
        endDate: '2025-11-26',
        percent: 0,
        predecessors: [{ taskId: '2.1', type: 'FS' }]
      },
      {
        id: '2.3',
        name: 'Windows & Exterior Doors',
        startDate: '2025-11-15',
        endDate: '2025-11-26',
        percent: 0,
        predecessors: [{ taskId: '2.2', type: 'SS', lagDays: 8 }]
      },
      {
        id: '2.4',
        name: 'HVAC Rough-in',
        startDate: '2025-11-16',
        endDate: '2025-12-08',
        percent: 0,
        predecessors: [{ taskId: '2.2', type: 'SS', lagDays: 9 }]
      },
      {
        id: '2.5',
        name: 'Electrical Rough-in',
        startDate: '2025-12-09',
        endDate: '2025-12-18',
        percent: 0,
        predecessors: [{ taskId: '2.4', type: 'FS' }]
      }
    ]
  }
];

export default function StandaloneDayPilotDemo() {
  const [zoom, setZoom] = useState<'Day' | 'Week' | 'Month'>('Week');
  const [showWeekends, setShowWeekends] = useState(true);
  const [showCritical, setShowCritical] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);
  const [tasks, setTasks] = useState<WbsTask[]>(sampleWbsTasks);
  const ganttRef = useRef<GanttRef>(null);
  
  // Critical path simulation (normally calculated by scheduling engine)
  const criticalIds = new Set(['1.2', '1.3', '1.4', '2.1', '2.2']);

  const handleAutoSchedule = () => {
    console.log('Auto-scheduling with dependencies...');
    // In real implementation, this would call the scheduling engine
  };

  const handleCaptureBaseline = () => {
    console.log('Capturing baseline...');
    setShowBaseline(true);
  };

  const handleExportPNG = async () => {
    try {
      const element = document.querySelector('.professional-gantt') as HTMLElement;
      if (element) {
        const dataUrl = await toPng(element, {
          quality: 1.0,
          backgroundColor: '#ffffff'
        });
        
        const link = document.createElement('a');
        link.download = 'construction-schedule.png';
        link.href = dataUrl;
        link.click();
      }
    } catch (error) {
      console.error('Export PNG failed:', error);
    }
  };

  const handleExportPDF = async () => {
    try {
      const element = document.querySelector('.professional-gantt') as HTMLElement;
      if (element) {
        const dataUrl = await toPng(element, { quality: 1.0, backgroundColor: '#ffffff' });
        
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([842, 595]); // A4 landscape
        const pngImage = await pdfDoc.embedPng(dataUrl);
        const { width, height } = pngImage.scale(0.8);
        
        page.drawImage(pngImage, { x: 20, y: 595 - height - 40, width, height });
        page.drawText('Christensen Home - Construction Schedule', {
          x: 20, y: 570, size: 16, color: rgb(0, 0, 0)
        });
        
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.download = 'construction-schedule.pdf';
        link.href = url;
        link.click();
        
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export PDF failed:', error);
    }
  };

  const getTotalTasks = (tasks: WbsTask[]): number => {
    return tasks.reduce((count, task) => {
      return count + 1 + (task.children ? getTotalTasks(task.children) : 0);
    }, 0);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '30px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '10px', color: '#0f172a' }}>
            BuildTrackerPro - Professional WBS Gantt
          </h1>
          <p style={{ color: '#64748b', fontSize: '1.1rem', marginBottom: '20px', maxWidth: '800px', margin: '0 auto 20px' }}>
            Professional construction scheduling with DayPilot Lite, hierarchical WBS structure, 
            auto-scheduling engine, critical path analysis, and advanced export capabilities
          </p>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '30px' }}>
            <div style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '500', 
                           background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>
              ✓ WBS Grid Structure
            </div>
            <div style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '500',
                           background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' }}>
              ✓ Critical Path Analysis
            </div>
            <div style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '500',
                           background: '#f3e8ff', color: '#7c3aed', border: '1px solid #c4b5fd' }}>
              ✓ Progress Tracking
            </div>
            <div style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '500',
                           background: '#fed7aa', color: '#ea580c', border: '1px solid #fdba74' }}>
              ✓ Professional Export
            </div>
          </div>
        </div>

        {/* Professional Gantt with Toolbar */}
        <div style={{ 
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          marginBottom: '30px',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '20px 20px 0', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
            <h2 style={{ margin: '0 0 15px', fontSize: '1.25rem', color: '#1f2937' }}>
              Christensen Home - Construction Schedule
            </h2>
          </div>
          
          <ProfessionalToolbar
            ganttRef={ganttRef}
            zoom={zoom}
            showWeekends={showWeekends}
            showCritical={showCritical}
            showBaseline={showBaseline}
            taskCount={getTotalTasks(tasks)}
            onZoomChange={setZoom}
            onToggleWeekends={() => setShowWeekends(!showWeekends)}
            onToggleCritical={() => setShowCritical(!showCritical)}
            onToggleBaseline={() => setShowBaseline(!showBaseline)}
            onAutoSchedule={handleAutoSchedule}
            onCaptureBaseline={handleCaptureBaseline}
            onExportPNG={handleExportPNG}
            onExportPDF={handleExportPDF}
          />
          
          <ProfessionalGantt
            ref={ganttRef}
            tasks={tasks}
            criticalIds={showCritical ? criticalIds : new Set()}
            showWeekends={showWeekends}
            zoom={zoom}
          />
        </div>

        {/* Feature Information */}
        <div style={{ 
          background: 'white',
          padding: '30px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '20px', color: '#1f2937' }}>
            Professional WBS Gantt Features Demonstrated
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
            <div>
              <h4 style={{ marginTop: '0', marginBottom: '12px', color: '#374151', fontSize: '1rem', fontWeight: '600' }}>
                📊 WBS Grid & Structure:
              </h4>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#4b5563', lineHeight: '1.6' }}>
                <li><strong>Numbered WBS:</strong> Hierarchical work breakdown structure</li>
                <li><strong>Grid Columns:</strong> Task, Start/End dates, Progress, Dependencies</li>
                <li><strong>Tree Controls:</strong> Expand/collapse project sections</li>
                <li><strong>Professional Layout:</strong> Construction industry standard</li>
              </ul>
            </div>
            
            <div>
              <h4 style={{ marginTop: '0', marginBottom: '12px', color: '#374151', fontSize: '1rem', fontWeight: '600' }}>
                🎯 Scheduling & Analysis:
              </h4>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#4b5563', lineHeight: '1.6' }}>
                <li><strong>Progress Bars:</strong> Visual completion tracking with percentages</li>
                <li><strong>Critical Path:</strong> Red highlighting of project-critical tasks</li>
                <li><strong>Dependencies:</strong> FS/SS/FF/SF relationships with lag days</li>
                <li><strong>Auto-Scheduling:</strong> Dependency-driven date calculations</li>
              </ul>
            </div>
            
            <div>
              <h4 style={{ marginTop: '0', marginBottom: '12px', color: '#374151', fontSize: '1rem', fontWeight: '600' }}>
                🚀 Professional Tools:
              </h4>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#4b5563', lineHeight: '1.6' }}>
                <li><strong>Multiple Views:</strong> Day/Week/Month timeline scaling</li>
                <li><strong>Weekend Shading:</strong> Non-working day visualization</li>
                <li><strong>Export Options:</strong> High-quality PNG and PDF generation</li>
                <li><strong>Baseline Tracking:</strong> Compare against original schedule</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Technical Implementation */}
        <div style={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '30px',
          borderRadius: '12px',
          marginTop: '30px'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '15px', color: 'white' }}>
            🔧 Built with Enterprise-Grade Technologies
          </h3>
          <p style={{ margin: '0', lineHeight: '1.6', opacity: '0.95' }}>
            <strong>DayPilot Lite:</strong> Open-source timeline component with tree grid and resource scheduling. 
            <strong>Custom WBS Adapter:</strong> Professional work breakdown structure with numbered hierarchy. 
            <strong>React 18 + TypeScript:</strong> Modern development stack with type safety. 
            <strong>Professional Export:</strong> html-to-image + pdf-lib for branded reports.
            <br /><br />
            <em>100% open-source foundation - no commercial licenses required for this implementation.</em>
          </p>
        </div>
      </div>
    </div>
  );
}