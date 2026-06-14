// Project defaults — every new project starts seeded with a default Gantt,
// task list, estimate, and "selections needed" list, UNLESS the GC explicitly
// builds/publishes its own. The chosen defaults are designated in Settings →
// Project Defaults (settings/projectDefaults); if none is designated we fall
// back to the built-in starter templates.
//
// All seeding is GUARDED: a surface is only seeded when the project has no data
// there yet (and, for schedule/tasks, only when the create form didn't already
// apply a hand-picked template). Failures are non-fatal — project creation must
// never be blocked by a seed step.

import {
  collection, doc, getDoc, getDocs, query, where, limit, writeBatch,
  serverTimestamp, addDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { applyJobTemplate } from '@/lib/applyJobTemplate';
import { STARTER_SCHEDULE_TEMPLATES, type StarterScheduleTask } from '@/data/skyelineStarterTemplates';
import { SELECTIONS_TEMPLATE } from '@/data/selectionsTemplate';
import { ROOMS_BY_FLOOR, type FloorLevel } from '@/types/selections';
import { wbsToClientSchedule } from '@/lib/schedule/wbsToClientSchedule';
import { publishScheduleToClient } from '@/lib/schedule/publishSchedule';
import type { WbsTask } from '@/modules/gantt/types';
import type { GeneratedSchedule, ScheduledPhase, ScheduledTrade } from '@/lib/schedule/types';

export interface ProjectDefaults {
  scheduleTemplateId?: string;   // a scheduleTemplates doc id (Gantt)
  jobTaskTemplateId?: string;    // a templates doc id (task list)
  estimateTemplateId?: string;   // an estimates doc id to clone
  seedSelections?: boolean;      // seed the client "selections needed" list (default true)
}

export async function getProjectDefaults(): Promise<ProjectDefaults> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'projectDefaults'));
    return snap.exists() ? (snap.data() as ProjectDefaults) : {};
  } catch {
    return {};
  }
}

export async function saveProjectDefaults(d: ProjectDefaults): Promise<void> {
  const { setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'settings', 'projectDefaults'), { ...d, updatedAt: serverTimestamp() }, { merge: true });
}

// ── helpers ────────────────────────────────────────────────────────────────

const DAY = 86400000;

async function collectionHasAny(path: string[]): Promise<boolean> {
  try {
    const snap = await getDocs(query(collection(db, path[0], ...path.slice(1)) as any, limit(1)));
    return !snap.empty;
  } catch {
    return false;
  }
}

async function projectHasTasks(projectId: string): Promise<boolean> {
  try {
    const snap = await getDocs(query(collection(db, 'tasks'), where('projectId', '==', projectId), limit(1)));
    return !snap.empty;
  } catch { return false; }
}

async function projectHasEstimate(projectId: string): Promise<boolean> {
  try {
    const snap = await getDocs(query(collection(db, 'estimates'), where('projectId', '==', projectId), limit(1)));
    return !snap.empty;
  } catch { return false; }
}

// Re-anchor a flat starter task list so the earliest task starts on `startISO`.
function anchorStarterTasks(tasks: StarterScheduleTask[], startISO: string): StarterScheduleTask[] {
  const starts = tasks.map(t => Date.parse(t.startDate)).filter(Number.isFinite);
  if (!startISO || starts.length === 0) return tasks;
  const earliest = Math.min(...starts);
  const target = Date.parse(startISO);
  if (!Number.isFinite(target)) return tasks;
  const delta = target - earliest;
  if (delta === 0) return tasks;
  const shift = (iso?: string) => (iso ? new Date(Date.parse(iso) + delta).toISOString().slice(0, 10) : iso);
  return tasks.map(t => ({ ...t, startDate: shift(t.startDate)!, endDate: shift(t.endDate)! }));
}

// Build a client-safe GeneratedSchedule from a flat starter list, using the
// `isPhase` flag as phase headers and `decision` for selection steps.
function starterToClientSchedule(tasks: StarterScheduleTask[]): GeneratedSchedule | null {
  if (!tasks.length) return null;
  const phases: ScheduledPhase[] = [];
  let current: ScheduledPhase | null = null;
  const pushTrade = (t: StarterScheduleTask) => {
    if (!current) {
      current = { phase: 'Build Schedule', startDate: t.startDate, endDate: t.endDate, durationDays: 0, trades: [] };
      phases.push(current);
    }
    const trade: ScheduledTrade = {
      trade: t.name, phase: current.phase, amount: 0, lineCount: 1,
      startDate: (t.startDate || '').slice(0, 10), endDate: (t.endDate || '').slice(0, 10),
      durationDays: t.durationDays ?? 1, decision: !!t.decision,
    };
    current.trades.push(trade);
  };
  for (const t of tasks) {
    if (t.isPhase) {
      current = { phase: t.name, startDate: t.startDate, endDate: t.endDate, durationDays: t.durationDays ?? 0, trades: [] };
      phases.push(current);
    } else {
      pushTrade(t);
    }
  }
  // Compute phase spans from their trades.
  for (const p of phases) {
    const ss = p.trades.map(t => Date.parse(t.startDate)).filter(Number.isFinite);
    const ee = p.trades.map(t => Date.parse(t.endDate)).filter(Number.isFinite);
    if (ss.length) p.startDate = new Date(Math.min(...ss)).toISOString().slice(0, 10);
    if (ee.length) p.endDate = new Date(Math.max(...ee)).toISOString().slice(0, 10);
    p.durationDays = Math.max(1, Math.round((Date.parse(p.endDate) - Date.parse(p.startDate)) / DAY) + 1);
  }
  const allStarts = phases.flatMap(p => p.trades.map(t => Date.parse(t.startDate))).filter(Number.isFinite);
  const allEnds = phases.flatMap(p => p.trades.map(t => Date.parse(t.endDate))).filter(Number.isFinite);
  const start = allStarts.length ? new Date(Math.min(...allStarts)).toISOString().slice(0, 10) : '';
  const end = allEnds.length ? new Date(Math.max(...allEnds)).toISOString().slice(0, 10) : '';
  return {
    startDate: start, endDate: end,
    totalDays: start && end ? Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1) : 0,
    phases,
    tradeCount: new Set(phases.flatMap(p => p.trades.map(t => t.trade))).size,
  };
}

// Reverse room → floor for seeding selections (the flat template has no floor).
function roomToFloor(room: string): FloorLevel {
  for (const floor of Object.keys(ROOMS_BY_FLOOR) as FloorLevel[]) {
    if (ROOMS_BY_FLOOR[floor].some(r => r.toLowerCase() === room.toLowerCase())) return floor;
  }
  if (/lot|exterior|site|driveway|landscap|patio/i.test(room)) return 'Exterior';
  return 'Main Floor';
}

// ── seeders ──────────────────────────────────────────────────────────────────

async function seedSchedule(projectId: string, startDate: string, defaults: ProjectDefaults,
  fromUserId?: string, fromUserName?: string) {
  // Already has a Gantt? leave it.
  const hasSchedule = (await getDoc(doc(db, 'schedules', projectId))).exists();
  if (hasSchedule) return;

  const { loadTemplate, saveSchedule } = await import('@/modules/gantt/useSchedulePersistence');
  let tasks: WbsTask[] = [];
  let links: any[] = [];
  let clientSchedule: GeneratedSchedule | null = null;

  if (defaults.scheduleTemplateId) {
    const tmpl = await loadTemplate(defaults.scheduleTemplateId);
    if (tmpl) { tasks = tmpl.tasks || []; links = tmpl.links || []; clientSchedule = wbsToClientSchedule(tasks); }
  }
  if (tasks.length === 0) {
    // Built-in starter fallback (House Build = first template).
    const starter = STARTER_SCHEDULE_TEMPLATES[0];
    if (starter) {
      const anchored = anchorStarterTasks(starter.tasks, startDate);
      tasks = anchored as unknown as WbsTask[];
      links = starter.links || [];
      clientSchedule = starterToClientSchedule(anchored);
    }
  }
  if (tasks.length === 0) return;

  await saveSchedule(projectId, tasks, links);

  // Publish the default client-safe view so the homeowner sees a timeline from
  // day one. Silent (no notification) — it's a default, not a real update.
  if (clientSchedule) {
    const proj = await getDoc(doc(db, 'projects', projectId));
    if (!(proj.data() as any)?.estimatedSchedule) {
      await publishScheduleToClient({
        projectId, schedule: clientSchedule, source: 'Default template',
        startDate: clientSchedule.startDate || startDate, fromUserId, fromUserName, notify: false,
      });
    }
  }
}

async function seedTasks(projectId: string, startDate: string, defaults: ProjectDefaults) {
  if (!defaults.jobTaskTemplateId) return;
  if (await projectHasTasks(projectId)) return;
  await applyJobTemplate(defaults.jobTaskTemplateId, projectId, startDate);
}

async function seedEstimate(projectId: string, projectName: string, defaults: ProjectDefaults) {
  if (!defaults.estimateTemplateId) return;
  if (await projectHasEstimate(projectId)) return;

  const tmplSnap = await getDoc(doc(db, 'estimates', defaults.estimateTemplateId));
  if (!tmplSnap.exists()) return;
  const t = tmplSnap.data() as any;

  const newRef = await addDoc(collection(db, 'estimates'), {
    projectId,
    projectName,
    title: t.title ? `${t.title} (from template)` : 'Estimate',
    lineItems: Array.isArray(t.lineItems) ? t.lineItems : [],
    markupConfig: t.markupConfig ?? null,
    markupPct: t.markupPct ?? null,
    taxPct: t.taxPct ?? 0,
    seededFromTemplateId: defaults.estimateTemplateId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Copy costGroups + costCodes subcollections if the template uses them.
  try {
    const groups = await getDocs(collection(db, 'estimates', defaults.estimateTemplateId, 'costGroups'));
    for (const g of groups.docs) {
      const gData = g.data();
      const newGroup = await addDoc(collection(db, 'estimates', newRef.id, 'costGroups'), { ...gData });
      const codes = await getDocs(collection(db, 'estimates', defaults.estimateTemplateId, 'costGroups', g.id, 'costCodes'));
      if (!codes.empty) {
        const batch = writeBatch(db);
        for (const c of codes.docs) {
          batch.set(doc(collection(db, 'estimates', newRef.id, 'costGroups', newGroup.id, 'costCodes')), { ...c.data() });
        }
        await batch.commit();
      }
    }
  } catch (e) {
    console.warn('[projectDefaults] estimate subcollection copy failed', e);
  }
}

async function seedSelections(projectId: string, defaults: ProjectDefaults) {
  if (defaults.seedSelections === false) return;
  if (await collectionHasAny(['projects', projectId, 'selections'])) return;

  // Seed the CLIENT-owned decisions as the "selections needed" list — that's
  // what the homeowner acts on in the portal. (Builder/architect items stay on
  // the GC side and aren't seeded as client selections.)
  const items = SELECTIONS_TEMPLATE.filter(i => i.owner === 'Client');
  if (items.length === 0) return;

  // Firestore batch cap is 500 — chunk to 400.
  for (let i = 0; i < items.length; i += 400) {
    const chunk = items.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const it of chunk) {
      batch.set(doc(collection(db, 'projects', projectId, 'selections')), {
        projectId,
        floor: roomToFloor(it.room),
        room: it.room,
        category: it.category,
        area: it.item,
        allowanceAmount: 0,
        allowanceUnit: 'lump sum',
        clientApprovalStatus: 'Pending Options',
        orderStatus: 'Not Ordered',
        items: [],
        phase: it.phase,
        seededFromTemplate: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

export interface SeedOpts {
  projectId: string;
  projectName: string;
  startDate: string;
  fromUserId?: string;
  fromUserName?: string;
  skipSchedule?: boolean;   // form already applied a hand-picked Gantt template
  skipTasks?: boolean;      // form already applied a hand-picked job template
}

// Orchestrator — each surface is independent + non-fatal so one failure never
// blocks the rest (or the project create).
export async function seedProjectDefaults(opts: SeedOpts): Promise<void> {
  const defaults = await getProjectDefaults();
  const { projectId, projectName, startDate, fromUserId, fromUserName, skipSchedule, skipTasks } = opts;

  const steps: Array<[string, Promise<void>]> = [];
  if (!skipSchedule) steps.push(['schedule', seedSchedule(projectId, startDate, defaults, fromUserId, fromUserName)]);
  if (!skipTasks) steps.push(['tasks', seedTasks(projectId, startDate, defaults)]);
  steps.push(['estimate', seedEstimate(projectId, projectName, defaults)]);
  steps.push(['selections', seedSelections(projectId, defaults)]);

  await Promise.all(steps.map(([name, p]) => p.catch(e => {
    console.warn(`[projectDefaults] seed ${name} failed`, e);
  })));
}
