// Project Task Engine
//
// Two responsibilities:
//   1. generateProjectTaskList — spin up a complete `project_tasks/{id}`
//      collection for a new project from the PHASE_CATALOG, with start/end
//      dates calculated from dependsOn + typicalDays.
//   2. recommendSubForTask — pick the best sub from sms_contacts for a given
//      task, ranked by how often Tyler has used them on similar projects.
//
// Storage:
//   • project_tasks/{id} — one doc per task instance per project
//   • material_orders/{id} — written by materialsTracker.ts, but seeded here
//     when the task is generated (status: 'NEEDED').

import type { Firestore } from 'firebase-admin/firestore';
import {
  PHASE_CATALOG,
  PhaseTask,
  TradeType,
  ConstructionPhase,
  getTasksForProjectType,
  getPhaseTask,
} from './phaseCatalog';

// ── ProjectTask shape (stored in Firestore) ──────────────────────────────────
// Mirrors PhaseTask but carries the live per-project state: dates, assignment,
// status. ProjectTask.catalogId points back at PHASE_CATALOG so we can re-pull
// the checklist/materials list later without duplicating them on every doc.
export type ProjectTaskStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked';

export interface ProjectTask {
  id?: string;
  projectId: string;
  catalogId: string;             // PHASE_CATALOG id this was generated from
  name: string;
  phase: ConstructionPhase;
  trade: TradeType;
  status: ProjectTaskStatus;
  typicalDays: number;
  dependsOn: string[];           // catalog ids (resolved at runtime)
  startDate?: string;            // ISO date (computed from dependsOn + start)
  endDate?: string;              // ISO date
  assignedContactId?: string | null;  // sms_contacts/{id} or contacts/{id}
  assignedContactName?: string | null;
  assignedPhone?: string | null;
  notes?: string | null;
  checklistItems: string[];
  // SUB_CONFIRMATION / scheduling sent flags so the daily workflow can show
  // which subs Tyler has already pinged. Optional — set by the route.
  confirmedAt?: string | null;
  // Optional priority — used by overdueChecker to decide whether to text
  // Tyler (HIGH), drop a queue row (MEDIUM), or just log (LOW). Inferred
  // from trade/phase when not set explicitly.
  priority?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  // Report-back / closure tracking. Written by taskNotifier.handleTaskCompletion
  // when the assignee texts DONE / LISTO, by the app UI when staff close it
  // manually, or by the QBO/import path. Stored as Firestore Timestamps in
  // practice but typed loose here because the wire format is ISO strings.
  completionConfirmedBy?: string | null;
  completionConfirmedAt?: any | null;
  completionMethod?: 'sms' | 'app' | 'manual' | null;
  completionMessage?: string | null;
  completionThreadId?: string | null;
  // Escalation tracking — populated by overdueChecker so Tyler doesn't get
  // re-pinged about the same overdue task multiple times in a single day.
  escalatedToTyler?: boolean;
  escalatedAt?: any | null;
  // Day stamp for sendTaskReminder idempotency (YYYY-MM-DD UTC).
  taskReminderLastSentOn?: string | null;
  // Day stamp + timestamp for notifyTaskAssigned bookkeeping.
  lastAssignmentNotifiedAt?: any | null;
  // Google Calendar event id, set when the calendar feature flag is on.
  calendarEventId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// Spanish-speaking-only trade hints. These are the trades where Tyler's
// network is heavily Spanish-speaking — when recommending we'll prefer a
// Spanish-preferred contact on these and not on the others.
const SPANISH_HEAVY_TRADES: ReadonlyArray<TradeType> = [
  'FRAMER',
  'PAINTER',
  'TILE',
  'ROOFING',
  'STUCCO_SIDING',
];

// ── generateProjectTaskList ─────────────────────────────────────────────────
// Walks the catalog (filtered by project type) and writes a project_tasks doc
// per row. Dates are scheduled by walking the dependsOn graph — each task's
// startDate is the max(endDate) of its dependencies (or projectStart if none).
//
// Also seeds material_orders for each task that declares materials, with
// status='NEEDED' and orderBy/expectedDelivery filled from lead time + start
// date. materialsTracker.ts owns the lifecycle from there.
export async function generateProjectTaskList(
  db: Firestore,
  projectId: string,
  projectType: 'CUSTOM' | 'SPEC',
  startDate: Date,
): Promise<ProjectTask[]> {
  const catalogTasks = getTasksForProjectType(projectType);
  const scheduled = scheduleTasks(catalogTasks, startDate);

  const now = new Date().toISOString();
  const tasksCol = db.collection('project_tasks');
  const materialsCol = db.collection('material_orders');
  const batch = db.batch();
  const created: ProjectTask[] = [];

  for (const sched of scheduled) {
    const ref = tasksCol.doc();
    const task: ProjectTask = {
      projectId,
      catalogId: sched.task.id,
      name: sched.task.name,
      phase: sched.task.phase,
      trade: sched.task.trade,
      status: 'not_started',
      typicalDays: sched.task.typicalDays,
      dependsOn: sched.task.dependsOn,
      startDate: sched.start.toISOString(),
      endDate: sched.end.toISOString(),
      assignedContactId: null,
      assignedContactName: null,
      assignedPhone: null,
      notes: null,
      checklistItems: sched.task.checklistItems,
      confirmedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(ref, task);
    created.push({ ...task, id: ref.id });

    // Seed material orders for this task at status 'NEEDED'. The "order by"
    // date is task.startDate minus the lead time — that's when Tyler should
    // hit the vendor. We deliberately don't pre-assign a vendor here; the
    // materials UI lets Tyler pick the right sub at order time.
    for (const mat of sched.task.materials) {
      const matRef = materialsCol.doc();
      const orderBy = new Date(sched.start);
      orderBy.setDate(orderBy.getDate() - mat.orderLeadTimeDays);
      batch.set(matRef, {
        projectId,
        taskId: ref.id,
        category: mat.category,
        description: mat.description,
        vendorContactId: null,
        vendorName: '',
        vendorTradeType: mat.vendorTradeType,
        status: 'NEEDED',
        orderByDate: orderBy.toISOString(),
        needsFollowUp: false,
        followUpDate: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  await batch.commit();
  return created;
}

// ── scheduleTasks ────────────────────────────────────────────────────────────
// Topological walk: for each task, its start = max(end of all dependencies)
// (or projectStart if no deps). end = start + typicalDays. Catalog tasks with
// missing dependency rows (because they were filtered out by project type)
// are gracefully treated as already-complete.
interface ScheduledTask {
  task: PhaseTask;
  start: Date;
  end: Date;
}

function scheduleTasks(tasks: PhaseTask[], projectStart: Date): ScheduledTask[] {
  const ends = new Map<string, Date>();   // catalog id → endDate
  const scheduled: ScheduledTask[] = [];
  const inSet = new Set(tasks.map((t) => t.id));

  // Iterate in catalog order — PHASE_CATALOG is already roughly topologically
  // sorted by phase. If we encounter a task whose dep isn't scheduled yet,
  // we still treat its dep end as projectStart and move on; this matches how
  // Tyler talks about overlapping phases ("we'll start trim while flooring
  // wraps up downstairs").
  for (const t of tasks) {
    let start = new Date(projectStart);
    for (const dep of t.dependsOn) {
      if (!inSet.has(dep)) continue; // dep filtered out by project type
      const depEnd = ends.get(dep);
      if (depEnd && depEnd.getTime() > start.getTime()) {
        start = new Date(depEnd);
      }
    }
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(1, t.typicalDays));
    ends.set(t.id, end);
    scheduled.push({ task: t, start, end });
  }

  return scheduled;
}

// ── SubRecommendation ────────────────────────────────────────────────────────
export interface SubRecommendation {
  contactId: string | null;
  contactName: string;
  phoneNumber: string;
  confidence: 'strong' | 'likely' | 'fallback' | 'none';
  reason: string;
  // Full ranked list of candidates considered. Useful when Tyler wants to
  // pick a different sub than the top recommendation.
  alternates?: Array<{
    contactId: string;
    contactName: string;
    phoneNumber: string;
    reason: string;
  }>;
}

// recommendSubForTask
// Ranks SUB contacts for a task. Considers:
//   1. Trade match (must)
//   2. Whether the sub has worked on this project before (projectIds includes
//      projectId, OR project name match in projectNames) — strong signal
//   3. Total message volume with Tyler — proxy for "active relationship"
//   4. Spanish preference matches Spanish-heavy trade
//
// We DO NOT require Spanish-speaking contacts for non-Spanish-heavy trades —
// some of Tyler's best electricians are bilingual. We only filter the other
// way: don't recommend Spanish-only contacts for English-only trades (rare).
export async function recommendSubForTask(
  db: Firestore,
  projectId: string,
  task: PhaseTask,
): Promise<SubRecommendation> {
  const trade = task.trade;
  // Internal / vendor / GC tasks don't need a sub recommendation in the same
  // way; we still return a sensible "none" answer so the UI is consistent.
  if (trade === 'GC' || trade === 'INTERNAL') {
    return {
      contactId: null,
      contactName: '',
      phoneNumber: '',
      confidence: 'none',
      reason: 'This task is run by Skyeline directly — no sub assignment needed.',
    };
  }

  // Pull all sms_contacts with this trade. The collection isn't large enough
  // to need composite indexes; one filter + in-memory rank is fine.
  const snap = await db
    .collection('sms_contacts')
    .where('role', '==', 'SUB')
    .where('trade', '==', trade)
    .get();

  // Also pull the project doc so we can match by name (Tyler's contacts use
  // project nicknames like "Christensens", "Giboney" in projectNames[]).
  const projectDoc = await db.collection('projects').doc(projectId).get();
  const projectName: string = projectDoc.exists ? String(projectDoc.data()?.name || '') : '';

  type Candidate = {
    id: string;
    name: string;
    phone: string;
    score: number;
    reasonBits: string[];
    language: string;
  };

  const candidates: Candidate[] = [];
  snap.forEach((doc) => {
    const c = doc.data() as any;
    const reasonBits: string[] = [];
    let score = 0;

    // Trade match — always +10 (this is the base; we already filtered).
    score += 10;

    // Project history match — strongest signal.
    const projectIds: string[] = Array.isArray(c.projectIds) ? c.projectIds : [];
    const projectNames: string[] = Array.isArray(c.projectNames) ? c.projectNames : [];
    if (projectIds.includes(projectId)) {
      score += 40;
      reasonBits.push('worked on this project before');
    } else if (
      projectName &&
      projectNames.some((n: string) => n.toLowerCase().includes(projectName.toLowerCase()))
    ) {
      score += 25;
      reasonBits.push(`worked on ${projectName} before`);
    }

    // Active relationship — high message count means Tyler talks to them
    // regularly. Cap at +15 so it doesn't drown out project history.
    const totalMessages: number = typeof c.totalMessages === 'number' ? c.totalMessages : 0;
    if (totalMessages > 1000) {
      score += 15;
      reasonBits.push('frequent collaborator');
    } else if (totalMessages > 300) {
      score += 10;
      reasonBits.push('regular sub');
    } else if (totalMessages > 0) {
      score += 5;
    }

    // Spanish-speaking + Spanish-heavy trade — slight boost.
    if (SPANISH_HEAVY_TRADES.includes(trade) && c.preferredLanguage === 'es') {
      score += 5;
      reasonBits.push('Spanish-speaking crew');
    }

    // Recency — last message within 60 days adds a small boost.
    const last = c.lastMessageDate ? new Date(c.lastMessageDate).getTime() : 0;
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    if (last > sixtyDaysAgo) {
      score += 5;
      reasonBits.push('active recently');
    }

    candidates.push({
      id: doc.id,
      name: c.name || c.contactName || 'Unknown',
      phone: c.phoneNumber || '',
      score,
      reasonBits,
      language: c.preferredLanguage || 'en',
    });
  });

  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return {
      contactId: null,
      contactName: '',
      phoneNumber: '',
      confidence: 'none',
      reason: `No ${trade.toLowerCase().replace('_', ' ')} sub on file. Add one in Contacts.`,
    };
  }

  const top = candidates[0];

  // Confidence ladder
  let confidence: SubRecommendation['confidence'] = 'fallback';
  if (top.score >= 50) confidence = 'strong';
  else if (top.score >= 25) confidence = 'likely';
  else if (top.score >= 15) confidence = 'fallback';
  else confidence = 'fallback';

  const reason = top.reasonBits.length > 0
    ? top.reasonBits.join(', ')
    : `${trade.toLowerCase().replace('_', ' ')} on file`;

  const alternates = candidates.slice(1, 4).map((c) => ({
    contactId: c.id,
    contactName: c.name,
    phoneNumber: c.phone,
    reason: c.reasonBits.length > 0 ? c.reasonBits.join(', ') : 'fallback option',
  }));

  return {
    contactId: top.id,
    contactName: top.name,
    phoneNumber: top.phone,
    confidence,
    reason,
    alternates,
  };
}

// ── Convenience: get the catalog task for a project_tasks doc ────────────────
export function resolveCatalogTask(projectTask: ProjectTask): PhaseTask | undefined {
  return getPhaseTask(projectTask.catalogId);
}

// Re-export the catalog so route handlers can import everything from here.
export { PHASE_CATALOG };
