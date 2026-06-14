// BuildTrackerPro Demo Page
import React, { useEffect } from 'react';
import { BuildTrackerPro } from '../modules/gantt/ui/BuildTrackerPro';
import { useGantt } from '../modules/gantt/state';
import { WILSON_HOME_TASKS, WILSON_HOME_LINKS } from '../modules/gantt/data/sampleData';
import { autoSchedule } from '../modules/gantt/engine/autoSchedule';

export default function BuildTrackerDemo() {
  const { setTasks, setLinks, setMetrics, tasks } = useGantt();

  useEffect(() => {
    // Initialize with sample data if not already loaded
    if (tasks.length === 0) {
      // Run auto-schedule on the sample data
      const result = autoSchedule(WILSON_HOME_TASKS, WILSON_HOME_LINKS, {
        projectStart: '2025-03-01',
        holidays: ['2025-12-25', '2025-01-01', '2025-07-04', '2025-11-28'],
        respectLocked: false
      });

      setTasks(result.tasks);
      setLinks(WILSON_HOME_LINKS);
      setMetrics(result.metrics);
    }
  }, [setTasks, setLinks, setMetrics, tasks.length]);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto p-4">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <BuildTrackerPro />
        </div>
      </div>
    </div>
  );
}