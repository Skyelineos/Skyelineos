// Overdue task escalation sweep
// =============================
//
// Runs every morning at 8:00 MT. Pulls every project_task whose
// status != 'complete' AND endDate (treated as dueDate) is before today.
//
// For each overdue task:
//   • HIGH priority   → write `notifications/{id}` doc per admin user. The
//                       existing dispatchNotification trigger fans this out
//                       to in-app + SMS (forceSms: true) to Tyler.
//   • MEDIUM priority → write `sms_escalations/{id}` so it shows up in the
//                       SMS escalation queue in the UI. No SMS to Tyler.
//   • LOW priority    → console.log only. Tyler will see it on the daily
//                       digest if he opens the app.
//
// Idempotency: we stamp `escalatedToTyler: true` + `escalatedAt` on the task
// itself so a same-day retry doesn't re-fire. HIGH-priority repeat escalations
// (an overdue task that's STILL not complete a day later) are handled by
// clearing the marker on day boundaries — see CLEAR_AFTER_HOURS below.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

if (!admin.apps.length) admin.initializeApp();

// We need Twilio creds bound because dispatchNotification is the actual
// sender, but writing the notification doc itself doesn't require them.
// Still, declaring them on this function avoids a cold-start delta when
// the dispatcher fires off of our writes.
const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_FROM_NUMBER = defineSecret('TWILIO_FROM_NUMBER');
const APP_BASE_URL = defineSecret('APP_BASE_URL');

// Re-escalate HIGH-priority overdue tasks if they've been overdue for this
// many hours without being completed. (Tyler will keep getting reminded.)
const HIGH_REESCALATE_AFTER_HOURS = 24;

type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

function inferPriority(taskData: any): Priority {
  // Explicit priority wins. Old tasks may not have one, so we fall back to
  // heuristics based on trade / phase: inspections, foundations, framing,
  // electrical, plumbing → HIGH. Punch list / cleanup → LOW. Everything else
  // MEDIUM.
  const explicit = String(taskData?.priority || '').toUpperCase();
  if (explicit === 'HIGH' || explicit === 'MEDIUM' || explicit === 'LOW') return explicit as Priority;

  const trade = String(taskData?.trade || '').toUpperCase();
  const phase = String(taskData?.phase || '').toUpperCase();
  const HIGH_TRADES = ['FOUNDATION', 'FRAMER', 'ELECTRICAL', 'PLUMBING', 'HVAC', 'INSPECTION'];
  const LOW_TRADES = ['CLEANUP', 'PUNCH_LIST'];
  if (HIGH_TRADES.some((t) => trade.includes(t)) || phase.includes('INSPECT')) return 'HIGH';
  if (LOW_TRADES.some((t) => trade.includes(t)) || phase.includes('PUNCH')) return 'LOW';
  return 'MEDIUM';
}

async function resolveProjectName(db: Firestore, projectId: string): Promise<string> {
  if (!projectId) return 'unknown project';
  try {
    const snap = await db.collection('projects').doc(projectId).get();
    if (!snap.exists) return 'unknown project';
    const data: any = snap.data() || {};
    return data.name || data.clientLastName || 'unknown project';
  } catch {
    return 'unknown project';
  }
}

/**
 * The actual sweep logic. Exported so the daily digest cron can call it
 * directly instead of waiting for the standalone schedule.
 */
export async function runOverdueCheck(db: Firestore): Promise<{
  totalOverdue: number;
  high: number;
  medium: number;
  low: number;
}> {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  let totalOverdue = 0;
  let high = 0;
  let medium = 0;
  let low = 0;

  // Pull all non-complete tasks. The collection isn't huge yet — single-tenant,
  // a few hundred tasks. We filter in-memory so we don't need a composite
  // index on (status, endDate).
  const snap = await db.collection('project_tasks')
    .where('status', 'in', ['not_started', 'in_progress', 'blocked'])
    .limit(2000)
    .get();

  if (snap.empty) {
    console.log('[overdueChecker] no open tasks');
    return { totalOverdue: 0, high: 0, medium: 0, low: 0 };
  }

  // Look up admins once — every HIGH-priority escalation goes to all of them.
  const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
  const adminIds = adminsSnap.docs.map((d) => d.id);

  const appBase = (process.env.APP_BASE_URL || 'https://skyelineos.web.app').replace(/\/$/, '');

  for (const doc of snap.docs) {
    const task: any = doc.data();
    const dueIso: string | undefined = task.endDate || task.dueDate;
    if (!dueIso) continue;
    const due = new Date(dueIso);
    if (Number.isNaN(due.getTime())) continue;
    if (due >= startOfToday) continue; // not overdue
    totalOverdue++;

    const priority = inferPriority(task);
    const projectName = await resolveProjectName(db, task.projectId);
    const assigneeName = task.assignedContactName || 'unassigned';
    const message = `🔴 Skyeline: ${task.name} at ${projectName} is overdue. Assigned to ${assigneeName}. Tap to review: ${appBase}/projects/${task.projectId || ''}`;

    if (priority === 'HIGH') {
      // Re-escalate only if not already done in the last HIGH_REESCALATE_AFTER_HOURS.
      const lastEscalatedAt: any = task.escalatedAt;
      let lastMs = 0;
      try {
        if (lastEscalatedAt?.toDate) lastMs = lastEscalatedAt.toDate().getTime();
        else if (typeof lastEscalatedAt === 'string') lastMs = new Date(lastEscalatedAt).getTime();
      } catch { lastMs = 0; }
      const reescalateThresholdMs = now.getTime() - HIGH_REESCALATE_AFTER_HOURS * 60 * 60 * 1000;
      if (task.escalatedToTyler === true && lastMs > reescalateThresholdMs) {
        // Already escalated recently; skip.
        continue;
      }

      high++;
      // Write one notifications doc per admin so dispatchNotification picks
      // them up. forceSms=true overrides the per-user SMS opt-in so Tyler
      // gets the text regardless of prefs.
      for (const adminId of adminIds) {
        try {
          await db.collection('notifications').add({
            userId: adminId,
            kind: 'task_overdue',
            title: `Overdue: ${task.name}`,
            body: message,
            smsBody: message,
            link: task.projectId ? `/projects/${task.projectId}/overview` : '/tasks',
            forceSms: true,
            taskId: doc.id,
            projectId: task.projectId || null,
            severity: 'high',
            createdAt: FieldValue.serverTimestamp(),
          });
        } catch (err: any) {
          console.error('[overdueChecker] HIGH notification write failed:', err?.message);
        }
      }

      // Stamp the task so we don't re-fire within the cooldown.
      try {
        await doc.ref.update({
          escalatedToTyler: true,
          escalatedAt: FieldValue.serverTimestamp(),
          updatedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        console.warn('[overdueChecker] stamping escalation flag failed:', err?.message);
      }
    } else if (priority === 'MEDIUM') {
      medium++;
      try {
        await db.collection('sms_escalations').add({
          type: 'TASK_OVERDUE',
          severity: 'medium',
          intent: 'TASK_OVERDUE',
          status: 'open',
          taskId: doc.id,
          projectId: task.projectId || null,
          projectName,
          assigneeContactId: task.assignedContactId || null,
          assigneeName,
          summary: `Overdue (medium): ${task.name} at ${projectName}, assigned ${assigneeName}`,
          originalMessage: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (err: any) {
        console.warn('[overdueChecker] MEDIUM escalation write failed:', err?.message);
      }
    } else {
      low++;
      console.log(`[overdueChecker][LOW] ${task.name} at ${projectName} overdue (assigned ${assigneeName})`);
    }
  }

  console.log(`[overdueChecker] swept ${totalOverdue} overdue tasks — high=${high} medium=${medium} low=${low}`);
  return { totalOverdue, high, medium, low };
}

// Standalone scheduled trigger — 8:00am MT daily. The daily digest cron also
// calls runOverdueCheck() at 7:30; this 8am run is a safety net + later
// re-escalation pass for tasks that became overdue between 7:30 and 8:00.
export const overdueTaskSweep = onSchedule(
  {
    schedule: '0 8 * * *',
    timeZone: 'America/Denver',
    secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, APP_BASE_URL],
  },
  async () => {
    const db = admin.firestore();
    await runOverdueCheck(db);
  },
);
