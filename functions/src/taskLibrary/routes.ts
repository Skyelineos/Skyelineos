// ─────────────────────────────────────────────────────────────────────────────
// Master Task Library & Project Task Template — backend routes
//
// All endpoints fold into the shared `api` Express app (org IAM blocks new Cloud
// Run services). Registered in functions/src/index.ts via registerTaskLibrary().
//
// System rules enforced here (spec §8):
//   • Master tasks are templates; project tasks are independent copies.
//   • Editing a project task NEVER touches the master.
//   • Master edits only affect FUTURE generations (no retro-apply).
//   • Archived master tasks are never copied into new projects.
//   • Every skipped task requires a reason.
//   • Quality-gate tasks require acceptance-criteria confirmation to complete.
//   • Closeout improvements are NEVER auto-applied — admin approval required.
//
// Auth: admin-only for library + closeout; GC-level (admin/gc/projectManager)
// for project task operations. Both verify the Firebase ID token then read the
// caller's role from users/{uid}. Writes use the Admin SDK (bypass rules).
// ─────────────────────────────────────────────────────────────────────────────

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { MASTER_TASK_SEED, SeedMasterTask } from './masterTasks.seed';

type Db = FirebaseFirestore.Firestore;
const FieldValue = admin.firestore.FieldValue;

const GC_ROLES = new Set(['admin', 'gc', 'projectManager']);

const PROJECT_TASK_STATUSES = [
  'Not Started',
  'Ready',
  'Blocked',
  'In Progress',
  'Waiting on Client',
  'Waiting on Subcontractor',
  'Waiting on Inspection',
  'Complete',
  'Skipped',
  'Needs Review',
];

// ── Auth middlewares ─────────────────────────────────────────────────────────
async function resolveRole(req: any): Promise<{ uid: string; role: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
    const profile = await admin.firestore().collection('users').doc(decoded.uid).get();
    const role = profile.exists ? (profile.data() || {}).role : null;
    return { uid: decoded.uid, role: role || 'client' };
  } catch {
    return null;
  }
}

function adminOnly() {
  return async (req: any, res: any, next: any) => {
    const ctx = await resolveRole(req);
    if (!ctx) return res.status(401).json({ error: 'Invalid or missing token' });
    if (ctx.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.authCtx = ctx;
    next();
  };
}

function gcOnly() {
  return async (req: any, res: any, next: any) => {
    const ctx = await resolveRole(req);
    if (!ctx) return res.status(401).json({ error: 'Invalid or missing token' });
    if (!GC_ROLES.has(ctx.role)) return res.status(403).json({ error: 'Staff only' });
    req.authCtx = ctx;
    next();
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
let criterionSeq = 0;
function makeCriterion(text: string) {
  criterionSeq += 1;
  return { id: `ac_${Date.now().toString(36)}_${criterionSeq}`, text, done: false };
}

// Baseline design/selection-driven tasks that should surface in the Designer
// Portal. Used to default `designerVisible` when a seed entry doesn't set it.
const DESIGNER_VISIBLE_CODES = new Set([
  'PRE-010', // architectural design & plans
  'PRE-060', // HOA / ARC design approval
  'FIN-010', // interior trim, doors & millwork
  'FIN-020', // cabinets & countertops (selections)
  'FIN-030', // flooring (selections)
  'FIN-090', // commissioning & client orientation
]);

/** Build a full master-task document from a seed entry (fills defaults). */
function masterDocFromSeed(seed: SeedMasterTask, order: number) {
  return {
    taskCode: seed.taskCode,
    title: seed.title,
    description: seed.description,
    phase: seed.phase,
    recommendedRole: seed.recommendedRole,
    defaultAssigneeRole: seed.defaultAssigneeRole,
    defaultDurationDays: seed.defaultDurationDays,
    suggestedStartOffset: seed.suggestedStartOffset,
    dependencies: seed.dependencies || [],
    acceptanceCriteria: (seed.acceptanceCriteria || []).map(makeCriterion),
    requiredPhotos: seed.requiredPhotos || 0,
    requiredDocuments: seed.requiredDocuments || [],
    inspectionRequired: !!seed.inspectionRequired,
    drawMilestoneRelevant: !!seed.drawMilestoneRelevant,
    clientVisible: !!seed.clientVisible,
    subcontractorVisible: !!seed.subcontractorVisible,
    designerVisible: seed.designerVisible ?? DESIGNER_VISIBLE_CODES.has(seed.taskCode),
    isRequired: !!seed.isRequired,
    isOptional: !seed.isRequired,
    tags: seed.tags || [],
    appliesWhen: seed.appliesWhen || '',
    riskLevel: seed.riskLevel || 'low',
    qualityGate: !!seed.qualityGate,
    order,
    version: 1,
    archivedAt: null,
    sourceProjectId: null,
    improvementNotes: '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** Copy a master task into a project task (independent copy). */
function projectTaskFromMaster(master: any, projectId: string) {
  return {
    projectId,
    masterTaskId: master.id,
    masterVersionUsed: master.version || 1,
    taskCode: master.taskCode,
    title: master.title,
    description: master.description,
    phase: master.phase,
    assignedRole: master.defaultAssigneeRole || master.recommendedRole || 'gc',
    assignedUserId: null,
    assignedSubcontractorId: null,
    status: 'Not Started',
    priority: master.riskLevel === 'high' ? 'high' : 'medium',
    startDate: null,
    dueDate: null,
    completedAt: null,
    dependencies: master.dependencies || [],
    // Deep-copy acceptance criteria with done reset — project tracks its own.
    acceptanceCriteria: (master.acceptanceCriteria || []).map((c: any) => ({
      id: c.id,
      text: c.text,
      done: false,
    })),
    requiredPhotos: master.requiredPhotos || 0,
    uploadedPhotos: [],
    requiredDocuments: master.requiredDocuments || [],
    uploadedDocuments: [],
    inspectionRequired: !!master.inspectionRequired,
    inspectionStatus: master.inspectionRequired ? 'not_scheduled' : 'not_required',
    drawMilestoneRelevant: !!master.drawMilestoneRelevant,
    clientVisible: !!master.clientVisible,
    subcontractorVisible: !!master.subcontractorVisible,
    designerVisible: !!master.designerVisible,
    projectSpecificNotes: '',
    changeReason: '',
    isCustomTask: false,
    qualityGate: !!master.qualityGate,
    riskLevel: master.riskLevel || 'low',
    tags: master.tags || [],
    order: master.order || 0,
    // Future-integration link fields (null until wired in).
    inspectionId: null,
    drawRequestId: null,
    changeOrderId: null,
    clientSelectionId: null,
    subcontractorId: null,
    warrantyItemId: null,
    scheduleTaskId: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** Which optional tasks should be included given the requested tag groups. */
function optionalIncluded(
  task: any,
  includeTags: string[],
  includeAllOptional: boolean,
): boolean {
  if (includeAllOptional) return true;
  const tags: string[] = task.tags || [];
  if (tags.length === 0) return true; // untagged optional defaults in
  return tags.some((t) => includeTags.includes(t));
}

// ─────────────────────────────────────────────────────────────────────────────
export function registerTaskLibrary(app: Express, db: Db): void {
  const master = () => db.collection('masterTasks');
  const projectTasks = () => db.collection('projectTasks');
  const improvements = () => db.collection('taskImprovements');

  // ── Seed baseline template (idempotent on taskCode) ────────────────────────
  app.post('/api/taskLibrary/master/seed', adminOnly(), async (_req: any, res: any) => {
    try {
      const existing = await master().get();
      const existingCodes = new Set(existing.docs.map((d) => (d.data() || {}).taskCode));
      let created = 0;
      let order = existing.size;
      const batches: FirebaseFirestore.WriteBatch[] = [db.batch()];
      let ops = 0;
      for (const seed of MASTER_TASK_SEED) {
        if (existingCodes.has(seed.taskCode)) continue;
        let batch = batches[batches.length - 1];
        if (ops >= 450) {
          batch = db.batch();
          batches.push(batch);
          ops = 0;
        }
        batch.set(master().doc(), masterDocFromSeed(seed, order));
        order += 1;
        created += 1;
        ops += 1;
      }
      for (const b of batches) await b.commit();
      res.json({ ok: true, created, skipped: MASTER_TASK_SEED.length - created });
    } catch (e: any) {
      console.error('[taskLibrary/seed]', e);
      res.status(500).json({ error: e?.message || 'seed failed' });
    }
  });

  // ── Create a master task ───────────────────────────────────────────────────
  app.post('/api/taskLibrary/master', adminOnly(), async (req: any, res: any) => {
    try {
      const b = req.body || {};
      if (!b.title || !b.phase) {
        return res.status(400).json({ error: 'title and phase are required' });
      }
      // Auto-generate a taskCode if not supplied.
      let taskCode = (b.taskCode || '').trim();
      if (!taskCode) {
        const prefix = String(b.phase).slice(0, 3).toUpperCase();
        taskCode = `${prefix}-${Date.now().toString().slice(-5)}`;
      }
      const dup = await master().where('taskCode', '==', taskCode).limit(1).get();
      if (!dup.empty) return res.status(409).json({ error: `taskCode ${taskCode} already exists` });

      const phaseCount = await master().where('phase', '==', b.phase).get();
      const doc = {
        taskCode,
        title: b.title,
        description: b.description || '',
        phase: b.phase,
        recommendedRole: b.recommendedRole || 'gc',
        defaultAssigneeRole: b.defaultAssigneeRole || b.recommendedRole || 'gc',
        defaultDurationDays: Number(b.defaultDurationDays) || 1,
        suggestedStartOffset: Number(b.suggestedStartOffset) || 0,
        dependencies: Array.isArray(b.dependencies) ? b.dependencies : [],
        acceptanceCriteria: normalizeCriteria(b.acceptanceCriteria),
        requiredPhotos: Number(b.requiredPhotos) || 0,
        requiredDocuments: Array.isArray(b.requiredDocuments) ? b.requiredDocuments : [],
        inspectionRequired: !!b.inspectionRequired,
        drawMilestoneRelevant: !!b.drawMilestoneRelevant,
        clientVisible: !!b.clientVisible,
        subcontractorVisible: !!b.subcontractorVisible,
        designerVisible: !!b.designerVisible,
        isRequired: b.isRequired !== false,
        isOptional: b.isRequired === false,
        tags: Array.isArray(b.tags) ? b.tags : [],
        appliesWhen: b.appliesWhen || '',
        riskLevel: b.riskLevel || 'low',
        qualityGate: !!b.qualityGate,
        order: phaseCount.size,
        version: 1,
        archivedAt: null,
        sourceProjectId: b.sourceProjectId || null,
        improvementNotes: b.improvementNotes || '',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      const ref = await master().add(doc);
      res.status(201).json({ id: ref.id, ...doc });
    } catch (e: any) {
      console.error('[taskLibrary/master create]', e);
      res.status(500).json({ error: e?.message || 'create failed' });
    }
  });

  // ── Edit a master task (bumps version) ─────────────────────────────────────
  app.patch('/api/taskLibrary/master/:id', adminOnly(), async (req: any, res: any) => {
    try {
      const ref = master().doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Master task not found' });
      const b = req.body || {};
      const EDITABLE = [
        'title', 'description', 'phase', 'recommendedRole', 'defaultAssigneeRole',
        'defaultDurationDays', 'suggestedStartOffset', 'dependencies', 'requiredPhotos',
        'requiredDocuments', 'inspectionRequired', 'drawMilestoneRelevant', 'clientVisible',
        'subcontractorVisible', 'designerVisible', 'tags', 'appliesWhen', 'riskLevel',
        'qualityGate', 'improvementNotes',
      ];
      const update: any = { updatedAt: FieldValue.serverTimestamp(), version: FieldValue.increment(1) };
      for (const key of EDITABLE) if (key in b) update[key] = b[key];
      if ('acceptanceCriteria' in b) update.acceptanceCriteria = normalizeCriteria(b.acceptanceCriteria);
      if ('isRequired' in b) {
        update.isRequired = !!b.isRequired;
        update.isOptional = !b.isRequired;
      }
      await ref.update(update);
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[taskLibrary/master edit]', e);
      res.status(500).json({ error: e?.message || 'edit failed' });
    }
  });

  // ── Archive / unarchive (soft-delete; never copied into new projects) ──────
  app.post('/api/taskLibrary/master/:id/archive', adminOnly(), async (req: any, res: any) => {
    try {
      await master().doc(req.params.id).update({
        archivedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'archive failed' });
    }
  });
  app.post('/api/taskLibrary/master/:id/unarchive', adminOnly(), async (req: any, res: any) => {
    try {
      await master().doc(req.params.id).update({
        archivedAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'unarchive failed' });
    }
  });

  // ── Reorder tasks within a phase ───────────────────────────────────────────
  app.post('/api/taskLibrary/master/reorder', adminOnly(), async (req: any, res: any) => {
    try {
      const orderedIds: string[] = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];
      if (!orderedIds.length) return res.status(400).json({ error: 'orderedIds required' });
      const batch = db.batch();
      orderedIds.forEach((id, i) => {
        batch.update(master().doc(id), { order: i, updatedAt: FieldValue.serverTimestamp() });
      });
      await batch.commit();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'reorder failed' });
    }
  });

  // ── Generation preview ─────────────────────────────────────────────────────
  app.get(
    '/api/taskLibrary/projects/:projectId/generate/preview',
    gcOnly(),
    async (req: any, res: any) => {
      try {
        const includeTags = parseTags(req.query.includeTags);
        const includeAllOptional = req.query.includeAllOptional === 'true';
        const activeSnap = await master().where('archivedAt', '==', null).get();
        const active = activeSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const existing = await projectTasks().where('projectId', '==', req.params.projectId).get();

        const byPhaseMap: Record<string, { required: number; optional: number; selected: number }> = {};
        let selectedTotal = 0;
        for (const t of active) {
          const p = t.phase;
          byPhaseMap[p] = byPhaseMap[p] || { required: 0, optional: 0, selected: 0 };
          const required = t.isRequired !== false;
          if (required) byPhaseMap[p].required += 1;
          else byPhaseMap[p].optional += 1;
          const selected = required || optionalIncluded(t, includeTags, includeAllOptional);
          if (selected) {
            byPhaseMap[p].selected += 1;
            selectedTotal += 1;
          }
        }
        res.json({
          masterVersionLabel: `library snapshot @ ${new Date().toISOString().slice(0, 10)}`,
          totalActive: active.length,
          byPhase: Object.entries(byPhaseMap).map(([phase, v]) => ({ phase, ...v })),
          selectedTotal,
          alreadyGenerated: existing.size > 0,
          existingCount: existing.size,
        });
      } catch (e: any) {
        console.error('[taskLibrary/preview]', e);
        res.status(500).json({ error: e?.message || 'preview failed' });
      }
    },
  );

  // ── Generate project tasks from the active master library ──────────────────
  app.post(
    '/api/taskLibrary/projects/:projectId/generate',
    gcOnly(),
    async (req: any, res: any) => {
      try {
        const projectId = req.params.projectId;
        const includeTags: string[] = Array.isArray(req.body?.includeTags) ? req.body.includeTags : [];
        const includeAllOptional = !!req.body?.includeAllOptional;

        const projectSnap = await db.collection('projects').doc(projectId).get();
        if (!projectSnap.exists) return res.status(404).json({ error: 'Project not found' });

        // Only ACTIVE (non-archived) master tasks are eligible (system rule §8).
        const activeSnap = await master().where('archivedAt', '==', null).get();
        const active = activeSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

        // Idempotent: skip taskCodes already on the project (allows safe re-run
        // to pull in newly-added master tasks without duplicating).
        const existingSnap = await projectTasks().where('projectId', '==', projectId).get();
        const existingCodes = new Set(existingSnap.docs.map((d) => (d.data() || {}).taskCode));

        const toCreate = active.filter((t) => {
          if (existingCodes.has(t.taskCode)) return false;
          const required = t.isRequired !== false;
          return required || optionalIncluded(t, includeTags, includeAllOptional);
        });

        let ops = 0;
        let batch = db.batch();
        const commits: Promise<any>[] = [];
        for (const m of toCreate) {
          batch.set(projectTasks().doc(), projectTaskFromMaster(m, projectId));
          ops += 1;
          if (ops >= 450) {
            commits.push(batch.commit());
            batch = db.batch();
            ops = 0;
          }
        }
        if (ops > 0) commits.push(batch.commit());
        await Promise.all(commits);

        // Stamp the project so the UI/Gantt know tasks were generated and from
        // which library snapshot. (Future: schedule module reads this.)
        await db.collection('projects').doc(projectId).set(
          {
            taskGeneration: {
              generatedAt: FieldValue.serverTimestamp(),
              generatedByUid: req.authCtx.uid,
              masterVersionLabel: `library snapshot @ ${new Date().toISOString().slice(0, 10)}`,
              includeTags,
              includeAllOptional,
              taskCount: FieldValue.increment(toCreate.length),
            },
          },
          { merge: true },
        );

        res.json({ ok: true, created: toCreate.length, skipped: existingCodes.size });
      } catch (e: any) {
        console.error('[taskLibrary/generate]', e);
        res.status(500).json({ error: e?.message || 'generate failed' });
      }
    },
  );

  // ── Add a custom project task ──────────────────────────────────────────────
  app.post(
    '/api/taskLibrary/projects/:projectId/tasks',
    gcOnly(),
    async (req: any, res: any) => {
      try {
        const projectId = req.params.projectId;
        const b = req.body || {};
        if (!b.title || !b.phase) return res.status(400).json({ error: 'title and phase required' });
        const doc = {
          projectId,
          masterTaskId: null,
          masterVersionUsed: null,
          taskCode: b.taskCode || `CUSTOM-${Date.now().toString().slice(-6)}`,
          title: b.title,
          description: b.description || '',
          phase: b.phase,
          assignedRole: b.assignedRole || 'gc',
          assignedUserId: b.assignedUserId || null,
          assignedSubcontractorId: b.assignedSubcontractorId || null,
          status: 'Not Started',
          priority: b.priority || 'medium',
          startDate: b.startDate || null,
          dueDate: b.dueDate || null,
          completedAt: null,
          dependencies: Array.isArray(b.dependencies) ? b.dependencies : [],
          acceptanceCriteria: normalizeCriteria(b.acceptanceCriteria),
          requiredPhotos: Number(b.requiredPhotos) || 0,
          uploadedPhotos: [],
          requiredDocuments: Array.isArray(b.requiredDocuments) ? b.requiredDocuments : [],
          uploadedDocuments: [],
          inspectionRequired: !!b.inspectionRequired,
          inspectionStatus: b.inspectionRequired ? 'not_scheduled' : 'not_required',
          drawMilestoneRelevant: !!b.drawMilestoneRelevant,
          clientVisible: !!b.clientVisible,
          subcontractorVisible: !!b.subcontractorVisible,
          designerVisible: !!b.designerVisible,
          projectSpecificNotes: b.projectSpecificNotes || '',
          changeReason: b.changeReason || '',
          isCustomTask: true,
          qualityGate: !!b.qualityGate,
          riskLevel: b.riskLevel || 'low',
          tags: Array.isArray(b.tags) ? b.tags : [],
          order: Number(b.order) || 9999,
          inspectionId: null,
          drawRequestId: null,
          changeOrderId: null,
          clientSelectionId: null,
          subcontractorId: null,
          warrantyItemId: null,
          scheduleTaskId: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        const ref = await projectTasks().add(doc);
        res.status(201).json({ id: ref.id, ...doc });
      } catch (e: any) {
        console.error('[taskLibrary/custom task]', e);
        res.status(500).json({ error: e?.message || 'create failed' });
      }
    },
  );

  // ── Reorder project tasks within a phase (drag-and-drop / arrows) ──────────
  // Order is only meaningful WITHIN a phase (the board groups by phase first),
  // so passing one phase's ordered ids is safe.
  app.post(
    '/api/taskLibrary/projects/:projectId/tasks/reorder',
    gcOnly(),
    async (req: any, res: any) => {
      try {
        const orderedIds: string[] = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];
        if (!orderedIds.length) return res.status(400).json({ error: 'orderedIds required' });
        const batch = db.batch();
        orderedIds.forEach((id, i) => {
          batch.update(projectTasks().doc(id), { order: i, updatedAt: FieldValue.serverTimestamp() });
        });
        await batch.commit();
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e?.message || 'reorder failed' });
      }
    },
  );

  // ── Update a project task (with system-rule validation) ────────────────────
  // NOTE: this only ever writes to projectTasks/{id} — the master is untouched.
  app.patch(
    '/api/taskLibrary/projects/:projectId/tasks/:taskId',
    gcOnly(),
    async (req: any, res: any) => {
      try {
        const ref = projectTasks().doc(req.params.taskId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'Task not found' });
        const current = snap.data() as any;
        if (current.projectId !== req.params.projectId) {
          return res.status(400).json({ error: 'Task does not belong to this project' });
        }
        const b = req.body || {};

        const EDITABLE = [
          'title', 'description', 'phase', 'assignedRole', 'assignedUserId',
          'assignedSubcontractorId', 'priority', 'startDate', 'dueDate', 'dependencies',
          'requiredPhotos', 'requiredDocuments', 'uploadedPhotos', 'uploadedDocuments',
          'inspectionRequired', 'inspectionStatus', 'drawMilestoneRelevant', 'clientVisible',
          'subcontractorVisible', 'designerVisible', 'projectSpecificNotes', 'changeReason',
          'tags', 'order',
          'riskLevel', 'qualityGate',
          // future-integration link fields:
          'inspectionId', 'drawRequestId', 'changeOrderId', 'clientSelectionId',
          'subcontractorId', 'warrantyItemId', 'scheduleTaskId',
        ];
        const update: any = { updatedAt: FieldValue.serverTimestamp() };
        for (const key of EDITABLE) if (key in b) update[key] = b[key];
        if ('acceptanceCriteria' in b) update.acceptanceCriteria = normalizeCriteria(b.acceptanceCriteria);

        // ── Status transition validation ──────────────────────────────────────
        if ('status' in b) {
          const next = b.status;
          if (!PROJECT_TASK_STATUSES.includes(next)) {
            return res.status(400).json({ error: `Invalid status: ${next}` });
          }
          // Rule: every skipped task requires a reason.
          if (next === 'Skipped') {
            const reason = ('changeReason' in b ? b.changeReason : current.changeReason) || '';
            if (!String(reason).trim()) {
              return res.status(400).json({ error: 'A reason is required to skip a task.' });
            }
          }
          // Rule: quality-gate tasks require acceptance-criteria confirmation.
          if (next === 'Complete') {
            const criteria = ('acceptanceCriteria' in b ? update.acceptanceCriteria : current.acceptanceCriteria) || [];
            const qualityGate = 'qualityGate' in b ? b.qualityGate : current.qualityGate;
            if (qualityGate && criteria.length > 0 && criteria.some((c: any) => !c.done)) {
              return res.status(400).json({
                error: 'All acceptance criteria must be confirmed before completing a quality-gate task.',
              });
            }
            update.completedAt = FieldValue.serverTimestamp();
          } else {
            update.completedAt = null;
          }
          update.status = next;
        }

        await ref.update(update);
        res.json({ ok: true });
      } catch (e: any) {
        console.error('[taskLibrary/task update]', e);
        res.status(500).json({ error: e?.message || 'update failed' });
      }
    },
  );

  // ── Delete a custom project task (only custom tasks may be hard-deleted) ────
  app.delete(
    '/api/taskLibrary/projects/:projectId/tasks/:taskId',
    gcOnly(),
    async (req: any, res: any) => {
      try {
        const ref = projectTasks().doc(req.params.taskId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'Task not found' });
        if (!(snap.data() as any).isCustomTask) {
          return res.status(400).json({
            error: 'Copied tasks cannot be deleted — skip them instead (preserves provenance).',
          });
        }
        await ref.delete();
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ error: e?.message || 'delete failed' });
      }
    },
  );

  // ── Closeout: analyze project tasks → generate improvement suggestions ─────
  app.post(
    '/api/taskLibrary/projects/:projectId/closeout/analyze',
    adminOnly(),
    async (req: any, res: any) => {
      try {
        const projectId = req.params.projectId;
        const projSnap = await db.collection('projects').doc(projectId).get();
        const projectName = projSnap.exists ? (projSnap.data() as any).name || '' : '';
        const tasksSnap = await projectTasks().where('projectId', '==', projectId).get();
        const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

        // Cross-project skip frequency (best-effort, single library): how often
        // each taskCode has been skipped across ALL projects.
        const allTasks = await projectTasks().get();
        const skipCount: Record<string, number> = {};
        const seenCount: Record<string, number> = {};
        allTasks.docs.forEach((d) => {
          const t = d.data() as any;
          if (!t.taskCode) return;
          seenCount[t.taskCode] = (seenCount[t.taskCode] || 0) + 1;
          if (t.status === 'Skipped') skipCount[t.taskCode] = (skipCount[t.taskCode] || 0) + 1;
        });

        const now = Date.now();
        const suggestions: any[] = [];
        const push = (s: any) => suggestions.push(s);

        for (const t of tasks) {
          // 1. Custom tasks added during the project
          if (t.isCustomTask) {
            push(buildImprovement(projectId, projectName, 'custom_task_added', t, {
              summary: `Custom task "${t.title}" was added on this project. Consider adding it to the master library.`,
              masterTaskId: null,
              suggestedData: { sourceProjectTaskId: t.id },
            }));
          }
          // 2. Frequently skipped (this project + cross-project rate)
          if (t.status === 'Skipped') {
            const rate = seenCount[t.taskCode]
              ? Math.round((100 * (skipCount[t.taskCode] || 0)) / seenCount[t.taskCode])
              : 0;
            push(buildImprovement(projectId, projectName, 'frequently_skipped', t, {
              summary: `Task "${t.title}" was skipped (reason: ${t.changeReason || 'none given'}). Skipped on ${rate}% of projects. Consider marking it optional.`,
              suggestedData: { skipRate: rate },
            }));
          }
          // 3. Delayed
          const overdue =
            t.dueDate &&
            new Date(t.dueDate).getTime() < now &&
            !['Complete', 'Skipped'].includes(t.status);
          const lateFinish =
            t.dueDate && t.completedAt && toMillis(t.completedAt) > new Date(t.dueDate).getTime();
          if (overdue || lateFinish) {
            push(buildImprovement(projectId, projectName, 'delayed', t, {
              summary: `Task "${t.title}" ran past its due date. Consider increasing its default duration.`,
            }));
          }
          // 4. Caused a change order
          if (t.changeOrderId) {
            push(buildImprovement(projectId, projectName, 'caused_change_order', t, {
              summary: `Task "${t.title}" was linked to a change order. Consider refining its scope/acceptance criteria in the master.`,
            }));
          }
          // 5. Blocked
          if (t.status === 'Blocked') {
            push(buildImprovement(projectId, projectName, 'blocked', t, {
              summary: `Task "${t.title}" is/was blocked. Consider adding a dependency or prerequisite in the master.`,
            }));
          }
          // 6. Missing acceptance criteria (quality gate w/o criteria)
          if (t.qualityGate && (!t.acceptanceCriteria || t.acceptanceCriteria.length === 0)) {
            push(buildImprovement(projectId, projectName, 'missing_acceptance_criteria', t, {
              summary: `Quality-gate task "${t.title}" has no acceptance criteria. Consider adding criteria in the master.`,
            }));
          }
          // 7. Extra photos/docs beyond required
          if ((t.uploadedPhotos?.length || 0) > (t.requiredPhotos || 0) && (t.requiredPhotos || 0) >= 0) {
            const extra = (t.uploadedPhotos?.length || 0) - (t.requiredPhotos || 0);
            if (extra > 0 && t.requiredPhotos < (t.uploadedPhotos?.length || 0)) {
              push(buildImprovement(projectId, projectName, 'extra_photos_docs', t, {
                summary: `Task "${t.title}" needed ${extra} more photo(s) than required (${t.requiredPhotos}). Consider raising the required photo count in the master.`,
                suggestedData: { suggestedRequiredPhotos: t.uploadedPhotos?.length || 0 },
              }));
            }
          }
          // 8. Warranty issue
          if (t.warrantyItemId) {
            push(buildImprovement(projectId, projectName, 'warranty_issue', t, {
              summary: `Task "${t.title}" generated a warranty issue. Consider strengthening its acceptance criteria/inspection in the master.`,
            }));
          }
        }

        // Upsert suggestions idempotently (deterministic id per project/kind/code).
        // Never clobber an already-resolved suggestion.
        let written = 0;
        for (const s of suggestions) {
          const id = `${projectId}__${s.kind}__${s.taskCode || s.projectTaskId || 'n'}`;
          const ref = improvements().doc(id);
          const ex = await ref.get();
          if (ex.exists && (ex.data() as any).status !== 'pending') continue;
          await ref.set(
            { ...s, status: 'pending', updatedAt: FieldValue.serverTimestamp(), createdAt: ex.exists ? (ex.data() as any).createdAt : FieldValue.serverTimestamp() },
            { merge: true },
          );
          written += 1;
        }

        res.json({ ok: true, suggestions: suggestions.length, written });
      } catch (e: any) {
        console.error('[taskLibrary/closeout analyze]', e);
        res.status(500).json({ error: e?.message || 'analyze failed' });
      }
    },
  );

  // ── Resolve an improvement (approve/reject) — applies to master on approve ─
  app.post('/api/taskLibrary/improvements/:id/resolve', adminOnly(), async (req: any, res: any) => {
    try {
      const ref = improvements().doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Improvement not found' });
      const imp = snap.data() as any;
      const action: string = req.body?.action;
      const adminNote: string = req.body?.adminNote || '';
      const payload = req.body?.payload || {};

      const VALID = new Set([
        'add_new_master_task', 'update_existing_master_task', 'add_tag',
        'add_acceptance_criteria', 'add_required_photo_doc', 'mark_optional',
        'mark_required', 'reject', 'note_for_review',
      ]);
      if (!VALID.has(action)) return res.status(400).json({ error: `Invalid action: ${action}` });

      let status = 'approved';
      if (action === 'reject') status = 'rejected';
      if (action === 'note_for_review') status = 'deferred';

      // Apply the change to the master library (admin-approved only).
      if (action !== 'reject' && action !== 'note_for_review') {
        await applyImprovementToMaster(db, action, imp, payload);
      }

      await ref.update({
        status,
        resolutionAction: action,
        adminNote,
        resolvedAt: FieldValue.serverTimestamp(),
        resolvedByUid: req.authCtx.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      res.json({ ok: true, status });
    } catch (e: any) {
      console.error('[taskLibrary/resolve]', e);
      res.status(500).json({ error: e?.message || 'resolve failed' });
    }
  });
}

// ── Apply an approved improvement to the master library ──────────────────────
async function applyImprovementToMaster(
  db: Db,
  action: string,
  imp: any,
  payload: any,
): Promise<void> {
  const master = db.collection('masterTasks');
  const bumpVersion = { updatedAt: FieldValue.serverTimestamp(), version: FieldValue.increment(1) };

  if (action === 'add_new_master_task') {
    // Copy the source project task into a new master task (or use payload).
    const src = imp.projectTaskId
      ? await db.collection('projectTasks').doc(imp.projectTaskId).get()
      : null;
    const base = src && src.exists ? (src.data() as any) : {};
    const phase = payload.phase || base.phase || 'Preconstruction';
    const phaseCount = await master.where('phase', '==', phase).get();
    const taskCode =
      payload.taskCode ||
      base.taskCode ||
      `${String(phase).slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-5)}`;
    await master.add({
      taskCode,
      title: payload.title || base.title || imp.title || 'New task',
      description: payload.description || base.description || '',
      phase,
      recommendedRole: payload.recommendedRole || base.assignedRole || 'gc',
      defaultAssigneeRole: payload.defaultAssigneeRole || base.assignedRole || 'gc',
      defaultDurationDays: payload.defaultDurationDays || 1,
      suggestedStartOffset: payload.suggestedStartOffset || 0,
      dependencies: payload.dependencies || base.dependencies || [],
      acceptanceCriteria: normalizeCriteria(payload.acceptanceCriteria || base.acceptanceCriteria),
      requiredPhotos: payload.requiredPhotos ?? base.requiredPhotos ?? 0,
      requiredDocuments: payload.requiredDocuments || base.requiredDocuments || [],
      inspectionRequired: !!(payload.inspectionRequired ?? base.inspectionRequired),
      drawMilestoneRelevant: !!(payload.drawMilestoneRelevant ?? base.drawMilestoneRelevant),
      clientVisible: !!(payload.clientVisible ?? base.clientVisible),
      subcontractorVisible: !!(payload.subcontractorVisible ?? base.subcontractorVisible),
      designerVisible: !!(payload.designerVisible ?? base.designerVisible),
      isRequired: payload.isRequired ?? false,
      isOptional: !(payload.isRequired ?? false),
      tags: payload.tags || base.tags || [],
      appliesWhen: payload.appliesWhen || '',
      riskLevel: payload.riskLevel || base.riskLevel || 'low',
      qualityGate: !!(payload.qualityGate ?? base.qualityGate),
      order: phaseCount.size,
      version: 1,
      archivedAt: null,
      sourceProjectId: imp.projectId,
      improvementNotes: payload.adminNote || `Promoted from project ${imp.projectName || imp.projectId}`,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  // Remaining actions target an existing master task.
  if (!imp.masterTaskId) {
    // Try to resolve by taskCode if no direct master id.
    if (imp.taskCode) {
      const q = await master.where('taskCode', '==', imp.taskCode).limit(1).get();
      if (!q.empty) imp.masterTaskId = q.docs[0].id;
    }
  }
  if (!imp.masterTaskId) throw new Error('No master task to update for this improvement');
  const ref = master.doc(imp.masterTaskId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Target master task not found');
  const cur = snap.data() as any;

  switch (action) {
    case 'update_existing_master_task': {
      const update: any = { ...bumpVersion };
      const allowed = [
        'title', 'description', 'defaultDurationDays', 'suggestedStartOffset',
        'recommendedRole', 'defaultAssigneeRole', 'riskLevel', 'appliesWhen',
        'inspectionRequired', 'qualityGate', 'drawMilestoneRelevant',
      ];
      for (const k of allowed) if (k in payload) update[k] = payload[k];
      if ('acceptanceCriteria' in payload) update.acceptanceCriteria = normalizeCriteria(payload.acceptanceCriteria);
      if (payload.improvementNotes) update.improvementNotes = payload.improvementNotes;
      await ref.update(update);
      break;
    }
    case 'add_tag': {
      const tag = payload.tag;
      if (!tag) throw new Error('tag required');
      await ref.update({ tags: FieldValue.arrayUnion(tag), ...bumpVersion });
      break;
    }
    case 'add_acceptance_criteria': {
      const text = payload.text || payload.criterion;
      if (!text) throw new Error('criterion text required');
      const next = [...(cur.acceptanceCriteria || []), makeCriterion(text)];
      await ref.update({ acceptanceCriteria: next, ...bumpVersion });
      break;
    }
    case 'add_required_photo_doc': {
      const update: any = { ...bumpVersion };
      if (payload.requiredPhotos != null) update.requiredPhotos = Number(payload.requiredPhotos);
      if (payload.document) update.requiredDocuments = FieldValue.arrayUnion(payload.document);
      await ref.update(update);
      break;
    }
    case 'mark_optional':
      await ref.update({ isRequired: false, isOptional: true, ...bumpVersion });
      break;
    case 'mark_required':
      await ref.update({ isRequired: true, isOptional: false, ...bumpVersion });
      break;
    default:
      break;
  }
}

// ── Small utilities ──────────────────────────────────────────────────────────
function normalizeCriteria(input: any): any[] {
  if (!Array.isArray(input)) return [];
  return input.map((c) => {
    if (typeof c === 'string') return makeCriterion(c);
    return { id: c.id || makeCriterion(c.text || '').id, text: c.text || '', done: !!c.done };
  });
}

function buildImprovement(
  projectId: string,
  projectName: string,
  kind: string,
  task: any,
  extra: { summary: string; masterTaskId?: string | null; suggestedData?: any },
) {
  return {
    projectId,
    projectName,
    kind,
    projectTaskId: task.id,
    masterTaskId: extra.masterTaskId !== undefined ? extra.masterTaskId : task.masterTaskId || null,
    taskCode: task.taskCode || null,
    title: task.title || '',
    summary: extra.summary,
    suggestedData: extra.suggestedData || {},
  };
}

/** Parse the includeTags query param (CSV string or repeated param) into an array. */
function parseTags(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((s) => String(s)).filter(Boolean);
  return String(input)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts._seconds) return ts._seconds * 1000;
  return new Date(ts).getTime() || 0;
}
