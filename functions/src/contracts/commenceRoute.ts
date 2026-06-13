// POST /api/contracts/:id/commencement
//
// The "signature → commencement" hook. When the client-build contract is signed,
// the GC fires this once to turn a signed deal into a live, scheduled job:
//
//   1. Activate — contract.status → 'active', project.status → 'active',
//      project.startDate + project.commencedAt set.
//   2. Seed the task list from the project's PUBLISHED estimate schedule
//      (projects/{id}.estimatedSchedule). One task per trade, dated to its phase,
//      default-assigned to the GC team member supplied by the caller.
//   3. Notify awarded subs — "your bid was accepted, prepare for work".
//   4. Surface outstanding design selections — a client-visible task summarizing
//      how many decisions are still pending.
//
// Idempotent: guarded on project.commencedAt so a double-fire can't double-seed.
// Authorized: gc / projectManager / admin.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { fireTrigger } from '../notifications/fireTrigger';

const STAFF_ROLES = new Set(['gc', 'admin', 'projectManager']);

interface CommencePayload {
  defaultAssigneeId?: string;     // GC team member to own the seeded tasks
  defaultAssigneeName?: string;
}

interface ScheduledTrade {
  trade: string;
  phase: string;
  amount?: number;
  endDate: string;                // ISO YYYY-MM-DD — task due date
}
interface ScheduledPhase { phase: string; startDate: string; endDate: string; trades: ScheduledTrade[]; }
interface EstimatedSchedule { startDate: string; endDate: string; phases: ScheduledPhase[]; }

// Build phases that happen before site work → 'pre_site', otherwise 'site'.
function categoryForPhase(phase: string): string {
  return phase === 'Pre-Construction' ? 'pre_site' : 'site';
}

// Resolve a bid doc → the sub's Firebase Auth UID, trying the shapes bids use.
async function resolveSubUid(
  db: admin.firestore.Firestore,
  bid: any,
): Promise<string | null> {
  if (bid?.submittedByUid) return String(bid.submittedByUid);
  if (bid?.subUserId) return String(bid.subUserId);
  // Fall back to the contact's linked auth account.
  if (bid?.subContactId) {
    try {
      const c = await db.collection('contacts').doc(String(bid.subContactId)).get();
      const linked = c.exists ? (c.data() as any).linkedUserId : null;
      if (linked) return String(linked);
    } catch { /* ignore */ }
  }
  return null;
}

export function registerCommenceRoute(
  app: Express,
  db: admin.firestore.Firestore,
) {
  app.post('/api/contracts/:id/commencement', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const reviewerUid = decoded.uid;

      const reviewerSnap = await db.collection('users').doc(reviewerUid).get();
      const reviewer = reviewerSnap.exists ? (reviewerSnap.data() as any) : null;
      if (!reviewer || !STAFF_ROLES.has(String(reviewer.role))) {
        return res.status(403).json({ error: 'Only Skyeline staff can commence a project' });
      }

      const contractId = req.params.id;
      const contractRef = db.collection('contracts').doc(contractId);
      const contractSnap = await contractRef.get();
      if (!contractSnap.exists) return res.status(404).json({ error: 'Contract not found' });
      const contract = contractSnap.data() as any;

      const projectId = contract.projectId;
      if (!projectId) {
        return res.status(400).json({ error: 'Contract is not linked to a project' });
      }
      const projectRef = db.collection('projects').doc(projectId);
      const projectSnap = await projectRef.get();
      if (!projectSnap.exists) return res.status(404).json({ error: 'Project not found' });
      const project = projectSnap.data() as any;

      // ── Idempotency guard ──────────────────────────────────────────────────
      if (project.commencedAt) {
        return res.json({
          ok: true,
          alreadyCommenced: true,
          projectId,
          message: 'Project was already commenced; no changes made.',
        });
      }

      const body = (req.body || {}) as CommencePayload;
      const assigneeId = body.defaultAssigneeId || reviewerUid;
      const assigneeName = body.defaultAssigneeName || reviewer.name || 'Skyeline Team';
      const projectName = project.name || contract.projectName || '';
      const schedule: EstimatedSchedule | undefined = project.estimatedSchedule;
      const startDate =
        project.estimatedScheduleStartDate || schedule?.startDate ||
        new Date().toISOString().slice(0, 10);

      const now = admin.firestore.FieldValue.serverTimestamp();

      // ── 1 + 2: activate and seed tasks (atomic) ────────────────────────────
      const batch = db.batch();
      batch.update(contractRef, { status: 'active', updatedAt: now });
      batch.update(projectRef, {
        status: 'active',
        startDate,
        commencedAt: now,
        commencedBy: reviewerUid,
        updatedAt: now,
      });

      let tasksCreated = 0;
      if (schedule?.phases?.length) {
        for (const phase of schedule.phases) {
          for (const t of phase.trades || []) {
            const taskRef = db.collection('tasks').doc();
            batch.set(taskRef, {
              title: t.trade,
              projectId,
              projectName,
              assignedToId: assigneeId,
              assignedToName: assigneeName,
              createdById: reviewerUid,
              createdByName: reviewer.name || 'Skyeline Team',
              status: 'todo',
              priority: 'medium',
              dueDate: t.endDate || phase.endDate,
              category: categoryForPhase(phase.phase),
              phase: phase.phase,
              trade: t.trade,
              sourceTemplateId: 'estimate-schedule',
              visibleToClient: false,
              createdAt: now,
              updatedAt: now,
            });
            tasksCreated++;
          }
        }
      }
      await batch.commit();

      // ── 3: notify awarded subs (best-effort) ───────────────────────────────
      let subsNotified = 0;
      try {
        const awardedReqs = await projectRef
          .collection('bidRequests')
          .where('status', '==', 'awarded')
          .get();
        const notifiedUids = new Set<string>();
        for (const reqDoc of awardedReqs.docs) {
          const br = reqDoc.data() as any;
          if (!br.awardedBidId) continue;
          const bidSnap = await db.collection('bids').doc(String(br.awardedBidId)).get();
          if (!bidSnap.exists) continue;
          const bid = bidSnap.data() as any;
          const uid = await resolveSubUid(db, bid);
          if (!uid || notifiedUids.has(uid)) continue;
          notifiedUids.add(uid);
          // Configurable 'project_commenced' trigger (audience: sub) — channels
          // + templates editable in Settings → Notifications.
          await fireTrigger({
            db,
            triggerKey: 'project_commenced',
            recipientUserId: uid,
            audience: 'sub',
            projectId,
            variables: {
              projectName: projectName || 'a Skyeline project',
              trade: bid.trade || 'your trade',
              link: '/subcontractor-portal/bids',
              bidId: String(br.awardedBidId),
            },
          });
          subsNotified++;
        }
      } catch (e) {
        console.warn('[commence] sub notify failed (non-blocking):', e);
      }

      // ── 4: surface outstanding design selections ───────────────────────────
      let selectionsOutstanding = 0;
      try {
        const selSnap = await projectRef.collection('selections').get();
        selectionsOutstanding = selSnap.docs.filter(d => {
          const s = d.data() as any;
          return s.clientApprovalStatus && s.clientApprovalStatus !== 'Approved';
        }).length;

        if (selectionsOutstanding > 0) {
          await db.collection('tasks').add({
            title: `Finalize ${selectionsOutstanding} design selection${selectionsOutstanding === 1 ? '' : 's'}`,
            description: 'These selections still need a decision before their phase starts.',
            projectId,
            projectName,
            assignedToId: project.clientId || assigneeId,
            assignedToName: project.clientName || assigneeName,
            createdById: reviewerUid,
            createdByName: reviewer.name || 'Skyeline Team',
            status: 'todo',
            priority: 'high',
            category: 'client',
            dueDate: startDate,
            visibleToClient: true,
            sourceTemplateId: 'estimate-schedule',
            createdAt: now,
            updatedAt: now,
          });
        }
      } catch (e) {
        console.warn('[commence] selections surface failed (non-blocking):', e);
      }

      return res.json({
        ok: true,
        projectId,
        tasksCreated,
        subsNotified,
        selectionsOutstanding,
      });
    } catch (e: any) {
      console.error('commence error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
