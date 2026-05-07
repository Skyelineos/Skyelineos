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

export type Constraint = 'MSO'|'MFO'|'SNET'|'SNLT'|'FNET'|'FNLT';

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
  notEarlierThan?: string; // Legacy - use constraintType/constraintDate instead
  constraintType?: Constraint;
  constraintDate?: string;
  deadline?: string;
  baselineStart?: string;
  baselineEnd?: string;
  // 3-point estimates for Monte Carlo
  optimistic?: number;    // in working days
  mostLikely?: number;    // in working days
  pessimistic?: number;   // in working days
  // Critical Chain buffers
  isBuffer?: boolean;
  bufferType?: 'project' | 'feeding';
  parentChainTask?: string; // For feeding buffers, which task on critical chain they protect
  bufferDuration?: number;  // Original buffer size
  bufferBurn?: number;      // How much buffer has been consumed (0-100%)
}

export interface Predecessor {
  taskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays?: number;
  linkType?: 'hard' | 'soft'; // Hard links cannot be violated by leveling
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
  slackDays: Record<string, number>; // Total Float (LS - ES)
  freeFloat: Record<string, number>; // Free Float (min successor ES - EF)
  criticalIds: Set<string>;
  warnings: string[];
}

export interface ScheduleOptions {
  projectStart?: string;
  holidays?: string[];
  respectLocked?: boolean;
}

export interface Resource {
  id: string;
  name: string;
  capacityPerDay: number;
  calendarId?: string;
  costPerHour?: number;
}

export interface Assignment {
  taskId: string;
  resourceId: string;
  unitsPerDay: number; // e.g., 0.5 crew or 1 excavator
}

export interface CalendarDef {
  id: string;
  working: { [dow in 0|1|2|3|4|5|6]?: Array<{ start: string; end: string }> }; // "07:00-15:30"
  exceptions?: Array<{ date: string; working?: Array<{start:string; end:string}> }>; // holidays/weather
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
    // Apply legacy notEarlierThan constraint
    if (t.notEarlierThan) {
      const c = parseISO(t.notEarlierThan);
      if (c > es) es = c;
    }
    
    // Apply PMBOK constraints
    if (t.constraintType && t.constraintDate) {
      const constraintDate = parseISO(t.constraintDate);
      const dur = durDays(t, holidays);
      
      switch (t.constraintType) {
        case 'MSO': // Must Start On
          es = constraintDate;
          break;
        case 'MFO': // Must Finish On
          es = addWorkingDays(constraintDate, -(dur - 1), holidays);
          break;
        case 'SNET': // Start No Earlier Than
          if (constraintDate > es) es = constraintDate;
          break;
        case 'SNLT': // Start No Later Than
          if (constraintDate < es) {
            warnings.push(`Task ${t.name} (${id}) violates Start No Later Than ${t.constraintDate}`);
          }
          break;
        case 'FNET': // Finish No Earlier Than
          const minStart = addWorkingDays(constraintDate, -(dur - 1), holidays);
          if (minStart > es) es = minStart;
          break;
        case 'FNLT': // Finish No Later Than
          const maxStart = addWorkingDays(constraintDate, -(dur - 1), holidays);
          if (maxStart < es) {
            warnings.push(`Task ${t.name} (${id}) violates Finish No Later Than ${t.constraintDate}`);
          }
          break;
      }
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
        case "FS": candLF = addWorkingDays(sES, -lag - 1, holidays); break;
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
  const slackDays: Record<Id, number> = {}; // Total Float
  const freeFloat: Record<Id, number> = {}; // Free Float
  const criticalIds = new Set<Id>();
  
  list.forEach(t => {
    // Total Float (LS - ES) - subtract 1 since workingDiff is inclusive
    const totalFloat = workingDiff(parseISO(ES[t.id]), parseISO(LS[t.id]), holidays) - 1;
    slackDays[t.id] = Math.max(0, totalFloat);
    
    // Free Float (min successor ES - EF) - only for FS links
    if (isLeaf(t)) {
      const fsSuccessors = (succ.get(t.id) ?? []).filter(l => l.type === 'FS');
      if (fsSuccessors.length > 0) {
        const minSuccES = fsSuccessors
          .map(l => parseISO(ES[l.targetId]))
          .reduce((min, date) => date < min ? date : min);
        const taskEF = parseISO(EF[t.id]);
        const freeFloatDays = workingDiff(taskEF, minSuccES, holidays) - 1;
        freeFloat[t.id] = Math.max(0, freeFloatDays);
      } else {
        // No FS successors = conservative approach for non-FS networks
        freeFloat[t.id] = 0;
      }
    } else {
      // Summary tasks have no free float
      freeFloat[t.id] = 0;
    }
    
    if (isLeaf(t) && totalFloat === 0) criticalIds.add(t.id);
    
    // Check deadline violations (negative slack)
    if (t.deadline) {
      const deadlineDate = parseISO(t.deadline);
      const taskEndDate = parseISO(EF[t.id]);
      if (taskEndDate > deadlineDate) {
        const overrun = workingDiff(deadlineDate, taskEndDate, holidays);
        warnings.push(`Task ${t.name} (${t.id}) misses deadline by ${overrun} working days`);
        // Set negative slack for deadline violations
        slackDays[t.id] = -overrun;
      }
    }
  });

  const metrics: Metrics = { ES, EF, LS, LF, slackDays, freeFloat, criticalIds, warnings };
  return { tasks, metrics };
}

// ============================================================================
// RESOURCE LEVELING ENGINE
// ============================================================================

export function levelResources(
  tasks: WbsTask[], 
  assignments: Assignment[], 
  resources: Resource[], 
  holidays: string[],
  metrics?: Metrics
): WbsTask[] {
  if (!assignments.length || !resources.length) return tasks;
  
  const H = new Set(holidays);
  const tmap = new Map(tasks.flatMap(function collect(t): Array<[string, WbsTask]> { 
    return [[t.id,t], ...(t.children?.flatMap(collect) ?? [])]; 
  }));
  const resCap = new Map(resources.map(r=>[r.id, r.capacityPerDay]));

  let moved = true;
  let iterations = 0;
  const maxIterations = 50; // prevent infinite loops

  while (moved && iterations < maxIterations) {
    moved = false;
    iterations++;
    
    // 1) Build daily load per resource
    const load = new Map<string, Map<string, number>>(); // resId -> dateISO -> units
    for (const a of assignments) {
      const t = tmap.get(a.taskId);
      if (!t || t.children?.length) continue; // skip summaries
      
      for (let d = new Date(t.startDate); d <= new Date(t.endDate); d.setDate(d.getDate()+1)) {
        const iso = format(d, 'yyyy-MM-dd');
        if (!isWorking(d, H)) continue;
        
        const m = load.get(a.resourceId) ?? (load.set(a.resourceId, new Map()), load.get(a.resourceId)!);
        m.set(iso, (m.get(iso) ?? 0) + a.unitsPerDay);
      }
    }
    
    // 2) Resolve overloads by pushing the most floaty tasks
    for (const [rid, dayMap] of load) {
      const cap = resCap.get(rid)!;
      for (const [iso, dem] of dayMap) {
        if (dem <= cap) continue;
        
        // choose candidate tasks that work on iso with this resource
        const candidates = assignments
          .filter(a => a.resourceId === rid)
          .map(a => tmap.get(a.taskId)!)
          .filter(t => t && iso >= t.startDate && iso <= t.endDate);
        
        if (candidates.length === 0) continue;
        
        // sort: more total float first (use metrics.slackDays), then later ES
        const slack = (id:string) => (metrics?.slackDays[id] ?? 0);
        candidates.sort((a,b) => (slack(b.id) - slack(a.id)) || (a.startDate < b.startDate ? -1 : 1));
        
        for (const c of candidates) {
          // push one day if it has float
          if (slack(c.id) > 0) {
            const s = parseISO(c.startDate);
            const e = parseISO(c.endDate);
            const s2 = addWorkingDays(s, 1, H);
            const e2 = addWorkingDays(e, 1, H);
            
            c.startDate = toISO(s2);
            c.endDate = toISO(e2);
            moved = true;
            break; // re-build load next loop
          }
        }
        if (moved) break;
      }
      if (moved) break;
    }
  }
  
  return tasks;
}

// Enhanced resource leveling with hard/soft link support
export function resourceLevelingScheduleWithLinkTypes(
  tasks: WbsTask[], 
  links: Link[], 
  resources: Resource[],
  assignments: Assignment[],
  options: ScheduleOptions
): { tasks: WbsTask[], metrics?: Metrics } {
  // First run normal scheduling
  const scheduled = autoSchedule(tasks, links, options);
  
  if (!scheduled.metrics || resources.length === 0) {
    return scheduled;
  }
  
  // Helper to compute resource demand from current task state
  function computeDemand(flatTasks: WbsTask[]) {
    const demand = new Map<string, Map<string, number>>();
    for (const task of flatTasks) {
      if (task.children?.length) continue;
      const taskAssignments = assignments.filter(a => a.taskId === task.id);
      const startDate = parseISO(task.startDate);
      const duration = task.durationDays || 1;
      
      for (let d = 0; d < duration; d++) {
        const date = addWorkingDays(startDate, d, H(options.holidays));
        const dateKey = date.toISOString().split('T')[0];
        if (!demand.has(dateKey)) demand.set(dateKey, new Map());
        const dayDemand = demand.get(dateKey)!;
        
        for (const assignment of taskAssignments) {
          const currentDemand = dayDemand.get(assignment.resourceId) || 0;
          dayDemand.set(assignment.resourceId, currentDemand + assignment.unitsPerDay);
        }
      }
    }
    return demand;
  }

  const leveledTasks = [...scheduled.tasks];
  let iterationsLeft = 100;
  
  while (iterationsLeft-- > 0) {
    const flatTasks = leveledTasks.flatMap(function collect(t): WbsTask[] {
      return [t, ...(t.children?.flatMap(collect) ?? [])];
    });
    const resourceDemand = computeDemand(flatTasks);
    let resolved = false;
    
    outer:
    for (const [dateKey, dayDemand] of resourceDemand.entries()) {
      for (const [resourceId, demand] of dayDemand.entries()) {
        const resource = resources.find(r => r.id === resourceId);
        if (!resource || demand <= resource.capacityPerDay) continue;
        
        // Find tasks using this resource on this date
        const conflictingTasks = flatTasks.filter(task => {
          if (task.children?.length) return false;
          
          const startDate = parseISO(task.startDate);
          const endDate = parseISO(task.endDate);
          const checkDate = parseISO(dateKey);
          
          return checkDate >= startDate && checkDate <= endDate &&
                 assignments.some(a => a.taskId === task.id && a.resourceId === resourceId);
        });
        
        if (conflictingTasks.length <= 1) continue;
        
        // Sort by priority (tasks with soft links can be moved more easily)
        conflictingTasks.sort((a, b) => {
          const aHasHardLinks = a.predecessors?.some(p => p.linkType === 'hard') || false;
          const bHasHardLinks = b.predecessors?.some(p => p.linkType === 'hard') || false;
          
          if (aHasHardLinks !== bHasHardLinks) {
            return aHasHardLinks ? 1 : -1; // Hard link tasks have lower priority for moving
          }
          
          // Use total float as tiebreaker
          const aFloat = scheduled.metrics?.slackDays[a.id] || 0;
          const bFloat = scheduled.metrics?.slackDays[b.id] || 0;
          return bFloat - aFloat; // Higher float = higher priority for moving
        });
        
        // Move the task with the most flexibility
        const taskToMove = conflictingTasks[conflictingTasks.length - 1];
        const hasHardLinks = taskToMove.predecessors?.some(p => p.linkType === 'hard');
        
        if (!hasHardLinks) {
          // Move task by 1 working day
          const currentStart = parseISO(taskToMove.startDate);
          const newStart = addWorkingDays(currentStart, 1, H(options.holidays));
          const newEnd = addWorkingDays(newStart, (taskToMove.durationDays || 1) - 1, H(options.holidays));
          
          taskToMove.startDate = newStart.toISOString().split('T')[0];
          taskToMove.endDate = newEnd.toISOString().split('T')[0];
          
          resolved = true;
        }
      }
    }
    
    if (!resolved) break;
  }
  
  return { tasks: leveledTasks, metrics: scheduled.metrics };
}

// ============================================================================
// MONTE CARLO SIMULATION ENGINE
// ============================================================================

// Improved PERT Beta distribution sampling with stable Gamma sampler
function samplePERT(optimistic: number, mostLikely: number, pessimistic: number, lambda = 4): number {
  const a = optimistic, m = mostLikely, b = pessimistic;
  if (b <= a) return Math.max(1, Math.round(m)); // guard against invalid ranges
  const alpha = 1 + lambda * (m - a) / (b - a);
  const beta = 1 + lambda * (b - m) / (b - a);
  const u = sampleBeta(alpha, beta);
  return a + u * (b - a);
}

function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

function sampleGamma(k: number): number { // Marsaglia & Tsang
  const d = k < 1 ? k + 1 : k;
  const c = 1 / Math.sqrt(9*d - 3);
  while (true) {
    let x: number, v: number;
    do { 
      const n = normal01(); 
      x = n; 
      v = 1 + c*x; 
    } while (v <= 0);
    v = v*v*v;
    const u = Math.random();
    if (u < 1 - 0.0331*(x*x)*(x*x)) {
      return (k < 1 ? v*Math.pow(Math.random(), 1/k) : v);
    }
    if (Math.log(u) < 0.5*x*x + d*(1 - v + Math.log(v))) {
      return v;
    }
  }
}

function normal01(): number { // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}


// Get maximum project end date
function maxProjectEnd(tasks: WbsTask[]): string {
  const allTasks = tasks.flatMap(function collect(t): WbsTask[] {
    return [t, ...(t.children?.flatMap(collect) ?? [])];
  });
  
  return allTasks
    .filter(t => !t.children?.length) // leaf tasks only
    .reduce((max, t) => t.endDate > max ? t.endDate : max, '1900-01-01');
}

// Calculate percentiles from array of date strings
function calculatePercentiles(dates: string[], percentiles: number[]): Record<string, string> {
  const sorted = dates.slice().sort();
  const result: Record<string, string> = {};
  
  for (const p of percentiles) {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    result[`P${p}`] = sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }
  
  return result;
}

// Monte Carlo simulation
export interface SimulationResult {
  percentiles: Record<string, string>; // P50, P80, P90 dates
  criticalityIndex: Record<string, number>; // task ID -> % critical (0-100)
  scenarios: number;
}

export function runMonteCarloSimulation(
  tasks: WbsTask[], 
  links: Link[], 
  options: {
    scenarios: number;
    holidays?: string[];
    projectStart?: string;
  }
): SimulationResult {
  const { scenarios = 1000, holidays = [], projectStart } = options;
  const finishDates: string[] = [];
  const criticalCount = new Map<string, number>();
  
  // Initialize criticality counters
  const allTaskIds = tasks.flatMap(function collect(t): string[] {
    return [t.id, ...(t.children?.flatMap(collect) ?? [])];
  });
  allTaskIds.forEach(id => criticalCount.set(id, 0));
  
  for (let i = 0; i < scenarios; i++) {
    // Deep clone tasks for this scenario
    const sampledTasks = JSON.parse(JSON.stringify(tasks)) as WbsTask[];
    
    // Sample duration for each leaf task with 3-point estimates
    const flatTasks = sampledTasks.flatMap(function collect(t): WbsTask[] {
      return [t, ...(t.children?.flatMap(collect) ?? [])];
    });
    
    for (const task of flatTasks) {
      if (!task.children?.length && task.optimistic && task.mostLikely && task.pessimistic) {
        const sampledDuration = samplePERT(task.optimistic, task.mostLikely, task.pessimistic);
        task.durationDays = Math.max(1, Math.round(sampledDuration));
      }
    }
    
    // Run scheduling for this scenario
    const result = autoSchedule(sampledTasks, links, {
      projectStart,
      holidays,
      respectLocked: false
    });
    
    // Record project finish date
    const projectFinish = maxProjectEnd(result.tasks);
    finishDates.push(projectFinish);
    
    // Count critical tasks
    if (result.metrics) {
      result.metrics.criticalIds.forEach(id => {
        criticalCount.set(id, (criticalCount.get(id) || 0) + 1);
      });
    }
  }
  
  // Calculate percentiles
  const percentiles = calculatePercentiles(finishDates, [50, 80, 90]);
  
  // Calculate criticality index (percentage)
  const criticalityIndex: Record<string, number> = {};
  criticalCount.forEach((count, taskId) => {
    criticalityIndex[taskId] = Math.round((count / scenarios) * 100);
  });
  
  return {
    percentiles,
    criticalityIndex,
    scenarios
  };
}

// Helper function for holidays
const H = (holidays?: string[]) => new Set<string>(holidays ?? []);

// ============================================================================
// CHANGE TRACKING & AUDIT LOG
// ============================================================================

export interface ScheduleChange {
  id: string;
  timestamp: string;
  taskId: string;
  taskName: string;
  changeType: 'date_moved' | 'duration_changed' | 'resource_leveled' | 'constraint_applied' | 'link_relaxed';
  reason: string;
  before: {
    startDate?: string;
    endDate?: string;
    duration?: number;
  };
  after: {
    startDate?: string;
    endDate?: string;
    duration?: number;
  };
  user: string;
}

export interface SchedulePreview {
  originalTasks: WbsTask[];
  previewTasks: WbsTask[];
  changes: ScheduleChange[];
  warnings: string[];
}

export function createScheduleChange(
  taskId: string,
  taskName: string,
  changeType: ScheduleChange['changeType'],
  reason: string,
  before: ScheduleChange['before'],
  after: ScheduleChange['after'],
  user: string = 'System'
): ScheduleChange {
  return {
    id: `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    taskId,
    taskName,
    changeType,
    reason,
    before,
    after,
    user
  };
}

export function calculateScheduleChanges(
  originalTasks: WbsTask[],
  newTasks: WbsTask[],
  reason: string = 'Auto-scheduling',
  holidays: string[] = []
): ScheduleChange[] {
  const changes: ScheduleChange[] = [];
  
  const originalFlat = originalTasks.flatMap(function collect(t): WbsTask[] {
    return [t, ...(t.children?.flatMap(collect) ?? [])];
  });
  
  const newFlat = newTasks.flatMap(function collect(t): WbsTask[] {
    return [t, ...(t.children?.flatMap(collect) ?? [])];
  });
  
  for (const originalTask of originalFlat) {
    if (originalTask.children?.length) continue; // Skip summary tasks
    
    const newTask = newFlat.find(t => t.id === originalTask.id);
    if (!newTask) continue;
    
    const startChanged = originalTask.startDate !== newTask.startDate;
    const endChanged = originalTask.endDate !== newTask.endDate;
    const durationChanged = (originalTask.durationDays || 0) !== (newTask.durationDays || 0);
    
    if (startChanged || endChanged || durationChanged) {
      let changeType: ScheduleChange['changeType'] = 'date_moved';
      if (durationChanged) changeType = 'duration_changed';
      if (reason.includes('leveling')) changeType = 'resource_leveled';
      if (reason.includes('constraint')) changeType = 'constraint_applied';
      
      const daysDiff = startChanged ? 
        workingDiff(parseISO(originalTask.startDate), parseISO(newTask.startDate), H(holidays)) : 0;
      
      let reasonText = reason;
      if (daysDiff !== 0) {
        reasonText += ` (${daysDiff > 0 ? '+' : ''}${daysDiff}d)`;
      }
      
      changes.push(createScheduleChange(
        originalTask.id,
        originalTask.name,
        changeType,
        reasonText,
        {
          startDate: originalTask.startDate,
          endDate: originalTask.endDate,
          duration: originalTask.durationDays
        },
        {
          startDate: newTask.startDate,
          endDate: newTask.endDate,
          duration: newTask.durationDays
        }
      ));
    }
  }
  
  return changes;
}

// ============================================================================
// SCENARIO MANAGEMENT
// ============================================================================

// Serialization helpers for Metrics (fixes Set<> JSON issues)
function serializeMetrics(m?: Metrics) {
  if (!m) return undefined;
  return { ...m, criticalIds: Array.from(m.criticalIds) as string[] };
}

function deserializeMetrics(m?: any): Metrics | undefined {
  if (!m) return undefined;
  return { ...m, criticalIds: new Set<string>(m.criticalIds as string[]) };
}

export interface Scenario {
  id: string;
  name: string;
  createdAt: string;
  tasks: WbsTask[];
  links: Link[];
  metrics?: Metrics;
  criticalChainResult?: CriticalChainResult;
  baselineId?: string; // Reference to baseline scenario
}

export interface ScenarioComparison {
  scenario1: Scenario;
  scenario2: Scenario;
  taskChanges: {
    id: string;
    name: string;
    startDateDiff: number; // days
    endDateDiff: number; // days
    durationDiff: number; // days
    criticalityChange: 'added' | 'removed' | 'unchanged';
  }[];
  projectFinishDiff: number; // days
  criticalPathChanges: {
    added: string[];
    removed: string[];
  };
}

export function createScenario(
  name: string,
  tasks: WbsTask[],
  links: Link[],
  metrics?: Metrics,
  criticalChainResult?: CriticalChainResult,
  baselineId?: string
): Scenario {
  return {
    id: `scenario-${Date.now()}`,
    name,
    createdAt: new Date().toISOString(),
    tasks: JSON.parse(JSON.stringify(tasks)), // Deep clone
    links: JSON.parse(JSON.stringify(links)), // Deep clone
    metrics: serializeMetrics(metrics),
    criticalChainResult: criticalChainResult ? JSON.parse(JSON.stringify(criticalChainResult)) : undefined,
    baselineId
  };
}

export function diffScenarios(scenario1: Scenario, scenario2: Scenario): ScenarioComparison {
  const flatTasks1 = scenario1.tasks.flatMap(function collect(t): WbsTask[] {
    return [t, ...(t.children?.flatMap(collect) ?? [])];
  });
  
  const flatTasks2 = scenario2.tasks.flatMap(function collect(t): WbsTask[] {
    return [t, ...(t.children?.flatMap(collect) ?? [])];
  });

  const taskChanges = flatTasks1.map(task1 => {
    const task2 = flatTasks2.find(t => t.id === task1.id);
    if (!task2) return null;

    const startDateDiff = task2.startDate !== task1.startDate ? 
      workingDiff(parseISO(task1.startDate), parseISO(task2.startDate), H()) : 0;
    
    const endDateDiff = task2.endDate !== task1.endDate ?
      workingDiff(parseISO(task1.endDate), parseISO(task2.endDate), H()) : 0;
    
    const durationDiff = (task2.durationDays || 0) - (task1.durationDays || 0);

    let criticalityChange: 'added' | 'removed' | 'unchanged' = 'unchanged';
    const isCritical1 = scenario1.metrics?.criticalIds.has(task1.id) || false;
    const isCritical2 = scenario2.metrics?.criticalIds.has(task2.id) || false;
    
    if (!isCritical1 && isCritical2) criticalityChange = 'added';
    if (isCritical1 && !isCritical2) criticalityChange = 'removed';

    return {
      id: task1.id,
      name: task1.name,
      startDateDiff,
      endDateDiff,
      durationDiff,
      criticalityChange
    };
  }).filter((change): change is NonNullable<typeof change> => change !== null);

  // Calculate project finish difference
  const projectEnd1 = flatTasks1
    .filter(t => !t.children?.length)
    .reduce((max, t) => t.endDate > max ? t.endDate : max, '1900-01-01');
  
  const projectEnd2 = flatTasks2
    .filter(t => !t.children?.length)
    .reduce((max, t) => t.endDate > max ? t.endDate : max, '1900-01-01');

  const projectFinishDiff = workingDiff(parseISO(projectEnd1), parseISO(projectEnd2), H());

  // Critical path changes
  const criticalIds1 = Array.from(scenario1.metrics?.criticalIds || []);
  const criticalIds2 = Array.from(scenario2.metrics?.criticalIds || []);
  
  const criticalPathChanges = {
    added: criticalIds2.filter(id => !criticalIds1.includes(id)),
    removed: criticalIds1.filter(id => !criticalIds2.includes(id))
  };

  return {
    scenario1,
    scenario2,
    taskChanges: taskChanges.filter(change => 
      change.startDateDiff !== 0 || change.endDateDiff !== 0 || 
      change.durationDiff !== 0 || change.criticalityChange !== 'unchanged'
    ),
    projectFinishDiff,
    criticalPathChanges
  };
}

// ============================================================================
// CRITICAL CHAIN BUFFER MANAGEMENT
// ============================================================================

export interface CriticalChainResult {
  criticalChain: string[]; // Task IDs on the critical chain (resource-constrained)
  projectBuffer: WbsTask;
  feedingBuffers: WbsTask[];
  chainDuration: number;
}

export function buildCriticalChain(
  tasks: WbsTask[], 
  links: Link[], 
  resources: Resource[],
  assignments: Assignment[],
  options: {
    projectStart?: string;
    holidays?: string[];
    projectBufferPercent?: number; // Default 50%
    feedingBufferPercent?: number; // Default 25%
  }
): { tasks: WbsTask[], chainResult: CriticalChainResult } {
  const { projectBufferPercent = 50, feedingBufferPercent = 25 } = options;
  
  // First, run standard scheduling to get baseline metrics
  const scheduled = autoSchedule(tasks, links, options);
  if (!scheduled.metrics) {
    return { tasks, chainResult: { criticalChain: [], projectBuffer: {} as WbsTask, feedingBuffers: [], chainDuration: 0 } };
  }
  
  // Identify critical chain (resource-constrained critical path)
  const criticalChain = findCriticalChain(scheduled.tasks, links, resources, assignments, scheduled.metrics);
  
  // Calculate chain duration
  const chainDuration = calculateChainDuration(criticalChain, scheduled.tasks);
  
  // Create project buffer (at end of critical chain)
  const projectBufferDays = Math.max(1, Math.round(chainDuration * (projectBufferPercent / 100)));
  const lastChainTask = findTaskById(scheduled.tasks, criticalChain[criticalChain.length - 1]);
  const projectBuffer: WbsTask = {
    id: `buffer-project-${Date.now()}`,
    name: `📦 Project Buffer (${projectBufferDays}d)`,
    startDate: lastChainTask?.endDate || options.projectStart || '2025-03-01',
    endDate: addWorkingDays(parseISO(lastChainTask?.endDate || options.projectStart || '2025-03-01'), projectBufferDays, H(options.holidays)).toISOString().split('T')[0],
    durationDays: projectBufferDays,
    isBuffer: true,
    bufferType: 'project',
    bufferDuration: projectBufferDays,
    bufferBurn: Math.random() * 40 // Simulated consumption for demo
  };
  
  // Find feeding buffer locations (where non-critical paths join critical chain)
  const feedingBuffers = createFeedingBuffers(
    criticalChain, 
    scheduled.tasks, 
    links, 
    feedingBufferPercent, 
    options.holidays || []
  );
  
  // Insert buffers into task list
  const tasksWithBuffers = [...scheduled.tasks];
  tasksWithBuffers.push(projectBuffer);
  tasksWithBuffers.push(...feedingBuffers);
  
  const chainResult: CriticalChainResult = {
    criticalChain,
    projectBuffer,
    feedingBuffers,
    chainDuration
  };
  
  return { tasks: tasksWithBuffers, chainResult };
}

// Find critical chain considering resource constraints
function findCriticalChain(
  tasks: WbsTask[], 
  links: Link[], 
  resources: Resource[],
  assignments: Assignment[],
  metrics: Metrics
): string[] {
  // Start with tasks on critical path (zero total float)
  const criticalPathTasks = Array.from(metrics.criticalIds);
  
  // Sort by early start to get sequence
  const flatTasks = tasks.flatMap(function collect(t): WbsTask[] {
    return [t, ...(t.children?.flatMap(collect) ?? [])];
  });
  
  const criticalTasks = criticalPathTasks
    .map(id => flatTasks.find(t => t.id === id))
    .filter((t): t is WbsTask => t !== undefined)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  
  // Filter to resource-constrained sequence (tasks that share critical resources)
  const criticalChain: string[] = [];
  const criticalResources = new Set<string>();
  
  for (const task of criticalTasks) {
    // Check if this task uses any critical resources
    const taskAssignments = assignments.filter(a => a.taskId === task.id);
    const taskResources = taskAssignments.map(a => a.resourceId);
    
    const sharesCriticalResource = taskResources.some(r => criticalResources.has(r)) || criticalResources.size === 0;
    
    if (sharesCriticalResource || criticalChain.length === 0) {
      criticalChain.push(task.id);
      taskResources.forEach(r => criticalResources.add(r));
    }
  }
  
  return criticalChain.length > 0 ? criticalChain : criticalPathTasks.slice(0, 5); // Fallback to first 5 critical path tasks
}

// Calculate total duration of critical chain
function calculateChainDuration(chainTaskIds: string[], tasks: WbsTask[]): number {
  const flatTasks = tasks.flatMap(function collect(t): WbsTask[] {
    return [t, ...(t.children?.flatMap(collect) ?? [])];
  });
  
  return chainTaskIds.reduce((total, id) => {
    const task = flatTasks.find(t => t.id === id);
    return total + (task?.durationDays || 0);
  }, 0);
}

// Create feeding buffers where non-critical paths join critical chain
function createFeedingBuffers(
  criticalChain: string[], 
  tasks: WbsTask[], 
  links: Link[],
  feedingBufferPercent: number,
  holidays: string[]
): WbsTask[] {
  const feedingBuffers: WbsTask[] = [];
  const flatTasks = tasks.flatMap(function collect(t): WbsTask[] {
    return [t, ...(t.children?.flatMap(collect) ?? [])];
  });
  
  // Find tasks that feed into the critical chain but aren't on it
  for (const chainTaskId of criticalChain) {
    const feedingLinks = links.filter(l => 
      l.targetId === chainTaskId && 
      !criticalChain.includes(l.sourceId)
    );
    
    for (const link of feedingLinks) {
      const feedingTask = flatTasks.find(t => t.id === link.sourceId);
      if (!feedingTask) continue;
      
      // Calculate feeding buffer size (% of feeding path duration)
      const feedingPathDuration = feedingTask.durationDays || 1;
      const bufferDays = Math.max(1, Math.round(feedingPathDuration * (feedingBufferPercent / 100)));
      
      const feedingBuffer: WbsTask = {
        id: `buffer-feeding-${link.sourceId}-${chainTaskId}`,
        name: `🔗 Feeding Buffer (${bufferDays}d)`,
        startDate: feedingTask.endDate,
        endDate: addWorkingDays(parseISO(feedingTask.endDate), bufferDays, H(holidays)).toISOString().split('T')[0],
        durationDays: bufferDays,
        isBuffer: true,
        bufferType: 'feeding',
        parentChainTask: chainTaskId,
        bufferDuration: bufferDays,
        bufferBurn: Math.random() * 60 // Simulated consumption
      };
      
      feedingBuffers.push(feedingBuffer);
    }
  }
  
  return feedingBuffers;
}

// Helper to find task by ID
function findTaskById(tasks: WbsTask[], id: string): WbsTask | undefined {
  const flatTasks = tasks.flatMap(function collect(t): WbsTask[] {
    return [t, ...(t.children?.flatMap(collect) ?? [])];
  });
  return flatTasks.find(t => t.id === id);
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
      
      // Duration as working days using store holidays
      const holidaySet = H(useGantt.getState().holidays);
      const duration = t.durationDays ?? 
        Math.max(1, workingDiff(new Date(startDate), new Date(endDate), holidaySet));

      rows.push({
        id: t.id,
        text: t.name,
        start_date: startDate,
        end_date: endDate,
        duration: duration,
        progress: (t.progress ?? 0) / 100,
        open: true,
        parent: parent(p),
        type: t.children?.length ? 'project' : 'task',
        baseline_start: t.baselineStart,
        baseline_end: t.baselineEnd,
        isBuffer: t.isBuffer,
        bufferType: t.bufferType
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
      type: TYPE_MAP_TO_DHX[l.type],   // ← fix: map to DHX code
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
    predecessors: [],
    baselineStart: t.baseline_start,
    baselineEnd: t.baseline_end
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
  resources: Resource[];
  assignments: Assignment[];
  showResourceLeveling: boolean;
  simulationResult?: SimulationResult;
  showSimulationModal: boolean;
  // Critical Chain
  criticalChainResult?: CriticalChainResult;
  showCriticalChain: boolean;
  showBufferChart: boolean;
  // Scenario Management
  scenarios: Scenario[];
  currentScenario?: Scenario;
  showScenarioManager: boolean;
  showScenarioComparison: boolean;
  scenarioComparison?: ScenarioComparison;
  // UX Improvements
  schedulePreview?: SchedulePreview;
  showSchedulePreview: boolean;
  changeLog: ScheduleChange[];
  showChangeLog: boolean;
  // Link editor
  editingLink?: Link;
  showLinkEditor: boolean;
  openLinkEditor: (link: Link) => void;
  closeLinkEditor: () => void;
  // Grid splitter
  gridWidth: number;
  setGridWidth: (w: number) => void;
  setTasks: (tasks: WbsTask[]) => void;
  setLinks: (links: Link[]) => void;
  setMetrics: (metrics?: Metrics) => void;
  setZoom: (zoom: 'Day' | 'Week' | 'Month') => void;
  toggleWeekends: () => void;
  toggleCritical: () => void;
  toggleBaseline: () => void;
  toggleEngine: () => void;
  toggleResourceLeveling: () => void;
  toggleCriticalChain: () => void;
  toggleBufferChart: () => void;
  toggleScenarioManager: () => void;
  toggleChangeLog: () => void;
  runAutoSchedule: () => void;
  runDryRunSchedule: () => void;
  applySchedulePreview: () => void;
  rejectSchedulePreview: () => void;
  captureBaseline: () => void;
  runSimulation: () => void;
  buildCriticalChainSchedule: () => void;
  branchScenario: (name: string) => void;
  loadScenario: (scenario: Scenario) => void;
  compareScenarios: (scenario1Id: string, scenario2Id: string) => void;
  setShowSimulationModal: (show: boolean) => void;
  setShowScenarioComparison: (show: boolean) => void;
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
  resources: [],
  assignments: [],
  showResourceLeveling: false,
  simulationResult: undefined,
  showSimulationModal: false,
  // Critical Chain
  criticalChainResult: undefined,
  showCriticalChain: false,
  showBufferChart: false,
  // Scenario Management
  scenarios: [],
  currentScenario: undefined,
  showScenarioManager: false,
  showScenarioComparison: false,
  scenarioComparison: undefined,
  // UX Improvements
  schedulePreview: undefined,
  showSchedulePreview: false,
  changeLog: [],
  showChangeLog: false,
  // Link editor
  editingLink: undefined,
  showLinkEditor: false,
  openLinkEditor: (link) => set({ editingLink: link, showLinkEditor: true }),
  closeLinkEditor: () => set({ editingLink: undefined, showLinkEditor: false }),
  // Grid splitter
  gridWidth: Number(localStorage.getItem('buildtracker-grid-width') || 280),
  setGridWidth: (w) => {
    const clamped = Math.max(160, Math.min(800, Math.round(w)));
    localStorage.setItem('buildtracker-grid-width', String(clamped));
    set({ gridWidth: clamped });
  },
  
  setTasks: (tasks) => set({ tasks }),
  setLinks: (links) => set({ links }),
  setMetrics: (metrics) => set({ metrics }),
  setZoom: (zoom) => set({ zoom }),
  toggleWeekends: () => set(state => ({ showWeekends: !state.showWeekends })),
  toggleCritical: () => set(state => ({ showCritical: !state.showCritical })),
  toggleBaseline: () => set(state => ({ showBaseline: !state.showBaseline })),
  toggleEngine: () => set(state => ({ engine: state.engine === 'dhtmlx' ? 'frappe' : 'dhtmlx' })),
  toggleResourceLeveling: () => set(state => ({ showResourceLeveling: !state.showResourceLeveling })),
  toggleCriticalChain: () => set(state => ({ showCriticalChain: !state.showCriticalChain })),
  toggleBufferChart: () => set(state => ({ showBufferChart: !state.showBufferChart })),
  toggleScenarioManager: () => set(state => ({ showScenarioManager: !state.showScenarioManager })),
  toggleChangeLog: () => set(state => ({ showChangeLog: !state.showChangeLog })),
  
  runAutoSchedule: () => {
    const { tasks, links, holidays, resources, assignments, showResourceLeveling } = get();
    if (tasks.length === 0) return;
    
    const result = autoSchedule(tasks, links, {
      projectStart: '2025-03-01',
      holidays,
      respectLocked: false
    });
    
    let finalTasks = result.tasks;
    
    // Apply resource leveling if enabled
    if (showResourceLeveling && resources.length > 0 && assignments.length > 0) {
      finalTasks = levelResources(finalTasks, assignments, resources, holidays, result.metrics);
    }
    
    set({ 
      tasks: finalTasks, 
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
  },
  
  runSimulation: () => {
    const { tasks, links, holidays } = get();
    if (tasks.length === 0) return;
    
    const result = runMonteCarloSimulation(tasks, links, {
      scenarios: 1000,
      holidays,
      projectStart: '2025-03-01'
    });
    
    set({ 
      simulationResult: result,
      showSimulationModal: true 
    });
  },
  
  setShowSimulationModal: (show) => set({ showSimulationModal: show }),
  
  buildCriticalChainSchedule: () => {
    const { tasks, links, holidays, resources, assignments } = get();
    if (tasks.length === 0) return;
    
    const result = buildCriticalChain(tasks, links, resources, assignments, {
      projectStart: '2025-03-01',
      holidays,
      projectBufferPercent: 50,
      feedingBufferPercent: 25
    });
    
    set({ 
      tasks: result.tasks,
      criticalChainResult: result.chainResult,
      showCriticalChain: true
    });
  },
  
  branchScenario: (name: string) => {
    const { tasks, links, metrics, criticalChainResult, scenarios } = get();
    
    const newScenario = createScenario(name, tasks, links, metrics, criticalChainResult);
    
    // Keep only last 3 scenarios (including new one)
    const updatedScenarios = [newScenario, ...scenarios].slice(0, 3);
    
    set({ 
      scenarios: updatedScenarios,
      currentScenario: newScenario 
    });
    
    // Persist to localStorage
    try {
      localStorage.setItem('buildtracker-scenarios', JSON.stringify(updatedScenarios));
    } catch (e) {
      console.warn('Failed to persist scenarios to localStorage:', e);
    }
  },
  
  loadScenario: (scenario: Scenario) => {
    set({
      tasks: scenario.tasks,
      links: scenario.links,
      metrics: deserializeMetrics(scenario.metrics),
      criticalChainResult: scenario.criticalChainResult,
      currentScenario: scenario
    });
  },
  
  compareScenarios: (scenario1Id: string, scenario2Id: string) => {
    const { scenarios } = get();
    const scenario1 = scenarios.find(s => s.id === scenario1Id);
    const scenario2 = scenarios.find(s => s.id === scenario2Id);
    
    if (scenario1 && scenario2) {
      const comparison = diffScenarios(scenario1, scenario2);
      set({ 
        scenarioComparison: comparison,
        showScenarioComparison: true 
      });
    }
  },
  
  setShowScenarioComparison: (show: boolean) => set({ showScenarioComparison: show }),
  
  runDryRunSchedule: () => {
    const { tasks, links, holidays, resources, assignments, showResourceLeveling } = get();
    if (tasks.length === 0) return;
    
    // Run scheduling without applying changes
    const originalTasks = JSON.parse(JSON.stringify(tasks));
    let result;
    
    if (showResourceLeveling) {
      result = resourceLevelingScheduleWithLinkTypes(tasks, links, resources, assignments, {
        projectStart: '2025-03-01',
        holidays,
        respectLocked: true
      });
    } else {
      result = autoSchedule(tasks, links, {
        projectStart: '2025-03-01',
        holidays,
        respectLocked: true
      });
    }
    
    // Calculate changes
    const changes = calculateScheduleChanges(originalTasks, result.tasks, 
      showResourceLeveling ? 'Resource leveling' : 'Auto-scheduling', holidays);
    
    const preview: SchedulePreview = {
      originalTasks,
      previewTasks: result.tasks,
      changes,
      warnings: result.metrics?.warnings || []
    };
    
    set({ 
      schedulePreview: preview,
      showSchedulePreview: true 
    });
  },
  
  applySchedulePreview: () => {
    const { schedulePreview, changeLog } = get();
    if (!schedulePreview) return;
    
    // Apply the preview
    set({ 
      tasks: schedulePreview.previewTasks,
      schedulePreview: undefined,
      showSchedulePreview: false,
      changeLog: [...schedulePreview.changes, ...changeLog].slice(0, 50) // Keep last 50 changes
    });
    
    // Re-run metrics
    get().runAutoSchedule();
  },
  
  rejectSchedulePreview: () => {
    set({ 
      schedulePreview: undefined,
      showSchedulePreview: false 
    });
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

// Sample resources for Wilson Home Construction
export const wilsonHomeResources: Resource[] = [
  { id: "crew1", name: "Site Crew", capacityPerDay: 1.0, costPerHour: 75 },
  { id: "excavator", name: "Excavator + Operator", capacityPerDay: 1.0, costPerHour: 125 },
  { id: "concrete", name: "Concrete Crew", capacityPerDay: 1.0, costPerHour: 85 },
  { id: "framing", name: "Framing Crew", capacityPerDay: 1.0, costPerHour: 70 },
  { id: "inspector", name: "Inspector", capacityPerDay: 0.5, costPerHour: 100 }
];

// Sample resource assignments
export const wilsonHomeAssignments: Assignment[] = [
  // Pre-Construction
  { taskId: "1.1.1", resourceId: "inspector", unitsPerDay: 0.2 },
  { taskId: "1.1.2", resourceId: "crew1", unitsPerDay: 1.0 },
  { taskId: "1.1.3", resourceId: "crew1", unitsPerDay: 0.5 },
  
  // Foundation
  { taskId: "1.2.1", resourceId: "excavator", unitsPerDay: 1.0 },
  { taskId: "1.2.1", resourceId: "crew1", unitsPerDay: 0.5 }, // support crew
  { taskId: "1.2.2", resourceId: "concrete", unitsPerDay: 1.0 },
  { taskId: "1.2.3", resourceId: "concrete", unitsPerDay: 1.0 },
  { taskId: "1.2.3", resourceId: "crew1", unitsPerDay: 0.5 },
  { taskId: "1.2.4", resourceId: "inspector", unitsPerDay: 0.5 },
  
  // Framing
  { taskId: "1.3.1", resourceId: "framing", unitsPerDay: 1.0 },
  { taskId: "1.3.1", resourceId: "crew1", unitsPerDay: 0.5 },
  { taskId: "1.3.2", resourceId: "framing", unitsPerDay: 1.0 },
  { taskId: "1.3.3", resourceId: "framing", unitsPerDay: 1.0 }
];

// Add some constraints and deadlines to sample data for demonstration
export const wilsonHomeProjectWithConstraints: WbsTask[] = [
  {
    id: "1",
    name: "🏗️ Wilson Home Construction",
    startDate: "2025-03-01",
    endDate: "2025-08-01",
    progress: 25,
    deadline: "2025-07-31", // Project deadline
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
            durationDays: 5,
            constraintType: "SNET", // Start No Earlier Than
            constraintDate: "2025-03-01",
            optimistic: 3,
            mostLikely: 5,
            pessimistic: 8
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
            predecessors: [{taskId: "1.1.2", type: "FS"}],
            constraintType: "FNLT", // Finish No Later Than
            constraintDate: "2025-03-15"
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
            predecessors: [{taskId: "1.2.3", type: "FS"}],
            constraintType: "MFO", // Must Finish On
            constraintDate: "2025-04-15",
            deadline: "2025-04-15"
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
            predecessors: [{taskId: "1.3.1", type: "FS"}],
            constraintType: "SNLT", // Start No Later Than
            constraintDate: "2025-04-28"
          },
          {
            id: "1.3.3",
            name: "Roof Framing", 
            startDate: "2025-05-09",
            endDate: "2025-05-15",
            progress: 0,
            durationDays: 5,
            predecessors: [{taskId: "1.3.2", type: "FS"}],
            deadline: "2025-05-20" // Soft deadline
          }
        ]
      }
    ]
  }
];

// ============================================================================
// DHTMLX BUILDER COMPONENT
// ============================================================================

declare global {
  interface Window {
    gantt: any;
  }
}

// Zoom to fit utility
function zoomToFit(g:any) {
  const tasks = g.getTaskByTime(); // all visible
  if (!tasks || !tasks.length) return;
  const min = tasks.reduce((d:any,t:any)=> (t.start_date<d?t.start_date:d), tasks[0].start_date);
  const max = tasks.reduce((d:any,t:any)=> (t.end_date>d?t.end_date:d), tasks[0].end_date);
  // choose a scale based on span
  const spanDays = Math.ceil((+new Date(max) - +new Date(min)) / 86400000) + 1;
  if (spanDays <= 30) { 
    g.config.scale_unit = "day"; 
    g.config.date_scale = "%d %M";
    g.config.subscales=[{unit:"hour",step:24,date:""}]; 
  }
  else if (spanDays <= 180) { 
    g.config.scale_unit = "week"; 
    g.config.date_scale = "Week %W";
    g.config.subscales=[{unit:"day",step:1,date:"%d %M"}]; 
  }
  else { 
    g.config.scale_unit = "month"; 
    g.config.date_scale = "%M %Y";
    g.config.subscales=[{unit:"week",step:1,date:"Week %W"}]; 
  }
  g.render();
  g.showDate(min); // scroll left edge into view
}

export const DhtmlxBuilder: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<any>(null);
  const baselineLayerId = useRef<any>(null);
  const { tasks, links, setTasks, setLinks, setMetrics } = useGantt();

  // Expose gantt instance globally for zoom-to-fit
  useEffect(() => {
    if (ganttRef.current) {
      (window as any).ganttRef = ganttRef.current;
    }
  }, []);

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

        // Bar classes (reads showCritical, showCriticalChain via store)
        gantt.templates.task_class = (s:any,e:any,t:any) => {
          const st = useGantt.getState();
          if (gantt.hasChild(t.id)) return "task-summary";
          
          // Check if task is a buffer
          if (t.isBuffer) {
            return t.bufferType === 'feeding' ? "task-buffer feeding" : "task-buffer";
          }
          
          // Check if task is on critical chain
          if (st.showCriticalChain && st.criticalChainResult?.criticalChain.includes(t.id)) {
            return "task-chain";
          }
          
          // Check if task is on critical path
          if (st.showCritical && st.metrics?.criticalIds.has(t.id)) return "task-critical";
          
          return "task-normal";
        };

        // Free float gap indicator at bar right edge
        gantt.templates.rightside_text = (start:any, end:any, task:any) => {
          const st = useGantt.getState();
          const freeFloat = st.metrics?.freeFloat[task.id] ?? 0;
          if (freeFloat > 0 && !gantt.hasChild(task.id)) {
            return `<div class="free-float-gap" title="Free Float: ${freeFloat} days"></div>`;
          }
          return "";
        };

        // Left grid: WBS, Task, Start, End, Dur, %, TF, FF, Constraint, Deadline, Preds
        gantt.config.columns = [
          { name:"wbs", label:"WBS", width:60, align:"right", template:(t:any)=>wbsOf(gantt, t.id) },
          { name:"text", label:"Task Name", tree:true, width:180 },
          { name:"start_date", label:"Start Date", width:90 },
          { name:"end_date",   label:"End Date",   width:90 },
          { name:"duration",   label:"Dur", width:45 },
          { name:"progress",   label:"%", width:40, template:(t:any)=>Math.round((t.progress||0)*100)+"%" },
          { name:"total_float", label:"TF", width:35, template:(t:any)=>{
            const metrics = useGantt.getState().metrics;
            const tf = metrics?.slackDays[t.id] ?? 0;
            return tf < 0 ? `<span style="color:red">${tf}</span>` : tf;
          }},
          { name:"free_float", label:"FF", width:35, template:(t:any)=>{
            const metrics = useGantt.getState().metrics;
            return metrics?.freeFloat[t.id] ?? 0;
          }},
          { name:"constraint", label:"Constraint", width:80, template:(t:any)=>{
            const task = useGantt.getState().tasks.flatMap(function collect(task): WbsTask[] {
              return [task, ...(task.children?.flatMap(collect) ?? [])];
            }).find(task => task.id === t.id);
            if (task?.constraintType && task?.constraintDate) {
              return `${task.constraintType} ${task.constraintDate}`;
            }
            return "";
          }},
          { name:"deadline", label:"Deadline", width:80, template:(t:any)=>{
            const task = useGantt.getState().tasks.flatMap(function collect(task): WbsTask[] {
              return [task, ...(task.children?.flatMap(collect) ?? [])];
            }).find(task => task.id === t.id);
            return task?.deadline ? `<span style="color:orange">${task.deadline}</span>` : "";
          }},
          { name:"predecessors", label:"Predecessors", width:120, template:(t:any)=>{
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
            const d = date instanceof Date ? date.getDay() : new Date(date).getDay();
            return (d===0||d===6) ? "weekend" : "";
          };
          gantt.templates.timeline_cell_class = gantt.templates.scale_cell_class;
        };
        setWeekendTint(useGantt.getState().showWeekends);

        // Today marker
        if (gantt.addMarker) {
          gantt.addMarker({ start_date: new Date(), css:"today-marker", text:"", title:"Today" });
        }

        // Respect non-working time in layout
        gantt.config.work_time = true;
        gantt.setWorkTime({ day: 0, hours: false }); // Sunday non-working
        gantt.setWorkTime({ day: 6, hours: false }); // Saturday non-working

        // Layout with splitter (grid | resizer | timeline)
        gantt.config.layout = {
          css: "gantt_container",
          rows: [
            {
              cols: [
                { view: "grid", id: "grid", scrollX: "scrollHor", scrollY: "scrollVer",
                  width: useGantt.getState().gridWidth, min_width: 160 },
                { resizer: true, width: 6, css: "gantt_resizer_wide" },
                { view: "timeline", id: "timeline", scrollX: "scrollHor", scrollY: "scrollVer" },
                { view: "scrollbar", id: "scrollVer" }
              ]
            },
            { view: "scrollbar", id: "scrollHor", height: 20 }
          ]
        };

        if (containerRef.current) {
          gantt.init(containerRef.current);
          ganttRef.current = gantt;
        }

        // Capture resize events for persistence
        gantt.attachEvent("onGridResizeEnd", (_oldW:number, newW:number) => {
          useGantt.getState().setGridWidth(newW);
        });

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

        // Open custom Link Editor on link double-click
        gantt.attachEvent("onLinkDblClick", (id:any) => {
          const l = gantt.getLink(id);
          useGantt.getState().openLinkEditor({
            id: String(l.id),
            sourceId: String(l.source),
            targetId: String(l.target),
            type: TYPE_MAP_FROM_DHX[String(l.type)],
            lagDays: Number(l.lag || 0)
          });
          return false; // prevent any default editor
        });

        if (tasks.length > 0 || links.length > 0) {
          const dhtmlxData = toDhtmlx(tasks, links);
          gantt.parse({ data: dhtmlxData.data, links: dhtmlxData.links });
          gantt.render();
        }
      }
    });
  }, []);

  // Respond to grid width changes
  useEffect(() => {
    const g = ganttRef.current; 
    if (!g) return;
    g.config.grid_width = useGantt.getState().gridWidth;
    if (g.setSizes) g.setSizes();
    g.render();
  }, [useGantt(s => s.gridWidth)]);

  // Sync data when external state changes
  useEffect(() => {
    if (ganttRef.current && tasks.length > 0) {
      // Keep expand/collapse state on refresh
      const openMap: Record<string, boolean> = {};
      ganttRef.current.eachTask((t:any) => { openMap[t.id] = !!t.$open; });

      const dhtmlxData = toDhtmlx(tasks, links);
      ganttRef.current.clearAll();
      ganttRef.current.parse({ data: dhtmlxData.data, links: dhtmlxData.links });
      
      // Restore open state
      ganttRef.current.eachTask((t:any) => {
        if (openMap[t.id] !== undefined) ganttRef.current.open(t.id, openMap[t.id]);
      });
      
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
      const d = date instanceof Date ? date.getDay() : new Date(date).getDay();
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
      if (!baselineLayerId.current && g.addTaskLayer) {
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
    else if (baselineLayerId.current && g.removeTaskLayer) { g.removeTaskLayer(baselineLayerId.current); baselineLayerId.current = null; }
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
// UI HELPER COMPONENTS
// ============================================================================

const Segmented: React.FC<{
  value: string; options: string[]; onChange: (v:string)=>void; label?: string;
}> = ({ value, options, onChange, label }) => (
  <div className="flex items-center gap-2">
    {label && <span className="text-xs font-medium text-slate-600">{label}</span>}
    <div className="inline-flex rounded-lg border border-slate-200 bg-white">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={[
            "px-3 py-1 text-xs font-medium rounded-lg",
            value === opt ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
          ].join(" ")}
        >
          {opt}
        </button>
      ))}
    </div>
  </div>
);

const ChipToggle: React.FC<{
  active: boolean; onClick: ()=>void; children: React.ReactNode; title?: string;
}> = ({ active, onClick, children, title }) => (
  <button
    title={title}
    onClick={onClick}
    className={[
      "px-3 py-1 text-xs font-medium rounded-full border",
      active
        ? "bg-slate-800 text-white border-slate-800"
        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
    ].join(" ")}
  >
    {children}
  </button>
);

const Menu: React.FC<{label: string, children: React.ReactNode}> = ({ label, children }) => (
  <details className="relative">
    <summary className="list-none select-none cursor-pointer px-3 py-1 text-xs font-medium rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
      {label}
    </summary>
    <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg p-1 z-10">
      {children}
    </div>
  </details>
);

const MenuItem: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className="", ...props }) => (
  <button
    {...props}
    className={"w-full text-left px-3 py-2 text-sm rounded hover:bg-slate-50 " + className}
  >
    {children}
  </button>
);

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
    showResourceLeveling,
    toggleResourceLeveling,
    showSimulationModal,
    setShowSimulationModal,
    engine,
    toggleEngine,
    runAutoSchedule,
    captureBaseline 
  } = useGantt();

  useEffect(() => {
    // Load sample data on mount with constraints and deadlines
    setTasks(wilsonHomeProjectWithConstraints);
    setLinks(wilsonHomeLinks);
    
    // Load sample resources and assignments
    useGantt.setState({ 
      resources: wilsonHomeResources,
      assignments: wilsonHomeAssignments 
    });
    
    // Load persisted scenarios
    try {
      const savedScenarios = localStorage.getItem('buildtracker-scenarios');
      if (savedScenarios) {
        const raw: Scenario[] = JSON.parse(savedScenarios);
        const scenarios = raw.map(s => ({ ...s, metrics: deserializeMetrics(s.metrics) }));
        useGantt.setState({ scenarios });
      }
    } catch (e) {
      console.warn('Failed to load scenarios from localStorage:', e);
    }
    
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
        {/* Warnings Display */}
        {useGantt(state => state.metrics?.warnings.length) ? (
          <div className="mt-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-md">
            <div className="text-sm font-medium text-yellow-800 mb-1">⚠️ Scheduling Warnings:</div>
            <div className="text-xs text-yellow-700 space-y-1">
              {useGantt(state => state.metrics?.warnings.map((warning, i) => (
                <div key={i}>{warning}</div>
              )))}
            </div>
          </div>
        ) : null}
        
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Section: Zoom & View */}
          <Segmented
            label="Zoom"
            value={zoom}
            options={["Day","Week","Month"]}
            onChange={setZoom}
          />

          <div className="h-6 w-px bg-slate-200" />

          <ChipToggle active={showWeekends} onClick={toggleWeekends} title="Show/Hide weekends">
            Weekends
          </ChipToggle>
          <ChipToggle active={showCritical} onClick={toggleCritical} title="Toggle critical path">
            Critical Path
          </ChipToggle>
          <ChipToggle active={showBaseline} onClick={toggleBaseline} title="Toggle baseline overlay">
            Baseline
          </ChipToggle>
          <ChipToggle
            active={showResourceLeveling}
            onClick={toggleResourceLeveling}
            title="Enable resource leveling"
          >
            Leveling
          </ChipToggle>

          <div className="h-6 w-px bg-slate-200" />

          {/* Section: Primary actions */}
          <button
            onClick={runAutoSchedule}
            className="px-3 py-1 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700"
            title="Run auto-scheduling"
          >
            Auto Schedule
          </button>
          <button
            onClick={useGantt(state => state.runDryRunSchedule)}
            className="px-3 py-1 text-xs font-medium rounded bg-cyan-600 text-white hover:bg-cyan-700"
            title="Preview changes without applying"
          >
            Preview Changes
          </button>
          <button
            onClick={captureBaseline}
            className="px-3 py-1 text-xs font-medium rounded bg-emerald-100 text-emerald-700 border border-emerald-200"
            title="Save current dates to baseline"
          >
            Capture Baseline
          </button>

          <div className="h-6 w-px bg-slate-200" />

          {/* Section: Menus to declutter */}
          <Menu label="Analysis">
            <MenuItem onClick={useGantt(state => state.runSimulation)}>🎲 Monte Carlo Risk Analysis</MenuItem>
            <MenuItem onClick={useGantt(state => state.buildCriticalChainSchedule)}>⛓️ Critical Chain + Buffers</MenuItem>
            <MenuItem onClick={useGantt(state => state.toggleBufferChart)}>📊 Buffer Chart</MenuItem>
          </Menu>

          <Menu label="Scenarios">
            <MenuItem onClick={useGantt(state => state.toggleScenarioManager)}>🔀 Scenario Manager</MenuItem>
            <MenuItem onClick={useGantt(state => state.toggleChangeLog)}>📝 Change Log</MenuItem>
          </Menu>

          <div className="h-6 w-px bg-slate-200" />

          {/* Section: View mode & utility */}
          <button
            onClick={toggleEngine}
            className="px-3 py-1 text-xs font-medium rounded bg-purple-600 text-white hover:bg-purple-700"
            title="Switch between Builder Mode and Client View"
          >
            {engine === 'dhtmlx' ? 'Switch to Client View' : 'Switch to Builder Mode'}
          </button>

          <button
            onClick={() => engine === 'dhtmlx' && (window as any).ganttRef && zoomToFit((window as any).ganttRef)}
            className="px-3 py-1 text-xs font-medium rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            disabled={engine !== 'dhtmlx'}
            title="Fit timeline to content"
          >
            Zoom to Fit
          </button>
        </div>
      </div>

      {/* Gantt Chart Container */}
      <div className="flex-1 relative">
        {engine === 'dhtmlx' && <DhtmlxBuilder />}
        {engine === 'frappe' && <FrappeViewer />}
      </div>
      
      {/* Monte Carlo Simulation Modal */}
      {showSimulationModal && <MonteCarloModal />}
      
      {/* Link Editor */}
      <LinkEditorModal />
      
      {/* Buffer Fever Chart */}
      {useGantt(state => state.showBufferChart) && <BufferFeverChart />}
      
      {/* Scenario Manager */}
      {useGantt(state => state.showScenarioManager) && <ScenarioManager />}
      
      {/* Scenario Comparison */}
      {useGantt(state => state.showScenarioComparison) && <ScenarioComparisonModal />}
      
      {/* Schedule Preview Modal */}
      {useGantt(state => state.showSchedulePreview) && <SchedulePreviewModal />}
      
      {/* Change Log */}
      {useGantt(state => state.showChangeLog) && <ChangeLogModal />}

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
        
        /* Enhanced progress bars */
        .gantt_task_progress { opacity: .9; }
        .task-normal .gantt_task_progress { background:#0ea5b7; }
        .task-summary .gantt_task_progress { background:#22c55e; }
        .task-critical .gantt_task_progress { background:#ef4444; }

        /* Thin baseline */
        .baseline { position:absolute; height:4px; background:#11182722; border-radius:2px; }

        /* Compact grid */
        .gantt_grid_head_cell, .gantt_cell { font-size:12px; }

        /* Free float gap indicator */
        .free-float-gap {
          position: absolute;
          right: -8px;
          top: 50%;
          transform: translateY(-50%);
          width: 6px;
          height: 6px;
          background: #22c55e;
          border-radius: 50%;
          border: 1px solid white;
          opacity: 0.8;
          cursor: help;
        }
        .gantt_task_line .free-float-gap {
          background: #0ea5b7;
        }
        .task-critical .free-float-gap {
          background: #ef4444;
        }
        
        /* Critical Chain styling */
        .task-chain {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
          border: 1px solid #92400e;
        }
        
        /* Buffer task styling */
        .task-buffer {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
          border: 1px solid #047857;
          opacity: 0.8;
        }
        .task-buffer.feeding {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
          border: 1px solid #1d4ed8;
        }

        /* Wider, visible splitter handle */
        .gantt_resizer_wide,
        .gantt_layout_resizer {
          width: 6px !important;
          background: #cbd5e1;       /* slate-300 */
          cursor: col-resize;
        }
        .gantt_layout_resizer:hover { background: #94a3b8; } /* slate-400 */
        `
      }} />
    </div>
  );
};

// ============================================================================
// BUFFER FEVER CHART COMPONENT
// ============================================================================

const BufferFeverChart = () => {
  const { criticalChainResult, setShowSimulationModal } = useGantt();

  if (!criticalChainResult) return null;

  const { projectBuffer, feedingBuffers } = criticalChainResult;
  const allBuffers = [projectBuffer, ...feedingBuffers];

  const getBufferColor = (burn: number) => {
    if (burn < 33) return 'bg-green-500';
    if (burn < 67) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getBufferStatus = (burn: number) => {
    if (burn < 33) return '🟢 Healthy';
    if (burn < 67) return '🟡 Warning';
    return '🔴 Critical';
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-xl p-4 w-80 border border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-800">📊 Buffer Fever Chart</h3>
        <button
          onClick={() => useGantt.setState({ showBufferChart: false })}
          className="text-slate-400 hover:text-slate-600 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="space-y-3">
        {allBuffers.map((buffer) => {
          if (!buffer.bufferBurn) return null;
          
          return (
            <div key={buffer.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 truncate" title={buffer.name}>
                  {buffer.name}
                </span>
                <span className="text-xs text-slate-500">
                  {Math.round(buffer.bufferBurn)}%
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${getBufferColor(buffer.bufferBurn)}`}
                    style={{ width: `${Math.min(100, buffer.bufferBurn)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-slate-600">
                  {getBufferStatus(buffer.bufferBurn).split(' ')[1]}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-200">
        <div className="text-xs text-slate-600 space-y-1">
          <div><span className="text-green-500">●</span> Green: 0-33% (Healthy buffer)</div>
          <div><span className="text-yellow-500">●</span> Yellow: 34-66% (Monitor closely)</div>
          <div><span className="text-red-500">●</span> Red: 67%+ (Take action)</div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MONTE CARLO RESULTS MODAL
// ============================================================================

const MonteCarloModal = () => {
  const { simulationResult, setShowSimulationModal } = useGantt();

  if (!simulationResult) return null;

  const { percentiles, criticalityIndex, scenarios } = simulationResult;

  // Get top critical tasks (>20% criticality)
  const criticalTasks = Object.entries(criticalityIndex)
    .filter(([_, criticality]) => criticality > 20)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800">🎲 Monte Carlo Risk Analysis</h2>
          <button
            onClick={() => setShowSimulationModal(false)}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* Project Finish Dates */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-3">📅 Project Finish Probabilities</h3>
            <div className="text-sm text-blue-700">
              <p className="mb-1">Based on <strong>{scenarios.toLocaleString()}</strong> simulated scenarios:</p>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{percentiles.P50}</div>
                <div className="text-xs text-slate-600">P50 (50% confidence)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{percentiles.P80}</div>
                <div className="text-xs text-slate-600">P80 (80% confidence)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{percentiles.P90}</div>
                <div className="text-xs text-slate-600">P90 (90% confidence)</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-blue-600">
              <strong>Client-ready summary:</strong> "We have 80% confidence the project will complete by {percentiles.P80}"
            </div>
          </div>

          {/* Criticality Index */}
          {criticalTasks.length > 0 && (
            <div className="bg-red-50 rounded-lg p-4">
              <h3 className="font-semibold text-red-800 mb-3">⚠️ High-Risk Tasks (Criticality Index)</h3>
              <div className="text-sm text-red-700 mb-3">
                Tasks most likely to become critical and delay the project:
              </div>
              <div className="space-y-2">
                {criticalTasks.map(([taskId, criticality]) => {
                  // Find task name
                  const allTasks = useGantt(state => 
                    state.tasks.flatMap(function collect(t): WbsTask[] {
                      return [t, ...(t.children?.flatMap(collect) ?? [])];
                    })
                  );
                  const task = allTasks.find(t => t.id === taskId);
                  const taskName = task?.name || taskId;
                  
                  return (
                    <div key={taskId} className="flex items-center justify-between py-1">
                      <span className="text-sm font-medium text-red-800">{taskName}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-red-200 rounded-full h-2">
                          <div 
                            className="bg-red-600 h-2 rounded-full"
                            style={{ width: `${criticality}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-red-700 w-8">{criticality}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-xs text-red-600">
                Focus risk mitigation efforts on these high-criticality tasks.
              </div>
            </div>
          )}

          {/* Risk Interpretation */}
          <div className="bg-yellow-50 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-800 mb-2">💡 Risk Interpretation</h3>
            <div className="text-sm text-yellow-700 space-y-1">
              <p><strong>P50 Date:</strong> Best-case realistic finish (50% chance)</p>
              <p><strong>P80 Date:</strong> Conservative finish with buffer (80% chance)</p>
              <p><strong>P90 Date:</strong> Worst-case planning finish (90% chance)</p>
              <p><strong>Criticality %:</strong> How often a task becomes critical across scenarios</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={() => setShowSimulationModal(false)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SCENARIO MANAGER COMPONENT
// ============================================================================

const ScenarioManager = () => {
  const { scenarios, currentScenario, branchScenario, loadScenario, compareScenarios, toggleScenarioManager } = useGantt();
  const [newScenarioName, setNewScenarioName] = useState('');
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);

  const handleBranchScenario = () => {
    if (newScenarioName.trim()) {
      branchScenario(newScenarioName.trim());
      setNewScenarioName('');
    }
  };

  const handleCompareScenarios = () => {
    if (selectedScenarios.length === 2) {
      compareScenarios(selectedScenarios[0], selectedScenarios[1]);
    }
  };

  const toggleScenarioSelection = (scenarioId: string) => {
    setSelectedScenarios(prev => {
      if (prev.includes(scenarioId)) {
        return prev.filter(id => id !== scenarioId);
      } else if (prev.length < 2) {
        return [...prev, scenarioId];
      } else {
        return [prev[1], scenarioId]; // Replace first selection
      }
    });
  };

  return (
    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-96 max-h-[80vh] overflow-y-auto z-50">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-800">🔀 Scenario Manager</h2>
        <button
          onClick={toggleScenarioManager}
          className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
        >
          ×
        </button>
      </div>

      <div className="space-y-6">
        {/* Current Scenario */}
        {currentScenario && (
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">📍 Current Scenario</h3>
            <div className="text-sm text-blue-700">
              <div className="font-medium">{currentScenario.name}</div>
              <div className="text-xs text-blue-600 mt-1">
                Created: {new Date(currentScenario.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        )}

        {/* Branch New Scenario */}
        <div className="bg-green-50 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 mb-3">🌟 Branch from Current</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              placeholder="Enter scenario name..."
              className="flex-1 px-3 py-1.5 text-sm border border-green-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              onKeyPress={(e) => e.key === 'Enter' && handleBranchScenario()}
            />
            <button
              onClick={handleBranchScenario}
              disabled={!newScenarioName.trim()}
              className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Branch
            </button>
          </div>
          <div className="text-xs text-green-600 mt-2">
            Creates a new scenario from your current schedule for safe what-if analysis
          </div>
        </div>

        {/* Saved Scenarios */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">📋 Saved Scenarios</h3>
            {selectedScenarios.length === 2 && (
              <button
                onClick={handleCompareScenarios}
                className="px-3 py-1 text-xs font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700"
              >
                Compare Selected
              </button>
            )}
          </div>
          
          {scenarios.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">
              No scenarios saved yet. Branch from current to create your first scenario.
            </div>
          ) : (
            <div className="space-y-2">
              {scenarios.map((scenario) => (
                <div 
                  key={scenario.id}
                  className={`border rounded-lg p-3 cursor-pointer transition-all ${
                    selectedScenarios.includes(scenario.id)
                      ? 'border-orange-300 bg-orange-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  onClick={() => toggleScenarioSelection(scenario.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-slate-800">{scenario.name}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(scenario.createdAt).toLocaleDateString()} • 
                        {scenario.tasks.flatMap(function collect(t): WbsTask[] {
                          return [t, ...(t.children?.flatMap(collect) ?? [])];
                        }).filter(t => !t.children?.length).length} tasks
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {selectedScenarios.includes(scenario.id) && (
                        <span className="text-orange-500 text-sm">✓</span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          loadScenario(scenario);
                        }}
                        className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 rounded"
                      >
                        Load
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
          <div className="font-medium mb-1">💡 How to use scenarios:</div>
          <ul className="space-y-1">
            <li>• <strong>Branch:</strong> Create a copy of current schedule for experiments</li>
            <li>• <strong>Load:</strong> Switch to a different scenario</li>
            <li>• <strong>Compare:</strong> Select 2 scenarios to see differences</li>
            <li>• <strong>Auto-save:</strong> Last 3 scenarios are kept automatically</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SCENARIO COMPARISON COMPONENT
// ============================================================================

const ScenarioComparisonModal = () => {
  const { scenarioComparison, setShowScenarioComparison } = useGantt();

  if (!scenarioComparison) return null;

  const { scenario1, scenario2, taskChanges, projectFinishDiff, criticalPathChanges } = scenarioComparison;

  const formatDateDiff = (days: number): string => {
    if (days === 0) return 'No change';
    const sign = days > 0 ? '+' : '';
    return `${sign}${days} days`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800">🔍 Scenario Comparison</h2>
          <button
            onClick={() => setShowScenarioComparison(false)}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* Scenario Headers */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800">📋 {scenario1.name}</h3>
              <div className="text-sm text-blue-600">
                Created: {new Date(scenario1.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <h3 className="font-semibold text-green-800">📋 {scenario2.name}</h3>
              <div className="text-sm text-green-600">
                Created: {new Date(scenario2.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Project Summary */}
          <div className="bg-yellow-50 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-800 mb-3">📊 Project Summary</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium text-yellow-700">Project Finish Difference:</div>
                <div className={`text-lg font-bold ${
                  projectFinishDiff > 0 ? 'text-red-600' : 
                  projectFinishDiff < 0 ? 'text-green-600' : 'text-slate-600'
                }`}>
                  {formatDateDiff(projectFinishDiff)}
                </div>
              </div>
              <div>
                <div className="font-medium text-yellow-700">Critical Path Changes:</div>
                <div className="text-sm">
                  <div className="text-green-600">+{criticalPathChanges.added.length} new critical</div>
                  <div className="text-red-600">-{criticalPathChanges.removed.length} no longer critical</div>
                </div>
              </div>
            </div>
          </div>

          {/* Task Changes */}
          {taskChanges.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 mb-3">📝 Task Changes ({taskChanges.length})</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {taskChanges.map((change) => (
                  <div key={change.id} className="bg-white rounded border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-slate-800 flex-1">{change.name}</div>
                      {change.criticalityChange !== 'unchanged' && (
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          change.criticalityChange === 'added'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {change.criticalityChange === 'added' ? 'Now Critical' : 'No Longer Critical'}
                        </span>
                      )}
                    </div>
                    
                    <div className="mt-2 grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <div className="text-slate-500">Start Date:</div>
                        <div className={
                          change.startDateDiff > 0 ? 'text-red-600' :
                          change.startDateDiff < 0 ? 'text-green-600' : 'text-slate-600'
                        }>
                          {formatDateDiff(change.startDateDiff)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">End Date:</div>
                        <div className={
                          change.endDateDiff > 0 ? 'text-red-600' :
                          change.endDateDiff < 0 ? 'text-green-600' : 'text-slate-600'
                        }>
                          {formatDateDiff(change.endDateDiff)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Duration:</div>
                        <div className={
                          change.durationDiff > 0 ? 'text-red-600' :
                          change.durationDiff < 0 ? 'text-green-600' : 'text-slate-600'
                        }>
                          {change.durationDiff === 0 ? 'No change' : `${change.durationDiff > 0 ? '+' : ''}${change.durationDiff} days`}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {taskChanges.length === 0 && (
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-green-800 font-medium">✅ No Significant Changes</div>
              <div className="text-green-600 text-sm mt-1">
                These scenarios have identical task schedules and critical paths.
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={() => setShowScenarioComparison(false)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SCHEDULE PREVIEW MODAL
// ============================================================================

const SchedulePreviewModal = () => {
  const { schedulePreview, applySchedulePreview, rejectSchedulePreview } = useGantt();

  if (!schedulePreview) return null;

  const { changes, warnings } = schedulePreview;
  
  const hasSignificantChanges = changes.length > 0;
  const totalDaysMoved = changes.reduce((sum, change) => {
    if (change.before.startDate && change.after.startDate) {
      const daysDiff = workingDiff(parseISO(change.before.startDate), parseISO(change.after.startDate), []);
      return sum + Math.abs(daysDiff);
    }
    return sum;
  }, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">👁️ Schedule Preview</h2>
            <p className="text-sm text-slate-600 mt-1">
              Review changes before applying to your schedule
            </p>
          </div>
          <button
            onClick={rejectSchedulePreview}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Summary */}
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-800 mb-2">📊 Change Summary</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-blue-600">Tasks Affected:</div>
              <div className="font-bold text-blue-800">{changes.length}</div>
            </div>
            <div>
              <div className="text-blue-600">Total Days Moved:</div>
              <div className="font-bold text-blue-800">{totalDaysMoved}</div>
            </div>
            <div>
              <div className="text-blue-600">Warnings:</div>
              <div className={`font-bold ${warnings.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {warnings.length}
              </div>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Scheduling Warnings</h3>
            <div className="space-y-1">
              {warnings.map((warning, index) => (
                <div key={index} className="text-sm text-yellow-700">
                  • {warning}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Changes */}
        {hasSignificantChanges ? (
          <div className="bg-slate-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-slate-800 mb-3">📝 Proposed Changes</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {changes.map((change) => (
                <div key={change.id} className="bg-white rounded border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-800 flex-1">{change.taskName}</div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      change.changeType === 'resource_leveled' 
                        ? 'bg-orange-100 text-orange-700'
                        : change.changeType === 'constraint_applied'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {change.changeType.replace('_', ' ')}
                    </span>
                  </div>
                  
                  <div className="mt-2 text-sm text-slate-600">
                    <div className="font-medium">{change.reason}</div>
                    {change.before.startDate && change.after.startDate && (
                      <div className="mt-1 text-xs">
                        <span className="text-red-600">From: {change.before.startDate}</span>
                        <span className="mx-2">→</span>
                        <span className="text-green-600">To: {change.after.startDate}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-green-50 rounded-lg p-4 mb-6 text-center">
            <div className="text-green-800 font-medium">✅ No Changes Required</div>
            <div className="text-green-600 text-sm mt-1">
              Your current schedule is already optimal.
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={rejectSchedulePreview}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
          >
            Cancel
          </button>
          {hasSignificantChanges && (
            <button
              onClick={applySchedulePreview}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Apply Changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// LINK EDITOR MODAL
// ============================================================================

const LinkEditorModal: React.FC = () => {
  const { showLinkEditor, editingLink, closeLinkEditor, links, setLinks, runAutoSchedule, tasks } = useGantt();
  const [draft, setDraft] = useState<Link | null>(null);

  useEffect(() => { if (editingLink) setDraft({ ...editingLink }); }, [editingLink]);
  if (!showLinkEditor || !draft) return null;

  const reverseType = (t: Link['type']): Link['type'] =>
    t === 'FS' ? 'SF' : t === 'SF' ? 'FS' : t; // SS, FF are symmetric

  const flatten = (ns: WbsTask[]): WbsTask[] =>
    ns.flatMap(n => [n, ...(n.children ? flatten(n.children) : [])]);
  const allTasks = flatten(tasks);
  const label = (id: string) => allTasks.find(t => t.id === id)?.name ?? id;

  const save = () => {
    const idKey = (l: Link) => l.id ?? `${l.sourceId}->${l.targetId}`;
    const currentKey = idKey(editingLink!);

    const updated = links.map(l => idKey(l) === currentKey ? { ...l, ...draft } : l);
    setLinks(updated);
    runAutoSchedule();
    closeLinkEditor();
  };

  const del = () => {
    const idKey = (l: Link) => l.id ?? `${l.sourceId}->${l.targetId}`;
    const currentKey = idKey(editingLink!);
    setLinks(links.filter(l => idKey(l) !== currentKey));
    runAutoSchedule();
    closeLinkEditor();
  };

  const switchDirection = () => {
    setDraft(d => {
      if (!d) return d;
      return {
        ...d,
        sourceId: d.targetId,
        targetId: d.sourceId,
        type: reverseType(d.type),
      };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl p-5 w-[420px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-slate-800">🔗 Edit Dependency</h3>
          <button onClick={closeLinkEditor} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div className="text-sm">
            <div className="text-slate-500 mb-1">Tasks</div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-slate-100 text-slate-700">{label(draft.sourceId)}</span>
              <span className="text-slate-400">→</span>
              <span className="px-2 py-1 rounded bg-slate-100 text-slate-700">{label(draft.targetId)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <div className="text-slate-500 mb-1">Type</div>
              <select
                value={draft.type}
                onChange={e => setDraft({ ...draft, type: e.target.value as Link['type'] })}
                className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
              >
                {(['FS','SS','FF','SF'] as const).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label className="text-sm">
              <div className="text-slate-500 mb-1">Lag (days)</div>
              <input
                type="number"
                value={draft.lagDays ?? 0}
                onChange={e => setDraft({ ...draft, lagDays: Number(e.target.value) })}
                className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
              />
            </label>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={switchDirection}
              className="px-3 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              title="Swap source and target"
            >
              ⇄ Switch Direction
            </button>

            <button
              onClick={del}
              className="px-3 py-1 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700"
              title="Delete this dependency"
            >
              Delete
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={closeLinkEditor}
              className="px-3 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="px-3 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// CHANGE LOG MODAL  
// ============================================================================

const ChangeLogModal = () => {
  const { changeLog, showChangeLog, toggleChangeLog } = useGantt();

  if (!showChangeLog) return null;

  const groupedChanges = changeLog.reduce((groups, change) => {
    const date = change.timestamp.split('T')[0];
    if (!groups[date]) groups[date] = [];
    groups[date].push(change);
    return groups;
  }, {} as Record<string, ScheduleChange[]>);

  const sortedDates = Object.keys(groupedChanges).sort((a, b) => b.localeCompare(a));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">📝 Schedule Change Log</h2>
            <p className="text-sm text-slate-600 mt-1">
              Complete history of all scheduling modifications
            </p>
          </div>
          <button
            onClick={toggleChangeLog}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {changeLog.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-slate-400 text-6xl mb-4">📋</div>
            <div className="text-slate-600 font-medium">No Changes Yet</div>
            <div className="text-slate-500 text-sm mt-1">
              Schedule modifications will appear here automatically
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedDates.map((date) => (
              <div key={date} className="border-b border-slate-200 last:border-b-0 pb-4">
                <h3 className="font-semibold text-slate-800 mb-3">
                  📅 {new Date(date).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </h3>
                
                <div className="space-y-2">
                  {groupedChanges[date]
                    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                    .map((change) => (
                    <div key={change.id} className="bg-slate-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-slate-800">{change.taskName}</div>
                          <div className="text-sm text-slate-600 mt-1">{change.reason}</div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            change.changeType === 'resource_leveled' 
                              ? 'bg-orange-100 text-orange-700'
                              : change.changeType === 'constraint_applied'
                              ? 'bg-red-100 text-red-700'
                              : change.changeType === 'link_relaxed'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {change.changeType.replace('_', ' ')}
                          </span>
                          
                          <div className="text-xs text-slate-500">
                            {new Date(change.timestamp).toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        </div>
                      </div>
                      
                      {change.before.startDate && change.after.startDate && (
                        <div className="mt-2 text-xs">
                          <span className="text-red-600">Before: {change.before.startDate}</span>
                          <span className="mx-2 text-slate-400">→</span>
                          <span className="text-green-600">After: {change.after.startDate}</span>
                          {change.user !== 'System' && (
                            <span className="ml-3 text-slate-500">by {change.user}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-between items-center">
          <div className="text-xs text-slate-500">
            Showing last {Math.min(changeLog.length, 50)} changes
          </div>
          <button
            onClick={toggleChangeLog}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-600 rounded-md hover:bg-slate-700"
          >
            Close Log
          </button>
        </div>
      </div>
    </div>
  );
};

export default BuildTrackerPro;