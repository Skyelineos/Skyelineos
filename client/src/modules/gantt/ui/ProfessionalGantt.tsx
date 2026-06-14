// ProfessionalGantt.tsx - New BuildTrackerPro Integration
import React, { useEffect } from 'react';
import { BuildTrackerPro } from './BuildTrackerPro';
import { useGantt } from '../state';
import { WILSON_HOME_TASKS, WILSON_HOME_LINKS } from '../data/sampleData';
import { autoSchedule } from '../engine/autoSchedule';

export default function ProfessionalGantt() {
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

  return <BuildTrackerPro />;
}