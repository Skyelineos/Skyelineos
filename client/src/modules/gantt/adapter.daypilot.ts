// src/modules/gantt/adapter.daypilot.ts
import { format, parseISO, differenceInBusinessDays } from 'date-fns';
import type { WbsTask } from './types';

export interface DpResource { 
  id: string; 
  name: string; 
  children?: DpResource[]; 
  expanded?: boolean; 
}

export interface DpEvent { 
  id: string; 
  text: string; 
  start: string; 
  end: string; 
  resource: string; 
  barColor?: string; 
  percent?: number; 
}

export interface DpLink { 
  from: string; 
  to: string; 
  type: 'FinishToStart' | 'StartToStart' | 'FinishToFinish' | 'StartToFinish'; 
  lag?: number; 
}

function toDpLinkType(t: string): DpLink['type'] {
  return t === 'FS' ? 'FinishToStart' : 
         t === 'SS' ? 'StartToStart' : 
         t === 'FF' ? 'FinishToFinish' : 
         'StartToFinish';
}

export function toDayPilotData(tasks: WbsTask[]) {
  const resources: DpResource[] = [];
  const events: DpEvent[] = [];
  const links: DpLink[] = [];

  const walk = (nodes: WbsTask[], into: DpResource[]) => {
    nodes.forEach((t) => {
      const res: DpResource = { id: t.id, name: t.name, expanded: true };
      into.push(res);

      // One event per task, shown on its own row
      events.push({
        id: t.id,
        text: t.name,
        start: t.startDate,
        end: t.endDate,
        resource: t.id,
        percent: t.percent ?? 0,
      });

      t.predecessors?.forEach(p => {
        links.push({ 
          from: p.taskId, 
          to: t.id, 
          type: toDpLinkType(p.type), 
          lag: p.lagDays ?? 0 
        });
      });

      if (t.children?.length) {
        res.children = [];
        walk(t.children, res.children);
      }
    });
  };
  
  walk(tasks, resources);

  // timeline start/end padding
  const allStarts = events.map(e => e.start).sort();
  const allEnds = events.map(e => e.end).sort();
  const minDate = allStarts[0] ?? format(new Date(), 'yyyy-MM-dd');
  const maxDate = allEnds[allEnds.length - 1] ?? format(new Date(), 'yyyy-MM-dd');

  return { resources, events, links, minDate, maxDate };
}