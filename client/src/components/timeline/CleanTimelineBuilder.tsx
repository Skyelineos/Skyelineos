import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar, ArrowRight, Link2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { parseISO, format, differenceInDays, addDays } from 'date-fns';
import { GanttChart } from './GanttChart';
import { DependencyArrows } from './DependencyArrows';
import { DependencyEditModal } from './DependencyEditModal';

import { 
  transformDatabaseTaskToTimeline, 
  transformTimelineTaskToDatabase,
  type TimelineTask,
  type DatabaseTask
} from '@/utils/taskTransformations';

// Dependency arrow interface
interface DependencyArrow {
  fromTaskId: number;
  toTaskId: number;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag: number;
}

interface CleanTimelineBuilderProps {
  projectId: number;
  onTaskEdit?: (task: DatabaseTask) => void;
  onTaskCreate?: (taskData: any) => void;
  onTaskDelete?: (taskId: number) => void;
  onTaskUpdate?: (task: DatabaseTask) => void;
  readonly?: boolean;
}

export function CleanTimelineBuilder({ 
  projectId, 
  onTaskEdit, 
  onTaskCreate, 
  onTaskDelete, 
  onTaskUpdate,
  readonly = false 
}: CleanTimelineBuilderProps) {
  // State
  const [showDependencies, setShowDependencies] = useState(true);
  const [editingDependency, setEditingDependency] = useState<DependencyArrow | null>(null);
  const [showDependencyEditModal, setShowDependencyEditModal] = useState(false);

  // Fetch tasks
  const { data: dbTasks = [], isLoading: tasksLoading } = useQuery<DatabaseTask[]>({
    queryKey: [`/api/projects/${projectId}/tasks`],
  });

  // Transform database tasks to timeline tasks for GanttChart
  const timelineTasks = useMemo(() => {
    return dbTasks.map(transformDatabaseTaskToTimeline);
  }, [dbTasks]);

  // Parse dependencies from tasks
  const dependencies = useMemo(() => {
    const deps: DependencyArrow[] = [];
    dbTasks.forEach(task => {
      if (task.dependencies && typeof task.dependencies === 'string') {
        const dependencyIds = task.dependencies.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        dependencyIds.forEach(fromTaskId => {
          deps.push({
            fromTaskId,
            toTaskId: task.id,
            type: 'FS',
            lag: 0
          });
        });
      }
    });
    return deps;
  }, [dbTasks]);

  // Handle dependency edit
  const handleDependencyEdit = useCallback((dependency: DependencyArrow) => {
    setEditingDependency(dependency);
    setShowDependencyEditModal(true);
  }, []);

  // Handle dependency save
  const handleDependencySave = useCallback((dependency: DependencyArrow) => {
    const toTask = dbTasks.find(t => t.id === dependency.toTaskId);
    if (toTask && onTaskUpdate) {
      const existingDeps = toTask.dependencies && typeof toTask.dependencies === 'string' 
        ? toTask.dependencies.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) 
        : [];
      
      const filteredDeps = existingDeps.filter(id => id !== dependency.fromTaskId);
      filteredDeps.push(dependency.fromTaskId);
      
      const updatedTask = {
        ...toTask,
        dependencies: filteredDeps.join(', ')
      };
      
      onTaskUpdate(updatedTask);
    }
    setShowDependencyEditModal(false);
    setEditingDependency(null);
  }, [dbTasks, onTaskUpdate]);

  // Handle dependency delete
  const handleDependencyDelete = useCallback((fromTaskId: number, toTaskId: number) => {
    const toTask = dbTasks.find(t => t.id === toTaskId);
    if (toTask && onTaskUpdate) {
      const existingDeps = toTask.dependencies && typeof toTask.dependencies === 'string' 
        ? toTask.dependencies.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) 
        : [];
      const updatedDependencies = existingDeps.filter(id => id !== fromTaskId);
      
      const updatedTask = {
        ...toTask,
        dependencies: updatedDependencies.length > 0 ? updatedDependencies.join(', ') : ''
      };
      
      onTaskUpdate(updatedTask);
    }
    setShowDependencyEditModal(false);
    setEditingDependency(null);
  }, [dbTasks, onTaskUpdate]);

  if (tasksLoading) {
    return <div className="flex items-center justify-center p-8">Loading timeline...</div>;
  }

  if (dbTasks.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No tasks to display in timeline</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-hidden">
      {/* Controls */}
      {!readonly && (
        <div className="p-3 bg-gray-50 border-b">
          <div className="flex items-center gap-2">
            <Button
              variant={showDependencies ? "default" : "outline"}
              size="sm"
              onClick={() => setShowDependencies(!showDependencies)}
              className="flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              {showDependencies ? 'Hide Arrows' : 'Show Arrows'}
            </Button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="gantt-chart overflow-x-auto relative" id="gantt-container">
        <GanttChart
          tasks={timelineTasks}
          onTaskClick={onTaskEdit ? (task) => {
            const dbTask = dbTasks.find(t => t.id.toString() === task.id);
            if (dbTask) onTaskEdit(dbTask);
          } : undefined}
        />
        
        {/* Dependency Arrows Overlay */}
        {showDependencies && dependencies.length > 0 && (
          <DependencyArrows
            dependencies={dependencies}
            tasks={dbTasks}
            containerId="gantt-container"
            onEdit={handleDependencyEdit}
            onDelete={handleDependencyDelete}
          />
        )}
      </div>

      {/* Dependency Edit Modal */}
      <DependencyEditModal
        isOpen={showDependencyEditModal}
        onClose={() => {
          setShowDependencyEditModal(false);
          setEditingDependency(null);
        }}
        dependency={editingDependency}
        tasks={dbTasks}
        onSave={handleDependencySave}
        onDelete={handleDependencyDelete}
      />
    </div>
  );
}