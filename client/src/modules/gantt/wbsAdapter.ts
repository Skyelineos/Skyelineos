// wbsAdapter.ts - Professional WBS Grid Adapter
import { format, parseISO } from "date-fns";

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';
export interface Link { 
  taskId: string; 
  type: LinkType; 
  lagDays?: number; 
}

export interface WbsTask {
  id: string; 
  name: string; 
  startDate: string; 
  endDate: string; 
  percent?: number;
  children?: WbsTask[]; 
  predecessors?: Link[]; 
  summary?: boolean;
}

type DpResource = { 
  id: string; 
  name: string; 
  wbs: string; 
  start: string; 
  end: string; 
  percent: string; 
  pred: string; 
  expanded?: boolean; 
  children?: DpResource[]; 
};

type DpEvent = { 
  id: string; 
  text: string; 
  start: string; 
  end: string; 
  resource: string; 
  barColor?: string; 
  percent?: number;
};

const linkStr = (p: Link) => `${p.taskId}${p.type}${p.lagDays ? (p.lagDays > 0 ? '+' : '') + p.lagDays + 'd' : ''}`;

export function toDaypilotData(roots: WbsTask[]) {
  const resources: DpResource[] = [];
  const events: DpEvent[] = [];

  const number = (nodes: WbsTask[], prefix: string[] = []) => {
    nodes.forEach((t, i) => {
      const wbs = [...prefix, String(i + 1)].join('.');
      const res: DpResource = {
        id: t.id,
        name: t.name,
        wbs,
        start: format(parseISO(t.startDate), 'MMM d'),
        end: format(parseISO(t.endDate), 'MMM d'),
        percent: `${t.percent ?? 0}%`,
        pred: t.predecessors?.map(linkStr).join(', ') ?? '',
        expanded: true
      };
      
      // One row per task
      resources.push(res);
      events.push({ 
        id: t.id, 
        text: t.name, 
        start: t.startDate, 
        end: t.endDate, 
        resource: t.id,
        percent: t.percent ?? 0
      });
      
      if (t.children?.length) {
        res.children = [];
        // Process children recursively
        const before = resources.length - 1;
        number(t.children, [...prefix, String(i + 1)]);
        // Collect the children we just appended and nest them
        const childCount = resources.length - before - 1;
        const childResources = resources.splice(before + 1, childCount);
        res.children = childResources;
      }
    });
  };
  
  number(roots);
  
  // Find min/max dates for timeline padding
  const allEvents = events.length > 0 ? events : [{ start: format(new Date(), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }];
  const minDate = allEvents.map(e => e.start).sort()[0];
  const maxDate = allEvents.map(e => e.end).sort().slice(-1)[0];
  
  return { resources, events, minDate, maxDate };
}