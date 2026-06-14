// Scheduled task: every morning at 7am MT, scan tasks for items coming due in
// the next 24h and create in-app notifications for each assignee. The dispatcher
// (dispatch.ts) will then fan those out to email/SMS per user prefs.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { fireTrigger } from './fireTrigger';

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

    const today = now.toISOString().slice(0, 10);
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

      // Idempotent — don't fire twice for the same task in the same day.
      if (task.lastDueNotifiedOn === today) continue;

      // Route through the configurable engine. fireTrigger resolves the
      // assignee's audience (sub/pm/client/designer/team) and applies the
      // admin's 'task_due' channels + templates.
      await fireTrigger({
        db,
        triggerKey: 'task_due',
        recipientUserId: assigneeId,
        projectId: task.projectId,
        fromUserName: 'Skyeline OS',
        variables: {
          taskName: task.name || 'A task',
          dueDate: new Date(task.dueDate).toLocaleDateString(),
          projectName: task.projectName || '',
          link: task.projectId ? `/projects/${task.projectId}/overview` : '/tasks',
        },
      });
      // Mark so a retry / second run today doesn't double-fire.
      await taskDoc.ref.update({ lastDueNotifiedOn: today });
      queuedCount++;
    }

    console.log(`[dueSweep] fired ${queuedCount} due-soon notifications via fireTrigger`);
  },
);
