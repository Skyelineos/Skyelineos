// Scheduled task: every morning at 7am MT, scan tasks for items coming due in
// the next 24h and create in-app notifications for each assignee. The dispatcher
// (dispatch.ts) will then fan those out to email/SMS per user prefs.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const dueSweep = onSchedule(
  {
    schedule: '0 7 * * *', // 7am every day
    timeZone: 'America/Denver',
  },
  async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Pull tasks due within 24h that are not yet done
    const snap = await db.collection('tasks')
      .where('status', 'in', ['todo', 'in_progress'])
      .get();

    const tasksDueSoon = snap.docs.filter(d => {
      const t = d.data();
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      return due >= now && due <= cutoff;
    });

    console.log(`[dueSweep] ${tasksDueSoon.length} tasks due in next 24h`);

    const notifBatch = db.batch();
    const notifCol = db.collection('notifications');
    let queuedCount = 0;

    for (const taskDoc of tasksDueSoon) {
      const task = taskDoc.data();
      // Skip tasks that opted out of due-date notifications
      if (task.notifyOnDue === false) continue;

      // Resolve assignee → userId. Fall back to assignedSubId, assignedTo (string), assignedToContactId.
      const assigneeId = task.assigneeUserId
                       || task.assignedSubId
                       || task.assignedToContactId;
      if (!assigneeId) continue;

      // Idempotent — don't fire twice for the same task in the same day
      const dedupeKey = `due-${taskDoc.id}-${now.toISOString().slice(0, 10)}`;
      const existing = await notifCol.where('dedupeKey', '==', dedupeKey).limit(1).get();
      if (!existing.empty) continue;

      const ref = notifCol.doc();
      notifBatch.set(ref, {
        userId: assigneeId,
        kind: 'task_due',
        title: `Due today: ${task.name}`,
        body: task.description || `This task is due ${new Date(task.dueDate).toLocaleDateString()}.`,
        link: task.projectId ? `/projects/${task.projectId}/overview` : '/tasks',
        projectId: task.projectId,
        refType: 'task',
        refId: taskDoc.id,
        fromUserName: 'Skyeline OS',
        dedupeKey,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      queuedCount++;

      // Firestore batch limit is 500 — flush if we get close
      if (queuedCount % 400 === 0) {
        await notifBatch.commit();
      }
    }

    if (queuedCount % 400 !== 0) {
      await notifBatch.commit();
    }

    console.log(`[dueSweep] queued ${queuedCount} due-soon notifications`);
  },
);
