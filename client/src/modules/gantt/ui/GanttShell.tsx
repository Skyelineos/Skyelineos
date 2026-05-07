// src/modules/gantt/ui/GanttShell.tsx
import React, { useEffect } from 'react';
import Toolbar from './Toolbar';
import Timeline from './Timeline';
import Legends from './Legends';
import { useGantt } from '../state';
import type { WbsTask } from '../types';

interface GanttShellProps {
  projectName: string;
  initialTasks: WbsTask[];
  onChange?: (tasks: WbsTask[]) => void;
  className?: string;
}

export default function GanttShell({ 
  projectName, 
  initialTasks, 
  onChange,
  className = '' 
}: GanttShellProps) {
  const { setTasks, setProjectName, tasks } = useGantt();

  // Initialize with provided data
  useEffect(() => {
    setTasks(initialTasks);
    setProjectName(projectName);
  }, [initialTasks, projectName, setTasks, setFlags]);

  // Notify parent of changes
  useEffect(() => {
    if (onChange && tasks.length > 0) {
      onChange(tasks);
    }
  }, [tasks, onChange]);

  return (
    <div className={`space-y-0 ${className}`}>
      <Toolbar />
      <div className="bg-white border-x border-b">
        <Timeline />
      </div>
      <Legends />
    </div>
  );
}