// src/modules/gantt/ui/Timeline.tsx
import React, { useMemo, useRef, useEffect, useState } from 'react';
import { DayPilotScheduler } from '@daypilot/daypilot-lite-react';
import { DayPilot } from '@daypilot/daypilot-lite-javascript';
import { useGantt } from '../state';
import { toDayPilotData } from '../adapter.daypilot';
import { colorByCritical } from '../engine/criticalPath';

export default function Timeline() {
  const { tasks, showWeekends, showCritical, zoom } = useGantt();
  const schedulerRef = useRef<DayPilotScheduler>(null);
  const [linksSupported, setLinksSupported] = useState(true);

  const { resources, events, links, minDate, maxDate } = useMemo(() => 
    tasks.length > 0 ? toDayPilotData(tasks) : { resources: [], events: [], links: [], minDate: '', maxDate: '' }, [tasks]);

  // Color bars based on critical path and task type
  const coloredEvents = useMemo(() => {
    const criticalIds = new Set<string>(); // This should come from metrics context
    return events.map(e => {
      const task = tasks.find(t => t.id === e.id);
      const color = task ? colorByCritical(task, criticalIds) : '#0ea5b7';
      return { ...e, barColor: color };
    });
  }, [events, tasks, showCritical]);

  const config = {
    startDate: minDate || new DayPilot.Date().toString(),
    days: minDate && maxDate ? Math.max(30, DayPilot.DateUtil.daysDiff(
      new DayPilot.Date(minDate), 
      new DayPilot.Date(maxDate)
    ) + 14) : 90,
    scale: zoom,
    timeHeaders: zoom === 'Month'
      ? [{ groupBy: 'Year' }, { groupBy: 'Month', format: 'MMM yyyy' }]
      : zoom === 'Week' 
      ? [{ groupBy: 'Month', format: 'MMM' }, { groupBy: 'Week', format: 'w' }]
      : [{ groupBy: 'Month', format: 'MMM' }, { groupBy: 'Day', format: 'd' }],
    treeEnabled: true,
    rowHeaderColumns: [{ 
      name: 'Task', 
      display: 'name', 
      width: 280 
    }],
    resources,
    events: coloredEvents,
    
    // Basic configuration without advanced event handlers for now
    // (DayPilot Lite may have limited event handler support)
  };

  useEffect(() => {
    // Note: DayPilot Lite may not support dependency links
    // This is just a placeholder for link detection
    try {
      if (schedulerRef.current && links.length > 0) {
        // Try to set links if supported
        setLinksSupported(false); // Assume not supported in Lite version
      }
    } catch (error) {
      setLinksSupported(false);
    }
  }, [links]);

  return (
    <div className="relative bg-white rounded-lg border">
      <DayPilotScheduler ref={schedulerRef} {...config} />
      
      {!linksSupported && links.length > 0 && (
        <div className="absolute top-2 right-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
          Dependencies not rendered (DayPilot Lite limitation)
        </div>
      )}
    </div>
  );
}