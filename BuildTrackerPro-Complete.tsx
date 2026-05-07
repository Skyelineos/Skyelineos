// ============================================================================
// BuildTracker Pro - Complete Gantt Chart System
// Dual-Engine Construction Management with DHTMLX & Frappe Gantt
// ============================================================================

import React, { useRef, useEffect, useState } from 'react';
import { parseISO, format } from "date-fns";
import { create } from 'zustand';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface WbsTask {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress?: number;
  durationDays?: number;
  children?: WbsTask[];
  predecessors?: Predecessor[];
  locked?: boolean;
  notEarlierThan?: string;
  baselineStart?: string;
  baselineEnd?: string;
}

export interface Predecessor {
  taskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays?: number;
}

export interface Link {
  id?: string;
  sourceId: string;
  targetId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays?: number;
}

export interface Metrics {
  ES: Record<string, string>;
  EF: Record<string, string>;
  LS: Record<string, string>;
  LF: Record<string, string>;
  slackDays: Record<string, number>;
  criticalIds: Set<string>;
  warnings: string[];
}

export interface ScheduleOptions {
  projectStart?: string;
  holidays?: string[];
  respectLocked?: boolean;
}

// ============================================================================
// CALENDAR & WORKING DAYS ENGINE
// ============================================================================

export const isWorking = (date: Date, holidays: Set<string>): boolean => {
  const dateStr = format(date, 'yyyy-MM-dd');
  const day = date.getDay();
  return !(day === 0 || day === 6) && !holidays.has(dateStr);
};

export const addWorkingDays = (startDate: Date, days: number, holidays: Set<string>): Date => {
  let result = new Date(startDate);
  let remaining = Math.abs(days);
  const direction = days >= 0 ? 1 : -1;
  
  while (remaining > 0) {
    result.setDate(result.getDate() + direction);
    if (isWorking(result, holidays)) {
      remaining--;
    }
  }
  
  return result;
};

export const workingDiff = (startDate: Date, endDate: Date, holidays: Set<string>): number => {
  let current = new Date(startDate);
  let count = 0;
  
  while (current <= endDate) {
    if (isWorking(current, holidays)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
};

// ============================================================================
// AUTO-SCHEDULING ENGINE
// ============================================================================

type Id = string;

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function flatten(root: WbsTask[]): { list: WbsTask[]; map: Map<Id, WbsTask> } {
  const list: WbsTask[] = [];
  const map = new Map<Id, WbsTask>();
  const walk = (nodes: WbsTask[]) => nodes.forEach(t => { 
    list.push(t); 
    map.set(t.id, t); 
    t.children && walk(t.children); 
  });
  walk(root);
  return { list, map };
}

function isLeaf(t: WbsTask) { return !t.children || t.children.length === 0; }

function buildGraph(tasks: WbsTask[], links: Link[]) {
  const succ = new Map<Id, Link[]>();
  const pred = new Map<Id, Link[]>();
  tasks.forEach(t => { succ.set(t.id, []); pred.set(t.id, []); });
  links.forEach(l => {
    if (!succ.has(l.sourceId)) succ.set(l.sourceId, []);
    if (!pred.has(l.targetId)) pred.set(l.targetId, []);
    succ.get(l.sourceId)!.push(l);
    pred.get(l.targetId)!.push(l);
  });
  return { succ, pred };
}

function toISO(d: Date) { return format(d, "yyyy-MM-dd"); }

function durDays(t: WbsTask, holidays: Set<string>) {
  const s = parseISO(t.startDate);
  const e = parseISO(t.endDate);
  return t.durationDays ?? Math.max(1, workingDiff(s, e, holidays));
}

function constraintES(link: Link, predES: Date, predEF: Date, succDur: number, holidays: Set<string>): Date {
  const lag = link.lagDays ?? 0;
  switch (link.type) {
    case "FS": return addWorkingDays(predEF, lag + 1, holidays);
    case "SS": return addWorkingDays(predES, lag, holidays);
    case "FF": return addWorkingDays(predEF, lag - (succDur - 1), holidays);
    case "SF": return addWorkingDays(predES, lag - (succDur - 1), holidays);
    default: return addWorkingDays(predEF, lag + 1, holidays);
  }
}

export function autoSchedule(
  inputTasks: WbsTask[],
  links: Link[],
  options: ScheduleOptions = {}
): { tasks: WbsTask[]; metrics: Metrics } {

  const tasks = clone(inputTasks);
  const holidays = new Set(options.holidays ?? []);
  const { list, map } = flatten(tasks);
  const leafIds = list.filter(isLeaf).map(t => t.id);

  const { succ, pred } = buildGraph(list, links);
  const indeg = new Map<Id, number>();
  list.forEach(t => indeg.set(t.id, pred.get(t.id)?.length ?? 0));
  const queue: Id[] = [];
  indeg.forEach((d, id) => { if (d === 0) queue.push(id); });

  const ES: Record<Id, string> = {};
  const EF: Record<Id, string> = {};
  const LS: Record<Id, string> = {};
  const LF: Record<Id, string> = {};
  const warnings: string[] = [];

  const projectStartISO = options.projectStart || 
    list.reduce((m, t) => (t.startDate < m ? t.startDate : m), list[0]?.startDate ?? toISO(new Date()));
  const projectStart = parseISO(projectStartISO);

  // Forward pass
  const forwardOrder: Id[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    forwardOrder.push(id);
    for (const l of (succ.get(id) ?? [])) {
      const v = l.targetId;
      indeg.set(v, (indeg.get(v) ?? 0) - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }

  if (forwardOrder.length !== list.length) {
    warnings.push("Dependency cycle detected. Scheduling order may be invalid.");
  }

  for (const id of forwardOrder) {
    const t = map.get(id)!;
    if (!isLeaf(t)) continue;

    if (options.respectLocked && t.locked) {
      ES[id] = t.startDate;
      EF[id] = t.endDate;
      continue;
    }

    let es = projectStart;
    if (t.notEarlierThan) {
      const c = parseISO(t.notEarlierThan);
      if (c > es) es = c;
    }
    const dur = durDays(t, holidays);

    for (const l of (pred.get(id) ?? [])) {
      const p = map.get(l.sourceId);
      if (!p) continue;
      const pES = p ? parseISO(ES[p.id] ?? p.startDate) : projectStart;
      const pEF = p ? parseISO(EF[p.id] ?? p.endDate) : projectStart;
      const cand = constraintES(l, pES, pEF, dur, holidays);
      if (cand > es) es = cand;
    }

    const ef = addWorkingDays(es, dur - 1, holidays);
    ES[id] = toISO(es);
    EF[id] = toISO(ef);
    t.startDate = ES[id];
    t.endDate = EF[id];
  }

  // Roll-up summaries
  const roll = (nodes: WbsTask[]) => {
    nodes.forEach(n => {
      if (n.children?.length) {
        roll(n.children);
        const s = n.children.map(c => parseISO(c.startDate));
        const e = n.children.map(c => parseISO(c.endDate));
        const minS = new Date(Math.min(...s.map(x => x.getTime())));
        const maxE = new Date(Math.max(...e.map(x => x.getTime())));
        n.startDate = toISO(minS);
        n.endDate = toISO(maxE);
        ES[n.id] = n.startDate;
        EF[n.id] = n.endDate;
      }
    });
  };
  roll(tasks);

  // Backward pass
  let projFinish = parseISO(leafIds.map(id => EF[id] ?? map.get(id)!.endDate)
                               .reduce((m, d) => (d > m ? d : m)));

  for (const id of forwardOrder.slice().reverse()) {
    const t = map.get(id)!;
    const dur = durDays(t, holidays);
    if (!isLeaf(t)) continue;

    let lf = projFinish;
    let constrained = false;
    for (const l of (succ.get(id) ?? [])) {
      const s = map.get(l.targetId)!;
      const sES = parseISO(ES[s.id] ?? s.startDate);
      const sEF = parseISO(EF[s.id] ?? s.endDate);
      let candLF: Date;
      const lag = l.lagDays ?? 0;
      switch (l.type) {
        case "FS": candLF = addWorkingDays(sES, -lag, holidays); break;
        case "SS": 
          const candLS_ss = addWorkingDays(sES, -lag, holidays);
          candLF = addWorkingDays(candLS_ss, (dur - 1), holidays);
          break;
        case "FF": candLF = addWorkingDays(sEF, -lag, holidays); break;
        case "SF":
          const candLS_sf = addWorkingDays(sEF, -lag, holidays);
          candLF = addWorkingDays(candLS_sf, (dur - 1), holidays);
          break;
        default: candLF = addWorkingDays(sES, -lag, holidays); break;
      }
      lf = candLF < lf ? candLF : lf;
      constrained = true;
    }
    if (!constrained) lf = projFinish;
    
    const ls = addWorkingDays(lf, -(dur - 1), holidays);
    LF[id] = toISO(lf);
    LS[id] = toISO(ls);
  }

  // For summaries, mirror ES/EF and LS/LF
  list.filter(t => !isLeaf(t)).forEach(t => {
    LS[t.id] = ES[t.id];
    LF[t.id] = EF[t.id];
  });

  // Slack & critical path
  const slackDays: Record<Id, number> = {};
  const criticalIds = new Set<Id>();
  list.forEach(t => {
    const s = workingDiff(parseISO(ES[t.id]), parseISO(LS[t.id]), holidays);
    slackDays[t.id] = Math.max(0, s);
    if (isLeaf(t) && s === 0) criticalIds.add(t.id);
  });

  const metrics: Metrics = { ES, EF, LS, LF, slackDays, criticalIds, warnings };
  return { tasks, metrics };
}

// ============================================================================
// DHTMLX ADAPTER
// ============================================================================

const TYPE_MAP_TO_DHX: Record<string, string> = { 
  FS:"0", SS:"1", FF:"2", SF:"3" 
};
const TYPE_MAP_FROM_DHX: Record<string,"FS"|"SS"|"FF"|"SF"> = {
  "0":"FS","1":"SS","2":"FF","3":"SF",
  finish_to_start:"FS", start_to_start:"SS", finish_to_finish:"FF", start_to_finish:"SF"
};

// Simple WBS without extra plugin
function wbsOf(gantt:any, id:string): string {
  const idx = (pId:string, cId:string) => gantt.getChildren(pId).indexOf(cId) + 1;
  let cur = id, parts:number[] = [];
  while (cur && cur !== gantt.config.root_id) {
    const p = gantt.getParent(cur);
    parts.unshift(idx(p, cur));
    cur = p;
  }
  return parts.join('.');
}

export function toDhtmlx(tasks: WbsTask[], links: Link[]) {
  const rows: any[] = [];
  const parent = (p?: string) => p ?? 0;
  
  const walk = (nodes: WbsTask[], p?: string) => {
    nodes.forEach(t => {
      const startDate = t.startDate.includes('T') ? t.startDate.split('T')[0] : t.startDate;
      const endDate = t.endDate.includes('T') ? t.endDate.split('T')[0] : t.endDate;
      
      rows.push({
        id: t.id,
        text: t.name,
        start_date: startDate,
        end_date: endDate,
        duration: t.durationDays || Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)),
        progress: (t.progress ?? 0) / 100,
        open: true,
        parent: parent(p),
        type: t.children?.length ? 'project' : 'task'
      });
      if (t.children?.length) walk(t.children, t.id);
    });
  };
  
  walk(tasks);
  
  return {
    data: rows,
    links: links.map(l => ({
      id: l.id ?? `${l.sourceId}->${l.targetId}`,
      source: l.sourceId,
      target: l.targetId,
      type: l.type,
      lag: l.lagDays ?? 0
    }))
  };
}

export function fromDhtmlx(ganttApi:any): { tasks: WbsTask[]; links: Link[] } {
  const flat:any[] = [];
  ganttApi.eachTask((t:any)=>flat.push(t));

  const node = new Map<string, WbsTask>();
  flat.forEach(t => node.set(String(t.id), {
    id: String(t.id),
    name: t.text,
    startDate: t.start_date,
    endDate: t.end_date,
    progress: Math.round((t.progress||0)*100),
    children: [],
    predecessors: []
  }));

  const roots: WbsTask[] = [];
  flat.forEach(t => {
    const n = node.get(String(t.id))!;
    const p = String(t.parent);
    if (!p || p === ganttApi.config.root_id || p === "0") roots.push(n);
    else node.get(p)?.children?.push(n);
  });

  const TYPE_FROM: Record<string, any> = {
    "0":"FS","1":"SS","2":"FF","3":"SF",
    finish_to_start:"FS", start_to_start:"SS", finish_to_finish:"FF", start_to_finish:"SF"
  };
  const links: Link[] = ganttApi.getLinks().map((l:any) => ({
    id: String(l.id),
    sourceId: String(l.source),
    targetId: String(l.target),
    type: TYPE_FROM[String(l.type)],
    lagDays: Number(l.lag || 0)
  }));

  links.forEach(l => {
    node.get(l.targetId)?.predecessors?.push({ taskId:l.sourceId, type:l.type, lagDays:l.lagDays });
  });

  return { tasks: roots, links };
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

interface GanttState {
  tasks: WbsTask[];
  links: Link[];
  metrics?: Metrics;
  zoom: 'Day' | 'Week' | 'Month';
  showWeekends: boolean;
  showCritical: boolean;
  showBaseline: boolean;
  engine: 'dhtmlx' | 'frappe';
  holidays: string[];
  setTasks: (tasks: WbsTask[]) => void;
  setLinks: (links: Link[]) => void;
  setMetrics: (metrics?: Metrics) => void;
  setZoom: (zoom: 'Day' | 'Week' | 'Month') => void;
  toggleWeekends: () => void;
  toggleCritical: () => void;
  toggleBaseline: () => void;
  toggleEngine: () => void;
  runAutoSchedule: () => void;
  captureBaseline: () => void;
}

export const useGantt = create<GanttState>((set, get) => ({
  tasks: [],
  links: [],
  metrics: undefined,
  zoom: 'Week',
  showWeekends: true,
  showCritical: true,
  showBaseline: false,
  engine: 'dhtmlx',
  holidays: ['2025-07-04', '2025-12-25'],
  
  setTasks: (tasks) => set({ tasks }),
  setLinks: (links) => set({ links }),
  setMetrics: (metrics) => set({ metrics }),
  setZoom: (zoom) => set({ zoom }),
  toggleWeekends: () => set(state => ({ showWeekends: !state.showWeekends })),
  toggleCritical: () => set(state => ({ showCritical: !state.showCritical })),
  toggleBaseline: () => set(state => ({ showBaseline: !state.showBaseline })),
  toggleEngine: () => set(state => ({ engine: state.engine === 'dhtmlx' ? 'frappe' : 'dhtmlx' })),
  
  runAutoSchedule: () => {
    const { tasks, links, holidays } = get();
    if (tasks.length === 0) return;
    
    const result = autoSchedule(tasks, links, {
      projectStart: '2025-03-01',
      holidays,
      respectLocked: false
    });
    
    set({ 
      tasks: result.tasks, 
      metrics: result.metrics 
    });
  },
  
  captureBaseline: () => {
    const { tasks } = get();
    const snap = (ts:WbsTask[]):WbsTask[] => ts.map(t=>({
      ...t,
      baselineStart: t.startDate,
      baselineEnd: t.endDate,
      children: t.children ? snap(t.children) : undefined
    }));
    const snapTasks = snap(tasks);
    set({ tasks: snapTasks });
    if (!get().showBaseline) {
      set(state => ({ showBaseline: true }));
    }
  }
}));

// ============================================================================
// SAMPLE DATA
// ============================================================================

export const wilsonHomeProject: WbsTask[] = [
  {
    id: "1",
    name: "🏗️ Wilson Home Construction",
    startDate: "2025-03-01",
    endDate: "2025-08-01",
    progress: 25,
    children: [
      {
        id: "1.1",
        name: "📋 Pre-Construction",
        startDate: "2025-03-01",
        endDate: "2025-03-15",
        progress: 80,
        children: [
          {
            id: "1.1.1",
            name: "Permits & Approvals",
            startDate: "2025-03-01",
            endDate: "2025-03-07",
            progress: 100,
            durationDays: 5
          },
          {
            id: "1.1.2", 
            name: "Site Survey",
            startDate: "2025-03-08",
            endDate: "2025-03-10",
            progress: 100,
            durationDays: 2,
            predecessors: [{taskId: "1.1.1", type: "FS"}]
          },
          {
            id: "1.1.3",
            name: "Soil Testing",
            startDate: "2025-03-11", 
            endDate: "2025-03-15",
            progress: 60,
            durationDays: 3,
            predecessors: [{taskId: "1.1.2", type: "FS"}]
          }
        ]
      },
      {
        id: "1.2",
        name: "🏗️ Foundation",
        startDate: "2025-03-16",
        endDate: "2025-04-15",
        progress: 40,
        children: [
          {
            id: "1.2.1",
            name: "Excavation",
            startDate: "2025-03-16",
            endDate: "2025-03-22",
            progress: 100,
            durationDays: 5,
            predecessors: [{taskId: "1.1.3", type: "FS"}]
          },
          {
            id: "1.2.2",
            name: "Footings",
            startDate: "2025-03-23", 
            endDate: "2025-03-29",
            progress: 80,
            durationDays: 5,
            predecessors: [{taskId: "1.2.1", type: "FS"}]
          },
          {
            id: "1.2.3",
            name: "Foundation Walls",
            startDate: "2025-03-30",
            endDate: "2025-04-10",
            progress: 20,
            durationDays: 8,
            predecessors: [{taskId: "1.2.2", type: "FS"}]
          },
          {
            id: "1.2.4",
            name: "Foundation Inspection",
            startDate: "2025-04-11",
            endDate: "2025-04-15",
            progress: 0,
            durationDays: 3,
            predecessors: [{taskId: "1.2.3", type: "FS"}]
          }
        ]
      },
      {
        id: "1.3",
        name: "🏠 Framing",
        startDate: "2025-04-16",
        endDate: "2025-05-15",
        progress: 10,
        children: [
          {
            id: "1.3.1",
            name: "Floor Framing",
            startDate: "2025-04-16",
            endDate: "2025-04-25",
            progress: 30,
            durationDays: 7,
            predecessors: [{taskId: "1.2.4", type: "FS"}]
          },
          {
            id: "1.3.2",
            name: "Wall Framing",
            startDate: "2025-04-26",
            endDate: "2025-05-08",
            progress: 0,
            durationDays: 9,
            predecessors: [{taskId: "1.3.1", type: "FS"}]
          },
          {
            id: "1.3.3",
            name: "Roof Framing", 
            startDate: "2025-05-09",
            endDate: "2025-05-15",
            progress: 0,
            durationDays: 5,
            predecessors: [{taskId: "1.3.2", type: "FS"}]
          }
        ]
      }
    ]
  }
];

export const wilsonHomeLinks: Link[] = [
  {id: "l1", sourceId: "1.1.1", targetId: "1.1.2", type: "FS"},
  {id: "l2", sourceId: "1.1.2", targetId: "1.1.3", type: "FS"},
  {id: "l3", sourceId: "1.1.3", targetId: "1.2.1", type: "FS"},
  {id: "l4", sourceId: "1.2.1", targetId: "1.2.2", type: "FS"},
  {id: "l5", sourceId: "1.2.2", targetId: "1.2.3", type: "FS"},
  {id: "l6", sourceId: "1.2.3", targetId: "1.2.4", type: "FS"},
  {id: "l7", sourceId: "1.2.4", targetId: "1.3.1", type: "FS"},
  {id: "l8", sourceId: "1.3.1", targetId: "1.3.2", type: "FS"},
  {id: "l9", sourceId: "1.3.2", targetId: "1.3.3", type: "FS"}
];

// ============================================================================
// DHTMLX BUILDER COMPONENT
// ============================================================================

declare global {
  interface Window {
    gantt: any;
  }
}

export const DhtmlxBuilder: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<any>(null);
  const baselineLayerId = useRef<any>(null);
  const { tasks, links, setTasks, setLinks, setMetrics } = useGantt();

  useEffect(() => {
    if (!containerRef.current) return;

    import('dhtmlx-gantt').then(({ gantt }) => {
      if (!ganttRef.current) {
        // Visuals
        gantt.config.date_format = "%Y-%m-%d";
        gantt.config.xml_date   = "%Y-%m-%d";
        gantt.config.open_tree_initially = true;
        gantt.config.auto_scheduling = false; // our engine
        gantt.config.row_height = 28;
        gantt.config.bar_height = 20;
        gantt.config.drag_links = true;
        gantt.config.drag_resize = true;
        gantt.config.drag_progress = true;

        // Bar classes (reads showCritical via store)
        gantt.templates.task_class = (s:any,e:any,t:any) => {
          const st = useGantt.getState();
          if (gantt.hasChild(t.id)) return "task-summary";
          if (st.showCritical && st.metrics?.criticalIds.has(t.id)) return "task-critical";
          return "task-normal";
        };

        // Left grid: WBS, Task, Start, End, Dur, %, Preds
        gantt.config.columns = [
          { name:"wbs", label:"WBS", width:70, align:"right", template:(t:any)=>wbsOf(gantt, t.id) },
          { name:"text", label:"Task Name", tree:true, width:260 },
          { name:"start_date", label:"Start Date", width:110 },
          { name:"end_date",   label:"End Date",   width:110 },
          { name:"duration",   label:"Dur",        width:60  },
          { name:"progress",   label:"%", width:60, template:(t:any)=>Math.round((t.progress||0)*100)+"%" },
          { name:"predecessors", label:"Predecessors", width:160, template:(t:any)=>{
              const links = gantt.getLinks().filter((l:any)=>l.target === t.id);
              return links.map((l:any)=>`${l.source}${TYPE_MAP_FROM_DHX[l.type]}${l.lag?((l.lag>0?"+":"")+l.lag+"d"):""}`).join(", ");
          }},
        ];

        // Header scales (we'll reapply on zoom change)
        const applyScales = (mode:"Day"|"Week"|"Month") => {
          if (mode === "Month") {
            gantt.config.scale_unit = "month";
            gantt.config.date_scale = "%M %Y";
            gantt.config.subscales = [{ unit:"week", step:1, date:"Week %W" }];
          } else if (mode === "Week") {
            gantt.config.scale_unit = "week";
            gantt.config.date_scale = "Week %W";
            gantt.config.subscales = [{ unit:"day", step:1, date:"%d %M" }];
          } else {
            gantt.config.scale_unit = "day";
            gantt.config.date_scale = "%d %M";
            gantt.config.subscales = [{ unit:"hour", step:24, date:"" }];
          }
        };
        applyScales(useGantt.getState().zoom);

        // Weekend tint (we'll reapply on toggle)
        const setWeekendTint = (on:boolean) => {
          gantt.templates.scale_cell_class = (date:any) => {
            if (!on) return "";
            const d = date.getDay();
            return (d===0||d===6) ? "weekend" : "";
          };
          gantt.templates.timeline_cell_class = gantt.templates.scale_cell_class;
        };
        setWeekendTint(useGantt.getState().showWeekends);

        // Today marker
        gantt.addMarker({ start_date: new Date(), css:"today-marker", text:"", title:"Today" });

        if (containerRef.current) {
          gantt.init(containerRef.current);
          ganttRef.current = gantt;
        }

        // Baseline layer
        const ensureBaselineLayer = () => {
          if (baselineLayerId.current) return;
          baselineLayerId.current = gantt.addTaskLayer({
            renderer: {
              render: (item:any) => {
                const t = gantt.getTask(item.id);
                if (!t.baseline_start || !t.baseline_end) return;
                const pos = gantt.getTaskPosition(item, t.baseline_start, t.baseline_end);
                const el = document.createElement("div");
                el.className = "baseline";
                el.style.left = pos.left + "px";
                el.style.width = pos.width + "px";
                el.style.top = (pos.top + gantt.config.bar_height + 4) + "px";
                return el;
              },
              getRectangle: (item:any) => {
                const t = gantt.getTask(item.id);
                if (!t.baseline_start || !t.baseline_end) return;
                return gantt.getTaskPosition(item, t.baseline_start, t.baseline_end);
              }
            }
          });
        };

        // Attach events so edits/links reschedule & sync
        const rescheduleAndSync = () => {
          const { tasks: updatedTasks, links: updatedLinks } = fromDhtmlx(ganttRef.current);
          const { holidays } = useGantt.getState();
          const { tasks: t2, metrics } = autoSchedule(updatedTasks, updatedLinks, { holidays, respectLocked:true });
          useGantt.getState().setTasks(t2);
          useGantt.getState().setLinks(updatedLinks);
          useGantt.getState().setMetrics(metrics);
        };

        gantt.attachEvent("onAfterTaskAdd",   rescheduleAndSync);
        gantt.attachEvent("onAfterTaskUpdate",rescheduleAndSync);
        gantt.attachEvent("onAfterTaskDelete",rescheduleAndSync);
        gantt.attachEvent("onAfterLinkAdd",   rescheduleAndSync);
        gantt.attachEvent("onAfterLinkUpdate",rescheduleAndSync);
        gantt.attachEvent("onAfterLinkDelete",rescheduleAndSync);

        if (tasks.length > 0 || links.length > 0) {
          const dhtmlxData = toDhtmlx(tasks, links);
          gantt.parse({ data: dhtmlxData.data, links: dhtmlxData.links });
          gantt.render();
        }
      }
    });
  }, []);

  // Sync data when external state changes
  useEffect(() => {
    if (ganttRef.current && tasks.length > 0) {
      const dhtmlxData = toDhtmlx(tasks, links);
      ganttRef.current.clearAll();
      ganttRef.current.parse({ data: dhtmlxData.data, links: dhtmlxData.links });
      ganttRef.current.render();
    }
  }, [tasks, links]);

  // Zoom changes
  useEffect(() => {
    if (!ganttRef.current) return;
    const g = ganttRef.current;
    const z = useGantt.getState().zoom;
    if (z==="Month"){ g.config.scale_unit="month"; g.config.date_scale="%M %Y"; g.config.subscales=[{unit:"week",step:1,date:"Week %W"}]; }
    else if (z==="Week"){ g.config.scale_unit="week"; g.config.date_scale="Week %W"; g.config.subscales=[{unit:"day",step:1,date:"%d %M"}]; }
    else { g.config.scale_unit="day"; g.config.date_scale="%d %M"; g.config.subscales=[{unit:"hour",step:24,date:""}]; }
    g.render();
  }, [useGantt(s => s.zoom)]);

  // Weekend tint
  useEffect(() => {
    if (!ganttRef.current) return;
    const g = ganttRef.current; const on = useGantt.getState().showWeekends;
    g.templates.scale_cell_class = (date:any) => {
      if (!on) return "";
      const d = date.getDay();
      return (d===0||d===6) ? "weekend" : "";
    };
    g.templates.timeline_cell_class = g.templates.scale_cell_class;
    g.render();
  }, [useGantt(s => s.showWeekends)]);

  // Critical toggle (class template reads store) + Baseline toggle
  useEffect(() => { ganttRef.current?.render(); }, [useGantt(s=>s.showCritical), useGantt(s=>s.metrics)]);

  useEffect(() => {
    const g = ganttRef.current; if (!g) return;
    if (useGantt.getState().showBaseline) {
      if (!baselineLayerId.current) {
        baselineLayerId.current = g.addTaskLayer({
          renderer: {
            render: (item:any) => {
              const t = g.getTask(item.id);
              if (!t.baseline_start || !t.baseline_end) return;
              const pos = g.getTaskPosition(item, t.baseline_start, t.baseline_end);
              const el = document.createElement("div");
              el.className = "baseline";
              el.style.left = pos.left + "px";
              el.style.width = pos.width + "px";
              el.style.top = (pos.top + g.config.bar_height + 4) + "px";
              return el;
            }
          }
        });
      }
    }
    else if (baselineLayerId.current) { g.removeTaskLayer(baselineLayerId.current); baselineLayerId.current = null; }
    g.render();
  }, [useGantt(s=>s.showBaseline)]);

  return (
    <div className="h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

// ============================================================================
// FRAPPE VIEWER COMPONENT
// ============================================================================

export const FrappeViewer: React.FC = () => {
  const { tasks, zoom } = useGantt();
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<any>(null);

  const toFrappe = (nodes:any[]):any[] => {
    const out:any[]=[]; const walk=(a:any[])=>a.forEach((t:any)=>{
      if (t.children?.length) walk(t.children);
      else out.push({ id:t.id, name:t.name, start:t.startDate, end:t.endDate, progress:t.progress ?? 0 });
    }); walk(nodes); return out;
  };

  useEffect(() => {
    if (!ref.current) return;
    import("frappe-gantt").then((lib:any)=>{
      const data = toFrappe(tasks);
      inst.current = new lib.default(ref.current, data, {
        view_mode: zoom,
        bar_height: 22,
        padding: 16,
        custom_popup_html: (t:any)=>`<div class="p-2"><b>${t.name}</b><br/>${t.start} → ${t.end}<br/>${t.progress||0}%</div>`
      });
    });
    return () => { ref.current && (ref.current.innerHTML=""); };
  }, []);

  useEffect(() => {
    if (inst.current) inst.current.refresh(toFrappe(tasks));
  }, [tasks]);

  useEffect(() => {
    if (inst.current) inst.current.change_view_mode(zoom);
  }, [zoom]);

  return <div ref={ref} style={{ width:"100%", height: "100%", minHeight: 500 }} />;
};

// ============================================================================
// MAIN BUILDTRACKER PRO COMPONENT
// ============================================================================

export const BuildTrackerPro: React.FC = () => {
  const { 
    tasks, 
    links, 
    setTasks, 
    setLinks, 
    zoom, 
    setZoom, 
    showWeekends, 
    toggleWeekends,
    showCritical,
    toggleCritical,
    showBaseline,
    toggleBaseline,
    engine,
    toggleEngine,
    runAutoSchedule,
    captureBaseline 
  } = useGantt();

  useEffect(() => {
    // Load sample data on mount
    setTasks(wilsonHomeProject);
    setLinks(wilsonHomeLinks);
    runAutoSchedule();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-slate-900">
              BuildTracker Pro
            </h1>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>Wilson Home Construction</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-medium">
                {engine === 'dhtmlx' ? 'Builder Mode' : 'Client View'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Toolbar */}
        <div className="mt-4 flex items-center gap-4">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-slate-600 mr-2">Zoom:</span>
            {(['Day', 'Week', 'Month'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setZoom(level)}
                className={`px-3 py-1 text-xs font-medium rounded ${
                  zoom === level
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Toggle Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleWeekends}
              className={`px-3 py-1 text-xs font-medium rounded ${
                showWeekends 
                  ? 'bg-slate-500 text-white' 
                  : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              Weekends
            </button>
            <button
              onClick={toggleCritical}
              className={`px-3 py-1 text-xs font-medium rounded ${
                showCritical 
                  ? 'bg-red-500 text-white' 
                  : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              Critical Path
            </button>
            <button
              onClick={toggleBaseline}
              className={`px-3 py-1 text-xs font-medium rounded ${
                showBaseline 
                  ? 'bg-green-500 text-white' 
                  : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              Baseline
            </button>
            <button
              onClick={captureBaseline}
              className="px-3 py-1 text-xs font-medium rounded bg-emerald-100 text-emerald-700 border border-emerald-200"
            >
              Capture Baseline
            </button>
          </div>

          {/* Engine Toggle */}
          <button
            onClick={toggleEngine}
            className="px-3 py-1 text-xs font-medium rounded bg-purple-500 text-white hover:bg-purple-600"
          >
            Switch to {engine === 'dhtmlx' ? 'Client View' : 'Builder Mode'}
          </button>

          {/* Auto Schedule */}
          <button
            onClick={runAutoSchedule}
            className="px-3 py-1 text-xs font-medium rounded bg-emerald-500 text-white hover:bg-emerald-600"
          >
            Auto Schedule
          </button>
        </div>
      </div>

      {/* Gantt Chart Container */}
      <div className="flex-1 relative">
        {engine === 'dhtmlx' && <DhtmlxBuilder />}
        {engine === 'frappe' && <FrappeViewer />}
      </div>

      {/* CSS Styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
        /* Weekend tint + today marker */
        .gantt_task_cell.weekend, .gantt_scale_cell.weekend { background: rgba(148,163,184,.12) !important; }
        .today-marker .gantt_marker_content { background:#ef4444; width:2px; }

        /* Bar colors */
        .task-summary .gantt_task_bar, .task-summary .gantt_task_line { background:#22c55e; border-color:#22c55e; }
        .task-normal  .gantt_task_bar, .task-normal  .gantt_task_line { background:#0ea5b7; border-color:#0ea5b7; }
        .task-critical .gantt_task_bar, .task-critical .gantt_task_line { background:#ef4444; border-color:#ef4444; }
        .gantt_task_progress { background: rgba(255,255,255,.25); }

        /* Thin baseline */
        .baseline { position:absolute; height:4px; background:#11182722; border-radius:2px; }

        /* Compact grid */
        .gantt_grid_head_cell, .gantt_cell { font-size:12px; }
        `
      }} />
    </div>
  );
};

export default BuildTrackerPro;