// Skyelineos Gantt - Main Dual-Engine Component
import React, { useState } from 'react';
import { useGantt } from '../state';
import { DhtmlxBuilder } from './DhtmlxBuilder';
import { FrappeViewer } from './FrappeViewer';
import { AddTaskModal } from './AddTaskModal';
import { DependencyEditorModal } from './DependencyEditorModal';
import { DraggableResizer, useResizableLayout } from './DraggableResizer';
import { SaveTemplateModal, LoadTemplateModal } from './TemplateModal';
import { autoSchedule } from '../engine/autoSchedule';
import { saveSchedule } from '../useSchedulePersistence';
import { useToast } from '@/hooks/use-toast';
import type { WbsTask, Link } from '../types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Calendar,
  Eye,
  Settings,
  Play,
  Users,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  Plus,
  Save,
  FolderOpen,
  BookTemplate
} from 'lucide-react';

export const BuildTrackerPro: React.FC = () => {
  const {
    viewMode,
    setViewMode,
    projectName,
    projectId,
    tasks,
    links,
    setTasks,
    setLinks,
    setMetrics,
    metrics,
    zoom,
    setZoom,
    showCritical,
    toggleCritical,
    showBaseline,
    toggleBaseline,
    showWeekends,
    toggleWeekends,
    holidays
  } = useGantt();

  const [showMetrics, setShowMetrics] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showDependencyEditor, setShowDependencyEditor] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showLoadTemplate, setShowLoadTemplate] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [editingLink, setEditingLink] = useState<Link | null>(null);
  const [editingSourceTask, setEditingSourceTask] = useState<WbsTask | null>(null);
  const [editingTargetTask, setEditingTargetTask] = useState<WbsTask | null>(null);
  const { toast } = useToast();
  
  // Resizable layout management
  const { tableWidth, handleResize } = useResizableLayout(400, 'skyelineos-gantt-table-width');

  const criticalTaskCount = metrics ? metrics.criticalIds.size : 0;
  const totalTaskCount = tasks.length;
  const completedTasks = tasks.filter(t => (t.progress ?? 0) === 100).length;

  // Extract links from WBS tasks with predecessors
  const extractLinksFromTasks = (tasks: WbsTask[]): Link[] => {
    const allLinks: Link[] = [];
    
    const extractFromNode = (node: WbsTask) => {
      if (node.predecessors) {
        node.predecessors.forEach(pred => {
          allLinks.push({
            id: `${pred.sourceId}-${pred.targetId}`,
            sourceId: pred.sourceId,
            targetId: pred.targetId,
            type: pred.type,
            lagDays: pred.lagDays
          });
        });
      }
      if (node.children) {
        node.children.forEach(child => extractFromNode(child));
      }
    };
    
    tasks.forEach(task => extractFromNode(task));
    return allLinks;
  };

  // Auto Schedule Handler
  const handleAutoSchedule = async () => {
    if (tasks.length === 0) {
      toast({
        title: "No Tasks",
        description: "Add some tasks before running auto-schedule.",
        variant: "destructive"
      });
      return;
    }

    setIsScheduling(true);
    try {
      const extractedLinks = extractLinksFromTasks(tasks);
      const result = autoSchedule(tasks, extractedLinks, {
        respectLocked: true,
        holidays: holidays,
        projectStart: undefined // Use earliest task start
      });

      // Update state with scheduled tasks and metrics
      setTasks(result.tasks);
      setMetrics(result.metrics);

      // Show success message
      toast({
        title: "Auto Schedule Complete",
        description: `Scheduled ${tasks.length} tasks. ${result.metrics.warnings.length > 0 ? 'Check warnings.' : 'No issues found.'}`
      });

      // Show warnings if any
      if (result.metrics.warnings.length > 0) {
        setTimeout(() => {
          toast({
            title: "Schedule Warnings",
            description: result.metrics.warnings.join('; '),
            variant: "destructive"
          });
        }, 1000);
      }

    } catch (error) {
      toast({
        title: "Schedule Error",
        description: `Failed to auto-schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setIsScheduling(false);
    }
  };

  // Save schedule to Firestore
  const handleSave = async () => {
    if (!projectId) {
      toast({ title: 'Cannot save', description: 'No project linked to this schedule.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      await saveSchedule(projectId, tasks, links);
      toast({ title: 'Schedule saved', description: 'Timeline saved to this project.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Apply a loaded template — reset dates relative to today
  const handleApplyTemplate = (template: { tasks: WbsTask[]; links: Link[] }) => {
    setTasks(template.tasks);
    setLinks(template.links);
    toast({ title: 'Template applied', description: 'Tasks loaded. Run Auto Schedule to set dates.' });
  };

  // Handle dependency double-click
  const handleLinkDoubleClick = (link: Link, sourceTask: WbsTask, targetTask: WbsTask) => {
    setEditingLink(link);
    setEditingSourceTask(sourceTask);
    setEditingTargetTask(targetTask);
    setShowDependencyEditor(true);
  };

  return (
    <div className="skyelineos-gantt">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">{projectName}</h1>
            <Badge variant={viewMode === 'builder' ? 'default' : 'secondary'}>
              {viewMode === 'builder' ? 'Builder Mode' : 'Client View'}
            </Badge>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Mode Toggle */}
            <Button
              variant={viewMode === 'builder' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('builder')}
            >
              <Settings className="h-4 w-4 mr-1" />
              Builder
            </Button>
            <Button
              variant={viewMode === 'viewer' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('viewer')}
            >
              <Eye className="h-4 w-4 mr-1" />
              Client View
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* Quick Stats */}
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center">
                <CheckCircle2 className="h-4 w-4 text-green-500 mr-1" />
                {completedTasks}/{totalTaskCount} Complete
              </div>
              {criticalTaskCount > 0 && (
                <div className="flex items-center">
                  <AlertCircle className="h-4 w-4 text-red-500 mr-1" />
                  {criticalTaskCount} Critical
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center space-x-2">
            {/* Zoom Controls */}
            <div className="flex items-center space-x-1">
              <Button 
                variant={zoom === 'Day' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setZoom('Day')}
              >
                Day
              </Button>
              <Button 
                variant={zoom === 'Week' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setZoom('Week')}
              >
                Week
              </Button>
              <Button 
                variant={zoom === 'Month' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setZoom('Month')}
              >
                Month
              </Button>
            </div>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* Action Buttons */}
            <Button
              variant="default"
              size="sm"
              onClick={handleAutoSchedule}
              disabled={isScheduling}
            >
              <Zap className="h-4 w-4 mr-1" />
              {isScheduling ? 'Scheduling...' : 'Auto Schedule'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isScheduling}
              onClick={() => setShowAddTaskModal(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Task
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* Display Options */}
            <Button
              variant={showCritical ? 'default' : 'outline'}
              size="sm"
              onClick={toggleCritical}
            >
              <AlertCircle className="h-4 w-4 mr-1" />
              Critical Path
            </Button>
            <Button
              variant={showBaseline ? 'default' : 'outline'}
              size="sm"
              onClick={toggleBaseline}
            >
              <Clock className="h-4 w-4 mr-1" />
              Baseline
            </Button>
            <Button
              variant={showWeekends ? 'default' : 'outline'}
              size="sm"
              onClick={toggleWeekends}
            >
              <Calendar className="h-4 w-4 mr-1" />
              Weekends
            </Button>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Template Buttons */}
            <Button variant="outline" size="sm" onClick={() => setShowLoadTemplate(true)}>
              <FolderOpen className="h-4 w-4 mr-1" />
              Load Template
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSaveTemplate(true)} disabled={tasks.length === 0}>
              <BookTemplate className="h-4 w-4 mr-1" />
              Save as Template
            </Button>

            <Separator orientation="vertical" className="h-6" />

            {/* Save Schedule */}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || tasks.length === 0}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
            >
              <Save className="h-4 w-4 mr-1" />
              {isSaving ? 'Saving...' : 'Save Schedule'}
            </Button>

            <Separator orientation="vertical" className="h-6" />

            {/* Metrics Toggle */}
            <Button
              variant={showMetrics ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowMetrics(!showMetrics)}
            >
              <Play className="h-4 w-4 mr-1" />
              Metrics
            </Button>
          </div>
        </div>
      </div>

      {/* Metrics Panel */}
      {showMetrics && metrics && (
        <div className="border-b bg-gray-50 px-6 py-3">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <div className="font-medium text-gray-900">Critical Tasks</div>
              <div className="text-red-600">{criticalTaskCount}</div>
            </div>
            <div>
              <div className="font-medium text-gray-900">Total Float</div>
              <div className="text-blue-600">
                {Object.values(metrics.slackDays).reduce((a, b) => a + b, 0)} days
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-900">Warnings</div>
              <div className="text-amber-600">{metrics.warnings.length}</div>
            </div>
            <div>
              <div className="font-medium text-gray-900">Completion</div>
              <div className="text-green-600">
                {Math.round((completedTasks / totalTaskCount) * 100)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Gantt Area with Resizable Layout */}
      <div className="flex-1 bg-white">
        {/* Debug: Current view mode: {viewMode} */}
        {viewMode === 'builder' ? (
          <div className="h-full flex flex-col">
            <div className="p-4 bg-blue-50 text-blue-800 text-sm">
              🔧 DHTMLX Builder Mode - Professional Gantt Chart with Resizable Table
            </div>
            <div className="flex-1 flex">
              <DhtmlxBuilder 
                onLinkDoubleClick={handleLinkDoubleClick}
                tableWidth={tableWidth}
                onTableWidthChange={handleResize}
              />
              <DraggableResizer
                defaultWidth={tableWidth}
                minWidth={250}
                maxWidth={600}
                onResize={handleResize}
                storageKey="skyelineos-gantt-table-width"
                className="z-10"
              />
            </div>
          </div>
        ) : (
          <div className="h-full">
            <div className="p-4 bg-green-50 text-green-800 text-sm mb-2">
              👁️ Frappe Client View - Clean Presentation Mode
            </div>
            <FrappeViewer />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="border-t bg-gray-50 px-6 py-2 text-sm text-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span>Engine: {viewMode === 'builder' ? 'DHTMLX Gantt' : 'Frappe Gantt'}</span>
            <span>Tasks: {totalTaskCount}</span>
            <span>View: {zoom}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Professional Construction Management</span>
          </div>
        </div>
      </div>
      
      {/* Add Task Modal */}
      <AddTaskModal
        open={showAddTaskModal}
        onClose={() => setShowAddTaskModal(false)}
        selectedTaskIds={selectedTaskIds}
      />
      
      {/* Dependency Editor Modal */}
      <DependencyEditorModal
        open={showDependencyEditor}
        onClose={() => {
          setShowDependencyEditor(false);
          setEditingLink(null);
          setEditingSourceTask(null);
          setEditingTargetTask(null);
        }}
        link={editingLink}
        sourceTask={editingSourceTask}
        targetTask={editingTargetTask}
      />

      {/* Template Modals */}
      <SaveTemplateModal
        open={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        tasks={tasks}
        links={links}
        onSaved={(name) => toast({ title: 'Template saved', description: `"${name}" is ready to use on future projects.` })}
      />
      <LoadTemplateModal
        open={showLoadTemplate}
        onClose={() => setShowLoadTemplate(false)}
        onLoad={handleApplyTemplate}
      />
    </div>
  );
};