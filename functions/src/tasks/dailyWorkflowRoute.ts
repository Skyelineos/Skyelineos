// Daily Workflow API
//
// GET  /api/projects/:id/daily-workflow   — one project's morning digest
// GET  /api/daily-digest                  — all active projects rolled up
// POST /api/projects/:id/generate-tasks   — bootstrap project_tasks for a project
// GET  /api/projects/:id/tasks            — current task list
// PATCH /api/project-tasks/:taskId        — update status / assignment / notes
// GET  /api/project-tasks/:taskId/recommend-sub  — pick a sub for this task
// POST /api/material-orders/:id/order     — markMaterialOrdered
// POST /api/material-orders/:id/delivered — markMaterialDelivered
// POST /api/material-orders/:id/delayed   — markMaterialDelayed
//
// All routes register AFTER the /api authMiddleware gate in index.ts so
// req.user is verified by the time the handler runs.

import type { Express, Request, Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import {
  generateProjectTaskList,
  recommendSubForTask,
  ProjectTask,
} from './projectTaskEngine';
import {
  getMaterialsNeedingAction,
  humanizeMaterialAction,
  markMaterialOrdered,
  markMaterialDelivered,
  markMaterialDelayed,
  MaterialStatus,
  MaterialOrder,
} from './materialsTracker';
import { getPhaseTask, PHASE_ORDER, ConstructionPhase } from './phaseCatalog';
import { notifyTaskAssigned } from './taskNotifier';

export interface DailyWorkflowResponse {
  projectId: string;
  projectName: string;
  date: string;
  phase: string;
  tasksToday: Array<{
    id: string;
    task: string;
    assignedTo: string;
    status: 'not_started' | 'in_progress' | 'complete' | 'blocked';
    trade: string;
  }>;
  materialsNeedingAction: Array<{
    id: string;
    material: string;
    status: MaterialStatus;
    vendor: string;
    action: string;
  }>;
  escalations: string[];
  subsScheduledToday: Array<{
    name: string;
    trade: string;
    phone: string;
  }>;
  overdueItems: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfTodayMs(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function spansToday(startIso?: string, endIso?: string): boolean {
  if (!startIso) return false;
  const sotMs = startOfTodayMs();
  const eotMs = endOfTodayMs();
  const startMs = new Date(startIso).getTime();
  const endMs = endIso ? new Date(endIso).getTime() : startMs;
  return startMs <= eotMs && endMs >= sotMs;
}

// Project's current phase = first phase that still has incomplete tasks.
function currentPhase(tasks: ProjectTask[]): ConstructionPhase | 'COMPLETE' {
  for (const phase of PHASE_ORDER) {
    const phaseTasks = tasks.filter((t) => t.phase === phase);
    if (phaseTasks.length === 0) continue;
    const incomplete = phaseTasks.some((t) => t.status !== 'complete');
    if (incomplete) return phase;
  }
  return 'COMPLETE';
}

// ── buildDailyWorkflow ───────────────────────────────────────────────────────
async function buildDailyWorkflow(
  db: Firestore,
  projectId: string,
): Promise<DailyWorkflowResponse> {
  // 1. Project meta
  const projectDoc = await db.collection('projects').doc(projectId).get();
  const projectName = projectDoc.exists
    ? String(projectDoc.data()?.name || projectDoc.data()?.title || projectId)
    : projectId;

  // 2. Tasks
  const tasksSnap = await db
    .collection('project_tasks')
    .where('projectId', '==', projectId)
    .get();
  const tasks: ProjectTask[] = tasksSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as any) } as ProjectTask),
  );

  // Today's tasks: anything scheduled to span today, plus anything in_progress
  // regardless of schedule (because "in progress" beats the schedule).
  const tasksToday = tasks
    .filter(
      (t) =>
        t.status === 'in_progress' ||
        (t.status !== 'complete' && spansToday(t.startDate, t.endDate)),
    )
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
    .map((t) => ({
      id: t.id || '',
      task: t.name,
      assignedTo: t.assignedContactName || 'unassigned',
      status: t.status,
      trade: t.trade,
    }));

  // 3. Materials needing action
  const matBuckets = await getMaterialsNeedingAction(db, projectId);
  const allMaterialsToShow: MaterialOrder[] = [
    ...matBuckets.overdue,
    ...matBuckets.followUpToday,
    ...matBuckets.upcoming,
  ];
  const materialsNeedingAction = allMaterialsToShow.map((m) => ({
    id: m.id || '',
    material: m.description || m.category,
    status: m.status,
    vendor: m.vendorName || '',
    action: humanizeMaterialAction(m),
  }));

  // 4. Escalations from sms_escalations for this project
  const escSnap = await db
    .collection('sms_escalations')
    .where('projectId', '==', projectId)
    .where('status', 'in', ['open', 'pending'])
    .limit(20)
    .get()
    .catch(async () => {
      // Some projects won't have a projectId-indexed status field, so fall
      // back to querying by projectId only.
      return db
        .collection('sms_escalations')
        .where('projectId', '==', projectId)
        .limit(20)
        .get();
    });
  const escalations: string[] = [];
  escSnap.forEach((doc) => {
    const e = doc.data();
    const summary = e.summary || e.title || e.body || '';
    if (summary) escalations.push(String(summary).slice(0, 200));
  });

  // 5. Subs scheduled today — derived from tasksToday with an assignedContact.
  const seen = new Set<string>();
  const subsScheduledToday: Array<{ name: string; trade: string; phone: string }> = [];
  for (const t of tasks) {
    if (!spansToday(t.startDate, t.endDate)) continue;
    if (t.status === 'complete') continue;
    if (!t.assignedContactName) continue;
    const key = t.assignedContactId || t.assignedContactName;
    if (seen.has(key)) continue;
    seen.add(key);
    subsScheduledToday.push({
      name: t.assignedContactName,
      trade: t.trade,
      phone: t.assignedPhone || '',
    });
  }

  // 6. Overdue items — tasks whose endDate is before today and still
  // incomplete, plus overdue materials.
  const overdueItems: string[] = [];
  for (const t of tasks) {
    if (t.status === 'complete') continue;
    if (t.endDate && new Date(t.endDate).getTime() < startOfTodayMs()) {
      overdueItems.push(`${t.name} (${t.assignedContactName || 'unassigned'})`);
    }
  }
  for (const m of matBuckets.overdue) {
    overdueItems.push(`${m.description} — ${m.vendorName || 'vendor TBD'}`);
  }

  const phase = currentPhase(tasks);

  return {
    projectId,
    projectName,
    date: new Date().toISOString().slice(0, 10),
    phase,
    tasksToday,
    materialsNeedingAction,
    escalations,
    subsScheduledToday,
    overdueItems,
  };
}

// ── Route registration ───────────────────────────────────────────────────────
export function registerDailyWorkflowRoutes(app: Express, db: Firestore) {
  // GET /api/projects/:id/daily-workflow
  app.get('/api/projects/:id/daily-workflow', async (req: Request, res: Response) => {
    try {
      const workflow = await buildDailyWorkflow(db, req.params.id);
      res.json(workflow);
    } catch (err: any) {
      console.error('[dailyWorkflow] error:', err);
      res.status(500).json({ error: err.message || 'failed to build workflow' });
    }
  });

  // GET /api/daily-digest — all active projects rolled up
  app.get('/api/daily-digest', async (_req: Request, res: Response) => {
    try {
      // "Active" = not status=complete/archived. We filter generously: if the
      // project doc has no status, assume active.
      const projSnap = await db.collection('projects').get();
      const activeProjectIds: string[] = [];
      projSnap.forEach((doc) => {
        const status = String(doc.data()?.status || 'ACTIVE').toUpperCase();
        if (status !== 'COMPLETED' && status !== 'ARCHIVED' && status !== 'CANCELLED') {
          activeProjectIds.push(doc.id);
        }
      });

      const workflows: DailyWorkflowResponse[] = [];
      for (const pid of activeProjectIds) {
        try {
          workflows.push(await buildDailyWorkflow(db, pid));
        } catch (err: any) {
          console.warn(`[dailyDigest] project ${pid} failed:`, err.message);
        }
      }

      res.json({
        date: new Date().toISOString().slice(0, 10),
        projectCount: workflows.length,
        projects: workflows,
      });
    } catch (err: any) {
      console.error('[dailyDigest] error:', err);
      res.status(500).json({ error: err.message || 'failed to build digest' });
    }
  });

  // POST /api/projects/:id/generate-tasks
  app.post('/api/projects/:id/generate-tasks', async (req: Request, res: Response) => {
    try {
      const projectType = (req.body?.projectType || 'CUSTOM') as 'CUSTOM' | 'SPEC';
      const startDateStr = req.body?.startDate;
      const startDate = startDateStr ? new Date(startDateStr) : new Date();
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: 'invalid startDate' });
      }
      const created = await generateProjectTaskList(db, req.params.id, projectType, startDate);
      return res.json({ count: created.length, tasks: created });
    } catch (err: any) {
      console.error('[generateTasks] error:', err);
      return res.status(500).json({ error: err.message || 'failed to generate tasks' });
    }
  });

  // GET /api/projects/:id/tasks
  app.get('/api/projects/:id/tasks', async (req: Request, res: Response) => {
    try {
      const snap = await db
        .collection('project_tasks')
        .where('projectId', '==', req.params.id)
        .get();
      const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      res.json({ count: tasks.length, tasks });
    } catch (err: any) {
      console.error('[listTasks] error:', err);
      res.status(500).json({ error: err.message || 'failed to list tasks' });
    }
  });

  // PATCH /api/project-tasks/:taskId
  app.patch('/api/project-tasks/:taskId', async (req: Request, res: Response) => {
    try {
      const allowed = [
        'status',
        'assignedContactId',
        'assignedContactName',
        'assignedPhone',
        'notes',
        'startDate',
        'endDate',
        'confirmedAt',
      ];
      const update: any = { updatedAt: new Date().toISOString() };
      for (const k of allowed) {
        if (k in (req.body || {})) update[k] = (req.body as any)[k];
      }

      // Snapshot the previous assignment so we only notify when it actually
      // changed (assigning the same contact twice, or a no-op patch that
      // includes assignedContactId, shouldn't re-spam the sub).
      const taskRef = db.collection('project_tasks').doc(req.params.taskId);
      const beforeSnap = await taskRef.get();
      const prevAssignedContactId = beforeSnap.exists
        ? ((beforeSnap.data() as any)?.assignedContactId ?? null)
        : null;

      await taskRef.update(update);
      const snap = await taskRef.get();
      const updatedTask: any = { id: snap.id, ...snap.data() };

      // Fire the assignment notifier when the assignee actually changed and
      // the new value is non-empty. Failure here MUST NOT break the PATCH —
      // the caller only cares that the task update succeeded.
      const nextAssignedContactId = (updatedTask.assignedContactId ?? null) as string | null;
      if (
        'assignedContactId' in (req.body || {})
        && nextAssignedContactId
        && nextAssignedContactId !== prevAssignedContactId
      ) {
        try {
          await notifyTaskAssigned(db, updatedTask as ProjectTask, nextAssignedContactId);
        } catch (notifyErr: any) {
          console.warn('[patchTask] notifyTaskAssigned failed (non-fatal):', notifyErr?.message || notifyErr);
        }
      }

      res.json(updatedTask);
    } catch (err: any) {
      console.error('[patchTask] error:', err);
      res.status(500).json({ error: err.message || 'failed to update task' });
    }
  });

  // GET /api/project-tasks/:taskId/recommend-sub
  app.get('/api/project-tasks/:taskId/recommend-sub', async (req: Request, res: Response) => {
    try {
      const snap = await db.collection('project_tasks').doc(req.params.taskId).get();
      if (!snap.exists) return res.status(404).json({ error: 'task not found' });
      const task = snap.data() as ProjectTask;
      const catalogTask = getPhaseTask(task.catalogId);
      if (!catalogTask) return res.status(400).json({ error: 'catalog task not found' });
      const rec = await recommendSubForTask(db, task.projectId, catalogTask);
      return res.json(rec);
    } catch (err: any) {
      console.error('[recommendSub] error:', err);
      return res.status(500).json({ error: err.message || 'failed to recommend sub' });
    }
  });

  // POST /api/material-orders/:id/order
  app.post('/api/material-orders/:id/order', async (req: Request, res: Response) => {
    try {
      const { vendorContactId, expectedDelivery } = req.body || {};
      if (!vendorContactId || !expectedDelivery) {
        return res.status(400).json({ error: 'vendorContactId and expectedDelivery required' });
      }
      const d = new Date(expectedDelivery);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'invalid expectedDelivery' });
      await markMaterialOrdered(db, req.params.id, vendorContactId, d);
      const snap = await db.collection('material_orders').doc(req.params.id).get();
      return res.json({ id: snap.id, ...snap.data() });
    } catch (err: any) {
      console.error('[orderMaterial] error:', err);
      return res.status(500).json({ error: err.message || 'failed to order material' });
    }
  });

  // POST /api/material-orders/:id/delivered
  app.post('/api/material-orders/:id/delivered', async (req: Request, res: Response) => {
    try {
      const when = req.body?.actualDelivery ? new Date(req.body.actualDelivery) : new Date();
      await markMaterialDelivered(db, req.params.id, when);
      const snap = await db.collection('material_orders').doc(req.params.id).get();
      res.json({ id: snap.id, ...snap.data() });
    } catch (err: any) {
      console.error('[deliveredMaterial] error:', err);
      res.status(500).json({ error: err.message || 'failed to mark delivered' });
    }
  });

  // POST /api/material-orders/:id/delayed
  app.post('/api/material-orders/:id/delayed', async (req: Request, res: Response) => {
    try {
      const { newExpectedDelivery, reason } = req.body || {};
      if (!newExpectedDelivery || !reason) {
        return res.status(400).json({ error: 'newExpectedDelivery and reason required' });
      }
      const d = new Date(newExpectedDelivery);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'invalid newExpectedDelivery' });
      await markMaterialDelayed(db, req.params.id, d, String(reason));
      const snap = await db.collection('material_orders').doc(req.params.id).get();
      return res.json({ id: snap.id, ...snap.data() });
    } catch (err: any) {
      console.error('[delayedMaterial] error:', err);
      return res.status(500).json({ error: err.message || 'failed to mark delayed' });
    }
  });

  // GET /api/projects/:id/materials — full materials list (any status)
  app.get('/api/projects/:id/materials', async (req: Request, res: Response) => {
    try {
      const snap = await db
        .collection('material_orders')
        .where('projectId', '==', req.params.id)
        .get();
      const materials = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      res.json({ count: materials.length, materials });
    } catch (err: any) {
      console.error('[listMaterials] error:', err);
      res.status(500).json({ error: err.message || 'failed to list materials' });
    }
  });
}
