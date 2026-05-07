// src/pages/GanttDayPilotDemo.tsx
import React from 'react';
import { GanttShell, sampleWbs, type WbsTask } from '@/modules/gantt';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function GanttDayPilotDemo() {
  const handleTaskChange = (updatedTasks: WbsTask[]) => {
    console.log('Tasks updated:', updatedTasks);
    // Here you could save to Firebase, API, etc.
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <img 
              src="/logo.png" 
              alt="Skyeline Homes" 
              className="h-8 w-auto"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <h1 className="text-3xl font-bold text-gray-900">
              BuildTrackerPro - DayPilot Gantt
            </h1>
          </div>
          
          <p className="text-gray-600 max-w-3xl mx-auto">
            Professional construction scheduling with DayPilot Lite, auto-scheduling engine, 
            critical path analysis, and advanced export capabilities. Built with React 18, Zustand, and TypeScript.
          </p>
          
          <div className="flex items-center justify-center gap-4">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              ✓ Auto-Scheduling
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              ✓ Critical Path
            </Badge>
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
              ✓ Baseline Tracking
            </Badge>
            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
              ✓ PDF/PNG Export
            </Badge>
          </div>
        </div>

        {/* Project Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Professional Gantt Schedule
              <div className="flex items-center gap-2">
                <Badge variant="secondary">DayPilot Lite</Badge>
                <Badge variant="outline">Open Source</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600 mb-4">
              <div>
                <span className="font-medium">Features:</span>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Hierarchical WBS structure</li>
                  <li>Four dependency types (FS/SS/FF/SF)</li>
                  <li>Working day calendars</li>
                  <li>Progress tracking</li>
                </ul>
              </div>
              <div>
                <span className="font-medium">Scheduling:</span>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Forward/backward scheduling</li>
                  <li>Critical path calculation</li>
                  <li>Slack analysis</li>
                  <li>Constraint handling</li>
                </ul>
              </div>
              <div>
                <span className="font-medium">Export:</span>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>High-quality PNG images</li>
                  <li>Professional PDF reports</li>
                  <li>Custom branding support</li>
                  <li>Print-ready layouts</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Interactive Gantt */}
        <Card>
          <CardHeader>
            <CardTitle>Christensen Home Construction Schedule</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <GanttShell 
              projectName="Christensen Home"
              initialTasks={sampleWbs}
              onChange={handleTaskChange}
              className="w-full"
            />
          </CardContent>
        </Card>

        {/* Usage Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>How to Use</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-2 text-gray-900">View Controls:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Switch between Day/Week/Month views</li>
                  <li>• Toggle weekend display</li>
                  <li>• Show/hide critical path highlighting</li>
                  <li>• Display baseline comparisons</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold mb-2 text-gray-900">Scheduling Features:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Auto Schedule: Recalculate dates from dependencies</li>
                  <li>• Capture Baseline: Save current schedule for comparison</li>
                  <li>• Export PNG/PDF: Generate professional reports</li>
                  <li>• Progress tracking with visual completion bars</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Technical Details */}
        <Card>
          <CardHeader>
            <CardTitle>Technical Implementation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600 space-y-2">
              <p>
                <strong>DayPilot Lite:</strong> Open-source timeline component with tree grid, 
                resource scheduling, and hierarchical task display.
              </p>
              <p>
                <strong>Scheduling Engine:</strong> Custom forward/backward pass algorithm respecting 
                working days, holidays, constraints, and all four dependency types.
              </p>
              <p>
                <strong>State Management:</strong> Zustand for efficient local state with 
                automatic persistence and change tracking.
              </p>
              <p>
                <strong>Export System:</strong> html-to-image for PNG generation and pdf-lib 
                for professional PDF reports with custom branding.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 pt-8">
          <p>
            Built with React 18, TypeScript, DayPilot Lite, Zustand, and Tailwind CSS.
            <br />
            Enterprise-grade features with 100% open-source components - no licenses required.
          </p>
        </div>
      </div>
    </div>
  );
}