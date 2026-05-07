import { parseISO, format } from "date-fns";
import type { WbsTask, Link, Metrics, ScheduleOptions } from "../types";
import { addWorkingDays, workingDiff } from "./calendar";

type Id = string;

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function flatten(root: WbsTask[]): { list: WbsTask[]; map: Map<Id, WbsTask> } {
  const list: WbsTask[] = [];
  const map = new Map<Id, WbsTask>();
  const walk = (nodes: WbsTask[]) => nodes.forEach(t => { list.push(t); map.set(t.id, t); t.children && walk(t.children); });
  walk(root);
  return { list, map };
}

function isLeaf(t: WbsTask) { return !t.children || t.children.length === 0; }

function buildGraph(tasks: WbsTask[], links: Link[]) {
  const succ = new Map<Id, Link[]>();  // outgoing by source
  const pred = new Map<Id, Link[]>();  // incoming by target
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

// Link math → candidate ES for successor given predecessor times & succ duration
function constraintES(link: Link, predES: Date, predEF: Date, succDur: number, holidays: Set<string>): Date {
  const lag = link.lagDays ?? 0;
  switch (link.type) {
    case "FS": // S.ES ≥ P.EF + lag + 1d (inclusive bars)
      return addWorkingDays(predEF, lag + 1, holidays);
    case "SS": // S.ES ≥ P.ES + lag
      return addWorkingDays(predES, lag, holidays);
    case "FF": // S.EF ≥ P.EF + lag  → ES ≥ P.EF + lag - (dur-1)
      return addWorkingDays(predEF, lag - (succDur - 1), holidays);
    case "SF": // S.EF ≥ P.ES + lag  → ES ≥ P.ES + lag - (dur-1)
      return addWorkingDays(predES, lag - (succDur - 1), holidays);
    default:
      return addWorkingDays(predEF, lag + 1, holidays);
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

  // Build graph
  const { succ, pred } = buildGraph(list, links);
  // Kahn but we also need succ; make a copy with succ degrees
  const indeg = new Map<Id, number>();
  list.forEach(t => indeg.set(t.id, pred.get(t.id)?.length ?? 0));
  const queue: Id[] = [];
  indeg.forEach((d, id) => { if (d === 0) queue.push(id); });

  // Metrics
  const ES: Record<Id, string> = {};
  const EF: Record<Id, string> = {};
  const LS: Record<Id, string> = {};
  const LF: Record<Id, string> = {};
  const warnings: string[] = [];

  const projectStartISO =
    options.projectStart ||
    list.reduce((m, t) => (t.startDate < m ? t.startDate : m), list[0]?.startDate ?? toISO(new Date()));
  const projectStart = parseISO(projectStartISO);

  // ---- Forward pass (leafs & summaries updated later) ----
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
    if (!isLeaf(t)) continue; // schedule leaves; summaries roll up later

    if (options.respectLocked && t.locked) {
      ES[id] = t.startDate;
      EF[id] = t.endDate;
      continue;
    }

    let es = projectStart;
    // SNET constraint
    if (t.notEarlierThan) {
      const c = parseISO(t.notEarlierThan);
      if (c > es) es = c;
    }
    const dur = durDays(t, holidays);

    // predecessors
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

  // ---- Roll-up summaries ----
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

  // ---- Backward pass ----
  // project finish = max(EF) among leaf tasks
  let projFinish = parseISO(leafIds.map(id => EF[id] ?? map.get(id)!.endDate)
                               .reduce((m, d) => (d > m ? d : m)));
  // init LF/LS for leaves to their EF/ES from forward pass (upper bound)
  for (const id of forwardOrder.slice().reverse()) {
    const t = map.get(id)!;
    const dur = durDays(t, holidays);
    if (!isLeaf(t)) continue;

    // If there are successors, compute tightest LF from their ES/EF based on link type
    let lf = projFinish;
    let constrained = false;
    for (const l of (succ.get(id) ?? [])) {
      const s = map.get(l.targetId)!;
      const sES = parseISO(ES[s.id] ?? s.startDate);
      const sEF = parseISO(EF[s.id] ?? s.endDate);
      let candLF: Date;
      const lag = l.lagDays ?? 0;
      switch (l.type) {
        case "FS": // S.ES ≥ T.EF + lag → T.LF ≤ S.ES - lag
          candLF = addWorkingDays(sES, -lag, holidays);
          break;
        case "SS": // S.ES ≥ T.ES + lag → T.LS ≤ S.ES - lag → T.LF ≤ (T.LS + dur-1)
          const candLS_ss = addWorkingDays(sES, -lag, holidays);
          candLF = addWorkingDays(candLS_ss, (dur - 1), holidays);
          break;
        case "FF": // S.EF ≥ T.EF + lag → T.LF ≤ S.EF - lag
          candLF = addWorkingDays(sEF, -lag, holidays);
          break;
        case "SF": // S.EF ≥ T.ES + lag → T.LS ≤ S.EF - lag → T.LF ≤ (T.LS + dur-1)
          const candLS_sf = addWorkingDays(sEF, -lag, holidays);
          candLF = addWorkingDays(candLS_sf, (dur - 1), holidays);
          break;
        default:
          candLF = addWorkingDays(sES, -lag, holidays);
          break;
      }
      lf = candLF < lf ? candLF : lf;
      constrained = true;
    }
    if (!constrained) {
      // No successors → bound by project finish
      lf = projFinish;
    }
    const ls = addWorkingDays(lf, -(dur - 1), holidays);
    LF[id] = toISO(lf);
    LS[id] = toISO(ls);
  }

  // For summaries, mirror ES/EF and LS/LF from their rolled-up dates
  list.filter(t => !isLeaf(t)).forEach(t => {
    LS[t.id] = ES[t.id];
    LF[t.id] = EF[t.id];
  });

  // ---- Slack & critical ----
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