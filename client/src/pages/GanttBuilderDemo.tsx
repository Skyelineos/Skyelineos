import React from 'react';
import { GanttBuilder } from '@/components/gantt/GanttBuilder';
import WbsGantt from '@/components/gantt/WbsGantt';
import { sampleWbs } from '@/components/gantt/sampleWbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { sampleProject } from '@/components/gantt/sampleData';


export default function GanttBuilderDemo() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
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
              Skyeline Homes - Gantt Schedule Builder
            </h1>
          </div>
          
          <p className="text-gray-600 max-w-2xl mx-auto">
            Professional construction project scheduling with trade management, dependencies, 
            and export capabilities. Built with React 18, Vite, Tailwind, and Plotly.
          </p>
          
          <div className="flex items-center justify-center gap-4">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              ✓ Real-time Updates
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              ✓ Dependency Tracking
            </Badge>
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
              ✓ Export Ready
            </Badge>
          </div>
        </div>

        {/* Project Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Demo Project: {sampleProject.name}
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {sampleProject.status}
                </Badge>
                <Badge variant="outline">
                  ${sampleProject.totalCost.toLocaleString()}
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-600">Start Date:</span>
                <p className="text-gray-900">{new Date(sampleProject.startDate).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600">End Date:</span>
                <p className="text-gray-900">{new Date(sampleProject.endDate).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Duration:</span>
                <p className="text-gray-900">
                  {Math.ceil((new Date(sampleProject.endDate).getTime() - new Date(sampleProject.startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Enhanced WBS Gantt with Tree Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4 text-center">
            🏗️ Enhanced WBS Gantt with Tree Grid
          </h2>
          <p className="text-gray-600 mb-6 text-center max-w-3xl mx-auto">
            Complete Work Breakdown Structure with hierarchical task management, 
            expand/collapse functionality, and synchronized grid-chart layout.
          </p>
          <WbsGantt
            projectName="Christensen Home Construction"
            tasks={sampleWbs}
            className="bg-white rounded-lg border shadow-sm"
          />
        </div>
        
        {/* Traditional Gantt Chart */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4 text-center">
            📊 Traditional Gantt Chart
          </h2>
          <p className="text-gray-600 mb-6 text-center max-w-3xl mx-auto">
            Professional construction Gantt chart with trade-based scheduling 
            and traditional project management features.
          </p>
          <GanttBuilder
            projectName={sampleProject.name}
            useFirestore={false}
            className="w-full"
          />
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl mb-2">📊</div>
              <h3 className="font-semibold mb-1">Interactive Charts</h3>
              <p className="text-sm text-gray-600">
                Click bars to edit trades, hover for details
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl mb-2">🔗</div>
              <h3 className="font-semibold mb-1">Dependencies</h3>
              <p className="text-sm text-gray-600">
                Visual dependency tracking between trades
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl mb-2">📈</div>
              <h3 className="font-semibold mb-1">Progress Tracking</h3>
              <p className="text-sm text-gray-600">
                Real-time status updates and milestones
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl mb-2">💾</div>
              <h3 className="font-semibold mb-1">Export Options</h3>
              <p className="text-sm text-gray-600">
                PNG, PDF, and JSON export capabilities
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>How to Use</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-2">Editing Trades:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Click any bar on the chart to edit trade details</li>
                  <li>• Use "Add Trade" button to create new trades</li>
                  <li>• Set dependencies to link related trades</li>
                  <li>• Update status to track progress</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold mb-2">Features:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Filter by phase (Rough/Finish) or status</li>
                  <li>• Export charts as PNG or PDF</li>
                  <li>• Export/Import JSON data</li>
                  <li>• Real-time milestone calculation</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 pt-8">
          <p>
            Built with React 18, Vite, Tailwind CSS, and Plotly.js for Skyeline Homes construction management.
            <br />
            Data stored in Firebase Firestore with real-time synchronization capabilities.
          </p>
        </div>
      </div>
    </div>
  );
}