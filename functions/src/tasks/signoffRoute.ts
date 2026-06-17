// POST /api/tasks/:taskId/signoff
//
// GC/PM task sign-off workflow endpoint. Sub marks a task ready for review
// (status → 'awaiting_signoff', client-side write), then GC/PM/admin approves
// (→ 'done') or rejects (→ 'in_progress' with required note).
//
// This route is mounted AFTER the /api authMiddleware gate in functions/src/index.ts,
// so req.user is guaranteed to be a verified Firebase ID token. The handler
// then layers role + project-team membership checks on top.
//
// Two writes per call, both transactional:
//   1. tasks/{taskId}                 → status + signedOffBy/At/Note OR rejectedBy/At/Note
//   2. tasks/{taskId}/signoffEvents/X → full audit row (action, by, at, note)
//
// The audit subcollection keeps every event (so reopens, multiple rejects,
// re-submissions all stay visible) — the parent doc only carries the latest
// snapshot.

import type { Express } from 'express';
import * as admin from 'firebase-admin';

// (Dispatch 6 will own the notification trigger catalog. For now we leave
// // TODO-Dispatch-6 markers at the call sites pointing at the kinds:
//    task_awaiting_signoff      (sub → GC/PM, when sub submits)
//    task_signoff_approved      (GC/PM → sub, when approved)
//    task_signoff_rejected      (GC/PM → sub, when rejected)
// Today these are no-ops on the server side — the existing client-side
// notification flow handles the cross-portal notification via
// `client/src/lib/notifications.ts:createNotification`. When Dispatch 6 lands,
// fireTrigger() replaces those client calls and the catalog grows by 3 kinds.)

interface SignoffRequestBody {
  action?: 'approve' | 'reject';
  note?: string | null;
}

// Pull a normalized role string ('admin' | 'gc' | 'projectManager') for the
// caller — same logic the client's useRoleAccess() uses.
function normalizeRole(raw: string | undefined): string {
  const r = String(raw || '').toLowerCase().replace(/_/g, '');
  if (r === 'admin') return 'admin';
  if (r === 'gc') return 'gc';
  if (r === 'projectmanager' || r === 'pm') return 'projectManager';
  return r;
}

function canSignoff(role: string): boolean {
  return role === 'admin' || role === 'gc' || role === 'projectManager';
}

export function registerTaskSignoffRoute(app: Express, db: admin.firestore.Firestore): void {
  app.post('/api/tasks/:taskId/signoff', async (req: any, res: any) => {
    try {
      const taskId = String(req.params.taskId || '').trim();
      if (!taskId) {
        res.status(400).json({ error: 'taskId required' });
        return;
      }
      const body: SignoffRequestBody = req.body || {};
      const action = body.action;
      if (action !== 'approve' && action !== 'reject') {
        res.status(400).json({ error: "action must be 'approve' or 'reject'" });
        return;
      }
      const note = typeof body.note === 'string' ? body.note.trim() : '';
      if (action === 'reject' && note.length === 0) {
        res.status(400).json({ error: 'A reason is required when rejecting.' });
        return;
      }

      // Resolve caller's role + display name from req.userProfile (Stream 1
      // authMiddleware loads this from users/{uid}). Fall back to the token
      // for the uid.
      const uid: string = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: 'No uid' });
        return;
      }
      const profile = req.userProfile || {};
      const role = normalizeRole(profile.role);
      const byName: string =
        profile.name || profile.displayName || req.user?.name || req.user?.email || 'Unknown';

      if (!canSignoff(role)) {
        res.status(403).json({ error: 'Only GC, PM, or admin can sign off tasks.' });
        return;
      }

      const taskRef = db.collection('tasks').doc(taskId);
      const eventsCol = taskRef.collection('signoffEvents');

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(taskRef);
        if (!snap.exists) throw new Error('Task not found');
        const data = snap.data() as any;
        const currentStatus = String(data.status || '');
        if (currentStatus !== 'awaiting_signoff') {
          throw new Error(`Task is not awaiting sign-off (current: ${currentStatus})`);
        }

        // PMs must be on the project team. Admin + GC bypass this.
        const projectId = data.projectId ? String(data.projectId) : '';
        if (role === 'projectManager') {
          if (!projectId) throw new Error('Cannot verify PM membership: task has no projectId');
          const projSnap = await tx.get(db.collection('projects').doc(projectId));
          if (!projSnap.exists) throw new Error('Project not found');
          const assigned = projSnap.data()?.assignedUserIds || [];
          if (!Array.isArray(assigned) || !assigned.includes(uid)) {
            throw new Error('You are not assigned to this project.');
          }
        }

        const now = admin.firestore.FieldValue.serverTimestamp();
        const eventRef = eventsCol.doc();
        const eventPayload = {
          action,
          by: uid,
          byName,
          at: now,
          note: note || null,
        };

        if (action === 'approve') {
          tx.update(taskRef, {
            status: 'done',
            signedOffBy: uid,
            signedOffByName: byName,
            signedOffAt: now,
            signoffNote: note || null,
            // Clear any prior rejection trail so the parent doc is the latest snapshot.
            rejectedBy: admin.firestore.FieldValue.delete(),
            rejectedAt: admin.firestore.FieldValue.delete(),
            rejectionNote: admin.firestore.FieldValue.delete(),
            updatedAt: now,
          });
        } else {
          tx.update(taskRef, {
            status: 'in_progress',
            rejectedBy: uid,
            rejectedByName: byName,
            rejectedAt: now,
            rejectionNote: note,
            // Don't clear signedOff* — task was never approved; those fields shouldn't be set.
            updatedAt: now,
          });
        }
        tx.set(eventRef, eventPayload);

        return {
          taskId,
          newStatus: action === 'approve' ? 'done' : 'in_progress',
          action,
          eventId: eventRef.id,
          assignedToId: data.assignedToId || data.assignedSubId || null,
          assignedToName: data.assignedToName || data.assignedSubName || null,
          projectId: projectId || null,
          projectName: data.projectName || null,
          title: data.title || data.name || taskId,
        };
      });

      // TODO Dispatch 6: switch to fireTrigger with kind 'task_signoff_approved'
      //   / 'task_signoff_rejected' once feat/notifications-engine lands. Until
      //   then the existing in-app notification fan-out happens client-side via
      //   client/src/lib/notifications.ts:createNotification (called from the
      //   SignoffActions component / sub-portal submit handler), so the sub
      //   still gets notified.

      res.json({ ok: true, ...result });
    } catch (e: any) {
      const msg = e?.message || 'Sign-off failed';
      const status =
        msg.startsWith('Task not found') ? 404 :
        msg.startsWith('Task is not awaiting') ? 409 :
        msg.startsWith('You are not assigned') ? 403 :
        msg.startsWith('Only GC') ? 403 :
        msg.startsWith('Cannot verify') ? 400 :
        400;
      console.error('[task-signoff]', msg, e?.stack);
      res.status(status).json({ error: msg });
    }
  });
}
